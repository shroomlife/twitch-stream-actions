// A reaction memory as the panel shows it: Robin's three-frame strip together with the motif.
// Mushroom motifs are bundled assets; a GIPHY plays live from GIPHY by its id, never stored or proxied.

export interface MemoryEntry { key: string; frames: number; media: string | null }

export const frameMs = 800

// Frames that exist form an unbroken run from 1; each shows for frameMs within one shared cycle.
// Delays are negative so every frame starts mid-cycle at its own turn instead of waiting.
export function stripPlan(memory: MemoryEntry) {
  const frames = Array.from({ length: Math.max(0, Math.min(3, memory.frames)) }, (_, index) => index + 1)
  const cycleMs = frames.length * frameMs
  return {
    frames,
    cycleMs,
    delays: frames.map((frame) => (frame - 1) * frameMs - cycleMs),
    giphyMark: memory.media !== null && !memory.media.startsWith('pilz-'),
  }
}

export const frameCacheKey = (key: string, frame: number) => key + '/' + frame

// Frames of the strip that are not loaded yet; a growing strip fetches only its new frames.
export function missingFrames(memory: MemoryEntry, loaded: ReadonlySet<string>) {
  return stripPlan(memory).frames.filter((frame) => !loaded.has(frameCacheKey(memory.key, frame)))
}
