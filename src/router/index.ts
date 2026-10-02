import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useDatabaseStore } from '../stores/database-store'

declare module 'vue-router' {
  interface RouteMeta {
    /**
     * Exempt from the database-readiness guard. Only routes that exist to reach
     * readiness, or that must consume an external response before the database
     * is probed, may set this (openspec: app-shell-navigation, Database
     * Readiness Guard).
     */
    readonly public?: boolean
    /** Present when the route belongs in the navigation surface. */
    readonly nav?: { labelKey: string; icon: string; order: number }
    /** The capability whose specification declares this route. */
    readonly capability?: string
  }
}

// Every route belongs to a capability that declares it (openspec:
// app-shell-navigation, Route Registry Governance).
const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('../pages/HomePage.vue'),
    meta: {
      nav: { labelKey: 'menu.home', icon: 'mdi-home', order: 10 },
      capability: 'app-shell-navigation',
    },
  },
  {
    path: '/accounts',
    name: 'accounts',
    component: () => import('../pages/AccountsPage.vue'),
    meta: {
      nav: { labelKey: 'menu.accounts', icon: 'mdi-bank', order: 20 },
      capability: 'account-management',
    },
  },
  {
    path: '/currencies',
    name: 'currencies',
    component: () => import('../pages/CurrenciesPage.vue'),
    meta: {
      nav: { labelKey: 'menu.currencies', icon: 'mdi-currency-usd', order: 30 },
      capability: 'currency-management',
    },
  },
  // The three taxonomy managers (openspec: transaction-taxonomy, Taxonomy
  // Surface Routes). Desktop reaches them from the Tools menu.
  {
    path: '/categories',
    name: 'categories',
    component: () => import('../pages/CategoriesPage.vue'),
    meta: {
      nav: { labelKey: 'menu.categories', icon: 'mdi-file-tree', order: 40 },
      capability: 'transaction-taxonomy',
    },
  },
  {
    path: '/payees',
    name: 'payees',
    component: () => import('../pages/PayeesPage.vue'),
    meta: {
      nav: { labelKey: 'menu.payees', icon: 'mdi-account-group-outline', order: 50 },
      capability: 'transaction-taxonomy',
    },
  },
  {
    path: '/tags',
    name: 'tags',
    component: () => import('../pages/TagsPage.vue'),
    meta: {
      nav: { labelKey: 'menu.tags', icon: 'mdi-tag-multiple-outline', order: 60 },
      capability: 'transaction-taxonomy',
    },
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('../pages/SettingsPage.vue'),
    meta: {
      nav: { labelKey: 'menu.settings', icon: 'mdi-cog-outline', order: 90 },
      capability: 'file-metadata-and-settings',
    },
  },
  {
    path: '/init',
    name: 'init',
    component: () => import('../pages/DatabaseInitPage.vue'),
    meta: { public: true, capability: 'infrastructure-baseline' },
  },
  // OAuth redirect terminal (openspec: cloud-file-sync design.md D1). Must
  // exist in production and stay exempt from the readiness guard: the page
  // consumes the token fragment before the database is probed.
  {
    path: '/auth/callback',
    name: 'auth-callback',
    component: () => import('../pages/AuthCallbackPage.vue'),
    meta: { public: true, capability: 'cloud-file-sync' },
  },
  // Dev-only COEP probe (openspec: cloud-file-sync task 1.2). The spread
  // keeps the route out of production bundles' router table entirely.
  ...(import.meta.env.DEV
    ? [
        {
          path: '/coep-probe',
          name: 'coep-probe',
          component: () => import('../pages/CoepProbePage.vue'),
          meta: { public: true, capability: 'cloud-file-sync' },
        } satisfies RouteRecordRaw,
        // Dev-only seed and query seam for end-to-end tests
        // (transaction-taxonomy-surfaces, design D10). Guarded: it reads the file.
        {
          path: '/dev-seed',
          name: 'dev-seed',
          component: () => import('../pages/DevSeedPage.vue'),
          meta: { capability: 'infrastructure-baseline' },
        } satisfies RouteRecordRaw,
      ]
    : []),
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('../pages/NotFoundPage.vue'),
    meta: { capability: 'app-shell-navigation' },
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

export interface NavEntry {
  path: string
  labelKey: string
  icon: string
  order: number
}

/**
 * The navigation surface's entries, derived from the route table so an entry
 * can never point at a path that is not served (openspec: app-shell-navigation,
 * Navigation Reflects Location).
 */
export const navigationEntries = (): NavEntry[] =>
  router
    .getRoutes()
    .flatMap((route) => {
      const nav = route.meta.nav
      return nav
        ? [{ path: route.path, labelKey: nav.labelKey, icon: nav.icon, order: nav.order }]
        : []
    })
    .sort((a, b) => a.order - b.order)

/**
 * The path to resume after initialization. Only an in-application path is
 * accepted, so a crafted `redirect` cannot send the user off-site.
 */
export const safeRedirectTarget = (value: unknown): string => {
  const path = Array.isArray(value) ? value[0] : value
  if (typeof path !== 'string') return '/'
  if (!path.startsWith('/') || path.startsWith('//')) return '/'
  return path
}

router.beforeEach((to, _from, next) => {
  // Exemptions are declared on the routes themselves, so a future capability
  // can add one without touching this guard.
  if (to.meta.public) {
    // The initialization surface is not a destination: once the database is
    // ready there is nothing there to do, so resume where the user was headed.
    if (to.name === 'init' && useDatabaseStore().state === 'ready') {
      next(safeRedirectTarget(to.query.redirect))
      return
    }
    next()
    return
  }

  const store = useDatabaseStore()
  if (store.state !== 'ready') {
    // Carry the intended destination so a deep link survives initialization.
    next({ path: '/init', query: { redirect: to.fullPath } })
    return
  }

  next()
})

export default router
