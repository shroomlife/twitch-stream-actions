<script setup lang="ts">
import { ref } from 'vue';
import { ElButton, ElNotification } from 'element-plus';
import confetti from 'canvas-confetti';
import { StreamCheckinResponse } from '@/types/global';
import { useUserStore } from '@/stores/userStore';
import { useAppStore } from '@/stores/appStore';

const userStore = useUserStore();
const isLoading = ref(false);

const handleCheckinButtonClick = async () => {

  try {

    isLoading.value = true;

    const appStore = useAppStore();
    const response = await fetch(appStore.renderApiUrl('/api/twitch/extension/checkin'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': userStore.getAuthorizationHeader,
      },
    });

    if (response.ok) {
      const data = await response.json() as StreamCheckinResponse;
      if (data.success) {
        userStore.setLastCheckin(data.checkin);

        confetti({
          colors: ['#FFF', '#000', '#09401F'],
          particleCount: 500,
          spread: 90,
        })

      } else {
        throw new Error('Failed at Checkin');
      }
    } else {
      throw new Error('Response not OK');
    }
  } catch (error) {
    console.error(error);
    ElNotification({
      title: 'Fehler',
      message: 'Beim Checkin ist ein Fehler aufgetreten.',
      type: 'error',
    })
  } finally {
    isLoading.value = false;
  }

}
</script>

<template>
  <div class="d-flex align-items-center">
    <el-button type="primary" size="large" class="flex-grow-1" @click="handleCheckinButtonClick"
      :loading="isLoading">Checkin</el-button>
  </div>
</template>

<style scoped lang="scss"></style>
