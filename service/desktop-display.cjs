const { app, BrowserWindow, screen, ipcMain } = require('electron')
const path = require('node:path')
app.setPath('userData', path.join(app.getPath('appData'), 'shroomlive-reaction-display'))
if (!app.requestSingleInstanceLock()) app.quit()
else app.whenReady().then(() => {
  const {spawn}=require('node:child_process')
  const worker=spawn('bun',['--env-file=.env.production','service/moderation-worker.ts'],{cwd:path.join(__dirname,'..'),windowsHide:true,stdio:'ignore'})
  app.once('will-quit',()=>worker.kill())
  function bounds() {
    const b = screen.getPrimaryDisplay().bounds
    const width = Math.round(Math.min(b.width * .46, b.height * 1.2))
    const height = Math.round(b.height * .92)
    return { width, height, x: Math.round(b.x + b.width*.66 - width/2), y: Math.round(b.y + (b.height-height)/2) }
  }
  const win = new BrowserWindow({...bounds(), title:'shroomlive Reaktionen', show:false, frame:false, transparent:true, focusable:false, skipTaskbar:true, hasShadow:false, webPreferences:{preload:path.join(__dirname,"display-preload.cjs"),sandbox:true, contextIsolation:true, backgroundThrottling:false}})
  let lastId, pending
  ipcMain.on('reaction-visible', (event,{id,until,local})=>{
    if(event.sender!==win.webContents || !Number.isFinite(until) || until<=Date.now() || until>Date.now()+10500) return
    if(local ? !/^\d{13}-[0-9a-f-]{36}$/.test(id) : !Number.isSafeInteger(id)) return
    if(id===lastId)return
    lastId=id
    clearTimeout(pending)
    const visibleAt=Date.now()
    const captureDeadline=visibleAt+5000
    const proc=spawn('bun',['service/reaction-camera.ts'],{cwd:path.join(__dirname,'..'),windowsHide:true,stdio:['pipe','pipe','ignore']})
    proc.stdin.on('error',()=>{})
    proc.on('error',()=>{})
    proc.stdin.write(JSON.stringify({id,until:captureDeadline,local})+'\n')
    const stop=setTimeout(()=>proc.kill(),15000)
    proc.once('close',()=>clearTimeout(stop))
    proc.stdout.once('data',()=>{
      if(id!==lastId || Date.now()>captureDeadline-400){proc.kill();return}
      const flash=new BrowserWindow({...screen.getPrimaryDisplay().bounds,frame:false,show:false,focusable:false,skipTaskbar:true,backgroundColor:'#ffffff',opacity:0.65})
      flash.setContentProtection(true)
      flash.setIgnoreMouseEvents(true)
      flash.setAlwaysOnTop(true,'screen-saver')
      proc.once('close',()=>{if(!flash.isDestroyed())flash.destroy()})
      pending=setTimeout(()=>{
        if(id!==lastId || Date.now()>captureDeadline-400){proc.kill();return}
        flash.showInactive()
        setTimeout(()=>{if(id===lastId)proc.stdin.end('capture\n');else proc.kill()},85)
        setTimeout(()=>{if(!flash.isDestroyed())flash.destroy()},350)
      },Math.max(0,visibleAt+1200-Date.now()))
    })
  })
  win.setContentProtection(true)
  win.setIgnoreMouseEvents(true)
  win.setAlwaysOnTop(true,'screen-saver')
  win.webContents.setAudioMuted(true)
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}))
  win.on('ready-to-show',()=>win.showInactive())
  screen.on('display-metrics-changed',()=>win.setBounds(bounds()))
  win.loadFile(path.join(__dirname,'../stage-dist/stage-local.html'),{query:{display:'desktop'}})
})


