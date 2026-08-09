import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Repositories reach the database through the worker client, so the worker is
// stubbed here. The rule functions need no such stub -- that is the point of the
// rules/repos split (openspec: domain-data-access, Financial Rules As Pure
// Functions), and the other domain spec files import no worker at all.
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
import { ledgerRepo } from '../../domain/repos/ledger'
import { stockRepo } from '../../domain/repos/investment'
import { assetRepo } from '../../domain/repos/asset'
import { extensionCleanupStatements } from '../../domain/repos/extensions'
import { REFTYPE } from '../../domain/conventions'

/**
 * Spec: domain-data-access. These exercise the repositories against a fake
 * persistence surface, so no worker or database is involved.
 */

interface FakeDb extends DomainDb {
  batches: SqlStatement[][]
  rows: Map<string, unknown[]>
}

const makeFakeDb = (): FakeDb => {
  const batches: SqlStatement[][] = []
  const rows = new Map<string, unknown[]>()
  return {
    batches,
    rows,
    async query<T>(sql: string): Promise<T[]> {
      for (const [fragment, result] of rows) {
        if (sql.includes(fragment)) return result as T[]
      }
      return []
    },
    async mutate(statements: SqlStatement[]): Promise<void> {
      batches.push(statements)
    },
  }
}

let fake: FakeDb

beforeEach(() => {
  fake = makeFakeDb()
  setDomainDb(fake)
})

afterEach(() => {
  setDomainDb()
  vi.restoreAllMocks()
})

describe('polymorphic cleanup', () => {
  // Requirement (domain-data-conventions) "Application-Level Referential
  // Integrity", scenario "Delete leaves no dangling polymorphic rows".
  it('clears tag links, attachments and custom field values for a reference', () => {
    const statements = extensionCleanupStatements(REFTYPE.transaction, [1, 2])
    expect(statements).toHaveLength(3)
    expect(statements[0]!.sql).toContain('TAGLINK_V1')
    expect(statements[1]!.sql).toContain('ATTACHMENT_V1')
    expect(statements[2]!.sql).toContain('CUSTOMFIELDDATA_V1')
    // Nothing may add a schema-level constraint to accomplish this.
    for (const statement of statements) {
      expect(statement.sql).not.toMatch(/FOREIGN KEY|TRIGGER/i)
    }
  })

  it('emits nothing when there is nothing to clean up', () => {
    expect(extensionCleanupStatements(REFTYPE.transaction, [])).toEqual([])
  })
})

describe('ledger repository', () => {
  // Requirement "Atomic Multi-Table Operations", scenario "A failed cascade
  // leaves no partial state" -- the cascade must reach the client as one batch.
  it('hard-deletes a transaction and everything hanging off it in one batch', async () => {
    fake.rows.set('SELECT SPLITTRANSID', [{ SPLITTRANSID: 55 }])

    await ledgerRepo.hardDelete([10])

    expect(fake.batches).toHaveLength(1)
    const batch = fake.batches[0]!
    const tables = batch.map((statement) => statement.sql)
    expect(tables.some((sql) => sql.includes('SPLITTRANSACTIONS_V1'))).toBe(true)
    expect(tables.some((sql) => sql.includes('SHAREINFO_V1'))).toBe(true)
    expect(tables.some((sql) => sql.includes('TRANSLINK_V1'))).toBe(true)
    expect(tables.some((sql) => sql.includes('CHECKINGACCOUNT_V1'))).toBe(true)
    // The split's own tag links are cleaned up under the split reference type.
    expect(batch.some((statement) => statement.bind?.includes(REFTYPE.transactionSplit))).toBe(true)
    // The parent row goes last, after everything that references it.
    expect(tables.at(-1)).toContain('DELETE FROM CHECKINGACCOUNT_V1')
  })

  // Spec: transaction-ledger, requirement "Soft Delete, Trash, and Retention".
  it('trashes rather than deletes while a retention window applies', async () => {
    fake.rows.set('SELECT SETTINGVALUE', [{ SETTINGVALUE: '30' }])

    await ledgerRepo.remove([10], new Date(Date.UTC(2026, 7, 9, 12, 0, 0)))

    expect(fake.batches).toHaveLength(1)
    const [statement] = fake.batches[0]!
    expect(statement!.sql).toContain('SET DELETEDTIME = ?')
    expect(statement!.bind?.[0]).toBe('2026-08-09T12:00:00')
  })

  it('deletes outright when retention is zero', async () => {
    fake.rows.set('SELECT SETTINGVALUE', [{ SETTINGVALUE: '0' }])

    await ledgerRepo.remove([10])

    const sql = fake.batches[0]!.map((statement) => statement.sql).join('\n')
    expect(sql).toContain('DELETE FROM CHECKINGACCOUNT_V1')
    expect(sql).not.toContain('SET DELETEDTIME')
  })

  // Requirement "Split Transactions", scenario "Split sum is validated".
  it('refuses split lines that do not sum to the transaction amount', () => {
    expect(() =>
      ledgerRepo.replaceSplitsStatements({ TRANSID: 1, TRANSAMOUNT: 100 }, [
        { CATEGID: 1, SPLITTRANSAMOUNT: 60, NOTES: null },
        { CATEGID: 2, SPLITTRANSAMOUNT: 30, NOTES: null },
      ]),
    ).toThrow(/sum/i)
  })

  // Spec: transaction-ledger, requirement "Statement Lock Enforcement".
  it('refuses to edit a row frozen by its account statement', async () => {
    fake.rows.set('FROM ACCOUNTLIST_V1', [{ STATEMENTLOCKED: 1, STATEMENTDATE: '2026-06-30' }])

    await expect(
      ledgerRepo.assertEditable({
        TRANSID: 1,
        ACCOUNTID: 10,
        TRANSDATE: '2026-06-01',
      } as never),
    ).rejects.toThrow(/locked/i)
  })
})

describe('derived cache write-back', () => {
  // Requirement "Derived Cache Write-Back Discipline", scenario "Cache
  // write-back rides with its trigger".
  it('produces an UPDATE persisting the recomputed stock position', async () => {
    fake.rows.set('FROM STOCK_V1 WHERE STOCKID', [
      { STOCKID: 1, NUMSHARES: 0, VALUE: 0, CURRENTPRICE: 12, COMMISSION: 0, PURCHASEDATE: null },
    ])
    fake.rows.set('FROM TRANSLINK_V1 l', [
      {
        TRANSID: 5,
        TRANSDATE: '2026-01-01T00:00:00',
        STATUS: '',
        DELETEDTIME: null,
        SHARENUMBER: 10,
        SHAREPRICE: 5,
        SHARECOMMISSION: 1,
      },
    ])

    const statements = await stockRepo.recomputeStatements(1, new Date(2026, 7, 9))

    expect(statements).toHaveLength(1)
    expect(statements[0]!.sql).toContain('UPDATE STOCK_V1')
    // 10 shares at 5 plus 1 commission: the book cost desktop will read back.
    expect(statements[0]!.bind).toContain(51)
    expect(statements[0]!.bind).toContain(10)
  })

  it('produces an UPDATE persisting the recomputed asset value', async () => {
    fake.rows.set('FROM ASSETS_V1 WHERE ASSETID', [
      { ASSETID: 1, STARTDATE: '2026-01-01', VALUE: 0, VALUECHANGE: 'None', VALUECHANGERATE: 0 },
    ])
    fake.rows.set('FROM TRANSLINK_V1 l', [
      {
        ACCOUNTID: 10,
        TOACCOUNTID: null,
        TRANSCODE: 'Withdrawal',
        TRANSAMOUNT: 1000,
        TOTRANSAMOUNT: null,
        STATUS: '',
        DELETEDTIME: null,
        TRANSDATE: '2026-01-01T00:00:00',
        CURRENCYID: -1,
      },
    ])

    const statements = await assetRepo.recomputeStatements(1)

    expect(statements).toHaveLength(1)
    expect(statements[0]!.sql).toContain('UPDATE ASSETS_V1')
    expect(statements[0]!.bind).toContain(1000)
  })

  it('emits nothing for an asset with no linked transactions', async () => {
    fake.rows.set('FROM ASSETS_V1 WHERE ASSETID', [{ ASSETID: 1, VALUE: 500 }])
    expect(await assetRepo.recomputeStatements(1)).toEqual([])
  })
})
