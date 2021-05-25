import Axios, { AxiosResponse, AxiosError } from 'axios'
import { v4 as uuidv4 } from 'uuid'

import { getStoredTokenRecord } from './db'
import { getEndpointsForDevices } from './handlers/discover'

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

/**
 * https://developer.amazon.com/en-US/docs/alexa/smarthome/state-reporting-for-a-smart-home-skill.html#report-state-with-changereport-events
 */
export async function pushChangeReportToAlexa(userId: string, event) {
  const { accessToken, skillRegion } = await getStoredTokenRecord(userId)

  let { endpointId, properties, causeType } = event

  properties = (properties as []).map((prop: Object) => ({
    ...prop,
    timeOfSample: new Date().toISOString(),
    uncertaintyInMilliseconds: 500,
  }))

  const changeReport = {
    event: {
      header: {
        namespace: 'Alexa',
        name: 'ChangeReport',
        messageId: uuidv4(),
        payloadVersion: '3',
      },
      endpoint: {
        scope: {
          type: 'BearerToken',
          token: accessToken,
        },
        endpointId,
        //cookie: {},
      },
      payload: {
        change: {
          cause: {
            type: causeType,
          },
          //only the properties that changed
          properties: properties
            .filter((prop) => prop.changed === true)
            .map((prop) => {
              delete prop.changed
              return prop
            }),
        },
      },
    },
    context: {
      //all other attributes that did not change
      properties: properties
        .filter((prop) => prop.changed === false)
        .map((prop) => {
          delete prop.changed
          return prop
        }),
    },
  }

  changeReport.context.properties.push({
    namespace: 'Alexa.EndpointHealth',
    name: 'connectivity',
    value: {
      value: 'OK',
    },
    timeOfSample: new Date().toISOString(),
    uncertaintyInMilliseconds: 250,
  })

  console.log('CHANGE REPORT', JSON.stringify(changeReport))

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
