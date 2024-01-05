import { getDevicesOfUser, getUserRecord } from '../db'
import { Device } from '../Device'
import endpointTemplates from '../endpointTemplates'
import { Plan, PlanName } from '../Plan'

function getEndpointForDevice(device: Device, asRetrievable: boolean) {
  if (!endpointTemplates(asRetrievable)[device.template]) {
    return false
  }

  const template = { ...endpointTemplates(asRetrievable)[device.template] }

  template.endpointId = device.deviceId
  template.friendlyName = device.friendlyName
  template.description = `${template.description}: ${device.friendlyName}`
  template.cookie = {
    template: device.template,
    thingId: device.thingId,
  }

  return template
}

export function getEndpointsForDevices(
  devices: Device[],
  asRetrievableAllowed: boolean
) {
  return devices.reduce((acc, curr) => {
    const asRetrievable = asRetrievableAllowed && curr.retrievable
    const endpoint = getEndpointForDevice(curr, asRetrievable)

    if (endpoint) {
      acc.push(endpoint)
    }

    return acc
  }, [])
}

export default async function handleDiscover(event) {
  const devices = await getDevicesOfUser(event.profile.user_id)
  const tokenRecord = await getUserRecord(event.profile.user_id)
  const plan = new Plan(tokenRecord.plan as PlanName)
  const endpoints = getEndpointsForDevices(devices, plan.asRetrievable)

  // Remove duplicates based on the "endpointId" property
  const endpointsDeduplicated = endpoints.filter(
    (obj, index, self) =>
      index === self.findIndex((o) => o.endpointId === obj.endpointId)
  )

  return {
    event: {
      header: {
        namespace: 'Alexa.Discovery',
        name: 'Discover.Response',
        payloadVersion: '3',
        messageId: event.directive.header.messageId + '-R',
      },
      payload: {
        endpoints: endpointsDeduplicated,
      },
    },
  }
}
