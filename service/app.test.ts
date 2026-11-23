import { afterEach, expect, test } from 'bun:test'
import { createHmac } from 'node:crypto'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp, type ServerControls } from './app'
import { deriveDesktopKey } from './desktop-credential'
import { webhookSecret } from './stream-status'

const secret = Buffer.alloc(32, 3)
const desktopKey = deriveDesktopKey(secret)
const base = 'https://actions.example'
const server: ServerControls = { timeout() {}, requestIP: () => ({ address: '10.0.0.1' }) }
const apps: { close(): void }[] = []
afterEach(() => { for (const app of apps.splice(0)) app.close() })

function viewerToken(userId: string) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const head = encode({ alg: 'HS256', typ: 'JWT' })
  const body = encode({ exp: 4_000_000_000, channel_id: '137290088', user_id: userId, opaque_user_id: 'U' + userId, role: 'viewer' })
  return head + '.' + body + '.' + createHmac('sha256', secret).update(head + '.' + body).digest('base64url')
}

async function setup(stream: string | null = 'live-1') {
  const dir = await mkdtemp(join(tmpdir(), 'stream-actions-app-'))
  const calls: string[] = []
  let now = 1_800_000_000_000
  const app = createApp({
    secret,
    dbPath: join(dir, 'actions.sqlite'),
    memoryRoot: join(dir, 'reaction-photos'),
    publicBaseUrl: base,
    stageDir: dir,
    now: () => now,
    helix: {
      async first(path) {
        calls.push(path.split('?')[0])
        if (path.startsWith('streams')) return stream ? { id: stream } : undefined
        return { display_name: 'Viewer' + path.slice(-3), profile_image_url: 'https://static-cdn.jtvnw.net/x.png' }
      },
    },
  })
  apps.push(app)
  const post = (route: string, body: object, auth?: string) =>
    app.fetch(new Request(base + '/stream-actions/' + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer ' + auth } : {}) }, body: JSON.stringify(body) }), server)
  const desktop = async (body: object) => (await post('desktop-job', body, desktopKey)).json()
  const send = (viewer: string, media = 'pilz-wave') => post('send', { id: media, userMessage: 'Hallo' }, viewerToken(viewer))
  const events = async () => {
    const res = await app.fetch(new Request(base + '/stream-actions/events'), server)
    const reader = res.body?.getReader()
    const decoder = new TextDecoder()
    return { res, next: async () => decoder.decode((await reader?.read())?.value), cancel: () => reader?.cancel() }
  }
  return { app, calls, post, desktop, send, events, advance: (ms: number) => { now += ms } }
}

const dataOf = (text: string) => JSON.parse(text.replace(/^data: /, ''))

test('a refused submission never reaches Helix and display names are cached', async () => {
  const t = await setup()
  expect((await t.send('100')).status).toBe(200)
  expect(t.calls).toEqual(['streams', 'users'])
  const refused = await t.send('100')
  expect(refused.status).toBe(429)
  expect((await refused.json()).error).toContain('einmal pro Minute')
  expect(t.calls).toEqual(['streams', 'users'])
  t.advance(60000)
  expect((await t.send('100')).status).toBe(200)
  // A minute later the stream is looked up again, the display name comes from the cache.
  expect(t.calls.filter((call) => call === 'users')).toHaveLength(1)
})

test('a viewer hammering an endpoint gets 429 from the per-user limit', async () => {
  const t = await setup()
  const statuses: number[] = []
  for (let i = 0; i < 31; i++) statuses.push((await t.post('auth', { token: viewerToken('200') })).status)
  expect(statuses.slice(0, 30).every((status) => status === 200)).toBe(true)
  expect(statuses[30]).toBe(429)
  expect((await t.post('auth', { token: viewerToken('201') })).status).toBe(200)
})

test('auth no longer exposes an owner flag', async () => {
  const t = await setup()
  const data = await (await t.post('auth', { token: viewerToken('300') })).json()
  expect(data.user).not.toHaveProperty('owner')
  expect(data.currentStream).toEqual({ id: 'live-1' })
})

test('with the switch on a clean submission plays; off, it waits for Robin', async () => {
  const t = await setup()
  expect(await t.desktop({ action: 'settings' })).toEqual({ autoApprove: true })
  const feed = await t.events()
  expect(dataOf(await feed.next())).toBeNull()
  await t.send('400')
  const job = (await t.desktop({ action: 'next', queue: 'pending' })).item
  expect(await t.desktop({ action: 'checked', id: job.id, reason: '' })).toEqual({ state: 'shown' })
  const shown = dataOf(await feed.next())
  expect(shown).toMatchObject({ id: job.id, author: 'Viewer400', media: 'pilz-wave', remainingMs: 10000 })
  expect(shown).not.toHaveProperty('until')

  expect(await t.desktop({ action: 'settings', autoApprove: false })).toEqual({ autoApprove: false })
  await t.send('401')
  const second = (await t.desktop({ action: 'next', queue: 'pending' })).item
  expect(await t.desktop({ action: 'checked', id: second.id, reason: '' })).toEqual({ state: 'held' })
  const held = (await t.desktop({ action: 'next', queue: 'held' })).item
  expect(held).toMatchObject({ id: second.id, reason: 'Automatische Freigabe ist aus.' })
  feed.cancel()
})

test('a held decision is idempotent and needs no Helix call', async () => {
  const t = await setup()
  await t.send('500')
  const job = (await t.desktop({ action: 'next', queue: 'pending' })).item
  await t.desktop({ action: 'checked', id: job.id, reason: 'sexual' })
  const before = t.calls.length
  expect(await t.desktop({ action: 'rejected', id: job.id })).toEqual({ state: 'rejected' })
  expect(await t.desktop({ action: 'ready', id: job.id })).toEqual({ state: 'rejected' })
  expect(t.calls.length).toBe(before)
})

test('Robin removes the visible reaction and a queued one; neither is replayed', async () => {
  const t = await setup()
  const feed = await t.events()
  await feed.next()
  for (const viewer of ['600', '601']) {
    await t.send(viewer)
    const job = (await t.desktop({ action: 'next', queue: 'pending' })).item
    await t.desktop({ action: 'checked', id: job.id, reason: '' })
  }
  const visible = dataOf(await feed.next())
  const queue = await t.desktop({ action: 'queue' })
  expect(queue.active).toMatchObject({ id: visible.id, author: 'Viewer600' })
  expect(queue.queued.map((item: { author: string }) => item.author)).toEqual(['Viewer601'])
  const queuedId = queue.queued[0].id
  expect(await t.desktop({ action: 'remove', id: queuedId })).toEqual({ removed: true })
  expect(await t.desktop({ action: 'remove', id: visible.id })).toEqual({ removed: true })
  expect(dataOf(await feed.next())).toBeNull()
  const after = await t.desktop({ action: 'queue' })
  expect(after.active).toBeNull()
  expect(after.queued).toEqual([])
  feed.cancel()
})

test('EventSub decides the stream state; Helix is not asked afterwards', async () => {
  const t = await setup('helix-stream')
  const status = async (type: 'stream.online' | 'stream.offline', id: string, at: Date) => {
    const body = JSON.stringify({
      subscription: { type, condition: { broadcaster_user_id: '137290088' }, transport: { method: 'webhook', callback: base + '/stream-actions/twitch-status' } },
      event: { id, broadcaster_user_id: '137290088' },
    })
    const messageId = crypto.randomUUID()
    const time = at.toISOString()
    const signature = 'sha256=' + createHmac('sha256', webhookSecret(secret)).update(messageId).update(time).update(body).digest('hex')
    return t.app.fetch(
      new Request(base + '/stream-actions/twitch-status', {
        method: 'POST',
        headers: { 'Twitch-Eventsub-Message-Id': messageId, 'Twitch-Eventsub-Message-Timestamp': time, 'Twitch-Eventsub-Message-Signature': signature, 'Twitch-Eventsub-Message-Type': 'notification' },
        body,
      }),
      server,
    )
  }
  expect((await status('stream.offline', 'x', new Date())).status).toBe(204)
  t.advance(60000)
  const data = await (await t.post('auth', { token: viewerToken('700') })).json()
  expect(data.currentStream).toBeNull()
  expect(t.calls).not.toContain('streams')
})

test('the event feed is capped per address', async () => {
  const t = await setup()
  const feeds = []
  for (let i = 0; i < 6; i++) feeds.push(await t.events())
  expect(feeds.every((feed) => feed.res.status === 200)).toBe(true)
  expect((await t.events()).res.status).toBe(429)
  for (const feed of feeds) feed.cancel()
})

test('the desktop channel refuses a wrong key', async () => {
  const t = await setup()
  expect((await t.post('desktop-job', { action: 'settings', autoApprove: false }, 'f'.repeat(64))).status).toBe(403)
  expect(await t.desktop({ action: 'settings' })).toEqual({ autoApprove: true })
})
