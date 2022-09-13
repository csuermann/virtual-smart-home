import * as log from 'log'
import Stripe from 'stripe'
import { updateUserRecord } from './db'
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

  log.info('switched user %s to plan %s', userId, plan)
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
  const { metadata } = await stripe.subscriptions.retrieve(subscriptionId)
  await switchToPlan(metadata.userId, PlanName.FREE)
}
