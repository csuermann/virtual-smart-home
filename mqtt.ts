import * as AWS from 'aws-sdk'

AWS.config.update({ region: process.env.VSH_IOT_REGION })

export function publish (topic: string, payload: Object, qos = 1) {
  const params = {
    topic,
    payload: JSON.stringify(payload),
    qos
  }

  const iotdata = new AWS.IotData({
    endpoint: 'a1pv0eq8s016ut-ats.iot.eu-west-1.amazonaws.com'
  })

  return new Promise((resolve, reject) => {
    iotdata.publish(params, function (err, data) {
      if (err) {
        return reject(err)
      } else {
        return resolve(data)
      }
    })
  })
}
