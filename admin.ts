import * as serverless from 'serverless-http'
import * as express from 'express'
// import { v4 as uuidv4 } from 'uuid'
// import { encode, decode } from 'js-base64'
import * as log from 'log'
import * as logger from 'log-aws-lambda'

// import { fetchProfile, proactivelyUndiscoverDevices } from './helper'
import AWS = require('aws-sdk')
import { getDevicesOfUser, getStoredTokenRecord } from './db'

// import caCert from './caCert'
// import { deleteDevice, getDevicesOfUser, getStoredTokenRecord } from './db'
// import { publish } from './mqtt'

logger()

AWS.config.update({ region: process.env.VSH_IOT_REGION })

const iot = new AWS.Iot()
const iotdata = new AWS.IotData({
  endpoint: process.env.VSH_IOT_ENDPOINT,
})

async function describeThing(
  thingName
): Promise<AWS.Iot.DescribeThingResponse> {
  const params = {
    thingName,
  }

  return new Promise((resolve, reject) => {
    iot.describeThing(params, function (err, data) {
      if (err) {
        reject(err)
      } else {
        resolve(data)
      }
    })
  })
}

async function getThingShadow(
  thingName
): Promise<AWS.IotData.GetThingShadowResponse> {
  const params = {
    thingName,
  }

  return new Promise((resolve, reject) => {
    iotdata.getThingShadow(params, function (err, data) {
      if (err) {
        reject(err)
      } else {
        resolve(JSON.parse(data.payload as string))
      }
    })
  })
}

async function listViolationEvents(
  thingName
): Promise<AWS.Iot.ViolationEvent[]> {
  const params = {
    endTime: new Date() /* required */,
    startTime: new Date(
      new Date().getTime() - 1000 * 60 * 60 * 24 * 7
    ) /* required */, // 1000*60*60*24*7 == 7 days
    maxResults: 50,
    thingName,
  }

  return new Promise((resolve, reject) => {
    iot.listViolationEvents(params, function (err, data) {
      if (err) {
        reject(err)
      } else {
        resolve(data.violationEvents)
      }
    })
  })
}

function makeTimestampsReadable(obj) {
  let newObj = {}
  for (var ogKey in obj) {
    if (ogKey === 'timestamp') {
      newObj[ogKey] = new Date(obj[ogKey] * 1000).toISOString()
    } else if (typeof obj[ogKey] === 'object') {
      newObj[ogKey] = makeTimestampsReadable(obj[ogKey])
    } else {
      newObj[ogKey] = obj[ogKey]
    }
  }
  return newObj
}

// --------

const app = express()

app.use(express.urlencoded({ extended: true })) // for parsing application/x-www-form-urlencoded
app.use(express.json()) // for parsing application/json

app.use((req, res, next) => {
  if (req.headers['authorization'] !== process.env.VSH_ADMIN_API_KEY) {
    return res.sendStatus(401)
  }
  next()
})

app.get('/thing/:thingName/info', async function (req, res) {
  let thingDetails: AWS.Iot.DescribeThingResponse
  let thingShadow: AWS.IotData.Types.GetThingShadowResponse
  let account
  let devicesOfUser
  let devices
  let violations

  try {
    thingDetails = await describeThing(req.params.thingName)
    thingShadow = await getThingShadow(req.params.thingName)
    account = await getStoredTokenRecord(thingDetails.attributes['userId'])
    devicesOfUser = await getDevicesOfUser(thingDetails.attributes['userId'])
    devices = devicesOfUser.reduce((acc, device) => {
      const key =
        device.thingId == req.params.thingName ? '_THIS_' : device.thingId
      if (!acc[key]) {
        acc[key] = []
      }
      acc[key].push({
        ...device,
        SK: undefined,
        PK: undefined,
        thingId: undefined,
      })
      return acc
    }, {})
    violations = (await listViolationEvents(req.params.thingName)).map(
      (violation) => {
        return {
          alert: violation.behavior.name,
          time: violation.violationEventTime.toISOString(),
          type: violation.violationEventType,
          value: violation.metricValue.count,
        }
      }
    )
  } catch (e) {
    return res.sendStatus(404)
  }

  res.send({
    thingName: req.params.thingName,
    createdAt: new Date(
      parseInt(thingDetails.attributes['createdAt']) * 1000
    ).toISOString(),
    shadow: makeTimestampsReadable(thingShadow),
    account: {
      ...account,
      SK: undefined,
      PK: undefined,
      accessToken: undefined,
      refreshToken: undefined,
      deleteAtUnixTime: new Date(account.deleteAtUnixTime * 1000).toISOString(),
    },
    deviceCount: devicesOfUser.length,
    devices,
    violations_7d: violations,
  })
})

app.post('/thing/:thingId/blockUser', async function (req, res) {
  res.status(500).send('not yet implemented')
})

export const admin = serverless(app)
