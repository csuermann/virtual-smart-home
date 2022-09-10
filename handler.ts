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
  pushDoorbellPressEventToAlexa,
} from './helper'
import handleDiscover from './handlers/discover'
import handleAcceptGrant from './handlers/acceptGrant'
import { handleDirective, handleReportState } from './handlers/updateState'
import {
  deleteDevice,
  getDeviceCountOfUser,
  getUserRecord,
  upsertDevice,
} from './db'
import { Device } from './Device'
import { publish } from './mqtt'
import { isAllowedClientVersion, isFeatureSupportedByClient } from './version'

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
    template: event.template, //optional
    thingId: event.thingId,
    endpointId: event.endpointId, //optional
    causeType: event.causeType, //optional
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
  return await killDeviceWithMessage({
    thingId,
    message:
      "OUTDATED VERSION! Please update 'virtual smart home' package for Node-RED",
  })
}

async function killDeviceWithMessage({ thingId, message }) {
  await publish(`vsh/${thingId}/service`, {
    operation: 'kill',
    reason: message,
  })

  //for clients < v2.x.x
  await publish(`vsh/${thingId}/kill`, {
    reason: message,
  })

  log.notice('killed thing %s with message: %s', thingId, message)

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

    await publish(`vsh/${devicesToDiscover[0].thingId}/service`, {
      operation: 'setDeviceStatus',
      status: 'proactive discovery failed',
      color: 'yellow',
      devices: devicesToDiscover.map((device) => device.deviceId),
    })
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
  const { template, thingId, causeType, correlationToken, userIdToken } = event
  let userId: string

  if (userIdToken) {
    const extractedUserId = userIdToken.match(/^(.*)#.*/)[1]
    if (userIdToken === makeUserIdToken({ thingId, userId: extractedUserId })) {
      userId = extractedUserId
    }
  } else {
    //fallback for < v2.8.0
    userId = await lookupUserIdForThing(thingId)
  }

  if (!userId) {
    return false
  }

  if (template === 'DOORBELL_EVENT_SOURCE') {
    try {
      return await pushDoorbellPressEventToAlexa(userId, event)
    } catch (e) {
      log.error('pushDoorbellPressEventToAlexa FAILED! %j', e.response.data)
      return false
    }
  }

  if (causeType === 'VOICE_INTERACTION' && correlationToken) {
    try {
      return await pushAsyncResponseToAlexa(userId, event)
    } catch (e) {
      log.error('pushAsyncResponseToAlexa FAILED! %s', e.message)
      return false
    }
  }

  if (causeType === 'STATE_REPORT' && correlationToken) {
    try {
      return await pushAsyncStateReportToAlexa(userId, event)
    } catch (e) {
      log.error('pushAsyncStateReportToAlexa FAILED! %s', e.message)
      return false
    }
  }

  try {
    return await pushChangeReportToAlexa(userId, event)
  } catch (e) {
    log.error('pushChangeReportToAlexa FAILED!! %s', e.message)
    return false
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
    await killDeviceDueToOutdatedVersion({ thingId })
    return false
  }

  const userId = await lookupUserIdForThing(thingId)

  if (!userId) {
    await killDeviceWithMessage({
      thingId,
      message: 'No User ID found for thing',
    })
    return false
  }

  try {
    const { isBlocked, allowedDeviceCount } = await getUserRecord(userId)

    if (isBlocked) {
      await killDeviceWithMessage({
        thingId,
        message: 'User account is blocked',
      })
      return false
    }

    // calculate count of devices connected via _other_ thingIDs
    const deviceCountOfOtherThings = await getDeviceCountOfUser({
      userId,
      excludeThingId: thingId,
    })

    const allowedDeviceCountForThisThing =
      allowedDeviceCount - deviceCountOfOtherThings < 0
        ? 0
        : allowedDeviceCount - deviceCountOfOtherThings

    const payload = {
      operation: 'overrideConfig',
      userIdToken: makeUserIdToken({ thingId, userId }),
      allowedDeviceCount: allowedDeviceCountForThisThing,
    }

    if (isFeatureSupportedByClient('msgRateLimiter', vshVersion)) {
      //>= v2.12.0
      payload['msgRateLimiter'] = {
        profiles: {
          DEFAULT: {
            maxConcurrent: 1,
            minTime: 1000, //1 sec
            highWater: 0,
            strategy: 'BLOCK',
            penalty: 30 * 1000, //30 sec
            reservoir: 60,
            reservoirIncreaseInterval: 60 * 1000, //60 sec
            reservoirIncreaseAmount: 1,
            reservoirIncreaseMaximum: 60,
          },
          PHYSICAL_INTERACTION_DEFAULT: {
            maxConcurrent: 1,
            minTime: 2500, //2.5 sec
            highWater: 1,
            strategy: 'LEAK',
            reservoir: 30,
            reservoirIncreaseInterval: 15 * 60 * 1000, //15 min
            reservoirIncreaseAmount: 1,
            reservoirIncreaseMaximum: 15,
          },
          VOICE_INTERACTION_DEFAULT: {
            maxConcurrent: 1,
            minTime: 0,
            highWater: 0,
            strategy: 'OVERFLOW',
            reservoir: 20,
            reservoirIncreaseInterval: 5 * 60 * 1000, //5 min
            reservoirIncreaseAmount: 2,
            reservoirIncreaseMaximum: 10,
          },
          STATE_REPORT_DEFAULT: {
            maxConcurrent: 1,
            minTime: 0,
            highWater: 0,
            strategy: 'BLOCK',
            penalty: 60 * 1000, //60 sec
            reservoir: 60,
            reservoirIncreaseInterval: 5 * 60 * 1000, //5 min
            reservoirIncreaseAmount: 15,
            reservoirIncreaseMaximum: 60,
          },
        },
        profileMapping: {
          //PHYSICAL_INTERACTION_DIMMER_SWITCH: 'DIMMER_SWITCH', //example of a template/device specific override
          PHYSICAL_INTERACTION_DEFAULT: 'PHYSICAL_INTERACTION_DEFAULT',
          VOICE_INTERACTION_DEFAULT: 'VOICE_INTERACTION_DEFAULT',
          STATE_REPORT_DEFAULT: 'STATE_REPORT_DEFAULT',
        },
      }
    } else {
      //<= v2.11.0:
      payload['rateLimiter'] = [
        { period: 1 * 60 * 1000, limit: 12, penalty: 0, repeat: 10 }, //for 10 min: Limit to 12 req / min
        { period: 10 * 60 * 1000, limit: 5, penalty: 1 }, //afterward: Limit to 5 req / 10 min
      ]
    }

    await publish(`vsh/${thingId}/service`, payload)
    return true
  } catch (e) {
    await killDeviceWithMessage({
      thingId,
      message: 'User not found! VSH Alexa skill enabled?',
    })
    return false
  }
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
