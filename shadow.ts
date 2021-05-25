import Axios, { AxiosResponse, AxiosError } from 'axios'
import * as aws4 from 'aws4'

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
