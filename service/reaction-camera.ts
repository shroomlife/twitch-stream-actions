import {CameraProblem,inspectCamera,jpegFormat,captureCamera} from './camera-source'
import { createRequire } from 'node:module'
import {loadDesktopKey} from './desktop-credential'
import {publicBaseUrl} from './public-url'
import {saveMemory,validFrame,validKey,validMedia} from './memories'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
const require=createRequire(new URL('../../stream-control/apps/stream-control/package.json',import.meta.url))
const obs=new (require('obs-websocket-js/json').default)()
const statusOnly = process.argv.includes('--status')
async function upload(id:number,frame:number,image:Uint8Array,token:string) {
  const reply=await fetch(publicBaseUrl()+'/stream-actions/camera/'+id+'/'+frame,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'image/jpeg'},body:image,signal:AbortSignal.timeout(10000)})
  if(!reply.ok)throw Error('Upload failed')
}
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
    const {id,local,until,media}=JSON.parse((await lines.next()).value)
    if(Date.now()>=until)throw Error('Capture expired')
    if(local ? !validKey(id) || !validMedia(media) : !Number.isSafeInteger(id))throw Error('Unknown reaction')
    const credential=local?'':await loadDesktopKey()
    process.stdout.write('ready\n')
    // Each shutter line takes the next frame; uploads run beside the next shots so the timing stays tight.
    const uploads:Promise<void>[]=[]
    try {
      for(let next=await lines.next();!next.done;next=await lines.next()){
        const frame=uploads.length+1
        if(next.value!=='capture '+frame || !validFrame(frame) || Date.now()>=until)throw Error('Capture expired')
        const image=await captureCamera(obs,camera,format,until)
        uploads.push(local
          ? saveMemory(join(tmpdir(),'shroomlive-panel-test-photos'),'0',id,frame,media,image)
          : upload(id,frame,image,credential))
      }
    } finally {
      // Frames already taken still arrive when a later shot is refused.
      if((await Promise.allSettled(uploads)).some(result=>result.status==='rejected'))throw Error('Upload failed')
    }
  }
} catch(error) {
  const message=error instanceof CameraProblem ? error.message : 'Die Kameraabfrage bei OBS ist fehlgeschlagen.'
  if(statusOnly) console.log(JSON.stringify({ready:false,message}))
  else { console.error(message); process.exitCode=1 }
} finally {await obs.disconnect()}
