<script setup lang="ts">
import { ref, watch } from 'vue'
import { resolveMedia } from '@/media'
const props = defineProps<{ media: string }>()
const emit = defineEmits<{ ready: [boolean] }>()
const src = ref('')
const failed = ref(false)
watch(
  () => props.media,
  async (id, _previous, cleanup) => {
    const request = new AbortController()
    cleanup(() => request.abort())
    src.value = ''
    failed.value = false
    emit('ready', false)
    try {
      const url = await resolveMedia(
        id,
        AbortSignal.any([request.signal, AbortSignal.timeout(8000)]),
      )
      if (!request.signal.aborted) src.value = url
    } catch {
      if (!request.signal.aborted) failed.value = true
    }
  },
  { immediate: true },
)
function imageFailed() {
  failed.value = true
  emit('ready', false)
}
</script>
<template>
  <img
    v-if="src && !failed"
    :src="src"
    alt=""
    @load="emit('ready', true)"
    @error="imageFailed"
  />
  <span v-else-if="failed">Bild nicht verfügbar</span>
</template>
