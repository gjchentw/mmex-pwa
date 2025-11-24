import sqlite3InitModule, { OpfsDatabase } from '@sqlite.org/sqlite-wasm'
import tablesSql from '../../mmex/database/tables.sql?raw'

const upgradeFiles = import.meta.glob('../../mmex/database/incremental_upgrade/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const upgrades = new Map<number, string>()
for (const path in upgradeFiles) {
  const match = path.match(/database_version_(\d+)\.sql$/)
  if (match && match[1]) {
    const version = parseInt(match[1], 10)
    const sql = upgradeFiles[path]
    if (sql) {
      upgrades.set(version, sql)
    }
  }
}

let db: OpfsDatabase | null = null

const log = (...args: unknown[]) => console.log('Worker:', ...args)
const error = (...args: unknown[]) => console.error('Worker:', ...args)

const migrateDb = (db: OpfsDatabase) => {
  const getVersion = (): number => {
    try {
      const result = db.exec({
        sql: "SELECT INFOVALUE FROM INFOTABLE_V1 WHERE INFONAME = 'DATAVERSION'",
        returnValue: 'resultRows',
      })
      if (result && result.length > 0 && result[0] && result[0].length > 0) {
        return parseInt(result[0][0] as string, 10)
      }
    } catch {
      // Table likely doesn't exist
      return -1
    }
    return -1
  }

  let version = getVersion()

  if (version === -1) {
    log('Initializing database with tables.sql...')
    db.exec(tablesSql)
    version = getVersion()
    log('Database initialized. Version:', version)
  } else {
    log('Existing database found. Version:', version)
  }

  let incrementalVersion = version + 1
  while (upgrades.has(incrementalVersion)) {
    log(`Upgrading to version ${incrementalVersion}...`)
    const sql = upgrades.get(incrementalVersion)
    if (sql) {
      db.transaction(() => {
        // ignore errors
        try {
          db.exec(sql)
        } catch (err: unknown) {
          log('Upgrade failed at version ' + incrementalVersion, err)
        }
      })
    }
    incrementalVersion++
  }

  log('Migration complete. Final Incremental Version:', incrementalVersion - 1)
}

const initDb = async () => {
  try {
    log('Initializing SQLite...')
    const sqlite3 = await sqlite3InitModule({
      print: log,
      printErr: error,
    })

    log('Running SQLite3 version', sqlite3.version.libVersion)

    db = new sqlite3.oo1.OpfsDb('/.mmex/mmex.mmb', 'c')

    migrateDb(db)

    self.postMessage({ type: 'init', status: 'success' })
  } catch (err: unknown) {
    error('Initialization failed', err)
    self.postMessage({ type: 'init', status: 'error', error: err })
  }
}

self.onmessage = async (e) => {
  const { type, payload, id } = e.data

  if (type === 'init') {
    await initDb()
    return
  }

  if (!db) {
    self.postMessage({ id, type, status: 'error', error: 'Database not initialized' })
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
        self.postMessage({ id, type, status: 'success', result })
        break
      default:
        self.postMessage({ id, type, status: 'error', error: `Unknown message type: ${type}` })
    }
  } catch (err: unknown) {
    error('Query failed', err)
    self.postMessage({ id, type, status: 'error', error: err })
  }
}
