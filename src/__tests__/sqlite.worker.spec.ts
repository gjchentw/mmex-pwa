import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExec = vi.fn()
const mockClose = vi.fn()
const mockTransaction = vi.fn((cb) => cb())
const mockRemoveEntry = vi.fn()
const opfsCallOrder: string[] = []
const mockWritable = {
  write: vi.fn(() => {
    opfsCallOrder.push('write')
    return Promise.resolve()
  }),
  close: vi.fn(() => Promise.resolve()),
}
const mockGetFileHandle = vi.fn(() =>
  Promise.resolve({
    createWritable: vi.fn(() => Promise.resolve(mockWritable)),
    getFile: vi.fn(() => Promise.resolve({ arrayBuffer: () => new ArrayBuffer(4) })),
  }),
)
const makeMockDirHandle = () => ({
  getDirectoryHandle: mockGetDirectoryHandle,
  getFileHandle: mockGetFileHandle,
  removeEntry: mockRemoveEntry,
})
const mockGetDirectoryHandle = vi.fn(() => Promise.resolve(makeMockDirHandle()))
const mockOpfsDb = vi.fn(() => ({
  exec: mockExec,
  close: mockClose,
  transaction: mockTransaction,
}))

const mockStorage = {
  getDirectory: vi.fn(() => Promise.resolve(makeMockDirHandle())),
}

vi.stubGlobal('navigator', {
  ...navigator,
  storage: mockStorage,
})

vi.mock('@sqlite.org/sqlite-wasm', () => ({
  default: vi.fn(() =>
    Promise.resolve({
      version: { libVersion: '3.45.0' },
      oo1: {
        OpfsDb: mockOpfsDb,
      },
      capi: {},
    }),
  ),
}))

vi.mock('../../mmex/database/tables.sql?raw', () => ({
  default: 'CREATE TABLE INFOTABLE_V1 (INFOID INTEGER PRIMARY KEY, INFONAME TEXT, INFOVALUE TEXT);',
}))

const postMessageMock = vi.fn()
global.self = {
  onmessage: null,
  postMessage: postMessageMock,
} as any

describe('SQLite Worker', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()

    vi.doMock('../../mmex/database/incremental_upgrade/*.sql', () => ({
      '../../mmex/database/incremental_upgrade/database_version_4.sql':
        'UPDATE INFOTABLE_V1 SET INFOVALUE = "4" WHERE INFONAME = "DATAVERSION";',
      '../../mmex/database/incremental_upgrade/database_version_5.sql':
        'UPDATE INFOTABLE_V1 SET INFOVALUE = "5" WHERE INFONAME = "DATAVERSION";',
    }))

    await import('../workers/sqlite.worker')
  })

  it('should handle open-or-create when no existing DB', async () => {
    mockOpfsDb.mockImplementationOnce(() => {
      throw new Error('File not found')
    })

    await self.onmessage!({
      data: { id: 'test-1', type: 'open-or-create' },
    } as MessageEvent)

    expect(mockOpfsDb).toHaveBeenCalledTimes(2)
    expect(postMessageMock).toHaveBeenCalledWith({
      id: 'test-1',
      type: 'open-or-create',
      status: 'success',
      result: { status: 'created', version: 21 },
    })
  })

  it('should handle open-or-create when DB exists', async () => {
    mockExec.mockReturnValueOnce([[4]]).mockReturnValueOnce([])

    await self.onmessage!({
      data: { id: 'test-2', type: 'open-or-create' },
    } as MessageEvent)

    expect(postMessageMock).toHaveBeenCalledWith({
      id: 'test-2',
      type: 'open-or-create',
      status: 'success',
      result: expect.objectContaining({ status: 'existing' }),
    })
  })

  it('should handle destroy', async () => {
    await self.onmessage!({
      data: { id: 'test-3', type: 'open-or-create' },
    } as MessageEvent)

    await self.onmessage!({
      data: { id: 'test-4', type: 'destroy' },
    } as MessageEvent)

    expect(postMessageMock).toHaveBeenCalledWith({
      id: 'test-4',
      type: 'destroy',
      status: 'success',
    })
  })

  it('should execute queries', async () => {
    await self.onmessage!({
      data: { id: 'test-5', type: 'open-or-create' },
    } as MessageEvent)

    const sql = 'SELECT * FROM items'
    mockExec.mockReturnValue([{ id: 1, name: 'test' }])

    await self.onmessage!({
      data: {
        id: 'test-6',
        type: 'exec',
        payload: { sql },
      },
    } as MessageEvent)

    expect(mockExec).toHaveBeenCalledWith(
      expect.objectContaining({
        sql,
        returnValue: 'resultRows',
      }),
    )

    expect(postMessageMock).toHaveBeenCalledWith({
      id: 'test-6',
      type: 'exec',
      status: 'success',
      result: [{ id: 1, name: 'test' }],
    })
  })

  it('should handle query errors', async () => {
    await self.onmessage!({
      data: { id: 'test-7', type: 'open-or-create' },
    } as MessageEvent)

    const error = new Error('SQL Error')
    mockExec.mockImplementation(() => {
      throw error
    })

    await self.onmessage!({
      data: {
        id: 'test-8',
        type: 'exec',
        payload: { sql: 'BAD SQL' },
      },
    } as MessageEvent)

    expect(postMessageMock).toHaveBeenCalledWith({
      id: 'test-8',
      type: 'exec',
      status: 'error',
      error: 'SQL Error',
    })
  })

  // openspec: cloud-file-sync task 5.4 -- the download/import path must release
  // the SQLite worker's exclusive OPFS handle BEFORE the file is replaced, or
  // the write collides with the open sync-access handle.
  it('import closes the open database handle before writing the new bytes', async () => {
    // clearAllMocks does not reset implementations left by earlier tests.
    mockExec.mockImplementation(() => [])

    await self.onmessage!({
      data: { id: 'test-9', type: 'open-or-create' },
    } as MessageEvent)

    opfsCallOrder.length = 0
    mockClose.mockImplementation(() => opfsCallOrder.push('close'))

    await self.onmessage!({
      data: { id: 'test-10', type: 'import', payload: { bytes: new ArrayBuffer(16) } },
    } as MessageEvent)

    expect(opfsCallOrder).toEqual(['close', 'write'])
    expect(postMessageMock).toHaveBeenCalledWith({
      id: 'test-10',
      type: 'import',
      status: 'success',
      result: { status: expect.stringMatching(/existing|created/), version: expect.any(Number) },
    })
  })
})
