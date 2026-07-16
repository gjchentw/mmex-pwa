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
          <div class="text-subtitle2 q-mt-xs">
            {{ $t('database.dbStatus', { status: dbStatus }) }}
          </div>
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
            <RouterLink to="/">{{ $t('menu.home') }}</RouterLink>
            <RouterLink to="/about">{{ $t('menu.about') }}</RouterLink>
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
            <q-item-section>{{ $t('database.pickFromDrive') }}</q-item-section>
          </q-item>

          <q-item clickable v-ripple>
            <q-item-section avatar>
              <q-icon name="mdi-sync" />
            </q-item-section>
            <q-item-section>{{ $t('database.syncToDrive') }}</q-item-section>
          </q-item>

          <q-item clickable v-ripple @click="showDestroyDialog = true">
            <q-item-section avatar>
              <q-icon name="mdi-database-plus" />
            </q-item-section>
            <q-item-section>{{ $t('database.startNew') }}</q-item-section>
          </q-item>
        </q-list>

        <q-separator class="q-my-md" />

        <pre style="white-space: pre-wrap; word-break: break-all">{{ dbResult }}</pre>
      </div>
    </q-drawer>

    <q-page-container>
      <router-view />
    </q-page-container>

    <ConfirmDestroyDialog v-model="showDestroyDialog" @confirm="onDestroyConfirm" />
  </q-layout>
</template>

<script lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDatabaseStore } from './stores/database-store'
import { dbClient } from './workers/db-client'
import ConfirmDestroyDialog from './components/database/ConfirmDestroyDialog.vue'

export default {
  components: {
    ConfirmDestroyDialog,
  },
  data() {
    return {
      dbResult: '',
    }
  },
  setup() {
    const { locale } = useI18n()
    const leftDrawerOpen = ref(false)
    const rightDrawerOpen = ref(false)
    const showDestroyDialog = ref(false)
    const store = useDatabaseStore()

    const dbStatus = computed(() => {
      switch (store.state) {
        case 'uninitialized':
          return 'Uninitialized'
        case 'probing':
          return 'Probing...'
        case 'creating':
          return 'Creating...'
        case 'opening':
          return 'Opening...'
        case 'migrating':
          return 'Migrating...'
        case 'needs-wizard':
          return 'Needs Setup'
        case 'ready':
          return 'Ready'
        case 'error':
          return `Error: ${store.error}`
        default:
          return store.state
      }
    })

    const onDestroyConfirm = async () => {
      await store.destroyAndRecreate()
      if (store.state === 'needs-wizard' || store.state === 'probing') {
        // Router guard will redirect to /init
      }
    }

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
      showDestroyDialog,
      dbStatus,
      onDestroyConfirm,
    }
  },
  async mounted() {
    const store = useDatabaseStore()
    // Wait for DB to be ready before querying version
    const unwatch = this.$watch(
      () => store.state,
      async (val) => {
        if (val === 'ready') {
          unwatch()
          try {
            const versionResult = await dbClient.exec('PRAGMA user_version')
            let version = 'Unknown'
            if (
              Array.isArray(versionResult) &&
              versionResult.length > 0 &&
              Array.isArray(versionResult[0])
            ) {
              version = String(versionResult[0][0])
            }
            this.dbResult = `DB Version: ${version}`
          } catch (err: unknown) {
            console.error(err)
          }
        }
      },
      { immediate: true },
    )
  },
}
</script>

<style scoped></style>
