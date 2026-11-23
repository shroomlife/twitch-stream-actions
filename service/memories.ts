import { mkdir, readdir, link, unlink } from 'node:fs/promises'
import { join } from 'node:path'

export const sizes = { preview:[360,360], square:[1080,1080], portrait:[1080,1350], story:[1080,1920] } as const
export type Format = keyof typeof sizes
export function validKey(key:unknown):key is string {
  return typeof key === 'string' && /^\d{13}-[0-9a-f-]{36}$/.test(key)
}
// The caller derives the owner from Twitch or uses the isolated local test owner.
export async function saveMemory(root:string,owner:string,key:string,image:Uint8Array) {
  if (!validKey(key) || !/^\d+$/.test(owner)) throw Error('Invalid photo identity')
  const meta=await new Bun.Image(image).metadata()
  if (meta.format!=='jpeg' || !meta.width || !meta.height || meta.width*meta.height>4000000) throw Error('Invalid camera frame')
  const dir=join(root,owner)
  await mkdir(dir,{recursive:true})
  const tmp=join(dir,crypto.randomUUID()+'.part')
  try {
    await Bun.write(tmp,image)
    await link(tmp,join(dir,key+'.jpg')).catch(err=>{if(err.code!=='EEXIST')throw err})
  } finally { await unlink(tmp).catch(()=>{}) }
}
export async function listMemories(root:string,owner:string) {
  const files=await readdir(join(root,owner)).catch(err=>{if(err.code==='ENOENT')return [];throw err})
  return files.filter(x=>x.endsWith('.jpg')).map(x=>x.slice(0,-4)).filter(validKey).sort().reverse()
}
export async function renderMemory(root:string,owner:string,key:string,format:Format) {
  if(!validKey(key)||!Object.hasOwn(sizes,format))throw Error('Invalid format')
  const [width,height]=sizes[format]
  const file=Bun.file(join(root,owner,key+'.jpg'))
  if(!await file.exists())return null
  const cache=join(root,owner,key+'.'+format+'.jpg')
  if(await Bun.file(cache).exists())return new Uint8Array(await Bun.file(cache).arrayBuffer())
  const border=Math.round(width*.037)
  const bottom=Math.round(height*.115)
  const area=String(width-2*border)+'x'+String(height-border-bottom)
  const dimensions=width+'x'+height
  const executable=process.platform==='win32'?'magick':'convert'
  const stamp=new Date(Number(key.slice(0,13))).toISOString().slice(0,10)
  const proc=Bun.spawn([executable,join(root,owner,key+'.jpg'), '-auto-orient','-resize',area+'^','-gravity','center','-extent',area,'-gravity','north','-background','#faf7f2','-splice','0x'+border,'-extent',dimensions,'-gravity','south','-fill','#182126','-font',process.platform==='win32'?'Arial':'DejaVu-Sans','-pointsize',String(Math.round(width*.035)),'-annotate','+0+'+Math.round(bottom*.34),'shroomlive   /   '+stamp,'-strip','-quality','89','jpeg:-'],{stdout:'pipe',stderr:'ignore'})
  const bytes=new Uint8Array(await new Response(proc.stdout).arrayBuffer())
  if(await proc.exited || !bytes.length)throw Error('Photo export failed')
  const tmp=cache+'.'+crypto.randomUUID()+'.part'
  try {
    await Bun.write(tmp,bytes)
    await link(tmp,cache).catch(err=>{if(err.code!=='EEXIST')throw err})
  } finally {await unlink(tmp).catch(()=>{})}
  return bytes
}
