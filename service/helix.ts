// Twitch Helix with an app access token (client credentials flow), shared by the service and the EventSub setup.
export type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export class Helix {
  #token: { value: string; until: number } | undefined
  #renewing: Promise<string> | undefined

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly fetchImpl: Fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  async #accessToken(): Promise<string> {
    if (this.#token && this.#token.until > this.now()) return this.#token.value
    this.#renewing ??= (async () => {
      const res = await this.fetchImpl('https://id.twitch.tv/oauth2/token', {
        method: 'POST',
        body: new URLSearchParams({ client_id: this.clientId, client_secret: this.clientSecret, grant_type: 'client_credentials' }),
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) throw Error('Helix login failed (' + res.status + ')')
      const data: unknown = await res.json()
      if (typeof data !== 'object' || data === null || !('access_token' in data) || typeof data.access_token !== 'string' || !('expires_in' in data) || typeof data.expires_in !== 'number')
        throw Error('Helix login returned no token')
      this.#token = { value: data.access_token, until: this.now() + (data.expires_in - 60) * 1000 }
      return data.access_token
    })().finally(() => {
      this.#renewing = undefined
    })
    return this.#renewing
  }

  async request(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = { 'Client-Id': this.clientId, Authorization: 'Bearer ' + (await this.#accessToken()) }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    const res = await this.fetchImpl('https://api.twitch.tv/helix/' + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    })
    if (res.status === 401) this.#token = undefined
    return res
  }

  // First row of a GET; throws when Helix is unavailable.
  async first(path: string): Promise<Record<string, unknown> | undefined> {
    const res = await this.request('GET', path)
    if (!res.ok) throw Error('Helix unavailable')
    const data: unknown = await res.json()
    if (typeof data !== 'object' || data === null || !('data' in data) || !Array.isArray(data.data)) throw Error('Helix answered without data')
    return data.data[0]
  }
}
