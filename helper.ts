import Axios, { AxiosResponse, AxiosError } from 'axios'
import { v4 as uuidv4 } from 'uuid'
import * as log from 'log'

import { getDevicesOfUser, getUserRecord } from './db'
import { getEndpointsForDevices } from './handlers/discover'

import AWS = require('aws-sdk')
import { Device } from './Device'
import { Plan, PlanName } from './Plan'
import { writeDevicePropsToCache } from './cache'

AWS.config.update({ region: process.env.VSH_IOT_REGION })

const iot = new AWS.Iot()

export enum CauseType {
  PHYSICAL_INTERACTION = 'PHYSICAL_INTERACTION',
  VOICE_INTERACTION = 'VOICE_INTERACTION',
  STATE_REPORT = 'STATE_REPORT',
}

export type VshClientBackchannelEvent = {
  rule: string
  template?: string //available as of v2.11.0
  thingId: string
  endpointId: string
  properties: [
    {
      namespace: string
      name: string
      value: any
      changed: boolean
    }
  ]
  correlationToken?: string
  userIdToken?: string //available as of v2.8.0
  causeType: CauseType
  vshVersion?: string //available as of v2.8.2
}

export function getEventGatewayUrl(region) {
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
export async function pushAsyncChangeReportToAlexa(
  userId: string,
  event: VshClientBackchannelEvent
) {
  const { accessToken, skillRegion } = await getUserRecord(userId)

  let { endpointId, properties, causeType } = event

  let alexaProps: Array<any> = properties.map((prop) => ({
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
          properties: alexaProps
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
      properties: alexaProps
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

  log.debug('CHANGE REPORT: %j', changeReport)

  const eventGatewayResponse: AxiosResponse = await Axios.post(
    getEventGatewayUrl(skillRegion),
    changeReport,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  )

  //also cache device props:
  await writeDevicePropsToCache(event.thingId, endpointId, [
    ...changeReport.context.properties,
    ...changeReport.event.payload.change.properties,
  ])

  return eventGatewayResponse.status == 202
}

/**
 * https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-response.html#asynchronous
 */
export async function pushAsyncResponseToAlexa(
  userId: string,
  event: VshClientBackchannelEvent
) {
  const { accessToken, skillRegion } = await getUserRecord(userId)

  let { endpointId, properties, correlationToken } = event

  let alexaProps: Array<any> = properties.map((prop) => ({
    ...prop,
    timeOfSample: new Date().toISOString(),
    uncertaintyInMilliseconds: 500,
  }))

  const alexaResponse = {
    event: {
      header: {
        namespace: 'Alexa',
        name: 'Response',
        messageId: uuidv4(),
        correlationToken,
        payloadVersion: '3',
      },
      endpoint: {
        scope: {
          type: 'BearerToken',
          token: accessToken,
        },
        endpointId,
      },
      payload: {},
    },
    context: {
      properties: alexaProps.map((prop) => {
        delete prop.changed
        return prop
      }),
    },
  }

  alexaResponse.context.properties.push({
    namespace: 'Alexa.EndpointHealth',
    name: 'connectivity',
    value: {
      value: 'OK',
    },
    timeOfSample: new Date().toISOString(),
    uncertaintyInMilliseconds: 250,
  })

  log.debug('ASYNC DIRECTIVE RESPONSE: %j', alexaResponse)

  const eventGatewayResponse: AxiosResponse = await Axios.post(
    getEventGatewayUrl(skillRegion),
    alexaResponse,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  )

  //also cache device props:
  await writeDevicePropsToCache(
    event.thingId,
    endpointId,
    alexaResponse.context.properties
  )

  return eventGatewayResponse.status == 202
}

export async function pushAsyncStateReportToAlexa(
  userId: string,
  event: VshClientBackchannelEvent
) {
  const { accessToken, skillRegion } = await getUserRecord(userId)

  let { endpointId, properties, correlationToken } = event

  let alexaProps: Array<any> = properties.map((prop) => ({
    ...prop,
    timeOfSample: new Date().toISOString(),
    uncertaintyInMilliseconds: 500,
  }))

  const alexaResponse = {
    event: {
      header: {
        namespace: 'Alexa',
        name: 'StateReport',
        messageId: uuidv4(),
        correlationToken,
        payloadVersion: '3',
      },
      endpoint: {
        scope: {
          type: 'BearerToken',
          token: accessToken,
        },
        endpointId,
      },
      payload: {},
    },
    context: {
      properties: alexaProps.map((prop) => {
        delete prop.changed
        return prop
      }),
    },
  }

  alexaResponse.context.properties.push({
    namespace: 'Alexa.EndpointHealth',
    name: 'connectivity',
    value: {
      value: 'OK',
    },
    timeOfSample: new Date().toISOString(),
    uncertaintyInMilliseconds: 250,
  })

  log.debug('ASYNC STATE REPORT: %j', alexaResponse)

  const response: AxiosResponse = await Axios.post(
    getEventGatewayUrl(skillRegion),
    alexaResponse,
    {
      validateStatus: (status) => status == 202, // throw if status code is not 202
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  )

  //also cache the state report to avoid further unnecessary roundtrips to the device:
  await writeDevicePropsToCache(
    event.thingId,
    endpointId,
    alexaResponse.context.properties
  )

  return true
}

export async function pushDoorbellPressEventToAlexa(
  userId: string,
  event: VshClientBackchannelEvent
) {
  //ignore NOT_DETECTED (aka doorbell _not_ pressed)
  if (event.properties[0].value === 'NOT_DETECTED') {
    return false
  }

  const { accessToken, skillRegion } = await getUserRecord(userId)

  let { endpointId } = event

  const doorbellPressEvent = {
    context: {},
    event: {
      header: {
        namespace: 'Alexa.DoorbellEventSource',
        name: 'DoorbellPress',
        messageId: uuidv4(),
        payloadVersion: '3',
      },
      endpoint: {
        scope: {
          type: 'BearerToken',
          token: accessToken,
        },
        endpointId,
      },
      payload: {
        cause: {
          type: 'PHYSICAL_INTERACTION',
        },
        timestamp: new Date().toISOString(),
      },
    },
  }

  log.debug('ASYNC DOORBELL PRESS EVENT: %j', doorbellPressEvent)

  const response: AxiosResponse = await Axios.post(
    getEventGatewayUrl(skillRegion),
    doorbellPressEvent,
    {
      validateStatus: (status) => status == 202, // throw if status code is not 202
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  )

  return true
}

export async function proactivelyRediscoverAllDevices(userId: string) {
  const devices = await getDevicesOfUser(userId)
  return await proactivelyDiscoverDevices(userId, devices)
}

export async function proactivelyDiscoverDevices(
  userId: string,
  devices: Device[]
) {
  const {
    accessToken,
    skillRegion,
    plan: planName,
  } = await getUserRecord(userId)

  const plan = new Plan(planName as PlanName)

  const endpoints = getEndpointsForDevices(devices, plan.asRetrievable)

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

  log.debug('ADD-OR-UPDATE-REPORT: %j', addOrUpdateReport)

  try {
    const response: AxiosResponse = await Axios.post(
      getEventGatewayUrl(skillRegion),
      addOrUpdateReport,
      {
        validateStatus: (status) => status == 202, // throw if status code is not 202
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )
    return true
  } catch (e) {
    throw new Error(
      `Request failed with status code ${
        e.response.status
      }. Response body: ${JSON.stringify(e.response.data)}`
    )
  }
}

export async function proactivelyUndiscoverDevices(
  userId: string,
  deviceIds: string[]
) {
  const { accessToken, skillRegion } = await getUserRecord(userId)
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

  log.debug('DELETE-REPORT: %j', deleteReport)

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
    log.notice('proactivelyUndiscoverSingleDevice FAILED: %s', e.message)
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

export function isProd() {
  return process.env.IS_PROD === 'TRUE'
}
