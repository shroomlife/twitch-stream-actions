import { expect, test } from 'bun:test'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadSecrets, readSecret } from './config'

const signing = Buffer.alloc(32, 7).toString('base64')

test('a secret file is read once and trimmed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'stream-actions-config-'))
  const file = join(dir, 'client_id')
  await writeFile(file, '  abc123\r\n')
  expect(readSecret({ TWITCH_CLIENT_ID_FILE: file }, 'TWITCH_CLIENT_ID')).toBe('abc123')
  let reads = 0
  const read = () => { reads++; return 'x\n' }
  expect(readSecret({ A_FILE: '/run/a' }, 'A', read)).toBe('x')
  expect(reads).toBe(1)
})

test('the plain variable still works and blank values count as missing', () => {
  expect(readSecret({ A: ' value ' }, 'A')).toBe('value')
  expect(readSecret({ A: '   ' }, 'A')).toBeUndefined()
  expect(readSecret({ A_FILE: '/run/a' }, 'A', () => '\n')).toBeUndefined()
  expect(readSecret({}, 'A')).toBeUndefined()
})

test('both sources at once and unreadable files fail without leaking the value', () => {
  expect(() => readSecret({ A: 'top-secret', A_FILE: '/run/a' }, 'A')).toThrow('Set either A or A_FILE, not both')
  try {
    readSecret({ A_FILE: '/does/not/exist' }, 'A', () => { throw Error('ENOENT') })
    throw Error('expected a failure')
  } catch (err) {
    expect(err instanceof Error && err.message).toBe('Cannot read A_FILE at /does/not/exist')
  }
})

test('loading names every missing secret and checks the signing secret', () => {
  expect(() => loadSecrets({ TWITCH_CLIENT_ID: 'id' })).toThrow(
    'Missing secrets: TWITCH_EXTENSION_SECRET, TWITCH_CLIENT_SECRET (set NAME or NAME_FILE)',
  )
  expect(() => loadSecrets({ TWITCH_EXTENSION_SECRET: 'c2hvcnQ=', TWITCH_CLIENT_ID: 'id', TWITCH_CLIENT_SECRET: 's' })).toThrow(
    'TWITCH_EXTENSION_SECRET must be the base64 signing secret of the Twitch extension',
  )
  const files: Record<string, string> = { '/run/ext': signing + '\n', '/run/id': 'id\n', '/run/secret': 'secret\n' }
  const secrets = loadSecrets(
    { TWITCH_EXTENSION_SECRET_FILE: '/run/ext', TWITCH_CLIENT_ID_FILE: '/run/id', TWITCH_CLIENT_SECRET_FILE: '/run/secret' },
    (path) => files[path] ?? '',
  )
  expect(secrets.clientId).toBe('id')
  expect(secrets.clientSecret).toBe('secret')
  expect(secrets.extensionSecret.equals(Buffer.alloc(32, 7))).toBe(true)
})
