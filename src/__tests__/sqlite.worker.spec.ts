import { describe, it, expect, vi, beforeEach } from 'vitest'

type WorkerRequestMessage =
  | { type: 'init' }
  | { id: string; type: 'exec'; payload: { sql: string; bind?: unknown[] } }
  | { id: string; type: 'exec-transaction'; payload: { statements: Array<{ sql: string; bind?: unknown[] }> } }

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

// Keep a stable reference so tests can inspect call arguments even after vi.resetModules()
const mockSqlite3Init = vi.fn(
  async (_opts?: Record<string, unknown>) => ({
    version: { libVersion: '3.45.0' },
    oo1: {
      OpfsDb: mockOpfsDb,
    },
  }),
)

vi.mock('@sqlite.org/sqlite-wasm', () => ({
  default: mockSqlite3Init,
}))

// Provide a predictable hashed URL so we can assert locateFile returns it
vi.mock('@sqlite.org/sqlite-wasm/sqlite3.wasm?url', () => ({
  default: '/assets/sqlite3-MOCKED_HASH.wasm',
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
    mockExec.mockImplementationOnce(() => {
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
      error: error.message,
    })
  })

  describe('exec-transaction', () => {
    it('should execute multiple statements in a transaction', async () => {
      await workerSelf.onmessage!({ data: { type: 'init' } } as MessageEvent<WorkerRequestMessage>)
      mockExec.mockClear()

      const statements = [
        { sql: 'UPDATE t1 SET a = 1 WHERE id = ?', bind: [10] },
        { sql: 'UPDATE t2 SET b = 2 WHERE id = ?', bind: [20] },
      ]

      await workerSelf.onmessage!({
        data: { id: 'tx-1', type: 'exec-transaction', payload: { statements } },
      } as MessageEvent<WorkerRequestMessage>)

      expect(mockTransaction).toHaveBeenCalled()
      expect(mockExec).toHaveBeenCalledWith({ sql: statements[0]!.sql, bind: statements[0]!.bind })
      expect(mockExec).toHaveBeenCalledWith({ sql: statements[1]!.sql, bind: statements[1]!.bind })
      expect(postMessageMock).toHaveBeenCalledWith({
        id: 'tx-1',
        type: 'exec-transaction',
        status: 'success',
        result: { executed: 2 },
      })
    })

    it('should rollback and return error on failure', async () => {
      await workerSelf.onmessage!({ data: { type: 'init' } } as MessageEvent<WorkerRequestMessage>)
      mockExec.mockClear()

      const txError = new Error('constraint failed')
      mockTransaction.mockImplementationOnce((cb: () => void) => {
        cb() // will throw because mockExec throws
      })
      mockExec
        .mockImplementationOnce(() => {}) // first succeeds
        .mockImplementationOnce(() => { throw txError }) // second fails

      await workerSelf.onmessage!({
        data: {
          id: 'tx-2',
          type: 'exec-transaction',
          payload: { statements: [{ sql: 'UPDATE a SET x=1' }, { sql: 'BAD SQL' }] },
        },
      } as MessageEvent<WorkerRequestMessage>)

      expect(postMessageMock).toHaveBeenCalledWith({
        id: 'tx-2',
        type: 'exec-transaction',
        status: 'error',
        error: 'constraint failed',
      })
    })

    it('should handle empty statements array', async () => {
      await workerSelf.onmessage!({ data: { type: 'init' } } as MessageEvent<WorkerRequestMessage>)
      mockExec.mockClear()

      await workerSelf.onmessage!({
        data: {
          id: 'tx-3',
          type: 'exec-transaction',
          payload: { statements: [] },
        },
      } as unknown as MessageEvent<WorkerRequestMessage>)

      expect(postMessageMock).toHaveBeenCalledWith({
        id: 'tx-3',
        type: 'exec-transaction',
        status: 'success',
        result: { executed: 0 },
      })
    })
  })

  describe('wasm URL resolution – getSqliteInitOptions', () => {
    // Retrieve the init-options object that was passed to sqlite3InitModule on the most
    // recent 'init' message.  Using the stable mockSqlite3Init reference means we survive
    // vi.resetModules() across beforeEach runs.
    const getLastOpts = (): Record<string, unknown> => {
      const lastCall = mockSqlite3Init.mock.calls.at(-1)
    
      if (!lastCall || lastCall.length === 0) {
        throw new Error('sqlite3InitModule was not called with init options')
      }
    
      const opts = lastCall[0]
    
      if (opts == null) {
        throw new Error('sqlite3InitModule was not called with init options')
      }
    
      return opts as Record<string, unknown>
    }

    beforeEach(async () => {
      await workerSelf.onmessage!({ data: { type: 'init' } } as MessageEvent<WorkerRequestMessage>)
    })

    it('locateFile returns the Vite-hashed wasm URL for sqlite3.wasm', () => {
      const opts = getLastOpts()
      const locateFile = opts.locateFile as (file: string, prefix: string) => string
      expect(locateFile('sqlite3.wasm', '')).toBe('/assets/sqlite3-MOCKED_HASH.wasm')
      expect(locateFile('sqlite3.wasm', '/some/prefix/')).toBe('/assets/sqlite3-MOCKED_HASH.wasm')
    })

    it('locateFile falls back to prefix+file for other assets', () => {
      const opts = getLastOpts()
      const locateFile = opts.locateFile as (file: string, prefix: string) => string
      expect(locateFile('other-file.js', '/prefix/')).toBe('/prefix/other-file.js')
    })

    it('locateFile cannot be overwritten (pre-js override is blocked)', () => {
      const opts = getLastOpts()
      const originalLocateFile = opts.locateFile
      // Simulate the pre-js unconditional override attempt
      opts.locateFile = () => 'overwritten-by-pre-js'
      expect(opts.locateFile).toBe(originalLocateFile)
    })

    it('instantiateWasm is defined and cannot be overwritten (pre-js override is blocked)', () => {
      const opts = getLastOpts()
      expect(typeof opts.instantiateWasm).toBe('function')
      const originalInstantiateWasm = opts.instantiateWasm
      // Simulate the pre-js unconditional override attempt
      opts.instantiateWasm = () => 'overwritten-by-pre-js'
      expect(opts.instantiateWasm).toBe(originalInstantiateWasm)
    })
  })
})
