// Server-sent events for the stage and the panel. A failing client is dropped, never allowed to break a broadcast.
const encoder = new TextEncoder()

export interface SseLimits { maxTotal: number; maxPerIp: number; keepaliveMs: number }

export class SseHub {
  readonly #clients = new Map<ReadableStreamDefaultController<Uint8Array>, string>()
  #keepalive: ReturnType<typeof setInterval> | undefined

  constructor(private readonly limits: SseLimits) {}

  get size() { return this.#clients.size }

  // Returns the reason when the connection is refused.
  admit(ip: string): 'total' | 'ip' | null {
    if (this.#clients.size >= this.limits.maxTotal) return 'total'
    let fromIp = 0
    for (const owner of this.#clients.values()) if (owner === ip) fromIp++
    return fromIp >= this.limits.maxPerIp ? 'ip' : null
  }

  open(ip: string, first: () => string, headers: HeadersInit): Response {
    let own: ReadableStreamDefaultController<Uint8Array> | undefined
    return new Response(
      new ReadableStream<Uint8Array>({
        start: (controller) => {
          own = controller
          this.#clients.set(controller, ip)
          this.#send(controller, first())
          this.#keepalive ??= setInterval(() => this.broadcast(': keepalive\n\n'), this.limits.keepaliveMs)
        },
        cancel: () => {
          if (own) this.#drop(own)
        },
      }),
      { headers },
    )
  }

  broadcast(text: string) {
    for (const controller of [...this.#clients.keys()]) this.#send(controller, text)
  }

  close() {
    for (const controller of [...this.#clients.keys()]) this.#drop(controller)
  }

  #send(controller: ReadableStreamDefaultController<Uint8Array>, text: string) {
    try {
      controller.enqueue(encoder.encode(text))
    } catch {
      this.#drop(controller)
    }
  }

  #drop(controller: ReadableStreamDefaultController<Uint8Array>) {
    if (!this.#clients.delete(controller)) return
    try {
      controller.close()
    } catch {
      // Already closed or errored by the client side.
    }
    if (!this.#clients.size) {
      clearInterval(this.#keepalive)
      this.#keepalive = undefined
    }
  }
}
