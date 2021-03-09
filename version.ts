import { bool } from 'aws-sdk/clients/signer'
import * as semver from 'semver'

export function isAllowedClientVersion(clientVersion: string): bool {
  return semver.satisfies(clientVersion, '>=1.16.0')
}

export function isLatestClientVersion(clientVersion: string): bool {
  return semver.satisfies(clientVersion, '>=1.16.0')
}
