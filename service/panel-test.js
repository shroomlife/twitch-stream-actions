// Only the localhost preview server inserts this fixture into the built panel.
(() => {
  const mode = new URLSearchParams(location.search).get('view')
  const viewer = 'local-viewer'
  const stream = 'local-stream'
  let cooldown = 0
  window.Twitch = {ext:{viewer:{id:mode==='link'?null:viewer,isLinked:mode!=='link'},onAuthorized(callback){callback({userId:mode==='guest'?'A-test':viewer,token:'local-test'})}}}
  window.EventSource = class extends EventTarget {}
  const fetchReal = window.fetch.bind(window)
  window.fetch = async (input, options) => {
    const url = new URL(input,location.href)
    if (url.origin !== 'https://shroomlive.de' || !url.pathname.startsWith('/stream-actions/')) return fetchReal(input,options)
    const body = JSON.parse(options?.body || '{}')
    let data
    switch (url.pathname) {
      case '/stream-actions/memories':
      case '/stream-actions/memory':
        return fetchReal('/test-'+url.pathname.split('/').pop(),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:options.signal})
      case '/stream-actions/auth':
        data = {user:{id:viewer,jwtToken:'local-test',owner:true,cooldowns:{giphy:Math.max(0,Math.ceil((cooldown-Date.now())/1000))}},currentStream:mode==='offline'?null:{id:stream}}
        break
      case '/stream-actions/send':
        if(Date.now()<cooldown) return Promise.resolve(Response.json({error:'Bitte kurz warten.'},{status:429}))
        cooldown=Date.now()+60000
        const response = await fetchReal('/test-in-obs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({media:body.id,message:body.userMessage||'',moderate:true})})
        if (!response.ok) return response
        const targets = await response.json()
        const note=document.getElementById('test-status')
        note.textContent=targets.includes('rejected')?'Testreaktion verworfen.':'Desktop: '+(targets.includes('desktop')?'angezeigt':'ohne Bestätigung')+' · OBS: '+(targets.includes('obs')?'gesendet':'ohne Bestätigung')
        data={success:true}
        break
      default: return Promise.resolve(new Response(null,{status:404}))
    }
    return Promise.resolve(Response.json(data))
  }
  window.addEventListener('DOMContentLoaded',()=>{
    if(mode)return
    document.title='Paneltest · shroomlive Actions'
    const note=document.createElement('aside')
    note.style.cssText='max-width:476px;margin:8px auto;padding:8px 12px;color:#bcd1d7;font:14px system-ui'
    note.id='test-status'
    note.setAttribute('role','status')
    note.textContent='Lokaler Test · GIPHY sucht live. Wähle ein Motiv und klicke auf „In den Stream senden“. Nach der Prüfung erscheint es auf deinem Desktop und in OBS.'
    const camera=document.createElement('p')
    camera.setAttribute('role','status')
    const check=document.createElement('button')
    check.type='button'
    check.textContent='Kamera prüfen'
    async function checkCamera(){
      check.disabled=true
      try{
        const response=await fetchReal('/test-camera-status',{method:'POST'})
        camera.textContent=(await response.json()).message
      }catch{camera.textContent='Kamerastatus konnte nicht gelesen werden.'}
      finally{check.disabled=false}
    }
    check.onclick=checkCamera
    const tools=document.createElement('aside')
    tools.style.cssText=note.style.cssText
    tools.append(camera,check)
    document.body.prepend(note,tools)
    void checkCamera()
  })
})()


