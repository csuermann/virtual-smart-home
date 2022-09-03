import * as serverless from 'serverless-http'
import * as express from 'express'
import * as cors from 'cors'
import { v4 as uuidv4 } from 'uuid'
import { encode, decode } from 'js-base64'
import * as log from 'log'
import * as logger from 'log-aws-lambda'
import * as jwt from 'jsonwebtoken'

import { fetchProfile, proactivelyUndiscoverDevices } from './helper'
import AWS = require('aws-sdk')

import caCert from './caCert'
import { deleteDevice, getDevicesOfUser, getStoredTokenRecord } from './db'
import { publish } from './mqtt'
import {
  isAllowedClientVersion,
  isFeatureSupportedByClient,
  isLatestClientVersion,
} from './version'
import { Plan, PlanName } from './Plan'

interface AuthenticatedRequest extends express.Request {
  userId: string
}

logger()

AWS.config.update({ region: process.env.VSH_IOT_REGION })

const iot = new AWS.Iot()

async function createKeysAndCertificate(): Promise<any> {
  const params = {
    setAsActive: true,
  }

  return new Promise((resolve, reject) => {
    iot.createKeysAndCertificate(params, function (err, data) {
      if (err) {
        reject(err)
      } else {
        resolve({
          certificateArn: data.certificateArn,
          certificateId: data.certificateId,
          certificatePem: data.certificatePem,
          publicKey: data.keyPair.PublicKey,
          privateKey: data.keyPair.PrivateKey,
        })
      }
    })
  })
}

async function createThing(userId: string, email: string): Promise<any> {
  const params = {
    thingName: 'vsht-' + uuidv4(),
    attributePayload: {
      attributes: {
        userId: userId,
        createdAt: '' + Math.floor(new Date().getTime() / 1000), //needs to be a string
      },
    },
    billingGroupName: 'virtual-smart-home-billing-group',
    thingTypeName: 'virtual-smart-home-type',
  }

  return new Promise((resolve, reject) => {
    iot.createThing(params, function (err, data) {
      if (err) {
        reject(err)
      } else {
        resolve({
          thingName: data.thingName,
          thingArn: data.thingArn,
          thingId: data.thingId,
        })
      }
    })
  })
}

async function attachPremadePolicyToCertificate(
  certificateArn: string
): Promise<any> {
  const params = {
    policyName: process.env.VSH_IOT_POLICY,
    principal: certificateArn,
  }

  return new Promise((resolve, reject) => {
    iot.attachPrincipalPolicy(params, function (err, data) {
      if (err) {
        reject(err)
      } else {
        resolve(true)
      }
    })
  })
}

async function attachCertificateToThing(
  certificateArn: string,
  thingName: string
): Promise<any> {
  const params = {
    principal: certificateArn,
    thingName: thingName,
  }

  return new Promise((resolve, reject) => {
    iot.attachThingPrincipal(params, function (err, data) {
      if (err) {
        reject(err)
      } else {
        resolve(true)
      }
    })
  })
}

async function addThingToThingGroup(
  thingName: string,
  thingGroupName: string
): Promise<any> {
  const params = {
    thingGroupName,
    thingName,
  }

  return new Promise((resolve, reject) => {
    iot.addThingToThingGroup(params, function (err, data) {
      if (err) {
        reject(err)
      } else {
        resolve(true)
      }
    })
  })
}

const app = express()

app.use(cors())
app.use(express.urlencoded({ extended: true })) // for parsing application/x-www-form-urlencoded
app.use(express.json()) // for parsing application/json

app.post('/provision', async function (req, res) {
  if (!req.body.accessToken) {
    return res.status(400).send({ error: 'invalid request structure' })
  }

  // vsh clients send version info since v1.15.1
  const vshVersion = req.body.vshVersion || '0.0.0'

  log.info('PROVISIONING REQUEST for client with version %s', vshVersion)

  if (!isFeatureSupportedByClient('provision', vshVersion)) {
    log.error(
      'PROVISIONING FAILED: %s does not satisfy version constraints!',
      vshVersion
    )

    res.status(400).send({
      error: 'Outdated VSH version! Please update to latest version!',
    })
  }

  try {
    const profile = await fetchProfile(req.body.accessToken)

    const { isBlocked } = await getStoredTokenRecord(profile.user_id)

    if (isBlocked) {
      throw new Error(
        `found attribute 'isBlocked' for userId ${profile.user_id} / ${profile.email}`
      )
    }

    const { thingName, thingArn, thingId } = await createThing(
      profile.user_id,
      profile.email
    )

    const {
      certificateArn,
      certificateId,
      certificatePem,
      publicKey,
      privateKey,
    } = await createKeysAndCertificate()

    await attachPremadePolicyToCertificate(certificateArn)

    await attachCertificateToThing(certificateArn, thingName)

    await addThingToThingGroup(thingName, 'virtual-smart-home-things')

    const vshJwt = jwt.sign(
      {
        thingId: thingName,
        email: profile.email,
        sub: profile.user_id,
      },
      process.env.HASH_SECRET
    )

    const response = {
      server: process.env.VSH_IOT_ENDPOINT, //'a1pv0eq8s016ut-ats.iot.eu-west-1.amazonaws.com'
      port: 8883,
      cert: encode(certificatePem),
      privateKey: encode(privateKey),
      caCert: encode(caCert),
      thingId: thingName, // we use the thingName as ID from here on...
      email: profile.email,
      vshJwt,
    }

    log.debug('PROVISIONING RESPONSE: %j', response)
    res.send(response)
  } catch (e) {
    log.error('PROVISIONING FAILED: %s', e.message)
    res.status(400).send({
      error: 'provisioning failed! Try (re)-enabling the VSH Alexa skill!',
    })
  }
})

app.get('/check_version', async function (req, res) {
  log.debug('/check_version with query: %j', req.query)

  const clientVersion: string = (req.query.version as string) || '0.0.0'
  const nodeRedVersion: string = (req.query.nr_version as string) || '0.0.0'
  const thingId: string = (req.query.thingId as string) || null

  const isAllowedVersion = isAllowedClientVersion(clientVersion)
  const isLatestVersion = isLatestClientVersion(clientVersion)
  const updateHint = isLatestVersion
    ? ''
    : 'Please update to the latest version of VSH!'

  const freePlan = new Plan(PlanName.free)

  const response = {
    isAllowedVersion,
    isLatestVersion,
    updateHint,
    allowedDeviceCount: freePlan.allowedDeviceCount, //deprecated as of v2.8.0. Leave here for backwards compatibility
  }

  log.debug('RESPONSE: %j', response)
  res.send(response)
})

const needsAuth = async function (
  req: AuthenticatedRequest,
  res: express.Response,
  next: express.NextFunction
) {
  if (!req.header('Authorization')) {
    return res
      .status(400)
      .send({ error: 'missing accessToken in Authorization header' })
  }

  const accessToken: string = req.header('Authorization')

  try {
    if (accessToken.startsWith('Bearer ')) {
      //new way of authentication via vsh JWT!
      const decodedJwt = jwt.verify(
        accessToken.substring(7),
        process.env.HASH_SECRET
      ) as jwt.JwtPayload
      req.userId = decodedJwt.sub
      next()
    } else {
      //deprecated way of authentication via Amazon access token!
      const { user_id } = await fetchProfile(accessToken)
      req.userId = user_id
      next()
    }
  } catch (e) {
    log.error('AUTHENTICATION FAILED: %s', e.message)
    res.status(400).send({ error: 'authentication failed' })
  }
}

app.get('/devices', needsAuth, async function (req: AuthenticatedRequest, res) {
  try {
    const devices = await getDevicesOfUser(req.userId)
    res.send(devices)
  } catch (e) {
    log.error('FETCHING DEVICE LIST FAILED: %s', e.message)
    res.status(400).send({ error: 'fetching list of devices failed' })
  }
})

app.delete(
  '/device',
  needsAuth,
  async function (req: AuthenticatedRequest, res) {
    if (!req.body.thingId || !req.body.deviceId) {
      return res
        .status(400)
        .send({ error: 'missing thingId or deviceId in body' })
    }

    try {
      const deleteResult = await deleteDevice({
        userId: req.userId,
        deviceId: req.body.deviceId,
        thingId: req.body.thingId,
      })

      //make sure that the device was really deleted from db (as this is guarded with userId)
      if (deleteResult.Attributes.deviceId == req.body.deviceId) {
        //..only then delete the shadow
        await publish(
          `$aws/things/${req.body.thingId}/shadow/name/${req.body.deviceId}/delete`,
          {}
        )

        //tell Alexa that the device was deleted, too:
        await proactivelyUndiscoverDevices(req.userId, [req.body.deviceId])
      }

      res.send({ status: 'OK' })
    } catch (e) {
      res.status(400).send({ error: 'operation failed' })
    }
  }
)

export const provision = serverless(app)
