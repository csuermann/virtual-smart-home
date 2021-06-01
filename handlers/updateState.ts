import { createErrorResponse } from '../helper'
import { publish } from '../mqtt'
import { Shadow, fetchThingShadow } from '../shadow'
import { isAllowedClientVersion } from '../version'

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

interface ResolverHashmap {
  [key: string]: ResolverFn
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

function makeResponse(event, updatedProperties) {
  const directiveName = event.directive.header.name
  let result

  if (directiveName === 'Activate' || directiveName === 'Deactivate') {
    //scene activated or deactivated
    result = {
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
          scope: {
            type: 'BearerToken',
            token: event.directive.endpoint.scope.token,
          },
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
    //response to device directive
    result = {
      event: {
        header: {
          namespace: 'Alexa',
          name: 'Response',
          messageId: event.directive.header.messageId + '-R',
          correlationToken: event.directive.header.correlationToken,
          payloadVersion: '3',
        },
        endpoint: {
          scope: {
            type: 'BearerToken',
            token: event.directive.endpoint.scope.token,
          },
          endpointId: event.directive.endpoint.endpointId,
        },
        payload: {},
      },
      context: {
        properties: updatedProperties,
      },
    }
  }

  return result
}

const directiveResolvers: ResolverHashmap = {
  TurnOn: (event) => [
    makeProperty('Alexa.PowerController', 'powerState', 'ON'),
  ],
  TurnOff: (event) => [
    makeProperty('Alexa.PowerController', 'powerState', 'OFF'),
  ],
  SetBrightness: (event) => [
    makeProperty(
      'Alexa.BrightnessController',
      'brightness',
      event.directive.payload.brightness
    ),
  ],
  SetPercentage: (event) => [
    makeProperty(
      'Alexa.PercentageController',
      'percentage',
      event.directive.payload.percentage
    ),
  ],
  AdjustBrightness: (event) => [
    makeProperty(
      'Alexa.BrightnessController',
      'brightness',
      50 //will be set to correct value by ChangeReport
    ),
  ],
  SetColor: (event) => [
    makeProperty(
      'Alexa.ColorController',
      'color',
      event.directive.payload.color
    ),
  ],
  SetColorTemperature: (event) => [
    makeProperty(
      'Alexa.ColorTemperatureController',
      'colorTemperatureInKelvin',
      event.directive.payload.colorTemperatureInKelvin
    ),
  ],
  IncreaseColorTemperature: (event) => [
    makeProperty(
      'Alexa.ColorTemperatureController',
      'colorTemperatureInKelvin',
      4000 //will be set to correct value by ChangeReport
    ),
  ],
  DecreaseColorTemperature: (event) => [
    makeProperty(
      'Alexa.ColorTemperatureController',
      'colorTemperatureInKelvin',
      4000 //will be set to correct value by ChangeReport
    ),
  ],
  Lock: (event) => [
    makeProperty('Alexa.LockController', 'lockState', 'LOCKED'),
  ],
  Unlock: (event) => [
    makeProperty('Alexa.LockController', 'lockState', 'UNLOCKED'),
  ],
  SetMode: (event) => [
    makeProperty(
      'Alexa.ModeController',
      'mode',
      event.directive.payload.mode,
      event.directive.header.instance
    ),
  ],
  Activate: (event) => [],
  Deactivate: (event) => [],
  AdjustTargetTemperature: (event) => [
    makeProperty('Alexa.ThermostatController', 'targetSetpoint', {
      value: 25, //will be set to correct value by ChangeReport
      scale: event.directive.payload.targetSetpointDelta.scale,
    }),
  ],
  SetTargetTemperature: (event) => [
    makeProperty(
      'Alexa.ThermostatController',
      'targetSetpoint',
      event.directive.payload.targetSetpoint
    ),
    makeProperty('Alexa.ThermostatController', 'thermostatMode', 'AUTO'),
  ],
  AdjustRangeValue: (event) => [
    makeProperty(
      'Alexa.RangeController',
      'rangeValue',
      0, //will be set to correct value by ChangeReport
      event.directive.header.instance
    ),
  ],
  SetRangeValue: (event) => [
    makeProperty(
      'Alexa.RangeController',
      'rangeValue',
      event.directive.payload.rangeValue,
      event.directive.header.instance
    ),
  ],
}

export async function handleDirective(event: DirectiveEvent) {
  const { thingId } = event.directive.endpoint.cookie
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
  } else if (!directiveResolvers[directiveName]) {
    return createErrorResponse(
      event,
      'INVALID_DIRECTIVE',
      `${directiveName} is not (yet) supported by VSH backend`
    )
  }

  // https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-response.html#deferred
  const deferredResponse = {
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

  return deferredResponse
}
