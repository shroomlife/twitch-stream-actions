import { createRequire } from 'node:module'
const require = createRequire(new URL('../../stream-control/apps/stream-control/package.json', import.meta.url))
const { default: OBSWebSocket } = require('obs-websocket-js/json')
const obs = new OBSWebSocket()
try {
  const password = await Bun.secrets.get({service:'stream-control', name:'obs-password'})
  await obs.connect('ws://127.0.0.1:4455', password ?? '')
  if (process.argv[2] === 'refresh') {
    await obs.call('PressInputPropertiesButton', { inputName:'Stream Actions', propertyName:'refreshnocache' })
  } else {
    const entry = JSON.parse(await Bun.stdin.text())
    const response = await obs.call('CallVendorRequest', {vendorName:'obs-browser',requestType:'emit_event',requestData:{event_name:'shroomliveReactionTest',event_data:entry}})
    if (response.responseData?.error) throw Error('OBS rejected test')
  }
} finally {
  await obs.disconnect()
}
