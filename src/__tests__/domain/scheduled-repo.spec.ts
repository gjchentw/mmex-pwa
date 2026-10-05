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

import { REFTYPE } from '../../domain/conventions'
import { setDomainDb, type DomainDb, type SqlStatement } from '../../domain/db'
import { accountRepo } from '../../domain/repos/account'
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

  // transaction-ledger (delta: desktop fidelity), Schema Fidelity and
  // Transaction Types: the materialized row carries desktop's values, never NULL.
  it('writes an empty deletion time and no NULL sentinel on the materialized row', async () => {
    const [insert] = await scheduledRepo.materializeStatements(series(), '2026-08-09')
    const columns = /\(([^)]*)\) VALUES/.exec(insert!.sql)![1]!.split(', ')
    const value = (column: string) => insert!.bind![columns.indexOf(column)]
    expect(value('DELETEDTIME')).toBe('')
    expect(value('TOACCOUNTID')).toBe(-1)
    expect(value('TOTRANSAMOUNT')).toBe(100)
    expect(value('FOLLOWUPID')).toBe(-1)
    expect(value('NOTES')).toBe('')
    expect(insert!.bind!.some((bound) => bound === null || bound === undefined)).toBe(false)
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

const flat = (statement: SqlStatement): string => statement.sql.replace(/\s+/g, ' ')

/**
 * Spec: scheduled-transactions (delta), Requirement "Series Split Line
 * Replacement", scenarios "Series split tags survive an edit" and "Deleting a
 * series removes its split tag links" (design D8, defect C4).
 */
describe('replacing series split lines', () => {
  it('drops the old rows tag links and writes each row followed by its tags, with no stamp', () => {
    const statements = scheduledRepo.replaceSplitsStatements(1, [
      { CATEGID: 30, SPLITTRANSAMOUNT: 60, NOTES: null, tagIds: [5] },
      { CATEGID: 31, SPLITTRANSAMOUNT: 40, NOTES: null },
    ])

    const sql = statements.map(flat)
    expect(sql[0]).toBe(
      'DELETE FROM TAGLINK_V1 WHERE REFTYPE = ? AND REFID IN (SELECT SPLITTRANSID FROM BUDGETSPLITTRANSACTIONS_V1 WHERE TRANSID = ?)',
    )
    expect(statements[0]!.bind).toEqual([REFTYPE.recurringTransactionSplit, 1])
    expect(sql[1]).toBe('DELETE FROM BUDGETSPLITTRANSACTIONS_V1 WHERE TRANSID = ?')
    expect(sql[2]).toContain('INSERT INTO BUDGETSPLITTRANSACTIONS_V1')
    expect(sql[3]).toBe(
      'INSERT OR IGNORE INTO TAGLINK_V1 (REFTYPE, REFID, TAGID) VALUES (?, (SELECT MAX(SPLITTRANSID) FROM BUDGETSPLITTRANSACTIONS_V1), ?)',
    )
    expect(statements[3]!.bind).toEqual([REFTYPE.recurringTransactionSplit, 5])
    expect(sql[4]).toContain('INSERT INTO BUDGETSPLITTRANSACTIONS_V1')
    expect(sql).toHaveLength(5)
    expect(
      sql.some((s) => s.includes('CHECKINGACCOUNT_V1') || s.includes('BILLSDEPOSITS_V1')),
    ).toBe(false)
  })
})

describe('series split cleanup', () => {
  const splitLinkCleanup = (statements: readonly SqlStatement[], where: string) =>
    statements.some(
      (statement) =>
        flat(statement).startsWith('DELETE FROM TAGLINK_V1 WHERE REFTYPE = ? AND REFID IN') &&
        flat(statement).includes(`FROM BUDGETSPLITTRANSACTIONS_V1 WHERE TRANSID ${where}`) &&
        statement.bind?.[0] === REFTYPE.recurringTransactionSplit,
    )

  it('removes the split rows tag links with a series', () => {
    expect(splitLinkCleanup(scheduledRepo.removeStatements(1), '= ?')).toBe(true)
  })

  it('removes the split rows tag links with many series', async () => {
    const batches: SqlStatement[][] = []
    setDomainDb({
      async query<T>(): Promise<T[]> {
        return [] as T[]
      },
      async mutate(statements: SqlStatement[]): Promise<void> {
        batches.push(statements)
      },
    })

    await scheduledRepo.removeMany([1, 2])

    expect(splitLinkCleanup(batches[0]!, 'IN (?, ?)')).toBe(true)
  })

  it('removes the split rows tag links with an account series', async () => {
    setDomainDb({
      async query<T>(sql: string): Promise<T[]> {
        if (sql.includes('FROM BILLSDEPOSITS_V1')) return [{ BDID: 1 }] as T[]
        return [] as T[]
      },
      async mutate(): Promise<void> {},
    })

    const statements = await accountRepo.removeStatements(10)

    expect(splitLinkCleanup(statements, 'IN (?)')).toBe(true)
  })
})
