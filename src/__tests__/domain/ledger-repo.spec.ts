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
import { ledgerRepo } from '../../domain/repos/ledger'
import type { SplitRecord } from '../../domain/records'

/**
 * Spec: transaction-ledger (delta), Requirement "Split Transactions", scenarios
 * "Split tags survive an edit" and "Unchanged splits do not stamp". Desktop
 * replaces the rows too (Model_Splittransaction::update) and the dialog
 * re-attaches the tags; here both happen in one batch (design D8).
 */

const stored: SplitRecord[] = [
  { SPLITTRANSID: 70, TRANSID: 1, CATEGID: 1, SPLITTRANSAMOUNT: 60, NOTES: null },
  { SPLITTRANSID: 71, TRANSID: 1, CATEGID: 2, SPLITTRANSAMOUNT: 40, NOTES: 'b' },
]

const fakeDb: DomainDb = {
  async query<T>(sql: string): Promise<T[]> {
    if (sql.includes('FROM SPLITTRANSACTIONS_V1 WHERE TRANSID')) return stored as T[]
    return [] as T[]
  },
  async mutate(): Promise<void> {},
}

beforeEach(() => setDomainDb(fakeDb))
afterEach(() => setDomainDb())

const flat = (statement: SqlStatement): string => statement.sql.replace(/\s+/g, ' ')
const transaction = { TRANSID: 1, TRANSAMOUNT: 100 }
const now = new Date(Date.UTC(2026, 9, 2, 12, 0, 0))

describe('replacing a transaction split lines', () => {
  it('drops the old rows tag links, writes each row with its tags, and does not stamp an unchanged set', async () => {
    const statements = await ledgerRepo.replaceSplitsStatements(
      transaction,
      [
        { CATEGID: 1, SPLITTRANSAMOUNT: 60, NOTES: null, tagIds: [5, 6] },
        { CATEGID: 2, SPLITTRANSAMOUNT: 40, NOTES: 'b' },
      ],
      { now },
    )

    const sql = statements.map(flat)
    expect(sql[0]).toBe(
      'DELETE FROM TAGLINK_V1 WHERE REFTYPE = ? AND REFID IN (SELECT SPLITTRANSID FROM SPLITTRANSACTIONS_V1 WHERE TRANSID = ?)',
    )
    expect(statements[0]!.bind).toEqual([REFTYPE.transactionSplit, 1])
    expect(sql[1]).toBe('DELETE FROM SPLITTRANSACTIONS_V1 WHERE TRANSID = ?')
    expect(sql[2]).toContain('INSERT INTO SPLITTRANSACTIONS_V1')
    // Each tag link follows its own row, while MAX(SPLITTRANSID) is that row's key (design R3).
    expect(sql[3]).toBe(
      'INSERT OR IGNORE INTO TAGLINK_V1 (REFTYPE, REFID, TAGID) VALUES (?, (SELECT MAX(SPLITTRANSID) FROM SPLITTRANSACTIONS_V1), ?)',
    )
    expect(statements[3]!.bind).toEqual([REFTYPE.transactionSplit, 5])
    expect(statements[4]!.bind).toEqual([REFTYPE.transactionSplit, 6])
    expect(sql[5]).toContain('INSERT INTO SPLITTRANSACTIONS_V1')
    expect(sql).toHaveLength(6)
    expect(sql.some((s) => s.includes('LASTUPDATEDTIME'))).toBe(false)
  })

  // Model_Splittransaction::update 88-110: a different count, or a row with no
  // content-identical counterpart, stamps the transaction.
  it('stamps the transaction when the split set changed', async () => {
    const statements = await ledgerRepo.replaceSplitsStatements(
      transaction,
      [
        { CATEGID: 1, SPLITTRANSAMOUNT: 50, NOTES: null },
        { CATEGID: 2, SPLITTRANSAMOUNT: 50, NOTES: 'b' },
      ],
      { now },
    )

    const last = statements.at(-1)!
    expect(flat(last)).toBe('UPDATE CHECKINGACCOUNT_V1 SET LASTUPDATEDTIME = ? WHERE TRANSID = ?')
    expect(last.bind).toEqual(['2026-10-02T12:00:00', 1])
  })

  it('stamps when the count changes even if every remaining row matches', async () => {
    const statements = await ledgerRepo.replaceSplitsStatements(
      { TRANSID: 1, TRANSAMOUNT: 60 },
      [{ CATEGID: 1, SPLITTRANSAMOUNT: 60, NOTES: null }],
      { now },
    )
    expect(flat(statements.at(-1)!)).toContain('SET LASTUPDATEDTIME = ?')
  })

  // Scenario "Split sum is validated" still holds on the asynchronous builder.
  it('still refuses lines that do not sum to the amount', async () => {
    await expect(
      ledgerRepo.replaceSplitsStatements(transaction, [
        { CATEGID: 1, SPLITTRANSAMOUNT: 60, NOTES: null },
      ]),
    ).rejects.toThrow(/sum/i)
  })
})
