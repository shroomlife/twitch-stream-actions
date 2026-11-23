import { afterAll, beforeAll, expect, test } from 'bun:test'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let base = ''
let stop: () => void = () => {}

beforeAll(async () => {
  const dir = await mkdtemp(join(tmpdir(), 'stream-actions-health-'))
  const secretFiles = {
    TWITCH_EXTENSION_SECRET_FILE: Buffer.alloc(32, 1).toString('base64'),
    TWITCH_CLIENT_ID_FILE: 'test-client',
    TWITCH_CLIENT_SECRET_FILE: 'test-secret',
  }
  for (const [name, value] of Object.entries(secretFiles)) {
    const file = join(dir, name)
    await writeFile(file, value + '\n')
    process.env[name] = file
    // The file is the only source; a plain variable from the developer's shell would be ambiguous.
    delete process.env[name.slice(0, -'_FILE'.length)]
  }
  process.env.ACTIONS_HOST = '127.0.0.1'
  process.env.PORT = '0'
  process.env.ACTIONS_DB = join(dir, 'actions.sqlite')
  // The server starts on import, so the environment above must be in place first.
  const { server } = await import('./server')
  base = server.url.origin
  stop = () => { void server.stop(true) }
})

afterAll(() => stop())

test('GET /stream-actions/health answers ok without credentials', async () => {
  const res = await fetch(base + '/stream-actions/health')
  expect(res.status).toBe(200)
  expect(res.headers.get('cache-control')).toBe('no-store')
  expect(await res.json()).toEqual({ ok: true })
})

test('health is read-only', async () => {
  const res = await fetch(base + '/stream-actions/health', { method: 'POST' })
  expect(res.status).not.toBe(200)
})
