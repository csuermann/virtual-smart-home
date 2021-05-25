import 'source-map-support/register'
import {
  extractAccessTokenFromEvent,
  createErrorResponse,
  fetchProfile,
  describeThing,
  proactivelyDiscoverDevices,
  proactivelyUndiscoverDevices,
  pushChangeReportToAlexa,
} from './helper'
import handleDiscover from './handlers/discover'
import handleAcceptGrant from './handlers/acceptGrant'
import { handleDirective } from './handlers/updateState'
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
        'INVALID_DIRECTIVE',
        'VSH no longer supports the ReportState directive'
      )
      console.log('RESPONSE', JSON.stringify(response))
      return response

    default:
      response = await handleDirective(event)
      console.log('RESPONSE', JSON.stringify(response))
      return response
  }
}

export const backchannel = async function (event, context) {
  console.log('REQUEST', JSON.stringify(event))

  let result

  switch (event.rule) {
    case 'discover':
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

    //::TODO:: delete this in an upcoming version (once <2.0.0 is no longer in use)
    await publish(
      `$aws/things/${device.thingId}/shadow/name/${device.deviceId}/delete`,
      {}
    )
  }

  await proactivelyUndiscoverDevices(userId, deviceIDsToUndiscover)
}

async function handleChangeReport(event) {
  const userId = await lookupUserIdForThing(event.thingId)

  if (!userId) {
    return false
  }

  try {
    return await pushChangeReportToAlexa(userId, event)
  } catch (e) {
    console.log('pushChangeReportToAlexa FAILED!', e.message)
    return false
  }
}

async function lookupUserIdForThing(thingId: string) {
  const thingDetails = await describeThing(thingId)
  return thingDetails.attributes.userId || false
}
