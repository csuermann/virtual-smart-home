import { fetchDeviceShadow } from '../shadow'

fetchDeviceShadow('node-red-test', 'dummy-device-1')
  .then((result) => console.log(result))
  .catch((e) => console.log(e))
