<script setup lang="ts">
import { useUserStore } from '@/stores/userStore';
import { ElAvatar, ElHeader } from 'element-plus';
const userStore = useUserStore();
</script>

<template>
  <el-header class="d-flex justify-content-between align-items-center">
    <span>shroomlive Stream Actions</span>
    <el-avatar
        v-if="userStore.getHasUser"
        :src="userStore.getUserProfileImageUrl"
        :size="32"
      />
  </el-header>
</template>

<style lang="scss" scoped>
span {
  font-size: 1rem;
  font-weight: 600
}
</style>