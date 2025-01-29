import { AddStreamGiphyRequestBody, StreamCheckin, StreamGiphyResponse, TwitchExtensionAuthResponse, UserStoreState, UserWithToken } from '../types/global'
import { defineStore } from 'pinia'
import { useAppStore } from './appStore'

export const useUserStore = defineStore('userStore', {
  state: (): UserStoreState => ({
    isInitialized: false,
    currentUser: null,
    lastUserCheckin: null,
  }),
  getters: {
    getIsInitialized(): boolean {
      return this.isInitialized
    },
    getHasUser(): boolean {
      return this.currentUser !== null
    },
    getIsUserCheckedIn(): boolean {
      if(this.currentUser === null) return false
      return this.lastUserCheckin !== null && this.lastUserCheckin.isActive === true && this.lastUserCheckin.userId === this.currentUser.id
    },
    getUserProfileImageUrl(): string {
      if (this.currentUser === null) return ''
      return this.currentUser.twitchProfileImageUrl || ''
    },
    getAuthorizationHeader(): string {
      if (this.currentUser === null) return ''
      return ['Bearer', this.currentUser.jwtToken].join(' ')
    },
    hasUserProfileImage(): boolean {
      return this.getUserProfileImageUrl !== ''
    },
  },
  actions: {
    async init() {
      this.isInitialized = false

      if(
        typeof window !== 'undefined' &&
        typeof window.Twitch !== 'undefined' &&
        typeof window.Twitch.ext !== 'undefined'
      ) {
        const twitch = window.Twitch.ext;
        twitch.onAuthorized(async (auth) => {
          await this.fetchUserId(auth.userId, auth.token);
          this.isInitialized = true;
        });
        window.Twitch.ext.actions.requestIdShare();
      }
    },
    setUser(user: UserWithToken) {
      this.currentUser = user
      if (this.currentUser && this.currentUser.cooldowns.giphy > 0) {
        this.startGiphyCooldownInterval()
      }
    },
    setLastCheckin(checkin: StreamCheckin | null) {
      if (this.currentUser === null) return
      this.lastUserCheckin = checkin
    },
    startGiphyCooldownInterval() {
      const cooldownInterval = setInterval(() => {
        if (this.currentUser === null) return
        if (this.currentUser.cooldowns.giphy > 0) {
          this.currentUser.cooldowns.giphy -= 1
        }
        if (this.currentUser.cooldowns.giphy <= 0) {
          clearInterval(cooldownInterval)
        }
      }, 1000)
    },
    setGiphyCooldown(cooldown: number) {
      if (this.currentUser === null) return
      this.currentUser.cooldowns.giphy = cooldown
      this.startGiphyCooldownInterval()
    },
    async sendGiphy(giphyRequest: AddStreamGiphyRequestBody): Promise<StreamGiphyResponse> {
      try {
        const appStore = useAppStore()
        const sendGiphyResponse = await fetch(appStore.renderApiUrl('/api/twitch/extension/giphy/send'), {
          method: 'post',
          headers: {
            'Content-Type': 'application/json',
            Authorization: String(this.getAuthorizationHeader),
          },
          body: JSON.stringify(giphyRequest),
        })

        if (!sendGiphyResponse.ok) {
          throw new Error('Failed to send giphy')
        }

        const sendGiphyResponseJson = await sendGiphyResponse.json() as StreamGiphyResponse

        return {
          success: sendGiphyResponseJson.success,
          giphy: sendGiphyResponseJson.giphy,
          error: sendGiphyResponseJson.error ?? undefined,
          leftInStream: sendGiphyResponseJson.leftInStream,
        } as StreamGiphyResponse
      }
      catch (error) {
        return {
          success: false,
          error: String(error),
          leftInStream: 0,
        }
      }
    },
    async fetchUserId(userId: string, token: string) {
      try {
        const appStore = useAppStore();
        const response = await fetch(appStore.renderApiUrl('/api/twitch/extension/auth'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId,
            token,
          }),
        });

        if (response.ok) {
          const data = await response.json() as TwitchExtensionAuthResponse;
          this.setUser(data.user);
          this.setLastCheckin(data.lastUserCheckin);
          appStore.setCurrentStream(data.currentStream);
        }
      } catch (error) {
        console.error('Error retrieving userId', error);
      }
    }
  },
})