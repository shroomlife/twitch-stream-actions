import {listMemories,renderMemory} from './memories'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const root=join(tmpdir(),'shroomlive-panel-test-photos')
const body=JSON.parse(await Bun.stdin.text())
if(!body.key)console.log(JSON.stringify((await listMemories(root,'0')).filter(key=>key!=='1795129200000-00000000-0000-4000-8000-000000000001')))
else {
 const image=await renderMemory(root,'0',body.key,body.format)
 if(!image)process.exit(1)
 await Bun.write(Bun.stdout,image)
}
