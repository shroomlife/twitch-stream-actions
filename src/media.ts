import catalog from './catalog.json'
import { giphyApiOrigin, giphyMediaUrl } from './media-hosts'

export interface Motif {
  animated: string
  giphy: boolean
  // GIPHY asks for the creator's attribution wherever the API returns one.
  creator: string | null
}

export const isCatalogMotif = (id: string) => catalog.some((item) => item.id === id)

// Every lookup asks GIPHY afresh: its rules forbid caching responses or media URLs.
export async function lookupMotif(id: string, signal: AbortSignal): Promise<Motif> {
  if (isCatalogMotif(id)) {
    const animated = './pilze/' + id + '.webp'
    return { animated, giphy: false, creator: null }
  }
  if (!/^[A-Za-z0-9]{1,80}$/.test(id)) throw Error('Unknown motif')
  const url = new URL(giphyApiOrigin + '/v1/gifs/' + id)
  url.searchParams.set('api_key', import.meta.env.VITE_GIPHY_API_KEY)
  url.searchParams.set('rating', 'g')
  const response = await fetch(url, { signal, cache: 'no-store' })
  if (!response.ok) throw Error('GIPHY unavailable')
  const { data } = await response.json()
  if (data?.id !== id || data.rating !== 'g') throw Error('Motif unavailable')
  const images = data.images
  const animated = giphyMediaUrl(images?.original?.webp) ?? giphyMediaUrl(images?.original?.url) ?? giphyMediaUrl(images?.fixed_height?.url)
  if (!animated) throw Error('Motif unavailable')
  const name = data.user?.display_name || data.user?.username || data.username
  return { animated, giphy: true, creator: typeof name === 'string' && name ? name : null }
}

export async function resolveMedia(id: string, signal: AbortSignal) {
  return (await lookupMotif(id, signal)).animated
}
