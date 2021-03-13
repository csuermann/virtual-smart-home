import Axios, { AxiosResponse, AxiosError } from 'axios'
import * as aws4 from 'aws4'
import * as dayjs from 'dayjs'

export interface Shadow {
  state: {
    desired: {
      [index: string]: any
    }
    reported: {
      [index: string]: any
    }
  }
}

async function fetchShadow(path: string): Promise<Shadow | boolean> {
  let opts: any = {
    host: process.env.VSH_IOT_ENDPOINT, //'a1pv0eq8s016ut-ats.iot.eu-west-1.amazonaws.com'
    path: path,
    service: 'iotdata',
    region: process.env.VSH_IOT_REGION, //'eu-west-1'
  }

  aws4.sign(opts)

  // console.log(
  //   'FETCHING SHADOW:::',
  //   `https://${opts.host}${opts.path}`,
  //   opts.headers
  // )

  const response: AxiosResponse = await Axios.get(
    `https://${opts.host}${opts.path}`,
    {
      headers: opts.headers,
      validateStatus: (status) => status == 200 || status == 404,
    }
  )

  if (response.status == 200) {
    return response.data
  }

  return false
}

export function fetchThingShadow(thingId: string): Promise<Shadow | boolean> {
  return fetchShadow(`/things/${thingId}/shadow`)
}

export function fetchDeviceShadow(
  thingId: string,
  endpointId: string
): Promise<Shadow | boolean> {
  return fetchShadow(`/things/${thingId}/shadow?name=${endpointId}`)
}

export async function buildPropertiesFromShadow({
  thingId,
  endpointId,
  lightMode = 'from_shadow',
  deviceShadow = undefined,
  includeConnectivity = true,
}: {
  thingId: string
  endpointId: string
  lightMode?: string
  deviceShadow?: any
  includeConnectivity?: boolean
}): Promise<any[]> {
  const nowString = new Date().toISOString()
  const properties = []

  try {
    if (!deviceShadow) {
      deviceShadow = await fetchDeviceShadow(thingId, endpointId)
    }

    if (!deviceShadow) {
      throw new Error('404 - shadow does not exist')
    }

    if (lightMode === 'from_shadow') {
      lightMode = deviceShadow.state.reported?.mode || 'temp'
    }

    if (deviceShadow.state.reported !== undefined) {
      const reported = deviceShadow.state.reported

      if (reported.hasOwnProperty('powerState')) {
        properties.push({
          namespace: 'Alexa.PowerController',
          name: 'powerState',
          value: reported.powerState,
          timeOfSample: dayjs().toISOString(),
          uncertaintyInMilliseconds: 500,
        })
      }

      if (reported.hasOwnProperty('brightness')) {
        properties.push({
          namespace: 'Alexa.BrightnessController',
          name: 'brightness',
          value: reported.brightness,
          timeOfSample: dayjs().toISOString(),
          uncertaintyInMilliseconds: 500,
        })
      }

      //if (deviceShadow.state.reported?.temperature) {
      if (reported.hasOwnProperty('temperature')) {
        properties.push({
          namespace: 'Alexa.TemperatureSensor',
          name: 'temperature',
          value: {
            value: reported.temperature,
            scale: reported.scale,
          },
          timeOfSample: dayjs().toISOString(),
          uncertaintyInMilliseconds: 500,
        })
      }

      if (reported.hasOwnProperty('targetTemperature')) {
        properties.push({
          namespace: 'Alexa.ThermostatController',
          name: 'targetSetpoint',
          value: {
            value: reported.targetTemperature,
            scale: reported.targetScale,
          },
          timeOfSample: dayjs().toISOString(),
          uncertaintyInMilliseconds: 500,
        })
      }

      if (reported.hasOwnProperty('speed')) {
        properties.push({
          namespace: 'Alexa.RangeController',
          name: 'rangeValue',
          instance: 'Fan.Speed',
          value: reported.speed,
          timeOfSample: dayjs().toISOString(),
          uncertaintyInMilliseconds: 500,
        })
      }

      if (reported.hasOwnProperty('percentage')) {
        properties.push({
          namespace: 'Alexa.RangeController',
          name: 'rangeValue',
          instance: 'Blind.Lift',
          value: reported.percentage,
          timeOfSample: dayjs().toISOString(),
          uncertaintyInMilliseconds: 500,
        })
      }

      // if (reported.hasOwnProperty('lockState')) {
      //   properties.push({
      //     namespace: 'Alexa.LockController',
      //     name: 'lockState',
      //     value: reported.lockState,
      //     timeOfSample: dayjs().toISOString(),
      //     uncertaintyInMilliseconds: 500,
      //   })
      // }

      if (
        reported.hasOwnProperty('colorTemperatureInKelvin') &&
        lightMode == 'temp'
      ) {
        properties.push({
          namespace: 'Alexa.ColorTemperatureController',
          name: 'colorTemperatureInKelvin',
          value: reported.colorTemperatureInKelvin,
          timeOfSample: dayjs().toISOString(),
          uncertaintyInMilliseconds: 500,
        })
      }

      if (reported.hasOwnProperty('color') && lightMode == 'hsb') {
        properties.push({
          namespace: 'Alexa.ColorController',
          name: 'color',
          value: {
            hue: reported.color.hue,
            saturation: reported.color.saturation,
            brightness: reported.color.brightness,
          },
          timeOfSample: dayjs().toISOString(),
          uncertaintyInMilliseconds: 500,
        })
      }

      if (reported.hasOwnProperty('mode')) {
        properties.push({
          namespace: 'Alexa.ModeController',
          name: 'mode',
          instance: reported.instance,
          value: reported.mode,
          timeOfSample: dayjs().toISOString(),
          uncertaintyInMilliseconds: 500,
        })
      }
    }

    if (includeConnectivity) {
      const thingShadow = (await fetchThingShadow(thingId)) as Shadow
      let isDeviceOnline = thingShadow.state.reported?.connected

      properties.push({
        namespace: 'Alexa.EndpointHealth',
        name: 'connectivity',
        value: { value: isDeviceOnline ? 'OK' : 'UNREACHABLE' },
        timeOfSample: nowString,
        uncertaintyInMilliseconds: 0,
      })
    }
  } catch (e) {
    console.log('shadow could not be retrieved: ' + e.message)

    properties.push({
      namespace: 'Alexa.EndpointHealth',
      name: 'connectivity',
      value: { value: 'UNREACHABLE' },
      timeOfSample: nowString,
      uncertaintyInMilliseconds: 0,
    })
  }

  return properties
}
