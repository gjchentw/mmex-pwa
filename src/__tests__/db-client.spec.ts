import { describe, it, expect, vi, beforeEach } from 'vitest'

const { MockWorker, handlers } = vi.hoisted(() => {
  const handlers: ((e: MessageEvent) => void)[] = []

  class MockWorker {
    postMessage = vi.fn()
    addEventListener = vi.fn((_event: string, handler: any) => {
      handlers.push(handler)
    })
    removeEventListener = vi.fn((_event: string, handler: any) => {
      const index = handlers.indexOf(handler)
      if (index > -1) {
        handlers.splice(index, 1)
      }
    })
    terminate = vi.fn()
  }

  return { MockWorker, handlers }
})

vi.mock('../workers/sqlite.worker?worker', () => ({
  default: MockWorker,
}))

if (typeof window !== 'undefined' && window.crypto) {
  try {
    vi.spyOn(window.crypto, 'randomUUID').mockReturnValue('00000000-0000-0000-0000-000000000000')
  } catch {
    Object.defineProperty(window, 'crypto', {
      value: { randomUUID: () => '00000000-0000-0000-0000-000000000000' },
      writable: true,
      configurable: true,
    })
  }
} else {
  vi.stubGlobal('crypto', {
    randomUUID: () => '00000000-0000-0000-0000-000000000000',
  })
}

describe('DbClient', () => {
  let DbClient: any
  let client: any
  let postMessageMock: any

  const triggerMessage = (data: any) => {
    ;[...handlers].forEach((h) => h({ data } as MessageEvent))
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    handlers.length = 0

    const module = await import('../workers/db-client')
    DbClient = module.DbClient

    client = new DbClient()
    postMessageMock = client.worker.postMessage
  })

  it('should not auto-initialize on construction', () => {
    expect(postMessageMock).not.toHaveBeenCalled()
  })

  it('should send open-or-create message', async () => {
    const promise = client.openOrCreate()

    expect(postMessageMock).toHaveBeenCalledWith({
      id: '00000000-0000-0000-0000-000000000000',
      type: 'open-or-create',
    })

    triggerMessage({
      id: '00000000-0000-0000-0000-000000000000',
      type: 'open-or-create',
      status: 'success',
      result: { status: 'existing', version: 21 },
    })

    const result = await promise
    expect(result).toEqual({ status: 'existing', version: 21 })
  })

  it('should send destroy message', async () => {
    const promise = client.destroy()

    expect(postMessageMock).toHaveBeenCalledWith({
      id: '00000000-0000-0000-0000-000000000000',
      type: 'destroy',
    })

    triggerMessage({
      id: '00000000-0000-0000-0000-000000000000',
      type: 'destroy',
      status: 'success',
    })

    await expect(promise).resolves.toBeUndefined()
  })

  it('should execute query after openOrCreate succeeds', async () => {
    const openPromise = client.openOrCreate()
    triggerMessage({
      id: '00000000-0000-0000-0000-000000000000',
      type: 'open-or-create',
      status: 'success',
      result: { status: 'existing', version: 21 },
    })
    await openPromise

    postMessageMock.mockImplementationOnce((data: any) => {
      if (data.type === 'exec') {
        setTimeout(() => {
          triggerMessage({
            id: data.id,
            status: 'success',
            result: [{ id: 1, name: 'test' }],
          })
        }, 0)
      }
    })

    const result = await client.exec('SELECT * FROM test')

    expect(postMessageMock).toHaveBeenCalledWith({
      id: '00000000-0000-0000-0000-000000000000',
      type: 'exec',
      payload: { sql: 'SELECT * FROM test', bind: undefined },
    })

    expect(result).toEqual([{ id: 1, name: 'test' }])
  })

  it('should handle query failure', async () => {
    const openPromise = client.openOrCreate()
    triggerMessage({
      id: '00000000-0000-0000-0000-000000000000',
      type: 'open-or-create',
      status: 'success',
      result: { status: 'existing', version: 21 },
    })
    await openPromise

    postMessageMock.mockImplementationOnce((data: any) => {
      if (data.type === 'exec') {
        setTimeout(() => {
          triggerMessage({
            id: data.id,
            status: 'error',
            error: 'Syntax error',
          })
        }, 0)
      }
    })

    await expect(client.exec('INVALID SQL')).rejects.toThrow('Syntax error')
  })
})
