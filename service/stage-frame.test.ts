import { expect, test } from 'bun:test'
import { entryFromFrame } from '../src/stage-frame'

test('the stage deadline is based on arrival time, not on the server clock', () => {
  const frame = { id: 4, media: 'pilz-wave', author: 'Ada', avatar: null, message: 'Hi', remainingMs: 7000 }
  expect(entryFromFrame(frame, 50)).toEqual({ id: 4, media: 'pilz-wave', author: 'Ada', avatar: null, message: 'Hi', until: 7050 })
  // Never longer than one display slot.
  expect(entryFromFrame({ ...frame, remainingMs: 99999 }, 0)?.until).toBe(10000)
})

test('empty, expired or malformed frames clear the stage', () => {
  expect(entryFromFrame(null, 0)).toBeNull()
  expect(entryFromFrame({ id: 1, media: 'x', author: 'a', message: '', remainingMs: 0 }, 0)).toBeNull()
  expect(entryFromFrame({ id: 1, media: 'x', author: 'a', message: '', until: 5 }, 0)).toBeNull()
})
