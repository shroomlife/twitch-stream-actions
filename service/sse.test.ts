import { expect, test } from 'bun:test'
import { SseHub } from './sse'

const decoder = new TextDecoder()
async function read(response: Response) {
  const reader = response.body!.getReader()
  return { reader, next: async () => decoder.decode((await reader.read()).value) }
}

test('clients get the first frame and every broadcast; a closed client is dropped', async () => {
  const hub = new SseHub({ maxTotal: 10, maxPerIp: 2, keepaliveMs: 60000 })
  const a = await read(hub.open('1.1.1.1', () => 'data: first\n\n', {}))
  const b = await read(hub.open('2.2.2.2', () => 'data: first\n\n', {}))
  expect(await a.next()).toBe('data: first\n\n')
  expect(await b.next()).toBe('data: first\n\n')
  hub.broadcast('data: x\n\n')
  expect(await a.next()).toBe('data: x\n\n')
  await b.reader.cancel()
  expect(hub.size).toBe(1)
  hub.broadcast('data: y\n\n')
  expect(await a.next()).toBe('data: y\n\n')
  hub.close()
  expect(hub.size).toBe(0)
})

test('a client whose stream errored is removed on the next broadcast instead of throwing', () => {
  const hub = new SseHub({ maxTotal: 10, maxPerIp: 5, keepaliveMs: 60000 })
  const response = hub.open('1.1.1.1', () => 'data: first\n\n', {})
  void response.body!.getReader().cancel()
  expect(() => hub.broadcast('data: z\n\n')).not.toThrow()
  expect(hub.size).toBe(0)
})

test('connections are capped per IP and in total', () => {
  const hub = new SseHub({ maxTotal: 3, maxPerIp: 2, keepaliveMs: 60000 })
  hub.open('1.1.1.1', () => '', {})
  hub.open('1.1.1.1', () => '', {})
  expect(hub.admit('1.1.1.1')).toBe('ip')
  expect(hub.admit('2.2.2.2')).toBeNull()
  hub.open('2.2.2.2', () => '', {})
  expect(hub.admit('3.3.3.3')).toBe('total')
  hub.close()
})
