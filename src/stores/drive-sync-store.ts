import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import { OpfsCloudFile, type ConflictDetail } from 'opfs-cloud-file'
import { useGoogleAuthStore } from './google-auth-store'
import { useDatabaseStore } from './database-store'
import { downloadDatabaseFile, DriveApiError } from '../services/google-drive'
import { dbClient } from '../workers/db-client'

// Sync orchestration (openspec: cloud-file-sync, Requirement "Bidirectional
// Database Synchronization"). The library owns upload/polling/retry and
// timestamp conflict auto-resolution; this store owns the binding, the
// instance lifecycle, and the states the user sees.
//
// Instance lifecycle (design.md D3 + Open Question 1 resolution): the 0.1.5
// provider takes a static access token, so on token renewal or 401 the
// instance is torn down (dispose) and rebuilt with the fresh token -- never
// while a sync is in flight.

const BINDING_KEY = 'mmex.sync.binding'
const DEBOUNCE_MS = 2000
// ~30s: a second device sees changes within half a minute at ~120 metadata
// polls/hour -- far inside Drive quota for a personal app (design Open Question 2).
const POLLING_INTERVAL_MS = 30_000
const OPFS_DB_PATH = '.mmex/data.mmb'

export type SyncStatus = 'unbound' | 'idle' | 'syncing' | 'error' | 'conflict'

interface Binding {
  fileId: string
  fileName: string
}

const loadBinding = (): Binding | null => {
  try {
    const raw = localStorage.getItem(BINDING_KEY)
    return raw ? (JSON.parse(raw) as Binding) : null
  } catch {
    return null
  }
}

export const useDriveSyncStore = defineStore('drive-sync', () => {
  const auth = useGoogleAuthStore()
  const database = useDatabaseStore()

  const binding = ref<Binding | null>(loadBinding())
  const status = ref<SyncStatus>('unbound')
  const lastSyncedAt = ref<number | null>(null)
  const lastError = ref<string | null>(null)
  const needsReauth = ref(false)
  const conflict = ref<ConflictDetail | null>(null)

  const isBound = computed(() => binding.value !== null)

  let instance: OpfsCloudFile | null = null
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let syncInFlight = false
  let rebuildQueued = false

  const persistBinding = () => {
    if (binding.value) localStorage.setItem(BINDING_KEY, JSON.stringify(binding.value))
    else localStorage.removeItem(BINDING_KEY)
  }

  const teardown = () => {
    if (!instance) return
    instance.stop()
    instance.dispose()
    instance = null
  }

  const onCloudFileChanged = async () => {
    // The library already downloaded the remote file; the SQLite worker must
    // reopen it before any further query (spec: "Remote change is downloaded").
    status.value = 'syncing'
    await database.probe()
    lastSyncedAt.value = Date.now()
    status.value = database.state === 'error' ? 'error' : 'idle'
  }

  const onSyncError = (event: Event) => {
    syncInFlight = false
    const detail = (event as CustomEvent<{ error?: unknown }>).detail
    const message = detail?.error instanceof Error ? detail.error.message : String(detail?.error)
    if (/\b401\b|unauthoriz/i.test(message)) {
      // 401 is non-retryable in the library; pause and route through re-auth
      // (spec: "Authorization expires mid-session").
      needsReauth.value = true
    }
    status.value = 'error'
    lastError.value = message
    maybeRebuild()
  }

  const onConflict = (event: Event) => {
    syncInFlight = false
    conflict.value = (event as CustomEvent<ConflictDetail>).detail
    status.value = 'conflict'
    maybeRebuild()
  }

  const maybeRebuild = () => {
    if (rebuildQueued && !syncInFlight) {
      rebuildQueued = false
      rebuild()
    }
  }

  const rebuild = () => {
    teardown()
    if (!binding.value || !auth.isSignedIn || !auth.accessToken) return
    instance = new OpfsCloudFile({
      type: 'google-drive-v3',
      opfsPath: OPFS_DB_PATH,
      pollingInterval: POLLING_INTERVAL_MS,
      provider: { config: { fileId: binding.value.fileId, accessToken: auth.accessToken } },
    })
    instance.addEventListener('cloud-file-changed', onCloudFileChanged)
    instance.addEventListener('opfs-cloud-error', onSyncError)
    instance.addEventListener('conflict-detected', onConflict)
    if (status.value === 'unbound') status.value = 'idle'
  }

  /** Token changed or expired: rebuild with the fresh token, never mid-sync. */
  watch(
    () => auth.accessToken,
    () => {
      if (!binding.value) return
      if (!auth.isSignedIn) {
        teardown()
        status.value = 'error'
        needsReauth.value = true
        return
      }
      needsReauth.value = false
      if (syncInFlight) rebuildQueued = true
      else rebuild()
    },
  )

  function bind(fileId: string, fileName: string) {
    binding.value = { fileId, fileName }
    persistBinding()
    lastError.value = null
    conflict.value = null
    rebuild()
  }

  /** Severs the binding; touches neither the local nor the remote file. */
  function unbind() {
    teardown()
    binding.value = null
    persistBinding()
    status.value = 'unbound'
    lastSyncedAt.value = null
    conflict.value = null
  }

  /** Called after every mutating database exec; debounced upload trigger. */
  function notifyLocalWrite() {
    if (!instance || status.value === 'conflict') return
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      if (!instance || status.value === 'conflict') return
      syncInFlight = true
      status.value = 'syncing'
      instance.dispatchEvent(new CustomEvent('local-file-changed'))
      // The library reports completion through its event stream; optimistically
      // settle to idle once the upload window passes without an error event.
      setTimeout(() => {
        if (status.value === 'syncing') {
          syncInFlight = false
          lastSyncedAt.value = Date.now()
          status.value = 'idle'
          maybeRebuild()
        }
      }, 4000)
    }, DEBOUNCE_MS)
  }

  /**
   * Manual conflict resolution (spec: "Manual Conflict Resolution"): nothing is
   * overwritten until the user chooses.
   */
  async function resolveConflict(keep: 'local' | 'remote') {
    if (!conflict.value || !binding.value) return
    const fileId = binding.value.fileId
    conflict.value = null
    if (keep === 'local') {
      status.value = 'syncing'
      syncInFlight = true
      instance?.dispatchEvent(new CustomEvent('local-file-changed'))
      setTimeout(() => {
        if (status.value === 'syncing') {
          syncInFlight = false
          lastSyncedAt.value = Date.now()
          status.value = 'idle'
        }
      }, 4000)
      return
    }
    // keep === 'remote': download via REST and reuse the import path, so the
    // worker's open handles are released before the file is replaced.
    try {
      status.value = 'syncing'
      const token = auth.accessToken
      if (!token) throw new DriveApiError(401, 'not signed in')
      const bytes = await downloadDatabaseFile(token, fileId)
      await database.importDatabase(bytes)
      lastSyncedAt.value = Date.now()
      status.value = database.state === 'error' ? 'error' : 'idle'
    } catch (err: unknown) {
      if (err instanceof DriveApiError && err.status === 401) needsReauth.value = true
      status.value = 'error'
      lastError.value = err instanceof Error ? err.message : String(err)
    }
  }

  /** Seed a brand-new Drive file with the current database bytes (spec: create scenario). */
  async function exportCurrentDatabase(): Promise<ArrayBuffer> {
    return dbClient.exportDatabase()
  }

  // Wire the mutation seam: every mutating exec becomes a debounced upload
  // trigger while bound (design.md D3).
  dbClient.setMutationListener(() => notifyLocalWrite())
  // Resume an existing binding if the user is already signed in.
  if (binding.value && auth.isSignedIn) rebuild()

  return {
    binding,
    status,
    lastSyncedAt,
    lastError,
    needsReauth,
    conflict,
    isBound,
    bind,
    unbind,
    notifyLocalWrite,
    resolveConflict,
    exportCurrentDatabase,
  }
})
