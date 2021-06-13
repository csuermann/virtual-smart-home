import { createErrorResponse } from '../helper'
import { publish } from '../mqtt'
import { Shadow, fetchThingShadow } from '../shadow'
import { isAllowedClientVersion, isFeatureSupportedByClient } from '../version'

interface Property {
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

type ResolverFn = (event: DirectiveEvent) => Property[]

function makeProperty(
  namespace: string,
  name: string,
  value: any,
  instance?: string
): Property {
  return {
    namespace,
    name,
    value,
    instance,
    timeOfSample: new Date().toISOString(),
    uncertaintyInMilliseconds: 0,
  }
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
  const { thingId } = event.directive.endpoint.cookie

  const thingShadow = (await fetchThingShadow(thingId)) as Shadow
  const vshClientVersion = thingShadow.state.reported?.vsh_version || '0.0.0'
  const isThingConnected = thingShadow.state.reported?.connected || false

  if (!isFeatureSupportedByClient('reportState', vshClientVersion)) {
    return createErrorResponse(
      event,
      'FIRMWARE_OUT_OF_DATE',
      `VSH Client version ${vshClientVersion} of thing ID ${thingId} does not support state reporting`
    )
  } else if (!isThingConnected) {
    return createErrorResponse(
      event,
      'ENDPOINT_UNREACHABLE',
      `Thing ID ${thingId} is not connected`
    )
  }

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
