// Layout of a reaction memory: Robin's photo strip together with the motif.
// The panel animates it live (the motif plays, the three frames take turns); the PNG keeps frame 1 and a still.
// GIPHY bytes only ever travel from GIPHY to the viewer's browser: GIPHY forbids storing or proxying its media.

export const pngSizes = { square: [1080, 1080], portrait: [1080, 1350], story: [1080, 1920] } as const
export type PngFormat = keyof typeof pngSizes
export const isPngFormat = (value: string): value is PngFormat => value === 'square' || value === 'portrait' || value === 'story'

export interface MemoryEntry { key: string; frames: number; media: string | null }
export interface Rect { x: number; y: number; width: number; height: number }

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

export type PngStep =
  | { draw: 'ground'; rect: Rect }
  | { draw: 'photo'; frame: 1; rect: Rect }
  | { draw: 'motif'; source: 'still'; rect: Rect }
  | { draw: 'mark'; rect: Rect; logo: Rect }
  | { draw: 'creator'; text: string; x: number; y: number; size: number }
  | { draw: 'label'; text: string; x: number; y: number; size: number }

function contain(box: Rect, width: number, height: number): Rect {
  const scale = Math.min(box.width / width, box.height / height)
  const w = Math.round(width * scale), h = Math.round(height * scale)
  return { x: Math.round(box.x + (box.width - w) / 2), y: Math.round(box.y + (box.height - h) / 2), width: w, height: h }
}

// Logo of the official mark for dark backgrounds (Poweredby_640px-Black_HorizLogo.png, 641 × 85).
export const markLogo = { width: 641, height: 85 }

export function pngPlan(memory: MemoryEntry, format: PngFormat, motif: { width: number; height: number; giphy: boolean; creator: string | null } | null, date: string): PngStep[] {
  const [width, height] = pngSizes[format]
  const pad = Math.round(width * 0.05)
  const gap = Math.round(width * 0.03)
  const footer = Math.round(width * 0.07)
  const inner = width - 2 * pad
  const available = height - 2 * pad - footer
  const steps: PngStep[] = [{ draw: 'ground', rect: { x: 0, y: 0, width, height } }]
  const photoHeight = Math.round(motif ? available * 0.52 : available)
  if (memory.frames >= 1) steps.push({ draw: 'photo', frame: 1, rect: { x: pad, y: pad, width: inner, height: photoHeight } })
  if (motif) {
    const markRow = motif.giphy ? Math.round(width * 0.075) : 0
    const box = { x: pad, y: pad + photoHeight + gap, width: inner, height: available - photoHeight - gap - markRow }
    const still = contain(box, motif.width, motif.height)
    steps.push({ draw: 'motif', source: 'still', rect: still })
    if (motif.giphy) {
      const plateHeight = Math.round(markRow * 0.78)
      const logoHeight = Math.round(plateHeight * 0.52)
      const logoWidth = Math.round(logoHeight * markLogo.width / markLogo.height)
      const plateWidth = logoWidth + 2 * Math.round(plateHeight * 0.45)
      const plate = { x: box.x + box.width - plateWidth, y: box.y + box.height + Math.round(markRow * 0.16), width: plateWidth, height: plateHeight }
      steps.push({ draw: 'mark', rect: plate, logo: { x: plate.x + Math.round((plateWidth - logoWidth) / 2), y: plate.y + Math.round((plateHeight - logoHeight) / 2), width: logoWidth, height: logoHeight } })
      if (motif.creator) steps.push({ draw: 'creator', text: 'GIF: @' + motif.creator.slice(0, 32), x: box.x, y: plate.y + Math.round(plateHeight / 2), size: Math.round(width * 0.024) })
    }
  }
  steps.push({ draw: 'label', text: 'SHROOMLIVE  /  ' + date, x: pad, y: height - pad - Math.round(footer * 0.35), size: Math.round(width * 0.03) })
  return steps
}
