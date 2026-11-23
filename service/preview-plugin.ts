import { readFile } from 'node:fs/promises'
import { execFile, spawn } from 'node:child_process'
import type { ServerResponse } from 'node:http'
import {mkdir,watch} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Plugin } from 'vite'
import catalog from '../src/catalog.json'

export function localObsTest(): Plugin {
  const clients = new Map<ServerResponse,string>()
  const waiting = new Map<string, (target:string)=>void>()
  return {
    name:'local-obs-test',
    async configureServer(server) {
      const folder=join(tmpdir(),'shroomlive-panel-test-photos','0')
      await mkdir(folder,{recursive:true})
      const changes=new EventTarget()
      const watcher=new AbortController()
      server.httpServer?.once('close',()=>watcher.abort())
      void (async()=>{try{for await(const _ of watch(folder,{signal:watcher.signal}))changes.dispatchEvent(new Event('photo'))}catch{}})()
      let latest:{created:number;state:string}|null=null
      function update(created:number,state:string){latest={created,state}; changes.dispatchEvent(new Event('photo'))}
      async function localPhoto(body:object) {
        const proc=spawn('bun',['service/local-memory.ts'],{windowsHide:true,stdio:['pipe','pipe','ignore']})
        const chunks:Buffer[]=[]
        proc.stdout.on('data',chunk=>chunks.push(chunk))
        proc.stdin.end(JSON.stringify(body))
        await new Promise<void>((ok,fail)=>{proc.once('error',fail);proc.once('close',code=>code===0?ok():fail(Error()))})
        return Buffer.concat(chunks)
      }
      server.middlewares.use(async (req,res,next)=>{
        const host = '127.0.0.1:27139'
        const url = new URL(req.url || '/', 'http://localhost')
        if (req.headers.host === host && req.method === 'GET' && url.pathname === '/panel-test') {
          const html = await readFile('dist/index.html','utf8')
          res.setHeader('Content-Type','text/html; charset=utf-8')
          res.setHeader('Cache-Control','no-store')
          res.end(html.replace('<head>', '<head><base href="/dist/">').replace('https://extension-files.twitch.tv/helper/v1/twitch-ext.min.js', '/service/panel-test.js'))
          return
        }
        if(url.pathname==='/test-camera-status'){
          if(req.method!=='POST'||req.headers.host!==host||req.headers.origin!=='http://'+host){res.writeHead(403).end();return}
          execFile('bun',['service/reaction-camera.ts','--status'],{windowsHide:true,timeout:5000},(err,out)=>{
            res.setHeader('Content-Type','application/json')
            res.setHeader('Cache-Control','no-store')
            res.end(err?JSON.stringify({ready:false,message:'Kamerastatus konnte nicht gelesen werden.'}):out)
          })
          return
        }
        if(url.pathname==='/test-memories' || url.pathname==='/test-memory'){
          if(req.method!=='POST'||req.headers.host!==host||req.headers.origin!=='http://'+host){res.writeHead(403).end();return}
          try{
            let raw=''
            for await(const part of req){raw+=part;if(raw.length>65536)throw Error()}
            const body=JSON.parse(raw)
            res.setHeader('Cache-Control','no-store')
            if(url.pathname==='/test-memory'){
              if(typeof body.key!=='string'||!body.key)throw Error()
              const img=await localPhoto({key:body.key,frame:body.frame})
              res.setHeader('Content-Type','image/jpeg');res.end(img);return
            }
            const read=async()=>JSON.stringify({photos:JSON.parse((await localPhoto({})).toString()),latest})
            let snapshot=await read()
            if(body.since===snapshot){
              await new Promise<void>(resolve=>{
                const done=()=>{changes.removeEventListener('photo',done);res.off('close',done);clearTimeout(timer);resolve()}
                const timer=setTimeout(done,20000)
                res.once('close',done);changes.addEventListener('photo',done,{once:true})
              })
              snapshot=await read()
            }
            res.setHeader('Content-Type','application/json');res.end(snapshot)
          }catch{res.writeHead(400).end()}
          return
        }
        if (!['/test-in-obs','/reaction-test-feed','/reaction-test-result'].includes(url.pathname)) return next()
        if (req.headers.host !== host) { res.writeHead(403).end(); return }
        if (url.pathname === '/reaction-test-feed' && req.method === 'GET') {
          const target = url.searchParams.get('display')
          if (target !== 'obs' && target !== 'desktop') { res.writeHead(400).end();return }
          res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'})
          res.write(': ready\n\n')
          clients.set(res,target)
          res.on('close',()=>clients.delete(res))
          return
        }
        if (url.pathname === '/reaction-test-result' && req.method === 'POST') {
          waiting.get(url.searchParams.get('id') || '')?.(url.searchParams.get('display') || '')
          res.writeHead(204,{'Access-Control-Allow-Origin':'*'}).end()
          return
        }
        if (url.pathname !== '/test-in-obs' || req.method !== 'POST' || req.headers.origin !== 'http://'+host || req.headers['content-type']!=='application/json') { res.writeHead(403).end();return }
        try {
          let body=''
          for await(const part of req){body+=part;if(body.length>2048) throw Error()}
          const {media,message,remove,moderate}=JSON.parse(body)
          if(typeof media!=='string'||!(catalog.some(x=>x.id===media)||/^[A-Za-z0-9]{1,80}$/.test(media))||typeof message!=='string'||message.length>128) throw Error()
          const created=Date.now()
          if(moderate===true){
            update(created,'pending')
            const check=spawn('bun',['--env-file=.env.production','service/moderate.ts'],{windowsHide:true,stdio:['pipe','pipe','ignore']})
            check.stdin.on('error',()=>{})
            check.stdin.end(JSON.stringify({media,message,author:'theshroomlife'}))
            let verdict=''
            check.stdout.on('data',chunk=>{verdict+=chunk})
            const result=await new Promise((resolve,reject)=>{check.on('error',reject);check.on('close',resolve)})
            if(result!==0){res.writeHead(503).end();return}
            if(verdict.trim()!=='yes'){update(created,'rejected');res.end(JSON.stringify(['rejected']));return}
          }
          const id=created+'-'+randomUUID()
          const entry={id,media,message,author:'theshroomlife',avatar:'https://static-cdn.jtvnw.net/jtv_user_pictures/120e0cfb-70bd-43bc-bab3-130d039f8838-profile_image-300x300.jpg',until:remove === true ? 0 : Date.now()+10000}
          const rendered=new Set<string>()
          function finish(){clearTimeout(timer);waiting.delete(id);res.setHeader('Content-Type','application/json');res.end(JSON.stringify([...rendered]))}
          const timer=setTimeout(finish,5000)
          waiting.set(id,target=>{rendered.add(target);if(target==='desktop')update(created,'shown');if(rendered.has('obs')&&rendered.has('desktop'))finish()})
          const obs = spawn('bun',['service/obs-test.ts'],{windowsHide:true,stdio:['pipe','ignore','ignore']})
          obs.on('error',()=>{})
          obs.stdin.on('error',()=>{})
          obs.stdin.end(JSON.stringify(entry))
          obs.on('close',code=>{if(code===0)waiting.get(id)?.('obs')})
          for(const client of clients.keys())client.write('data: '+JSON.stringify(entry)+'\n\n')
          if (remove === true) finish()
        }catch{res.writeHead(400).end()}
      })
    }
  }
}



