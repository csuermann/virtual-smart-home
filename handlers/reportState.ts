import { buildPropertiesFromShadow } from '../shadow'

export default async function handleReportState (event) {
  const properties = await buildPropertiesFromShadow({
    thingId: event.directive.endpoint.cookie.thingId,
    endpointId: event.directive.endpoint.endpointId
  })

  const result = {
    event: {
      header: {
        messageId: event.directive.header.messageId + '-R',
        correlationToken: event.directive.header.correlationToken,
        namespace: 'Alexa',
        name: 'StateReport',
        payloadVersion: '3'
      },
      endpoint: {
        scope: {
          type: 'BearerToken',
          token: event.directive.endpoint.scope.token
        },
        endpointId: event.directive.endpoint.endpointId,
        cookie: event.directive.endpoint.cookie
      },
      payload: {}
    },
    context: {
      properties
    }
  }

  return result
}
