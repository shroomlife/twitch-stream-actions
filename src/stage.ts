import { show, clear } from './stage-renderer'

type PhotoEntry = NonNullable<Parameters<typeof show>[0]> & {id:number|string}
let paintRevision = 0
async function paint(entry:PhotoEntry|null,local:boolean) {
  const revision = ++paintRevision
  const painted=await show(entry)
  if(painted && entry && new URLSearchParams(location.search).get('display')==='desktop') {
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      if (revision !== paintRevision || Date.now() >= entry.until) return
      const bridge=(window as Window & {reactionCamera?:{visible:(id:number|string,until:number,local:boolean)=>void}}).reactionCamera
      bridge?.visible(entry.id,entry.until,local)
    }))
  }
  return painted
}
let testUntil = 0
let liveEntry: PhotoEntry|null = null
const feed = new EventSource(new URL('/stream-actions/events', import.meta.env.VITE_API_URL))
feed.onmessage = event => {
  liveEntry = JSON.parse(event.data)
  if (Date.now() >= testUntil) void paint(liveEntry,false)
}
feed.onerror = () => { if (Date.now() >= testUntil) { paintRevision++; clear() } }

if (document.documentElement.hasAttribute('data-local-stage')) {
  const target = new URLSearchParams(location.search).get('display') === 'desktop' ? 'desktop' : 'obs'
  const origin = 'http://127.0.0.1:27139'
  async function displayTest(entry: NonNullable<typeof liveEntry> & {id:string}) {


    testUntil = entry.until
    if (await paint(entry,true) && target === 'desktop') {
      void fetch(origin+'/reaction-test-result?id='+encodeURIComponent(entry.id)+'&display='+target,{method:'POST'}).catch(()=>{})
    }
    setTimeout(()=>{if(testUntil===entry.until && liveEntry && liveEntry.until>Date.now()) void paint(liveEntry,false)},Math.max(0,entry.until-Date.now()))
  }

  if (target === 'desktop') {
    const tests = new EventSource(origin+'/reaction-test-feed?display=desktop')
    tests.onmessage = event => void displayTest(JSON.parse(event.data))
  } else {
    window.addEventListener('shroomliveReactionTest', event => void displayTest((event as CustomEvent).detail))
  }
}
