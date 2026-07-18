import { createRouter, createWebHistory } from 'vue-router'
import { useDatabaseStore } from '../stores/database-store'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/init',
      name: 'init',
      component: () => import('../pages/DatabaseInitPage.vue'),
    },
    // OAuth redirect terminal (openspec: cloud-file-sync design.md D1). Must
    // exist in production and stay exempt from the readiness guard: the page
    // consumes the token fragment before the database is probed.
    {
      path: '/auth/callback',
      name: 'auth-callback',
      component: () => import('../pages/AuthCallbackPage.vue'),
    },
    // Dev-only COEP probe (openspec: cloud-file-sync task 1.2). The spread
    // keeps the route out of production bundles' router table entirely.
    ...(import.meta.env.DEV
      ? [
          {
            path: '/coep-probe',
            name: 'coep-probe',
            component: () => import('../pages/CoepProbePage.vue'),
          },
        ]
      : []),
  ],
})

router.beforeEach((to, _from, next) => {
  if (
    to.path === '/init' ||
    to.path === '/auth/callback' ||
    (import.meta.env.DEV && to.path === '/coep-probe')
  ) {
    next()
    return
  }

  const store = useDatabaseStore()
  if (store.state !== 'ready') {
    next('/init')
    return
  }

  next()
})

export default router
