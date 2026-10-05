import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest'
import { nextTick, reactive } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'

const { MockWorker, stores } = vi.hoisted(() => {
  class MockWorker {
    postMessage = vi.fn()
    addEventListener = vi.fn()
    removeEventListener = vi.fn()
    terminate = vi.fn()
  }
  // The two stores the runner consults, replaced by plain reactive stand-ins.
  const stores = {
    database: { isReady: false } as { isReady: boolean },
    sync: { status: 'unbound' } as { status: string },
  }
  return { MockWorker, stores }
})

vi.mock('../workers/sqlite.worker?worker', () => ({ default: MockWorker }))
vi.mock('../stores/database-store', () => ({ useDatabaseStore: () => stores.database }))
vi.mock('../stores/drive-sync-store', () => ({ useDriveSyncStore: () => stores.sync }))

import { ledgerRepo } from '../domain/repos/ledger'
import { LAST_PURGE_DAY_KEY, useMaintenanceStore } from '../stores/maintenance-store'

/**
 * Spec: transaction-ledger, Requirement "Soft Delete, Trash, and Retention" —
 * "Purge SHALL run when the database is ready and synchronization has settled
 * (or no sync binding exists), at most once per calendar day" (operator
 * decision 2026-08-08; transaction-ledger-fidelity design D9).
 */

const makeStorage = () => {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  }
}

const monday = new Date(2026, 9, 5, 9, 0, 0)
const mondayLater = new Date(2026, 9, 5, 18, 0, 0)
const tuesday = new Date(2026, 9, 6, 9, 0, 0)

let purge: MockInstance<typeof ledgerRepo.purgeExpired>

beforeEach(() => {
  vi.stubGlobal('localStorage', makeStorage())
  stores.database = reactive({ isReady: true })
  stores.sync = reactive({ status: 'unbound' })
  setActivePinia(createPinia())
  purge = vi.spyOn(ledgerRepo, 'purgeExpired').mockResolvedValue(2)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('the daily purge', () => {
  it('waits for the database to be ready', async () => {
    stores.database.isReady = false
    expect(await useMaintenanceStore().maybePurge(monday)).toBeNull()
    expect(purge).not.toHaveBeenCalled()
  })

  it('waits for synchronization to settle', async () => {
    const store = useMaintenanceStore()
    for (const status of ['syncing', 'error', 'conflict']) {
      stores.sync.status = status
      expect(await store.maybePurge(monday)).toBeNull()
    }
    expect(purge).not.toHaveBeenCalled()

    stores.sync.status = 'idle'
    expect(await store.maybePurge(monday)).toBe(2)
  })

  it('runs once per calendar day and remembers the day on this device', async () => {
    const store = useMaintenanceStore()
    expect(await store.maybePurge(monday)).toBe(2)
    expect(purge).toHaveBeenCalledWith(monday)
    expect(localStorage.getItem(LAST_PURGE_DAY_KEY)).toBe('2026-10-05')

    expect(await store.maybePurge(mondayLater)).toBeNull()
    expect(purge).toHaveBeenCalledTimes(1)

    expect(await store.maybePurge(tuesday)).toBe(2)
    expect(purge).toHaveBeenCalledTimes(2)
  })

  it('reads the remembered day in a new session', async () => {
    localStorage.setItem(LAST_PURGE_DAY_KEY, '2026-10-05')
    expect(await useMaintenanceStore().maybePurge(mondayLater)).toBeNull()
    expect(purge).not.toHaveBeenCalled()
  })

  it('does not record the day when the purge fails, so the next attempt retries', async () => {
    purge.mockRejectedValueOnce(new Error('disk full'))
    const store = useMaintenanceStore()
    await expect(store.maybePurge(monday)).rejects.toThrow('disk full')
    expect(localStorage.getItem(LAST_PURGE_DAY_KEY)).toBeNull()

    expect(await store.maybePurge(mondayLater)).toBe(2)
  })

  it('still runs once per session when the device offers no storage', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    })
    const store = useMaintenanceStore()
    expect(await store.maybePurge(monday)).toBe(2)
    expect(await store.maybePurge(mondayLater)).toBeNull()
  })
})

describe('starting the runner', () => {
  it('purges as soon as the database is ready with no sync binding', async () => {
    stores.database.isReady = false
    const store = useMaintenanceStore()
    store.start()
    await flushPromises()
    expect(purge).not.toHaveBeenCalled()

    stores.database.isReady = true
    await nextTick()
    await flushPromises()
    expect(purge).toHaveBeenCalledTimes(1)
  })

  it('purges when a synchronization in flight settles', async () => {
    stores.sync.status = 'syncing'
    const store = useMaintenanceStore()
    store.start()
    await flushPromises()
    expect(purge).not.toHaveBeenCalled()

    stores.sync.status = 'idle'
    await nextTick()
    await flushPromises()
    expect(purge).toHaveBeenCalledTimes(1)
  })

  it('keeps a failure to itself and reports it on the store', async () => {
    purge.mockRejectedValueOnce(new Error('disk full'))
    const store = useMaintenanceStore()
    store.start()
    await flushPromises()
    expect(store.lastError).toBe('disk full')
  })
})
