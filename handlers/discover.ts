import { getDevicesOfUser } from '../db'
import Device from '../Device'
import endpointTemplates from '../endpointTemplates'

function getEndpointForDevice(device: Device) {
  if (!endpointTemplates[device.template]) {
    return false
  }

  const template = { ...endpointTemplates[device.template] }

  template.endpointId = device.deviceId
  template.friendlyName = device.friendlyName
  template.description = `${template.description}: ${device.friendlyName}`
  template.cookie = {
    template: device.template,
    thingId: device.thingId,
  }

  return template
}

export function getEndpointsForDevices(devices: Device[]) {
  return devices.reduce((acc, curr) => {
    const endpoint = getEndpointForDevice(curr)

    if (endpoint) {
      acc.push(endpoint)
    }

    return acc
  }, [])
}

export default async function handleDiscover(event) {
  const devices = await getDevicesOfUser(event.profile.user_id)
  return {
    event: {
      header: {
        namespace: 'Alexa.Discovery',
        name: 'Discover.Response',
        payloadVersion: '3',
        messageId: event.directive.header.messageId + '-R',
      },
      payload: {
        endpoints: getEndpointsForDevices(devices),
      },
    },
  }
}
