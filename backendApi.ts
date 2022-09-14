import * as serverless from 'serverless-http'
import * as express from 'express'
import * as cors from 'cors'
import { v4 as uuidv4 } from 'uuid'
import { encode, decode } from 'js-base64'
import * as log from 'log'
import * as logger from 'log-aws-lambda'
import * as jwt from 'jsonwebtoken'
import Stripe from 'stripe'

import { fetchProfile, proactivelyUndiscoverDevices } from './helper'
import AWS = require('aws-sdk')

import caCert from './caCert'
import { deleteDevice, getDevicesOfUser, getUserRecord } from './db'
import { publish } from './mqtt'
import {
  isAllowedClientVersion,
  isFeatureSupportedByClient,
  isLatestClientVersion,
} from './version'
import { Plan, PlanName } from './Plan'
import {
  handleCheckoutSessionCompleted,
  handleCustomerSubscriptionDeleted,
  handleInvoicePaymentFailed,
} from './subscription'

const stripe = new Stripe(process.env.STRIPE_API_KEY, {
  apiVersion: '2022-08-01',
})

interface AuthenticatedRequest extends express.Request {
  userId: string
  jwt?: { [key: string]: any }
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

app.post(
  '/stripe_webhook',
  async function (req, res) {
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET
    const sig = req.headers['stripe-signature']

    let event: any

    try {
      event = stripe.webhooks.constructEvent((req as any).rawBody, sig, endpointSecret)
    } catch (err) {
      res.status(400).send(`Webhook Error: ${err.message}`)
      return
    }

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed': //https://stripe.com/docs/api/checkout/sessions/object
        await handleCheckoutSessionCompleted(event.data.object)
        break
      case 'customer.subscription.deleted': //https://stripe.com/docs/api/subscriptions/object
        await handleCustomerSubscriptionDeleted(event.data.object)
        break
      case 'invoice.payment_failed': //https://stripe.com/docs/api/invoices/object
        await handleInvoicePaymentFailed(event.data.object)
        break
      // ... handle other event types
      default:
        console.log(`Unhandled event type ${event.type}`)
    }

    // Return a 200 response to acknowledge receipt of the event
    res.send()
  }
)

//applying middlewares for all endpoints below these lines!
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

    const { isBlocked } = await getUserRecord(profile.user_id)

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

  const freePlan = new Plan(PlanName.FREE)

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

const needsTokenForAudience = function (audience: string) {
  return function (
    req: AuthenticatedRequest,
    res: express.Response,
    next: express.NextFunction
  ) {
    if (!req.query.token) {
      return res.status(400).send({ error: 'missing query parameter: token' })
    }

    try {
      const decodedJwt = jwt.verify(
        req.query.token as string,
        process.env.HASH_SECRET,
        {
          audience,
        }
      ) as jwt.JwtPayload
      req.userId = decodedJwt.sub
      req.jwt = decodedJwt
      next()
    } catch (e) {
      log.error('AUTHENTICATION FAILED: %s', e.message)
      res.status(400).send({ error: 'authentication failed' })
    }
  }
}

app.get('/plan', needsAuth, async function (req: AuthenticatedRequest, res) {
  try {
    const { allowedDeviceCount, plan } = await getUserRecord(req.userId, false)
    res.send({
      allowedDeviceCount,
      plan,
      subcriptionToken: jwt.sign(
        {
          aud: 'subscription',
          sub: req.userId,
        },
        process.env.HASH_SECRET,
        { expiresIn: '30m' }
      ),
      availablePlans: [
        {
          name: 'VSH Pro',
          features: [
            'control up to 200 virtual devices',
            'device status queryable from Alexa app',
            'cancellable at any time',
          ],
          priceTags: [
            {
              name: 'vsh-pro-yearly',
              tag: '12 EUR per year',
              checkoutToken: jwt.sign(
                {
                  aud: 'checkout',
                  sub: req.userId,
                  priceId: 'price_1LgSpdC3eSYquofeNk3MClG1',
                },
                process.env.HASH_SECRET,
                { expiresIn: '30m' }
              ),
            },
            {
              name: 'vsh-pro-monthly',
              tag: '1.49 EUR per month',
              checkoutToken: jwt.sign(
                {
                  aud: 'checkout',
                  sub: req.userId,
                  priceId: 'price_1LgSpdC3eSYquofegmyiZdQv',
                },
                process.env.HASH_SECRET,
                { expiresIn: '30m' }
              ),
            },
          ],
        },
      ],
    })
  } catch (e) {
    log.error('FETCHING PLAN INFO FAILED: %s', e.message)
    res.status(400).send({ error: 'fetching plan info failed' })
  }
})

app.get(
  '/checkout',
  needsTokenForAudience('checkout'),
  async function (req: AuthenticatedRequest, res) {
    const { stripeCustomerId, email } = await getUserRecord(req.userId)

    //init Stripe checkout session and redirect to their checkout experience
    const stripeSession = await stripe.checkout.sessions.create({
      mode: 'subscription',
      client_reference_id: req.userId,
      ...(stripeCustomerId && { customer: stripeCustomerId }), //include customer property if stripeCustomerId is truthy
      customer_email: email,
      line_items: [
        {
          price: req.jwt.priceId,
          quantity: 1,
        },
      ],
      // {CHECKOUT_SESSION_ID} is a string literal; do not change it!
      // the actual Session ID is returned in the query parameter when your customer
      // is redirected to the success page.
      success_url: `https://${req.hostname}/dev/stripe_redirect?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `https://${req.hostname}/dev/stripe_redirect?cancelled=true`,
    })

    // Redirect to the URL returned on the Checkout Session.
    res.redirect(303, stripeSession.url)
  }
)

app.get('/stripe_redirect', async function (req: AuthenticatedRequest, res) {
  //users get redirected to this endpoint after completing or cancelling the Stripe checkout flow!
  res.send('Thank you! You can now close this window.')
})

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

export const server = serverless(app, {
  request(request, event, _context) {
    request.rawBody = event.rawBody;
  }})
