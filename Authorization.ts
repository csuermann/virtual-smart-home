import Axios, { AxiosResponse, AxiosError } from 'axios'
import * as log from 'log'

export interface AccessTokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
}

export interface UserRecord {
  userId: string
  accessToken: string
  refreshToken: string
  accessTokenExpiry?: string
  updatedAt?: string
  email?: string
  skillRegion?: string
  isBlocked?: boolean
  allowedDeviceCount?: number
  plan?: string
  stripeCustomerId?: string
  paddleCustomerId?: string
  deleteAtUnixTime?: number
}

export type PartialUserRecord = Pick<UserRecord, 'userId'> & Partial<UserRecord>

export async function fetchAccessAndRefreshToken(
  event
): Promise<AccessTokenResponse> {
  const data = `grant_type=authorization_code&code=${event.directive.payload.grant.code}&client_id=${process.env.ALEXA_CLIENT_ID}&client_secret=${process.env.ALEXA_CLIENT_SECRET}`
  const url = 'https://api.amazon.com/auth/o2/token'
  const response: AxiosResponse = await Axios.post(url, data, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  })

  // console.log(':::fetchAccessAndRefreshToken:::')
  // console.log(url)
  // console.log(data)
  // console.log(response.data)

  // {
  //   "access_token":"Atza|IQEBLjAsAhRmHjNmHpi0U-Dme37rR6CuUpSR...",
  //   "token_type":"bearer",
  //   "expires_in":3600,
  //   "refresh_token":"Atzr|IQEBLzAtAhRxpMJxdwVz2Nn6f2y-tpJX3DeX..."
  // }

  return response.data
}

export async function fetchFreshAccessToken(
  refreshToken: string
): Promise<AccessTokenResponse> {
  const refreshTokenPrefix = refreshToken?.substring(0, 12) + '...'
  const clientId = process.env.ALEXA_CLIENT_ID?.substring(0, 20) + '...'
  
  try {
    log.info('Attempting token refresh', {
      refreshTokenPrefix,
      clientId,
      endpoint: 'https://api.amazon.com/auth/o2/token'
    })

    const response: AxiosResponse = await Axios.post(
      'https://api.amazon.com/auth/o2/token',
      `grant_type=refresh_token&refresh_token=${refreshToken}&client_id=${process.env.ALEXA_CLIENT_ID}&client_secret=${process.env.ALEXA_CLIENT_SECRET}`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    )

    log.info('Token refresh successful', {
      refreshTokenPrefix,
      hasNewAccessToken: !!response.data.access_token,
      hasNewRefreshToken: !!response.data.refresh_token,
      expiresIn: response.data.expires_in
    })

    return response.data
  } catch (error) {
    const axiosError = error as AxiosError
    
    log.error('Token refresh failed', {
      refreshTokenPrefix,
      clientId,
      status: axiosError.response?.status,
      statusText: axiosError.response?.statusText,
      errorCode: axiosError.code,
      errorMessage: axiosError.message,
      responseData: axiosError.response?.data,
      headers: axiosError.response?.headers,
      url: axiosError.config?.url,
      method: axiosError.config?.method
    })

    // Re-throw with enhanced error context
    const enhancedError = new Error(`Token refresh failed: ${axiosError.response?.status} ${axiosError.response?.statusText}`)
    enhancedError.name = 'TokenRefreshError'
    ;(enhancedError as any).originalError = error
    ;(enhancedError as any).refreshTokenPrefix = refreshTokenPrefix
    ;(enhancedError as any).status = axiosError.response?.status
    ;(enhancedError as any).responseData = axiosError.response?.data
    
    throw enhancedError
  }
}
