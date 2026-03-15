import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface UserInfo {
  name: string
  email: string
  picture: string
}

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error'

export const useAuthStore = defineStore('auth', () => {
  // Access token is kept only in memory (never persisted) for security
  const accessToken = ref<string | null>(null)
  const user = ref<UserInfo | null>(null)
  const isOnline = ref(navigator.onLine)
  const syncStatus = ref<SyncStatus>('idle')
  const lastSyncTime = ref<Date | null>(null)
  const syncError = ref<string | null>(null)

  const isSignedIn = computed(() => !!accessToken.value)

  // Track network connectivity changes
  window.addEventListener('online', () => {
    isOnline.value = true
  })
  window.addEventListener('offline', () => {
    isOnline.value = false
  })

  function setToken(token: string, expiresIn: number) {
    accessToken.value = token
    // Schedule automatic token expiry (60 s before actual expiry)
    const ttl = Math.max(0, (expiresIn - 60) * 1000)
    setTimeout(() => {
      if (accessToken.value === token) {
        accessToken.value = null
        user.value = null
      }
    }, ttl)
  }

  function setUser(userInfo: UserInfo) {
    user.value = userInfo
  }

  function signOut() {
    const token = accessToken.value
    accessToken.value = null
    user.value = null
    syncStatus.value = 'idle'
    syncError.value = null
    // Revoke the token so it cannot be reused
    if (token && window.google?.accounts?.oauth2) {
      window.google.accounts.oauth2.revoke(token, () => {})
    }
  }

  function setSyncStatus(status: SyncStatus, error?: string) {
    syncStatus.value = status
    syncError.value = error ?? null
    if (status === 'success') {
      lastSyncTime.value = new Date()
    }
  }

  return {
    accessToken,
    user,
    isOnline,
    syncStatus,
    lastSyncTime,
    syncError,
    isSignedIn,
    setToken,
    setUser,
    signOut,
    setSyncStatus,
  }
})
