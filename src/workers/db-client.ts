import SqliteWorker from './sqlite.worker?worker'

export const helpers = {
  generateId: () => crypto.randomUUID(),
}

export class DbClient {
  private worker: Worker
  // Invoked after every successful mutating exec (openspec: cloud-file-sync
  // design.md D3). Injected by the sync store to avoid a store<->client cycle.
  private mutationListener: (() => void) | null = null
  private pendingRequests = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }
  >()
  private readyPromise: Promise<void> | null = null
  private readyResolve: (() => void) | null = null
  private readyReject: ((reason?: unknown) => void) | null = null

  constructor() {
    this.worker = new SqliteWorker()

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
  }

  async ready(): Promise<void> {
    if (this.readyPromise) {
      return this.readyPromise
    }
    this.readyPromise = new Promise((resolve, reject) => {
      this.readyResolve = resolve
      this.readyReject = reject
    })
    return this.readyPromise
  }

  async openOrCreate(): Promise<{ status: string; version: number }> {
    const id = helpers.generateId()
    return new Promise((resolve, reject) => {
      this.readyPromise = new Promise((resolveReady, rejectReady) => {
        this.readyResolve = resolveReady
        this.readyReject = rejectReady
      })
      this.readyPromise.catch(() => {})

      this.pendingRequests.set(id, {
        resolve: (result: unknown) => {
          const res = result as { status: string; version: number }
          if (res.status === 'existing' || res.status === 'created') {
            this.readyResolve?.()
          } else {
            this.readyReject?.(new Error(`openOrCreate failed: ${res.status}`))
          }
          resolve(res)
        },
        reject: (err) => {
          this.readyReject?.(err)
          reject(err)
        },
      })

      this.worker.postMessage({ id, type: 'open-or-create' })
    })
  }

  async destroy(): Promise<void> {
    const id = helpers.generateId()
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve: () => resolve(), reject })
      this.worker.postMessage({ id, type: 'destroy' })
    })
  }

  setMutationListener(listener: (() => void) | null) {
    this.mutationListener = listener
  }

  async exec(sql: string, bind?: unknown[]): Promise<unknown> {
    await this.ready()
    const id = helpers.generateId()
    const result = await new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject })
      this.worker.postMessage({ id, type: 'exec', payload: { sql, bind } })
    })
    if (this.mutationListener && !/^\s*(select|pragma|explain)\b/i.test(sql)) {
      this.mutationListener()
    }
    return result
  }

  /** Raw database file bytes (openspec: cloud-file-sync — seeds new Drive files). */
  async exportDatabase(): Promise<ArrayBuffer> {
    await this.ready()
    const id = helpers.generateId()
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: (result) => resolve(result as ArrayBuffer),
        reject,
      })
      this.worker.postMessage({ id, type: 'export' })
    })
  }

  /**
   * Replace the database with imported bytes and reopen it. The worker closes
   * its handle first; callers must reload database state afterwards
   * (openspec: cloud-file-sync, scenario "Import a pre-existing database file").
   */
  async importDatabase(bytes: ArrayBuffer): Promise<{ status: string; version: number }> {
    const id = helpers.generateId()
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: (result) => resolve(result as { status: string; version: number }),
        reject,
      })
      this.worker.postMessage({ id, type: 'import', payload: { bytes } }, [bytes])
    })
  }
}

export const dbClient = new DbClient()
