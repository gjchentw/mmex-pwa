import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Spec: cloud-file-sync — binding persistence, sync state machine, the
// no-write-before-conflict-resolution rule, and the recreate-on-token-change
// instance lifecycle (design.md D3 + Open Question 1 resolution).

const { MockOpfsCloudFile, instances } = vi.hoisted(() => {
  const instances: MockOpfsCloudFile[] = []
  class MockOpfsCloudFile extends EventTarget {
    config: unknown
    stopped = false
    disposed = false
    dispatched: string[] = []
    constructor(config: unknown) {
      super()
      this.config = config
      instances.push(this)
      const original = this.dispatchEvent.bind(this)
      this.dispatchEvent = (event: Event) => {
        this.dispatched.push(event.type)
        return original(event)
      }
    }
    sync = vi.fn()
    stop() {
      this.stopped = true
    }
    dispose() {
      this.disposed = true
    }
  }
  return { MockOpfsCloudFile, instances }
})

vi.mock('opfs-cloud-file', () => ({ OpfsCloudFile: MockOpfsCloudFile }))
vi.mock('../workers/db-client', () => ({
  dbClient: {
    setMutationListener: vi.fn(),
    exportDatabase: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
    importDatabase: vi.fn().mockResolvedValue({ status: 'existing', version: 21 }),
    exec: vi.fn(),
  },
}))

import { useDriveSyncStore } from '../stores/drive-sync-store'
import { useGoogleAuthStore } from '../stores/google-auth-store'

const signIn = () => {
  const auth = useGoogleAuthStore()
  auth.accessToken = 'tok-a'
  auth.expiresAt = Date.now() + 3600_000
  auth.status = 'signed-in'
  return auth
}

// Node 26 ships an experimental global localStorage that is undefined without
// --localstorage-file and shadows jsdom's. Stub a minimal in-memory Storage.
const makeStorage = () => {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    get length() {
      return map.size
    },
    key: (i: number) => [...map.keys()][i] ?? null,
  }
}

describe('drive-sync-store', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeStorage())
    setActivePinia(createPinia())
    instances.length = 0
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('starts unbound with no persisted binding', () => {
    const sync = useDriveSyncStore()
    expect(sync.status).toBe('unbound')
    expect(sync.isBound).toBe(false)
    expect(instances).toHaveLength(0)
  })

  it('bind persists the binding, builds an instance, and reaches idle', () => {
    signIn()
    const sync = useDriveSyncStore()
    sync.bind('file-1', 'my.mmb')

    expect(JSON.parse(localStorage.getItem('mmex.sync.binding')!)).toEqual({
      fileId: 'file-1',
      fileName: 'my.mmb',
    })
    expect(instances).toHaveLength(1)
    expect(sync.status).toBe('idle')
  })

  it('unbind disposes the instance and leaves both files untouched', () => {
    signIn()
    const sync = useDriveSyncStore()
    sync.bind('file-1', 'my.mmb')
    sync.unbind()

    expect(instances[0]!.disposed).toBe(true)
    expect(localStorage.getItem('mmex.sync.binding')).toBeNull()
    expect(sync.status).toBe('unbound')
  })

  it('a mutating write triggers a debounced upload dispatch', () => {
    vi.useFakeTimers()
    signIn()
    const sync = useDriveSyncStore()
    sync.bind('file-1', 'my.mmb')

    sync.notifyLocalWrite()
    sync.notifyLocalWrite()
    expect(instances[0]!.dispatched).toHaveLength(0)
    vi.advanceTimersByTime(2100)
    expect(instances[0]!.dispatched).toEqual(['local-file-changed'])
    expect(sync.status).toBe('syncing')
  })

  it('conflict blocks writes until resolved (nothing overwritten while undecided)', () => {
    vi.useFakeTimers()
    signIn()
    const sync = useDriveSyncStore()
    sync.bind('file-1', 'my.mmb')

    instances[0]!.dispatchEvent(
      new CustomEvent('conflict-detected', {
        detail: {
          localChecksum: 'aaa',
          remoteChecksum: 'bbb',
          localTimestamp: 1,
          remoteTimestamp: 1,
          fileName: 'my.mmb',
        },
      }),
    )
    expect(sync.status).toBe('conflict')

    sync.notifyLocalWrite()
    vi.advanceTimersByTime(5000)
    const uploads = instances[0]!.dispatched.filter((t) => t === 'local-file-changed')
    expect(uploads).toHaveLength(0)
  })

  it('resolveConflict(local) uploads the local version', () => {
    vi.useFakeTimers()
    signIn()
    const sync = useDriveSyncStore()
    sync.bind('file-1', 'my.mmb')
    instances[0]!.dispatchEvent(
      new CustomEvent('conflict-detected', {
        detail: {
          localChecksum: 'a',
          remoteChecksum: 'b',
          localTimestamp: 1,
          remoteTimestamp: 1,
          fileName: 'my.mmb',
        },
      }),
    )

    sync.resolveConflict('local')
    expect(sync.conflict).toBeNull()
    expect(instances[0]!.dispatched).toContain('local-file-changed')
  })

  it('a token change rebuilds the instance with the fresh token', async () => {
    const auth = signIn()
    const sync = useDriveSyncStore()
    sync.bind('file-1', 'my.mmb')
    expect(instances).toHaveLength(1)

    auth.accessToken = 'tok-b'
    auth.expiresAt = Date.now() + 3600_000
    await vi.waitFor(() => expect(instances).toHaveLength(2))

    expect(instances[0]!.disposed).toBe(true)
    const cfg = instances[1]!.config as { provider: { config: { accessToken: string } } }
    expect(cfg.provider.config.accessToken).toBe('tok-b')
  })

  it('a 401 sync error pauses into error state and requests re-auth', () => {
    signIn()
    const sync = useDriveSyncStore()
    sync.bind('file-1', 'my.mmb')

    instances[0]!.dispatchEvent(
      new CustomEvent('opfs-cloud-error', {
        detail: { error: new Error('HTTP 401 Unauthorized') },
      }),
    )
    expect(sync.status).toBe('error')
    expect(sync.needsReauth).toBe(true)
  })
})
