import * as serverless from 'serverless-http'
import * as express from 'express'
import * as logger from 'log-aws-lambda'
import AWS = require('aws-sdk')
import { getDevicesOfUser, getThingsOfUser, getUserRecord } from './db'
import { proactivelyRediscoverAllDevices } from './helper'
import { publish } from './mqtt'
import { switchToPlan } from './subscription'
import { PlanName } from './Plan'

logger()

AWS.config.update({ region: process.env.VSH_IOT_REGION })

const iot = new AWS.Iot()
const iotdata = new AWS.IotData({
  endpoint: process.env.VSH_IOT_ENDPOINT,
})
const cloudwatchlogs = new AWS.CloudWatchLogs()

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

async function startQuery(
  queryString: string,
  minutesBack: number,
  logGroupName: string
): Promise<string> {
  const now = Math.ceil(new Date().valueOf() / 1000)
  const startTime = now - minutesBack * 60
  const params = {
    endTime: now,
    queryString,
    startTime,
    limit: 500,
    logGroupName,
  }

  return new Promise((resolve, reject) => {
    cloudwatchlogs.startQuery(params, function (err, data) {
      if (err) {
        reject(err)
      } else {
        resolve(data.queryId)
      }
    })
  })
}

async function getQueryResult(
  queryId: string
): Promise<AWS.CloudWatchLogs.GetQueryResultsResponse> {
  const params = {
    queryId,
  }

  return new Promise((resolve, reject) => {
    cloudwatchlogs.getQueryResults(params, function (err, data) {
      if (err) {
        reject(err)
      } else {
        resolve(data)
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

async function wait(ms) {
  return new Promise((resolve, reject) => {
    setTimeout(resolve, ms)
  })
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
    account = await getUserRecord(thingDetails.attributes['userId'])
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
      userId: thingDetails.attributes['userId'],
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

app.get('/thing/:thingName/stats', async function (req, res) {
  const query = `stats count() as count by rule, endpointId, template, causeType
    | filter thingId = '${req.params.thingName}'
    | sort count desc
    | limit 250`

  try {
    const queryId = await startQuery(
      query,
      60 * 24, //1 day
      '/aws/lambda/virtual-smart-home-dev-backchannel'
    )

    type QueryStatusType =
      | 'Scheduled'
      | 'Running'
      | 'Complete'
      | 'Failed'
      | 'Cancelled'
      | 'Timeout'
      | 'Unknown'
    let queryStatus: QueryStatusType
    let queryResult: AWS.CloudWatchLogs.GetQueryResultsResponse

    do {
      await wait(1000)
      queryResult = await getQueryResult(queryId)
      queryStatus = (queryResult.status as QueryStatusType) ?? 'Unknown'
    } while (queryStatus == 'Running' || queryStatus == 'Scheduled')

    if (queryStatus !== 'Complete') {
      throw new Error('Query did not complete successfully')
    }

    const rows = queryResult.results.map((row) =>
      row.reduce((acc, item) => {
        acc[item.field] =
          item.field == 'count' ? parseInt(item.value) : item.value
        return acc
      }, {})
    )

    res.send({
      results: rows,
      matches: queryResult.statistics.recordsMatched,
    })
  } catch (err) {
    console.log(err)
    res.status(500).send(err.message)
  }
})

app.post('/thing/:thingName/rediscover', async function (req, res) {
  try {
    const thingDetails = await describeThing(req.params.thingName)
    const userId = thingDetails.attributes['userId']
    await proactivelyRediscoverAllDevices(userId)
    res.send({ result: 'ok' })
  } catch (err) {
    console.log(err)
    res.status(500).send(err.message)
  }
})

app.post('/thing/:thingName/restart', async function (req, res) {
  try {
    await publish(`vsh/${req.params.thingName}/service`, {
      operation: 'restart',
    })

    res.send({ result: 'ok' })
  } catch (err) {
    console.log(err)
    res.status(500).send(err.message)
  }
})

app.post('/thing/:thingName/kill', async function (req, res) {
  try {
    await publish(`vsh/${req.params.thingName}/service`, {
      operation: 'kill',
      reason: req.query.reason ?? 'killed by admin',
    })

    res.send({ result: 'ok' })
  } catch (err) {
    console.log(err)
    res.status(500).send(err.message)
  }
})

app.get('/user/:userId/info', async function (req, res) {
  try {
    const userRecord = await getUserRecord(req.params.userId)
    const account = {
      ...userRecord,
      userId: req.params.userId,
      SK: undefined,
      PK: undefined,
      accessToken: undefined,
      refreshToken: undefined,
      deleteAtUnixTime: new Date(
        userRecord.deleteAtUnixTime * 1000
      ).toISOString(),
    }

    const devices = (await getDevicesOfUser(req.params.userId)).reduce(
      (acc, device) => {
        const key = device.thingId
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
      },
      {}
    )

    res.send({
      account,
      devices,
    })
  } catch (err) {
    console.log(err)
    res.status(500).send(err.message)
  }
})

app.post('/user/:userId/restartThings', async function (req, res) {
  try {
    const thingIds = await getThingsOfUser(req.params.userId)
    for (const thingId of thingIds) {
      await publish(`vsh/${thingId}/service`, {
        operation: 'restart',
      })
    }
    res.send({ result: 'ok', thingIds })
  } catch (err) {
    console.log(err)
    res.status(500).send(err.message)
  }
})

app.post('/user/:userId/switchToPlan/:planName', async function (req, res) {
  await switchToPlan(req.params.userId, req.params.planName as PlanName)
  res.send({ result: 'ok' })
})

app.post('/thing/:thingName/blockUser', async function (req, res) {
  res.status(500).send('not yet implemented')
})

export const admin = serverless(app)
