import * as log from 'log'
import Stripe from 'stripe'
import { getThingsOfUser, updateUserRecord } from './db'
import { proactivelyRediscoverAllDevices } from './helper'
import { publish } from './mqtt'
import { PlanName } from './Plan'

const stripe = new Stripe(process.env.STRIPE_API_KEY, {
  apiVersion: '2022-08-01',
})

export async function switchToPlan(
  userId: string,
  plan: PlanName,
  stripeCustomerId?: string
) {
  const userRec = {
    userId,
    plan,
  }

  if (stripeCustomerId) {
    userRec['stripeCustomerId'] = stripeCustomerId
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

export async function handleCheckoutSessionCompleted({
  client_reference_id: userId,
  customer: customerId,
  subscription: subscriptionId,
}) {
  await stripe.subscriptions.update(subscriptionId, {
    metadata: { userId: userId },
  })

  await switchToPlan(userId, PlanName.PRO, customerId)
}

export async function handleCustomerSubscriptionDeleted({ metadata }) {
  await switchToPlan(metadata.userId, PlanName.FREE)
}

export async function handleInvoicePaymentFailed({
  subscription: subscriptionId,
}) {
  const { metadata, customer: customerId } =
    await stripe.subscriptions.retrieve(subscriptionId)

  if (!metadata.userId) {
    //userId only gets set when the checkout.session.completed gets processed.
    //If a new customer entered a wrong CC, invoice.payment_failed will be
    //fired before checkout.session.completed. This must not result in a failed
    //webhook response, otherwise Stripe will retry and might therefore accidentally
    //downgrade the customer who meanwhile might have succeeded the checkout.
    return
  }

  const customer = (await stripe.customers.retrieve(customerId as string, {
    expand: ['subscriptions'],
  })) as Stripe.Customer & {
    subscriptions: Stripe.ApiList<Stripe.Subscription>
  }

  const hasActiveSubscription = customer.subscriptions.data.some(
    (sub) => sub.status === 'active'
  )

  if (!hasActiveSubscription) {
    await switchToPlan(metadata.userId, PlanName.FREE)
  }
}
