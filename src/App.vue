<template>
  <q-layout view="hHh lpR fFf">
    <q-header elevated class="bg-primary text-white">
      <q-toolbar>
        <q-btn dense flat round icon="mdi-menu" @click="toggleLeftDrawer" />

        <q-toolbar-title>
          <q-avatar>
            <img src="https://cdn.quasar.dev/logo-v2/svg/logo-mono-white.svg" />
          </q-avatar>
          <span class="q-ml-sm">Title</span>
          <div class="text-subtitle2 q-mt-xs">SQLite Status: {{ dbStatus }}</div>
        </q-toolbar-title>

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
                <q-item-label>English</q-item-label>
              </q-item-section>
            </q-item>

            <q-item clickable v-close-popup @click="locale = 'zh-TW'">
              <q-item-section>
                <q-item-label>繁體中文</q-item-label>
              </q-item-section>
            </q-item>
          </q-list>
        </q-btn-dropdown>

        <q-btn dense flat round icon="mdi-database" @click="toggleRightDrawer" />
      </q-toolbar>
    </q-header>

    <q-drawer v-model="leftDrawerOpen" side="left" overlay elevated>
      <div class="q-pa-md">
        <nav>
          <div class="column q-gutter-sm">
            <RouterLink to="/">Home</RouterLink>
            <RouterLink to="/about">About</RouterLink>
          </div>
        </nav>
      </div>
    </q-drawer>

    <q-drawer v-model="rightDrawerOpen" side="right" overlay elevated>
      <div class="q-pa-md">
        <q-list>
          <q-item clickable v-ripple>
            <q-item-section avatar>
              <q-icon name="mdi-google-drive" />
            </q-item-section>
            <q-item-section>Pick database from Google Drive</q-item-section>
          </q-item>

          <q-item clickable v-ripple>
            <q-item-section avatar>
              <q-icon name="mdi-sync" />
            </q-item-section>
            <q-item-section>Sync local database to Google Drive</q-item-section>
          </q-item>

          <q-item clickable v-ripple>
            <q-item-section avatar>
              <q-icon name="mdi-database-plus" />
            </q-item-section>
            <q-item-section>Start a new local database</q-item-section>
          </q-item>
        </q-list>

        <q-separator class="q-my-md" />

        <pre style="white-space: pre-wrap; word-break: break-all">{{ dbResult }}</pre>
      </div>
    </q-drawer>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { RouterLink, RouterView } from 'vue-router'
import { dbClient } from './workers/db-client'

const dbStatus = ref('Initializing...')
const dbResult = ref('')

export default {
  data() {
    return {
      dbStatus,
      dbResult,
    }
  },
  setup() {
    const { locale } = useI18n()
    const leftDrawerOpen = ref(false)
    const rightDrawerOpen = ref(false)

    return {
      locale,
      leftDrawerOpen,
      toggleLeftDrawer() {
        leftDrawerOpen.value = !leftDrawerOpen.value
      },

      rightDrawerOpen,
      toggleRightDrawer() {
        rightDrawerOpen.value = !rightDrawerOpen.value
      },
    }
  },
  async mounted() {
    try {
      await dbClient.ready()
      dbStatus.value = 'Database Ready'

      const versionResult = await dbClient.exec(
        "SELECT INFOVALUE FROM INFOTABLE_V1 WHERE INFONAME = 'DATAVERSION'",
      )
      let version = 'Unknown'
      if (
        Array.isArray(versionResult) &&
        versionResult.length > 0 &&
        Array.isArray(versionResult[0])
      ) {
        version = versionResult[0][0] as string
      }

      dbResult.value = `DB Version: ${version}`
    } catch (err: unknown) {
      dbStatus.value = 'Error'
      console.error(err)
    }
  },
}
</script>

<style scoped></style>
