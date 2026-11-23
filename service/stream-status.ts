import { createHmac, timingSafeEqual } from 'node:crypto'

export const statusCallback = 'https://shroomlive.de/stream-actions/twitch-status'
export function webhookSecret(key: Buffer) {
  return createHmac('sha256', key).update('shroomlive/eventsub/stream-status/v1').digest('hex')
}

export async function receiveStreamStatus(req: Request, key: string, channel: string, update: (id: string | null, timestamp: number) => void) {
  const header = (name: string) => req.headers.get('Twitch-Eventsub-Message-' + name) || ''
  const id = header('Id')
  const time = header('Timestamp')
  const timestamp = Date.parse(time)
  const raw = Buffer.from(await req.arrayBuffer())
  const signature = Buffer.from(header('Signature'))
  const expected = Buffer.from('sha256=' + createHmac('sha256', key).update(id).update(time).update(raw).digest('hex'))
  if (!id || !Number.isFinite(timestamp) || Math.abs(Date.now()-timestamp)>600000 || signature.length !== expected.length || !timingSafeEqual(signature,expected))
    return new Response(null,{status:403})
  const body = JSON.parse(raw.toString())
  const sub = body.subscription
  if (sub?.condition?.broadcaster_user_id !== channel || !['stream.online','stream.offline'].includes(sub.type) || sub.transport?.callback !== statusCallback)
    return new Response(null,{status:400})
  if (header('Type') === 'webhook_callback_verification' && typeof body.challenge === 'string') return new Response(body.challenge)
  if (header('Type') === 'notification' && body.event?.broadcaster_user_id === channel) {
    if (sub.type === 'stream.offline') update(null,timestamp)
    else if (typeof body.event.id === 'string') update(body.event.id,timestamp)
  }
  return new Response(null,{status:204})
}
