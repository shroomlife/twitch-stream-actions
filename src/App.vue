<script setup lang="ts">
import { onMounted } from 'vue'
import { useUserStore } from '@/stores/userStore'
import WaitingRoom from '@/components/WaitingRoom.vue'
import Memories from '@/components/Memories.vue'
import DefaultHeader from '@/components/DefaultHeader.vue'
import StreamActions from '@/components/StreamActions.vue'

const user = useUserStore()
onMounted(user.init)
</script>

<template>
  <div class="extension">
    <DefaultHeader :live="user.isLive" />
    <main class="panel">
      <StreamActions v-if="user.status === 'ready' && user.isLive" />
      <WaitingRoom v-else-if="user.status === 'ready' || user.status === 'signed-out' || user.status === 'link-needed'" :offline="user.status === 'ready'">
        <p v-if="user.status === 'signed-out'">Melde dich bei Twitch an, um mitzumachen.</p>
        <template v-if="user.status === 'link-needed'">
          <p>Gib deine Twitch-ID frei, um Reaktionen zu schicken und deine Fotos wiederzufinden.</p>
          <button type="button" class="button primary" @click="user.requestIdentity">Twitch-ID freigeben</button>
        </template>
      </WaitingRoom>
      <div v-else class="state">
        <p v-if="user.status === 'connecting'" class="boot-state" role="status">Verbinde mit Twitch …</p>
        <p v-else-if="user.status === 'outside'">Öffne Stream Actions im Twitch-Kanal theshroomlife.</p>
        <template v-else>
          <p role="alert">Stream Actions ist gerade nicht erreichbar.</p>
          <button type="button" class="button" @click="user.retry">Erneut verbinden</button>
        </template>
      </div>
      <Memories v-if="user.status==='ready' && user.session" :token="user.session.user.jwtToken" />
    </main>
  </div>
</template>


