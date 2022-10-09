import { SimpleCacheClient, CacheGetStatus } from '@gomomento/sdk'
import log = require('log')
import { Property } from './handlers/updateState'
import { isProd } from './helper'

let client = null

async function getMomentoClient() {
  if (client) {
    return client
  }

  client = new SimpleCacheClient(process.env.MOMENTO_TOKEN, 3600, {
    requestTimeoutMs: 1500,
  })

  return client
}

export async function writeDevicePropsToCache(
  thingId: string,
  endpointId: string,
  properties: any[]
) {
  const momento = await getMomentoClient()

  const cacheName = getCacheName()
  const cacheKey = `${thingId}.${endpointId}`
  const cacheValue = JSON.stringify(properties)

  try {
    log.debug('attempting to cache %s:%s: %s', cacheName, cacheKey, cacheValue)
    await momento.set(cacheName, cacheKey, cacheValue)
  } catch (err) {
    log.warn(
      'caching %s:%s failed with error: %s',
      cacheName,
      cacheKey,
      err.message
    )
  }
}

export async function readDevicePropsFromCache(
  thingId: string,
  endpointId: string
): Promise<Property[]> {
  const momento = await getMomentoClient()

  const cacheName = getCacheName()
  const cacheKey = `${thingId}.${endpointId}`

  let cacheResp

  try {
    cacheResp = await momento.get(cacheName, cacheKey)
  } catch (err) {
    log.warn(
      'reading cache %s:%s failed with error: %s',
      cacheName,
      cacheKey,
      err.message
    )

    cacheResp.status = CacheGetStatus.Unknown
  }

  if (cacheResp.status !== CacheGetStatus.Hit) {
    log.debug('cache miss for %s:%s!', cacheName, cacheKey)
    throw new Error('cache miss')
  }

  log.debug('cache hit for %s:%s!', cacheName, cacheKey)

  return JSON.parse(cacheResp.text())
}

export async function deleteDevicePropsFromCache(
  thingId: string,
  endpointId: string
) {
  const momento = await getMomentoClient()

  const cacheName = getCacheName()
  const cacheKey = `${thingId}.${endpointId}`

  try {
    log.debug('clearing cache %s:%s!', cacheName, cacheKey)
    await momento.delete(cacheName, cacheKey)
  } catch (err) {
    log.warn(
      'clearing cache %s:%s failed with error: %s',
      cacheName,
      cacheKey,
      err.message
    )
  }
}

function getCacheName() {
  return `vsh_${isProd() ? 'prod' : 'sandbox'}.state_report_props`
}
