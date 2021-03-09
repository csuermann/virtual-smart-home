export default {
  SWITCH: {
    endpointId: '<device.id>',
    manufacturerName: 'virtual smart home',
    description: 'virtual switch',
    friendlyName: '<device.friendlyName>',
    cookie: {},
    additionalAttributes: {
      manufacturer: 'virtual smart home',
      model: 'virtual smart home',
      serialNumber: '0000000',
      firmwareVersion: '1.0.0',
      softwareVersion: '1.0.0',
      customIdentifier: '0000000',
    },
    displayCategories: ['SWITCH'],
    capabilities: [
      {
        type: 'AlexaInterface',
        interface: 'Alexa.PowerController',
        version: '3',
        properties: {
          supported: [
            {
              name: 'powerState',
            },
          ],
          proactivelyReported: true,
          retrievable: true,
        },
      },
      {
        type: 'AlexaInterface',
        interface: 'Alexa.EndpointHealth',
        version: '3',
        properties: {
          supported: [
            {
              name: 'connectivity',
            },
          ],
          proactivelyReported: true,
          retrievable: true,
        },
      },
      {
        type: 'AlexaInterface',
        interface: 'Alexa',
        version: '3',
      },
    ],
  },
  COLOR_CHANGING_LIGHT_BULB: {
    endpointId: '<device.id>',
    manufacturerName: 'virtual smart home',
    description: 'virtual color changing light bulb',
    friendlyName: '<device.friendlyName>',
    cookie: {},
    additionalAttributes: {
      manufacturer: 'virtual smart home',
      model: 'virtual smart home',
      serialNumber: '0000000',
      firmwareVersion: '1.0.0',
      softwareVersion: '1.0.0',
      customIdentifier: '0000000',
    },
    displayCategories: ['LIGHT'],
    capabilities: [
      {
        type: 'AlexaInterface',
        interface: 'Alexa.PowerController',
        version: '3',
        properties: {
          supported: [
            {
              name: 'powerState',
            },
          ],
          proactivelyReported: true,
          retrievable: true,
        },
      },
      {
        type: 'AlexaInterface',
        interface: 'Alexa.BrightnessController',
        version: '3',
        properties: {
          supported: [
            {
              name: 'brightness',
            },
          ],
          proactivelyReported: true,
          retrievable: true,
        },
      },
      {
        type: 'AlexaInterface',
        interface: 'Alexa.ColorTemperatureController',
        version: '3',
        properties: {
          supported: [
            {
              name: 'colorTemperatureInKelvin',
            },
          ],
          proactivelyReported: true,
          retrievable: true,
        },
      },
      {
        type: 'AlexaInterface',
        interface: 'Alexa.ColorController',
        version: '3',
        properties: {
          supported: [
            {
              name: 'color',
            },
          ],
          proactivelyReported: true,
          retrievable: true,
        },
      },
      {
        type: 'AlexaInterface',
        interface: 'Alexa.EndpointHealth',
        version: '3',
        properties: {
          supported: [
            {
              name: 'connectivity',
            },
          ],
          proactivelyReported: true,
          retrievable: true,
        },
      },
      {
        type: 'AlexaInterface',
        interface: 'Alexa',
        version: '3',
      },
    ],
  },
  DIMMABLE_LIGHT_BULB: {
    endpointId: '<device.id>',
    manufacturerName: 'virtual smart home',
    description: 'virtual dimmable light bulb',
    friendlyName: '<device.friendlyName>',
    cookie: {},
    additionalAttributes: {
      manufacturer: 'virtual smart home',
      model: 'virtual smart home',
      serialNumber: '0000000',
      firmwareVersion: '1.0.0',
      softwareVersion: '1.0.0',
      customIdentifier: '0000000',
    },
    displayCategories: ['LIGHT'],
    capabilities: [
      {
        type: 'AlexaInterface',
        interface: 'Alexa.PowerController',
        version: '3',
        properties: {
          supported: [
            {
              name: 'powerState',
            },
          ],
          proactivelyReported: true,
          retrievable: true,
        },
      },
      {
        type: 'AlexaInterface',
        interface: 'Alexa.BrightnessController',
        version: '3',
        properties: {
          supported: [
            {
              name: 'brightness',
            },
          ],
          proactivelyReported: true,
          retrievable: true,
        },
      },
      {
        type: 'AlexaInterface',
        interface: 'Alexa.EndpointHealth',
        version: '3',
        properties: {
          supported: [
            {
              name: 'connectivity',
            },
          ],
          proactivelyReported: true,
          retrievable: true,
        },
      },
      {
        type: 'AlexaInterface',
        interface: 'Alexa',
        version: '3',
      },
    ],
  },
  DIMMER_SWITCH: {
    endpointId: '<device.id>',
    manufacturerName: 'virtual smart home',
    description: 'virtual dimmable light bulb',
    friendlyName: '<device.friendlyName>',
    cookie: {},
    additionalAttributes: {
      manufacturer: 'virtual smart home',
      model: 'virtual smart home',
      serialNumber: '0000000',
      firmwareVersion: '1.0.0',
      softwareVersion: '1.0.0',
      customIdentifier: '0000000',
    },
    displayCategories: ['SWITCH'],
    capabilities: [
      {
        type: 'AlexaInterface',
        interface: 'Alexa.PowerController',
        version: '3',
        properties: {
          supported: [
            {
              name: 'powerState',
            },
          ],
          proactivelyReported: true,
          retrievable: true,
        },
      },
      {
        type: 'AlexaInterface',
        interface: 'Alexa.BrightnessController',
        version: '3',
        properties: {
          supported: [
            {
              name: 'brightness',
            },
          ],
          proactivelyReported: true,
          retrievable: true,
        },
      },
      {
        type: 'AlexaInterface',
        interface: 'Alexa.EndpointHealth',
        version: '3',
        properties: {
          supported: [
            {
              name: 'connectivity',
            },
          ],
          proactivelyReported: true,
          retrievable: true,
        },
      },
      {
        type: 'AlexaInterface',
        interface: 'Alexa',
        version: '3',
      },
    ],
  },
  FAN: {
    endpointId: '<device.id>',
    manufacturerName: 'virtual smart home',
    description: 'virtual fan',
    friendlyName: '<device.friendlyName>',
    cookie: {},
    additionalAttributes: {
      manufacturer: 'virtual smart home',
      model: 'virtual smart home',
      serialNumber: '0000000',
      firmwareVersion: '1.0.0',
      softwareVersion: '1.0.0',
      customIdentifier: '0000000',
    },
    displayCategories: ['FAN'],
    capabilities: [
      {
        type: 'AlexaInterface',
        interface: 'Alexa.RangeController',
        version: '3',
        instance: 'SampleManufacturer.Fan.Speed',
        capabilityResources: {
          friendlyNames: [
            {
              '@type': 'asset',
              value: {
                assetId: 'Alexa.Setting.FanSpeed',
              },
            },
            {
              '@type': 'text',
              value: {
                text: 'Speed',
                locale: 'en-US',
              },
            },
            {
              '@type': 'text',
              value: {
                text: 'Velocidad',
                locale: 'es-MX',
              },
            },
            {
              '@type': 'text',
              value: {
                text: 'Vitesse',
                locale: 'fr-CA',
              },
            },
          ],
        },
        properties: {
          supported: [
            {
              name: 'rangeValue',
            },
          ],
          proactivelyReported: true,
          retrievable: true,
        },
        configuration: {
          supportedRange: {
            minimumValue: 1,
            maximumValue: 10,
            precision: 1,
          },
          presets: [
            {
              rangeValue: 10,
              presetResources: {
                friendlyNames: [
                  {
                    '@type': 'asset',
                    value: {
                      assetId: 'Alexa.Value.Maximum',
                    },
                  },
                  {
                    '@type': 'asset',
                    value: {
                      assetId: 'Alexa.Value.High',
                    },
                  },
                  {
                    '@type': 'text',
                    value: {
                      text: 'Highest',
                      locale: 'en-US',
                    },
                  },
                  {
                    '@type': 'text',
                    value: {
                      text: 'Fast',
                      locale: 'en-US',
                    },
                  },
                  {
                    '@type': 'text',
                    value: {
                      text: 'Alta',
                      locale: 'es-MX',
                    },
                  },
                  {
                    '@type': 'text',
                    value: {
                      text: 'Élevée',
                      locale: 'fr-CA',
                    },
                  },
                ],
              },
            },
            {
              rangeValue: 1,
              presetResources: {
                friendlyNames: [
                  {
                    '@type': 'asset',
                    value: {
                      assetId: 'Alexa.Value.Minimum',
                    },
                  },
                  {
                    '@type': 'asset',
                    value: {
                      assetId: 'Alexa.Value.Low',
                    },
                  },
                  {
                    '@type': 'text',
                    value: {
                      text: 'Lowest',
                      locale: 'en-US',
                    },
                  },
                  {
                    '@type': 'text',
                    value: {
                      text: 'Slow',
                      locale: 'en-US',
                    },
                  },
                  {
                    '@type': 'text',
                    value: {
                      text: 'Baja',
                      locale: 'es-MX',
                    },
                  },
                  {
                    '@type': 'text',
                    value: {
                      text: 'Faible',
                      locale: 'fr-CA',
                    },
                  },
                ],
              },
            },
          ],
        },
      },
      {
        type: 'AlexaInterface',
        interface: 'Alexa.PowerController',
        version: '3',
        properties: {
          supported: [
            {
              name: 'powerState',
            },
          ],
          proactivelyReported: true,
          retrievable: true,
        },
      },
      {
        type: 'AlexaInterface',
        interface: 'Alexa',
        version: '3',
      },
    ],
  },
  PLUG: {
    endpointId: '<device.id>',
    manufacturerName: 'virtual smart home',
    description: 'virtual plug',
    friendlyName: '<device.friendlyName>',
    cookie: {},
    additionalAttributes: {
      manufacturer: 'virtual smart home',
      model: 'virtual smart home',
      serialNumber: '0000000',
      firmwareVersion: '1.0.0',
      softwareVersion: '1.0.0',
      customIdentifier: '0000000',
    },
    displayCategories: ['SMARTPLUG'],
    capabilities: [
      {
        type: 'AlexaInterface',
        interface: 'Alexa.PowerController',
        version: '3',
        properties: {
          supported: [
            {
              name: 'powerState',
            },
          ],
          proactivelyReported: true,
          retrievable: true,
        },
      },
      {
        type: 'AlexaInterface',
        interface: 'Alexa.EndpointHealth',
        version: '3',
        properties: {
          supported: [
            {
              name: 'connectivity',
            },
          ],
          proactivelyReported: true,
          retrievable: true,
        },
      },
      {
        type: 'AlexaInterface',
        interface: 'Alexa',
        version: '3',
      },
    ],
  },
  TEMPERATURE_SENSOR: {
    endpointId: '<device.id>',
    manufacturerName: 'virtual smart home',
    description: 'virtual temperature sensor',
    friendlyName: '<device.friendlyName>',
    cookie: {},
    additionalAttributes: {
      manufacturer: 'virtual smart home',
      model: 'virtual smart home',
      serialNumber: '0000000',
      firmwareVersion: '1.0.0',
      softwareVersion: '1.0.0',
      customIdentifier: '0000000',
    },
    displayCategories: ['TEMPERATURE_SENSOR'],
    capabilities: [
      {
        type: 'AlexaInterface',
        interface: 'Alexa.TemperatureSensor',
        version: '3',
        properties: {
          supported: [
            {
              name: 'temperature',
            },
          ],
          proactivelyReported: true,
          retrievable: true,
        },
      },
      {
        type: 'AlexaInterface',
        interface: 'Alexa.EndpointHealth',
        version: '3',
        properties: {
          supported: [
            {
              name: 'connectivity',
            },
          ],
          proactivelyReported: true,
          retrievable: true,
        },
      },
      {
        type: 'AlexaInterface',
        interface: 'Alexa',
        version: '3',
      },
    ],
  },
  GARAGE_DOOR_OPENER: {
    endpointId: '<device.id>',
    manufacturerName: 'virtual smart home',
    description: 'virtual garage door opener',
    friendlyName: '<device.friendlyName>',
    cookie: {},
    additionalAttributes: {
      manufacturer: 'virtual smart home',
      model: 'virtual smart home',
      serialNumber: '0000000',
      firmwareVersion: '1.0.0',
      softwareVersion: '1.0.0',
      customIdentifier: '0000000',
    },
    displayCategories: ['GARAGE_DOOR'],
    capabilities: [
      {
        type: 'AlexaInterface',
        interface: 'Alexa.ModeController',
        instance: 'GarageDoor.Position',
        version: '3',
        properties: {
          supported: [
            {
              name: 'mode',
            },
          ],
          retrievable: true,
          proactivelyReported: true,
        },
        capabilityResources: {
          friendlyNames: [
            {
              '@type': 'asset',
              value: {
                assetId: 'Alexa.Setting.Mode',
              },
            },
          ],
        },
        configuration: {
          ordered: false,
          supportedModes: [
            {
              value: 'Position.Up',
              modeResources: {
                friendlyNames: [
                  {
                    '@type': 'text',
                    value: {
                      text: 'Open',
                      locale: 'en-US',
                    },
                  },
                  {
                    '@type': 'asset',
                    value: {
                      assetId: 'Alexa.Value.Open',
                    },
                  },
                ],
              },
            },
            {
              value: 'Position.Down',
              modeResources: {
                friendlyNames: [
                  {
                    '@type': 'text',
                    value: {
                      text: 'Closed',
                      locale: 'en-US',
                    },
                  },
                  {
                    '@type': 'asset',
                    value: {
                      assetId: 'Alexa.Value.Close',
                    },
                  },
                ],
              },
            },
          ],
        },
        semantics: {
          actionMappings: [
            {
              '@type': 'ActionsToDirective',
              actions: ['Alexa.Actions.Close', 'Alexa.Actions.Lower'],
              directive: {
                name: 'SetMode',
                payload: {
                  mode: 'Position.Down',
                },
              },
            },
            {
              '@type': 'ActionsToDirective',
              actions: ['Alexa.Actions.Open', 'Alexa.Actions.Raise'],
              directive: {
                name: 'SetMode',
                payload: {
                  mode: 'Position.Up',
                },
              },
            },
          ],
          stateMappings: [
            {
              '@type': 'StatesToValue',
              states: ['Alexa.States.Closed'],
              value: 'Position.Down',
            },
            {
              '@type': 'StatesToValue',
              states: ['Alexa.States.Open'],
              value: 'Position.Up',
            },
          ],
        },
      },
      {
        type: 'AlexaInterface',
        interface: 'Alexa.EndpointHealth',
        version: '3',
        properties: {
          supported: [
            {
              name: 'connectivity',
            },
          ],
          proactivelyReported: true,
          retrievable: true,
        },
      },
      {
        type: 'AlexaInterface',
        interface: 'Alexa',
        version: '3',
      },
    ],
  },
  // LOCK: {
  //   endpointId: '<device.id>',
  //   manufacturerName: 'virtual smart home',
  //   description: 'virtual lock',
  //   friendlyName: '<device.friendlyName>',
  //   cookie: {},
  //   additionalAttributes: {
  //     manufacturer: 'virtual smart home',
  //     model: 'virtual smart home',
  //     serialNumber: '0000000',
  //     firmwareVersion: '1.0.0',
  //     softwareVersion: '1.0.0',
  //     customIdentifier: '0000000',
  //   },
  //   displayCategories: ['SMARTLOCK'],
  //   capabilities: [
  //     {
  //       type: 'AlexaInterface',
  //       interface: 'Alexa.LockController',
  //       version: '3',
  //       properties: {
  //         supported: [
  //           {
  //             name: 'lockState',
  //           },
  //         ],
  //         proactivelyReported: true,
  //         retrievable: true,
  //       },
  //     },
  //     {
  //       type: 'AlexaInterface',
  //       interface: 'Alexa.EndpointHealth',
  //       version: '3',
  //       properties: {
  //         supported: [
  //           {
  //             name: 'connectivity',
  //           },
  //         ],
  //         proactivelyReported: true,
  //         retrievable: true,
  //       },
  //     },
  //     {
  //       type: 'AlexaInterface',
  //       interface: 'Alexa',
  //       version: '3',
  //     },
  //   ],
  // },
  BLINDS: {
    endpointId: '<device.id>',
    manufacturerName: 'virtual smart home',
    description: 'virtual blinds',
    friendlyName: '<device.friendlyName>',
    cookie: {},
    additionalAttributes: {
      manufacturer: 'virtual smart home',
      model: 'virtual smart home',
      serialNumber: '0000000',
      firmwareVersion: '1.0.0',
      softwareVersion: '1.0.0',
      customIdentifier: '0000000',
    },
    displayCategories: ['INTERIOR_BLIND'],
    capabilities: [
      {
        type: 'AlexaInterface',
        interface: 'Alexa.RangeController',
        instance: 'Blind.Lift',
        version: '3',
        properties: {
          supported: [
            {
              name: 'rangeValue',
            },
          ],
          proactivelyReported: true,
          retrievable: true,
        },
        capabilityResources: {
          friendlyNames: [
            {
              '@type': 'asset',
              value: {
                assetId: 'Alexa.Setting.Opening',
              },
            },
          ],
        },
        configuration: {
          supportedRange: {
            minimumValue: 0,
            maximumValue: 100,
            precision: 1,
          },
          unitOfMeasure: 'Alexa.Unit.Percent',
        },
        semantics: {
          actionMappings: [
            {
              '@type': 'ActionsToDirective',
              actions: ['Alexa.Actions.Close'],
              directive: {
                name: 'SetRangeValue',
                payload: {
                  rangeValue: 0,
                },
              },
            },
            {
              '@type': 'ActionsToDirective',
              actions: ['Alexa.Actions.Open'],
              directive: {
                name: 'SetRangeValue',
                payload: {
                  rangeValue: 100,
                },
              },
            },
            {
              '@type': 'ActionsToDirective',
              actions: ['Alexa.Actions.Lower'],
              directive: {
                name: 'AdjustRangeValue',
                payload: {
                  rangeValueDelta: -10,
                  rangeValueDeltaDefault: false,
                },
              },
            },
            {
              '@type': 'ActionsToDirective',
              actions: ['Alexa.Actions.Raise'],
              directive: {
                name: 'AdjustRangeValue',
                payload: {
                  rangeValueDelta: 10,
                  rangeValueDeltaDefault: false,
                },
              },
            },
          ],
          stateMappings: [
            {
              '@type': 'StatesToValue',
              states: ['Alexa.States.Closed'],
              value: 0,
            },
            {
              '@type': 'StatesToRange',
              states: ['Alexa.States.Open'],
              range: {
                minimumValue: 1,
                maximumValue: 100,
              },
            },
          ],
        },
      },
      {
        type: 'AlexaInterface',
        interface: 'Alexa.EndpointHealth',
        version: '3',
        properties: {
          supported: [
            {
              name: 'connectivity',
            },
          ],
          proactivelyReported: true,
          retrievable: true,
        },
      },
      {
        type: 'AlexaInterface',
        interface: 'Alexa',
        version: '3',
      },
    ],
  },
  SCENE: {
    endpointId: '<device.id>',
    manufacturerName: 'virtual smart home',
    description: 'scene connected via virtual smart home',
    friendlyName: '<device.friendlyName>',
    displayCategories: ['SCENE_TRIGGER'],
    cookie: {},
    capabilities: [
      {
        type: 'AlexaInterface',
        interface: 'Alexa',
        version: '3',
      },
      {
        type: 'AlexaInterface',
        interface: 'Alexa.SceneController',
        version: '3',
        supportsDeactivation: true,
      },
    ],
  },
  THERMOSTAT: {
    endpointId: '<device.id>',
    manufacturerName: 'virtual smart home',
    description: 'virtual thermostat',
    friendlyName: '<device.friendlyName>',
    displayCategories: ['THERMOSTAT'],
    cookie: {},
    capabilities: [
      {
        type: 'AlexaInterface',
        interface: 'Alexa.ThermostatController',
        version: '3',
        properties: {
          supported: [
            {
              name: 'targetSetpoint',
            },
            // {
            //   name: 'lowerSetpoint',
            // },
            // {
            //   name: 'upperSetpoint',
            // },
            {
              name: 'thermostatMode',
            },
          ],
          proactivelyReported: true,
          retrievable: true,
        },
        configuration: {
          supportedModes: [
            'AUTO',
            // 'HEAT',
            // 'COOL',
            // 'OFF'
          ],
          supportsScheduling: false,
        },
      },
      {
        type: 'AlexaInterface',
        interface: 'Alexa.TemperatureSensor',
        version: '3',
        properties: {
          supported: [
            {
              name: 'temperature',
            },
          ],
          proactivelyReported: true,
          retrievable: true,
        },
      },
      {
        type: 'AlexaInterface',
        interface: 'Alexa',
        version: '3',
      },
    ],
  },
}
