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
    require:(id:string)=>id==='electron'?electron:id==='node:child_process'?{spawn}:id==='./desktop-control.cjs'?{startControl(){}}:require(id)
  })
  await Promise.resolve()
  for(const until of [now-1,now+1000,now+1000])ipc.emit('reaction-visible',{sender},{id:42,until,local:false})
  expect(entries.length).toBe(1)
  expect(JSON.parse(entries[0]).until).toBeGreaterThan(now+1200)
})

async function stripDisplay(){
  let now=100000
  const timers:{at:number;run:()=>void;id:number}[]=[]
  let nextTimer=1
  const clock={
    setTimeout:(run:()=>void,ms=0)=>{const id=nextTimer++;timers.push({at:now+ms,run,id});return id},
    clearTimeout:(id:number)=>{const index=timers.findIndex(timer=>timer.id===id);if(index>=0)timers.splice(index,1)},
    advance(ms:number){
      const end=now+ms
      for(;;){
        timers.sort((a,b)=>a.at-b.at)
        const due=timers[0]
        if(!due||due.at>end)break
        timers.shift()
        now=due.at
        due.run()
      }
      now=end
    },
  }
  const ipc=new EventEmitter(), app=new EventEmitter()
  Object.assign(app,{getPath:()=>'',setPath(){},requestSingleInstanceLock:()=>true,whenReady:()=>Promise.resolve()})
  const windows:{webContents:object;shown:number}[]=[]
  class Window {
    webContents={setAudioMuted(){},setWindowOpenHandler(){}}
    shown=0
    constructor(){windows.push(this)}
    setContentProtection(){} setIgnoreMouseEvents(){} setAlwaysOnTop(){} on(){} loadFile(){}
    showInactive(){this.shown++} hide(){} destroy(){} isDestroyed(){return false}
  }
  const helpers:{lines:string[];shots:number[];ended:boolean;killed:boolean;stdout:EventEmitter}[]=[]
  function spawn(){
    const proc=Object.assign(new EventEmitter(),{lines:[] as string[],shots:[] as number[],ended:false,killed:false,stdout:new EventEmitter()})
    helpers.push(proc)
    return Object.assign(proc,{
      stdin:{on(){},write(line:string){proc.lines.push(line.trim());if(line.startsWith('capture'))proc.shots.push(now)},end(){proc.ended=true}},
      kill(){proc.killed=true},
    })
  }
  const electron={app,BrowserWindow:Window,ipcMain:ipc,screen:{on(){},getPrimaryDisplay:()=>({bounds:{width:1920,height:1080,x:0,y:0}})}}
  runInNewContext(await readFile(join(import.meta.dir,'desktop-display.cjs'),'utf8'),{
    __dirname:import.meta.dir,Date:{now:()=>now},setTimeout:clock.setTimeout,clearTimeout:clock.clearTimeout,
    require:(id:string)=>id==='electron'?electron:id==='node:child_process'?{spawn}:id==='./desktop-control.cjs'?{startControl(){}}:require(id)
  })
  await Promise.resolve()
  const sender=windows[0].webContents
  const show=(id:number,readyAfter=0)=>{
    ipc.emit('reaction-visible',{sender},{id,until:now+10000,local:false})
    const helper=helpers[helpers.length-1]
    if(readyAfter)clock.advance(readyAfter)
    helper.stdout.emit('data','ready\n')
    return helper
  }
  return {clock,show,now:()=>now}
}

test('a strip takes three frames at 1.2, 2.2 and 3.2 seconds while the reaction is visible',async()=>{
  const {clock,show}=await stripDisplay()
  const helper=show(42)
  expect(JSON.parse(helper.lines[0])).toMatchObject({id:42,until:100000+5000})
  const shots:string[]=[]
  for(const at of [1199,1,85,914,1,85,914,1,85]){
    clock.advance(at)
    shots.push(helper.lines.slice(1).join('|'))
  }
  expect(shots).toEqual(['','','capture 1','capture 1','capture 1','capture 1|capture 2','capture 1|capture 2','capture 1|capture 2','capture 1|capture 2|capture 3'])
  expect(helper.ended).toBe(true)
  expect(helper.killed).toBe(false)
})

test('the strip stops at the capture deadline and a newer reaction ends the old one gracefully',async()=>{
  const {clock,show}=await stripDisplay()
  // OBS answers only 3 s after the reaction became visible: shots stay a second apart and a third would miss the deadline.
  const late=show(1,3000)
  clock.advance(5000)
  expect(late.shots).toEqual([103085,104085])
  expect(late.lines.slice(1)).toEqual(['capture 1','capture 2'])
  expect(late.ended).toBe(true)
  expect(late.killed).toBe(false)
  const first=show(2)
  clock.advance(1500)
  const second=show(3)
  expect(first.lines.slice(1)).toEqual(['capture 1'])
  expect(first.ended).toBe(true)
  expect(first.killed).toBe(false)
  clock.advance(500)
  const third=show(4)
  // No frame was taken yet: that helper is dropped.
  expect(second.killed).toBe(true)
  clock.advance(5000)
  expect(third.lines.slice(1)).toEqual(['capture 1','capture 2','capture 3'])
})

test('late strip frames go to the shown reaction owner only within the upload window',async()=>{
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
      const insert=db.query('INSERT INTO requests(viewer,media,state,created,shown_at) VALUES(?,?,?,?,?)')
      insert.run('123','pilz-wave','shown',now-20000,now-15000)
      insert.run('456','pilz-wave','shown',now-80000,now-70000)
      insert.run('789','pilz-wave','pending',now,null)
    }finally{db.close()}
    const sample=join(import.meta.dir,'fixtures','green-20.jpg')
    const token=createHmac('sha256',secret).update('stream-actions/desktop-worker/v1').digest('hex')
    const send=(id:number,frame:number)=>fetch('http://127.0.0.1:'+port+'/stream-actions/camera/'+id+'/'+frame,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'image/jpeg'},body:Bun.file(sample)})
    for(const [id,frame,status] of [[1,1,200],[1,1,200],[1,2,200],[1,3,200],[1,4,400],[2,1,404],[3,1,404]])expect((await send(id,frame)).status).toBe(status)
    const {listMemories}=await import('./memories')
    expect(await listMemories(join(root,'reaction-photos'),'123')).toEqual([expect.objectContaining({frames:3,media:'pilz-wave'})])
    expect(await listMemories(join(root,'reaction-photos'),'456')).toEqual([])
  }finally{service.kill();await service.exited}
})
