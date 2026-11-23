import { mkdir, readdir, link, unlink } from 'node:fs/promises'
import { join } from 'node:path'

// A memory is a strip of up to three camera frames taken while the reaction was visible.
export const frames = [1, 2, 3] as const
export type Frame = (typeof frames)[number]
export interface Memory { key: string; frames: number; media: string | null }

export function validKey(key: unknown): key is string {
  return typeof key === 'string' && /^\d{13}-[0-9a-f-]{36}$/.test(key)
}
export function validFrame(frame: unknown): frame is Frame {
  return frames.some(value => value === frame)
}
// Catalog ids (pilz-…) or GIPHY ids. Only the id is kept: GIPHY media is never stored here.
export function validMedia(media: unknown): media is string {
  return typeof media === 'string' && /^[A-Za-z0-9-]{1,80}$/.test(media)
}
// Frame 1 keeps the name of the single photo memories from before, so those stay listed.
const frameFile = (key: string, frame: Frame) => (frame === 1 ? key : key + '.' + frame) + '.jpg'

async function writeOnce(file: string, data: Uint8Array | string) {
  const tmp = file + '.' + crypto.randomUUID() + '.part'
  try {
    await Bun.write(tmp, data)
    await link(tmp, file).catch((err: NodeJS.ErrnoException) => { if (err.code !== 'EEXIST') throw err })
  } finally { await unlink(tmp).catch(() => {}) }
}

// The caller derives the owner from Twitch or uses the isolated local test owner.
export async function saveMemory(root: string, owner: string, key: string, frame: Frame, media: string, image: Uint8Array) {
  if (!validKey(key) || !/^\d+$/.test(owner) || !validFrame(frame) || !validMedia(media)) throw Error('Invalid photo identity')
  const meta = await new Bun.Image(image).metadata()
  if (meta.format !== 'jpeg' || !meta.width || !meta.height || meta.width * meta.height > 4000000) throw Error('Invalid camera frame')
  const dir = join(root, owner)
  await mkdir(dir, { recursive: true })
  // The media note exists before any frame, so a listed memory always knows its motif.
  await writeOnce(join(dir, key + '.json'), JSON.stringify({ media }))
  await writeOnce(join(dir, frameFile(key, frame)), image)
}

async function readMedia(file: string) {
  try {
    const note: unknown = await Bun.file(file).json()
    const media = typeof note === 'object' && note !== null && 'media' in note ? note.media : null
    return validMedia(media) ? media : null
  } catch { return null }
}

export async function listMemories(root: string, owner: string): Promise<Memory[]> {
  const dir = join(root, owner)
  const files = new Set(await readdir(dir).catch((err: NodeJS.ErrnoException) => { if (err.code === 'ENOENT') return []; throw err }))
  const keys = [...files].filter(name => name.endsWith('.jpg')).map(name => name.slice(0, -4)).filter(validKey).sort().reverse()
  return Promise.all(keys.map(async key => {
    // Count only an unbroken run from frame 1, so the strip never shows a gap.
    let count = 0
    for (const frame of frames) { if (!files.has(frameFile(key, frame))) break; count = frame }
    return { key, frames: count, media: files.has(key + '.json') ? await readMedia(join(dir, key + '.json')) : null }
  }))
}

export async function readFrame(root: string, owner: string, key: string, frame: Frame) {
  if (!validKey(key) || !validFrame(frame) || !/^\d+$/.test(owner)) throw Error('Invalid photo request')
  const file = Bun.file(join(root, owner, frameFile(key, frame)))
  return (await file.exists()) ? new Uint8Array(await file.arrayBuffer()) : null
}
