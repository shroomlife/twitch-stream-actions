import { expect, test } from 'bun:test'
import { createBody, isSubscription, planSubscriptions, type Subscription } from './eventsub-plan'

const callback = 'https://actions.shroomlive.de/stream-actions/twitch-status'
const sub = (id: string, type: string, extra: Partial<Subscription> = {}): Subscription => ({
  id,
  status: 'enabled',
  type,
  version: '1',
  condition: { broadcaster_user_id: '137290088' },
  transport: { method: 'webhook', callback },
  ...extra,
})

test('matching enabled subscriptions are kept and nothing is created', () => {
  expect(planSubscriptions([sub('a', 'stream.online'), sub('b', 'stream.offline')], '137290088', callback)).toEqual([
    { action: 'keep', id: 'a', type: 'stream.online' },
    { action: 'keep', id: 'b', type: 'stream.offline' },
  ])
})

test('old callbacks, disabled ones and duplicates are deleted; missing types are created', () => {
  const plan = planSubscriptions(
    [
      sub('old', 'stream.online', { transport: { method: 'webhook', callback: 'https://shroomlive.de/stream-actions/twitch-status' } }),
      sub('failed', 'stream.offline', { status: 'webhook_callback_verification_failed' }),
      sub('ok', 'stream.offline'),
      sub('dup', 'stream.offline'),
      sub('other-channel', 'stream.online', { condition: { broadcaster_user_id: '1' } }),
      sub('other-type', 'channel.follow'),
    ],
    '137290088',
    callback,
  )
  expect(plan).toEqual([
    { action: 'delete', id: 'old', type: 'stream.online', why: 'other callback' },
    { action: 'delete', id: 'failed', type: 'stream.offline', why: 'status webhook_callback_verification_failed' },
    { action: 'keep', id: 'ok', type: 'stream.offline' },
    { action: 'delete', id: 'dup', type: 'stream.offline', why: 'duplicate' },
    { action: 'create', type: 'stream.online' },
  ])
})

test('the create body follows the Helix webhook shape', () => {
  expect(createBody('stream.offline', '137290088', callback, 'x'.repeat(64))).toEqual({
    type: 'stream.offline',
    version: '1',
    condition: { broadcaster_user_id: '137290088' },
    transport: { method: 'webhook', callback, secret: 'x'.repeat(64) },
  })
  expect(isSubscription(sub('a', 'stream.online'))).toBe(true)
  expect(isSubscription({ id: 'a' })).toBe(false)
})
