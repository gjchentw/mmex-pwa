import { describe, it, expect, vi, beforeEach } from 'vitest'

const { MockWorker, handlers } = vi.hoisted(() => {
  const handlers: ((e: MessageEvent) => void)[] = []

  class MockWorker {
    postMessage = vi.fn()
    addEventListener = vi.fn((event: string, handler: any) => {
      if (event === 'message') {
        handlers.push(handler)
      }
    })
    removeEventListener = vi.fn((event: string, handler: any) => {
      if (event === 'message') {
        const index = handlers.indexOf(handler)
        if (index > -1) {
          handlers.splice(index, 1)
        }
      }
    })
    terminate = vi.fn()
  }

  return { MockWorker, handlers }
})

// Mock the worker import
vi.mock('../workers/sqlite.worker?worker', () => ({
  default: MockWorker,
}))

// Try to spy on randomUUID if crypto exists
if (typeof window !== 'undefined' && window.crypto) {
  try {
    vi.spyOn(window.crypto, 'randomUUID').mockReturnValue('00000000-0000-0000-0000-000000000000')
  } catch (e) {
    console.log('Failed to spy on window.crypto.randomUUID:', e)
    // Fallback or force overwrite
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
  let generateIdMock: any

  const triggerMessage = (data: any) => {
    // Create a copy because handlers might modify the array (removeEventListener)
    ;[...handlers].forEach((h) => h({ data } as MessageEvent))
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    handlers.length = 0

    // Import DbClient dynamically to ensure mocks are in place
    const module = await import('../workers/db-client')
    DbClient = module.DbClient

    // Mock generateId
    generateIdMock = vi
      .spyOn(module.helpers, 'generateId')
      .mockReturnValue('00000000-0000-0000-0000-000000000000')

    client = new DbClient()
    postMessageMock = client.worker.postMessage
  })

  it('should initialize correctly', async () => {
    expect(postMessageMock).toHaveBeenCalledWith({ type: 'init' })

    // Simulate init success
    triggerMessage({ type: 'init', status: 'success' })

    await expect(client.ready()).resolves.toBeUndefined()
  })

  it('should handle initialization failure', async () => {
    // Simulate init failure
    triggerMessage({
      type: 'init',
      status: 'error',
      error: 'Init failed',
    })

    await expect(client.ready()).rejects.toThrow('Init failed')
  })

  it('should execute query successfully', async () => {
    // Initialize first
    triggerMessage({ type: 'init', status: 'success' })
    await client.ready()

    // Setup response trigger when postMessage is called
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
    // Initialize first
    triggerMessage({ type: 'init', status: 'success' })
    await client.ready()

    // Setup response trigger when postMessage is called
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
