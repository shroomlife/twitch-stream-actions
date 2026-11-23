import catalog from './catalog.json'

export async function resolveMedia(id: string, signal: AbortSignal) {
  if (catalog.some((item) => item.id === id)) return './pilze/' + id + '.webp'
  if (!/^[A-Za-z0-9]{1,80}$/.test(id)) throw Error('Unbekanntes Motiv')
  const url = new URL('https://api.giphy.com/v1/gifs/' + id)
  url.searchParams.set('api_key', import.meta.env.VITE_GIPHY_API_KEY)
  url.searchParams.set('rating', 'g')
  const response = await fetch(url, { signal, cache: 'no-store' })
  if (!response.ok) throw Error('GIPHY nicht erreichbar')
  const { data } = await response.json()
  if (data?.id !== id || data.rating !== 'g')
    throw Error('Motiv nicht verfügbar')
  const media = new URL(
    data.images.original.webp || data.images.original.url || data.images.fixed_height.url,
  )
  if (media.protocol !== 'https:' || !media.hostname.endsWith('.giphy.com'))
    throw Error('Unbekannte Bildquelle')
  return media.href
}

