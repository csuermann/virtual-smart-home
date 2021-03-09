import { publish } from '../mqtt'
import { Shadow, buildPropertiesFromShadow, fetchDeviceShadow } from '../shadow'

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

type ResolverFn = (
  event: DirectiveEvent,
  shadow: Shadow
) => {
  updatedProperties: Property[]
  desiredState: { [key: string]: any }
}

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
  const directive = event.directive.header.name
  let result

  if (directive === 'Activate' || directive === 'Deactivate') {
    //scene activated or deactivated
    result = {
      context: {},
      event: {
        header: {
          messageId: event.directive.header.messageId + '-R',
          correlationToken: event.directive.header.correlationToken,
          namespace: 'Alexa.SceneController',
          name:
            directive === 'Activate'
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
  TurnOn: (event, shadow) => {
    const desiredState = { powerState: 'ON' }
    const updatedProperties = []

    updatedProperties.push(
      makeProperty('Alexa.PowerController', 'powerState', 'ON')
    )

    //if shadow also has brightness and it's set to 0, override with 100:
    if (shadow.state?.reported?.brightness === 0) {
      updatedProperties.push(
        makeProperty('Alexa.BrightnessController', 'brightness', 100)
      )
      desiredState['brightness'] = 100
    }

    return {
      updatedProperties,
      desiredState,
    }
  },
  TurnOff: (event, shadow) => ({
    updatedProperties: [
      makeProperty('Alexa.PowerController', 'powerState', 'OFF'),
    ],
    desiredState: { powerState: 'OFF' },
  }),
  SetBrightness: (event, shadow) => ({
    updatedProperties: [
      makeProperty(
        'Alexa.BrightnessController',
        'brightness',
        event.directive.payload.brightness
      ),
      makeProperty(
        'Alexa.PowerController',
        'powerState',
        event.directive.payload.brightness > 0 ? 'ON' : 'OFF'
      ),
    ],
    desiredState: {
      brightness: event.directive.payload.brightness,
      powerState: event.directive.payload.brightness > 0 ? 'ON' : 'OFF',
    },
  }),
  SetPercentage: (event, shadow) => {
    const desiredState = { percentage: event.directive.payload.percentage }
    const updatedProperties = []

    updatedProperties.push(
      makeProperty(
        'Alexa.PercentageController',
        'percentage',
        event.directive.payload.percentage
      )
    )

    if (shadow.state?.reported?.template === 'BLINDS') {
      const instance = 'Blinds.Position'
      const mode =
        event.directive.payload.percentage == 100
          ? 'Position.Up'
          : 'Position.Down'

      updatedProperties.push(
        makeProperty('Alexa.ModeController', 'mode', mode, instance)
      )

      desiredState['instance'] = instance
      desiredState['mode'] = mode
    }

    return {
      updatedProperties,
      desiredState,
    }
  },
  AdjustBrightness: (event, shadow) => {
    const currentBrightness = shadow.state.reported?.brightness || 50
    let newBrightness =
      currentBrightness + event.directive.payload.brightnessDelta

    if (newBrightness < 0) {
      newBrightness = 0
    } else if (newBrightness > 100) {
      newBrightness = 100
    }

    return {
      updatedProperties: [
        makeProperty('Alexa.BrightnessController', 'brightness', newBrightness),
        makeProperty(
          'Alexa.PowerController',
          'powerState',
          newBrightness > 0 ? 'ON' : 'OFF'
        ),
      ],
      desiredState: {
        brightness: newBrightness,
        powerState: newBrightness > 0 ? 'ON' : 'OFF',
      },
    }
  },
  SetColor: (event, shadow) => ({
    updatedProperties: [
      makeProperty(
        'Alexa.ColorController',
        'color',
        event.directive.payload.color
      ),
      makeProperty('Alexa.PowerController', 'powerState', 'ON'),
    ],
    desiredState: {
      color: event.directive.payload.color,
      lightMode: 'hsb',
      powerState: 'ON',
    },
  }),
  SetColorTemperature: (event, shadow) => ({
    updatedProperties: [
      makeProperty(
        'Alexa.ColorTemperatureController',
        'colorTemperatureInKelvin',
        event.directive.payload.colorTemperatureInKelvin
      ),
      makeProperty('Alexa.PowerController', 'powerState', 'ON'),
    ],
    desiredState: {
      colorTemperatureInKelvin:
        event.directive.payload.colorTemperatureInKelvin,
      lightMode: 'temp',
      powerState: 'ON',
    },
  }),
  IncreaseColorTemperature: (event, shadow) => {
    const currentTemp = shadow.state?.reported?.colorTemperatureInKelvin || 4000

    const supportedTemps = [
      2200, // warm, warm white
      2700, // incandescent, soft white
      4000, // white
      5500, // daylight, daylight white
      7000, // cool, cool white
    ]

    const newTemp = supportedTemps.find((t) => t > currentTemp) || 10000

    return {
      updatedProperties: [
        makeProperty(
          'Alexa.ColorTemperatureController',
          'colorTemperatureInKelvin',
          newTemp
        ),
      ],
      desiredState: {
        colorTemperatureInKelvin: newTemp,
        lightMode: 'temp',
      },
    }
  },
  DecreaseColorTemperature: (event, shadow) => {
    const currentTemp = shadow.state?.reported?.colorTemperatureInKelvin || 4000

    const supportedTemps = [
      2200, // warm, warm white
      2700, // incandescent, soft white
      4000, // white
      5500, // daylight, daylight white
      7000, // cool, cool white
    ]

    const newTemp = supportedTemps.find((t) => t < currentTemp) || 1000

    return {
      updatedProperties: [
        makeProperty(
          'Alexa.ColorTemperatureController',
          'colorTemperatureInKelvin',
          newTemp
        ),
      ],
      desiredState: {
        colorTemperatureInKelvin: newTemp,
        lightMode: 'temp',
      },
    }
  },
  // Lock: (event, shadow) => ({
  //   updatedProperties: [
  //     makeProperty('Alexa.LockController', 'lockState', 'LOCKED')
  //   ],
  //   desiredState: { lockState: 'LOCKED' }
  // }),
  // Unlock: (event, shadow) => ({
  //   updatedProperties: [
  //     makeProperty('Alexa.LockController', 'lockState', 'UNLOCKED')
  //   ],
  //   desiredState: { lockState: 'UNLOCKED' }
  // }),
  SetMode: (event, shadow) => {
    const updatedProperties = [
      makeProperty(
        'Alexa.ModeController',
        'mode',
        event.directive.payload.mode,
        event.directive.header.instance
      ),
    ]

    const desiredState = {
      mode: event.directive.payload.mode,
      instance: event.directive.header.instance,
    }

    if (shadow.state?.reported?.template === 'BLINDS') {
      const percentage =
        event.directive.payload.mode === 'Position.Up' ? 100 : 0

      updatedProperties.push(
        makeProperty('Alexa.PercentageController', 'percentage', percentage)
      )

      desiredState['percentage'] = percentage
    }

    return {
      updatedProperties,
      desiredState,
    }
  },
  Activate: (event, shadow) => ({
    updatedProperties: [],
    desiredState: {
      isActivated: true,
    },
  }),
  Deactivate: (event, shadow) => ({
    updatedProperties: [],
    desiredState: {
      isActivated: false,
    },
  }),
  AdjustTargetTemperature: (event, shadow) => {
    const currentTargetTemp = shadow.state.reported?.targetTemperature || 0
    const newTargetTemp =
      currentTargetTemp + event.directive.payload.targetSetpointDelta.value

    return {
      updatedProperties: [
        makeProperty('Alexa.ThermostatController', 'targetSetpoint', {
          value: newTargetTemp,
          scale: event.directive.payload.targetSetpointDelta.scale,
        }),
      ],
      desiredState: {
        targetTemperature: newTargetTemp,
      },
    }
  },
  SetTargetTemperature: (event, shadow) => ({
    updatedProperties: [
      makeProperty(
        'Alexa.ThermostatController',
        'targetSetpoint',
        event.directive.payload.targetSetpoint
      ),
      makeProperty('Alexa.ThermostatController', 'thermostatMode', 'AUTO'),
    ],
    desiredState: {
      targetTemperature: event.directive.payload.targetSetpoint.value,
      targetScale: event.directive.payload.targetSetpoint.scale,
    },
  }),
  AdjustRangeValue: (event, shadow) => {
    const deviceType = event.directive.endpoint.cookie.template

    if (deviceType === 'FAN') {
      const currentSpeed = shadow.state?.reported?.speed || 0

      let newSpeed = currentSpeed + event.directive.payload.rangeValueDelta

      if (newSpeed < 0) {
        newSpeed = 0
      } else if (newSpeed > 10) {
        newSpeed = 10
      }

      return {
        updatedProperties: [
          makeProperty(
            'Alexa.RangeController',
            'rangeValue',
            newSpeed,
            event.directive.header.instance
          ),
          makeProperty(
            'Alexa.PowerController',
            'powerState',
            newSpeed > 0 ? 'ON' : 'OFF'
          ),
        ],
        desiredState: {
          speed: newSpeed,
          powerState: newSpeed > 0 ? 'ON' : 'OFF',
        },
      }
    } else if (deviceType === 'BLINDS') {
      const currentPercentage = shadow.state?.reported?.percentage || 100

      let newPercentage =
        currentPercentage + event.directive.payload.rangeValueDelta

      if (newPercentage < 0) {
        newPercentage = 0
      } else if (newPercentage > 100) {
        newPercentage = 100
      }

      return {
        updatedProperties: [
          makeProperty(
            'Alexa.RangeController',
            'rangeValue',
            newPercentage,
            event.directive.header.instance
          ),
        ],
        desiredState: {
          percentage: newPercentage,
        },
      }
    }
  },
  SetRangeValue: (event, shadow) => {
    const updatedProperties = [
      makeProperty(
        'Alexa.RangeController',
        'rangeValue',
        event.directive.payload.rangeValue,
        event.directive.header.instance
      ),
    ]

    let desiredState = {}

    if (event.directive.endpoint.cookie.template === 'FAN') {
      updatedProperties.push(
        makeProperty(
          'Alexa.PowerController',
          'powerState',
          event.directive.payload.rangeValue > 0 ? 'ON' : 'OFF'
        )
      )

      desiredState = {
        speed: event.directive.payload.rangeValue,
        powerState: event.directive.payload.rangeValue > 0 ? 'ON' : 'OFF',
      }
    } else if (event.directive.endpoint.cookie.template === 'BLINDS') {
      desiredState = {
        percentage: event.directive.payload.rangeValue,
        mode:
          event.directive.payload.rangeValue == 100
            ? 'Position.Up'
            : 'Position.Down',
      }
    }

    return {
      updatedProperties,
      desiredState,
    }
  },
}

export default async function handleDirective(event: DirectiveEvent) {
  const directive = event.directive.header.name
  const deviceShadow = await fetchDeviceShadow(
    event.directive.endpoint.cookie.thingId,
    event.directive.endpoint.endpointId
  )

  const { updatedProperties, desiredState } = directiveResolvers[directive](
    event,
    deviceShadow as Shadow
  )

  const newDesiredState = { state: { desired: desiredState } }

  //mark the desired state as originating from Alexa:
  newDesiredState.state.desired['source'] = 'alexa'

  //include the name of the directive that Alexa invoked:
  newDesiredState.state.desired['directive'] = directive

  await publish(
    `$aws/things/${event.directive.endpoint.cookie.thingId}/shadow/name/${event.directive.endpoint.endpointId}/update`,
    newDesiredState
  )

  const result = makeResponse(event, updatedProperties)

  return result
}
