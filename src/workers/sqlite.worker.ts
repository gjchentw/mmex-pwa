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

let sqlite3: Awaited<ReturnType<typeof sqlite3InitModule>> | null = null
let db: OpfsDatabase | null = null

const log = (...args: unknown[]) => console.log('DB Worker:', ...args)
const error = (...args: unknown[]) => console.error('DB Worker:', ...args)

const getVersion = (db: OpfsDatabase): number => {
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

const getLegacyVersion = (db: OpfsDatabase): number => {
  try {
    const result = db.exec({
      sql: "SELECT INFOVALUE FROM INFOTABLE_V1 WHERE INFONAME = 'DATAVERSION'",
      returnValue: 'resultRows',
    })
    if (result && result.length > 0 && result[0] && result[0].length > 0) {
      return parseInt(result[0][0] as string, 10)
    }
  } catch {
    return -1
  }
  return -1
}

const migrateDb = (db: OpfsDatabase): number => {
  let version = getVersion(db)

  if (version === 0) {
    const legacyVersion = getLegacyVersion(db)
    if (legacyVersion !== -1) {
      log('Legacy database found. Migrating version to PRAGMA user_version:', legacyVersion)
      version = legacyVersion
      db.exec(`PRAGMA user_version = ${version}`)
    } else {
      log('Initializing database with tables.sql...')
      db.exec(tablesSql)
      version = getLegacyVersion(db)
      log('Database initialized. Version:', version)
      db.exec(`PRAGMA user_version = ${version}`)
    }
  } else {
    log('Existing database found. Version:', version)
  }

  let lastVersion = version
  let incrementalVersion = version + 1
  while (upgrades.has(incrementalVersion)) {
    log(`Upgrading to version ${incrementalVersion}...`)
    const sql = upgrades.get(incrementalVersion)
    if (sql) {
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
            log(` (${incrementalVersion}) Executing statement: ${statement.substring(0, 60)}...`)
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
    lastVersion = incrementalVersion
    incrementalVersion++
  }

  log('Migration complete. Final version:', lastVersion)
  return lastVersion
}

const openOrCreate = async (): Promise<{ status: string; version: number }> => {
  log('Initializing SQLite...')
  sqlite3 = await sqlite3InitModule({
    print: log,
    printErr: error,
  })

  log('Running SQLite3 version', sqlite3.version.libVersion)

  try {
    log('Probing for existing database...')
    db = new sqlite3.oo1.OpfsDb(dbPath)
    log('Existing database found. Running migration...')
    const version = migrateDb(db)
    return { status: 'existing', version }
  } catch {
    log('No existing database found. Creating new one...')
    db = new sqlite3.oo1.OpfsDb(dbPath, 'c')
    db.exec(tablesSql)
    db.exec(`PRAGMA user_version = ${latestVersion}`)
    log('New database created. Version:', latestVersion)
    return { status: 'created', version: latestVersion }
  }
}

const deleteFromOpfs = async (path: string): Promise<void> => {
  // path is like '/.mmex/data.mmb'
  const parts = path.split('/').filter(Boolean)
  const filename = parts.pop()!
  let dirHandle = await navigator.storage.getDirectory()
  for (const part of parts) {
    dirHandle = await dirHandle.getDirectoryHandle(part)
  }
  await dirHandle.removeEntry(filename)
}

const destroyDb = async (): Promise<void> => {
  if (db) {
    db.close()
    db = null
  }
  try {
    await deleteFromOpfs(dbPath)
  } catch (err) {
    error('Failed to delete database file', err)
    throw new Error('Failed to delete database file')
  }
}

self.onmessage = async (e) => {
  const { type, payload, id } = e.data

  try {
    switch (type) {
      case 'open-or-create': {
        const result = await openOrCreate()
        self.postMessage({ id, type: 'open-or-create', status: 'success', result })
        break
      }

      case 'destroy': {
        await destroyDb()
        self.postMessage({ id, type: 'destroy', status: 'success' })
        break
      }

      case 'exec': {
        if (!db) {
          self.postMessage({ id, type, status: 'error', error: 'Database not initialized' })
          return
        }
        const result = db.exec({
          sql: payload.sql,
          bind: payload.bind,
          returnValue: 'resultRows',
        })
        self.postMessage({ id, type: 'exec', status: 'success', result })
        break
      }

      default:
        self.postMessage({ id, type, status: 'error', error: `Unknown message type: ${type}` })
    }
  } catch (err: unknown) {
    error('Worker error:', err)
    self.postMessage({
      id,
      type,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
