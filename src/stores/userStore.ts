import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import type {
  AddStreamGiphyRequestBody,
  ExtensionAuthorization,
  StreamGiphyResponse,
  TwitchExtensionAuthResponse,
} from '@/types/global'

type SessionStatus =
  | 'connecting'
  | 'outside'
  | 'signed-out'
  | 'link-needed'
  | 'ready'
  | 'unavailable'

export const useUserStore = defineStore('userStore', () => {
  const status = ref<SessionStatus>('connecting')
  const session = shallowRef<TwitchExtensionAuthResponse | null>(null)
  const cooldownUntil = ref(0)
  const isLive = computed(() => session.value?.currentStream != null)
  let latestAuth: ExtensionAuthorization | undefined
  let authRequest: AbortController | undefined
  let helperDeadline: ReturnType<typeof setTimeout> | undefined
  let sessionRevision = 0
  let initialized = false

  async function post<T>(
    path: string,
    signal: AbortSignal,
    body?: unknown,
    token?: string,
  ): Promise<T> {
    const apiUrl = import.meta.env.VITE_API_URL
    if (!apiUrl) throw new Error('Extension backend is not configured')

    const headers = new Headers()
    if (body !== undefined) headers.set('Content-Type', 'application/json')
    if (token) headers.set('Authorization', `Bearer ${token}`)
    const response = await fetch(new URL(path, apiUrl), {
      method: 'POST',
      headers,
      signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!response.ok) {
      const data = await response.json().catch(() => null)
      throw new Error(
        data?.error || 'Stream Actions ist gerade nicht erreichbar.',
      )
    }
    return (await response.json()) as T
  }

  function resetSession(nextStatus: SessionStatus) {
    sessionRevision++
    session.value = null
    cooldownUntil.value = 0
    status.value = nextStatus
  }

  async function onAuthorized(auth: ExtensionAuthorization) {
    clearTimeout(helperDeadline)
    authRequest?.abort()
    if (latestAuth && latestAuth.userId !== auth.userId)
      resetSession('connecting')
    latestAuth = auth

    if (!auth.userId || auth.userId.startsWith('A')) {
      resetSession('signed-out')
      return
    }

    const viewer = window.Twitch?.ext?.viewer
    if (!viewer?.isLinked && !viewer?.id) {
      resetSession('link-needed')
      return
    }

    const request = new AbortController()
    authRequest = request
    if (status.value !== 'ready') status.value = 'connecting'
    const revision = sessionRevision

    try {
      const data = await post<TwitchExtensionAuthResponse>(
        '/stream-actions/auth',
        AbortSignal.any([request.signal, AbortSignal.timeout(10000)]),
        { userId: auth.userId, token: auth.token },
      )
      if (!data.user?.jwtToken) throw new Error('Missing extension session')
      if (request.signal.aborted) return

      const sameSession =
        data.user.id === session.value?.user.id &&
        data.currentStream?.id === session.value?.currentStream?.id
      if (!sameSession) resetSession('connecting')

      // An earlier refresh cannot roll back a successful action in this stream.
      if (!sameSession || sessionRevision === revision) {
        cooldownUntil.value =
          Date.now() + Math.max(0, data.user.cooldowns.giphy) * 1000
      }
      session.value = data
      status.value = 'ready'
    } catch {
      if (!request.signal.aborted) resetSession('unavailable')
    }
  }

  function init() {
    if (initialized) return
    initialized = true
    const twitch = window.Twitch?.ext
    if (!twitch) {
      status.value = 'outside'
      return
    }
    // An unresponsive Twitch host should leave a readable error in the panel.
    helperDeadline = setTimeout(() => {
      status.value = 'unavailable'
    }, 10000)
    const events = new EventSource(new URL('/stream-actions/events', import.meta.env.VITE_API_URL))
    const sync = () => { if (latestAuth) void onAuthorized(latestAuth) }
    events.addEventListener('stream-status', sync)
    events.onopen = sync
    window.addEventListener('pageshow', sync)
    document.addEventListener('visibilitychange', () => { if (!document.hidden) sync() })
    twitch.onAuthorized(onAuthorized)
  }

  function retry() {
    if (latestAuth) void onAuthorized(latestAuth)
    else window.location.reload()
  }

  function requestIdentity() {
    window.Twitch?.ext?.actions.requestIdShare()
  }

  async function sendGiphy(body: AddStreamGiphyRequestBody) {
    const activeSession = session.value
    if (!activeSession?.currentStream || cooldownUntil.value > Date.now())
      return false
    const result = await post<StreamGiphyResponse>(
      '/stream-actions/send',
      AbortSignal.timeout(10000),
      body,
      activeSession.user.jwtToken,
    )
    if (!result.success) {
      throw new Error(
        typeof result.error === 'string'
          ? result.error
          : 'Das GIF konnte nicht gesendet werden.',
      )
    }

    if (
      activeSession.user.id === session.value?.user.id &&
      activeSession.currentStream.id === session.value?.currentStream?.id
    ) {
      sessionRevision++
      cooldownUntil.value = Date.now() + 60000
    }
    return true
  }

  return {
    status,
    isLive,
    cooldownUntil,
    session,
    init,
    retry,
    requestIdentity,
    sendGiphy,
  }
})

