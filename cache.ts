import {
  CacheClient,
  CacheGet,
  Configurations,
  CredentialProvider,
} from '@gomomento/sdk'
import { Property } from './handlers/updateState'
import { isProd } from './helper'
import log = require('log')

let client: CacheClient

async function getMomentoClient() {
  if (client) {
    return client
  }

  client = await CacheClient.create({
    configuration: Configurations.Lambda.latest(),
    credentialProvider: CredentialProvider.fromEnvironmentVariable({
      environmentVariableName: 'MOMENTO_TOKEN',
    }),
    defaultTtlSeconds: 3600,
  })

  return client
}

export async function writeDevicePropsToCache(
  thingId: string,
  endpointId: string,
  properties: any[]
) {
  if (!isCacheEnabled()) {
    return
  }

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
  if (!isCacheEnabled()) {
    throw new Error('cache disabled')
  }

  const momento = await getMomentoClient()

  const cacheName = getCacheName()
  const cacheKey = `${thingId}.${endpointId}`

  const cacheResp = await momento.get(cacheName, cacheKey)

  if (cacheResp instanceof CacheGet.Hit) {
    return JSON.parse(cacheResp.valueString())
  } else if (cacheResp instanceof CacheGet.Miss) {
    log.debug('cache miss for %s:%s!', cacheName, cacheKey)
    throw new Error('cache miss')
  } else if (cacheResp instanceof CacheGet.Error) {
    log.warn(
      'reading cache %s:%s failed with error: %s',
      cacheName,
      cacheKey,
      `${cacheResp.errorCode()}: ${cacheResp.toString()}`
    )
    throw new Error('cache error')
  } else {
    throw new Error('unexpected cache error')
  }
}

export async function deleteDevicePropsFromCache(
  thingId: string,
  endpointId: string
) {
  if (!isCacheEnabled()) {
    return
  }

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

function isCacheEnabled() {
  return !!process.env.MOMENTO_TOKEN
}
