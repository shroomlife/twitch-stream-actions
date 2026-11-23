<script setup lang="ts">
import {ref,watch,onBeforeUnmount} from 'vue'
const props=defineProps<{token:string}>()
const photos=ref<string[]>([]), selected=ref(''), image=ref(''), status=ref(''), error=ref('')
const format=ref('square')
let pictureRequest=0
const labels:Record<string,string>={pending:'Deine Reaktion wird geprüft.',held:'Robin sieht deine Reaktion zur Entscheidung.',ready:'Deine Reaktion ist als Nächstes in der Warteschlange.',shown:'Deine Reaktion wurde zur Einblendung gesendet.',rejected:'Diese Reaktion wurde verworfen.',expired:'Diese Reaktion ist abgelaufen.'}
async function call(path:string,body:object,signal?:AbortSignal){
  const r=await fetch(new URL('/stream-actions/'+path,import.meta.env.VITE_API_URL),{method:'POST',headers:{Authorization:'Bearer '+props.token,'Content-Type':'application/json'},body:JSON.stringify(body),signal})
  if(!r.ok)throw Error()
  return r
}
watch(()=>props.token,async(token,_,cleanup)=>{
  const controller=new AbortController()
  cleanup(()=>controller.abort())
  let since=''
  photos.value=[]; selected.value='';status.value=''
  while(!controller.signal.aborted && token){
    try{
      const data=await (await call('memories',{since},controller.signal)).json()
      if(controller.signal.aborted)return
      since=JSON.stringify(data)
      if(data.photos[0]!==photos.value[0])selected.value=data.photos[0]||''
      photos.value=data.photos
      const latest=data.latest
      status.value=latest && Date.now()-latest.created<600000 ? labels[latest.state]||'' : ''
      if(latest?.state==='shown' && Date.now()-(latest.shown_at ?? latest.created)>60000)status.value='Für diese Einblendung ist kein Kamerafoto eingegangen.'
      if(latest && data.photos.some((key:string)=>key.startsWith(latest.created+'-')))status.value='Dein Reaktionsfoto ist da.'
      error.value=''
    } catch {
      if(controller.signal.aborted)return
      error.value='Fotoalbum gerade nicht erreichbar.'
      await new Promise(resolve=>setTimeout(resolve,5000))
    }
  }
},{immediate:true})
watch(selected,async key=>{
  const n=++pictureRequest
  if(image.value)URL.revokeObjectURL(image.value)
  image.value=''
  if(!key)return
  try{const blob=await (await call('memory',{key,format:'preview'})).blob()
    if(n===pictureRequest)image.value=URL.createObjectURL(blob)
  }catch{if(n===pictureRequest)error.value='Foto konnte nicht geladen werden.'}
})
onBeforeUnmount(()=>{pictureRequest++;if(image.value)URL.revokeObjectURL(image.value)})
async function download(){
  try{
    const blob=await (await call('memory',{key:selected.value,format:format.value})).blob()
    const url=URL.createObjectURL(blob),a=document.createElement('a')
    a.href=url;a.download='shroomlive-'+selected.value.slice(0,13)+'-'+format.value+'.jpg'
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)
  }catch{error.value='Download fehlgeschlagen.'}
}
</script>
<template><section v-if="status || photos.length || error" class="memories" aria-label="Deine Erinnerungen">
<p role="status">{{error || status}}</p>
<template v-if="photos.length"><h2>Deine Reaktionsfotos</h2>
<select v-if="photos.length>1" v-model="selected" aria-label="Erinnerung auswählen"><option v-for="key in photos" :key="key" :value="key">{{new Date(Number(key.slice(0,13))).toLocaleString('de-DE')}}</option></select>
<figure v-if="image" :key="image"><img :src="image" alt="Robins Gesicht beim Einblenden deiner Reaktion"><figcaption>shroomlive · {{new Date(Number(selected.slice(0,13))).toLocaleDateString('de-DE')}}</figcaption></figure>
<select v-model="format" aria-label="Bildformat"><option value="square">Quadrat · 1:1</option><option value="portrait">Feed · 4:5</option><option value="story">Story · 9:16</option></select> <button class="button" @click="download">Foto speichern</button></template></section></template>
<style scoped>
.memories{background:#0b1016;padding:14px;border:1px solid #223040}.memories figure{padding:0;background:#faf7f2;color:#14171c;margin:12px auto;transform:rotate(-1deg);animation:print .65s ease-out}.memories img{display:block;width:100%;height:auto}.memories figcaption{font:700 .8rem monospace;margin-top:10px}.memories select{max-width:100%;color:#eaf2f6;background:#172330;padding:8px;border:1px solid #435262}@keyframes print{from{clip-path:inset(0 0 95%);transform:translateY(-10px)}to{clip-path:inset(0)}}@media(prefers-reduced-motion:reduce){.memories figure{animation:none}}
</style>
