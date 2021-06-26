import 'source-map-support/register'
import * as log from 'log'
import * as logger from 'log-aws-lambda'
import * as crypto from 'crypto'
import {
  extractAccessTokenFromEvent,
  createErrorResponse,
  fetchProfile,
  describeThing,
  proactivelyDiscoverDevices,
  proactivelyUndiscoverDevices,
  pushChangeReportToAlexa,
  pushAsyncResponseToAlexa,
  pushAsyncStateReportToAlexa,
  VshClientBackchannelEvent,
} from './helper'
import handleDiscover from './handlers/discover'
import handleAcceptGrant from './handlers/acceptGrant'
import { handleDirective, handleReportState } from './handlers/updateState'
import { deleteDevice, upsertDevice } from './db'
import { Device } from './Device'
import { publish } from './mqtt'
import { isAllowedClientVersion } from './version'

logger()

function minifyDirectiveEvent(event) {
  const result = {
    directive: {
      header: {
        name: event.directive.header.name,
      },
    },
  }

  if (event.directive.endpoint) {
    result.directive['endpoint'] = {
      endpointId: event.directive.endpoint.endpointId,
      cookie: {
        template: event.directive.endpoint.cookie.template,
        thingId: event.directive.endpoint.cookie.thingId,
      },
    }
  }

  return result
}

function minifyBackchannelEvent(event: VshClientBackchannelEvent) {
  return {
    rule: event.rule,
    thingId: event.thingId,
    endpointId: event.endpointId,
    causeType: event.causeType,
    vshVersion: event.vshVersion || '?.?.?',
  }
}

/**
 * This function gets invoked by Alexa with Directives
 * @param event
 * @param context
 */
export const skill = async function (event, context) {
  try {
    const accessToken = extractAccessTokenFromEvent(event)
    event.profile = await fetchProfile(accessToken)
  } catch (e) {
    const response = createErrorResponse(
      event,
      'EXPIRED_AUTHORIZATION_CREDENTIAL',
      'invalid token'
    )
    log.notice(
      'REQUEST: %j \n EXCEPTION: %o \n RESPONSE: %j',
      event,
      e,
      response
    )
    return response
  }

  log.info('REQUEST STUB: %j', minifyDirectiveEvent(event))
  log.debug('REQ: %j', event)

  const directive: string = event.directive.header.name
  let response

  switch (directive) {
    case 'AcceptGrant':
      response = await handleAcceptGrant(event)
      log.debug('RESPONSE: %j', response)
      return response

    case 'Discover':
      response = await handleDiscover(event)
      log.debug('RESPONSE: %j', response)
      return response

    case 'ReportState':
      response = await handleReportState(event)
      log.debug('RESPONSE: %j', response)
      return response

    default:
      response = await handleDirective(event)
      log.debug('RESPONSE: %j', response)
      return response
  }
}

export const backchannel = async function (event, context) {
  log.info('REQUEST STUB: %j', minifyBackchannelEvent(event))
  log.debug('REQ: %j', event)

  let result

  switch (event.rule) {
    case 'discover': //deprecated
      result = await killDeviceDueToOutdatedVersion(event)
      break

    case 'bulkdiscover':
      result = await handleBackchannelBulkDiscover(event)
      break

    case 'bulkundiscover':
      result = await handleBackchannelBulkUndiscover(event)
      break

    case 'changeReport':
      result = await handleChangeReport(event)
      break

    case 'requestConfig':
      result = await handleRequestConfig(event)
      break
  }

  log.debug('RESULT: %o', result)
}

async function killDeviceDueToOutdatedVersion({ thingId }) {
  await publish(`vsh/${thingId}/kill`, {
    reason:
      "OUTDATED VERSION! Please update 'virtual smart home' package for Node-RED",
  })

  log.notice('killed thing %s due to outdated client version!', thingId)

  return true
}

async function handleBackchannelBulkDiscover(event) {
  const userId = await lookupUserIdForThing(event.thingId)
  const devicesToDiscover: Device[] = []

  if (!userId) {
    return false
  }

  for (const deviceStub of event.devices) {
    const device = {
      deviceId: deviceStub['deviceId'],
      userId,
      thingId: event.thingId,
      friendlyName: deviceStub['friendlyName'],
      template: deviceStub['template'],
    }

    devicesToDiscover.push(device)
    await upsertDevice(device)
  }

  try {
    return await proactivelyDiscoverDevices(userId, devicesToDiscover)
  } catch (e) {
    log.error('proactivelyDiscoverDevices FAILED! %s', e.message)
    return false
  }
}

export async function handleBackchannelBulkUndiscover({ thingId, devices }) {
  const userId = await lookupUserIdForThing(thingId)
  const devicesToUndiscover: Device[] = []
  const deviceIDsToUndiscover: string[] = []

  if (!userId) {
    return false
  }

  for (const deviceStub of devices) {
    const device = {
      deviceId: deviceStub['deviceId'],
      userId,
      thingId: thingId,
      friendlyName: deviceStub['friendlyName'],
      template: deviceStub['template'],
    }

    devicesToUndiscover.push(device)
    deviceIDsToUndiscover.push(device.deviceId)

    await deleteDevice({
      userId,
      deviceId: device.deviceId,
      thingId: device.thingId,
    })
  }

  return await proactivelyUndiscoverDevices(userId, deviceIDsToUndiscover)
}

async function handleChangeReport(event: VshClientBackchannelEvent) {
  const { thingId, causeType, correlationToken, userIdToken } = event
  let userId: string

  if (userIdToken && userIdToken === makeUserIdToken({ thingId, userId })) {
    userId = userIdToken.match(/^(.*)#.*/)[1]
  } else {
    //fallback for < v2.8.0
    userId = await lookupUserIdForThing(thingId)
  }

  if (!userId) {
    return false
  }

  if (causeType === 'VOICE_INTERACTION' && correlationToken) {
    try {
      return await pushAsyncResponseToAlexa(userId, event)
    } catch (e) {
      log.error('pushAsyncResponseToAlexa FAILED! %s', e.message)
      return false
    }
  } else if (causeType === 'STATE_REPORT' && correlationToken) {
    try {
      return await pushAsyncStateReportToAlexa(userId, event)
    } catch (e) {
      log.error('pushAsyncStateReportToAlexa FAILED! %s', e.message)
      return false
    }
  } else {
    try {
      return await pushChangeReportToAlexa(userId, event)
    } catch (e) {
      log.error('pushChangeReportToAlexa FAILED!! %s', e.message)
      return false
    }
  }
}

async function handleRequestConfig({
  thingId,
  vshVersion,
}: {
  thingId: string
  vshVersion: string
}) {
  if (!isAllowedClientVersion(vshVersion)) {
    return await killDeviceDueToOutdatedVersion({ thingId })
  }

  const userId = await lookupUserIdForThing(thingId)

  if (!userId) {
    return false
  }

  await publish(`vsh/${thingId}/service`, {
    operation: 'overrideConfig',
    userIdToken: makeUserIdToken({ thingId, userId }),
    allowedDeviceCount: 100,
    rateLimiter: [
      { period: 1 * 60 * 1000, limit: 12, penalty: 0, repeat: 10 }, //for 10 min: Limit to 12 req / min
      { period: 10 * 60 * 1000, limit: 5, penalty: 1 }, //afterward: Limit to 5 req / 10 min
    ],
  })

  return true
}

function makeUserIdToken({
  thingId,
  userId,
}: {
  thingId: string
  userId: string
}) {
  return `${userId}#${crypto
    .createHash('sha1')
    .update(`${userId}-${thingId}-${process.env.HASH_SECRET}`)
    .digest('hex')}`
}

async function lookupUserIdForThing(thingId: string) {
  const thingDetails = await describeThing(thingId)
  return thingDetails.attributes.userId || false
}
