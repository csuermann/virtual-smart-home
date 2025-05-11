import * as log from 'log'
import Stripe from 'stripe'
import * as jwt from 'jsonwebtoken'
import { getThingsOfUser, updateUserRecord } from './db'
import { proactivelyRediscoverAllDevices } from './helper'
import { publish } from './mqtt'
import { PlanName } from './Plan'
import { Paddle, SubscriptionActivatedEvent } from '@paddle/paddle-node-sdk'

const stripe = new Stripe(process.env.STRIPE_API_KEY, {
  apiVersion: '2023-08-16',
})

const paddle = new Paddle(process.env.PADDLE_API_KEY)

export async function switchToPlan(
  userId: string,
  plan: PlanName,
  paymentProviderInfo?: { fieldName: string; paymentProviderCustomerId: string }
) {
  const userRec = {
    userId,
    plan,
  }

  if (paymentProviderInfo) {
    userRec[paymentProviderInfo.fieldName] =
      paymentProviderInfo.paymentProviderCustomerId
  }

  await updateUserRecord(userRec)

  log.info('switched user [%s] to plan [%s]', userId, plan)

  //push potentially updated device config to Alexa:
  try {
    //this might fail e.g. with error "Multiple endpoints cannot have the same endpointId"
    await proactivelyRediscoverAllDevices(userId)
  } catch (err) {
    log.warn('proactivelyRediscoverAllDevices failed: %j', err)
  }

  //send 'restart' service msg to all things of user:
  const thingIds = await getThingsOfUser(userId)
  for (const thingId of thingIds) {
    await publish(`vsh/${thingId}/service`, {
      operation: 'restart',
    })
  }
}

export async function handleStripeCheckoutSessionCompleted({
  client_reference_id: userId,
  customer: stripeCustomerId,
  subscription: stripeSubscriptionId,
}: Stripe.Checkout.Session) {
  await stripe.subscriptions.update(stripeSubscriptionId as string, {
    metadata: { userId: userId },
  })

  await switchToPlan(userId, PlanName.PRO, {
    fieldName: 'stripeCustomerId',
    paymentProviderCustomerId: stripeCustomerId as string,
  })
}

export async function handlePaddleSubscriptionActivated(
  event: SubscriptionActivatedEvent
) {
  const { jwt: token } = event.data.customData as {
    jwt: string
  }

  const decodedJwt = jwt.verify(token, process.env.HASH_SECRET, {
    maxAge: '3h',
  }) as jwt.JwtPayload

  const userId = decodedJwt.sub

  await paddle.subscriptions.update(event.data.id, { customData: { userId } })

  await switchToPlan(userId, PlanName.PRO, {
    fieldName: 'paddleCustomerId',
    paymentProviderCustomerId: event.data.customerId,
  })
}

export async function handleStripeCustomerSubscriptionDeleted({
  metadata,
  customer: stripeCustomerId,
}: Stripe.Subscription) {
  const hasSubscription = await hasActiveSubscription(
    stripeCustomerId as string
  )

  if (!hasSubscription) {
    await switchToPlan(metadata.userId, PlanName.FREE)
  }
}

export async function handleStripeInvoicePaymentSucceeded({
  subscription: stripeSubscriptionId,
}: Stripe.Invoice) {
  const { metadata } = await stripe.subscriptions.retrieve(
    stripeSubscriptionId as string
  )

  if (!metadata.userId) {
    // by throwing an error, the webhook response will be 500 and Stripe will retry
    // this is to mitigate any race conditions
    throw new Error('metadata.userId is missing')
  }

  await switchToPlan(metadata.userId, PlanName.PRO)
}

export async function handleStripeInvoicePaymentFailed({
  subscription: stripeSubscriptionId,
}: Stripe.Invoice) {
  const { metadata, customer: stripeCustomerId } =
    await stripe.subscriptions.retrieve(stripeSubscriptionId as string)

  if (!metadata.userId) {
    //userId only gets set when the checkout.session.completed gets processed.
    //If a new customer entered a wrong CC, invoice.payment_failed will be
    //fired before checkout.session.completed. This must not result in a failed
    //webhook response, otherwise Stripe will retry and might therefore accidentally
    //downgrade the customer who meanwhile might have succeeded the checkout.
    return
  }

  const hasSubscription = await hasActiveSubscription(
    stripeCustomerId as string
  )

  if (!hasSubscription) {
    await switchToPlan(metadata.userId, PlanName.FREE)
  }
}

async function hasActiveSubscription(stripeCustomerId: string) {
  const { subscriptions } = (await stripe.customers.retrieve(stripeCustomerId, {
    expand: ['subscriptions'],
  })) as Stripe.Customer & {
    subscriptions: Stripe.ApiList<Stripe.Subscription>
  }

  return subscriptions.data.some((sub) => sub.status === 'active')
}
