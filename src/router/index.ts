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
  ],
})

router.beforeEach((to, _from, next) => {
  if (to.path === '/init') {
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
