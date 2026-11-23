// Logic of the desktop worker without I/O, so it can be tested with fakes.
export interface Job { id: number; author: string; media: string; message: string; reason?: string | null }
export interface QueueSnapshot {
  autoApprove: boolean
  active: { id: number; author: string; media: string; message: string } | null
  queued: { id: number; author: string; media: string; message: string; state: string }[]
}
export type Request = (body: Record<string, unknown>) => Promise<unknown>

export interface WorkerDeps {
  request: Request
  moderate: (item: Job) => Promise<string>
  askRobin: (item: Job, reason: string) => Promise<boolean>
}

const text = (record: object, name: string) => {
  const value = new Map(Object.entries(record)).get(name)
  return typeof value === 'string' ? value : ''
}
const jobOf = (value: unknown): Job | null => {
  if (typeof value !== 'object' || value === null || !('item' in value)) return null
  const item = value.item
  if (typeof item !== 'object' || item === null || !('id' in item) || typeof item.id !== 'number') return null
  return { id: item.id, author: text(item, 'author'), media: text(item, 'media'), message: text(item, 'message'), reason: text(item, 'reason') || null }
}

export function createWorker({ request, moderate, askRobin }: WorkerDeps) {
  // Robin decides each held item once. When posting the decision fails, the same decision is sent again: no second prompt.
  const decisions = new Map<number, boolean>()

  async function pendingStep() {
    const item = jobOf(await request({ action: 'next', queue: 'pending' }))
    if (!item) return
    const reason = await moderate(item)
    await request({ action: 'checked', id: item.id, reason })
  }

  async function heldStep() {
    const item = jobOf(await request({ action: 'next', queue: 'held' }))
    if (!item) return
    let approve = decisions.get(item.id)
    if (approve === undefined) {
      approve = await askRobin(item, item.reason ?? '')
      decisions.set(item.id, approve)
    }
    await request({ action: approve ? 'ready' : 'rejected', id: item.id })
    decisions.delete(item.id)
  }

  return { pendingStep, heldStep }
}

// Commands from the desktop app (one JSON object per stdin line).
export type Command = { type: 'auto-approve'; value: boolean } | { type: 'remove'; id: number }

export function parseCommand(line: string): Command | null {
  let value: unknown
  try {
    value = JSON.parse(line)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null || !('type' in value)) return null
  if (value.type === 'auto-approve' && 'value' in value && typeof value.value === 'boolean') return { type: 'auto-approve', value: value.value }
  if (value.type === 'remove' && 'id' in value && typeof value.id === 'number' && Number.isSafeInteger(value.id)) return { type: 'remove', id: value.id }
  return null
}
