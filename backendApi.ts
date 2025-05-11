import * as serverless from 'serverless-http'
import * as express from 'express'
import * as cors from 'cors'
import { v4 as uuidv4 } from 'uuid'
import { encode, decode } from 'js-base64'
import * as log from 'log'
import * as logger from 'log-aws-lambda'
import * as jwt from 'jsonwebtoken'
import Stripe from 'stripe'
import { Paddle, EventName as PaddleEventName } from '@paddle/paddle-node-sdk'

import { fetchProfile, isProd, proactivelyUndiscoverDevices } from './helper'
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
  handleInvoicePaymentSucceeded,
} from './subscription'

const stripe = new Stripe(process.env.STRIPE_API_KEY, {
  apiVersion: '2023-08-16',
})

const paddle = new Paddle(process.env.PADDLE_API_KEY)

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

app.post('/stripe_webhook', async function (req, res) {
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET
  const sig = req.headers['stripe-signature']

  let event: any

  try {
    event = stripe.webhooks.constructEvent(
      (req as any).rawBody, //rawBody is important!
      sig,
      endpointSecret
    )
  } catch (err) {
    res.status(400).send(`Webhook Error: ${err.message}`)
    return
  }

  // Handle the event
  try {
    log.info('stripe_webhook received! %j', event)

    switch (event.type) {
      case 'checkout.session.completed': //https://stripe.com/docs/api/checkout/sessions/object
        await handleCheckoutSessionCompleted(
          event.data.object as Stripe.Checkout.Session
        )
        break
      case 'customer.subscription.deleted': //https://stripe.com/docs/api/subscriptions/object
        await handleCustomerSubscriptionDeleted(
          event.data.object as Stripe.Subscription
        )
        break
      case 'invoice.payment_succeeded': //https://stripe.com/docs/api/invoices/object
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice)
        break
      case 'invoice.payment_failed': //https://stripe.com/docs/api/invoices/object
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice)
        break
      // ... handle other event types
      default:
        log.warn(`Unhandled Stripe event type ${event.type}: %j`, event)
    }

    // Return a 200 response to acknowledge receipt of the event
    res.send()
  } catch (err) {
    log.error('processing stripe_webhook failed! %j', err)
    res.status(500).send(`Error: ${err.message}`)
  }
})

app.post('/paddle_webhook', async function (req, res) {
  const signature = (req.headers['paddle-signature'] as string) || ''
  // req.body should be of type `buffer`, convert to string before passing it to `unmarshal`.
  // If express returned a JSON, remove any other middleware that might have processed raw request to object
  const rawRequestBody = (req as any).rawBody
  // Replace `WEBHOOK_SECRET_KEY` with the secret key in notifications from vendor dashboard
  const secretKey = process.env.PADDLE_WEBHOOK_SECRET || ''

  try {
    if (signature && rawRequestBody) {
      // The `unmarshal` function will validate the integrity of the webhook and return an entity
      const eventData = await paddle.webhooks.unmarshal(
        rawRequestBody,
        secretKey,
        signature
      )
      switch (eventData.eventType) {
        // case PaddleEventName.ProductUpdated:
        //   console.log(`Product ${eventData.data.id} was updated`)
        //   break
        // case PaddleEventName.SubscriptionUpdated:
        //   console.log(`Subscription ${eventData.data.id} was updated`)
        //   break
        default:
          log.warn(
            `Unhandled Paddle event type ${eventData.eventType}: %j`,
            eventData
          )
      }
    } else {
      console.log('Signature missing in header')
    }
  } catch (e) {
    // Handle signature mismatch or other runtime errors
    console.log(e)
  }
  // Return a response to acknowledge
  res.send('Processed Paddle webhook event')
})

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
      error:
        'provisioning failed! Try (re)-enabling the VSH skill in the Alexa app!',
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
            'device status retrievable by Alexa',
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
                  productName: 'VSH PRO - Yearly',
                  priceId: isProd()
                    ? 'pri_01jtxvka1st9m2m6bns9cha8hp'
                    : 'pri_01jtwt97ekjxb7xn6q1a9p8g5g',
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
                  productName: 'VSH PRO - Monthly',
                  priceId: isProd()
                    ? 'pri_01jtxvmaxj28qyjwyfbz6qrby4'
                    : 'pri_01jtwt8adq0rh6t605dc4b4avn',
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
    // redirect to the checkout page that uses Paddle Billing
    const { email } = await getUserRecord(req.userId)

    const checkoutIntend = {
      userId: req.userId,
      email: email,
      priceId: req.jwt.priceId,
      jwt: req.query.token,
      sandbox: !isProd(),
      productName: req.jwt.productName,
    }

    res.redirect(
      303,
      'https://vsh.csuermann.de/checkout/?checkoutIntend=' +
        encode(JSON.stringify(checkoutIntend))
    )

    // before 2025-05-10 we used Stripe
    // const { stripeCustomerId, email } = await getUserRecord(req.userId)
    // //init Stripe checkout session and redirect to their checkout experience
    // const stripeSession = await stripe.checkout.sessions.create({
    //   mode: 'subscription',
    //   client_reference_id: req.userId,
    //   ...(stripeCustomerId && { customer: stripeCustomerId }), //include customer property if stripeCustomerId is truthy
    //   ...(!stripeCustomerId && { customer_email: email }), //include customer_email property if stripeCustomerId is falsy
    //   line_items: [
    //     {
    //       price: req.jwt.priceId,
    //       quantity: 1,
    //     },
    //   ],
    //   allow_promotion_codes: true,
    //   // {CHECKOUT_SESSION_ID} is a string literal; do not change it!
    //   // the actual Session ID is returned in the query parameter when your customer
    //   // is redirected to the success page.
    //   success_url: `https://${req.hostname}/dev/stripe_redirect?session_id={CHECKOUT_SESSION_ID}`,
    //   cancel_url: `https://${req.hostname}/dev/stripe_redirect?cancelled=true`,
    // })

    // // Redirect to the URL returned on the Checkout Session.
    // res.redirect(303, stripeSession.url)
  }
)

app.get(
  '/subscription',
  needsTokenForAudience('subscription'),
  async function (req: AuthenticatedRequest, res) {
    const { stripeCustomerId, paddleCustomerId } = await getUserRecord(
      req.userId
    )

    if (paddleCustomerId) {
      const paddlePortalSession = await paddle.customerPortalSessions.create(
        paddleCustomerId,
        []
      )

      return res.redirect(303, paddlePortalSession.urls.general.overview)
    }

    if (stripeCustomerId) {
      //init Stripe customer portal session and redirect to there
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: stripeCustomerId,
        return_url: `https://${req.hostname}/dev/stripe_redirect`,
      })

      // Redirect to the URL returned on the portal session.
      return res.redirect(303, portalSession.url)
    }

    res.status(400).send({ error: 'no payment provider customer found' })
  }
)

app.get('/stripe_redirect', async function (req: AuthenticatedRequest, res) {
  //users get redirected to this endpoint after completing or cancelling the Stripe checkout flow!
  res.send(
    '<html><h1>Thank you!</h1><h2>You can now close this window.</h2></html>'
  )
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
    request.rawBody = event.body
  },
})
