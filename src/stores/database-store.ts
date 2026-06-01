import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { dbClient } from '../workers/db-client'

export type DbState =
  | 'uninitialized'
  | 'probing'
  | 'creating'
  | 'opening'
  | 'migrating'
  | 'needs-wizard'
  | 'ready'
  | 'error'

export const useDatabaseStore = defineStore('database', () => {
  const state = ref<DbState>('uninitialized')
  const version = ref<number | null>(null)
  const latestVersion = ref<number>(0)
  const error = ref<string | null>(null)
  const migrationProgress = ref<{ from: number; to: number; current: number } | null>(null)

  const isReady = computed(() => state.value === 'ready')

  async function probe() {
    state.value = 'probing'
    error.value = null

    try {
      const result = await dbClient.openOrCreate()

      if (result.status === 'created') {
        version.value = result.version
        state.value = 'needs-wizard'
      } else if (result.status === 'existing') {
        version.value = result.version
        state.value = 'ready'
      } else {
        state.value = 'error'
        error.value = `Unexpected status: ${result.status}`
      }
    } catch (err: unknown) {
      state.value = 'error'
      error.value = err instanceof Error ? err.message : String(err)
    }
  }

  async function initNewDb(currencyId: number, userName: string) {
    state.value = 'creating'
    try {
      const baseCurrencyId = currencyId

      await dbClient.exec(
        `INSERT OR REPLACE INTO CURRENCYFORMATS_V1 (CURRENCYID, CURRENCYNAME, PFX_SYMBOL, SFX_SYMBOL, DECIMAL_POINT, GROUP_SEPARATOR, UNIT_NAME, CENT_NAME, SCALE, BASECONVRATE, CURRENCY_SYMBOL, CURRENCY_TYPE)
         SELECT CURRENCYID, CURRENCYNAME, PFX_SYMBOL, SFX_SYMBOL, DECIMAL_POINT, GROUP_SEPARATOR, UNIT_NAME, CENT_NAME, SCALE, BASECONVRATE, CURRENCY_SYMBOL, CURRENCY_TYPE
         FROM json_each(?)`,
        [JSON.stringify({ currencies: [] })],
      )

      if (userName) {
        await dbClient.exec(
          `INSERT OR REPLACE INTO INFOTABLE_V1 (INFOID, INFONAME, INFOVALUE) VALUES (1, 'USERNAME', ?)`,
          [userName],
        )
      }

      state.value = 'ready'
    } catch (err: unknown) {
      state.value = 'error'
      error.value = err instanceof Error ? err.message : String(err)
    }
  }

  async function destroyAndRecreate() {
    try {
      await dbClient.destroy()
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : String(err)
      state.value = 'error'
      return
    }

    await probe()
  }

  function reset() {
    state.value = 'uninitialized'
    version.value = null
    error.value = null
    migrationProgress.value = null
  }

  return {
    state,
    version,
    latestVersion,
    error,
    migrationProgress,
    isReady,
    probe,
    initNewDb,
    destroyAndRecreate,
    reset,
  }
})
