import AWS = require('aws-sdk')
import { MetricData, MetricDatum } from 'aws-sdk/clients/cloudwatch'

AWS.config.update({ region: process.env.VSH_IOT_REGION })

const iot = new AWS.Iot()
const cw = new AWS.CloudWatch()

const staleThingsCountQuery = () => {
  const timestampInPast =
    Math.floor(new Date().getTime() / 1000) - 60 * 60 * 24 * 30 //30 days ago
  return `thingName:vsht* AND connectivity.connected:false AND ((NOT shadow.reported.connected:*) OR shadow.metadata.reported.connected.timestamp < ${timestampInPast})`
}
const OnlineThingsCountQuery = () =>
  'thingName:vsht* AND connectivity.connected:true'
const OfflineThingsCountQuery = () =>
  'thingName:vsht* AND connectivity.connected:false'

async function getStats(
  query: string,
  metricName: string
): Promise<MetricDatum> {
  const params = {
    queryString: query,
  }

  return new Promise((resolve, reject) => {
    iot.getStatistics(params, function (err, data) {
      if (err) {
        reject(err)
      } else {
        resolve({
          MetricName: metricName,
          Dimensions: [],
          Unit: 'None',
          Value: data.statistics.count,
        })
      }
    })
  })
}

async function publishMetricData(data: MetricData): Promise<boolean> {
  var params = {
    MetricData: data,
    Namespace: 'VSH/FleetManagement',
  }

  return new Promise((resolve, reject) => {
    cw.putMetricData(params, function (err, data) {
      if (err) {
        reject(err)
      } else {
        resolve(true)
      }
    })
  })
}

export const metrics = async function (event, context) {
  const data = await Promise.all([
    getStats(staleThingsCountQuery(), 'staleThings'),
    getStats(OnlineThingsCountQuery(), 'onlineThings'),
    getStats(OfflineThingsCountQuery(), 'offlineThings'),
  ])

  try {
    await publishMetricData(data)
    console.log('published metric data::', data)
    return data
  } catch (e) {
    console.log('EXCEPTION::', e.message)
  }
}
