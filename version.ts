import * as semver from 'semver'

export function isAllowedClientVersion(clientVersion: string): boolean {
  return semver.satisfies(clientVersion, '>=2.0.0')
}

export function isLatestClientVersion(clientVersion: string): boolean {
  return semver.satisfies(clientVersion, '>=2.0.0')
}
