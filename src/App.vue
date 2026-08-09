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
          <span class="q-ml-sm">{{ $t('app.name') }}</span>
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
            <q-item clickable v-close-popup @click="chooseLocale('en-US')">
              <q-item-section>
                <q-item-label>English</q-item-label>
              </q-item-section>
            </q-item>

            <q-item clickable v-close-popup @click="chooseLocale('zh-TW')">
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
      <!-- Entries come from route metadata, so one cannot point at a path the
           route table does not serve (openspec: app-shell-navigation,
           Navigation Reflects Location). -->
      <q-list padding>
        <q-item
          v-for="entry in navEntries"
          :key="entry.path"
          v-ripple
          clickable
          :to="entry.path"
          exact
          active-class="text-primary bg-blue-grey-1"
          @click="leftDrawerOpen = false"
        >
          <q-item-section avatar>
            <q-icon :name="entry.icon" />
          </q-item-section>
          <q-item-section>{{ $t(entry.labelKey) }}</q-item-section>
        </q-item>
      </q-list>
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

          <q-separator />

          <q-item v-if="schemaVersion !== null">
            <q-item-section avatar>
              <q-icon name="mdi-information-outline" />
            </q-item-section>
            <q-item-section caption>
              {{ $t('database.schemaVersion', { version: schemaVersion }) }}
            </q-item-section>
          </q-item>
        </q-list>
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
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { navigationEntries } from './router'
import { useDatabaseStore } from './stores/database-store'
import { useSettingsStore } from './stores/settings-store'
import { useGoogleAuthStore } from './stores/google-auth-store'
import { useDriveSyncStore } from './stores/drive-sync-store'
import ConfirmDestroyDialog from './components/database/ConfirmDestroyDialog.vue'
import DriveFileBrowserDialog from './components/database/DriveFileBrowserDialog.vue'
import SyncConflictDialog from './components/database/SyncConflictDialog.vue'

export default {
  components: {
    ConfirmDestroyDialog,
    DriveFileBrowserDialog,
    SyncConflictDialog,
  },
  setup() {
    const { locale, t } = useI18n()
    const leftDrawerOpen = ref(false)
    const rightDrawerOpen = ref(false)
    const showDestroyDialog = ref(false)
    const driveDialogOpen = ref(false)
    const importInput = ref<HTMLInputElement | null>(null)
    const store = useDatabaseStore()
    const auth = useGoogleAuthStore()
    const sync = useDriveSyncStore()
    const settings = useSettingsStore()

    // The language is a property of the data file, so the choice is written to
    // the database -- and a choice made before one is open waits for it
    // (openspec: file-metadata-and-settings, Active Locale Persistence).
    const chooseLocale = (value: string) => {
      void settings.setLocale(value, store.isReady)
    }

    watch(
      () => store.isReady,
      (ready) => {
        if (ready) void settings.syncLocaleWithDatabase()
      },
      { immediate: true },
    )

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

    const navEntries = computed(() => navigationEntries())

    // Lifecycle states reach the user as translated text, never as the internal
    // identifier (openspec: app-shell-navigation, Localized Shell Text).
    const dbStatus = computed(() => t(`database.status.${store.state}`))

    const schemaVersion = computed(() => store.version)

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
      chooseLocale,
      navEntries,
      dbStatus,
      schemaVersion,
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
}
</script>

<style scoped></style>
