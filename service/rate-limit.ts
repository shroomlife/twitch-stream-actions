// Fixed-window request counter per key (a viewer id or an IP). Cheap enough to run before any database or Helix work.
export class RateLimiter {
  readonly #windows = new Map<string, { start: number; count: number }>()

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
    private readonly maxKeys = 10000,
  ) {}

  take(key: string): boolean {
    const now = this.now()
    let window = this.#windows.get(key)
    if (!window || now - window.start >= this.windowMs) {
      if (!window && this.#windows.size >= this.maxKeys) this.#prune(now)
      window = { start: now, count: 0 }
      this.#windows.set(key, window)
    }
    if (window.count >= this.limit) return false
    window.count++
    return true
  }

  #prune(now: number) {
    for (const [key, window] of this.#windows) if (now - window.start >= this.windowMs) this.#windows.delete(key)
    // Still full of active keys: drop the oldest instead of growing without bound.
    if (this.#windows.size >= this.maxKeys) {
      const oldest = this.#windows.keys().next()
      if (!oldest.done) this.#windows.delete(oldest.value)
    }
  }
}

// Small bounded cache with expiry, e.g. Twitch display names.
export class TtlCache<V> {
  readonly #entries = new Map<string, { value: V; until: number }>()

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string): V | undefined {
    const entry = this.#entries.get(key)
    if (!entry) return undefined
    if (entry.until <= this.now()) {
      this.#entries.delete(key)
      return undefined
    }
    return entry.value
  }

  set(key: string, value: V) {
    this.#entries.delete(key)
    if (this.#entries.size >= this.maxEntries) {
      const oldest = this.#entries.keys().next()
      if (!oldest.done) this.#entries.delete(oldest.value)
    }
    this.#entries.set(key, { value, until: this.now() + this.ttlMs })
  }
}
