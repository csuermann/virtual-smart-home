import * as AWS from 'aws-sdk'
import dayjs = require('dayjs')
import { fetchFreshAccessToken, TokenRecord } from './Authorization'
import Device from './Device'

AWS.config.update({ region: process.env.VSH_IOT_REGION })

export const docClient = new AWS.DynamoDB.DocumentClient({
  apiVersion: '2012-08-10',
})

export function upsertTokens(
  { userId, accessToken, refreshToken, email, skillRegion }: TokenRecord,
  expiryInSec
): Promise<any> {
  let UpdateExpression =
    'set updatedAt = :c, accessTokenExpiry = :e, accessToken = :a, refreshToken = :r'
  let ExpressionAttributeValues = {
    ':c': dayjs().toISOString(),
    ':e': dayjs().add(expiryInSec, 'second').toISOString(),
    ':a': accessToken,
    ':r': refreshToken,
  }

  if (email) {
    UpdateExpression = UpdateExpression + ', email = :m'
    ExpressionAttributeValues[':m'] = email
  }

  if (skillRegion) {
    UpdateExpression = UpdateExpression + ', skillRegion = :sr'
    ExpressionAttributeValues[':sr'] = skillRegion
  }

  let params = {
    TableName: 'vsh_tokens',
    Key: {
      userId: userId,
    },
    UpdateExpression,
    ExpressionAttributeValues,
  }

  return new Promise((resolve, reject) => {
    docClient.update(params, function (err, data) {
      if (err) {
        return reject(err)
      } else {
        return resolve(data)
      }
    })
  })
}

export async function getStoredTokenRecord(
  userId: string
): Promise<TokenRecord> {
  let params = {
    TableName: 'vsh_tokens',
    Key: { userId: userId },
  }

  let data: any = await new Promise((resolve, reject) => {
    docClient.get(params, function (err, data) {
      if (err) {
        return reject(err)
      } else {
        return resolve(data.Item)
      }
    })
  })

  const now = dayjs()
  const tokenExpiry = dayjs(data.accessTokenExpiry).subtract(15, 'second')

  if (tokenExpiry.isBefore(now)) {
    const newTokens = await fetchFreshAccessToken(data.refreshToken)

    await upsertTokens(
      {
        userId,
        accessToken: newTokens.access_token,
        refreshToken: newTokens.refresh_token,
      },
      newTokens.expires_in
    )

    data.accessToken = newTokens.access_token
  }

  if (!data.skillRegion) {
    data.skillRegion = 'eu-west-1'
  }

  return data
}

export function upsertDevice({
  userId,
  deviceId,
  friendlyName,
  template,
  thingId,
}): Promise<any> {
  let params = {
    TableName: 'vsh_devices',
    Key: {
      deviceId: deviceId,
      userId: userId,
    },
    UpdateExpression:
      'set friendlyName = :fn, template = :te, thingId = :th, updatedAt = :ua',
    ExpressionAttributeValues: {
      ':fn': friendlyName,
      ':te': template,
      ':th': thingId,
      ':ua': dayjs().toISOString(),
    },
  }

  return new Promise((resolve, reject) => {
    docClient.update(params, function (err, data) {
      if (err) {
        return reject(err)
      } else {
        return resolve(data)
      }
    })
  })
}

export function deleteDevice({ userId, deviceId, thingId }): Promise<any> {
  let params = {
    TableName: 'vsh_devices',
    Key: {
      deviceId: deviceId,
      userId: userId,
    },
    ConditionExpression: 'thingId = :th',
    ExpressionAttributeValues: {
      ':th': thingId,
    },
    ReturnValues: 'ALL_OLD',
  }

  return new Promise((resolve, reject) => {
    docClient.delete(params, function (err, data) {
      if (err) {
        return reject(err)
      } else {
        return resolve(data)
      }
    })
  })
}

export async function getDevicesOfUser(userId: string): Promise<Device[]> {
  let params = {
    TableName: 'vsh_devices',
    IndexName: 'userId-index',
    KeyConditionExpression: 'userId = :i',
    ExpressionAttributeValues: {
      ':i': userId,
    },
  }

  let devices: any = await new Promise((resolve, reject) => {
    docClient.query(params, function (err, data) {
      if (err) {
        return reject(err)
      } else {
        return resolve(data.Items)
      }
    })
  })

  return devices as Device[]
}

export async function getDevicesOfThing(thingId: string): Promise<Device[]> {
  let params = {
    TableName: 'vsh_devices',
    IndexName: 'thingId-index',
    KeyConditionExpression: 'thingId = :i',
    ExpressionAttributeValues: {
      ':i': thingId,
    },
  }

  let devices: any = await new Promise((resolve, reject) => {
    docClient.query(params, function (err, data) {
      if (err) {
        return reject(err)
      } else {
        return resolve(data.Items)
      }
    })
  })

  return devices as Device[]
}
