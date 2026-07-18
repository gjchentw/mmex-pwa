import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useGoogleAuthStore } from '../stores/google-auth-store'

// Spec: cloud-file-sync, Requirement "Optional Google Sign-In" — token in
// memory only, state-nonce verification, sign-out clears the session.

const STATE_KEY = 'mmex.gauth.state'
const RETURN_KEY = 'mmex.gauth.returnTo'

const setFragment = (params: Record<string, string>) => {
  window.location.hash = '#' + new URLSearchParams(params).toString()
}

describe('google-auth-store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    sessionStorage.clear()
    window.history.replaceState(null, '', '/')
  })

  afterEach(() => {
    window.location.hash = ''
  })

  it('starts signed out', () => {
    const auth = useGoogleAuthStore()
    expect(auth.status).toBe('signed-out')
    expect(auth.accessToken).toBeNull()
    expect(auth.isSignedIn).toBe(false)
  })

  it('accepts a callback whose state matches and holds the token in memory only', () => {
    const auth = useGoogleAuthStore()
    sessionStorage.setItem(STATE_KEY, 'nonce-1')
    sessionStorage.setItem(RETURN_KEY, '/somewhere')
    setFragment({ access_token: 'tok-123', expires_in: '3600', state: 'nonce-1' })

    const returnTo = auth.handleCallback()

    expect(returnTo).toBe('/somewhere')
    expect(auth.status).toBe('signed-in')
    expect(auth.accessToken).toBe('tok-123')
    expect(auth.isSignedIn).toBe(true)
    // Nothing token-shaped may touch persistent or session storage.
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('tok-123')
    expect(JSON.stringify({ ...localStorage })).not.toContain('tok-123')
    // The fragment is stripped.
    expect(window.location.hash).toBe('')
  })

  it('rejects a callback with a mismatched state nonce', () => {
    const auth = useGoogleAuthStore()
    sessionStorage.setItem(STATE_KEY, 'nonce-real')
    setFragment({ access_token: 'tok-evil', expires_in: '3600', state: 'nonce-forged' })

    auth.handleCallback()

    expect(auth.status).toBe('signed-out')
    expect(auth.accessToken).toBeNull()
    expect(auth.lastError).toBe('state-mismatch')
  })

  it('maps a prompt=none failure to expired when a session existed', () => {
    const auth = useGoogleAuthStore()
    sessionStorage.setItem(STATE_KEY, 'n1')
    setFragment({ access_token: 'tok-1', expires_in: '3600', state: 'n1' })
    auth.handleCallback()

    sessionStorage.setItem(STATE_KEY, 'n2')
    setFragment({ error: 'interaction_required', state: 'n2' })
    auth.handleCallback()

    expect(auth.status).toBe('expired')
    expect(auth.lastError).toBe('interaction_required')
  })

  it('treats an expired token as signed out', () => {
    const auth = useGoogleAuthStore()
    sessionStorage.setItem(STATE_KEY, 'n1')
    setFragment({ access_token: 'tok-1', expires_in: '3600', state: 'n1' })
    auth.handleCallback()

    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + 3601 * 1000)
    expect(auth.isSignedIn).toBe(false)
    vi.useRealTimers()
  })

  it('sign-out clears the session and leaves nothing behind', async () => {
    const auth = useGoogleAuthStore()
    sessionStorage.setItem(STATE_KEY, 'n1')
    setFragment({ access_token: 'tok-1', expires_in: '3600', state: 'n1' })
    auth.handleCallback()

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response())
    await auth.signOut()

    expect(auth.status).toBe('signed-out')
    expect(auth.accessToken).toBeNull()
    expect(auth.isSignedIn).toBe(false)
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('revoke'),
      expect.objectContaining({ method: 'POST' }),
    )
    fetchSpy.mockRestore()
  })
})
