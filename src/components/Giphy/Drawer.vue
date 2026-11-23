<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  shallowRef,
  watch,
} from 'vue'
import { useUserStore } from '@/stores/userStore'
import catalog from '@/catalog.json'
import giphyMark from '@/assets/giphy-mark.gif'
import { giphyApiOrigin, giphyMediaUrl } from '@/media-hosts'

type MediaType = 'gifs' | 'stickers'
type Rendition = { url?: string; webp?: string }
interface Gif {
  id: string
  title: string
  alt_text?: string
  url: string
  images: {
    fixed_width_small?: Rendition
    fixed_width_small_still?: Rendition
    fixed_width?: Rendition
    fixed_width_still?: Rendition
    original?: Rendition
  }
}
interface GifPage {
  data: Gif[]
  pagination: { count: number; offset: number; total_count: number }
}

const apiKey = import.meta.env.VITE_GIPHY_API_KEY
const pageSize = 12
const user = useUserStore()
const mediaType = ref<MediaType>('gifs')
const searchText = ref('')
const searchTerm = ref('')
const items = shallowRef<Gif[]>([])
const offset = ref<number | null>(null)
const loading = ref(false)
const searchError = ref('')
const selected = shallowRef<Gif | null>(null)
const message = ref('')
const source = ref<'pilze' | 'giphy'>('pilze')
const groups = ['Pilz-GIFs', 'Emotes', 'Sticker']
const group = ref(groups[0])
const ownItems = computed<Gif[]>(() =>
  catalog
    .filter((item) => item.group === group.value)
    .map((item) => {
      const url = './pilze/' + item.id + '.webp'
      const still =
        item.group === 'Pilz-GIFs' ? './pilze/' + item.id + '-still.webp' : url
      return {
        id: item.id,
        title: item.title,
        url,
        images: {
          fixed_width: { url },
          fixed_width_small: { url },
          fixed_width_still: { url: still },
          fixed_width_small_still: { url: still },
        },
      }
    }),
)
const sending = ref(false)
const sendError = ref('')
const sent = ref(false)
const seconds = ref(0)
const previewTitle = ref<HTMLElement>()
const browserTitle = ref<HTMLElement>()
let selectedButton: HTMLButtonElement | undefined
let searchRequest: AbortController | undefined

const canSend = computed(() => !sending.value && seconds.value === 0)

watch(
  () => user.cooldownUntil,
  (deadline, _previous, onCleanup) => {
    function update() {
      seconds.value = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
      if (seconds.value === 0) clearInterval(timer)
    }

    // The label follows elapsed time even when the Twitch app suspends the panel.
    const timer = deadline > Date.now() ? setInterval(update, 1000) : undefined
    onCleanup(() => clearInterval(timer))
    update()
  },
  { immediate: true },
)

function label(gif: Gif) {
  return (
    gif.alt_text ||
    gif.title ||
    (mediaType.value === 'gifs' ? 'GIF' : 'Sticker')
  )
}

// Grid tiles show the still frame (light on mobile data); only the chosen motif animates in the preview.
// Our own mushrooms are bundled files; GIPHY URLs are used as GIPHY sent them and only from allowlisted hosts.
const mediaUrl = (value: string | undefined) => (source.value === 'pilze' ? value || null : giphyMediaUrl(value))
function tile(gif: Gif) {
  const still = gif.images.fixed_width_small_still
  return mediaUrl(still?.webp) ?? mediaUrl(still?.url)
}
function preview(gif: Gif) {
  const rendition = gif.images.fixed_width
  return mediaUrl(rendition?.webp) ?? mediaUrl(rendition?.url) ?? mediaUrl(gif.images.original?.url)
}
function previewStill(gif: Gif) {
  return mediaUrl(gif.images.fixed_width_still?.url)
}

async function loadPage(append = false) {
  if (append && (offset.value === null || loading.value)) return
  searchRequest?.abort()
  const request = new AbortController()
  searchRequest = request
  if (!append) {
    items.value = []
    offset.value = null
  }
  loading.value = true
  searchError.value = ''

  try {
    if (!apiKey) throw new Error('GIPHY is not configured')
    const endpoint = searchTerm.value ? 'search' : 'trending'
    const url = new URL(
      `${giphyApiOrigin}/v1/${mediaType.value}/${endpoint}`,
    )
    url.searchParams.set('api_key', apiKey)
    url.searchParams.set('rating', 'g')
    url.searchParams.set('limit', String(pageSize))
    url.searchParams.set('offset', String(append ? offset.value : 0))
    if (searchTerm.value) {
      url.searchParams.set('q', searchTerm.value)
      url.searchParams.set('lang', 'de')
    }
    const response = await fetch(url, {
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(8000)]),
      cache: 'no-store',
    })
    if (!response.ok) throw new Error('GIPHY request failed')
    const page = (await response.json()) as GifPage
    if (request.signal.aborted) return
    const nextOffset = page.pagination.offset + page.pagination.count
    offset.value =
      page.pagination.count > 0 && nextOffset < page.pagination.total_count
        ? nextOffset
        : null
    items.value = append ? [...items.value, ...page.data] : page.data
  } catch {
    if (!request.signal.aborted)
      searchError.value = 'GIPHY ist gerade nicht erreichbar.'
  } finally {
    if (searchRequest === request) loading.value = false
  }
}

function search() {
  searchTerm.value = searchText.value.trim()
  void loadPage()
}

function switchType(type: MediaType) {
  if (type === mediaType.value) return
  mediaType.value = type
  search()
}

async function select(gif: Gif, event: MouseEvent) {
  selectedButton = event.currentTarget as HTMLButtonElement
  selected.value = gif
  sent.value = false
  sendError.value = ''
  await nextTick()
  previewTitle.value?.focus()
}

async function back() {
  selected.value = null
  message.value = ''
  sendError.value = ''
  await nextTick()
  if (sent.value) browserTitle.value?.focus()
  else selectedButton?.focus()
}

async function send() {
  const gif = selected.value
  if (!gif || !canSend.value) return
  sending.value = true
  sendError.value = ''
  try {
    const accepted = await user.sendGiphy({
      id: gif.id,
      title: gif.title,
      url: gif.url,
      userMessage: message.value.trim() || undefined,
    })
    if (!accepted) throw new Error('Senden ist gerade nicht möglich.')
    sent.value = true
    await back()
  } catch (error) {
    sendError.value =
      error instanceof Error && error.name === 'Error'
        ? error.message
        : 'Das GIF konnte nicht gesendet werden.'
  } finally {
    sending.value = false
  }
}

function openSource(next: 'pilze' | 'giphy') {
  source.value = next
  if (next === 'giphy' && !items.value.length && !loading.value) void loadPage()
}
onBeforeUnmount(() => searchRequest?.abort())
</script>

<template>
  <section class="giphy" aria-label="GIFs in den Stream schicken">
    <div v-show="!selected" class="giphy-browser">
      <div class="section-heading">
        <h2 ref="browserTitle" tabindex="-1">Reaktion schicken</h2>
        <img
          v-if="source === 'giphy'"
          class="giphy-mark"
          :src="giphyMark"
          alt="Powered by GIPHY"
          width="102"
          height="22"
        />
      </div>
      <p v-if="sent" class="feedback success" role="status">
        ✓ Reaktion zur Prüfung gesendet.
      </p>
      <p v-if="seconds" class="feedback">Nächstes GIF in {{ seconds }} s</p>
      <div class="sources" role="group" aria-label="Sammlung">
        <button
          type="button"
          :aria-pressed="source === 'pilze'"
          @click="openSource('pilze')"
        >
          Unsere Pilze
        </button>
        <button
          type="button"
          :aria-pressed="source === 'giphy'"
          @click="openSource('giphy')"
        >
          GIPHY
        </button>
      </div>
      <div
        v-if="source === 'pilze'"
        class="picker-tabs"
        role="group"
        aria-label="Pilzsammlung"
      >
        <button
          v-for="name in groups"
          :key="name"
          class="tab"
          :aria-pressed="group === name"
          @click="group = name"
        >
          {{ name }}
        </button>
      </div>
      <form v-if="source === 'giphy'" class="search" @submit.prevent="search">
        <input
          v-model="searchText"
          type="search"
          maxlength="50"
          aria-label="GIFs und Sticker suchen"
          placeholder="GIFs und Sticker suchen"
        />
        <button type="submit" class="button primary">Suchen</button>
      </form>
      <div v-if="source === 'giphy'" class="picker-bar">
        <div class="picker-tabs" role="group" aria-label="Medientyp">
          <button
            type="button"
            class="tab"
            :aria-pressed="mediaType === 'gifs'"
            @click="switchType('gifs')"
          >
            GIFs
          </button>
          <button
            type="button"
            class="tab"
            :aria-pressed="mediaType === 'stickers'"
            @click="switchType('stickers')"
          >
            Sticker
          </button>
        </div>
        <span class="eyebrow results-label">{{
          searchTerm ? 'Suchergebnisse' : 'Im Trend'
        }}</span>
      </div>
      <div class="gif-grid" :aria-busy="loading">
        <button
          v-for="gif in source === 'pilze' ? ownItems : items"
          :key="gif.id"
          type="button"
          class="gif"
          :class="{ collectible: source === 'pilze' }"
          :aria-label="label(gif)"
          @click="select(gif, $event)"
        >
          <img v-if="tile(gif)" :src="tile(gif) ?? undefined" alt="" loading="lazy" decoding="async" />
          <span v-if="source === 'pilze' || !tile(gif)" class="tile-label">{{
            label(gif)
          }}</span>
        </button>
      </div>
      <p v-if="source === 'giphy' && loading" class="feedback" role="status">
        Lade {{ mediaType === 'gifs' ? 'GIFs' : 'Sticker' }} …
      </p>
      <div
        v-else-if="source === 'giphy' && searchError"
        class="state search-state"
      >
        <p class="feedback error" role="alert">{{ searchError }}</p>
        <button
          type="button"
          class="button"
          @click="loadPage(items.length > 0)"
        >
          Erneut versuchen
        </button>
      </div>
      <p
        v-else-if="source === 'giphy' && !items.length"
        class="feedback"
        role="status"
      >
        Keine Treffer gefunden.
      </p>
      <button
        v-else-if="source === 'giphy' && offset !== null"
        type="button"
        class="button more"
        @click="loadPage(true)"
      >
        Mehr anzeigen
      </button>
    </div>

    <form v-if="selected" class="giphy-preview" @submit.prevent="send">
      <div class="section-heading">
        <h2 ref="previewTitle" tabindex="-1">Vorschau</h2>
        <img
          v-if="source === 'giphy'"
          class="giphy-mark"
          :src="giphyMark"
          alt="Powered by GIPHY"
          width="102"
          height="22"
        />
      </div>
      <picture v-if="preview(selected)" class="preview-art">
        <source
          v-if="previewStill(selected)"
          media="(prefers-reduced-motion: reduce)"
          :srcset="previewStill(selected) ?? undefined"
        />
        <img
          :src="preview(selected) ?? undefined"
          :alt="label(selected)"
          decoding="async"
        />
      </picture>
      <div class="extras">
        <label for="gif-message"
          >Nachricht an Robin <small>(optional)</small></label
        >
        <input
          id="gif-message"
          v-model="message"
          placeholder="Was möchtest du Robin sagen?"
          maxlength="128"
          :disabled="sending"
        />
      </div>
      <p v-if="sendError" class="feedback error" role="alert">
        {{ sendError }}
      </p>
      <p v-if="seconds" class="feedback">Nächstes GIF in {{ seconds }} s</p>
      <div class="preview-actions">
        <button type="button" class="button" :disabled="sending" @click="back">
          Zurück
        </button>
        <button type="submit" class="button primary" :disabled="!canSend">
          {{ sending ? 'Wird gesendet …' : 'In den Stream senden' }}
        </button>
      </div>
    </form>
  </section>
</template>

