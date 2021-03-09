import handleDiscover from '../handlers/discover'

const dummyRequestEvent = {
  directive: {
    header: {
      namespace: 'Alexa.Discovery',
      name: 'Discover',
      payloadVersion: '3',
      messageId: '901b437c-af80-46da-bdca-b6961ddff387',
    },
    payload: {
      scope: {
        type: 'BearerToken',
        token: 'dummy-bearer-token',
      },
    },
  },
  profile: {
    user_id: 'amzn1.account.XXXXXX',
    name: 'John Doe',
    email: 'john.doe@gmail.com',
  },
}

const result = handleDiscover(dummyRequestEvent)

console.log(JSON.stringify(result, null, ' '))
