import Axios, { AxiosResponse } from 'axios'

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
}

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
  const response: AxiosResponse = await Axios.post(
    'https://api.amazon.com/auth/o2/token',
    `grant_type=refresh_token&refresh_token=${refreshToken}&client_id=${process.env.ALEXA_CLIENT_ID}&client_secret=${process.env.ALEXA_CLIENT_SECRET}`,
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  )

  // {
  //   "access_token":"Atza|IQEBLjAsAhRmHjNmHpi0U-Dme37rR6CuUpSR...",
  //   "token_type":"bearer",
  //   "expires_in":3600,
  //   "refresh_token":"Atzr|IQEBLzAtAhRxpMJxdwVz2Nn6f2y-tpJX3DeX..."
  // }
  return response.data
}
