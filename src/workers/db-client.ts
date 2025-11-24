import SqliteWorker from './sqlite.worker?worker'

export class DbClient {
  private worker: Worker
  private pendingRequests: Map<
    string,
    { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }
  >
  private initPromise: Promise<void>

  constructor() {
    this.worker = new SqliteWorker()
    this.pendingRequests = new Map()

    this.initPromise = new Promise((resolve, reject) => {
      const handler = (e: MessageEvent) => {
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

    this.worker.addEventListener('message', (e) => {
      const { id, status, result, error } = e.data
      if (id && this.pendingRequests.has(id)) {
        const { resolve, reject } = this.pendingRequests.get(id)!
        this.pendingRequests.delete(id)
        if (status === 'success') {
          resolve(result)
        } else {
          reject(new Error(error))
        }
      }
    })

    this.worker.postMessage({ type: 'init' })
  }

  async ready() {
    return this.initPromise
  }

  async exec(sql: string, bind?: unknown[]): Promise<unknown> {
    await this.ready()
    const id = crypto.randomUUID()
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject })
      this.worker.postMessage({ id, type: 'exec', payload: { sql, bind } })
    })
  }
}

export const dbClient = new DbClient()
