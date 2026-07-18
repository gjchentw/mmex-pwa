import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

// Google sign-in via the OAuth 2.0 implicit grant delivered by full-page
// redirect (openspec: cloud-file-sync, design.md D1). A popup flow is
// structurally impossible here: crossOriginIsolated requires COOP same-origin,
// which severs a cross-origin popup's channel back to its opener -- confirmed
// empirically before this design was chosen. No Google script is loaded.
//
// The access token lives in memory only (spec: Optional Google Sign-In). The
// `state` nonce transits sessionStorage -- it is a CSRF nonce, not a credential.

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke'
const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const STATE_KEY = 'mmex.gauth.state'
const RETURN_KEY = 'mmex.gauth.returnTo'

export type AuthStatus = 'signed-out' | 'authorizing' | 'signed-in' | 'expired'

export const useGoogleAuthStore = defineStore('google-auth', () => {
  const accessToken = ref<string | null>(null)
  const expiresAt = ref<number | null>(null)
  const status = ref<AuthStatus>('signed-out')
  const lastError = ref<string | null>(null)

  const isSignedIn = computed(
    () =>
      status.value === 'signed-in' && !!accessToken.value && Date.now() < (expiresAt.value ?? 0),
  )

  const redirectUri = () => `${window.location.origin}/auth/callback`

  const buildAuthUrl = (interactive: boolean, state: string) => {
    const params = new URLSearchParams({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '',
      redirect_uri: redirectUri(),
      response_type: 'token',
      scope: SCOPE,
      state,
      include_granted_scopes: 'true',
    })
    if (!interactive) params.set('prompt', 'none')
    return `${AUTH_ENDPOINT}?${params.toString()}`
  }

  /** Navigate away to Google. The current path is stashed so the callback can return to it. */
  function signIn(options: { interactive?: boolean } = {}) {
    if (!import.meta.env.VITE_GOOGLE_CLIENT_ID) {
      lastError.value = 'missing-client-id'
      return
    }
    const state = crypto.randomUUID()
    sessionStorage.setItem(STATE_KEY, state)
    sessionStorage.setItem(RETURN_KEY, window.location.pathname)
    status.value = 'authorizing'
    window.location.assign(buildAuthUrl(options.interactive ?? true, state))
  }

  /**
   * Consume the OAuth response from the current URL fragment. Returns the path
   * to navigate to afterwards. The fragment is stripped immediately so token
   * material never survives in the address bar or history.
   */
  function handleCallback(): string {
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    window.history.replaceState(null, '', window.location.pathname)

    const expectedState = sessionStorage.getItem(STATE_KEY)
    const returnTo = sessionStorage.getItem(RETURN_KEY) ?? '/'
    sessionStorage.removeItem(STATE_KEY)
    sessionStorage.removeItem(RETURN_KEY)

    const error = fragment.get('error')
    const token = fragment.get('access_token')
    const stateParam = fragment.get('state')

    if (error) {
      // `interaction_required`/`consent_required` are the expected outcomes of
      // a failed prompt=none renewal; anything else is a real error.
      status.value = accessToken.value ? 'expired' : 'signed-out'
      lastError.value = error
      return returnTo
    }
    if (!token || !expectedState || stateParam !== expectedState) {
      status.value = 'signed-out'
      lastError.value = 'state-mismatch'
      accessToken.value = null
      expiresAt.value = null
      return returnTo
    }

    accessToken.value = token
    const expiresIn = Number(fragment.get('expires_in') ?? '3600')
    expiresAt.value = Date.now() + expiresIn * 1000
    status.value = 'signed-in'
    lastError.value = null
    return returnTo
  }

  /** Non-interactive renewal: a sub-second round-trip when the Google session is alive. */
  function renew() {
    signIn({ interactive: false })
  }

  /** Revoke best-effort, then clear all in-memory session state. */
  async function signOut() {
    const token = accessToken.value
    accessToken.value = null
    expiresAt.value = null
    status.value = 'signed-out'
    lastError.value = null
    if (token) {
      try {
        await fetch(`${REVOKE_ENDPOINT}?token=${encodeURIComponent(token)}`, { method: 'POST' })
      } catch {
        // Revocation is best-effort; the token expires within the hour regardless.
      }
    }
  }

  return {
    accessToken,
    expiresAt,
    status,
    lastError,
    isSignedIn,
    signIn,
    handleCallback,
    renew,
    signOut,
  }
})
