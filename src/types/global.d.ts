export type UserStoreState = {
  isInitialized: boolean
  currentUser: UserWithToken | null
  lastUserCheckin: StreamCheckin | null
}

export type AppStoreState = {
  apiUrl: string
  currentStream: Stream | null
}

export type StreamGiphyResponse = {
  success: boolean
  giphy?: StreamGiphy
  error?: string
  leftInStream: number
}

export type StreamGiphy = {
  id: number
  uuid: string
  streamId: number
  userId: number
}

export type User = {
  id: number;
  twitchId: string;
  createdAt: Date;
  uuid: string;
  isActive: boolean;
  twitchLogin: string;
  twitchDisplayName: string;
  twitchProfileImageUrl: string | null;
  isPublic: boolean;
}

export type UserWithToken = User & {
  jwtToken: string
  cooldowns: ActionCooldowns
}

export type Stream = {
  id: number
  twitchId: string
  title: string
  streamNumber: number
}

export type StreamCheckin = {
  id: number
  streamId: number
  userId: number
  isActive: boolean
  createdAt: Date
}

export type StreamCheckinResponse = {
  success: boolean
  checkin: StreamCheckin | null
}

export type TwitchExtensionAuthResponse = {
  user: UserWithToken
  currentStream: Stream | null
  lastUserCheckin: StreamCheckin | null
}

export interface ActionCooldowns {
  giphy: number
}

export type AddStreamGiphyRequestBody = {
  id: string
  url: string
  title: string
  userMessage?: string
  aiPrompt?: string
}

declare global {
  interface Window {
    Twitch: {
      ext: {
        onAuthorized: (callback: (auth: { userId: string, token: string }) => void) => void
        actions: {
          requestIdShare: () => void
        }
      }
    }
  }
}