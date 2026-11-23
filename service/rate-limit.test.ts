import { expect, test } from 'bun:test'
import { RateLimiter, TtlCache } from './rate-limit'

test('a key gets its limit per window, other keys are independent', () => {
  let now = 0
  const limiter = new RateLimiter(2, 1000, () => now)
  expect([limiter.take('a'), limiter.take('a'), limiter.take('a'), limiter.take('b')]).toEqual([true, true, false, true])
  now = 999
  expect(limiter.take('a')).toBe(false)
  now = 1000
  expect(limiter.take('a')).toBe(true)
})

test('the limiter stays bounded under many keys', () => {
  let now = 0
  const limiter = new RateLimiter(1, 1000, () => now, 3)
  for (const key of ['a', 'b', 'c', 'd']) expect(limiter.take(key)).toBe(true)
  now = 2000
  for (const key of ['e', 'f', 'g']) expect(limiter.take(key)).toBe(true)
})

test('cached values expire and the cache keeps its size', () => {
  let now = 0
  const cache = new TtlCache<string>(100, 2, () => now)
  cache.set('1', 'Ada')
  cache.set('2', 'Bob')
  cache.set('3', 'Cy')
  expect(cache.get('1')).toBeUndefined()
  expect(cache.get('2')).toBe('Bob')
  now = 100
  expect(cache.get('3')).toBeUndefined()
})
