import { receiveStreamStatus, webhookSecret } from './stream-status'
import { Database } from 'bun:sqlite'
import { createHmac, timingSafeEqual } from 'node:crypto'
import {listMemories,readFrame,saveMemory,validFrame,validKey} from './memories'
import {dirname,join} from 'node:path'
const memoryRoot=join(dirname(process.env.ACTIONS_DB||'stream-actions.sqlite'),'reaction-photos')
import catalog from '../src/catalog.json'
import { loadSecrets } from './config'

const channel = '137290088'
// Read once at start; fails fast with the names of missing secrets, never their values.
const { extensionSecret: secret, clientId, clientSecret } = loadSecrets(process.env)
const db = new Database(process.env.ACTIONS_DB || 'stream-actions.sqlite', {
  create: true,
})
db.exec(
  "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS requests(id INTEGER PRIMARY KEY,stream TEXT,viewer TEXT,author TEXT,media TEXT,message TEXT,created INTEGER,state TEXT DEFAULT 'pending'); CREATE INDEX IF NOT EXISTS recent ON requests(created)",
)
const library = new Set(catalog.map((item) => item.id))
if (!db.query<{name:string}, []>('PRAGMA table_info(requests)').all().some(column => column.name === 'avatar')) {
  db.exec('ALTER TABLE requests ADD COLUMN avatar TEXT')
}
type Entry = { id: number; author: string; avatar: string | null; media: string; message: string }
let active: (Entry & { until: number }) | null = null
const screens = new Set<ReadableStreamDefaultController<Uint8Array>>()
const encode = new TextEncoder()
const current = () => (active && active.until > Date.now() ? active : null)
const frame = () => encode.encode('data: ' + JSON.stringify(current()) + '\n\n')
function publish() {
  for (const screen of screens) screen.enqueue(frame())
}
class Refusal extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}
function viewerFrom(token: unknown) {
  try {
    if (typeof token !== 'string' || token.length > 8192) throw Error()
    const [head, body, sig, extra] = token.split('.')
    if (!head || !body || !sig || extra !== undefined) throw Error()
    const digest = createHmac('sha256', secret)
      .update(head + '.' + body)
      .digest()
    if (!timingSafeEqual(Buffer.from(sig, 'base64url'), digest)) throw Error()
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString())
    const now = Date.now() / 1000
    if (
      JSON.parse(Buffer.from(head, 'base64url').toString()).alg !== 'HS256' ||
      !Number.isFinite(claims.exp) ||
      claims.exp <= now ||
      claims.nbf > now ||
      claims.channel_id !== channel ||
      typeof claims.user_id !== 'string' ||
      !/^\d+$/.test(claims.user_id) ||
      !String(claims.opaque_user_id).startsWith('U') ||
      !['viewer', 'moderator', 'broadcaster'].includes(claims.role)
    )
      throw Error()
    return {
      id: claims.user_id as string,
      owner: claims.user_id === channel && claims.role === 'broadcaster',
    }
  } catch {
    throw new Refusal(401, 'Bitte Twitch-ID erneut freigeben.')
  }
}
let cachedToken: { value: string; until: number } | undefined
let renewing: Promise<string> | undefined
async function token() {
  if (cachedToken && cachedToken.until > Date.now()) return cachedToken.value
  renewing ??= (async () => {
    const res = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'client_credentials',
      }),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) throw Error('Helix login failed')
    const data = await res.json()
    cachedToken = {
      value: data.access_token,
      until: Date.now() + (data.expires_in - 60) * 1000,
    }
    return cachedToken.value
  })().finally(() => {
    renewing = undefined
  })
  return renewing
}
async function helix(path: string) {
  const res = await fetch('https://api.twitch.tv/helix/' + path, {
    headers: {
      'Client-Id': clientId,
      Authorization: 'Bearer ' + (await token()),
    },
    signal: AbortSignal.timeout(5000),
  })
  if (res.status === 401) cachedToken = undefined
  if (!res.ok) throw Error('Helix unavailable')
  return (await res.json()).data[0]
}
let live: { id: string | null; until: number } | undefined
const signingKey = webhookSecret(secret)
let lastTransition = 0
function updateStream(id: string | null, timestamp: number) {
  if (timestamp <= lastTransition) return
  clearTimeout(timer)
  lastTransition = timestamp
  live = { id, until: Date.now() + 15000 }
  active = null
  publish()
  for (const screen of screens) screen.enqueue(encode.encode('event: stream-status\ndata: changed\n\n'))
}
let refreshing: Promise<string | null> | undefined
async function streamId() {
  if (live && live.until > Date.now()) return live.id
  const transition = lastTransition
  refreshing ??= helix('streams?user_id=' + channel)
    .then((row) => {
      if (transition !== lastTransition && live) return live.id
      live = { id: row?.id ?? null, until: Date.now() + 15000 }
      return live.id
    })
    .finally(() => {
      refreshing = undefined
    })
  return refreshing
}
const changed = new EventTarget()
const signalJobs = () => changed.dispatchEvent(new Event('jobs'))
const desktopKey = createHmac('sha256',secret).update('stream-actions/desktop-worker/v1').digest('hex')
if (!db.query<{name:string}, []>('PRAGMA table_info(requests)').all().some(column => column.name === 'reason')) db.exec('ALTER TABLE requests ADD COLUMN reason TEXT')
if (!db.query<{name:string}, []>('PRAGMA table_info(requests)').all().some(column => column.name === 'shown_at')) db.exec('ALTER TABLE requests ADD COLUMN shown_at INTEGER')
const nextJob=db.query<Entry & {stream:string;reason:string|null},[string,number]>('SELECT id,stream,author,avatar,media,message,reason FROM requests WHERE state=? AND created>? ORDER BY id LIMIT 1')
let timer: ReturnType<typeof setTimeout> | undefined
function playNext(stream:string) {
  if(current())return
  const item=db.query<Entry,[string,number]>("SELECT id,author,avatar,media,message FROM requests WHERE stream=? AND state='ready' AND created>? ORDER BY id LIMIT 1").get(stream,Date.now()-600000)
  if(!item)return
  db.query("UPDATE requests SET state='shown',shown_at=? WHERE id=?").run(Date.now(),item.id)
  active={...item,until:Date.now()+10000}
  signalJobs()
  publish()
  clearTimeout(timer)
  timer=setTimeout(()=>{active=null;publish();playNext(stream)},10000)
}
async function desktopJob(req:Request) {
  const provided=Buffer.from(req.headers.get('Authorization')||'')
  const expected=Buffer.from('Bearer '+desktopKey)
  if(provided.length!==expected.length || !timingSafeEqual(provided,expected))return new Response(null,{status:403})
  const body=await req.json()
  const state=body.queue
  if(!['pending','held'].includes(state))return json({},400)
  if(body.action==='next'){
    const read=()=>nextJob.get(state,Date.now()-600000)
    let item=read()
    if(!item){
      await new Promise<void>(resolve=>{
        const done=()=>{clearTimeout(timeout);changed.removeEventListener('jobs',done);req.signal.removeEventListener('abort',done);resolve()}
        const timeout=setTimeout(done,20000)
        changed.addEventListener('jobs',done,{once:true});req.signal.addEventListener('abort',done,{once:true})
        if(req.signal.aborted)done()
      })
      item=read()
    }
    return json({item})
  }
  if(!Number.isSafeInteger(body.id)||!['ready','rejected','held'].includes(body.action)||(state==='held'&&body.action==='held'))return json({},400)
  const stream=await streamId()
  db.query('UPDATE requests SET state=?,reason=? WHERE id=? AND state=? AND stream=? AND created>?').run(body.action,String(body.reason||'').slice(0,180),body.id,state,stream||'',Date.now()-600000)
  // Discard a job belonging to a stream that has already ended.
  db.query("UPDATE requests SET state='expired' WHERE id=? AND state=? AND stream!=?").run(body.id,state,stream||'')
  signalJobs()
  if(stream)playNext(stream)
  return json({success:true})
}
const submit = db.transaction(
  (
    stream: string,
    viewer: string,
    author: string,
    avatar: string | null,
    media: string,
    message: string,
  ) => {
    const now = Date.now()
    db.query('DELETE FROM requests WHERE created<?').run(now - 86400000)
    const count = db
      .query<{ total: number; own: number }, [string, number, string]>(
        'SELECT count(*) total,max(viewer=?) own FROM requests WHERE created>? AND stream=?',
      )
      .get(viewer, now - 60000, stream)
    if (count?.own || (count?.total ?? 0) >= 3)
      throw new Refusal(
        429,
        'Gerade ist viel los. Versuch es in einer Minute erneut.',
      )
    db.query(
      'INSERT INTO requests(stream,viewer,author,avatar,media,message,created) VALUES(?,?,?,?,?,?,?)',
    ).run(stream, viewer, author, avatar, media, message, now)
  },
)
const cors = {
  'Access-Control-Allow-Origin':
    'https://rzayw76j3drs9vzexj712achlc6bfi.ext-twitch.tv',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
}
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: cors })
export const server = Bun.serve({
  hostname: process.env.ACTIONS_HOST || '127.0.0.1',
  port: Number(process.env.PORT || 27019),
  maxRequestBodySize: 2 * 1024 * 1024,
  async fetch(req, server) {
    const path = new URL(req.url).pathname
    if (!path.startsWith('/stream-actions/'))
      return new Response(null, { status: 404 })
    const route = path.slice('/stream-actions/'.length)
    try {
      if(route.startsWith('camera/') && req.method==='POST'){
        const credential=Buffer.from(req.headers.get('authorization')||'')
        const expected=Buffer.from('Bearer '+desktopKey)
        if(credential.length!==expected.length || !timingSafeEqual(credential,expected))return json({},403)
        const match=/^camera\/([1-9]\d*)\/([1-9])$/.exec(route)
        const frame=Number(match?.[2])
        if(!match || !validFrame(frame) || req.headers.get('content-type')!=='image/jpeg')return json({},400)
        const id=Number(match[1])
        const row=db.query<{viewer:string;created:number;media:string},[number,number]>("SELECT viewer,created,media FROM requests WHERE id=? AND state='shown' AND shown_at>?").get(id,Date.now()-60000)
        if(!row)return json({},404)
        const suffix=createHmac('sha256',secret).update('photo/'+row.created+'/'+id).digest('hex').slice(0,32)
        const key=row.created+'-'+suffix.slice(0,8)+'-'+suffix.slice(8,12)+'-'+suffix.slice(12,16)+'-'+suffix.slice(16,20)+'-'+suffix.slice(20)
        await saveMemory(memoryRoot,row.viewer,key,frame,row.media,new Uint8Array(await req.arrayBuffer()))
        signalJobs()
        return json({success:true})
      }
      if(Number(req.headers.get('content-length'))>16384)return json({},413)
      if(route==='desktop-job' && req.method==='POST'){server.timeout(req,30);return await desktopJob(req)}
      if (route === 'twitch-status' && req.method === 'POST') return await receiveStreamStatus(req, signingKey, channel, updateStream)
      if (req.method === 'OPTIONS')
        return new Response(null, { status: 204, headers: cors })
      if (req.method === 'GET' && route === 'events') {
        server.timeout(req, 0)
        let controller: ReadableStreamDefaultController<Uint8Array>
        let timer: ReturnType<typeof setInterval>
        return new Response(
          new ReadableStream<Uint8Array>({
            start(c) {
              controller = c
              screens.add(c)
              c.enqueue(frame())
              // Keep the reverse proxy's idle connection alive.
              timer = setInterval(
                () => c.enqueue(encode.encode(': keepalive\n\n')),
                25000,
              )
            },
            cancel() {
              clearInterval(timer)
              screens.delete(controller)
            },
          }),
          {
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'X-Accel-Buffering': 'no',
              'Access-Control-Allow-Origin': '*',
            },
          },
        )
      }
      if (
        req.method === 'GET' &&
        /^(stage\.html|assets\/[\w.-]+|pilze\/[\w-]+\.webp)$/.test(route)
      ) {
        const file = Bun.file(import.meta.dir + '/../stage-dist/' + route)
        return (await file.exists())
          ? new Response(file)
          : new Response(null, { status: 404 })
      }
      if (req.method !== 'POST') return json({}, 404)
      const body = req.headers.get('content-type')?.includes('application/json')
        ? await req.json().catch(() => null)
        : {}
      if (!body || typeof body !== 'object') return json({}, 400)
      const viewer = viewerFrom(
        route === 'auth'
          ? body.token
          : req.headers.get('authorization')?.replace(/^Bearer /, ''),
      )
      if(route==='memories' || route==='memory'){
        if(route==='memory'){
          if(!validKey(body.key)||!validFrame(body.frame))return json({},400)
          const image=await readFrame(memoryRoot,viewer.id,body.key,body.frame)
          return image?new Response(new Uint8Array(image),{headers:{...cors,'Content-Type':'image/jpeg'}}):json({},404)
        }
        const read=async()=>({photos:await listMemories(memoryRoot,viewer.id),latest:db.query("SELECT state,created,shown_at FROM requests WHERE viewer=? ORDER BY id DESC LIMIT 1").get(viewer.id)})
        const snap=await read()
        if(body.since===JSON.stringify(snap)){
          server.timeout(req,30)
          await new Promise<void>(resolve=>{
            const done=()=>{clearTimeout(timer);changed.removeEventListener('jobs',done);req.signal.removeEventListener('abort',done);resolve()}
            const timer=setTimeout(done,20000)
            changed.addEventListener('jobs',done,{once:true}); req.signal.addEventListener('abort',done,{once:true})
            if(req.signal.aborted)done()
          })
          return json(await read())
        }
        return json(snap)
      }
      const stream = await streamId()
      if (route === 'auth') {
        const last = db
          .query<{ created: number }, [string, string]>(
            'SELECT created FROM requests WHERE viewer=? AND stream=? ORDER BY created DESC LIMIT 1',
          )
          .get(viewer.id, stream || '')
        return json({
          user: {
            id: viewer.id,
            jwtToken: body.token,
            owner: viewer.owner,
            cooldowns: {
              giphy: Math.max(
                0,
                Math.ceil(((last?.created || 0) + 60000 - Date.now()) / 1000),
              ),
            },
          },
          currentStream: stream ? { id: stream } : null,
        })
      }
      if (!stream)
        return json({ success: false, error: 'Der Stream ist offline.' }, 409)
      if (route === 'send') {
        const media = body.id
        const message = body.userMessage ?? ''
        if (
          typeof media !== 'string' ||
          !(library.has(media) || /^[A-Za-z0-9]{1,80}$/.test(media)) ||
          typeof message !== 'string' ||
          message.length > 128
        )
          return json({}, 400)
        const author = await helix('users?id=' + viewer.id)
        if (!author?.display_name) throw Error('Viewer unavailable')
        submit(stream, viewer.id, author.display_name, author.profile_image_url || null, media, message.trim())
        signalJobs()
        return json({ success: true })
      }
      return json({}, 403)
    } catch (err) {
      return json(
        {
          success: false,
          error:
            err instanceof Refusal
              ? err.message
              : 'Stream Actions ist gerade nicht erreichbar.',
        },
        err instanceof Refusal ? err.status : 503,
      )
    }
  },
})
console.log('Stream Actions listening on port', server.port)



// Resume approved items after a service restart only for the current live stream.
if(db.query("SELECT 1 FROM requests WHERE state='ready' AND created>? LIMIT 1").get(Date.now()-600000)) {
  void streamId().then(stream=>{if(stream)playNext(stream)}).catch(()=>{})
}
