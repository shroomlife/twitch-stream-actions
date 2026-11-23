// Pure planning for the stream.online / stream.offline webhook subscriptions (no network, no secrets).
export const streamStatusTypes = ['stream.online', 'stream.offline'] as const
export type StreamStatusType = (typeof streamStatusTypes)[number]

// Shape of one entry of GET /helix/eventsub/subscriptions (the fields this plan reads).
export interface Subscription {
  id: string
  status: string
  type: string
  version: string
  condition: Record<string, unknown>
  transport: { method: string; callback?: string }
}

export type Step =
  | { action: 'delete'; id: string; type: string; why: string }
  | { action: 'create'; type: StreamStatusType }
  | { action: 'keep'; id: string; type: StreamStatusType }

export function planSubscriptions(existing: readonly Subscription[], broadcaster: string, callback: string): Step[] {
  const steps: Step[] = []
  const kept = new Set<string>()
  for (const sub of existing) {
    const type = streamStatusTypes.find((known) => known === sub.type)
    if (!type || sub.condition.broadcaster_user_id !== broadcaster) continue
    const why =
      sub.transport.method !== 'webhook' || sub.transport.callback !== callback
        ? 'other callback'
        : sub.version !== '1'
          ? 'other version'
          : sub.status !== 'enabled'
            ? 'status ' + sub.status
            : kept.has(type)
              ? 'duplicate'
              : ''
    if (why) steps.push({ action: 'delete', id: sub.id, type, why })
    else {
      kept.add(type)
      steps.push({ action: 'keep', id: sub.id, type })
    }
  }
  for (const type of streamStatusTypes) if (!kept.has(type)) steps.push({ action: 'create', type })
  return steps
}

// Request body of POST /helix/eventsub/subscriptions for one step.
export function createBody(type: StreamStatusType, broadcaster: string, callback: string, secret: string) {
  return { type, version: '1', condition: { broadcaster_user_id: broadcaster }, transport: { method: 'webhook', callback, secret } }
}

export function isSubscription(value: unknown): value is Subscription {
  if (typeof value !== 'object' || value === null) return false
  if (!('id' in value && 'status' in value && 'type' in value && 'version' in value && 'condition' in value && 'transport' in value)) return false
  const { id, status, type, version, condition, transport } = value
  return (
    typeof id === 'string' &&
    typeof status === 'string' &&
    typeof type === 'string' &&
    typeof version === 'string' &&
    typeof condition === 'object' &&
    condition !== null &&
    typeof transport === 'object' &&
    transport !== null &&
    'method' in transport &&
    typeof transport.method === 'string'
  )
}
