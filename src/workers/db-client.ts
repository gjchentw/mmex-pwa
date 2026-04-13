import SqliteWorker from './sqlite.worker?worker'

type InitResponseMessage =
  | { type: 'init'; status: 'success' }
  | { type: 'init'; status: 'error'; error: string }

type OpenResponseMessage =
  | { type: 'open'; status: 'success' }
  | { type: 'open'; status: 'error'; error: string }

type CloseResponseMessage = { type: 'close'; status: 'success' }

type ExecResponseMessage =
  | { id: string; type: 'exec'; status: 'success'; result: unknown }
  | { id: string; type: 'exec'; status: 'error'; error: string }

type ExecTransactionResponseMessage =
  | { id: string; type: 'exec-transaction'; status: 'success'; result: { executed: number } }
  | { id: string; type: 'exec-transaction'; status: 'error'; error: string }

type ImportResponseMessage =
  | { id: string; type: 'import'; status: 'success' }
  | { id: string; type: 'import'; status: 'error'; error: string }

type ExportResponseMessage =
  | { id: string; type: 'export'; status: 'success'; result: ArrayBuffer }
  | { id: string; type: 'export'; status: 'error'; error: string }

export type DbWorkerResponseMessage =
  | InitResponseMessage
  | OpenResponseMessage
  | CloseResponseMessage
  | ExecResponseMessage
  | ExecTransactionResponseMessage
  | ImportResponseMessage
  | ExportResponseMessage

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (reason?: unknown) => void
}

export const helpers = {
  generateId: () => crypto.randomUUID(),
}

export class DbClient {
  private worker: Worker
  private pendingRequests = new Map<string, PendingRequest>()
  private initPromise: Promise<void>

  constructor() {
    this.worker = new SqliteWorker()

    this.initPromise = new Promise((resolve, reject) => {
      const handler = (e: MessageEvent<DbWorkerResponseMessage>) => {
        if (e.data.type === 'init') {
          this.worker.removeEventListener('message', handler)
          if (e.data.status === 'success') {
            resolve()
          } else {
            reject(new Error(e.data.error))
          }
        }
      }
      this.worker.addEventListener('message', handler)
    })

    this.worker.addEventListener('message', (e: MessageEvent<DbWorkerResponseMessage>) => {
      if (!('id' in e.data) || !e.data.id || !this.pendingRequests.has(e.data.id)) {
        return
      }

      const { id, status } = e.data
      if (id && this.pendingRequests.has(id)) {
        const { resolve, reject } = this.pendingRequests.get(id)!
        this.pendingRequests.delete(id)
        if (status === 'success') {
          resolve('result' in e.data ? e.data.result : undefined)
        } else {
          reject(new Error(e.data.error))
        }
      }
    })

    this.worker.postMessage({ type: 'init' })
  }

  async ready(): Promise<void> {
    return this.initPromise
  }

  async exec(sql: string, bind?: unknown[]): Promise<unknown> {
    await this.ready()
    const id = helpers.generateId()
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject })
      this.worker.postMessage({ id, type: 'exec', payload: { sql, bind } })
    })
  }

  async execTransaction(
    statements: Array<{ sql: string; bind?: unknown[] }>,
  ): Promise<{ executed: number }> {
    await this.ready()
    const id = helpers.generateId()
    return new Promise<{ executed: number }>((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: (value) => resolve(value as { executed: number }),
        reject,
      })
      this.worker.postMessage({ id, type: 'exec-transaction', payload: { statements } })
    })
  }

  /**
   * Imports an external database file into OPFS and reloads the SQLite worker.
   * The worker closes the current DB, writes the buffer to OPFS, and reopens it.
   *
   * NOTE: The `data` ArrayBuffer is transferred (not copied) to the worker thread,
   * so the caller's reference will be detached after this call. Clone the buffer
   * first if it needs to be reused (e.g., for retry logic).
   */
  async importDb(data: ArrayBuffer): Promise<void> {
    const id = helpers.generateId()
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: () => {
          // After a successful import, reset the initPromise so ready() resolves again
          this.initPromise = Promise.resolve()
          resolve()
        },
        reject,
      })
      this.worker.postMessage({ id, type: 'import', payload: { data } }, [data])
    })
  }

  /**
   * Exports the current OPFS database file as an ArrayBuffer.
   */
  async exportDb(): Promise<ArrayBuffer> {
    await this.ready()
    const id = helpers.generateId()
    return new Promise<ArrayBuffer>((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: (value) => resolve(value as ArrayBuffer),
        reject,
      })
      this.worker.postMessage({ id, type: 'export' })
    })
  }
}

export const dbClient = new DbClient()
