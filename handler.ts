import 'source-map-support/register'
import {
  extractAccessTokenFromEvent,
  createErrorResponse,
  pushDeviceStateToAlexa,
  fetchProfile,
  describeThing,
  proactivelyDiscoverDevices,
  proactivelyUndiscoverDevices,
} from './helper'
import handleDiscover from './handlers/discover'
import handleAcceptGrant from './handlers/acceptGrant'
import handleReportState from './handlers/reportState'
import handleDirective from './handlers/updateState'
import { deleteDevice, upsertDevice } from './db'
import Device from './Device'
import { publish } from './mqtt'

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
    console.log(e)
    const response = createErrorResponse(
      event,
      'EXPIRED_AUTHORIZATION_CREDENTIAL',
      'invalid token'
    )
    console.log('REQUEST', JSON.stringify(event))
    console.log('ERROR RESPONSE', JSON.stringify(response))
    return response
  }

  console.log('REQUEST', JSON.stringify(event))

  const directive: string = event.directive.header.name
  let response

  switch (directive) {
    case 'AcceptGrant':
      response = await handleAcceptGrant(event)
      console.log('RESPONSE', JSON.stringify(response))
      return response

    case 'Discover':
      response = await handleDiscover(event)
      console.log('RESPONSE', JSON.stringify(response))
      return response

    case 'ReportState': //deprecated
      response = createErrorResponse(
        event,
        'ENDPOINT_UNREACHABLE',
        'VSH no longer supports the ReportState directive'
      )
      //response = await handleReportState(event)
      console.log('RESPONSE', JSON.stringify(response))
      return response

    case 'TurnOn':
    case 'TurnOff':
    case 'AdjustBrightness':
    case 'SetBrightness':
    case 'SetColor':
    case 'SetColorTemperature':
    case 'IncreaseColorTemperature':
    case 'DecreaseColorTemperature':
    case 'SetPercentage':
    // case 'Lock':
    // case 'Unlock':
    case 'SetMode':
    case 'SetRangeValue':
    case 'AdjustRangeValue':
    case 'Activate':
    case 'Deactivate':
    case 'SetTargetTemperature':
    case 'AdjustTargetTemperature':
      response = await handleDirective(event)
      console.log('RESPONSE', JSON.stringify(response))
      return response

    default:
      response = createErrorResponse(
        event,
        'INVALID_DIRECTIVE',
        'directive can not yet be handled'
      )
      console.log('ERROR RESPONSE', JSON.stringify(response))
      return response
  }
}

export const backchannel = async function (event, context) {
  console.log('REQUEST', JSON.stringify(event))

  let result

  switch (event.rule) {
    case 'discover':
      //result = await handleBackchannelDiscover(event)
      result = await killDeviceDueToOutdatedVersion(event)
      break

    case 'bulkdiscover':
      result = await handleBackchannelBulkDiscover(event)
      break

    case 'bulkundiscover':
      result = await handleBackchannelBulkUndiscover(event)
      break

    case 'syncAlexaState':
      result = await handleBackchannelSyncAlexaState(event)
      break
  }

  console.log('RESULT', result)
}

async function killDeviceDueToOutdatedVersion(event) {
  const thingId = event.thingId

  await publish(`vsh/${thingId}/kill`, {
    reason:
      "OUTDATED VERSION! Please update 'virtual smart home' package for Node-RED",
  })

  console.log(`killed thing ${thingId} due to outdated client version!`)

  return true
}

/** @deprecated */
async function handleBackchannelDiscover(event) {
  const userId = await lookupUserIdForThing(event.thingId)

  if (!userId) {
    return false
  }

  const device = {
    deviceId: event.deviceId,
    userId,
    thingId: event.thingId,
    friendlyName: event.friendlyName,
    template: event.template,
  }

  await upsertDevice(device)

  try {
    return await proactivelyDiscoverDevices(userId, [device])
  } catch (e) {
    console.log('proactivelyDiscoverDevices FAILED!', e.message)
    return false
  }
}

async function handleBackchannelBulkDiscover(event) {
  console.log(event)
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
    console.log('proactivelyDiscoverDevices FAILED!', e.message)
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

    await publish(
      `$aws/things/${device.thingId}/shadow/name/${device.deviceId}/delete`,
      {}
    )
  }

  await proactivelyUndiscoverDevices(userId, deviceIDsToUndiscover)
}

async function handleBackchannelSyncAlexaState(event) {
  const userId = await lookupUserIdForThing(event.thingId)

  if (!userId) {
    return false
  }

  try {
    return await pushDeviceStateToAlexa(userId, event)
  } catch (e) {
    console.log('pushDeviceStateToAlexa FAILED!', e.message)
    return false
  }
}

async function lookupUserIdForThing(thingId: string) {
  const thingDetails = await describeThing(thingId)
  return thingDetails.attributes.userId || false
}
