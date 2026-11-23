import {expect,test} from 'bun:test'
import {mkdtemp,readFile,copyFile,mkdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {listMemories,pruneMemories,readFrame,RetentionJob,retentionMs,saveMemory} from './memories'

// Solid 1280×720 JPEG frames checked into fixtures/, so the tests need no image tool.
const fixture=(color:string)=>join(import.meta.dir,'fixtures','frame-'+color.slice(1)+'.jpg')
async function cameraFrame(color:string){
  return new Uint8Array(await readFile(fixture(color)))
}

test('a strip keeps three frames and its motif per owner, once each',async()=>{
  const root=await mkdtemp(join(tmpdir(),'shroomlive-strip-test-'))
  const frames=await Promise.all(['#4fe3b0','#ed38f7','#3de8ff'].map(cameraFrame))
  const key=Date.now()+'-'+crypto.randomUUID()
  // A retried upload of the same frame is stored once.
  await Promise.all([saveMemory(root,'123',key,1,'26tPplGWjN0xLybiU',frames[0]),saveMemory(root,'123',key,1,'26tPplGWjN0xLybiU',frames[0])])
  expect(await listMemories(root,'123')).toEqual([{key,frames:1,media:'26tPplGWjN0xLybiU'}])
  // Frame 3 alone does not count until frame 2 is there: the strip never shows a gap.
  await saveMemory(root,'123',key,3,'26tPplGWjN0xLybiU',frames[2])
  expect(await listMemories(root,'123')).toEqual([{key,frames:1,media:'26tPplGWjN0xLybiU'}])
  await saveMemory(root,'123',key,2,'26tPplGWjN0xLybiU',frames[1])
  expect(await listMemories(root,'123')).toEqual([{key,frames:3,media:'26tPplGWjN0xLybiU'}])
  const first=await readFrame(root,'123',key,1)
  expect(first).toBeTruthy()
  expect(first?.length).toBeGreaterThan(0)
  expect(first).toEqual(frames[0])
  expect(await readFrame(root,'123',key,3)).toEqual(frames[2])
  // Another viewer sees nothing of it.
  expect(await listMemories(root,'456')).toEqual([])
  expect(await readFrame(root,'456',key,1)).toBeNull()
  await expect(readFrame(root,'123','../frame0',1)).rejects.toThrow()
  await expect(saveMemory(root,'123',key,1,'../x',frames[0])).rejects.toThrow()
  await expect(saveMemory(root,'../123',key,1,'pilz-wave',frames[0])).rejects.toThrow()
})

test('single photo memories from before the strip stay listed without a motif',async()=>{
  const root=await mkdtemp(join(tmpdir(),'shroomlive-strip-test-'))
  const key=Date.now()+'-'+crypto.randomUUID()
  await mkdir(join(root,'123'))
  await copyFile(fixture('#ffd23d'),join(root,'123',key+'.jpg'))
  expect(await listMemories(root,'123')).toEqual([{key,frames:1,media:null}])
})

test('memories older than 90 days are deleted, newer ones stay',async()=>{
  const root=await mkdtemp(join(tmpdir(),'shroomlive-strip-test-'))
  const now=Date.now()
  const frame=await cameraFrame('#4fe3b0')
  const old=(now-retentionMs-1)+'-'+crypto.randomUUID()
  const young=(now-retentionMs+60000)+'-'+crypto.randomUUID()
  await saveMemory(root,'123',old,1,'pilz-wave',frame)
  await saveMemory(root,'123',old,2,'pilz-wave',frame)
  await saveMemory(root,'123',young,1,'pilz-wave',frame)
  await saveMemory(root,'456',old,1,'pilz-wave',frame)
  await pruneMemories(root,now)
  expect((await listMemories(root,'123')).map(memory=>memory.key)).toEqual([young])
  expect(await listMemories(root,'456')).toEqual([])
  expect(await readFrame(root,'123',old,2)).toBeNull()
})

test('the retention job runs after a write, once at a time and at most hourly',async()=>{
  let now=0, runs=0
  let finish:()=>void=()=>{}
  const job=new RetentionJob(()=>{runs++;return new Promise<void>(resolve=>{finish=resolve})},()=>now)
  const first=job.afterWrite()
  expect(job.afterWrite()).toBe(first)
  finish()
  await first
  now=59*60*1000
  await job.afterWrite()
  expect(runs).toBe(1)
  now=60*60*1000
  const second=job.afterWrite()
  finish()
  await second
  expect(runs).toBe(2)
})
