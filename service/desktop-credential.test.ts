import { expect, test } from 'bun:test'
import { createHmac } from 'node:crypto'
import { deriveDesktopKey, loadDesktopKey, parseExtensionSecret, type SecretStore } from './desktop-credential'

function memoryStore(entries: Record<string, string>) {
  const calls: string[] = []
  const store: SecretStore = {
    async get({ name }) { calls.push('get ' + name); return entries[name] ?? null },
    async set({ name, value }) { calls.push('set ' + name); entries[name] = value },
    async delete({ name }) { calls.push('delete ' + name); const had = name in entries; delete entries[name]; return had },
  }
  return { store, calls, entries }
}
const secret = Buffer.alloc(32, 9)
const expected = createHmac('sha256', secret).update('stream-actions/desktop-worker/v1').digest('hex')

test('the desktop key is the HMAC the service expects', () => {
  expect(deriveDesktopKey(secret)).toBe(expected)
})

test('a raw extension secret is migrated once: derived key stored, raw secret deleted, with a notice', async () => {
  const { store, entries } = memoryStore({ 'twitch-extension-secret': secret.toString('base64') })
  const notices: string[] = []
  expect(await loadDesktopKey(store, (m) => notices.push(m))).toBe(expected)
  expect(entries).toEqual({ 'stream-actions-desktop-key': expected })
  expect(notices).toHaveLength(1)
  expect(notices[0]).toContain('gelöscht')
  expect(notices[0]).not.toContain(secret.toString('base64'))
  // The second start reads only the derived key.
  const again = memoryStore({ ...entries })
  expect(await loadDesktopKey(again.store, () => { throw Error('no notice expected') })).toBe(expected)
  expect(again.calls).toEqual(['get stream-actions-desktop-key'])
})

test('without any credential the worker fails with a clear message', async () => {
  await expect(loadDesktopKey(memoryStore({}).store)).rejects.toThrow('store-extension-secret.ps1')
})

test('the console Key field is accepted with or without quotes and padding', () => {
  const b64 = secret.toString('base64')
  expect(parseExtensionSecret(' "' + b64 + '" ')?.equals(secret)).toBe(true)
  expect(parseExtensionSecret(b64.replace(/=+$/, ''))?.equals(secret)).toBe(true)
  expect(parseExtensionSecret('rzayw76j3drs9vzexj712achlc6bfi')).toBeNull()
  expect(parseExtensionSecret('c2hvcnQ=')).toBeNull()
})
