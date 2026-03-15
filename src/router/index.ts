import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/transactions' },
    { path: '/transactions', component: () => import('../views/TransactionsView.vue') },
    { path: '/accounts', component: () => import('../views/AccountsView.vue') },
    { path: '/bills-deposits', component: () => import('../views/BillsDepositsView.vue') },
    { path: '/budgets', component: () => import('../views/BudgetsView.vue') },
    { path: '/reports', component: () => import('../views/ReportsView.vue') },
    { path: '/assets', component: () => import('../views/AssetsView.vue') },
    { path: '/exchange-rates', component: () => import('../views/ExchangeRatesView.vue') },
    { path: '/settings', component: () => import('../views/SettingsView.vue') },
    { path: '/about', component: () => import('../views/AboutView.vue') },
  ],
})

export default router
