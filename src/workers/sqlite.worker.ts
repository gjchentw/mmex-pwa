import sqlite3InitModule, { OpfsDatabase } from '@sqlite.org/sqlite-wasm'
import tablesSql from '../../mmex/database/tables.sql?raw'

const dbPath = '/.mmex/data.mmb'

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

const latestVersion = Array.from(upgrades.entries()).reduce(
  (max, [version]) => Math.max(max, version),
  0,
)

let db: OpfsDatabase | null = null

const log = (...args: unknown[]) => console.log('DB Worker:', ...args)
const error = (...args: unknown[]) => console.error('DB Worker:', ...args)

const migrateDb = (db: OpfsDatabase) => {
  const getLegacyVersion = (): number => {
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

  const getVersion = (): number => {
    try {
      const result = db.exec({
        sql: 'PRAGMA user_version',
        returnValue: 'resultRows',
      })
      if (result && result.length > 0 && result[0] && result[0].length > 0) {
        return result[0][0] as number
      }
    } catch {
      return 0
    }
    return 0
  }

  let version = getVersion()

  if (version === 0) {
    const legacyVersion = getLegacyVersion()
    if (legacyVersion !== -1) {
      log('Legacy database found. Migrating version to PRAGMA user_version:', legacyVersion)
      version = legacyVersion
      db.exec(`PRAGMA user_version = ${version}`)
    } else {
      log('Initializing database with tables.sql...')
      db.exec(tablesSql)
      version = getLegacyVersion()
      log('Database initialized. Version:', version)
      db.exec(`PRAGMA user_version = ${version}`)
    }
  } else {
    log('Existing database found. Version:', version)
  }

  let incrementalVersion = version + 1
  while (upgrades.has(incrementalVersion)) {
    log(`Upgrading to version ${incrementalVersion}...`)
    const sql = upgrades.get(incrementalVersion)
    if (sql) {
      // Split SQL by semicolons and execute each statement individually
      const statements = sql
        .replace(/"/g, "'")
        .split('\n')
        .filter((stmt) => stmt.length > 0 && !stmt.startsWith('--'))
        .join('\n')
        .split(';')
        .map((stmt) => stmt.trim())
        .filter((stmt) => stmt.length > 0)

      db.transaction(() => {
        let successCount = 0
        let failCount = 0

        for (const statement of statements) {
          try {
            log(` (${incrementalVersion}) Executing statement: ${statement}...`)
            db.exec(statement)
            successCount++
          } catch (err: unknown) {
            failCount++
            log(
              `(${incrementalVersion}) Failed to execute statement (continuing): ${statement.substring(0, 50)}...`,
              err,
            )
          }
        }

        db.exec(`PRAGMA user_version = ${incrementalVersion}`)
        log(
          `Upgrade to version ${incrementalVersion} complete: ${successCount} succeeded, ${failCount} failed`,
        )
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

    db = new sqlite3.oo1.OpfsDb(dbPath, 'c')

    // initialize database
    db.exec(tablesSql)
    db.exec(`PRAGMA user_version = ${latestVersion}`)

    self.postMessage({ type: 'init', status: 'success' })
  } catch (err: unknown) {
    error('Initialization failed', err)
    self.postMessage({ type: 'init', status: 'error', error: err })
  }
}

const openDb = async () => {
  try {
    log('Opening SQLite...')
    const sqlite3 = await sqlite3InitModule({
      print: log,
      printErr: error,
    })

    log('Running SQLite3 version', sqlite3.version.libVersion)

    db = new sqlite3.oo1.OpfsDb(dbPath)
    migrateDb(db)

    self.postMessage({ type: 'open', status: 'success' })
  } catch (err: unknown) {
    error('Opening failed', err)
    self.postMessage({ type: 'open', status: 'error', error: err })
  }
}

self.onmessage = async (e) => {
  const { type, payload, id } = e.data

  if (type === 'init') {
    await initDb()
    return
  }

  if (type === 'open') {
    await openDb()
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
