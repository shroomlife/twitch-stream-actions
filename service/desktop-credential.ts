import { createHmac } from 'node:crypto'

// The desktop tools authenticate with a key derived from the extension secret; the raw secret stays off the PC.
const purpose = 'stream-actions/desktop-worker/v1'
export const credentialService = 'stream-control'
export const desktopKeyName = 'stream-actions-desktop-key'
// Older setups kept the raw extension secret under this name; it is migrated once and then deleted.
export const legacySecretName = 'twitch-extension-secret'

export function deriveDesktopKey(extensionSecret: Buffer): string {
  return createHmac('sha256', extensionSecret).update(purpose).digest('hex')
}

export const validDesktopKey = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)

// Accepts the Key field from the Twitch console (base64, optionally quoted); returns null when it is not one.
export function parseExtensionSecret(input: string): Buffer | null {
  const value = input.trim().replace(/^(['"])(.*)\1$/, '$2').trim()
  const bytes = Buffer.from(value, 'base64')
  const encoded = bytes.toString('base64')
  if (bytes.length < 16 || (value !== encoded && value !== encoded.replace(/=+$/, ''))) return null
  return bytes
}

interface Name { service: string; name: string }
export interface SecretStore {
  get(options: Name): Promise<string | null>
  set(options: Name & { value: string }): Promise<void>
  delete(options: Name): Promise<boolean>
}

export async function loadDesktopKey(store: SecretStore = Bun.secrets, notice: (message: string) => void = console.warn): Promise<string> {
  const stored = await store.get({ service: credentialService, name: desktopKeyName })
  if (validDesktopKey(stored)) return stored
  const raw = await store.get({ service: credentialService, name: legacySecretName })
  const secret = raw ? parseExtensionSecret(raw) : null
  if (!secret) throw Error('Der Desktop-Schlüssel fehlt. Starte service/store-extension-secret.ps1.')
  const key = deriveDesktopKey(secret)
  await store.set({ service: credentialService, name: desktopKeyName, value: key })
  await store.delete({ service: credentialService, name: legacySecretName })
  notice('Stream Actions: Der Desktop-Schlüssel wurde abgeleitet und gespeichert. Das Extension Secret wurde aus der Windows-Anmeldeinformationsverwaltung gelöscht.')
  return key
}
