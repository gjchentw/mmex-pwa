import SqliteWorker from './sqlite.worker?worker'

type InitResponseMessage =
  | { type: 'init'; status: 'success' }
  | { type: 'init'; status: 'error'; error: string }

type OpenResponseMessage =
  | { type: 'open'; status: 'success' }
  | { type: 'open'; status: 'error'; error: string }

type ExecResponseMessage =
  | { id: string; type: 'exec'; status: 'success'; result: unknown }
  | { id: string; type: 'exec'; status: 'error'; error: string }

export type DbWorkerResponseMessage =
  | InitResponseMessage
  | OpenResponseMessage
  | ExecResponseMessage

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
          resolve(e.data.result)
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
}

export const dbClient = new DbClient()
