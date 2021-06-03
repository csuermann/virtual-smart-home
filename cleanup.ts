import AWS = require('aws-sdk')
import { getDevicesOfThing } from './db'
import { handleBackchannelBulkUndiscover } from './handler'

AWS.config.update({ region: process.env.VSH_IOT_REGION })

const iot = new AWS.Iot()

async function getStaleThings(): Promise<string[]> {
  const timestampInPast =
    Math.floor(new Date().getTime() / 1000) - 60 * 60 * 24 * 30 //30 days ago
  console.log('cutoff:', new Date(timestampInPast * 1000).toISOString())
  const params = {
    maxResults: 50,
    queryString: `thingName:vsht* AND connectivity.connected:false AND ((NOT shadow.reported.connected:*) OR shadow.metadata.reported.connected.timestamp < ${timestampInPast})`,
  }

  return new Promise((resolve, reject) => {
    iot.searchIndex(params, function (err, data) {
      if (err) {
        reject(err)
      } else {
        resolve(data.things.map((e) => e.thingName))
      }
    })
  })
}

async function getThingPrincipal(thingName) {
  const params = {
    thingName,
  }

  return new Promise((resolve, reject) => {
    iot.listThingPrincipals(params, function (err, data) {
      if (err) {
        reject(err)
      } else {
        resolve(data.principals[0])
      }
    })
  })
}

async function detachPolicy(principalArn) {
  const params = {
    policyName: 'vshClientPolicy',
    target: principalArn,
  }

  return new Promise((resolve, reject) => {
    iot.detachPolicy(params, function (err, data) {
      if (err) {
        reject(err)
      } else {
        resolve(true)
      }
    })
  })
}

async function updateCertificateToInactive(principalArn) {
  const params = {
    certificateId: principalArn.match(/cert\/(.+)/)[1],
    newStatus: 'INACTIVE',
  }

  return new Promise((resolve, reject) => {
    iot.updateCertificate(params, function (err, data) {
      if (err) {
        reject(err)
      } else {
        resolve(true)
      }
    })
  })
}

async function detachThingPrincipal(thingName, principalArn) {
  const params = {
    thingName,
    principal: principalArn,
  }

  return new Promise((resolve, reject) => {
    iot.detachThingPrincipal(params, function (err, data) {
      if (err) {
        reject(err)
      } else {
        resolve(true)
      }
    })
  })
}

async function deleteCertificate(principalArn) {
  const params = {
    certificateId: principalArn.match(/cert\/(.+)/)[1],
    forceDelete: true,
  }

  return new Promise((resolve, reject) => {
    iot.deleteCertificate(params, function (err, data) {
      if (err) {
        reject(err)
      } else {
        resolve(true)
      }
    })
  })
}

async function deleteThing(thingName) {
  const params = {
    thingName,
  }

  return new Promise((resolve, reject) => {
    iot.deleteThing(params, function (err, data) {
      if (err) {
        reject(err)
      } else {
        resolve(true)
      }
    })
  })
}

async function totallyCleanUpThing(thingName) {
  console.log('totallyCleanUpThing::', thingName)

  const devices = await getDevicesOfThing(thingName)
  console.log('devices::', devices.length)

  if (devices.length > 0) {
    console.log(`bulk undiscovering ${devices.length} devices...`)
    try {
      await handleBackchannelBulkUndiscover({ thingId: thingName, devices })
    } catch (e) {
      console.log(`bulk undiscovering failed with error: ${e.message}`)
    }
  }

  const principalArn = await getThingPrincipal(thingName)
  console.log('principalArn::', principalArn)

  console.log('detaching vshClientPolicy from certificate...')
  await detachPolicy(principalArn)

  console.log('updating certificate to INACTIVE...')
  await updateCertificateToInactive(principalArn)

  console.log('detaching thing from certificate...')
  await detachThingPrincipal(thingName, principalArn)

  console.log('deleting certificate...')
  await deleteCertificate(principalArn)

  console.log('deleting thing...')
  await deleteThing(thingName)

  console.log('>>> DONE for thingId ' + thingName)
}

export const cleanup = async function (event, context) {
  const staleThings = await getStaleThings()
  const thingsDeleted = []
  const thingsNotDeleted = []

  console.log('STALE THINGS::', staleThings)

  for (const thingName of staleThings) {
    try {
      await totallyCleanUpThing(thingName)
      thingsDeleted.push(thingName)
    } catch (e) {
      console.log('EXCEPTION', e.message)
      thingsNotDeleted.push(thingName)
    }
  }

  console.log('THINGS DELETED::', thingsDeleted)
  console.log('THINGS _NOT_ DELETED::', thingsNotDeleted)

  return {
    thingsDeleted,
    thingsNotDeleted,
  }
}
