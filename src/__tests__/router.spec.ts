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

  // Spec: file-metadata-and-settings, requirement "Settings Surface", scenario
  // "The settings surface is reachable and addressable".
  it('serves the settings path and declares its owning capability', () => {
    const resolved = router.resolve('/settings')
    expect(resolved.name).toBe('settings')
    expect(resolved.meta.capability).toBe('file-metadata-and-settings')
    // Everything it shows comes from the database, so it must stay guarded.
    expect(resolved.meta.public).toBeFalsy()
  })

  // Spec: currency-management, requirement "Currency Management Surface".
  it('serves the currencies path and declares its owning capability', () => {
    const resolved = router.resolve('/currencies')
    expect(resolved.name).toBe('currencies')
    expect(resolved.meta.capability).toBe('currency-management')
    expect(resolved.meta.public).toBeFalsy()
  })

  // Spec: account-management, requirement "Accounts Surface Route".
  it('serves the accounts path and declares its owning capability', () => {
    const resolved = router.resolve('/accounts')
    expect(resolved.name).toBe('accounts')
    expect(resolved.meta.capability).toBe('account-management')
    // The list reads the file, so the route must stay behind the readiness guard.
    expect(resolved.meta.public).toBeFalsy()
  })

  // transaction-taxonomy-surfaces design D10: the development seed seam exists
  // only under DEV (vitest runs with DEV true), is guarded, and has no navigation
  // entry. app-shell-navigation keeps development routes out of production.
  it('serves the development seed route only as a guarded, unlisted route', () => {
    const resolved = router.resolve('/dev-seed')
    expect(resolved.name).toBe('dev-seed')
    expect(resolved.meta.capability).toBe('infrastructure-baseline')
    expect(resolved.meta.public).toBeFalsy()
    expect(resolved.meta.nav).toBeUndefined()
    expect(navigationEntries().some((entry) => entry.path === '/dev-seed')).toBe(false)
  })

  // Spec: transaction-taxonomy, requirement "Taxonomy Surface Routes",
  // scenario "The managers are reachable".
  it.each([
    ['/categories', 'categories'],
    ['/payees', 'payees'],
    ['/tags', 'tags'],
  ])('serves %s and declares its owning capability', (path, name) => {
    const resolved = router.resolve(path)
    expect(resolved.name).toBe(name)
    expect(resolved.meta.capability).toBe('transaction-taxonomy')
    // Every manager reads the file, so the routes stay behind the readiness guard.
    expect(resolved.meta.public).toBeFalsy()
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

    // Spec: file-metadata-and-settings, requirement "Settings Surface".
    it('offers the settings destination', () => {
      expect(navigationEntries().some((entry) => entry.path === '/settings')).toBe(true)
    })

    // Spec: currency-management, requirement "Currency Management Surface".
    it('offers the currencies destination', () => {
      expect(navigationEntries().some((entry) => entry.path === '/currencies')).toBe(true)
    })

    // Spec: account-management, requirement "Accounts Surface Route", scenario
    // "The accounts surface is reachable from the navigation drawer".
    it('offers the accounts destination', () => {
      const entry = navigationEntries().find((item) => item.path === '/accounts')
      expect(entry).toBeDefined()
      expect(entry?.labelKey).toBe('menu.accounts')
    })

    // Spec: transaction-taxonomy, requirement "Taxonomy Surface Routes",
    // scenario "The managers appear in navigation".
    it.each([
      ['/categories', 'menu.categories'],
      ['/payees', 'menu.payees'],
      ['/tags', 'menu.tags'],
    ])('offers the %s destination', (path, labelKey) => {
      const entry = navigationEntries().find((item) => item.path === path)
      expect(entry).toBeDefined()
      expect(entry?.labelKey).toBe(labelKey)
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
