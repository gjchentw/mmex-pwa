import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const { MockWorker, handlers } = vi.hoisted(() => {
  const handlers: ((e: MessageEvent) => void)[] = []
  class MockWorker {
    postMessage = vi.fn()
    addEventListener = vi.fn((_event: string, handler: any) => {
      handlers.push(handler)
    })
    removeEventListener = vi.fn()
    terminate = vi.fn()
  }
  return { MockWorker, handlers }
})

vi.mock('../workers/sqlite.worker?worker', () => ({
  default: MockWorker,
}))

vi.mock('../workers/db-client', async (importOriginal) => {
  const mod = (await importOriginal()) as any
  return {
    ...mod,
    helpers: {
      generateId: () => '00000000-0000-0000-0000-000000000000',
    },
  }
})

if (typeof window !== 'undefined' && window.crypto) {
  try {
    vi.spyOn(window.crypto, 'randomUUID').mockReturnValue('00000000-0000-0000-0000-000000000000')
  } catch {
    Object.defineProperty(window, 'crypto', {
      value: { randomUUID: () => '00000000-0000-0000-0000-000000000000' },
    })
  }
}

const triggerMessage = (data: any) => {
  ;[...handlers].forEach((h) => h({ data } as MessageEvent))
}

describe('database-store', () => {
  let store: any

  beforeEach(async () => {
    setActivePinia(createPinia())
    vi.clearAllMocks()

    const { useDatabaseStore } = await import('../stores/database-store')
    store = useDatabaseStore()
  })

  it('should start in uninitialized state', () => {
    expect(store.state).toBe('uninitialized')
    expect(store.isReady).toBe(false)
    expect(store.version).toBeNull()
    expect(store.error).toBeNull()
  })

  it('should transition to needs-wizard on first run (created)', async () => {
    const probePromise = store.probe()

    triggerMessage({
      id: '00000000-0000-0000-0000-000000000000',
      type: 'open-or-create',
      status: 'success',
      result: { status: 'created', version: 21 },
    })

    await probePromise

    expect(store.state).toBe('needs-wizard')
    expect(store.version).toBe(21)
    expect(store.isReady).toBe(false)
  })

  it('should transition to ready when existing DB found', async () => {
    const probePromise = store.probe()

    triggerMessage({
      id: '00000000-0000-0000-0000-000000000000',
      type: 'open-or-create',
      status: 'success',
      result: { status: 'existing', version: 21 },
    })

    await probePromise

    expect(store.state).toBe('ready')
    expect(store.version).toBe(21)
    expect(store.isReady).toBe(true)
  })

  it('should transition to error on probe failure', async () => {
    const probePromise = store.probe()

    triggerMessage({
      id: '00000000-0000-0000-0000-000000000000',
      type: 'open-or-create',
      status: 'error',
      error: 'OPFS unavailable',
    })

    await probePromise

    expect(store.state).toBe('error')
    expect(store.error).toBeTruthy()
    expect(store.isReady).toBe(false)
  })

  it('should reset to uninitialized', () => {
    store.state = 'ready'
    store.version = 21
    store.reset()

    expect(store.state).toBe('uninitialized')
    expect(store.version).toBeNull()
    expect(store.error).toBeNull()
  })

  // Spec: infrastructure-baseline, Requirement "Cross-Origin Isolation",
  // Scenario "Isolation headers are absent".
  describe('when the page is not cross-origin isolated', () => {
    const setIsolated = (value: boolean | undefined) => {
      Object.defineProperty(window, 'crossOriginIsolated', {
        value,
        configurable: true,
        writable: true,
      })
    }

    afterEach(() => {
      // jsdom does not implement the flag; restore that rather than leaking
      // `false` into later tests, which would short-circuit their probe().
      setIsolated(undefined)
    })

    // Note this awaits probe() with no triggerMessage: that it resolves at all
    // proves the check short-circuits before reaching the worker. Had it gone
    // through, the promise would hang forever waiting on a worker response --
    // which is the opaque failure this diagnostic exists to prevent.
    it('fails fast with a diagnostic naming the missing headers', async () => {
      setIsolated(false)

      await store.probe()

      expect(store.state).toBe('error')
      expect(store.error).toMatch(/cross-origin isolated/i)
      expect(store.error).toContain('Cross-Origin-Opener-Policy')
      expect(store.error).toContain('Cross-Origin-Embedder-Policy')
      expect(store.isReady).toBe(false)
    })

    it('proceeds normally when the flag is unimplemented (undefined)', async () => {
      setIsolated(undefined)

      const probePromise = store.probe()
      triggerMessage({
        id: '00000000-0000-0000-0000-000000000000',
        type: 'open-or-create',
        status: 'success',
        result: { status: 'existing', version: 21 },
      })
      await probePromise

      expect(store.state).toBe('ready')
    })
  })
})
