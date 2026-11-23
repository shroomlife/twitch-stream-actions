import {test,expect} from 'bun:test'
import {runInNewContext} from 'node:vm'
import {readFile,mkdtemp} from 'node:fs/promises'
import {createHmac,randomBytes} from 'node:crypto'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {EventEmitter} from 'node:events'
import {Database} from 'bun:sqlite'

test('a GIF first painted nine seconds into its slot gets a fresh capture deadline',async()=>{
  const now=100000
  const ipc=new EventEmitter(), app=new EventEmitter()
  Object.assign(app,{getPath:()=>'',setPath(){},requestSingleInstanceLock:()=>true,whenReady:()=>Promise.resolve()})
  let sender:object={}
  class Window {
    webContents={setAudioMuted(){},setWindowOpenHandler(){}}
    constructor(){sender=this.webContents}
    setContentProtection(){} setIgnoreMouseEvents(){} setAlwaysOnTop(){} on(){} loadFile(){}
  }
  const entries:string[]=[]
  function spawn(){return {on(){},once(){},stdout:new EventEmitter(),stdin:{on(){},write:(s:string)=>entries.push(s)}}}
  const electron={app,BrowserWindow:Window,ipcMain:ipc,screen:{on(){},getPrimaryDisplay:()=>({bounds:{width:1920,height:1080,x:0,y:0}})}}
  runInNewContext(await readFile(join(import.meta.dir,'desktop-display.cjs'),'utf8'),{
    __dirname:import.meta.dir,Date:{now:()=>now},setTimeout:()=>0,clearTimeout(){},
    require:(id:string)=>id==='electron'?electron:id==='node:child_process'?{spawn}:require(id)
  })
  await Promise.resolve()
  for(const until of [now-1,now+1000,now+1000])ipc.emit('reaction-visible',{sender},{id:42,until,local:false})
  expect(entries.length).toBe(1)
  expect(JSON.parse(entries[0]).until).toBeGreaterThan(now+1200)
})

test('late upload goes to the shown reaction owner only within the upload window',async()=>{
  const root=await mkdtemp(join(tmpdir(),'camera-upload-'))
  const secret=randomBytes(32)
  const dbPath=join(root,'test.sqlite')
  const service=Bun.spawn([process.execPath,join(import.meta.dir,'server.ts')],{
    env:{...process.env,ACTIONS_HOST:'127.0.0.1',PORT:'0',ACTIONS_DB:dbPath,TWITCH_EXTENSION_SECRET:secret.toString('base64'),TWITCH_CLIENT_ID:'test',TWITCH_CLIENT_SECRET:'test'},
    stdout:'pipe',stderr:'pipe'
  })
  try{
    const reader=service.stdout.getReader()
    const line=new TextDecoder().decode((await reader.read()).value)
    const port=Number(line.match(/port (\d+)/)?.[1])
    expect(port).toBeGreaterThan(0)
    const db=new Database(dbPath)
    const now=Date.now()
    try{
      const insert=db.query('INSERT INTO requests(viewer,state,created,shown_at) VALUES(?,?,?,?)')
      insert.run('123','shown',now-20000,now-15000)
      insert.run('456','shown',now-80000,now-70000)
      insert.run('789','pending',now,null)
    }finally{db.close()}
    const sample=join(root,'fixture.jpg')
    expect(await Bun.spawn([process.platform==='win32'?'magick':'convert','-size','20x20','xc:green',sample]).exited).toBe(0)
    const token=createHmac('sha256',secret).update('stream-actions/desktop-worker/v1').digest('hex')
    const send=(id:number)=>fetch('http://127.0.0.1:'+port+'/stream-actions/camera/'+id,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'image/jpeg'},body:Bun.file(sample)})
    for(const [id,status] of [[1,200],[1,200],[2,404],[3,404]])expect((await send(id)).status).toBe(status)
    const {listMemories}=await import('./memories')
    expect(await listMemories(join(root,'reaction-photos'),'123')).toHaveLength(1)
    expect(await listMemories(join(root,'reaction-photos'),'456')).toEqual([])
  }finally{service.kill();await service.exited}
})
