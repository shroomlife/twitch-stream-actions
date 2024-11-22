<script setup lang="ts">
import type { IGif } from '@giphy/js-types'
import { Icon } from '@iconify/vue';
import { renderGrid, renderGif } from '@giphy/js-components'
import { GiphyFetch, type GifsResult, type MediaType } from '@giphy/js-fetch-api'
import { useUserStore } from '@/stores/userStore';
import { computed, nextTick, onMounted, Ref, ref } from 'vue';
import { ElNotification, ElButton, ElCard, ElInput, ElAlert, ElForm, ElOption, ElSelect } from 'element-plus';
import { AddStreamGiphyRequestBody } from '@/types/global';

const userStore = useUserStore()

const apiKey = String(import.meta.env.VITE_GIPHY_API_KEY)
const $gf = new GiphyFetch(apiKey)

const contentContainer: Ref<HTMLElement | null> = ref(null)
const giphyGrid: Ref<HTMLElement | null> = ref(null)
const giphyGridContainer: Ref<HTMLElement | null> = ref(null)

const selectedGiphy: Ref<IGif | null> = ref(null)
const selectedGiphyElement = ref<HTMLElement | null>(null)

const aiPromptInput = ref<HTMLElement | null>(null)
const messageInput = ref<HTMLElement | null>(null)

const searchValue = ref('')
const isLoading = ref(false)
const isFetched = ref(false)
const aiPrompt: Ref<string | null> = ref(null)
const selectedGiphyMessage = ref('')

const selectedGiphyType: Ref<MediaType> = ref('gifs')

const loadedGiphys = ref<GifsResult | null>(null)

const renderCounter = ref(0)

const computedBoundingBox = computed(() => {
  const innerWidth = giphyGridContainer.value?.clientWidth as number
  return {
    innerWidth,
    amountOfColumns: Math.max(2, Math.ceil(innerWidth / 350)),
  }
})

const handleSearch = async () => {

  if (searchValue.value === '') {
    await loadTrendingGifs()
    return
  }
  if (giphyGrid.value === null) return

  isLoading.value = true
  renderCounter.value++

  const timeoutTimer = setTimeout(() => {
    isLoading.value = false
    ElNotification({
      title: 'GIPHY Suche',
      message: 'Die Suche dauert länger als erwartet. Bitte versuche es erneut.',
      type: 'warning',
    })
  }, 5000)

  renderGrid(
    {
      key: renderCounter.value,
      width: giphyGridContainer.value?.clientWidth as number,
      fetchGifs: async (offset: number) => {
        loadedGiphys.value = await $gf.search(searchValue.value, { offset, type: selectedGiphyType.value })
        return loadedGiphys.value
      },
      columns: computedBoundingBox.value.amountOfColumns,
      gutter: 6,
      user: {},
      onGifClick: (gif: IGif, event: Event) => {
        event.preventDefault()
        handleGiphySelect(gif)
        return false
      },
      onGifsFetched: () => {
        isLoading.value = false
        clearTimeout(timeoutTimer)
      },
    },
    giphyGrid.value,
  )
}

const loadTrendingGifs = async () => {
  if (giphyGrid.value === null) return
  isLoading.value = true
  renderCounter.value++

  const timeoutTimer = setTimeout(() => {
    isLoading.value = false
    ElNotification({
      title: 'GIPHY Suche',
      message: 'Die Suche dauert länger als erwartet. Bitte versuche es erneut.',
      type: 'warning',
    })
  }, 5000)

  renderGrid(
    {
      key: renderCounter.value,
      width: giphyGridContainer.value?.clientWidth as number,
      fetchGifs: async (offset: number) => {
        loadedGiphys.value = await $gf.trending({ offset, type: selectedGiphyType.value })
        return loadedGiphys.value
      },
      columns: computedBoundingBox.value.amountOfColumns,
      gutter: 6,
      user: {},
      onGifClick: (gif: IGif, event: Event) => {
        event.preventDefault()
        handleGiphySelect(gif)
        return false
      },
      onGifsFetched: () => {
        isLoading.value = false
        isFetched.value = true
        clearTimeout(timeoutTimer)
      },
    },
    giphyGrid.value,
  )
}

const handleGiphySelect = async (gif: IGif) => {
  selectedGiphy.value = gif
  aiPrompt.value = null
  await nextTick()
  renderGif(
    { gif, width: computedBoundingBox.value.innerWidth },
    selectedGiphyElement.value as HTMLElement,
  )
}

const handleSendGiphy = async () => {
  await nextTick()
  if (!selectedGiphy.value) return

  isLoading.value = true

  try {
    const giphyRequestBody = {
      id: selectedGiphy.value.id,
      title: selectedGiphy.value.title,
      url: selectedGiphy.value.url,
      userMessage: selectedGiphyMessage.value ?? undefined,
      aiPrompt: aiPrompt.value ?? undefined,
    } as AddStreamGiphyRequestBody
    const sendGiphyResponse = await userStore.sendGiphy(giphyRequestBody)

    if (sendGiphyResponse.success === true) {
      selectedGiphy.value = null
      selectedGiphyMessage.value = ''
      searchValue.value = ''

      userStore.setGiphyCooldown(60)

      ElNotification({
        title: 'GIPHY wird gesendet',
        message: 'Dein GIPHY wird in den nächsten Sekunden erscheinen!',
        type: 'success',
      })

      isLoading.value = false
    }
    else {
      isLoading.value = false
      const errorMessage = sendGiphyResponse.error ?? 'Ein unbekannter Fehler ist aufgetreten.'
      throw new Error(errorMessage)
    }
  }
  catch (error: unknown) {
    const errorMessage = (error as Error).message ?? 'Ein unbekannter Fehler ist aufgetreten.'
    ElNotification({
      title: 'Fehler beim Senden des GIPHY',
      message: errorMessage,
      type: 'error',
    })
    isLoading.value = false
  }
}

const computedHasSelectedGiphy = computed(() => selectedGiphy.value !== null)

const computedSendGiphyIsReady = computed(() => {
  let isReady = true
  if (isLoading.value) isReady = false
  if (!selectedGiphy.value) isReady = false
  if (aiPrompt.value === null) isReady = true
  if (aiPrompt.value !== null && String(aiPrompt.value).trim().length > 0 && String(aiPrompt.value).trim().length < 16) isReady = false
  return isReady
})

const focusAiPromptInput = () => {
  if (aiPromptInput.value) {
    aiPromptInput.value.focus()
  }
}

const focusMessageInput = () => {
  if (messageInput.value) {
    messageInput.value.focus()
  }
}

const handleDeslectGiphy = () => {
  selectedGiphy.value = null
  selectedGiphyMessage.value = ''
  aiPrompt.value = null
}

onMounted(() => {
  loadTrendingGifs()
})
</script>

<template>

  <el-card class="full-height-card h-100" body-class="h-100">

    <div v-if="selectedGiphy" class="d-flex flex-column gap-3">
      <div class="selected-gif">
        <el-button v-if="!isLoading" circle size="large" type="primary" @click="handleDeslectGiphy">
          <Icon icon="ph:x-bold" size="20" />
        </el-button>
        <div id="selectedGiphyElement" ref="selectedGiphyElement" />
      </div>
      <el-form class="d-flex flex-column gap-3" @submit.prevent>
        <div id="giphyDrawerMessageInput" class="d-flex flex-column gap-1">
          <label for="messageInput">Deine Nachricht zum GIPHY</label>
          <el-input id="messageInput" ref="messageInput" v-model="selectedGiphyMessage"
            placeholder="Deine Nachricht zum GIPHY" :disabled="isLoading" :maxlength="128" size="large">
            <template #prepend>
              <Icon icon="ph:text" size="24" @click="focusMessageInput" />
            </template>
          </el-input>
        </div>
        <div id="giphyDrawerAiPromptInput" class="d-flex flex-column gap-1">
          <label for="aiPromptInput">Dein Prompt für den Sound zum GIPHY</label>
          <div class="d-flex flex-column gap-1">
            <el-input id="aiPromptInput" ref="aiPromptInput" v-model="aiPrompt"
              placeholder="Dein Prompt für den Sound zum GIPHY" :disabled="isLoading" :maxlength="512" size="large">
              <template #prepend>
                <Icon icon="ph:robot" size="24" @click="focusAiPromptInput" />
              </template>
              <template v-if="!!aiPrompt" #append>
                <el-button @click="aiPrompt = null">
                  <Icon icon="ph:x-circle-fill" size="24" />
                </el-button>
              </template>
            </el-input>

            <div v-if="!aiPrompt" class="d-flex flex-wrap gap-1">
              <el-button v-if="selectedGiphy.alt_text" @click="aiPrompt = selectedGiphy.alt_text">
                GIPHY Alt Text (besser)
              </el-button>
              <el-button v-if="selectedGiphy.title" @click="aiPrompt = selectedGiphy.title">
                GIPHY Titel (okay)
              </el-button>
              <el-button v-if="selectedGiphy.slug" @click="aiPrompt = selectedGiphy.slug">
                GIPHY Slug (schlecht)
              </el-button>
            </div>
          </div>
          <template v-if="aiPrompt !== null && aiPrompt.length > 0">
            <el-alert v-if="aiPrompt !== null && aiPrompt.length >= 16"
              title="KI Sound Erstellung kann bis zu 10 Sekunden dauern." type="warning" size="small" show-icon
              :closable="false" />
            <el-alert v-else title="Gib mindestens 16 Zeichen ein!" type="error" show-icon :closable="false" />
          </template>
        </div>
        <el-button id="giphyDrawerSendButton" size="large" type="primary" native-type="submit" :loading="isLoading"
          :disabled="!computedSendGiphyIsReady" @click="handleSendGiphy">
          Senden
        </el-button>
      </el-form>
    </div>

    <div ref="giphyGridContainer" class="flex-column gap-3 h-100" :class="{
      'd-none': computedHasSelectedGiphy,
      'd-flex': !computedHasSelectedGiphy,
    }">
      <el-form class="d-flex gap-1" @submit.prevent>
        <el-input v-model="searchValue" placeholder="Suche nach GIFs" :disabled="isLoading">
          <template #prepend>
            <el-select v-model="selectedGiphyType" placeholder="Typ" style="width: 100px;" @change="handleSearch">
              <el-option label="GIFs" value="gifs" />
              <el-option label="Sticker" value="stickers" />
              <el-option label="Text" value="text" />
              <el-option label="Videos" value="videos" />
            </el-select>
          </template>
        </el-input>

        <el-button type="primary" native-type="submit" :loading="isLoading" @click="handleSearch">
          <Icon icon="ph:magnifying-glass" />
        </el-button>
      </el-form>
      <div ref="contentContainer" class="content-container infinite-list flex-grow-1">
        <div ref="giphyGrid" />
      </div>
    </div>
  </el-card>


</template>

<style lang="scss" scoped>
#selectedGiphyElement {
  pointer-events: none;
}

.selected-gif {
  position: relative;

  button {
    position: absolute;
    top: 10px;
    right: 10px;
    z-index: 1;
  }

}
.infinite-list {
  padding: 0;
  margin: 0;
  list-style: none;

  // hide scrollbar but stay scrollable
  overflow-x: hidden;
  overflow-y: scroll;
  scrollbar-width: none;
  -ms-overflow-style: none;
  &::-webkit-scrollbar {
    display: none;
  }

}
</style>
