<script setup lang="ts">
import CheckinButton from '@/components/CheckinButton.vue';
import GiphyDrawer from '@/components/Giphy/Drawer.vue';
import { useUserStore } from '@/stores/userStore';

const userStore = useUserStore();

</script>

<template>
  <div class="d-flex flex-column gap-2 h-100">
    <template v-if="userStore.getIsUserCheckedIn">
      <GiphyDrawer />
    </template>
    <CheckinButton v-else />
  </div>
</template>

<style scoped lang="scss">
</style>
