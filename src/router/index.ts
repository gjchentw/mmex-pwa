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
  if (to.path === '/init' || (import.meta.env.DEV && to.path === '/coep-probe')) {
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
