import { expect, test } from 'bun:test'
import { defaultPublicBaseUrl, publicBaseUrl, statusCallbackUrl } from './public-url'
import { giphyMediaHosts, giphyMediaUrl } from '../src/media-hosts'

test('the public origin defaults to actions.shroomlive.de and is configurable in one place', () => {
  expect(defaultPublicBaseUrl).toBe('https://actions.shroomlive.de')
  expect(publicBaseUrl({})).toBe('https://actions.shroomlive.de')
  expect(publicBaseUrl({ PUBLIC_BASE_URL: 'https://example.org/' })).toBe('https://example.org')
  expect(publicBaseUrl({ PUBLIC_BASE_URL: 'http://127.0.0.1:27019' })).toBe('http://127.0.0.1:27019')
  expect(statusCallbackUrl(publicBaseUrl({}))).toBe('https://actions.shroomlive.de/stream-actions/twitch-status')
})

test('the public origin must be https without a path', () => {
  for (const value of ['http://example.org', 'https://example.org/stream-actions', 'not a url', 'https://example.org/?x=1'])
    expect(() => publicBaseUrl({ PUBLIC_BASE_URL: value })).toThrow('PUBLIC_BASE_URL')
})

test('GIPHY media is accepted only from the allowlisted hosts and stays unmodified', () => {
  expect(giphyMediaHosts).toEqual(['media.giphy.com', 'media0.giphy.com', 'media1.giphy.com', 'media2.giphy.com', 'media3.giphy.com', 'media4.giphy.com', 'i.giphy.com'])
  const url = 'https://media2.giphy.com/media/v1.Y2lkPTc5/26tPplGWjN0xLybiU/200_s.gif?cid=abc&rid=200_s.gif&ct=g'
  expect(giphyMediaUrl(url)).toBe(url)
  expect(giphyMediaUrl('https://i.giphy.com/26tPplGWjN0xLybiU.webp')).toBe('https://i.giphy.com/26tPplGWjN0xLybiU.webp')
  for (const bad of ['http://media1.giphy.com/a.gif', 'https://media5.giphy.com/a.gif', 'https://giphy.com.evil.example/a.gif', 'https://evil.giphy.com/a.gif', 'https://media1.giphy.com:8443/a.gif', 'https://u:p@media1.giphy.com/a.gif', 'nonsense', 42, null])
    expect(giphyMediaUrl(bad)).toBeNull()
})
