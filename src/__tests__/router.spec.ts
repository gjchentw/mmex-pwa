import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// The router imports the database store, which reaches the worker client.
const { MockWorker } = vi.hoisted(() => {
  class MockWorker {
    postMessage = vi.fn()
    addEventListener = vi.fn()
    removeEventListener = vi.fn()
    terminate = vi.fn()
  }
  return { MockWorker }
})

vi.mock('../workers/sqlite.worker?worker', () => ({ default: MockWorker }))

import router, { navigationEntries, safeRedirectTarget } from '../router'
import { useDatabaseStore } from '../stores/database-store'

/** Spec: app-shell-navigation. */
describe('route table', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  // Requirement "Home Summary Surface", scenario "A ready database lands on the
  // home surface".
  it('serves the root path', () => {
    const resolved = router.resolve('/')
    expect(resolved.name).toBe('home')
    expect(resolved.matched).toHaveLength(1)
  })

  // Requirement "Unmatched Route Handling", scenario "An unknown path is
  // explained".
  it('resolves an unknown path to the not-found route', () => {
    expect(router.resolve('/no-such-page').name).toBe('not-found')
    expect(router.resolve('/deeply/nested/nonsense').name).toBe('not-found')
  })

  // Requirement "Route Registry Governance" -- every route is accounted for by
  // a declaring capability.
  it('attributes every route to a capability', () => {
    for (const route of router.getRoutes()) {
      expect(route.meta.capability, `route ${route.path} declares no capability`).toBeTruthy()
    }
  })

  // Requirement "Navigation Reflects Location", scenario "Navigation entries
  // always resolve" -- the failure the previous hand-written drawer exhibited.
  describe('navigation entries', () => {
    it('all resolve to a served route', () => {
      const entries = navigationEntries()
      expect(entries.length).toBeGreaterThan(0)
      for (const entry of entries) {
        expect(router.resolve(entry.path).name).not.toBe('not-found')
      }
    })

    it('are ordered and carry a label key and icon', () => {
      const entries = navigationEntries()
      expect(entries.map((entry) => entry.order)).toEqual(
        [...entries.map((entry) => entry.order)].sort((a, b) => a - b),
      )
      for (const entry of entries) {
        expect(entry.labelKey).toMatch(/^\w+\./)
        expect(entry.icon).toBeTruthy()
      }
    })

    it('offers the home destination', () => {
      expect(navigationEntries().some((entry) => entry.path === '/')).toBe(true)
    })

    // The retired /about link pointed at a path nothing served.
    it('no longer offers the removed about destination', () => {
      expect(navigationEntries().some((entry) => entry.path === '/about')).toBe(false)
    })
  })

  // Requirement "Route Registry Governance", scenario "Development routes stay
  // out of production". Vitest runs with DEV true, so the probe is present here;
  // production builds drop it because the route is spread in conditionally.
  it('gates the development probe on the DEV flag', () => {
    const probe = router.getRoutes().find((route) => route.path === '/coep-probe')
    expect(Boolean(probe)).toBe(import.meta.env.DEV)
  })
})

/** Spec: app-shell-navigation, requirement "Database Readiness Guard". */
describe('readiness guard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  /**
   * Drives the real router so the guard is exercised as it is wired. Each
   * navigation starts from a neutral public route, because pushing the path the
   * router already sits on is a duplicate that never reaches the guard.
   */
  const navigateTo = async (path: string): Promise<string> => {
    const settle = async (target: string, replace: boolean) => {
      try {
        await (replace ? router.replace(target) : router.push(target))
      } catch {
        // A redirect reports a navigation failure; the resulting route is what matters.
      }
    }
    await settle('/coep-probe', true)
    await settle(path, false)
    await router.isReady()
    return router.currentRoute.value.path
  }

  it('defers a guarded route until the database is ready', async () => {
    expect(await navigateTo('/')).toBe('/init')
  })

  it('serves a guarded route once the database is ready', async () => {
    useDatabaseStore().state = 'ready'
    expect(await navigateTo('/')).toBe('/')
  })

  // Scenario "The authentication terminal is never deferred".
  it('exempts the authentication terminal while the database is not ready', async () => {
    expect(await navigateTo('/auth/callback')).toBe('/auth/callback')
  })

  it('exempts the initialization surface', async () => {
    expect(await navigateTo('/init')).toBe('/init')
  })

  // The initialization surface exists to reach readiness; once reached, there
  // is nothing there to do, so it must not be a dead end.
  it('sends a ready database away from the initialization surface', async () => {
    useDatabaseStore().state = 'ready'
    expect(await navigateTo('/init')).toBe('/')
  })

  it('defers an unknown path too, so the user reaches setup first', async () => {
    expect(await navigateTo('/no-such-page')).toBe('/init')
  })

  // Without this, a cold load of any deep link is swallowed: the guard sends
  // the user to setup and readiness would drop them on the home surface,
  // regardless of what they asked for.
  it('carries the intended destination through initialization', async () => {
    await navigateTo('/no-such-page')
    expect(router.currentRoute.value.query.redirect).toBe('/no-such-page')
  })

  it('resumes the intended destination once ready', async () => {
    useDatabaseStore().state = 'ready'
    try {
      await router.replace('/coep-probe')
      await router.push('/init?redirect=/no-such-page')
    } catch {
      // The guard redirects; the resulting route is what matters.
    }
    expect(router.currentRoute.value.path).toBe('/no-such-page')
    expect(router.currentRoute.value.name).toBe('not-found')
  })

  describe('redirect target safety', () => {
    it('accepts an in-application path', () => {
      expect(safeRedirectTarget('/transactions')).toBe('/transactions')
      expect(safeRedirectTarget(['/trash'])).toBe('/trash')
    })

    it('refuses anything that could leave the application', () => {
      expect(safeRedirectTarget('//evil.example.com')).toBe('/')
      expect(safeRedirectTarget('https://evil.example.com')).toBe('/')
      expect(safeRedirectTarget('javascript:alert(1)')).toBe('/')
      expect(safeRedirectTarget(undefined)).toBe('/')
      expect(safeRedirectTarget(42)).toBe('/')
    })
  })
})
