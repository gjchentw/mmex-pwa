<template>
  <q-layout view="hHh lpR fFf">
    <q-header elevated class="bg-primary text-white">
      <q-toolbar>
        <q-btn dense flat round icon="mdi-menu" @click="toggleLeftDrawer" />

        <q-toolbar-title>
          <q-avatar>
            <!-- Local product icon: COEP require-corp blocks cross-origin
                 subresources, and this was the app shell's only one. -->
            <img src="/icon-192.png" />
          </q-avatar>
          <span class="q-ml-sm">Title</span>
          <div class="text-subtitle2 q-mt-xs" data-testid="db-status">
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
          <q-item>
            <q-item-section avatar>
              <q-icon name="mdi-account-circle" />
            </q-item-section>
            <q-item-section>
              <q-item-label>{{
                auth.isSignedIn ? $t('sync.signedIn') : $t('sync.signedOut')
              }}</q-item-label>
              <q-item-label v-if="auth.status === 'expired'" caption class="text-negative">{{
                $t('sync.sessionExpired')
              }}</q-item-label>
            </q-item-section>
            <q-item-section side>
              <q-btn
                v-if="!auth.isSignedIn"
                dense
                no-caps
                color="primary"
                :label="auth.status === 'expired' ? $t('sync.reauthenticate') : $t('sync.signIn')"
                :loading="auth.status === 'authorizing'"
                @click="auth.signIn()"
              />
              <q-btn
                v-else
                dense
                no-caps
                flat
                color="primary"
                :label="$t('sync.signOut')"
                @click="auth.signOut()"
              />
            </q-item-section>
          </q-item>

          <q-separator />

          <q-item v-if="sync.isBound">
            <q-item-section avatar>
              <q-spinner v-if="sync.status === 'syncing'" color="primary" size="24px" />
              <q-icon v-else :name="syncStatusIcon" :color="syncStatusColor" />
            </q-item-section>
            <q-item-section>
              <q-item-label>{{ sync.binding?.fileName }}</q-item-label>
              <q-item-label caption>{{ $t(`sync.status.${sync.status}`) }}</q-item-label>
            </q-item-section>
            <q-item-section side>
              <q-btn
                dense
                flat
                round
                icon="mdi-link-off"
                :title="$t('sync.unlink')"
                @click="sync.unbind()"
              />
            </q-item-section>
          </q-item>

          <q-banner v-if="sync.needsReauth" dense class="bg-warning text-dark">
            {{ $t('sync.sessionExpired') }}
            <template #action>
              <q-btn flat no-caps dense :label="$t('sync.reauthenticate')" @click="auth.signIn()" />
            </template>
          </q-banner>

          <q-item clickable v-ripple :disable="!auth.isSignedIn" @click="driveDialogOpen = true">
            <q-item-section avatar>
              <q-icon name="mdi-google-drive" />
            </q-item-section>
            <q-item-section>{{ $t('database.pickFromDrive') }}</q-item-section>
          </q-item>

          <q-item clickable v-ripple :disable="!sync.isBound" @click="sync.notifyLocalWrite()">
            <q-item-section avatar>
              <q-icon name="mdi-sync" />
            </q-item-section>
            <q-item-section>{{ $t('database.syncToDrive') }}</q-item-section>
          </q-item>

          <q-item clickable v-ripple @click="importInput?.click()">
            <q-item-section avatar>
              <q-icon name="mdi-file-import" />
            </q-item-section>
            <q-item-section>{{ $t('sync.importLocal') }}</q-item-section>
          </q-item>
          <input
            ref="importInput"
            type="file"
            accept=".mmb"
            style="display: none"
            @change="onImportFile"
          />

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
    <DriveFileBrowserDialog v-model="driveDialogOpen" />
    <SyncConflictDialog />
  </q-layout>
</template>

<script lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDatabaseStore } from './stores/database-store'
import { useGoogleAuthStore } from './stores/google-auth-store'
import { useDriveSyncStore } from './stores/drive-sync-store'
import { dbClient } from './workers/db-client'
import ConfirmDestroyDialog from './components/database/ConfirmDestroyDialog.vue'
import DriveFileBrowserDialog from './components/database/DriveFileBrowserDialog.vue'
import SyncConflictDialog from './components/database/SyncConflictDialog.vue'

export default {
  components: {
    ConfirmDestroyDialog,
    DriveFileBrowserDialog,
    SyncConflictDialog,
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
    const driveDialogOpen = ref(false)
    const importInput = ref<HTMLInputElement | null>(null)
    const store = useDatabaseStore()
    const auth = useGoogleAuthStore()
    const sync = useDriveSyncStore()

    const syncStatusIcon = computed(
      () =>
        ({
          unbound: 'mdi-cloud-off-outline',
          idle: 'mdi-cloud-check-outline',
          syncing: 'mdi-cloud-sync-outline',
          error: 'mdi-cloud-alert-outline',
          conflict: 'mdi-alert',
        })[sync.status],
    )
    const syncStatusColor = computed(
      () =>
        ({
          unbound: 'grey',
          idle: 'positive',
          syncing: 'primary',
          error: 'negative',
          conflict: 'warning',
        })[sync.status],
    )

    const onImportFile = async (event: Event) => {
      const file = (event.target as HTMLInputElement).files?.[0]
      if (!file) return
      // Replace the local database through the existing initialization flow
      // (openspec: cloud-file-sync, scenario "Import a pre-existing database file").
      await store.importDatabase(await file.arrayBuffer())
      ;(event.target as HTMLInputElement).value = ''
    }

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
      auth,
      sync,
      driveDialogOpen,
      importInput,
      syncStatusIcon,
      syncStatusColor,
      onImportFile,
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
