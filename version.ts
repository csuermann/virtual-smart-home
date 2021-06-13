import { String } from 'aws-sdk/clients/cloudhsm'
import * as semver from 'semver'

const features = {
  reportState: '>=2.2.0',
}

export function isAllowedClientVersion(clientVersion: string): boolean {
  return semver.satisfies(clientVersion, '>=2.0.0')
}

export function isLatestClientVersion(clientVersion: string): boolean {
  return semver.satisfies(clientVersion, '>=2.3.0')
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
