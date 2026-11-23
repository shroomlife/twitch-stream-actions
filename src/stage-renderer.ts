import { resolveMedia } from './media'
import mark from './assets/giphy-mark.gif'
import './assets/stage.css'
const stage = document.getElementById('stage')!
let request: AbortController | undefined
let expiry: ReturnType<typeof setTimeout>
export function clear() {
  request?.abort()
  clearTimeout(expiry)
  stage.getAnimations().forEach(animation => animation.cancel())
  stage.replaceChildren()
}
export async function show(entry: { media: string; author: string; avatar?: string | null; message: string; until: number } | null) {
  clear()

  if (!entry || entry.until <= Date.now()) return
  const work = new AbortController()
  request = work
  expiry = setTimeout(clear, Math.min(10000, entry.until - Date.now()))
  try {
    const img = new Image()
    img.className = 'motif'
    img.src = await resolveMedia(entry.media, work.signal)
    await img.decode()
    if (work.signal.aborted || Date.now() >= entry.until) return
    const name = document.createElement('b')
    name.textContent = entry.author
    if (entry.avatar && /^https:\/\/static-cdn\.jtvnw\.net\//i.test(entry.avatar)) {
      const avatar = new Image()
      avatar.className = 'avatar'
      avatar.alt = ''
      avatar.onload = () => name.prepend(avatar)
      avatar.src = entry.avatar
    }
    const caption = document.createElement('div')
    caption.className = 'caption'
    caption.append(name)
    if (entry.message) { const message = document.createElement('span'); message.textContent = entry.message; caption.append(message) }
    if (!entry.media.startsWith('pilz-')) {
      const credit = new Image()
      credit.className = 'credit'
      credit.src = mark
      credit.alt = 'Powered by GIPHY'
      stage.append(credit)
    }
    stage.append(img, caption)
    stage.animate([{opacity:0},{opacity:1,offset:0.1},{opacity:1,offset:0.9},{opacity:0}], Math.max(1,entry.until-Date.now()))
    return true
  } catch {
    if (!work.signal.aborted) clear()
  }
}





