import Axios, { AxiosResponse, AxiosError } from 'axios'
import { v4 as uuidv4 } from 'uuid'

import { getStoredTokenRecord } from './db'
import { getEndpointsForDevices } from './handlers/discover'
import { buildPropertiesFromShadow } from './shadow'

import AWS = require('aws-sdk')
import Device from './Device'

AWS.config.update({ region: process.env.VSH_IOT_REGION })

const iot = new AWS.Iot()

function getEventGatewayUrl(region) {
  switch (region.toLowerCase()) {
    case 'eu-west-1':
      return 'https://api.eu.amazonalexa.com/v3/events'
    case 'us-east-1':
      return 'https://api.amazonalexa.com/v3/events'
    case 'us-west-2':
      return 'https://api.fe.amazonalexa.com/v3/events'
  }
}

export function extractAccessTokenFromEvent(event): string {
  let token: string

  if (event.directive.header.name === 'Discover') {
    token = event.directive.payload.scope.token
  } else if (event.directive.header.name === 'AcceptGrant') {
    token = event.directive.payload.grantee.token
  } else {
    token = event.directive.endpoint.scope.token
  }

  return token
}

export async function fetchProfile(accessToken: string) {
  const response: AxiosResponse = await Axios.get(
    'https://api.amazon.com/user/profile',
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  )

  return response.data
}

export function createErrorResponse(
  event,
  errorType: string,
  errorMsg: string,
  endpointId: string = null
): Object {
  let errResponse = {
    event: {
      header: {
        namespace: 'Alexa',
        name: 'ErrorResponse',
        messageId: event.directive.header.messageId + '-R',
        payloadVersion: '3',
      },
      payload: {
        type: errorType,
        message: errorMsg,
      },
    },
  }

  if (endpointId) {
    errResponse['endpoint'] = {
      endpointId: endpointId,
    }
  }

  return errResponse
}

export async function pushDeviceStateToAlexa(userId: string, event) {
  const { accessToken, skillRegion } = await getStoredTokenRecord(userId)

  let properties = await buildPropertiesFromShadow({
    thingId: event.thingId,
    endpointId: event.endpointId,
    includeConnectivity: false,
  })

  const changeReport = {
    event: {
      header: {
        messageId: uuidv4(),
        namespace: 'Alexa',
        name: 'ChangeReport',
        payloadVersion: '3',
      },
      endpoint: {
        scope: {
          type: 'BearerToken',
          token: accessToken,
        },
        endpointId: event.endpointId,
      },
      payload: {
        change: {
          cause: {
            type: 'PHYSICAL_INTERACTION',
          },
          properties,
        },
      },
    },
  }

  console.log('CHANGE-REPORT', JSON.stringify(changeReport))

  const response: AxiosResponse = await Axios.post(
    getEventGatewayUrl(skillRegion),
    changeReport,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  )

  return response.status == 202
}

export async function proactivelyDiscoverDevices(
  userId: string,
  devices: Device[]
) {
  const { accessToken, skillRegion } = await getStoredTokenRecord(userId)

  const endpoints = getEndpointsForDevices(devices)

  const addOrUpdateReport = {
    event: {
      header: {
        namespace: 'Alexa.Discovery',
        name: 'AddOrUpdateReport',
        payloadVersion: '3',
        messageId: uuidv4(),
      },
      payload: {
        endpoints,
        scope: {
          type: 'BearerToken',
          token: accessToken,
        },
      },
    },
  }

  console.log('ADD-OR-UPDATE-REPORT', JSON.stringify(addOrUpdateReport))

  const response: AxiosResponse = await Axios.post(
    getEventGatewayUrl(skillRegion),
    addOrUpdateReport,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  )

  return response.status == 202
}

export async function proactivelyUndiscoverDevices(
  userId: string,
  deviceIds: string[]
) {
  const { accessToken, skillRegion } = await getStoredTokenRecord(userId)
  const endpoints = deviceIds.map((deviceId) => ({
    endpointId: deviceId,
  }))

  const deleteReport = {
    event: {
      header: {
        namespace: 'Alexa.Discovery',
        name: 'DeleteReport',
        messageId: uuidv4(),
        payloadVersion: '3',
      },
      payload: {
        endpoints,
        scope: {
          type: 'BearerToken',
          token: accessToken,
        },
      },
    },
  }

  console.log('DELETE-REPORT', JSON.stringify(deleteReport))

  try {
    const response: AxiosResponse = await Axios.post(
      getEventGatewayUrl(skillRegion),
      deleteReport,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )

    return response.status == 202
  } catch (e) {
    console.log('proactivelyUndiscoverSingleDevice FAILED', e.message)
    throw e
  }
}

export async function describeThing(thingId: string): Promise<any> {
  const params = {
    thingName: thingId,
  }

  return new Promise((resolve, reject) => {
    iot.describeThing(params, function (err, data) {
      if (err) {
        reject(err)
      } else {
        resolve({
          defaultClientId: data.defaultClientId,
          thingName: data.thingName,
          thingId: data.thingName, //we refer to a thing always by its name
          thingArn: data.thingArn,
          thingTypeName: data.thingTypeName,
          attributes: data.attributes,
          version: data.version,
          billingGroupName: data.billingGroupName,
        })
      }
    })
  })
}
