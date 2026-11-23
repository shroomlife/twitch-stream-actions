// Tray of the reaction display: the auto-approve switch (stored locally, mirrored to the service) and "Entfernen" for
// the reaction on screen and the waiting ones. The worker process carries every change to the service.
const path = require('node:path')
const fs = require('node:fs')
const catalog = require('../src/catalog.json')

const stateLabels = { pending: 'wird geprüft', held: 'wartet auf dich', ready: 'freigegeben' }
const motifName = (media) => catalog.find((item) => item.id === media)?.title ?? 'GIPHY'
const entryLabel = (item) => (item.author + ' · ' + motifName(item.media) + (item.message ? ' · ' + item.message : '')).slice(0, 80)

function menuTemplate(state, actions) {
  const template = [
    { label: 'shroomlive Reaktionen', enabled: false },
    { label: 'Automatisch freigeben nach Prüfung', type: 'checkbox', checked: state.autoApprove, click: (item) => actions.setAutoApprove(item.checked) },
    { type: 'separator' },
    { label: 'Gerade im Stream', enabled: false },
    state.active
      ? { label: 'Entfernen: ' + entryLabel(state.active), click: () => actions.remove(state.active.id) }
      : { label: 'Keine Reaktion im Stream', enabled: false },
    { type: 'separator' },
    { label: 'Warteschlange', enabled: false },
  ]
  if (!state.queued.length) template.push({ label: 'Leer', enabled: false })
  for (const item of state.queued)
    template.push({ label: 'Entfernen: ' + entryLabel(item) + ' (' + (stateLabels[item.state] ?? item.state) + ')', click: () => actions.remove(item.id) })
  if (!state.connected) template.push({ type: 'separator' }, { label: 'Keine Verbindung zum Dienst', enabled: false })
  template.push({ type: 'separator' }, { label: 'Beenden', click: actions.quit })
  return template
}

function readSettings(file) {
  try {
    const stored = JSON.parse(fs.readFileSync(file, 'utf8'))
    return { autoApprove: typeof stored.autoApprove === 'boolean' ? stored.autoApprove : true }
  } catch {
    return { autoApprove: true }
  }
}

function writeSettings(file, settings) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(settings))
  fs.renameSync(tmp, file)
}

// worker: a child process with stdin/stdout pipes running moderation-worker.ts.
function startControl({ electron, worker, settingsFile }) {
  const { Tray, Menu, nativeImage, app } = electron
  const settings = readSettings(settingsFile)
  const state = { autoApprove: settings.autoApprove, active: null, queued: [], connected: false }
  const send = (command) => worker.stdin.write(JSON.stringify(command) + '\n')
  const tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'tray-icon.ico')))
  tray.setToolTip('shroomlive Reaktionen')
  const actions = {
    setAutoApprove(value) {
      state.autoApprove = value
      writeSettings(settingsFile, { autoApprove: value })
      send({ type: 'auto-approve', value })
      render()
    },
    remove: (id) => send({ type: 'remove', id }),
    quit: () => app.quit(),
  }
  function render() {
    tray.setContextMenu(Menu.buildFromTemplate(menuTemplate(state, actions)))
  }
  // The locally stored choice is the one that counts; the service gets it on every start.
  send({ type: 'auto-approve', value: state.autoApprove })
  let buffer = ''
  worker.stdout.on('data', (chunk) => {
    buffer += chunk
    let newline
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
      try {
        const message = JSON.parse(line)
        if (message.type !== 'queue') continue
        state.active = message.snapshot.active
        state.queued = message.snapshot.queued
        state.connected = true
        render()
      } catch {
        // Not a protocol line; ignore.
      }
    }
  })
  render()
  return { tray, state, actions }
}

module.exports = { menuTemplate, startControl, readSettings }
