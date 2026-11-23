import type { Environment } from './config'

// The one public origin of the backend: the panel, the desktop worker, the camera uploader and the EventSub callback use it.
export const defaultPublicBaseUrl = 'https://actions.shroomlive.de'

export function publicBaseUrl(env: Environment = process.env): string {
  const value = env.PUBLIC_BASE_URL?.trim() || defaultPublicBaseUrl
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw Error('PUBLIC_BASE_URL must be an absolute URL')
  }
  const local = url.hostname === '127.0.0.1' || url.hostname === 'localhost'
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.pathname !== '/' || url.search || url.hash)
    throw Error('PUBLIC_BASE_URL must be an https origin without a path')
  return url.origin
}

export const statusCallbackUrl = (base: string) => base + '/stream-actions/twitch-status'
