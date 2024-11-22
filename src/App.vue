<script setup lang="ts">
import DefaultHeader from '@/components/DefaultHeader.vue'
import { useUserStore } from './stores/userStore';
import { useAppStore } from './stores/appStore';
import { computed, onMounted } from 'vue';
import { ElContainer, ElAlert, ElSkeleton } from 'element-plus';
import StreamActions from '@/components/StreamActions.vue';

const userStore = useUserStore();
const appStore = useAppStore();

const isInitialized = computed(() => {
  return userStore.getIsInitialized as boolean;
})

const computedHasCurrentStream = computed(() => {
  return appStore.getHasCurrentStream as boolean;
})

onMounted(() => {
  userStore.init();
})

</script>

<template>
  <el-container>
    <video poster="https://shroomlive.de/video/polygons.jpg" autoplay loop muted disableremoteplayback
      disablepictureinpicture playsinline>
      <source src="https://shroomlive.de/video/polygons.webm" type="video/webm">
      <source src="https://shroomlive.de/video/polygons.mp4" type="video/mp4">
      <source src="https://shroomlive.de/video/polygons.jpg" type="image/jpg">
    </video>
    <DefaultHeader />
    <main v-if="isInitialized">
      <template v-if="userStore.getHasUser">
        <StreamActions v-if="computedHasCurrentStream"></StreamActions>
        <el-alert v-else type="warning" :closable="false">Aktuell läuft kein Stream.</el-alert>
      </template>
      <el-alert v-else type="error" :closable="false">Du musst erst deine <strong>Twitch User ID</strong> freigeben.</el-alert>
    </main>
    <main v-else>
      <el-skeleton :animated="true" />
    </main>
  </el-container>
</template>

<style scoped>
video {
  height: 100%;
  left: 0;
  object-fit: cover;
  pointer-events: none;
  position: fixed;
  top: 0;
  width: 100%;
  z-index: -1;
}
</style>
