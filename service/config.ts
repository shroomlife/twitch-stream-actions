import { readFileSync } from 'node:fs'

export type Environment = Readonly<Record<string, string | undefined>>
export type ReadText = (path: string) => string

export interface Secrets {
  extensionSecret: Buffer
  clientId: string
  clientSecret: string
}

const readUtf8: ReadText = (path) => readFileSync(path, 'utf8')

// A secret comes from NAME or from the file named in NAME_FILE (Docker secrets convention), never from both.
// Errors name the variable and the path only, never the value.
export function readSecret(env: Environment, name: string, read: ReadText = readUtf8): string | undefined {
  const direct = env[name]
  const path = env[name + '_FILE']
  if (direct && path) throw Error(`Set either ${name} or ${name}_FILE, not both`)
  if (!path) return direct?.trim() || undefined
  let content: string
  try {
    content = read(path)
  } catch {
    throw Error(`Cannot read ${name}_FILE at ${path}`)
  }
  return content.trim() || undefined
}

export function loadSecrets(env: Environment, read: ReadText = readUtf8): Secrets {
  const extension = readSecret(env, 'TWITCH_EXTENSION_SECRET', read)
  const clientId = readSecret(env, 'TWITCH_CLIENT_ID', read)
  const clientSecret = readSecret(env, 'TWITCH_CLIENT_SECRET', read)
  const missing = [
    ['TWITCH_EXTENSION_SECRET', extension],
    ['TWITCH_CLIENT_ID', clientId],
    ['TWITCH_CLIENT_SECRET', clientSecret],
  ].filter(([, value]) => !value).map(([name]) => name)
  if (missing.length || !extension || !clientId || !clientSecret)
    throw Error(`Missing secrets: ${missing.join(', ')} (set NAME or NAME_FILE)`)
  const extensionSecret = Buffer.from(extension, 'base64')
  if (extensionSecret.length < 16)
    throw Error('TWITCH_EXTENSION_SECRET must be the base64 signing secret of the Twitch extension')
  return { extensionSecret, clientId, clientSecret }
}
