// Desktop worker, started by desktop-display.cjs. Talks to the service over the authenticated desktop channel.
// stdin: one command per line (auto-approve switch, removal). stdout: one queue snapshot per line for the tray menu.
import { createInterface } from 'node:readline'
import { loadDesktopKey } from './desktop-credential'
import { createWorker, parseCommand } from './desktop-worker-core'
import { askRobin, moderate } from './moderate'
import { publicBaseUrl } from './public-url'

const key = await loadDesktopKey()
const endpoint = publicBaseUrl() + '/stream-actions/desktop-job'
const retryMs = 3000

async function request(body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) throw Error('Worker unavailable (' + res.status + ')')
  return res.json()
}

// Repeats a step for as long as the worker runs; a failure waits before the next try.
async function forever(step: () => Promise<void>) {
  for (;;) {
    try {
      await step()
    } catch {
      await Bun.sleep(retryMs)
    }
  }
}

async function untilDone(body: Record<string, unknown>) {
  for (;;) {
    try {
      return await request(body)
    } catch {
      await Bun.sleep(retryMs)
    }
  }
}

const worker = createWorker({ request, moderate, askRobin })
let since = ''
async function watchQueue() {
  const snapshot = await request({ action: 'queue', since })
  since = JSON.stringify(snapshot)
  process.stdout.write(JSON.stringify({ type: 'queue', snapshot }) + '\n')
}

createInterface({ input: process.stdin }).on('line', (line) => {
  const command = parseCommand(line)
  if (command?.type === 'auto-approve') void untilDone({ action: 'settings', autoApprove: command.value })
  else if (command?.type === 'remove') void untilDone({ action: 'remove', id: command.id })
})

await Promise.all([forever(worker.pendingStep), forever(worker.heldStep), forever(watchQueue)])
