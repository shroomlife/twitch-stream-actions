import {expect,test} from 'bun:test'
import {mkdtemp,readFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {listMemories,renderMemory,saveMemory,sizes,type Format} from './memories'

test('camera prints retain exact dimensions, owner isolation and duplicate protection',async()=>{
  const root=await mkdtemp(join(tmpdir(),'shroomlive-photo-test-'))
  const sample=join(root,'sample.jpg')
  const proc=Bun.spawn([process.platform==='win32'?'magick':'convert','-size','1280x720','gradient:#4fe3b0-#ed38f7',sample])
  expect(await proc.exited).toBe(0)
  const image=await readFile(sample)
  const key=Date.now()+'-'+crypto.randomUUID()
  await Promise.all([saveMemory(root,'123',key,image),saveMemory(root,'123',key,image)])
  for(const [format,[width,height]] of Object.entries(sizes)){
    const photo=await renderMemory(root,'123',key,format as Format)
    expect(photo).toBeTruthy()
    expect(await new Bun.Image(photo!).metadata()).toMatchObject({width,height,format:'jpeg'})
    expect(await renderMemory(root,'123',key,format as Format)).toEqual(photo)
  }
  expect(await listMemories(root,'123')).toEqual([key])
  expect(await listMemories(root,'456')).toEqual([])
  expect(await renderMemory(root,'456',key,'story')).toBeNull()
  await expect(renderMemory(root,'123','../sample','square')).rejects.toThrow()
})
