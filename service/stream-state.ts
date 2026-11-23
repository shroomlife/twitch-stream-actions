// Live status of the channel. EventSub is authoritative; Helix answers only while no EventSub message arrived since start.
export class StreamState {
  #eventSub: { id: string | null; timestamp: number } | undefined
  #helix: { id: string | null; until: number } | undefined
  #refreshing: Promise<string | null> | undefined

  constructor(
    private readonly lookup: () => Promise<string | null>,
    private readonly now: () => number = Date.now,
    private readonly cacheMs = 15000,
  ) {}

  // Returns false for a message that is not newer than the last one (Twitch may redeliver or reorder).
  applyEventSub(id: string | null, timestamp: number): boolean {
    if (this.#eventSub && timestamp <= this.#eventSub.timestamp) return false
    this.#eventSub = { id, timestamp }
    return true
  }

  // Last known state without any network call; undefined before the first answer.
  known(): string | null | undefined {
    return this.#eventSub ? this.#eventSub.id : this.#helix?.id
  }

  async current(): Promise<string | null> {
    if (this.#eventSub) return this.#eventSub.id
    if (this.#helix && this.#helix.until > this.now()) return this.#helix.id
    this.#refreshing ??= this.lookup()
      .then((id) => {
        this.#helix = { id, until: this.now() + this.cacheMs }
        return id
      })
      .finally(() => {
        this.#refreshing = undefined
      })
    const id = await this.#refreshing
    // An EventSub transition that arrived while Helix was asked wins.
    return this.#eventSub ? this.#eventSub.id : id
  }
}
