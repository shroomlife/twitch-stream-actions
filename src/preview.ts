import catalog from './catalog.json'

const motif = document.querySelector<HTMLSelectElement>('#motif')!
const custom = document.querySelector<HTMLElement>('#custom')!
const gif = document.querySelector<HTMLInputElement>('#gif')!
const frame = document.querySelector('iframe')!
const status = document.querySelector('output')!
motif.add(new Option('GIPHY · Happy Simpsons (Test-GIF)', '26tPplGWjN0xLybiU'))
for (const item of catalog) motif.add(new Option(item.group + ' · ' + item.title, item.id))
motif.add(new Option('GIPHY · Eigenes GIF', 'giphy'))
motif.onchange = () => { custom.hidden = motif.value !== 'giphy' }
document.querySelector('form')!.onsubmit = async event => {
  event.preventDefault()
  let media = motif.value
  if (media === 'giphy') {
    const input = gif.value.trim()
    media = input.match(/^[A-Za-z0-9]+$/)?.[0] || input.match(/^https:\/\/(?:www\.)?giphy\.com\/(?:gifs|stickers)\/(?:[\w-]+-)?([a-zA-Z0-9]+)\/?(?:[?#].*)?$/)?.[1] || ''
    if (!media) { status.value = 'Bitte eine GIPHY-ID oder einen giphy.com-GIF-Link eingeben.'; return }
  }
  if ((event.submitter as HTMLButtonElement)?.value === 'obs') {
    const message = document.querySelector<HTMLInputElement>('#message')!.value
    try {
      const r = await fetch('/test-in-obs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({media,message})})
      if (!r.ok) throw Error()
      const seen: string[] = await r.json()
      status.value = 'Desktop: ' + (seen.includes('desktop') ? 'angezeigt' : 'keine Bestätigung') + ' · OBS: ' + (seen.includes('obs') ? 'gesendet' : 'keine Bestätigung')
    } catch { status.value = 'OBS ist nicht erreichbar. Ist OBS auf diesem Rechner geöffnet?' }
    return
  }
  status.value = 'Motiv wird geladen …'
  frame.contentWindow?.postMessage({media, author:'Testzuschauer', message:document.querySelector<HTMLInputElement>('#message')!.value, until:Date.now()+10000}, location.origin)
}
window.addEventListener('message', e => {
  if (e.origin === location.origin && e.source === frame.contentWindow)
    status.value = e.data.shown ? 'Abgespielt. Du kannst die Reaktion jederzeit wiederholen.' : 'Motiv konnte nicht geladen werden. Bei GIPHY wird die Altersfreigabe G benötigt.'
})




