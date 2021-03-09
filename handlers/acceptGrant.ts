import { fetchAccessAndRefreshToken } from '../Authorization'
import { upsertTokens } from '../db'

export default async function handleAcceptGrant (event) {
  try {
    const tokenData = await fetchAccessAndRefreshToken(event)

    await upsertTokens(
      {
        userId: event.profile.user_id,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        email: event.profile.email,
        skillRegion: process.env.AWS_REGION || 'eu-west-1'
      },
      tokenData.expires_in
    )

    return {
      event: {
        header: {
          namespace: 'Alexa.Authorization',
          name: 'AcceptGrant.Response',
          messageId: event.directive.header.messageId + '-R',
          payloadVersion: '3'
        },
        payload: {}
      }
    }
  } catch (e) {
    return {
      event: {
        header: {
          messageId: event.directive.header.messageId + '-R',
          namespace: 'Alexa.Authorization',
          name: 'ErrorResponse',
          payloadVersion: '3'
        },
        payload: {
          type: 'ACCEPT_GRANT_FAILED',
          message: 'Failed to handle the AcceptGrant directive: Reason: ' + e
        }
      }
    }
  }
}
