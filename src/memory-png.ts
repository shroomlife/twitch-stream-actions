import markUrl from './assets/giphy-mark-dark.png'
import { lookupMotif } from './media'
import { pngPlan, pngSizes, type MemoryEntry, type PngFormat, type Rect } from './memory-card'

const colors = { ground: '#05070a', panel: '#0b1016', line: '#223040', soft: '#93a4b4', mint: '#4fe3b0', magenta: '#ed38f7' }

async function loadImage(src: string, crossOrigin: boolean) {
  const image = new Image()
  // GIPHY media answers CORS with "*", so the still may be drawn without tainting the canvas.
  if (crossOrigin) image.crossOrigin = 'anonymous'
  image.src = src
  await image.decode()
  return image
}

function chamfer(context: CanvasRenderingContext2D, rect: Rect, cut: number) {
  const { x, y, width, height } = rect
  context.beginPath()
  context.moveTo(x + cut, y)
  context.lineTo(x + width, y)
  context.lineTo(x + width, y + height - cut)
  context.lineTo(x + width - cut, y + height)
  context.lineTo(x, y + height)
  context.lineTo(x, y + cut)
  context.closePath()
}

function drawCover(context: CanvasRenderingContext2D, image: ImageBitmap, rect: Rect) {
  const scale = Math.max(rect.width / image.width, rect.height / image.height)
  const width = rect.width / scale, height = rect.height / scale
  context.drawImage(image, (image.width - width) / 2, (image.height - height) / 2, width, height, rect.x, rect.y, rect.width, rect.height)
}

function glowStroke(context: CanvasRenderingContext2D, color: string, width: number, blur: number) {
  context.save()
  context.strokeStyle = color
  context.lineWidth = width
  context.shadowColor = color
  context.shadowBlur = blur
  context.stroke()
  context.restore()
}

// Builds the PNG in the viewer's browser: frame 1, a still of the motif and, for GIPHY, the official mark.
export async function renderMemoryPng(memory: MemoryEntry, format: PngFormat, firstFrame: Blob, signal: AbortSignal) {
  const motif = memory.media ? await lookupMotif(memory.media, signal) : null
  const [photo, still, mark] = await Promise.all([
    createImageBitmap(firstFrame),
    motif ? loadImage(motif.still, motif.giphy) : null,
    motif?.giphy ? loadImage(markUrl, false) : null,
    document.fonts.load('700 32px "JetBrains Mono"'),
  ])
  signal.throwIfAborted()
  const [width, height] = pngSizes[format]
  const date = new Date(Number(memory.key.slice(0, 13))).toLocaleDateString('de-DE')
  const plan = pngPlan(memory, format, motif && still ? { width: still.naturalWidth, height: still.naturalHeight, giphy: motif.giphy, creator: motif.creator } : null, date)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw Error('Canvas unavailable')
  const cut = Math.round(width * 0.02)
  for (const step of plan) {
    switch (step.draw) {
      case 'ground': {
        context.fillStyle = colors.ground
        context.fillRect(0, 0, step.rect.width, step.rect.height)
        context.fillStyle = colors.line
        const spacing = Math.round(width / 45)
        for (let y = spacing / 2; y < height; y += spacing)
          for (let x = spacing / 2; x < width; x += spacing) context.fillRect(x, y, 2, 2)
        break
      }
      case 'photo':
        context.save()
        chamfer(context, step.rect, cut)
        context.clip()
        drawCover(context, photo, step.rect)
        context.restore()
        chamfer(context, step.rect, cut)
        glowStroke(context, colors.mint, 4, 22)
        break
      case 'motif':
        if (still) context.drawImage(still, step.rect.x, step.rect.y, step.rect.width, step.rect.height)
        break
      case 'mark':
        chamfer(context, step.rect, Math.round(step.rect.height * 0.25))
        context.fillStyle = colors.panel
        context.fill()
        glowStroke(context, colors.magenta, 3, 18)
        if (mark) context.drawImage(mark, step.logo.x, step.logo.y, step.logo.width, step.logo.height)
        break
      case 'creator':
      case 'label':
        context.font = '700 ' + step.size + 'px "JetBrains Mono", monospace'
        context.fillStyle = step.draw === 'label' ? colors.mint : colors.soft
        context.textBaseline = 'middle'
        context.fillText(step.text, step.x, step.y)
        break
    }
  }
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(Error('PNG export failed'))), 'image/png'))
}
