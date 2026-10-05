import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { formatIsoDate } from '../domain/conventions'
import { ledgerRepo } from '../domain/repos/ledger'
import { useDatabaseStore } from './database-store'
import { useDriveSyncStore } from './drive-sync-store'

/**
 * Housekeeping that desktop does when it opens a file. Desktop purges the
 * trash at every open (mmframe.cpp autocleanDeletedTransactions); this
 * application opens its database every session and would race synchronization,
 * so the purge runs once the database is ready and synchronization has settled,
 * at most once per calendar day (operator decision 2026-08-08; openspec:
 * transaction-ledger, Soft Delete, Trash, and Retention).
 */

/** Where this device remembers the day it last purged. */
export const LAST_PURGE_DAY_KEY = 'mmex.maintenance.lastPurgeDay'

// Storage can be missing or refuse access (private windows, blocked site data);
// the runner then remembers the day for the session only.
const readDay = (): string | null => {
  try {
    return localStorage.getItem(LAST_PURGE_DAY_KEY)
  } catch {
    return null
  }
}

const writeDay = (day: string): void => {
  try {
    localStorage.setItem(LAST_PURGE_DAY_KEY, day)
  } catch {
    // Remembered in memory only.
  }
}

export const useMaintenanceStore = defineStore('maintenance', () => {
  const lastPurgeDay = ref<string | null>(readDay())
  const lastPurged = ref(0)
  const lastError = ref<string | null>(null)
  let running = false

  /**
   * Purges expired trash when the conditions hold; returns the number of
   * transactions removed, or null when it did not run. The purge writes through
   * the database client, whose mutation listener hands the change to
   * synchronization, so nothing here needs to ask for an upload.
   */
  async function maybePurge(now = new Date()): Promise<number | null> {
    const database = useDatabaseStore()
    const sync = useDriveSyncStore()
    if (!database.isReady) return null
    if (sync.status !== 'unbound' && sync.status !== 'idle') return null
    const day = formatIsoDate(now)
    if (running || lastPurgeDay.value === day) return null

    running = true
    try {
      const purged = await ledgerRepo.purgeExpired(now)
      // The day is recorded only once the purge has succeeded, so a failure retries.
      lastPurgeDay.value = day
      writeDay(day)
      lastPurged.value = purged
      lastError.value = null
      return purged
    } finally {
      running = false
    }
  }

  /** Runs the purge whenever the database becomes ready or synchronization settles. */
  function start(): void {
    const database = useDatabaseStore()
    const sync = useDriveSyncStore()
    watch(
      () => [database.isReady, sync.status] as const,
      () => {
        maybePurge().catch((err: unknown) => {
          lastError.value = err instanceof Error ? err.message : String(err)
        })
      },
      { immediate: true },
    )
  }

  return { lastPurgeDay, lastPurged, lastError, maybePurge, start }
})
