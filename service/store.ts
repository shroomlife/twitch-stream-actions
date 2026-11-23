import type { Database } from 'bun:sqlite'

export const reviewWindowMs = 10 * 60 * 1000
export const viewerCooldownMs = 60 * 1000
export const maxQueued = 20
const keepRequestsMs = 24 * 60 * 60 * 1000
export const manualApprovalReason = 'Automatische Freigabe ist aus.'

export type State = 'pending' | 'held' | 'ready' | 'shown' | 'rejected' | 'expired' | 'removed'
export interface Entry { id: number; author: string; avatar: string | null; media: string; message: string }
export interface Job extends Entry { stream: string; reason: string | null }
export interface QueuedItem { id: number; author: string; media: string; message: string; state: State }
export interface NewSubmission { stream: string; viewer: string; author: string; avatar: string | null; media: string; message: string }

export class Refusal extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

// What happens after the automatic check. With the switch off nothing reaches the stream without Robin.
export function afterCheck(reason: string, autoApprove: boolean): { state: 'ready' | 'held'; reason: string } {
  if (reason) return { state: 'held', reason }
  return autoApprove ? { state: 'ready', reason: '' } : { state: 'held', reason: manualApprovalReason }
}

export class ActionsStore {
  constructor(private readonly db: Database) {
    db.exec(
      "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS requests(id INTEGER PRIMARY KEY,stream TEXT,viewer TEXT,author TEXT,media TEXT,message TEXT,created INTEGER,state TEXT DEFAULT 'pending'); CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL)",
    )
    const columns = db.query<{ name: string }, []>('PRAGMA table_info(requests)').all().map((column) => column.name)
    for (const [name, type] of [['avatar', 'TEXT'], ['reason', 'TEXT'], ['shown_at', 'INTEGER']])
      if (!columns.includes(name)) db.exec('ALTER TABLE requests ADD COLUMN ' + name + ' ' + type)
    db.exec(
      'CREATE INDEX IF NOT EXISTS recent ON requests(created); CREATE INDEX IF NOT EXISTS by_viewer ON requests(viewer,id); CREATE INDEX IF NOT EXISTS by_state ON requests(state,id)',
    )
  }

  autoApprove(): boolean {
    return this.db.query<{ value: string }, []>("SELECT value FROM settings WHERE key='auto_approve'").get()?.value !== '0'
  }

  setAutoApprove(value: boolean) {
    this.db.query("INSERT INTO settings(key,value) VALUES('auto_approve',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(value ? '1' : '0')
  }

  lastSubmission(viewer: string): number | null {
    return this.db.query<{ created: number }, [string]>('SELECT created FROM requests WHERE viewer=? ORDER BY id DESC LIMIT 1').get(viewer)?.created ?? null
  }

  // Cooldown per viewer and a cap on the waiting queue; cheap, runs before any Helix call.
  checkSubmission(viewer: string, stream: string | null, now: number) {
    const last = this.lastSubmission(viewer)
    if (last !== null && last > now - viewerCooldownMs) throw new Refusal(429, 'Du kannst einmal pro Minute eine Reaktion schicken.')
    if (stream === null) return
    const queued =
      this.db
        .query<{ total: number }, [string, number]>("SELECT count(*) total FROM requests WHERE stream=? AND state IN ('pending','held','ready') AND created>?")
        .get(stream, now - reviewWindowMs)?.total ?? 0
    if (queued >= maxQueued) throw new Refusal(429, 'Die Warteschlange ist gerade voll. Versuch es gleich noch einmal.')
  }

  submit(item: NewSubmission, now: number): number {
    return this.db.transaction(() => {
      this.db.query('DELETE FROM requests WHERE created<?').run(now - keepRequestsMs)
      this.checkSubmission(item.viewer, item.stream, now)
      return Number(
        this.db
          .query('INSERT INTO requests(stream,viewer,author,avatar,media,message,created) VALUES(?,?,?,?,?,?,?)')
          .run(item.stream, item.viewer, item.author, item.avatar, item.media, item.message, now).lastInsertRowid,
      )
    })()
  }

  nextJob(state: 'pending' | 'held', now: number): Job | null {
    return this.db
      .query<Job, [string, number]>('SELECT id,stream,author,avatar,media,message,reason FROM requests WHERE state=? AND created>? ORDER BY id LIMIT 1')
      .get(state, now - reviewWindowMs)
  }

  state(id: number): State | null {
    return this.db.query<{ state: State }, [number]>('SELECT state FROM requests WHERE id=?').get(id)?.state ?? null
  }

  // Applies the worker's moderation verdict to a pending item; repeating it changes nothing.
  applyCheck(id: number, reason: string, now: number): State | null {
    const next = afterCheck(reason.slice(0, 180), this.autoApprove())
    this.db.query("UPDATE requests SET state=?,reason=? WHERE id=? AND state='pending' AND created>?").run(next.state, next.reason, id, now - reviewWindowMs)
    return this.state(id)
  }

  // A decision on a held item, idempotent by id: a repeated decision returns the state already recorded.
  decide(id: number, approve: boolean, now: number): State | null {
    this.db.query("UPDATE requests SET state=? WHERE id=? AND state='held' AND created>?").run(approve ? 'ready' : 'rejected', id, now - reviewWindowMs)
    return this.state(id)
  }

  // A job that belongs to a stream that already ended is discarded.
  expireUnlessStream(id: number, stream: string | null) {
    this.db.query("UPDATE requests SET state='expired' WHERE id=? AND state IN ('pending','held','ready') AND stream IS NOT ?").run(id, stream)
  }

  takeNextReady(stream: string, now: number): Entry | null {
    const item = this.db
      .query<Entry, [string, number]>("SELECT id,author,avatar,media,message FROM requests WHERE stream=? AND state='ready' AND created>? ORDER BY id LIMIT 1")
      .get(stream, now - reviewWindowMs)
    if (item) this.db.query("UPDATE requests SET state='shown',shown_at=? WHERE id=?").run(now, item.id)
    return item
  }

  hasReady(now: number): boolean {
    return !!this.db.query<{ one: number }, [number]>("SELECT 1 one FROM requests WHERE state='ready' AND created>? LIMIT 1").get(now - reviewWindowMs)
  }

  // Guideline 7.4: Robin removes a waiting or visible reaction; it is never shown or replayed afterwards.
  remove(id: number): boolean {
    return this.db.query("UPDATE requests SET state='removed' WHERE id=? AND state IN ('pending','held','ready','shown')").run(id).changes > 0
  }

  queued(now: number): QueuedItem[] {
    return this.db
      .query<QueuedItem, [number]>("SELECT id,author,media,message,state FROM requests WHERE state IN ('pending','held','ready') AND created>? ORDER BY id LIMIT 50")
      .all(now - reviewWindowMs)
  }

  latestForViewer(viewer: string) {
    return this.db
      .query<{ state: State; created: number; shown_at: number | null }, [string]>('SELECT state,created,shown_at FROM requests WHERE viewer=? ORDER BY id DESC LIMIT 1')
      .get(viewer)
  }

  shownForCamera(id: number, now: number) {
    return this.db
      .query<{ viewer: string; created: number; media: string }, [number, number]>("SELECT viewer,created,media FROM requests WHERE id=? AND state='shown' AND shown_at>?")
      .get(id, now - 60000)
  }
}
