import { createErrorResponse } from '../helper'
import { readDevicePropsFromCache } from '../cache'
import { publish } from '../mqtt'
import { Shadow, fetchThingShadow } from '../shadow'
import { isAllowedClientVersion } from '../version'

export interface Property {
  namespace: string
  name: string
  value: any
  instance?: string
  timeOfSample: string
  uncertaintyInMilliseconds: number
}

interface DirectiveEvent {
  [key: string]: any
}

export async function handleDirective(event: DirectiveEvent) {
  const { thingId, template } = event.directive.endpoint.cookie
  const directiveName = event.directive.header.name

  const thingShadow = (await fetchThingShadow(thingId)) as Shadow
  const vshClientVersion = thingShadow.state.reported?.vsh_version || '0.0.0'
  const isThingConnected = thingShadow.state.reported?.connected || false

  if (!isAllowedClientVersion(vshClientVersion)) {
    return createErrorResponse(
      event,
      'FIRMWARE_OUT_OF_DATE',
      `VSH Client version ${vshClientVersion} of thing ID ${thingId} is outdated`
    )
  } else if (!isThingConnected) {
    return createErrorResponse(
      event,
      'ENDPOINT_UNREACHABLE',
      `Thing ID ${thingId} is not connected`
    )
  }

  let immediateResponse

  if (template === 'SCENE') {
    immediateResponse = {
      context: {},
      event: {
        header: {
          messageId: event.directive.header.messageId + '-R',
          correlationToken: event.directive.header.correlationToken,
          namespace: 'Alexa.SceneController',
          name:
            directiveName === 'Activate'
              ? 'ActivationStarted'
              : 'DeactivationStarted',
          payloadVersion: '3',
        },
        endpoint: {
          endpointId: event.directive.endpoint.endpointId,
        },
        payload: {
          cause: {
            type: 'VOICE_INTERACTION',
          },
          timestamp: new Date().toISOString(),
        },
      },
    }
  } else {
    // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-response.html#deferred
    immediateResponse = {
      event: {
        header: {
          namespace: 'Alexa',
          name: 'DeferredResponse',
          messageId: event.directive.header.messageId + '-R',
          correlationToken: event.directive.header.correlationToken,
          payloadVersion: '3',
        },
        payload: {
          estimatedDeferralInSeconds: 5,
        },
      },
    }
  }

  const directiveStub = { ...event }

  //omit parts of event that are not needed by client:
  delete directiveStub.profile
  delete directiveStub.directive.header.messageId
  delete directiveStub.directive.header.payloadVersion
  delete directiveStub.directive.endpoint.scope
  delete directiveStub.directive.endpoint.cookie

  await publish(
    `vsh/${thingId}/${event.directive.endpoint.endpointId}/directive`,
    directiveStub
  )

  return immediateResponse
}

export async function handleReportState(event: DirectiveEvent) {
  // EXAMPLE event (report state):
  // {
  //   "directive": {
  //     "header": {
  //       "namespace": "Alexa",
  //       "name": "ReportState",
  //       "payloadVersion": "3",
  //       "messageId": "20519cc7-6c...",
  //       "correlationToken": "AAAAAAAAAQAQ14..."
  //     },
  //     "endpoint": {
  //       "scope": {
  //         "type": "BearerToken",
  //         "token": "Atza|IwE..."
  //       },
  //       "endpointId": "vshd-c5f826...",
  //       "cookie": {
  //         "template": "SWITCH",
  //         "thingId": "vsht-badf0..."
  //       }
  //     },
  //     "payload": {}
  //   },
  //   "profile": {
  //     "user_id": "amzn1.account.AFWAF...",
  //     "name": "CS",
  //     "email": "c...@gmail.com"
  //   }
  // }

  const { thingId } = event.directive.endpoint.cookie

  //try to construct a syncronous response from cache:
  try {
    const cachedProps = await readDevicePropsFromCache(
      thingId,
      event.directive.endpoint.endpointId
    )

    return {
      event: {
        header: {
          namespace: 'Alexa',
          name: 'StateReport',
          messageId: event.directive.header.messageId + '-R',
          correlationToken: event.directive.header.correlationToken,
          payloadVersion: '3',
        },
        endpoint: {
          endpointId: event.directive.endpoint.endpointId,
        },
        payload: {},
      },
      context: {
        properties: [...cachedProps],
      },
    }
  } catch (err) {
    // cache miss!

    // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-response.html#deferred
    let immediateResponse = {
      event: {
        header: {
          namespace: 'Alexa',
          name: 'DeferredResponse',
          messageId: event.directive.header.messageId + '-R',
          correlationToken: event.directive.header.correlationToken,
          payloadVersion: '3',
        },
        payload: {
          estimatedDeferralInSeconds: 5,
        },
      },
    }

    const directiveStub = { ...event }

    //omit parts of event that are not needed by client:
    delete directiveStub.directive.header.messageId
    delete directiveStub.directive.header.payloadVersion
    delete directiveStub.directive.endpoint.scope
    delete directiveStub.directive.endpoint.cookie
    delete directiveStub.profile

    await publish(
      `vsh/${thingId}/${event.directive.endpoint.endpointId}/directive`,
      directiveStub
    )

    return immediateResponse
  }
}
