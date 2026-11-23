const { app, BrowserWindow, screen, ipcMain } = require('electron')
const path = require('node:path')
app.setPath('userData', path.join(app.getPath('appData'), 'shroomlive-reaction-display'))
if (!app.requestSingleInstanceLock()) app.quit()
else app.whenReady().then(() => {
  const {spawn}=require('node:child_process')
  const worker=spawn('bun',['--env-file=.env.production','service/moderation-worker.ts'],{cwd:path.join(__dirname,'..'),windowsHide:true,stdio:['pipe','pipe','ignore']})
  worker.stdin.on('error',()=>{})
  app.once('will-quit',()=>worker.kill())
  // Tray: auto-approve switch and removal of the visible or waiting reactions.
  require('./desktop-control.cjs').startControl({electron:require('electron'),worker,settingsFile:path.join(app.getPath('userData'),'settings.json')})
  function bounds() {
    const b = screen.getPrimaryDisplay().bounds
    const width = Math.round(Math.min(b.width * .46, b.height * 1.2))
    const height = Math.round(b.height * .92)
    return { width, height, x: Math.round(b.x + b.width*.66 - width/2), y: Math.round(b.y + (b.height-height)/2) }
  }
  const win = new BrowserWindow({...bounds(), title:'shroomlive Reaktionen', show:false, frame:false, transparent:true, focusable:false, skipTaskbar:true, hasShadow:false, webPreferences:{preload:path.join(__dirname,"display-preload.cjs"),sandbox:true, contextIsolation:true, backgroundThrottling:false}})
  // Photo strip: three shots in the first seconds the reaction is on screen, each announced by a private flash.
  const shotDelays=[1200,2200,3200]
  let lastId, stopShots=()=>{}
  ipcMain.on('reaction-visible', (event,{id,until,local,media})=>{
    if(event.sender!==win.webContents || !Number.isFinite(until) || until<=Date.now() || until>Date.now()+10500) return
    if(local ? !/^\d{13}-[0-9a-f-]{36}$/.test(id) || !/^[A-Za-z0-9-]{1,80}$/.test(media) : !Number.isSafeInteger(id)) return
    if(id===lastId)return
    lastId=id
    stopShots()
    const visibleAt=Date.now()
    const captureDeadline=visibleAt+5000
    const proc=spawn('bun',['service/reaction-camera.ts'],{cwd:path.join(__dirname,'..'),windowsHide:true,stdio:['pipe','pipe','ignore']})
    proc.stdin.on('error',()=>{})
    proc.on('error',()=>{})
    proc.stdin.write(JSON.stringify({id,until:captureDeadline,local,media:local?media:undefined})+'\n')
    const stop=setTimeout(()=>proc.kill(),15000)
    proc.once('close',()=>clearTimeout(stop))
    let taken=0, finished=false, pending
    // Without a frame the helper is dropped; after one, closing stdin lets taken frames finish uploading.
    function finish(){
      if(finished)return
      finished=true
      clearTimeout(pending)
      if(taken)proc.stdin.end();else proc.kill()
    }
    stopShots=finish
    proc.stdout.once('data',()=>{
      if(finished || Date.now()>captureDeadline-400){finish();return}
      const flash=new BrowserWindow({...screen.getPrimaryDisplay().bounds,frame:false,show:false,focusable:false,skipTaskbar:true,backgroundColor:'#ffffff',opacity:0.65})
      flash.setContentProtection(true)
      flash.setIgnoreMouseEvents(true)
      flash.setAlwaysOnTop(true,'screen-saver')
      proc.once('close',()=>{if(!flash.isDestroyed())flash.destroy()})
      // A late helper must not bunch the shots: keep at least a second between two frames.
      let lastShot=-Infinity
      function shoot(){
        const at=Math.max(visibleAt+shotDelays[taken],lastShot+1000)
        if(at>captureDeadline-400){finish();return}
        pending=setTimeout(()=>{
          if(finished || Date.now()>captureDeadline-400){finish();return}
          lastShot=Date.now()
          flash.showInactive()
          pending=setTimeout(()=>{
            if(finished)return
            taken++
            proc.stdin.write('capture '+taken+'\n')
            if(taken===shotDelays.length)finish();else shoot()
          },85)
          setTimeout(()=>{if(!flash.isDestroyed())flash.hide()},350)
        },Math.max(0,at-Date.now()))
      }
      shoot()
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


