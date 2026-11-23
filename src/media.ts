import catalog from './catalog.json'

export interface Motif {
  animated: string
  still: string
  giphy: boolean
  // GIPHY asks for the creator's attribution wherever the API returns one.
  creator: string | null
}

export const isCatalogMotif = (id: string) => catalog.some((item) => item.id === id)

function giphyUrl(value: unknown) {
  if (typeof value !== 'string') return null
  const media = new URL(value)
  if (media.protocol !== 'https:' || !media.hostname.endsWith('.giphy.com'))
    throw Error('Unknown image source')
  return media.href
}

// Every lookup asks GIPHY afresh: its rules forbid caching responses or media URLs.
export async function lookupMotif(id: string, signal: AbortSignal): Promise<Motif> {
  if (isCatalogMotif(id)) {
    const animated = './pilze/' + id + '.webp'
    return { animated, still: animated, giphy: false, creator: null }
  }
  if (!/^[A-Za-z0-9]{1,80}$/.test(id)) throw Error('Unknown motif')
  const url = new URL('https://api.giphy.com/v1/gifs/' + id)
  url.searchParams.set('api_key', import.meta.env.VITE_GIPHY_API_KEY)
  url.searchParams.set('rating', 'g')
  const response = await fetch(url, { signal, cache: 'no-store' })
  if (!response.ok) throw Error('GIPHY unavailable')
  const { data } = await response.json()
  if (data?.id !== id || data.rating !== 'g') throw Error('Motif unavailable')
  const images = data.images
  const animated = giphyUrl(images.original.webp) ?? giphyUrl(images.original.url) ?? giphyUrl(images.fixed_height.url)
  const still = giphyUrl(images.original_still?.url) ?? giphyUrl(images.fixed_height_still?.url)
  if (!animated || !still) throw Error('Motif unavailable')
  const name = data.user?.display_name || data.user?.username || data.username
  return { animated, still, giphy: true, creator: typeof name === 'string' && name ? name : null }
}

export async function resolveMedia(id: string, signal: AbortSignal) {
  return (await lookupMotif(id, signal)).animated
}
