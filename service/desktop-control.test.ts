import { expect, test } from 'bun:test'
import { EventEmitter } from 'node:events'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { menuTemplate, startControl } from './desktop-control.cjs'

type Item = { label?: string; type?: string; checked?: boolean; enabled?: boolean; click?: (item: { checked: boolean }) => void }

function fakeElectron() {
  const menus: Item[][] = []
  class Tray { setToolTip() {} setContextMenu(menu: Item[]) { menus.push(menu) } }
  return { menus, electron: { Tray, Menu: { buildFromTemplate: (template: Item[]) => template }, nativeImage: { createFromPath: () => ({}) }, app: { quit() {} } } }
}
function fakeWorker() {
  const lines: string[] = []
  return { lines, stdout: new EventEmitter(), stdin: { write: (line: string) => lines.push(line.trim()) } }
}

test('the menu lists the switch, the visible reaction and the queue with Entfernen', () => {
  const removed: number[] = []
  const template: Item[] = menuTemplate(
    { autoApprove: true, connected: true, active: { id: 1, author: 'Ada', media: 'pilz-wave', message: '' }, queued: [{ id: 2, author: 'Bob', media: 'abc', message: 'hi', state: 'held' }] },
    { setAutoApprove() {}, remove: (id: number) => removed.push(id), quit() {} },
  )
  expect(template.find((item) => item.type === 'checkbox')).toMatchObject({ label: 'Automatisch freigeben nach Prüfung', checked: true })
  const removals = template.filter((item) => item.label?.startsWith('Entfernen'))
  expect(removals.map((item) => item.label)).toEqual(['Entfernen: Ada · Winken', 'Entfernen: Bob · GIPHY · hi (wartet auf dich)'])
  for (const item of removals) item.click?.({ checked: false })
  expect(removed).toEqual([1, 2])
})

test('the switch defaults to on, is stored locally and sent to the worker on start and on change', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'stream-actions-tray-'))
  const settingsFile = join(dir, 'settings.json')
  const { electron, menus } = fakeElectron()
  const worker = fakeWorker()
  startControl({ electron, worker, settingsFile })
  expect(worker.lines).toEqual(['{"type":"auto-approve","value":true}'])
  menus.at(-1)?.find((item) => item.type === 'checkbox')?.click?.({ checked: false })
  expect(worker.lines.at(-1)).toBe('{"type":"auto-approve","value":false}')
  expect(JSON.parse(await readFile(settingsFile, 'utf8'))).toEqual({ autoApprove: false })
  // A restart reads the stored choice.
  const again = fakeWorker()
  startControl({ electron: fakeElectron().electron, worker: again, settingsFile })
  expect(again.lines).toEqual(['{"type":"auto-approve","value":false}'])
})

test('queue snapshots from the worker rebuild the menu', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'stream-actions-tray-'))
  const { electron, menus } = fakeElectron()
  const worker = fakeWorker()
  startControl({ electron, worker, settingsFile: join(dir, 'settings.json') })
  const snapshot = { autoApprove: true, active: null, queued: [{ id: 5, author: 'Cy', media: 'pilz-hi', message: '', state: 'ready' }] }
  const line = JSON.stringify({ type: 'queue', snapshot }) + '\n'
  worker.stdout.emit('data', line.slice(0, 10))
  worker.stdout.emit('data', line.slice(10))
  const labels = menus.at(-1)?.map((item) => item.label)
  expect(labels).toContain('Entfernen: Cy · Hi! (freigegeben)')
  expect(labels).toContain('Keine Reaktion im Stream')
  expect(labels).not.toContain('Keine Verbindung zum Dienst')
  menus.at(-1)?.find((item) => item.label?.startsWith('Entfernen'))?.click?.({ checked: false })
  expect(worker.lines.at(-1)).toBe('{"type":"remove","id":5}')
})
