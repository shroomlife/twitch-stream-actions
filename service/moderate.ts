import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import catalog from '../src/catalog.json'
const desktopRequire = createRequire(new URL('../../stream-control/apps/desktop/package.json',import.meta.url))
export interface Submission {media:string; message:string; author:string}

async function mediaInfo(media:string) {
  const own=catalog.find(x=>x.id===media)
  if (own) return {title:own.title,preview:Bun.pathToFileURL(resolve('public/pilze',media+'.webp')).href,still:null}
  if (!/^[A-Za-z0-9]{1,80}$/.test(media)) throw Error('Unbekanntes Motiv')
  const url=new URL('https://api.giphy.com/v1/gifs/'+media)
  url.searchParams.set('api_key',process.env.VITE_GIPHY_API_KEY || '')
  const r=await fetch(url,{signal:AbortSignal.timeout(6000)})
  if(!r.ok) throw Error('GIPHY nicht erreichbar')
  const {data}=await r.json()
  if(data?.id!==media || data.rating!=='g') throw Error('GIPHY-Motiv nicht bestätigt')
  const checked=(s:string)=>{const u=new URL(s);if(u.protocol!=='https:'||!u.hostname.endsWith('.giphy.com'))throw Error();return u.href}
  return {title:String(data.title||'GIF'), preview:checked(data.images.fixed_height.url),still:checked(data.images.fixed_height_still.url)}
}
export async function moderate(item:Submission) {
  try {
    const info=await mediaInfo(item.media)
    const input:unknown[]=[{type:'text',text:[info.title,item.message].join('\n')}]
    if(info.still) input.push({type:'image_url',image_url:{url:info.still}})
    const key=await Bun.secrets.get({service:'stream-control',name:'openai-api-key'})
    if(!key)throw Error('missing key')
    const r=await fetch('https://api.openai.com/v1/moderations',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model:'omni-moderation-latest',input}),signal:AbortSignal.timeout(15000)})
    if(!r.ok) throw Error('moderation unavailable')
    const verdict=(await r.json()).results?.[0]
    if(typeof verdict?.flagged!=='boolean'||!verdict.categories||typeof verdict.categories.harassment!=='boolean') throw Error('missing verdict')
    const flagged=Object.entries(verdict.categories).filter(([name,value])=>value===true && name!=='harassment').map(([name])=>name)
    if(flagged.length) return flagged.join(', ')
    if(/(?:buy|kauf|gratis|discount|rabatt|promo.?code|cheap|billig|free followers|follower kaufen)/i.test(item.message)&&/(?:https?:\/\/|www\.|\w\.(?:de|com|shop|gg|net)\b|promo.?code)/i.test(item.message)) return 'Mögliche Werbung'
    return ''
  } catch { return 'Prüfung nicht verfügbar' }
}
export async function askRobin(item:Submission,reason:string) {
  const info=await mediaInfo(item.media).catch(()=>({title:item.media,preview:''}))
  const child = Bun.spawn([desktopRequire('electron'), resolve('service/review-window.cjs')], {
    env: { ...process.env, SHROOMLIVE_REVIEW: JSON.stringify({...item,...info,reason}) },
    stdin: 'ignore', stdout: 'ignore', stderr: 'ignore',
  })
  return (await child.exited) === 10
}
if(import.meta.main){
  const item=JSON.parse(await Bun.stdin.text())
  const reason=await moderate(item)
  console.log(!reason || await askRobin(item,reason) ? 'yes':'no')
}

