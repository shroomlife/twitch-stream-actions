const {app,BrowserWindow,ipcMain}=require('electron')
const path=require('node:path')
app.setPath('userData',path.join(app.getPath('appData'),'shroomlive-reaction-review'))
;(async()=>{
  const item=JSON.parse(process.env.SHROOMLIVE_REVIEW)
  delete process.env.SHROOMLIVE_REVIEW
  await app.whenReady()
  const win=new BrowserWindow({width:450,height:515,frame:false,backgroundColor:'#0b1016',title:'shroomlive · Reaktion prüfen',show:false,alwaysOnTop:true,autoHideMenuBar:true,webPreferences:{sandbox:true,contextIsolation:true,preload:path.join(__dirname,'review-preload.cjs')}})
  win.setContentProtection(true)
  let decided=false
  function finish(yes){if(decided)return;decided=true;app.exit(yes ? 10 : 11)}
  ipcMain.on('decision',(event,yes)=>{if(event.sender===win.webContents)finish(yes===true)})
  win.on('closed',()=>finish(false))
  win.webContents.once('did-finish-load',()=>{win.webContents.send('submission',item);win.show()})
  await win.loadFile(path.join(__dirname,'review-window.html'))
})()

