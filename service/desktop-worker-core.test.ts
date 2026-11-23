import { expect, test } from 'bun:test'
import { createWorker, parseCommand } from './desktop-worker-core'

test('a held decision is asked once even when sending it fails', async () => {
  const sent: Record<string, unknown>[] = []
  let failNext = true
  let asked = 0
  const worker = createWorker({
    async request(body) {
      if (body.action === 'next') return { item: { id: 7, author: 'A', media: 'pilz-wave', message: '', reason: 'harassment' } }
      sent.push(body)
      if (failNext) { failNext = false; throw Error('Helix down') }
      return { state: 'rejected' }
    },
    async moderate() { return '' },
    async askRobin(_, reason) { asked++; expect(reason).toBe('harassment'); return false },
  })
  await expect(worker.heldStep()).rejects.toThrow()
  await worker.heldStep()
  expect(asked).toBe(1)
  expect(sent).toEqual([{ action: 'rejected', id: 7 }, { action: 'rejected', id: 7 }])
})

test('the pending queue reports only the verdict; the server applies the switch', async () => {
  const sent: Record<string, unknown>[] = []
  const worker = createWorker({
    async request(body) {
      if (body.action === 'next') return { item: { id: 3, author: 'B', media: 'pilz-hi', message: 'hi' } }
      sent.push(body)
      return {}
    },
    async moderate() { return '' },
    async askRobin() { throw Error('not expected') },
  })
  await worker.pendingStep()
  expect(sent).toEqual([{ action: 'checked', id: 3, reason: '' }])
})

test('an empty long-poll does nothing', async () => {
  const worker = createWorker({ async request() { return { item: null } }, async moderate() { throw Error() }, async askRobin() { throw Error() } })
  await worker.pendingStep()
  await worker.heldStep()
})

test('commands from the desktop app are validated', () => {
  expect(parseCommand('{"type":"auto-approve","value":false}')).toEqual({ type: 'auto-approve', value: false })
  expect(parseCommand('{"type":"remove","id":12}')).toEqual({ type: 'remove', id: 12 })
  for (const bad of ['{"type":"remove","id":"12"}', '{"type":"auto-approve","value":"no"}', 'nope', '{"type":"x"}']) expect(parseCommand(bad)).toBeNull()
})
