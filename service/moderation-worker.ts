import { createHmac } from 'node:crypto'
import {moderate,askRobin} from './moderate'
const secret=await Bun.secrets.get({service:'stream-control',name:'twitch-extension-secret'})
if(!secret)throw Error('Desktop credential missing')
const key=createHmac('sha256',Buffer.from(secret,'base64')).update('stream-actions/desktop-worker/v1').digest('hex')
async function request(body:object) {
  const r=await fetch('https://shroomlive.de/stream-actions/desktop-job',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)})
  if(!r.ok)throw Error('Worker unavailable')
  return r.json()
}
async function work(queue:'pending'|'held'){
  for(;;){
    try{
      const {item}=await request({queue,action:'next'})
      if(!item)continue
      const reason=queue==='pending'?await moderate(item):item.reason
      const action=queue==='held'?(await askRobin(item,reason)?'ready':'rejected'):(reason?'held':'ready')
      await request({queue,id:item.id,action,reason})
    }catch{await Bun.sleep(3000)}
  }
}
await Promise.all([work('pending'),work('held')])
