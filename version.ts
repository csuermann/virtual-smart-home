import { String } from 'aws-sdk/clients/cloudhsm'
import * as semver from 'semver'

const features = {
  reportState: '>=2.2.0',
  provision: '>=2.8.0',
}

export function isAllowedClientVersion(clientVersion: string): boolean {
  return semver.satisfies(clientVersion, '>=2.0.0')
}

export function isLatestClientVersion(clientVersion: string): boolean {
  return semver.satisfies(
    clientVersion,
    `>=${process.env.VSH_LATEST_CLIENT_VERSION}`
  )
}

export function isFeatureSupportedByClient(
  feature: string,
  clientVersion: string
): boolean {
  if (!features[feature]) {
    return false
  }

  return semver.satisfies(clientVersion, features[feature])
}
