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

import { LINKTYPE } from '../../domain/conventions'
import { setDomainDb, type SqlStatement } from '../../domain/db'
import { LedgerLockedError, ledgerRepo } from '../../domain/repos/ledger'
import { stockRepo } from '../../domain/repos/investment'
import { accountRow, makeLedgerFake, transactionRow, type LedgerFake } from './ledger-fake'

/**
 * Spec: transaction-ledger (delta: desktop fidelity) — Transaction Status
 * Lifecycle, Soft Delete, Trash, and Retention, Statement Lock Enforcement,
 * Schema Fidelity (the empty deletion time). Desktop: mmchecking_list.cpp
 * onMarkTransaction, onDeleteTransaction, onRestoreTransaction; mmframe.cpp
 * autocleanDeletedTransactions; Model_Translink::RemoveTranslinkEntry.
 */

let fake: LedgerFake

const now = new Date(Date.UTC(2026, 9, 5, 12, 0, 0))
const stamp = '2026-10-05T12:00:00'

/** Account 10 is locked through June; rows 1 and 2 are after the lock, row 3 inside it. */
beforeEach(() => {
  fake = makeLedgerFake()
  fake.fixture.accounts[0] = accountRow(10, { STATEMENTLOCKED: 1, STATEMENTDATE: '2026-06-30' })
  fake.fixture.transactions = [
    transactionRow({ TRANSID: 1, TRANSDATE: '2026-08-09T00:00:00', STATUS: '' }),
    transactionRow({ TRANSID: 2, TRANSDATE: '2026-08-10T00:00:00', STATUS: 'R' }),
    transactionRow({ TRANSID: 3, TRANSDATE: '2026-06-01T00:00:00', STATUS: '' }),
  ]
  setDomainDb(fake.db)
})
afterEach(() => setDomainDb())

/** Transaction 1 is the only buy of stock 7: ten shares at 5 plus 1 commission. */
const linkStock = (tradeExtra: Record<string, unknown> = {}) => {
  fake.fixture.stocks = [
    {
      STOCKID: 7,
      NUMSHARES: 10,
      VALUE: 51,
      CURRENTPRICE: 12,
      COMMISSION: 1,
      PURCHASEDATE: '2026-08-09',
    },
  ]
  fake.fixture.translinks = [{ CHECKINGACCOUNTID: 1, LINKTYPE: LINKTYPE.stock, LINKRECORDID: 7 }]
  fake.fixture.linked = [
    {
      LINKTYPE: LINKTYPE.stock,
      LINKRECORDID: 7,
      row: {
        TRANSID: 1,
        TRANSDATE: '2026-08-09T00:00:00',
        STATUS: '',
        DELETEDTIME: '',
        SHARENUMBER: 10,
        SHAREPRICE: 5,
        SHARECOMMISSION: 1,
        ...tradeExtra,
      },
    },
  ]
}

const stockUpdate = (): SqlStatement | undefined =>
  fake.all().find((statement) => fake.flat(statement).startsWith('UPDATE STOCK_V1'))
const lastSql = (): string => fake.sqlList().slice(-1)[0]!

describe('changing the status', () => {
  // Scenario "Locked rows are skipped when marking" (onMarkTransaction).
  it('changes what differs, stamps it, skips locked rows and leaves matching rows alone', async () => {
    const result = await ledgerRepo.setStatus([1, 2, 3], 'R', { now })

    expect(result).toEqual({ changed: [1], skippedLocked: [3] })
    expect(fake.batches).toHaveLength(1)
    const [statement] = fake.batches[0]!
    expect(fake.flat(statement!)).toBe(
      'UPDATE CHECKINGACCOUNT_V1 SET STATUS = ?, LASTUPDATEDTIME = ? WHERE TRANSID IN (?)',
    )
    expect(statement!.bind).toEqual(['R', stamp, 1])
  })

  it('accepts a display name and stores the key', async () => {
    await ledgerRepo.setStatus([1], 'Follow Up', { now })
    expect(fake.all()[0]!.bind).toEqual(['F', stamp, 1])
  })

  it('writes nothing when every row already has the status', async () => {
    expect(await ledgerRepo.setStatus([2], 'R', { now })).toEqual({
      changed: [],
      skippedLocked: [],
    })
    expect(fake.batches).toHaveLength(0)
  })

  // Scenario "Locked transaction cannot be deleted" applies to every stored-row operation.
  it('refuses when every row is locked, naming the lock date', async () => {
    const refusal = await ledgerRepo.setStatus([3], 'R', { now }).catch((e: unknown) => e)
    expect(refusal).toBeInstanceOf(LedgerLockedError)
    expect((refusal as LedgerLockedError).transactionIds).toEqual([3])
    expect((refusal as LedgerLockedError).statementDate).toBe('2026-06-30')
    expect(fake.batches).toHaveLength(0)
  })

  // investment-tracking, Position Fields Are Derived Caches: a void trade leaves the position.
  it('recomputes a linked position when a trade is voided', async () => {
    linkStock()
    await ledgerRepo.setStatus([1], 'V', { now })
    expect(fake.batches).toHaveLength(1)
    expect(fake.bound(stockUpdate()!, 'NUMSHARES')).toBe(0)
  })
})

describe('deleting', () => {
  beforeEach(() => {
    fake.fixture.settings.set('DELETED_TRANS_RETAIN_DAYS', '30')
  })

  // Scenario "Locked rows are skipped in a multi-row deletion".
  it('trashes the unlocked rows, reports the locked ones, and leaves decorations in place', async () => {
    const result = await ledgerRepo.remove([1, 2, 3], { now })

    expect(result).toEqual({ removed: [1, 2], skippedLocked: [3] })
    expect(fake.batches).toHaveLength(1)
    expect(fake.sqlList()).toEqual([
      'UPDATE CHECKINGACCOUNT_V1 SET DELETEDTIME = ? WHERE TRANSID IN (?, ?)',
    ])
    expect(fake.all()[0]!.bind).toEqual([stamp, 1, 2])
  })

  // Scenario "Locked transaction cannot be deleted".
  it('refuses when every row is locked', async () => {
    await expect(ledgerRepo.remove([3], { now })).rejects.toBeInstanceOf(LedgerLockedError)
    expect(fake.batches).toHaveLength(0)
  })

  // Scenario "Delete recomputes linked positions" (onDeleteTransaction updates the position).
  it('folds the linked position update into the same batch', async () => {
    linkStock()
    await ledgerRepo.remove([1], { now })

    expect(fake.batches).toHaveLength(1)
    expect(fake.sqlList()[0]).toContain('SET DELETEDTIME = ?')
    // The only buy is in the trash: no shares, no book cost.
    expect(fake.bound(stockUpdate()!, 'NUMSHARES')).toBe(0)
    expect(fake.bound(stockUpdate()!, 'VALUE')).toBe(0)
  })

  it('hard-deletes with the full cascade when the retention is zero', async () => {
    fake.fixture.settings.set('DELETED_TRANS_RETAIN_DAYS', '0')
    fake.fixture.splits = [
      { SPLITTRANSID: 70, TRANSID: 1, CATEGID: 3, SPLITTRANSAMOUNT: 80, NOTES: null },
    ]

    await ledgerRepo.remove([1], { now })

    const sql = fake.sqlList()
    expect(sql.some((s) => s.includes('SET DELETEDTIME'))).toBe(false)
    for (const table of [
      'TAGLINK_V1',
      'ATTACHMENT_V1',
      'SPLITTRANSACTIONS_V1',
      'SHAREINFO_V1',
      'TRANSLINK_V1',
    ]) {
      expect(sql.some((s) => s.startsWith(`DELETE FROM ${table}`))).toBe(true)
    }
    expect(lastSql()).toBe('DELETE FROM CHECKINGACCOUNT_V1 WHERE TRANSID IN (?)')
  })

  // "deleting a transaction that is already in the trash SHALL hard-delete it".
  it('hard-deletes a row that is already in the trash', async () => {
    fake.fixture.transactions[0] = transactionRow({
      TRANSID: 1,
      DELETEDTIME: '2026-09-01T00:00:00',
    })
    await ledgerRepo.remove([1], { now })
    expect(lastSql()).toBe('DELETE FROM CHECKINGACCOUNT_V1 WHERE TRANSID IN (?)')
  })
})

describe('restoring', () => {
  beforeEach(() => {
    fake.fixture.transactions = [
      transactionRow({ TRANSID: 1, DELETEDTIME: '2026-09-01T00:00:00' }),
      transactionRow({
        TRANSID: 3,
        TRANSDATE: '2026-06-01T00:00:00',
        DELETEDTIME: '2026-09-01T00:00:00',
      }),
    ]
  })

  // Scenarios "A live row stores an empty deletion time" and "A trashed row
  // inside the locked period is restorable" (onRestoreTransaction: Clear, no lock check).
  it('writes an empty deletion time, without a stamp and without a lock check', async () => {
    await ledgerRepo.restore([1, 3])

    expect(fake.sqlList()).toEqual([
      'UPDATE CHECKINGACCOUNT_V1 SET DELETEDTIME = ? WHERE TRANSID IN (?, ?)',
    ])
    expect(fake.all()[0]!.bind).toEqual(['', 1, 3])
  })

  // Scenario "Restore recomputes linked positions".
  it('folds the linked position update into the same batch', async () => {
    linkStock({ DELETEDTIME: '2026-09-01T00:00:00' })
    await ledgerRepo.restore([1], { now })

    expect(fake.batches).toHaveLength(1)
    expect(fake.bound(stockUpdate()!, 'NUMSHARES')).toBe(10)
    expect(fake.bound(stockUpdate()!, 'VALUE')).toBe(51)
  })
})

describe('permanent deletion and the retention purge', () => {
  beforeEach(() => {
    fake.fixture.settings.set('DELETED_TRANS_RETAIN_DAYS', '30')
    fake.fixture.transactions = [
      // Trashed exactly thirty days before `now`, to the second.
      transactionRow({ TRANSID: 1, DELETEDTIME: '2026-09-05T12:00:00' }),
      // One second inside the retention window.
      transactionRow({ TRANSID: 2, DELETEDTIME: '2026-09-05T12:00:01' }),
      // Trashed long ago, dated inside the account's locked period.
      transactionRow({
        TRANSID: 3,
        TRANSDATE: '2026-06-01T00:00:00',
        DELETEDTIME: '2026-07-01T00:00:00',
      }),
    ]
  })

  // The lock covers a permanent deletion by the user, in the trash too (onDeleteTransaction).
  it('skips a locked row when the user deletes permanently', async () => {
    const result = await ledgerRepo.purge([2, 3])
    expect(result).toEqual({ removed: [2], skippedLocked: [3] })
    expect(lastSql()).toBe('DELETE FROM CHECKINGACCOUNT_V1 WHERE TRANSID IN (?)')
    expect(fake.all().slice(-1)[0]!.bind).toEqual([2])
  })

  it('recomputes a linked position when the user deletes a trade permanently', async () => {
    linkStock({ DELETEDTIME: '2026-09-05T12:00:00' })
    fake.fixture.linked.push({
      LINKTYPE: LINKTYPE.stock,
      LINKRECORDID: 7,
      row: {
        TRANSID: 4,
        TRANSDATE: '2026-08-12T00:00:00',
        STATUS: '',
        DELETEDTIME: '',
        SHARENUMBER: 4,
        SHAREPRICE: 5,
        SHARECOMMISSION: 0,
      },
    })

    await ledgerRepo.purge([1], { now })

    expect(fake.batches).toHaveLength(1)
    expect(fake.bound(stockUpdate()!, 'NUMSHARES')).toBe(4)
    expect(fake.bound(stockUpdate()!, 'VALUE')).toBe(20)
  })

  // Scenario "The cutoff is the retention period"; the purge is not subject to the lock.
  it('purges rows at or before the cutoff, locked or not', async () => {
    const purged = await ledgerRepo.purgeExpired(now)

    expect(purged).toBe(2)
    expect(fake.batches).toHaveLength(1)
    expect(fake.all().slice(-1)[0]!.bind).toEqual([1, 3])
    const sql = fake.sqlList()
    expect(sql.some((s) => s.startsWith('DELETE FROM SHAREINFO_V1'))).toBe(true)
    expect(sql.some((s) => s.startsWith('DELETE FROM TRANSLINK_V1'))).toBe(true)
  })

  it('does nothing when no row has expired', async () => {
    expect(await ledgerRepo.purgeExpired(new Date(Date.UTC(2026, 5, 1)))).toBe(0)
    expect(fake.batches).toHaveLength(0)
  })

  // Desktop's UpdatePosition leaves the share count standing once no trade is
  // linked any more; with another trade left, the removed one simply drops out.
  it('recomputes a linked position without the purged trade', async () => {
    linkStock({ DELETEDTIME: '2026-09-05T12:00:00' })
    fake.fixture.linked.push({
      LINKTYPE: LINKTYPE.stock,
      LINKRECORDID: 7,
      row: {
        TRANSID: 4,
        TRANSDATE: '2026-08-12T00:00:00',
        STATUS: '',
        DELETEDTIME: '',
        SHARENUMBER: 4,
        SHAREPRICE: 5,
        SHARECOMMISSION: 0,
      },
    })

    await ledgerRepo.purgeExpired(now)

    expect(fake.bound(stockUpdate()!, 'NUMSHARES')).toBe(4)
    expect(fake.bound(stockUpdate()!, 'VALUE')).toBe(20)
  })
})

// Design D7: the owning repositories recompute over a post-state.
describe('position recomputation over a post-state', () => {
  it('reproduces the stored position without overrides', async () => {
    linkStock()
    const [statement] = await stockRepo.recomputeStatements(7, { now })
    expect(fake.bound(statement!, 'NUMSHARES')).toBe(10)
    expect(fake.bound(statement!, 'VALUE')).toBe(51)
  })

  it('applies a patched state and drops an absent row', async () => {
    linkStock()
    const trashed = await stockRepo.recomputeStatements(7, {
      now,
      overrides: new Map([[1, { DELETEDTIME: stamp }]]),
    })
    expect(fake.bound(trashed[0]!, 'NUMSHARES')).toBe(0)

    // With the only trade absent the list is empty, and the position's stored
    // share count stands, as in desktop (Model_Stock::UpdatePosition).
    const absent = await stockRepo.recomputeStatements(7, { now, overrides: new Map([[1, null]]) })
    expect(fake.bound(absent[0]!, 'NUMSHARES')).toBe(10)
  })
})
