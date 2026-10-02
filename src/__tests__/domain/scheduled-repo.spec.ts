import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const { MockWorker } = vi.hoisted(() => {
  class MockWorker {
    postMessage = vi.fn()
    addEventListener = vi.fn()
    removeEventListener = vi.fn()
    terminate = vi.fn()
  }
  return { MockWorker }
})

vi.mock('../../workers/sqlite.worker?worker', () => ({ default: MockWorker }))

import { setDomainDb, type DomainDb, type SqlStatement } from '../../domain/db'
import { scheduledRepo } from '../../domain/repos/scheduled'
import type { ScheduledRecord, ScheduledSplitRecord } from '../../domain/records'

/**
 * Spec: scheduled-transactions, Requirement "Series Advancement on Execute or
 * Skip", scenario "Every split line lands on the new transaction".
 *
 * The SQLite WebAssembly build the application ships cannot be initialized
 * under Node (its browser entry throws outside a browser), so these tests
 * assert the statement batch the repository emits. The property that matters
 * is that no split insert depends on `last_insert_rowid()` after another
 * insert has run, which is exactly what attached the second split to the
 * wrong row.
 */

const series = (overrides: Partial<ScheduledRecord> = {}): ScheduledRecord => ({
  BDID: 1,
  ACCOUNTID: 10,
  TOACCOUNTID: null,
  PAYEEID: 5,
  TRANSCODE: 'Withdrawal',
  TRANSAMOUNT: 100,
  STATUS: '',
  TRANSACTIONNUMBER: null,
  NOTES: null,
  CATEGID: 3,
  TRANSDATE: '2026-08-09T00:00:00',
  FOLLOWUPID: null,
  TOTRANSAMOUNT: null,
  REPEATS: 1,
  NEXTOCCURRENCEDATE: '2026-08-09T00:00:00',
  NUMOCCURRENCES: -1,
  COLOR: -1,
  ...overrides,
})

const split = (id: number, categoryId: number, amount: number): ScheduledSplitRecord => ({
  SPLITTRANSID: id,
  TRANSID: 1,
  CATEGID: categoryId,
  SPLITTRANSAMOUNT: amount,
  NOTES: null,
})

const makeFakeDb = (splits: ScheduledSplitRecord[]) => {
  const batches: SqlStatement[][] = []
  const db: DomainDb = {
    async query<T>(sql: string): Promise<T[]> {
      if (sql.includes('FROM BUDGETSPLITTRANSACTIONS_V1')) return splits as T[]
      return [] as T[]
    },
    async mutate(statements: SqlStatement[]): Promise<void> {
      batches.push(statements)
    },
  }
  return { db, batches }
}

beforeEach(() => setDomainDb(makeFakeDb([split(1, 30, 60), split(2, 31, 40)]).db))
afterEach(() => setDomainDb())

describe('materializing a series with two split lines', () => {
  it('emits one transaction insert followed by one insert per split', async () => {
    const statements = await scheduledRepo.materializeStatements(series(), '2026-08-09')

    expect(statements).toHaveLength(3)
    expect(statements[0]!.sql).toContain('INSERT INTO CHECKINGACCOUNT_V1')
    expect(statements[1]!.sql).toContain('INSERT INTO SPLITTRANSACTIONS_V1')
    expect(statements[2]!.sql).toContain('INSERT INTO SPLITTRANSACTIONS_V1')
    expect(statements[1]!.bind).toEqual([30, 60, null])
    expect(statements[2]!.bind).toEqual([31, 40, null])
  })

  // After the first split is inserted, last_insert_rowid() is the split's own
  // key, so a second split using it would attach to the wrong row.
  it('never links a split through last_insert_rowid()', async () => {
    const statements = await scheduledRepo.materializeStatements(series(), '2026-08-09')

    for (const statement of statements.slice(1)) {
      expect(statement.sql).not.toContain('last_insert_rowid')
    }
  })

  // SQLite assigns a new INTEGER PRIMARY KEY as one more than the largest key
  // present, so within the same transaction MAX(TRANSID) is the key the
  // transaction insert just received (design D1).
  it('links every split to the transaction through the same key expression', async () => {
    const statements = await scheduledRepo.materializeStatements(series(), '2026-08-09')

    const keyExpression = '(SELECT MAX(TRANSID) FROM CHECKINGACCOUNT_V1)'
    for (const statement of statements.slice(1)) {
      expect(statement.sql.replace(/\s+/g, ' ')).toContain(keyExpression)
    }
  })
})
