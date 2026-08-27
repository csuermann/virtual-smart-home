import * as AWS from 'aws-sdk'
import dayjs = require('dayjs')
import * as log from 'log'
import {
  fetchFreshAccessToken,
  PartialUserRecord,
  UserRecord,
} from './Authorization'
import { Device } from './Device'
import { Plan, PlanName } from './Plan'

AWS.config.update({ region: process.env.VSH_IOT_REGION })

export const docClient = new AWS.DynamoDB.DocumentClient({
  apiVersion: '2012-08-10',
})

// The VSH table has TTL enabled on 'deleteAtUnixTime' (see cloudFormation-eu-west-1.yml).
// Only TOKEN records carry that attribute, which is why an expired TOKEN record leaves
// the user's THING#/DEVICE# records behind.
const TOKEN_TTL_DAYS = 60

// Renew the TTL once it has decayed below this, so that a read only triggers a write
// every ~15 days per user instead of on every single request.
const TOKEN_TTL_RENEW_BELOW_DAYS = 45

export function upsertTokens(
  { userId, accessToken, refreshToken, email, skillRegion }: UserRecord,
  expiryInSec
): Promise<any> {
  let UpdateExpression =
    'set updatedAt = :c, accessTokenExpiry = :e, accessToken = :a, refreshToken = :r, deleteAtUnixTime = :ttl'
  let ExpressionAttributeValues = {
    ':c': dayjs().toISOString(),
    ':e': dayjs().add(expiryInSec, 'second').toISOString(),
    ':a': accessToken,
    ':r': refreshToken,
    ':ttl': dayjs().add(TOKEN_TTL_DAYS, 'day').unix(),
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
    TableName: 'VSH',
    Key: {
      PK: `USER#${userId}`,
      SK: 'TOKEN',
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

export function postponeTokenDeletion(
  userId: string,
  daysFromNow: number
): Promise<number> {
  const deleteAtUnixTime = dayjs().add(daysFromNow, 'day').unix()

  const params = {
    TableName: 'VSH',
    Key: {
      PK: `USER#${userId}`,
      SK: 'TOKEN',
    },
    UpdateExpression: 'set deleteAtUnixTime = :ttl',
    // never resurrect an already expired record: an update without this condition
    // would create a TOKEN record holding nothing but a TTL, which getUserRecord()
    // would then happily return as a token-less user.
    ConditionExpression: 'attribute_exists(PK)',
    ExpressionAttributeValues: {
      ':ttl': deleteAtUnixTime,
    },
  }

  return new Promise((resolve, reject) => {
    docClient.update(params, function (err) {
      if (err) {
        return reject(err)
      } else {
        return resolve(deleteAtUnixTime)
      }
    })
  })
}

export function updateUserRecord(partialUser: PartialUserRecord): Promise<any> {
  const updateRec = { ...partialUser }

  delete updateRec.userId

  updateRec.updatedAt = dayjs().toISOString()

  // touching the record (e.g. switching plan) counts as account activity, so extend
  // the TTL too - buying a subscription used to leave the old expiry untouched.
  updateRec.deleteAtUnixTime = dayjs().add(TOKEN_TTL_DAYS, 'day').unix()

  const UpdateExpression =
    'set ' +
    Object.keys(updateRec)
      .map((_field, idx) => `#n${idx} = :v${idx}`)
      .join(', ')

  const ExpressionAttributeNames = Object.keys(updateRec).reduce(
    (acc, attrName, idx) => {
      acc[`#n${idx}`] = attrName
      return acc
    },
    {}
  )

  const ExpressionAttributeValues = Object.keys(updateRec).reduce(
    (acc, attrName, idx) => {
      acc[`:v${idx}`] = updateRec[attrName]
      return acc
    },
    {}
  )

  const params = {
    TableName: 'VSH',
    Key: {
      PK: `USER#${partialUser.userId}`,
      SK: 'TOKEN',
    },
    UpdateExpression,
    ExpressionAttributeNames,
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

export async function getUserRecord(
  userId: string,
  refreshAccessToken: boolean = true
): Promise<UserRecord> {
  let params = {
    TableName: 'VSH',
    Key: {
      PK: `USER#${userId}`,
      SK: 'TOKEN',
    },
  }

  let data: any = await new Promise((resolve, reject) => {
    docClient.get(params, function (err, data) {
      if (err) {
        return reject(err)
      } else {
        if (data.Item) {
          return resolve(data.Item)
        } else {
          return reject(`no token record found for user ${userId}`)
        }
      }
    })
  })

  // Keep the record alive for as long as the account is in use. This must happen
  // *before* the refresh attempt below, which throws on failure: previously the TTL
  // was only ever renewed by upsertTokens(), so a user whose token refresh kept
  // failing - or who only ever hit paths passing refreshAccessToken=false - had their
  // TOKEN record silently deleted by DynamoDB 60 days later, taking their plan and
  // payment provider IDs with it and leaving the THING# records orphaned.
  if (
    !data.deleteAtUnixTime ||
    data.deleteAtUnixTime < dayjs().add(TOKEN_TTL_RENEW_BELOW_DAYS, 'day').unix()
  ) {
    try {
      data.deleteAtUnixTime = await postponeTokenDeletion(userId, TOKEN_TTL_DAYS)
    } catch (e) {
      // never fail the caller over a TTL renewal
      log.warn('failed to renew TTL of TOKEN record for user %s: %s', userId, e.message)
    }
  }

  if (refreshAccessToken) {
    const now = dayjs()
    const tokenExpiry = dayjs(data.accessTokenExpiry).subtract(15, 'second')

    if (tokenExpiry.isBefore(now)) {
      log.info('Token expired, attempting refresh', {
        userId: userId.substring(0, 8) + '...',
        tokenExpiry: tokenExpiry.toISOString(),
        currentTime: now.toISOString(),
        refreshTokenPrefix: data.refreshToken?.substring(0, 12) + '...'
      })

      try {
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
        
        log.info('Token refresh and database update successful', {
          userId: userId.substring(0, 8) + '...',
          hasNewAccessToken: !!newTokens.access_token,
          hasNewRefreshToken: !!newTokens.refresh_token,
          newExpiresIn: newTokens.expires_in
        })
      } catch (error) {
        log.error('Token refresh failed in getUserRecord', {
          userId: userId.substring(0, 8) + '...',
          errorName: error.name,
          errorMessage: error.message,
          tokenExpiry: tokenExpiry.toISOString(),
          refreshTokenPrefix: data.refreshToken?.substring(0, 12) + '...',
          originalError: error.originalError?.message,
          status: error.status,
          responseData: error.responseData
        })
        
        // Re-throw with additional context for upstream handlers
        const contextualError = new Error(`Token refresh failed for user ${userId.substring(0, 8)}...: ${error.message}`)
        contextualError.name = 'UserTokenRefreshError'
        ;(contextualError as any).userId = userId
        ;(contextualError as any).originalError = error
        ;(contextualError as any).tokenExpiry = tokenExpiry.toISOString()
        
        throw contextualError
      }
    } else {
      log.debug('Token still valid, no refresh needed', {
        userId: userId.substring(0, 8) + '...',
        tokenExpiry: tokenExpiry.toISOString(),
        currentTime: now.toISOString(),
        timeUntilExpiry: tokenExpiry.diff(now, 'seconds') + ' seconds'
      })
    }
  }

  if (!data.skillRegion) {
    data.skillRegion = process.env.VSH_IOT_REGION
  }

  data.isBlocked = !data.isBlocked ? false : true

  data.plan = data.plan ?? PlanName.FREE

  if (!data.allowedDeviceCount) {
    const plan = new Plan(data.plan as PlanName)
    data.allowedDeviceCount = plan.allowedDeviceCount
  }

  return data
}

export function upsertDevice({
  userId,
  deviceId,
  friendlyName,
  template,
  retrievable,
  thingId,
}): Promise<any> {
  let params = {
    TableName: 'VSH',
    Key: {
      PK: `USER#${userId}`,
      SK: `THING#${thingId}#DEVICE#${deviceId}`,
    },
    UpdateExpression:
      'set friendlyName = :fn, template = :te, retrievable = :rt, thingId = :th, deviceId = :de, updatedAt = :ua',
    ExpressionAttributeValues: {
      ':fn': friendlyName,
      ':te': template,
      ':rt': retrievable ? true : false,
      ':th': thingId,
      ':de': deviceId,
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
    TableName: 'VSH',
    Key: {
      PK: `USER#${userId}`,
      SK: `THING#${thingId}#DEVICE#${deviceId}`,
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
    TableName: 'VSH',
    KeyConditionExpression: 'PK = :pk and begins_with(SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': `USER#${userId}`,
      ':sk': 'THING',
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

  // ensure 'retrievable' attribute is present (old records in DB might not have it yet):
  devices = devices.map((device) => {
    device.retrievable = device.retrievable ?? false
    return device
  })

  return devices as Device[]
}

export async function getDeviceCountOfUser({
  userId,
  excludeThingId,
}: {
  userId: string
  excludeThingId: string
}): Promise<number> {
  return (await getDevicesOfUser(userId)).filter(
    (device) => device.thingId !== excludeThingId
  ).length
}

export async function getDevicesOfThing(
  userId: string,
  thingId: string
): Promise<Device[]> {
  let params = {
    TableName: 'VSH',
    KeyConditionExpression: 'PK = :pk and begins_with(SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': `USER#${userId}`,
      ':sk': `THING#${thingId}`,
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

  // ensure 'retrievable' attribute is present (old records in DB might not have it yet):
  devices = devices.map((device) => {
    device.retrievable = device.retrievable ?? false
    return device
  })

  return devices as Device[]
}

export async function getThingsOfUser(userId: string) {
  const things: Set<string> = new Set()
  const devices = await getDevicesOfUser(userId)

  return [...devices.reduce((acc, curr) => acc.add(curr.thingId), things)]
}
