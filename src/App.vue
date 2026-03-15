<template>
  <q-layout view="hHh lpR fFf" data-testid="app-root">
    <q-header elevated class="bg-primary text-white">
      <q-toolbar>
        <q-btn dense flat round icon="mdi-menu" :aria-label="$t('menu.home')" @click="toggleLeftDrawer" />

        <q-toolbar-title>
          <span>{{ $t('app.name') }}</span>
          <div class="text-subtitle2 q-mt-xs" data-testid="sqlite-status">{{ dbStatus }}</div>
        </q-toolbar-title>

        <q-chip
          :color="authStore.isOnline ? 'positive' : 'negative'"
          text-color="white"
          :icon="authStore.isOnline ? 'mdi-wifi' : 'mdi-wifi-off'"
          :label="authStore.isOnline ? $t('network.online') : $t('network.offline')"
          dense
          class="q-mr-sm"
        />

        <q-btn-dropdown
          flat
          dense
          :label="locale"
          icon="mdi-translate"
          dropdown-icon="mdi-menu-down"
        >
          <q-list>
            <q-item clickable v-close-popup @click="locale = 'en-US'">
              <q-item-section>
                <q-item-label>{{ $t('language.en') }}</q-item-label>
              </q-item-section>
            </q-item>
            <q-item clickable v-close-popup @click="locale = 'zh-TW'">
              <q-item-section>
                <q-item-label>{{ $t('language.zh') }}</q-item-label>
              </q-item-section>
            </q-item>
          </q-list>
        </q-btn-dropdown>

        <q-btn dense flat round icon="mdi-account-circle" @click="toggleRightDrawer" />
      </q-toolbar>
    </q-header>

    <!-- Left Drawer: MMEX feature navigation -->
    <q-drawer v-model="leftDrawerOpen" side="left" overlay elevated>
      <q-list>
        <q-item-label header>{{ $t('app.name') }}</q-item-label>

        <q-item
          v-for="item in navItems"
          :key="item.route"
          clickable
          v-ripple
          :to="item.route"
          active-class="bg-secondary text-primary"
          @click="leftDrawerOpen = false"
        >
          <q-item-section avatar>
            <q-icon :name="item.icon" />
          </q-item-section>
          <q-item-section>{{ $t(item.labelKey) }}</q-item-section>
        </q-item>

        <q-separator />

        <q-item clickable v-ripple to="/about" active-class="bg-secondary text-primary" @click="leftDrawerOpen = false">
          <q-item-section avatar>
            <q-icon name="mdi-information-outline" />
          </q-item-section>
          <q-item-section>{{ $t('menu.about') }}</q-item-section>
        </q-item>
      </q-list>
    </q-drawer>

    <!-- Right Drawer: Google Sign-In, sync controls, system status -->
    <q-drawer v-model="rightDrawerOpen" side="right" overlay elevated>
      <div class="q-pa-md">

        <!-- Signed-in state -->
        <template v-if="authStore.isSignedIn && authStore.user">
          <div class="row items-center q-gutter-sm q-mb-md">
            <q-avatar>
              <img :src="authStore.user.picture" :alt="authStore.user.name" referrerpolicy="no-referrer" />
            </q-avatar>
            <div>
              <div class="text-subtitle2">{{ authStore.user.name }}</div>
              <div class="text-caption text-grey">{{ authStore.user.email }}</div>
            </div>
          </div>

          <q-separator class="q-mb-md" />

          <!-- Sync controls -->
          <q-list>
            <q-item clickable v-ripple :disable="isSyncing" @click="downloadFromDrive">
              <q-item-section avatar>
                <q-icon name="mdi-cloud-download" />
              </q-item-section>
              <q-item-section>{{ $t('sync.downloadNow') }}</q-item-section>
              <q-item-section side v-if="isSyncing && syncDirection === 'download'">
                <q-spinner />
              </q-item-section>
            </q-item>

            <q-item clickable v-ripple :disable="isSyncing" @click="uploadToDrive">
              <q-item-section avatar>
                <q-icon name="mdi-cloud-upload" />
              </q-item-section>
              <q-item-section>{{ $t('sync.uploadNow') }}</q-item-section>
              <q-item-section side v-if="isSyncing && syncDirection === 'upload'">
                <q-spinner />
              </q-item-section>
            </q-item>
          </q-list>

          <q-separator class="q-my-md" />

          <!-- Sync status -->
          <div class="text-caption q-mb-md">
            <span v-if="authStore.syncStatus === 'syncing'">{{ $t('sync.syncing') }}</span>
            <span v-else-if="authStore.syncStatus === 'success'">
              {{ $t('sync.success') }}: {{ formatSyncTime(authStore.lastSyncTime) }}
            </span>
            <span v-else-if="authStore.syncStatus === 'error'" class="text-negative">
              {{ $t('sync.error') }}: {{ authStore.syncError }}
            </span>
            <span v-else class="text-grey">{{ $t('sync.idle') }}</span>
          </div>

          <!-- Sign-out -->
          <q-btn
            flat
            color="negative"
            icon="mdi-logout"
            :label="$t('auth.signOut')"
            class="full-width"
            @click="signOut"
          />
        </template>

        <!-- Signed-out state -->
        <template v-else>
          <div class="text-subtitle1 q-mb-sm">{{ $t('auth.notSignedIn') }}</div>
          <div class="text-caption text-grey q-mb-md">{{ $t('auth.securityNotice') }}</div>

          <q-btn
            color="primary"
            icon="mdi-google"
            :label="$t('auth.signIn')"
            class="full-width"
            :disable="!authStore.isOnline || isGisLoading"
            :loading="isGisLoading"
            @click="signIn"
          />

          <div v-if="!authStore.isOnline" class="text-caption text-negative q-mt-sm">
            {{ $t('network.offline') }}
          </div>

          <q-separator class="q-my-md" />

          <!-- Local database actions (available without sign-in) -->
          <q-list>
            <q-item clickable v-ripple @click="startNewDb">
              <q-item-section avatar>
                <q-icon name="mdi-database-plus" />
              </q-item-section>
              <q-item-section>{{ $t('database.startNew') }}</q-item-section>
            </q-item>
          </q-list>
        </template>

      </div>
    </q-drawer>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from './stores/auth'
import { downloadDbFromDrive, uploadDbToDrive, fetchUserInfo } from './services/google-drive'
import { dbClient } from './workers/db-client'

const { locale } = useI18n()
const authStore = useAuthStore()

const leftDrawerOpen = ref(false)
const rightDrawerOpen = ref(false)
const dbStatus = ref('Initializing…')
const isGisLoading = ref(false)
const syncDirection = ref<'download' | 'upload' | null>(null)

const isSyncing = computed(() => authStore.syncStatus === 'syncing')

const toggleLeftDrawer = () => {
  leftDrawerOpen.value = !leftDrawerOpen.value
}
const toggleRightDrawer = () => {
  rightDrawerOpen.value = !rightDrawerOpen.value
}

// MMEX navigation items for the left drawer
const navItems = [
  { route: '/transactions', icon: 'mdi-swap-horizontal', labelKey: 'menu.transactions' },
  { route: '/accounts', icon: 'mdi-bank', labelKey: 'menu.accounts' },
  { route: '/bills-deposits', icon: 'mdi-calendar-clock', labelKey: 'menu.billsDeposits' },
  { route: '/budgets', icon: 'mdi-chart-pie', labelKey: 'menu.budgets' },
  { route: '/reports', icon: 'mdi-chart-bar', labelKey: 'menu.reports' },
  { route: '/assets', icon: 'mdi-home-city', labelKey: 'menu.assets' },
  { route: '/exchange-rates', icon: 'mdi-currency-usd', labelKey: 'menu.exchangeRates' },
  { route: '/settings', icon: 'mdi-cog', labelKey: 'menu.settings' },
]

// Format last sync time for display
const formatSyncTime = (date: Date | null): string => {
  if (!date) return ''
  return date.toLocaleTimeString()
}

// Google Identity Services token client (created lazily)
let tokenClient: ReturnType<NonNullable<Window['google']>['accounts']['oauth2']['initTokenClient']> | null = null

const getTokenClient = () => {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
  if (!clientId) {
    console.warn('VITE_GOOGLE_CLIENT_ID is not set. Google Sign-In will not work.')
    return null
  }
  if (!window.google?.accounts?.oauth2) return null
  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/drive profile email',
      callback: async (response) => {
        isGisLoading.value = false
        if (response.error) {
          console.error('Google Sign-In error:', response.error_description)
          return
        }
        authStore.setToken(response.access_token, response.expires_in)
        // Fetch user info
        try {
          const userInfo = await fetchUserInfo(response.access_token)
          authStore.setUser(userInfo)
        } catch (err) {
          console.error('Failed to fetch user info:', err)
        }
        // Auto-sync: download DB from Drive after sign-in
        await downloadFromDrive()
      },
      error_callback: (err) => {
        isGisLoading.value = false
        console.error('GIS error:', err.type)
      },
    })
  }
  return tokenClient
}

const signIn = () => {
  const client = getTokenClient()
  if (!client) {
    console.warn('Google Identity Services not loaded yet.')
    return
  }
  isGisLoading.value = true
  client.requestAccessToken({ prompt: 'consent' })
}

const signOut = () => {
  authStore.signOut()
  tokenClient = null
}

const downloadFromDrive = async () => {
  if (!authStore.accessToken) return
  syncDirection.value = 'download'
  authStore.setSyncStatus('syncing')
  try {
    const data = await downloadDbFromDrive(authStore.accessToken)
    if (data) {
      await dbClient.importDb(data)
      dbStatus.value = 'Database synced from Drive'
    } else {
      dbStatus.value = 'No Drive database found'
    }
    authStore.setSyncStatus('success')
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    authStore.setSyncStatus('error', msg)
    console.error('Download from Drive failed:', err)
  } finally {
    syncDirection.value = null
  }
}

const uploadToDrive = async () => {
  if (!authStore.accessToken) return
  syncDirection.value = 'upload'
  authStore.setSyncStatus('syncing')
  try {
    const data = await dbClient.exportDb()
    await uploadDbToDrive(authStore.accessToken, data)
    authStore.setSyncStatus('success')
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    authStore.setSyncStatus('error', msg)
    console.error('Upload to Drive failed:', err)
  } finally {
    syncDirection.value = null
  }
}

const startNewDb = () => {
  // A new empty DB is already created by the worker on first init.
  // Notify the user and close the drawer.
  dbStatus.value = 'Using local database'
  rightDrawerOpen.value = false
}

onMounted(async () => {
  try {
    await dbClient.ready()
    dbStatus.value = 'Database Ready'
  } catch (err: unknown) {
    dbStatus.value = 'DB Error'
    console.error(err)
  }
})
</script>

<style scoped></style>
