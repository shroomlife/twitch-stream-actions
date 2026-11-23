import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { ActionsStore, afterCheck, manualApprovalReason, maxQueued, Refusal } from './store'

const fresh = () => new ActionsStore(new Database(':memory:'))
const item = (viewer: string, stream = 's1') => ({ stream, viewer, author: 'V' + viewer, avatar: null, media: 'pilz-wave', message: '' })

test('auto approval is on by default; with it off every clean submission waits for Robin', () => {
  expect(afterCheck('', true)).toEqual({ state: 'ready', reason: '' })
  expect(afterCheck('', false)).toEqual({ state: 'held', reason: manualApprovalReason })
  expect(afterCheck('sexual', true)).toEqual({ state: 'held', reason: 'sexual' })
  const store = fresh()
  expect(store.autoApprove()).toBe(true)
  const a = store.submit(item('1'), 1000)
  expect(store.applyCheck(a, '', 1000)).toBe('ready')
  store.setAutoApprove(false)
  expect(store.autoApprove()).toBe(false)
  const b = store.submit(item('2'), 1000)
  expect(store.applyCheck(b, '', 1000)).toBe('held')
  expect(store.nextJob('held', 1000)).toMatchObject({ id: b, reason: manualApprovalReason })
  // A repeated verdict does not move an item that already left the pending queue.
  expect(store.applyCheck(a, 'violence', 1000)).toBe('ready')
})

test('one submission per viewer per minute and a capped queue instead of a shared channel cap', () => {
  const store = fresh()
  store.submit(item('1'), 0)
  expect(() => store.submit(item('1'), 59999)).toThrow(Refusal)
  store.submit(item('1'), 60000)
  // Viewer 1 has two queued items already.
  for (let viewer = 2; viewer < maxQueued; viewer++) store.submit(item(String(viewer)), 60000)
  try {
    store.submit(item('999'), 60000)
    throw Error('expected a refusal')
  } catch (err) {
    expect(err instanceof Refusal && err.status).toBe(429)
    expect((err as Error).message).toContain('Warteschlange')
  }
  // Another stream's queue is separate.
  store.submit(item('999', 's2'), 60000)
})

test('a held decision is idempotent by id', () => {
  const store = fresh()
  const id = store.submit(item('1'), 0)
  store.applyCheck(id, 'harassment', 0)
  expect(store.decide(id, true, 1)).toBe('ready')
  expect(store.decide(id, false, 2)).toBe('ready')
})

test('removal takes a waiting or visible reaction out for good', () => {
  const store = fresh()
  const shown = store.submit(item('1'), 0)
  store.applyCheck(shown, '', 0)
  expect(store.takeNextReady('s1', 0)?.id).toBe(shown)
  const waiting = store.submit(item('2'), 0)
  store.applyCheck(waiting, '', 0)
  expect(store.queued(0).map((row) => row.id)).toEqual([waiting])
  expect(store.remove(waiting)).toBe(true)
  expect(store.remove(shown)).toBe(true)
  expect(store.remove(waiting)).toBe(false)
  expect(store.takeNextReady('s1', 0)).toBeNull()
  expect(store.queued(0)).toEqual([])
  expect(store.shownForCamera(shown, 0)).toBeNull()
})

test('a job of an ended stream expires', () => {
  const store = fresh()
  const id = store.submit(item('1', 'old'), 0)
  store.expireUnlessStream(id, null)
  expect(store.state(id)).toBe('expired')
  const current = store.submit(item('2', 'live'), 0)
  store.expireUnlessStream(current, 'live')
  expect(store.state(current)).toBe('pending')
})

test('the latest-request query per viewer uses an index', () => {
  const db = new Database(':memory:')
  new ActionsStore(db)
  const plan = db.query<{ detail: string }, [string]>('EXPLAIN QUERY PLAN SELECT state,created,shown_at FROM requests WHERE viewer=? ORDER BY id DESC LIMIT 1').all('1')
  expect(plan.map((row) => row.detail).join(' ')).toContain('by_viewer')
})
