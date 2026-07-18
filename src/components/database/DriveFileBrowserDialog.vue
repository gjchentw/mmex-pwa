<template>
  <q-dialog v-model="model" @show="refresh">
    <q-card style="min-width: 340px; max-width: 90vw">
      <q-card-section class="text-h6">{{ $t('sync.fileBrowserTitle') }}</q-card-section>

      <q-card-section class="q-pt-none">
        <div v-if="loading" class="text-center q-pa-md"><q-spinner color="primary" /></div>
        <q-banner v-else-if="error" class="bg-negative text-white" dense>{{ error }}</q-banner>
        <q-list v-else-if="files.length" bordered separator>
          <q-item v-for="f in files" :key="f.id" clickable v-ripple @click="pick(f)">
            <q-item-section avatar><q-icon name="mdi-database" /></q-item-section>
            <q-item-section>
              <q-item-label>{{ f.name }}</q-item-label>
              <q-item-label caption>{{ new Date(f.modifiedTime).toLocaleString() }}</q-item-label>
            </q-item-section>
          </q-item>
        </q-list>
        <div v-else class="text-body2 q-pa-sm">{{ $t('sync.noFiles') }}</div>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat no-caps :label="$t('common.cancel')" v-close-popup />
        <q-btn
          color="primary"
          no-caps
          :label="$t('sync.createNew')"
          :loading="creating"
          @click="createNew"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { listDatabaseFiles, createDatabaseFile, type DriveFile } from '../../services/google-drive'
import { useGoogleAuthStore } from '../../stores/google-auth-store'
import { useDriveSyncStore } from '../../stores/drive-sync-store'

// App-rendered Drive file browser (openspec: cloud-file-sync design.md D8) --
// authenticated listing only, no picker service, no API key. Lists files this
// application created, across devices.
const model = defineModel<boolean>({ required: true })
const { t } = useI18n()
const auth = useGoogleAuthStore()
const sync = useDriveSyncStore()

const files = ref<DriveFile[]>([])
const loading = ref(false)
const creating = ref(false)
const error = ref('')

const refresh = async () => {
  if (!auth.accessToken) return
  loading.value = true
  error.value = ''
  try {
    files.value = await listDatabaseFiles(auth.accessToken)
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

const pick = (file: DriveFile) => {
  sync.bind(file.id, file.name)
  model.value = false
}

const createNew = async () => {
  if (!auth.accessToken) return
  creating.value = true
  error.value = ''
  try {
    const bytes = await sync.exportCurrentDatabase()
    const name = `mmex-${new Date().toISOString().slice(0, 10)}.mmb`
    const created = await createDatabaseFile(auth.accessToken, name, bytes)
    sync.bind(created.id, created.name)
    model.value = false
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : t('sync.authError', { error: String(err) })
  } finally {
    creating.value = false
  }
}
</script>
