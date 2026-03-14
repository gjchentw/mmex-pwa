import { describe, it, expect, vi, beforeEach } from 'vitest'

type WorkerRequestMessage =
  | { type: 'init' }
  | { id: string; type: 'exec'; payload: { sql: string; bind?: unknown[] } }

type WorkerGlobal = {
  onmessage: ((event: MessageEvent<WorkerRequestMessage>) => Promise<void>) | null
  postMessage: (message: unknown) => void
}

// Mock dependencies
const mockExec = vi.fn()
const mockTransaction = vi.fn((cb) => cb())
const mockOpfsDb = vi.fn(() => ({
  exec: mockExec,
  transaction: mockTransaction,
}))

vi.mock('@sqlite.org/sqlite-wasm', () => ({
  default: vi.fn(() =>
    Promise.resolve({
      version: { libVersion: '3.45.0' },
      oo1: {
        OpfsDb: mockOpfsDb,
      },
    }),
  ),
}))

// Mock import.meta.glob
vi.mock('../../mmex/database/tables.sql?raw', () => ({
  default: 'CREATE TABLE INFOTABLE_V1 (INFOID INTEGER PRIMARY KEY, INFONAME TEXT, INFOVALUE TEXT);',
}))

// We need to mock the worker environment before importing the worker code
const postMessageMock = vi.fn()
Object.defineProperty(globalThis, 'self', {
  value: {
    onmessage: null,
    postMessage: postMessageMock,
  },
  writable: true,
  configurable: true,
})

const workerSelf = globalThis.self as unknown as WorkerGlobal

describe('SQLite Worker', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()

    // Mock upgrades
    vi.doMock('../../mmex/database/incremental_upgrade/*.sql', () => ({
      '../../mmex/database/incremental_upgrade/database_version_4.sql':
        'UPDATE INFOTABLE_V1 SET INFOVALUE = "4" WHERE INFONAME = "DATAVERSION";',
      '../../mmex/database/incremental_upgrade/database_version_5.sql':
        'UPDATE INFOTABLE_V1 SET INFOVALUE = "5" WHERE INFONAME = "DATAVERSION";',
    }))

    // Import the worker module to trigger side effects (setting onmessage)
    await import('../workers/sqlite.worker')
  })

  it('should initialize and migrate database', async () => {
    // Simulate init message
    await workerSelf.onmessage!({ data: { type: 'init' } } as MessageEvent<WorkerRequestMessage>)

    expect(mockOpfsDb).toHaveBeenCalledWith('/.mmex/data.mmb', 'c')

    // Check if migration logic was called
    // 1. Check version (returns -1 initially)
    // 2. Init tables
    // 3. Check version again
    // 4. Apply upgrades

    expect(mockExec).toHaveBeenCalled()
    expect(postMessageMock).toHaveBeenCalledWith({ type: 'init', status: 'success' })
  })

  it('should execute queries', async () => {
    // Initialize first
    await workerSelf.onmessage!({ data: { type: 'init' } } as MessageEvent<WorkerRequestMessage>)

    const sql = 'SELECT * FROM items'
    mockExec.mockReturnValue([{ id: 1, name: 'test' }])

    await workerSelf.onmessage!({
      data: {
        id: 'test-id',
        type: 'exec',
        payload: { sql },
      },
    } as MessageEvent<WorkerRequestMessage>)

    expect(mockExec).toHaveBeenCalledWith(
      expect.objectContaining({
        sql,
        returnValue: 'resultRows',
      }),
    )

    expect(postMessageMock).toHaveBeenCalledWith({
      id: 'test-id',
      type: 'exec',
      status: 'success',
      result: [{ id: 1, name: 'test' }],
    })
  })

  it('should handle query errors', async () => {
    // Initialize first
    await workerSelf.onmessage!({ data: { type: 'init' } } as MessageEvent<WorkerRequestMessage>)

    const error = new Error('SQL Error')
    mockExec.mockImplementation(() => {
      throw error
    })

    await workerSelf.onmessage!({
      data: {
        id: 'test-id',
        type: 'exec',
        payload: { sql: 'BAD SQL' },
      },
    } as MessageEvent<WorkerRequestMessage>)

    expect(postMessageMock).toHaveBeenCalledWith({
      id: 'test-id',
      type: 'exec',
      status: 'error',
      error: error,
    })
  })
})
