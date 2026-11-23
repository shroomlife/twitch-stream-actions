export interface StageEntry { id: number | string; media: string; author: string; avatar?: string | null; message: string; until: number }

// The service sends the remaining display time; the deadline is set by this PC's clock on arrival, so clock skew does not matter.
export function entryFromFrame(data: unknown, arrivedAt: number): StageEntry | null {
  if (typeof data !== 'object' || data === null) return null
  if (!('id' in data && 'media' in data && 'author' in data && 'remainingMs' in data)) return null
  const { id, media, author, remainingMs } = data
  const message = 'message' in data && typeof data.message === 'string' ? data.message : ''
  const avatar = 'avatar' in data && typeof data.avatar === 'string' ? data.avatar : null
  if (typeof id !== 'number' || typeof media !== 'string' || typeof author !== 'string' || typeof remainingMs !== 'number' || !(remainingMs > 0)) return null
  return { id, media, author, avatar, message, until: arrivedAt + Math.min(remainingMs, 10000) }
}
