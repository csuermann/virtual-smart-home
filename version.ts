import * as semver from 'semver'

const features = {
  reportState: '>=2.2.0',
  provision: '>=2.8.0',
  msgRateLimiter: '>=2.12.0',
}

export function isAllowedClientVersion(clientVersion: string): boolean {
  return semver.satisfies(clientVersion, '>=2.13.1') //v2.13.1 was released 2021-10-19
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
