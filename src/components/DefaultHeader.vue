<script setup lang="ts">
import mascot from '@/assets/shroomie-wave.webp'

defineProps<{ live: boolean }>()
</script>

<template>
  <header class="masthead">
    <div class="masthead-copy">
      <p class="eyebrow">shroomlive</p>
      <h1>Stream Actions</h1>
      <span v-if="live" class="live">Live</span>
    </div>
    <img :src="mascot" alt="" width="88" height="88" />
  </header>
</template>
