import { expect, test } from 'bun:test'
import { StreamState } from './stream-state'

test('Helix answers only until the first EventSub message, then never again', async () => {
  let calls = 0
  let now = 0
  const state = new StreamState(async () => { calls++; return 'helix-stream' }, () => now)
  expect(state.known()).toBeUndefined()
  expect(await state.current()).toBe('helix-stream')
  expect(await state.current()).toBe('helix-stream')
  expect(calls).toBe(1)
  now = 20000
  expect(await state.current()).toBe('helix-stream')
  expect(calls).toBe(2)
  expect(state.applyEventSub(null, 1000)).toBe(true)
  now = 99999999
  expect(await state.current()).toBeNull()
  expect(state.known()).toBeNull()
  expect(calls).toBe(2)
})

test('a slow Helix answer never overrides an EventSub transition that arrived meanwhile', async () => {
  let answer: (id: string | null) => void = () => {}
  const state = new StreamState(() => new Promise((resolve) => { answer = resolve }))
  const pending = state.current()
  state.applyEventSub('event-stream', 5)
  answer(null)
  expect(await pending).toBe('event-stream')
  expect(await state.current()).toBe('event-stream')
})

test('older or repeated EventSub messages are ignored', () => {
  const state = new StreamState(async () => null)
  expect(state.applyEventSub('a', 10)).toBe(true)
  expect(state.applyEventSub(null, 10)).toBe(false)
  expect(state.applyEventSub(null, 9)).toBe(false)
  expect(state.known()).toBe('a')
})

test('concurrent requests share one Helix call', async () => {
  let calls = 0
  const state = new StreamState(async () => { calls++; return 'x' })
  await Promise.all([state.current(), state.current(), state.current()])
  expect(calls).toBe(1)
})
