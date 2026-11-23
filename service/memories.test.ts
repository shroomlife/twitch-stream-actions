import {expect,test} from 'bun:test'
import {mkdtemp,readFile,copyFile,mkdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {listMemories,readFrame,saveMemory} from './memories'

async function cameraFrame(root:string,name:string,color:string){
  const file=join(root,name+'.jpg')
  expect(await Bun.spawn([process.platform==='win32'?'magick':'convert','-size','1280x720','xc:'+color,file]).exited).toBe(0)
  return new Uint8Array(await readFile(file))
}

test('a strip keeps three frames and its motif per owner, once each',async()=>{
  const root=await mkdtemp(join(tmpdir(),'shroomlive-strip-test-'))
  const frames=await Promise.all(['#4fe3b0','#ed38f7','#3de8ff'].map((color,index)=>cameraFrame(root,'frame'+index,color)))
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
  await cameraFrame(root,'legacy','#ffd23d')
  await copyFile(join(root,'legacy.jpg'),join(root,'123',key+'.jpg'))
  expect(await listMemories(root,'123')).toEqual([{key,frames:1,media:null}])
})
