export interface ExtensionAuthorization {
  channelId: string
  userId: string
  token: string
}

export interface TwitchExtensionAuthResponse {
  user: {
    id: string
    jwtToken: string
    cooldowns: { giphy: number }
  }
  currentStream: { id: string } | null
}

export interface StreamGiphyResponse {
  success: boolean
  error?: unknown
}

export interface AddStreamGiphyRequestBody {
  id: string
  url: string
  title: string
  userMessage?: string
}

declare global {
  interface Window {
    Twitch?: {
      ext?: {
        viewer: { id: string | null; isLinked: boolean }
        onAuthorized: (callback: (auth: ExtensionAuthorization) => void) => void
        actions: { requestIdShare: () => void }
      }
    }
  }
}
