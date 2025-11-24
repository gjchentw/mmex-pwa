import sqlite3InitModule, { OpfsDatabase } from '@sqlite.org/sqlite-wasm'

let db: OpfsDatabase | null = null

const log = (...args: unknown[]) => console.log('Worker:', ...args)
const error = (...args: unknown[]) => console.error('Worker:', ...args)

const initDb = async () => {
  try {
    log('Initializing SQLite...')
    const sqlite3 = await sqlite3InitModule({
      print: log,
      printErr: error,
    })

    log('Running SQLite3 version', sqlite3.version.libVersion)

    db = new sqlite3.oo1.OpfsDb('/.mmex/mmex.mmb', 'c')

    // Create a table if it doesn't exist
    db.exec(
      'CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, value TEXT)',
    )

    postMessage({ type: 'init', status: 'success' })
  } catch (err: unknown) {
    error('Initialization failed', err)
    postMessage({ type: 'init', status: 'error', error: err })
  }
}

self.onmessage = async (e) => {
  const { type, payload, id } = e.data

  if (type === 'init') {
    await initDb()
    return
  }

  if (!db) {
    postMessage({ id, type, status: 'error', error: 'Database not initialized' })
    return
  }

  try {
    switch (type) {
      case 'exec':
        const result = db.exec({
          sql: payload.sql,
          bind: payload.bind,
          returnValue: 'resultRows',
        })
        postMessage({ id, type, status: 'success', result })
        break
      default:
        postMessage({ id, type, status: 'error', error: `Unknown message type: ${type}` })
    }
  } catch (err: unknown) {
    error('Query failed', err)
    postMessage({ id, type, status: 'error', error: err })
  }
}
