import { Database } from 'bun:sqlite'
import { createHmac, timingSafeEqual } from 'node:crypto'
import catalog from '../src/catalog.json'
import { channelId } from '../src/channel'
import { deriveDesktopKey } from './desktop-credential'
import { listMemories, pruneMemories, readFrame, RetentionJob, saveMemory, validFrame, validKey } from './memories'
import { statusCallbackUrl } from './public-url'
import { RateLimiter, TtlCache } from './rate-limit'
import { SseHub } from './sse'
import { ActionsStore, Refusal, type Entry } from './store'
import { StreamState } from './stream-state'
import { receiveStreamStatus, webhookSecret } from './stream-status'

export const displayMs = 10000

export interface HelixReader { first(path: string): Promise<Record<string, unknown> | undefined> }
// The parts of Bun's Server this app uses.
export interface ServerControls {
  timeout(req: Request, seconds: number): void
  requestIP(req: Request): { address: string } | null
}
export interface AppOptions {
  secret: Buffer
  helix: HelixReader
  dbPath: string
  memoryRoot: string
  publicBaseUrl: string
  stageDir: string
  // Header with the viewer's address set by the reverse proxy (for example x-real-ip); unset means the socket address.
  clientIpHeader?: string
  now?: () => number
}

const library = new Set(catalog.map((item) => item.id))
const cors = {
  'Access-Control-Allow-Origin': 'https://rzayw76j3drs9vzexj712achlc6bfi.ext-twitch.tv',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
}
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: cors })
// Plain JSON object or null; avoids casting request bodies.
const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : null
const sameSecret = (provided: string, expected: string) => {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function createApp(options: AppOptions) {
  const now = options.now ?? Date.now
  const { secret, helix } = options
  const store = new ActionsStore(new Database(options.dbPath, { create: true }))
  const desktopKey = deriveDesktopKey(secret)
  const signingKey = webhookSecret(secret)
  const callback = statusCallbackUrl(options.publicBaseUrl)
  const streams = new StreamState(async () => {
    const row = await helix.first('streams?user_id=' + channelId)
    return typeof row?.id === 'string' ? row.id : null
  }, now)
  const hub = new SseHub({ maxTotal: 300, maxPerIp: 6, keepaliveMs: 25000 })
  const retention = new RetentionJob((at) => pruneMemories(options.memoryRoot, at), now)
  const names = new TtlCache<{ name: string; avatar: string | null }>(10 * 60 * 1000, 5000, now)
  const limits = {
    send: new RateLimiter(6, 60000, now),
    auth: new RateLimiter(30, 60000, now),
    memories: new RateLimiter(60, 60000, now),
    memory: new RateLimiter(120, 60000, now),
  }
  const changed = new EventTarget()
  const signalJobs = () => changed.dispatchEvent(new Event('jobs'))

  let active: (Entry & { until: number }) | null = null
  let displayTimer: ReturnType<typeof setTimeout> | undefined
  const current = () => (active && active.until > now() ? active : null)
  // The stage gets the remaining time, not a server timestamp, so a skewed clock on the PC changes nothing.
  const frame = () => {
    const entry = current()
    return 'data: ' + JSON.stringify(entry && { id: entry.id, author: entry.author, avatar: entry.avatar, media: entry.media, message: entry.message, remainingMs: entry.until - now() }) + '\n\n'
  }
  const publish = () => hub.broadcast(frame())

  function endActive() {
    clearTimeout(displayTimer)
    displayTimer = undefined
    active = null
  }
  function playNext(stream: string) {
    if (current()) return
    const item = store.takeNextReady(stream, now())
    if (!item) return
    active = { ...item, until: now() + displayMs }
    signalJobs()
    publish()
    clearTimeout(displayTimer)
    displayTimer = setTimeout(() => {
      endActive()
      publish()
      signalJobs()
      playNext(stream)
    }, displayMs)
  }
  function playIfLive() {
    const stream = streams.known()
    if (stream) playNext(stream)
  }

  function updateStream(id: string | null, timestamp: number) {
    if (!streams.applyEventSub(id, timestamp)) return
    endActive()
    publish()
    signalJobs()
    hub.broadcast('event: stream-status\ndata: changed\n\n')
  }

  function removeReaction(id: number) {
    const removed = store.remove(id)
    if (active?.id === id) {
      endActive()
      publish()
    }
    signalJobs()
    playIfLive()
    return removed
  }

  // Long-poll helper: resolves on the next change, after the timeout or when the client goes away.
  function waitForChange(req: Request, ms: number) {
    return new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timeout)
        changed.removeEventListener('jobs', done)
        req.signal.removeEventListener('abort', done)
        resolve()
      }
      const timeout = setTimeout(done, ms)
      changed.addEventListener('jobs', done, { once: true })
      req.signal.addEventListener('abort', done, { once: true })
      if (req.signal.aborted) done()
    })
  }

  function viewerFrom(token: unknown) {
    try {
      if (typeof token !== 'string' || token.length > 8192) throw Error()
      const [head, body, sig, extra] = token.split('.')
      if (!head || !body || !sig || extra !== undefined) throw Error()
      const digest = createHmac('sha256', secret).update(head + '.' + body).digest()
      const signature = Buffer.from(sig, 'base64url')
      if (signature.length !== digest.length || !timingSafeEqual(signature, digest)) throw Error()
      const claims = JSON.parse(Buffer.from(body, 'base64url').toString())
      const seconds = now() / 1000
      if (
        JSON.parse(Buffer.from(head, 'base64url').toString()).alg !== 'HS256' ||
        !Number.isFinite(claims.exp) ||
        claims.exp <= seconds ||
        claims.nbf > seconds ||
        claims.channel_id !== channelId ||
        typeof claims.user_id !== 'string' ||
        !/^\d+$/.test(claims.user_id) ||
        !String(claims.opaque_user_id).startsWith('U') ||
        !['viewer', 'moderator', 'broadcaster'].includes(claims.role)
      )
        throw Error()
      return String(claims.user_id)
    } catch {
      throw new Refusal(401, 'Bitte Twitch-ID erneut freigeben.')
    }
  }

  function limit(route: keyof typeof limits, viewer: string) {
    if (!limits[route].take(viewer)) throw new Refusal(429, 'Zu viele Anfragen. Warte einen Moment.')
  }

  async function displayName(viewer: string) {
    const cached = names.get(viewer)
    if (cached) return cached
    const row = await helix.first('users?id=' + viewer)
    if (typeof row?.display_name !== 'string' || !row.display_name) throw Error('Viewer unavailable')
    const found = { name: row.display_name, avatar: typeof row.profile_image_url === 'string' ? row.profile_image_url : null }
    names.set(viewer, found)
    return found
  }

  const queueSnapshot = () => ({
    autoApprove: store.autoApprove(),
    active: current() && { id: active?.id, author: active?.author, media: active?.media, message: active?.message },
    queued: store.queued(now()),
  })

  // Expiry of a job whose stream already ended uses the last known state only; no Helix call on the desktop path.
  function expireUnlessKnown(id: number) {
    const stream = streams.known()
    if (stream !== undefined) store.expireUnlessStream(id, stream)
  }

  async function desktopJob(req: Request, server: ServerControls) {
    if (!sameSecret(req.headers.get('Authorization') || '', 'Bearer ' + desktopKey)) return new Response(null, { status: 403 })
    const body = record(await req.json().catch(() => null))
    if (!body) return json({}, 400)
    const field = (name: string): unknown => body[name]
    const action = field('action')
    const id = field('id')
    switch (action) {
      case 'next': {
        const queue = field('queue')
        if (queue !== 'pending' && queue !== 'held') return json({}, 400)
        server.timeout(req, 30)
        let item = store.nextJob(queue, now())
        if (!item) {
          await waitForChange(req, 20000)
          item = store.nextJob(queue, now())
        }
        return json({ item })
      }
      case 'checked': {
        const reason = field('reason')
        if (!Number.isSafeInteger(id) || typeof reason !== 'string') return json({}, 400)
        store.applyCheck(Number(id), reason, now())
        expireUnlessKnown(Number(id))
        signalJobs()
        playIfLive()
        return json({ state: store.state(Number(id)) })
      }
      case 'ready':
      case 'rejected': {
        if (!Number.isSafeInteger(id)) return json({}, 400)
        store.decide(Number(id), action === 'ready', now())
        expireUnlessKnown(Number(id))
        signalJobs()
        playIfLive()
        return json({ state: store.state(Number(id)) })
      }
      case 'settings': {
        const value = field('autoApprove')
        if (value !== undefined && typeof value !== 'boolean') return json({}, 400)
        if (typeof value === 'boolean' && value !== store.autoApprove()) {
          store.setAutoApprove(value)
          signalJobs()
        }
        return json({ autoApprove: store.autoApprove() })
      }
      case 'queue': {
        server.timeout(req, 30)
        const since = field('since')
        let snapshot = queueSnapshot()
        if (since === JSON.stringify(snapshot)) {
          await waitForChange(req, 20000)
          snapshot = queueSnapshot()
        }
        return json(snapshot)
      }
      case 'remove': {
        if (!Number.isSafeInteger(id)) return json({}, 400)
        return json({ removed: removeReaction(Number(id)) })
      }
      default:
        return json({}, 400)
    }
  }

  async function cameraUpload(req: Request, route: string) {
    if (!sameSecret(req.headers.get('authorization') || '', 'Bearer ' + desktopKey)) return json({}, 403)
    const match = /^camera\/([1-9]\d*)\/([1-9])$/.exec(route)
    const shot = Number(match?.[2])
    if (!match || !validFrame(shot) || req.headers.get('content-type') !== 'image/jpeg') return json({}, 400)
    const id = Number(match[1])
    const row = store.shownForCamera(id, now())
    if (!row) return json({}, 404)
    const suffix = createHmac('sha256', secret).update('photo/' + row.created + '/' + id).digest('hex').slice(0, 32)
    const key = row.created + '-' + suffix.slice(0, 8) + '-' + suffix.slice(8, 12) + '-' + suffix.slice(12, 16) + '-' + suffix.slice(16, 20) + '-' + suffix.slice(20)
    await saveMemory(options.memoryRoot, row.viewer, key, shot, row.media, new Uint8Array(await req.arrayBuffer()))
    void retention.afterWrite()
    signalJobs()
    return json({ success: true })
  }

  function events(req: Request, server: ServerControls) {
    const header = options.clientIpHeader ? req.headers.get(options.clientIpHeader)?.split(',')[0]?.trim() : undefined
    const ip = header || server.requestIP(req)?.address || 'unknown'
    const refused = hub.admit(ip)
    if (refused) return new Response(null, { status: refused === 'ip' ? 429 : 503, headers: { 'Retry-After': '30' } })
    server.timeout(req, 0)
    return hub.open(ip, frame, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no', 'Access-Control-Allow-Origin': '*' })
  }

  async function viewerRoute(req: Request, route: string, server: ServerControls) {
    const body = req.headers.get('content-type')?.includes('application/json') ? record(await req.json().catch(() => null)) : {}
    if (!body) return json({}, 400)
    const field = (name: string): unknown => body[name]
    const viewer = viewerFrom(route === 'auth' ? field('token') : req.headers.get('authorization')?.replace(/^Bearer /, ''))
    if (route === 'memory') {
      limit('memory', viewer)
      const key = field('key')
      const shot = field('frame')
      if (!validKey(key) || !validFrame(shot)) return json({}, 400)
      const image = await readFrame(options.memoryRoot, viewer, key, shot)
      return image ? new Response(image, { headers: { ...cors, 'Content-Type': 'image/jpeg' } }) : json({}, 404)
    }
    if (route === 'memories') {
      limit('memories', viewer)
      const read = async () => ({ photos: await listMemories(options.memoryRoot, viewer), latest: store.latestForViewer(viewer) })
      const snapshot = await read()
      if (field('since') !== JSON.stringify(snapshot)) return json(snapshot)
      server.timeout(req, 30)
      await waitForChange(req, 20000)
      return json(await read())
    }
    if (route === 'auth') {
      limit('auth', viewer)
      const stream = await streams.current()
      const last = store.lastSubmission(viewer)
      return json({
        user: {
          id: viewer,
          jwtToken: field('token'),
          cooldowns: { giphy: Math.max(0, Math.ceil(((last ?? 0) + 60000 - now()) / 1000)) },
        },
        currentStream: stream ? { id: stream } : null,
      })
    }
    if (route === 'send') {
      limit('send', viewer)
      const media = field('id')
      const message = field('userMessage') ?? ''
      if (typeof media !== 'string' || !(library.has(media) || /^[A-Za-z0-9]{1,80}$/.test(media)) || typeof message !== 'string' || message.length > 128) return json({}, 400)
      // Cooldown first: a refused viewer never causes a Helix call.
      store.checkSubmission(viewer, null, now())
      const stream = await streams.current()
      if (!stream) return json({ success: false, error: 'Der Stream ist offline.' }, 409)
      store.checkSubmission(viewer, stream, now())
      const author = await displayName(viewer)
      store.submit({ stream, viewer, author: author.name, avatar: author.avatar, media, message: message.trim() }, now())
      signalJobs()
      return json({ success: true })
    }
    return json({}, 403)
  }

  async function fetch(req: Request, server: ServerControls): Promise<Response> {
    const path = new URL(req.url).pathname
    if (!path.startsWith('/stream-actions/')) return new Response(null, { status: 404 })
    const route = path.slice('/stream-actions/'.length)
    // Liveness for the container healthcheck: no secrets, no database access.
    if (route === 'health' && req.method === 'GET') return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
    try {
      if (route.startsWith('camera/') && req.method === 'POST') return await cameraUpload(req, route)
      if (Number(req.headers.get('content-length')) > 16384) return json({}, 413)
      if (route === 'desktop-job' && req.method === 'POST') return await desktopJob(req, server)
      if (route === 'twitch-status' && req.method === 'POST') return await receiveStreamStatus(req, signingKey, channelId, callback, updateStream)
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
      if (req.method === 'GET' && route === 'events') return events(req, server)
      if (req.method === 'GET' && /^(stage\.html|assets\/[\w.-]+|pilze\/[\w-]+\.webp)$/.test(route)) {
        const file = Bun.file(options.stageDir + '/' + route)
        return (await file.exists()) ? new Response(file) : new Response(null, { status: 404 })
      }
      if (req.method !== 'POST') return json({}, 404)
      return await viewerRoute(req, route, server)
    } catch (err) {
      return json(
        { success: false, error: err instanceof Refusal ? err.message : 'Stream Actions ist gerade nicht erreichbar.' },
        err instanceof Refusal ? err.status : 503,
      )
    }
  }

  // Resume approved items after a restart, only for the current live stream.
  function resume() {
    if (!store.hasReady(now())) return
    void streams
      .current()
      .then((stream) => {
        if (stream) playNext(stream)
      })
      .catch(() => {})
  }

  function close() {
    endActive()
    hub.close()
  }

  return { fetch, resume, close }
}
