<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import markDark from '@/assets/giphy-mark-dark.png'
import { lookupMotif, type Motif } from '@/media'
import { isPngFormat, stripPlan, type MemoryEntry } from '@/memory-card'
import { renderMemoryPng } from '@/memory-png'

const props = defineProps<{ token: string }>()
const photos = ref<MemoryEntry[]>([]), selected = ref(''), status = ref(''), error = ref('')
const frameUrls = ref<string[]>([]), motif = ref<Motif | null>(null), format = ref('square'), saving = ref(false)
const current = computed(() => photos.value.find((memory) => memory.key === selected.value) ?? null)
const plan = computed(() => (current.value ? stripPlan(current.value) : null))
let firstFrame: Blob | null = null
const labels: Record<string, string> = { pending: 'Deine Reaktion wird geprüft.', held: 'Robin sieht deine Reaktion zur Entscheidung.', ready: 'Deine Reaktion ist als Nächstes in der Warteschlange.', shown: 'Deine Reaktion wurde zur Einblendung gesendet.', rejected: 'Diese Reaktion wurde verworfen.', expired: 'Diese Reaktion ist abgelaufen.' }

async function call(path: string, body: object, signal?: AbortSignal) {
  const r = await fetch(new URL('/stream-actions/' + path, import.meta.env.VITE_API_URL), { method: 'POST', headers: { Authorization: 'Bearer ' + props.token, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal })
  if (!r.ok) throw Error()
  return r
}
function isMemory(value: unknown): value is MemoryEntry {
  return typeof value === 'object' && value !== null
    && 'key' in value && typeof value.key === 'string'
    && 'frames' in value && typeof value.frames === 'number'
    && 'media' in value && (value.media === null || typeof value.media === 'string')
}

watch(() => props.token, async (token, _, cleanup) => {
  const controller = new AbortController()
  cleanup(() => controller.abort())
  let since = ''
  photos.value = []; selected.value = ''; status.value = ''
  while (!controller.signal.aborted && token) {
    try {
      const data = await (await call('memories', { since }, controller.signal)).json()
      if (controller.signal.aborted) return
      since = JSON.stringify(data)
      const list: MemoryEntry[] = Array.isArray(data.photos) ? data.photos.filter(isMemory) : []
      // A strip grows while its frames arrive; keep the choice unless a newer memory appeared.
      if (list[0]?.key !== photos.value[0]?.key) selected.value = list[0]?.key ?? ''
      photos.value = list
      const latest = data.latest
      status.value = latest && Date.now() - latest.created < 600000 ? labels[latest.state] || '' : ''
      if (latest?.state === 'shown' && Date.now() - (latest.shown_at ?? latest.created) > 60000) status.value = 'Für diese Einblendung ist kein Kamerafoto eingegangen.'
      if (latest && list.some((memory) => memory.key.startsWith(latest.created + '-'))) status.value = 'Deine Erinnerung ist da.'
      error.value = ''
    } catch {
      if (controller.signal.aborted) return
      error.value = 'Fotoalbum gerade nicht erreichbar.'
      await new Promise((resolve) => setTimeout(resolve, 5000))
    }
  }
}, { immediate: true })

function releaseFrames() {
  for (const url of frameUrls.value) URL.revokeObjectURL(url)
  frameUrls.value = []
  firstFrame = null
}
// Reload when another frame of the same strip arrives, not on every poll.
watch(() => current.value && current.value.key + '/' + current.value.frames, async (_, __, cleanup) => {
  const controller = new AbortController()
  cleanup(() => controller.abort())
  const memory = current.value
  releaseFrames()
  if (!memory) return
  try {
    const blobs = await Promise.all(stripPlan(memory).frames.map(async (frame) => (await call('memory', { key: memory.key, frame }, controller.signal)).blob()))
    if (controller.signal.aborted) return
    firstFrame = blobs[0] ?? null
    frameUrls.value = blobs.map((blob) => URL.createObjectURL(blob))
  } catch { if (!controller.signal.aborted) error.value = 'Foto konnte nicht geladen werden.' }
}, { immediate: true })
watch(() => current.value?.media ?? null, async (media, _, cleanup) => {
  const controller = new AbortController()
  cleanup(() => controller.abort())
  motif.value = null
  if (!media) return
  try {
    const found = await lookupMotif(media, AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]))
    if (!controller.signal.aborted) motif.value = found
  } catch { /* The strip stays useful without its motif. */ }
}, { immediate: true })
onBeforeUnmount(releaseFrames)

async function download() {
  const memory = current.value
  if (!memory || !firstFrame || !isPngFormat(format.value)) return
  saving.value = true
  try {
    const blob = await renderMemoryPng(memory, format.value, firstFrame, AbortSignal.timeout(15000))
    const url = URL.createObjectURL(blob), a = document.createElement('a')
    a.href = url; a.download = 'shroomlive-' + memory.key.slice(0, 13) + '-' + format.value + '.png'
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000)
  } catch { error.value = 'Download fehlgeschlagen.' } finally { saving.value = false }
}
</script>

<template><section v-if="status || photos.length || error" class="memories" aria-label="Deine Erinnerungen">
<p role="status">{{ error || status }}</p>
<template v-if="photos.length"><h2>Deine Erinnerungen</h2>
<select v-if="photos.length > 1" v-model="selected" aria-label="Erinnerung auswählen"><option v-for="memory in photos" :key="memory.key" :value="memory.key">{{ new Date(Number(memory.key.slice(0, 13))).toLocaleString('de-DE') }}</option></select>
<figure v-if="current && plan && frameUrls.length" :key="current.key" class="memory-card" :class="'frames-' + frameUrls.length" :style="{ '--cycle': plan.cycleMs + 'ms' }">
  <div class="memory-photo"><img v-for="(src, index) in frameUrls" :key="src" :src="src" :style="{ animationDelay: plan.delays[index] + 'ms' }" :alt="index === 0 ? 'Robins Gesicht beim Einblenden deiner Reaktion' : ''"></div>
  <ol v-if="frameUrls.length > 1" class="memory-strip" aria-hidden="true"><li v-for="(src, index) in frameUrls" :key="src" :style="{ animationDelay: plan.delays[index] + 'ms' }"><img :src="src" alt=""></li></ol>
  <div v-if="motif" class="memory-motif">
    <img :src="motif.animated" alt="Deine Reaktion">
    <div v-if="motif.giphy" class="memory-credit"><span v-if="motif.creator">GIF: @{{ motif.creator }}</span><span class="giphy-plate"><img :src="markDark" alt="Powered by GIPHY" width="160" height="21"></span></div>
  </div>
  <figcaption>SHROOMLIVE / {{ new Date(Number(current.key.slice(0, 13))).toLocaleDateString('de-DE') }}</figcaption>
</figure>
<select v-model="format" aria-label="Bildformat"><option value="square">Quadrat · 1:1</option><option value="portrait">Feed · 4:5</option><option value="story">Story · 9:16</option></select> <button class="button" :disabled="saving || !frameUrls.length" @click="download">{{ saving ? 'PNG wird erstellt …' : 'Als PNG speichern' }}</button></template></section></template>

<style scoped>
.memories{background:#0b1016;padding:14px;border:1px solid #223040}
.memories select{max-width:100%;color:#eaf2f6;background:#172330;padding:8px;border:1px solid #435262}
.memory-card{--cut:12px;display:grid;gap:10px;margin:12px 0;padding:12px;background:radial-gradient(#223040 .75px,transparent .75px) 0 0/12px 12px,#05070a;clip-path:polygon(var(--cut) 0,100% 0,100% calc(100% - var(--cut)),calc(100% - var(--cut)) 100%,0 100%,0 var(--cut));animation:print .65s ease-out}
.memory-photo{position:relative;aspect-ratio:16/9;overflow:hidden;border:2px solid #4fe3b0;box-shadow:0 0 14px #4fe3b066;clip-path:polygon(var(--cut) 0,100% 0,100% calc(100% - var(--cut)),calc(100% - var(--cut)) 100%,0 100%,0 var(--cut))}
.memory-photo img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.memory-strip{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:0;padding:0;list-style:none}
.memory-strip li{aspect-ratio:16/9;overflow:hidden;border:2px solid #223040}
.memory-strip img{display:block;width:100%;height:100%;object-fit:cover}
.frames-2 .memory-photo img{animation:show-2 var(--cycle) step-end infinite}
.frames-3 .memory-photo img{animation:show-3 var(--cycle) step-end infinite}
.frames-2 .memory-strip li{animation:mark-2 var(--cycle) step-end infinite}
.frames-3 .memory-strip li{animation:mark-3 var(--cycle) step-end infinite}
@keyframes show-2{0%{opacity:1}50%{opacity:0}}
@keyframes show-3{0%{opacity:1}33.333%{opacity:0}}
@keyframes mark-2{0%{border-color:#ed38f7}50%{border-color:#223040}}
@keyframes mark-3{0%{border-color:#ed38f7}33.333%{border-color:#223040}}
.memory-motif{display:grid;gap:8px;justify-items:center}
.memory-motif>img{display:block;max-width:100%;max-height:220px;object-fit:contain}
.memory-credit{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;font:700 .7rem/1.2 'JetBrains Mono',monospace;color:#93a4b4;overflow-wrap:anywhere}
.giphy-plate{flex:none;margin-left:auto;padding:6px 10px;background:#0b1016;border:1px solid #ed38f7;box-shadow:0 0 10px #ed38f766;clip-path:polygon(6px 0,100% 0,100% calc(100% - 6px),calc(100% - 6px) 100%,0 100%,0 6px)}
.giphy-plate img{display:block;width:120px;height:auto}
.memory-card figcaption{font:700 .72rem/1 'JetBrains Mono',monospace;letter-spacing:.12em;color:#4fe3b0}
@keyframes print{from{clip-path:inset(0 0 95%);transform:translateY(-10px)}to{clip-path:inset(0)}}
@media(prefers-reduced-motion:reduce){.memory-card,.memory-photo img,.memory-strip li{animation:none}.memory-photo img:not(:first-child){opacity:0}}
</style>
