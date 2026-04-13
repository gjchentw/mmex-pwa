import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import sqliteWasmUrl from '@sqlite.org/sqlite-wasm/sqlite3.wasm?url'
import tablesSql from '../../mmex/database/tables.sql?raw'

type QueryResultRow = Array<string | number | null>
type WorkerDatabase = {
  exec: (
    sql:
      | string
      | {
          sql: string
          bind?: unknown[]
          returnValue?: 'resultRows'
        },
  ) => QueryResultRow[]
  transaction: (callback: () => void) => void
  close: () => void
  /** Serialises the database to a Uint8Array (equivalent to sqlite3_serialize). */
  serialize: (schemaName?: string) => Uint8Array
}

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

let db: WorkerDatabase | null = null

const log = (...args: unknown[]) => console.log('DB Worker:', ...args)
const error = (...args: unknown[]) => console.error('DB Worker:', ...args)

const getSqliteInitOptions = () => ({
  print: log,
  printErr: error,
  locateFile: (file: string, prefix: string) => {
    if (file === 'sqlite3.wasm') {
      return sqliteWasmUrl
    }
    return prefix + file
  },
})

const migrateDb = (db: WorkerDatabase) => {
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
      ...getSqliteInitOptions(),
    })

    log('Running SQLite3 version', sqlite3.version.libVersion)

    const sqliteDb = new sqlite3.oo1.OpfsDb(dbPath, 'c') as unknown as WorkerDatabase
    db = sqliteDb
    migrateDb(sqliteDb)

    self.postMessage({ type: 'init', status: 'success' })
  } catch (err: unknown) {
    error('Initialization failed', err)
    self.postMessage({
      type: 'init',
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

const openDb = async (importId?: string) => {
  try {
    log('Opening SQLite...')
    const sqlite3 = await sqlite3InitModule({
      ...getSqliteInitOptions(),
    })

    log('Running SQLite3 version', sqlite3.version.libVersion)

    const sqliteDb = new sqlite3.oo1.OpfsDb(dbPath) as unknown as WorkerDatabase
    db = sqliteDb
    migrateDb(sqliteDb)

    if (importId !== undefined) {
      // Respond to the 'import' caller with the import request id
      self.postMessage({ id: importId, type: 'import', status: 'success' })
    } else {
      self.postMessage({ type: 'open', status: 'success' })
    }
  } catch (err: unknown) {
    error('Opening failed', err)
    if (importId !== undefined) {
      self.postMessage({
        id: importId,
        type: 'import',
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      })
    } else {
      self.postMessage({
        type: 'open',
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
}

/** Writes an ArrayBuffer to a file in the Origin Private File System. */
const writeToOpfs = async (path: string, data: ArrayBuffer): Promise<void> => {
  const parts = path.replace(/^\//, '').split('/')
  let dir = await navigator.storage.getDirectory()
  for (let i = 0; i < parts.length - 1; i++) {
    dir = await dir.getDirectoryHandle(parts[i]!, { create: true })
  }
  const filename = parts[parts.length - 1]!
  const fh = await dir.getFileHandle(filename, { create: true })
  const writable = await fh.createWritable()
  await writable.write(data)
  await writable.close()
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

  if (type === 'close') {
    if (db) {
      try {
        db.close()
      } catch (err) {
        error('Close failed', err)
      }
      db = null
    }
    self.postMessage({ type: 'close', status: 'success' })
    return
  }

  if (type === 'import') {
    // Close current DB, write new content to OPFS, then reopen
    if (db) {
      try {
        db.close()
      } catch (err) {
        error('Close before import failed', err)
      }
      db = null
    }
    try {
      await writeToOpfs(dbPath, payload.data as ArrayBuffer)
      await openDb(id)
    } catch (err: unknown) {
      error('Import failed', err)
      self.postMessage({
        id,
        type: 'import',
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      })
    }
    return
  }

  if (type === 'export') {
    if (!db) {
      self.postMessage({ id, type: 'export', status: 'error', error: 'Database not initialized' })
      return
    }
    try {
      // Use SQLite's own serialize so we get the complete in-memory state,
      // avoiding any OPFS SAH concurrency issues with readFromOpfs().
      const bytes = db.serialize()
      const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
      self.postMessage(
        { id, type: 'export', status: 'success', result: data },
        { transfer: [data] },
      )
    } catch (err: unknown) {
      error('Export failed', err)
      self.postMessage({
        id,
        type: 'export',
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      })
    }
    return
  }

  if (!db) {
    self.postMessage({ id, type, status: 'error', error: 'Database not initialized' })
    return
  }

  try {
    switch (type) {
      case 'exec': {
        const result = db.exec({
          sql: payload.sql,
          bind: payload.bind,
          returnValue: 'resultRows',
        })
        self.postMessage({ id, type, status: 'success', result })
        break
      }
      case 'exec-transaction': {
        const { statements } = payload as { statements: Array<{ sql: string; bind?: unknown[] }> }
        let executed = 0
        db.transaction(() => {
          for (const stmt of statements) {
            db!.exec({ sql: stmt.sql, bind: stmt.bind })
            executed++
          }
        })
        self.postMessage({ id, type, status: 'success', result: { executed } })
        break
      }
      default:
        self.postMessage({ id, type, status: 'error', error: `Unknown message type: ${type}` })
    }
  } catch (err: unknown) {
    error('Query failed', err)
    self.postMessage({
      id,
      type,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
