import * as serverless from 'serverless-http'
import * as express from 'express'
import * as cors from 'cors'
import { v4 as uuidv4 } from 'uuid'
import { encode, decode } from 'js-base64'

import { fetchProfile, proactivelyUndiscoverDevices } from './helper'
import AWS = require('aws-sdk')

import caCert from './caCert'
import { deleteDevice, getDevicesOfUser } from './db'
import { publish } from './mqtt'
import { isAllowedClientVersion, isLatestClientVersion } from './version'

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
    policyName: 'virtual-smart-home-things',
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

  console.log(`PROVISIONING REQUEST for client with version: ${vshVersion}`)

  if (!isAllowedClientVersion(vshVersion)) {
    console.log(
      `PROVISIONING FAILED: ${vshVersion} does not satisfy version constraints!`
    )

    res.status(400).send({
      error: 'Outdated VSH version! Please update to latest version!',
    })
  }

  try {
    const profile = await fetchProfile(req.body.accessToken)

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

    const response = {
      server: process.env.VSH_IOT_ENDPOINT, //'a1pv0eq8s016ut-ats.iot.eu-west-1.amazonaws.com'
      port: 8883,
      cert: encode(certificatePem),
      privateKey: encode(privateKey),
      caCert: encode(caCert),
      thingId: thingName, // we use the thingName as ID from here on...
      email: profile.email,
    }
    res.send(response)
  } catch (e) {
    console.log('PROVISIONING FAILED', e.message)
    res.status(400).send({ error: 'provisioning failed' })
  }
})

app.get('/check_version', async function (req, res) {
  const clientVersion: string = (req.body.vsh_version as string) || '0.0.0'
  const nodeRedVersion: string = (req.body.nr_version as string) || '0.0.0'

  const isAllowedVersion = isAllowedClientVersion(clientVersion)
  const isLatestVersion = isLatestClientVersion(clientVersion)
  const updateHint = isLatestVersion
    ? ''
    : 'Please update to the latest version of VSH!'

  res.send({
    isAllowedVersion,
    isLatestVersion,
    updateHint,
  })
})

app.get('/devices', async function (req, res) {
  if (!req.header('Authorization')) {
    res
      .status(400)
      .send({ error: 'missing accessToken in Authorization header' })
  }

  try {
    const accessToken = req.header('Authorization')
    const { user_id } = await fetchProfile(accessToken)
    const devices = await getDevicesOfUser(user_id)

    res.send(devices)
  } catch (e) {
    console.log('FETCHING DEVICE LIST FAILED', e.message)
    res.status(400).send({ error: 'fetching list of devices failed' })
  }
})

app.delete('/device', async function (req, res) {
  if (!req.header('Authorization')) {
    return res
      .status(400)
      .send({ error: 'missing accessToken in Authorization header' })
  }

  if (!req.body.thingId || !req.body.deviceId) {
    return res
      .status(400)
      .send({ error: 'missing thingId or deviceId in body' })
  }

  try {
    const accessToken = req.header('Authorization')
    const { user_id } = await fetchProfile(accessToken)
    const deleteResult = await deleteDevice({
      userId: user_id,
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
      await proactivelyUndiscoverDevices(user_id, [req.body.deviceId])
    }

    res.send({ status: 'OK' })
  } catch (e) {
    res.status(400).send({ error: 'operation failed' })
  }
})

export const provision = serverless(app)
