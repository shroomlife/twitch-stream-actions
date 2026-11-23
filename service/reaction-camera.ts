import {CameraProblem,inspectCamera,jpegFormat,captureCamera} from './camera-source'
import { createRequire } from 'node:module'
import {createHmac} from 'node:crypto'
import {saveMemory} from './memories'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
const require=createRequire(new URL('../../stream-control/apps/stream-control/package.json',import.meta.url))
const obs=new (require('obs-websocket-js/json').default)()
const statusOnly = process.argv.includes('--status')
async function connectCamera() {
  const password = await Bun.secrets.get({service:'stream-control',name:'obs-password'})
  if(!password)throw new CameraProblem('Das OBS-Passwort fehlt in der Anmeldeinformationsverwaltung.')
  try { await obs.connect('ws://127.0.0.1:4455',password,{rpcVersion:1,eventSubscriptions:0}) }
  catch(err){
    if((err as {code?:number}).code===4009)throw new CameraProblem('OBS hat das hinterlegte Passwort abgelehnt.')
    throw new CameraProblem('Keine Verbindung zum lokalen OBS-WebSocket auf Port 4455.')
  }
  return {format:await jpegFormat(obs),camera:await inspectCamera(obs)}
}
try {
  const {format,camera} = await connectCamera()
  if(statusOnly) console.log(JSON.stringify({ready:true,message:'Aufnahmebereit: '+camera.name+' (OBS-Quelle Webcam).'}))
  else {
    const lines=(await import('node:readline')).createInterface({input:process.stdin})[Symbol.asyncIterator]()
    const {id,local,until}=JSON.parse((await lines.next()).value)
    if(Date.now()>=until)throw Error('Capture expired')
    process.stdout.write('ready\n')
    if((await lines.next()).value!=='capture' || Date.now()>=until)throw Error('Capture expired')
    const image=await captureCamera(obs,camera,format,until)
    if(local) await saveMemory(join(tmpdir(),'shroomlive-panel-test-photos'),'0',id,image)
    else {
      const secret=await Bun.secrets.get({service:'stream-control',name:'twitch-extension-secret'})
      if(!secret)throw Error()
      const token=createHmac('sha256',Buffer.from(secret,'base64')).update('stream-actions/desktop-worker/v1').digest('hex')
      const reply=await fetch('https://shroomlive.de/stream-actions/camera/'+id,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'image/jpeg'},body:image,signal:AbortSignal.timeout(10000)})
      if(!reply.ok)throw Error()
    }
  }
} catch(error) {
  const message=error instanceof CameraProblem ? error.message : 'Die Kameraabfrage bei OBS ist fehlgeschlagen.'
  if(statusOnly) console.log(JSON.stringify({ready:false,message}))
  else { console.error(message); process.exitCode=1 }
} finally {await obs.disconnect()}
