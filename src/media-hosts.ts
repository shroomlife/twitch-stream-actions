// Every GIPHY origin the extension talks to. The Twitch console allowlists list exactly these (see README).
export const giphyApiOrigin = 'https://api.giphy.com'
export const giphyMediaHosts: readonly string[] = [
  'media.giphy.com',
  'media0.giphy.com',
  'media1.giphy.com',
  'media2.giphy.com',
  'media3.giphy.com',
  'media4.giphy.com',
  'i.giphy.com',
]

// Returns the URL exactly as GIPHY sent it (its terms forbid modifying media URLs), or null for any other host.
export function giphyMediaUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  return url.protocol === 'https:' && !url.username && !url.password && !url.port && giphyMediaHosts.includes(url.hostname) ? value : null
}
