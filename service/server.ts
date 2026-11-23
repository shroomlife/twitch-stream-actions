import { dirname, join } from 'node:path'
import { createApp } from './app'
import { loadSecrets } from './config'
import { Helix } from './helix'
import { publicBaseUrl } from './public-url'

// Read once at start; fails fast with the names of missing secrets, never their values.
const { extensionSecret, clientId, clientSecret } = loadSecrets(process.env)
const dbPath = process.env.ACTIONS_DB || 'stream-actions.sqlite'
const app = createApp({
  secret: extensionSecret,
  helix: new Helix(clientId, clientSecret),
  dbPath,
  memoryRoot: join(dirname(dbPath), 'reaction-photos'),
  publicBaseUrl: publicBaseUrl(process.env),
  stageDir: join(import.meta.dir, '..', 'stage-dist'),
  clientIpHeader: process.env.CLIENT_IP_HEADER?.trim().toLowerCase() || undefined,
})

export const server = Bun.serve({
  hostname: process.env.ACTIONS_HOST || '127.0.0.1',
  port: Number(process.env.PORT || 27019),
  maxRequestBodySize: 2 * 1024 * 1024,
  fetch: (req, bunServer) => app.fetch(req, bunServer),
})
console.log('Stream Actions listening on port', server.port)
app.resume()
