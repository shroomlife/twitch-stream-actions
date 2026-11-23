// Brings the EventSub webhooks for stream.online/stream.offline in line with PUBLIC_BASE_URL.
// Dry run by default (prints the plan); `bun service/eventsub-setup.ts --apply` changes the subscriptions. Secrets are never printed.
import { channelId } from '../src/channel'
import { loadSecrets } from './config'
import { createBody, isSubscription, planSubscriptions, type Subscription } from './eventsub-plan'
import { Helix } from './helix'
import { publicBaseUrl, statusCallbackUrl } from './public-url'
import { webhookSecret } from './stream-status'

async function listAll(helix: Helix, type: string): Promise<Subscription[]> {
  const found: Subscription[] = []
  let after = ''
  for (;;) {
    const res = await helix.request('GET', 'eventsub/subscriptions?type=' + encodeURIComponent(type) + (after ? '&after=' + encodeURIComponent(after) : ''))
    if (!res.ok) throw Error('Listing subscriptions failed (' + res.status + ')')
    const page = (await res.json()) as { data?: unknown[]; pagination?: { cursor?: string } }
    found.push(...(page.data ?? []).filter(isSubscription))
    if (!page.pagination?.cursor) return found
    after = page.pagination.cursor
  }
}

const apply = process.argv.includes('--apply')
const { extensionSecret, clientId, clientSecret } = loadSecrets(process.env)
const callback = statusCallbackUrl(publicBaseUrl())
const helix = new Helix(clientId, clientSecret)
const existing = [...(await listAll(helix, 'stream.online')), ...(await listAll(helix, 'stream.offline'))]
const steps = planSubscriptions(existing, channelId, callback)
console.log((apply ? 'Applying' : 'Dry run (use --apply to change)') + ' for broadcaster ' + channelId + ', callback ' + callback)
for (const step of steps) console.log('- ' + step.action + ' ' + step.type + ('id' in step ? ' ' + step.id : '') + ('why' in step ? ' (' + step.why + ')' : ''))
if (apply) {
  for (const step of steps) {
    if (step.action === 'delete') {
      const res = await helix.request('DELETE', 'eventsub/subscriptions?id=' + encodeURIComponent(step.id))
      if (res.status !== 204 && res.status !== 404) throw Error('Deleting ' + step.id + ' failed (' + res.status + ')')
    } else if (step.action === 'create') {
      const res = await helix.request('POST', 'eventsub/subscriptions', createBody(step.type, channelId, callback, webhookSecret(extensionSecret)))
      if (res.status !== 202) throw Error('Creating ' + step.type + ' failed (' + res.status + ')')
      console.log('  created ' + step.type + ', Twitch now verifies the callback')
    }
  }
}
