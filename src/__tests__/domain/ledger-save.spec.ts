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
import { setDomainDb } from '../../domain/db'
import {
  LedgerConfirmationRequired,
  LedgerLockedError,
  LedgerValidationError,
  ledgerRepo,
} from '../../domain/repos/ledger'
import type { TransactionDraft } from '../../domain/rules/ledger-entry'
import { accountRow, makeLedgerFake, transactionRow, type LedgerFake } from './ledger-fake'

/**
 * Spec: transaction-ledger (delta: desktop fidelity) — Transaction Save
 * Operation, Transaction Entry Validation, Transaction Entry Confirmations,
 * Statement Lock Enforcement, Ledger Extension Hooks, Split Transactions.
 * Desktop: transdialog.cpp OnOk, Model_Checking::save.
 */

let fake: LedgerFake

beforeEach(() => {
  fake = makeLedgerFake()
  // Most cases are about the transaction itself; the payee default has its own tests.
  fake.fixture.settings.set('TRANSACTION_CATEGORY_NONE', '0')
  setDomainDb(fake.db)
})
afterEach(() => setDomainDb())

const now = new Date(Date.UTC(2026, 9, 5, 12, 0, 0))
const stamp = '2026-10-05T12:00:00'

const draft = (extra: Partial<TransactionDraft> = {}): TransactionDraft => ({
  accountId: 10,
  type: 'Withdrawal',
  date: '2026-08-09',
  amount: 80,
  payeeId: 5,
  categoryId: 3,
  ...extra,
})

const NEW_ROW = '(SELECT MAX(TRANSID) FROM CHECKINGACCOUNT_V1)'
const NEW_SPLIT = '(SELECT MAX(SPLITTRANSID) FROM SPLITTRANSACTIONS_V1)'

describe('saving a new transaction', () => {
  // Transaction Entry Validation: nothing is written on a refusal.
  it('refuses an invalid draft and writes nothing', async () => {
    const refusal = await ledgerRepo
      .saveTransaction(draft({ amount: -1, payeeId: null }), { now })
      .catch((error: unknown) => error)
    expect(refusal).toBeInstanceOf(LedgerValidationError)
    expect((refusal as LedgerValidationError).refusals).toEqual([
      { field: 'amount', reason: 'negative' },
      { field: 'payee', reason: 'missing' },
    ])
    expect(fake.batches).toHaveLength(0)
  })

  // Transaction Entry Confirmations: every condition is reported, nothing is
  // written until each is acknowledged.
  it('stops for unacknowledged conditions and proceeds once they are acknowledged', async () => {
    fake.fixture.accounts[0] = accountRow(10, {
      INITIALBAL: 100,
      STATEMENTLOCKED: 1,
      STATEMENTDATE: '2026-08-31',
      MINIMUMBALANCE: 50,
    })

    const stopped = await ledgerRepo
      .saveTransaction(draft(), { now })
      .catch((error: unknown) => error)
    expect(stopped).toBeInstanceOf(LedgerConfirmationRequired)
    expect((stopped as LedgerConfirmationRequired).conditions).toEqual([
      'lockedPeriod',
      'accountLimit',
    ])
    expect((stopped as LedgerConfirmationRequired).statementDate).toBe('2026-08-31')
    expect(fake.batches).toHaveLength(0)

    const partly = await ledgerRepo
      .saveTransaction(draft(), { now, acknowledged: ['lockedPeriod'] })
      .catch((error: unknown) => error)
    expect((partly as LedgerConfirmationRequired).conditions).toEqual(['accountLimit'])
    expect(fake.batches).toHaveLength(0)

    await ledgerRepo.saveTransaction(draft(), {
      now,
      acknowledged: ['lockedPeriod', 'accountLimit'],
    })
    expect(fake.batches).toHaveLength(1)
  })

  // Scenario "A new transaction and its split tags are one operation" (design D3, R1).
  it('writes the row, each split followed by its tags, then the tags, in one batch', async () => {
    await ledgerRepo.saveTransaction(
      draft({
        categoryId: null,
        splits: [
          { CATEGID: 3, SPLITTRANSAMOUNT: 60, NOTES: null, tagIds: [7] },
          { CATEGID: 4, SPLITTRANSAMOUNT: 40, NOTES: 'b' },
        ],
        tagIds: [1, 2],
      }),
      { now },
    )

    expect(fake.batches).toHaveLength(1)
    const [insert, split1, split1Tag, split2, tag1, tag2] = fake.batches[0]!
    expect(fake.batches[0]).toHaveLength(6)

    expect(fake.flat(insert!)).toContain('INSERT INTO CHECKINGACCOUNT_V1')
    expect(fake.bound(insert!, 'LASTUPDATEDTIME')).toBe(stamp)
    expect(fake.bound(insert!, 'DELETEDTIME')).toBe('')
    expect(fake.bound(insert!, 'CATEGID')).toBe(-1)
    expect(fake.bound(insert!, 'TRANSAMOUNT')).toBe(100)
    expect(fake.bound(insert!, 'TOTRANSAMOUNT')).toBe(100)
    expect(fake.bound(insert!, 'TOACCOUNTID')).toBe(-1)
    expect(fake.bound(insert!, 'TRANSDATE')).toBe('2026-08-09T00:00:00')
    expect(insert!.bind!.some((value) => value === null || value === undefined)).toBe(false)

    expect(fake.flat(split1!)).toBe(
      `INSERT INTO SPLITTRANSACTIONS_V1 (TRANSID, CATEGID, SPLITTRANSAMOUNT, NOTES) VALUES (${NEW_ROW}, ?, ?, ?)`,
    )
    expect(split1!.bind).toEqual([3, 60, null])
    // The split's tag link follows its own row, while MAX(SPLITTRANSID) is that row's key.
    expect(fake.flat(split1Tag!)).toBe(
      `INSERT OR IGNORE INTO TAGLINK_V1 (REFTYPE, REFID, TAGID) VALUES (?, ${NEW_SPLIT}, ?)`,
    )
    expect(split1Tag!.bind).toEqual([REFTYPE.transactionSplit, 7])
    expect(split2!.bind).toEqual([4, 40, 'b'])
    expect(fake.flat(tag1!)).toBe(
      `INSERT OR IGNORE INTO TAGLINK_V1 (REFTYPE, REFID, TAGID) VALUES (?, ${NEW_ROW}, ?)`,
    )
    expect(tag1!.bind).toEqual([REFTYPE.transaction, 1])
    expect(tag2!.bind).toEqual([REFTYPE.transaction, 2])
  })

  it('reads the date-time preference for the time part', async () => {
    fake.fixture.settings.set('TRANSACTION_USE_DATE_TIME', 'TRUE')
    await ledgerRepo.saveTransaction(draft({ time: '13:45:10' }), { now })
    expect(fake.bound(fake.all()[0]!, 'TRANSDATE')).toBe('2026-08-09T13:45:10')
  })
})

describe('saving an existing transaction', () => {
  const update = () => fake.all().find((s) => fake.flat(s).startsWith('UPDATE CHECKINGACCOUNT_V1'))!
  const editing = (extra: Partial<TransactionDraft> = {}) => draft({ id: 1, ...extra })

  beforeEach(() => {
    fake.fixture.transactions = [transactionRow()]
  })

  // Scenario "A save that changes nothing does not stamp" (design D4).
  it('does not stamp a save that changes nothing', async () => {
    await ledgerRepo.saveTransaction(editing(), { now })
    expect(fake.batches).toHaveLength(1)
    expect(fake.flat(update())).not.toContain('LASTUPDATEDTIME')
    expect(update().bind!.slice(-1)[0]).toBe(1)
  })

  // Scenario "A change stamps".
  it('stamps a changed record', async () => {
    await ledgerRepo.saveTransaction(editing({ notes: 'changed' }), { now })
    expect(fake.bound(update(), 'LASTUPDATEDTIME')).toBe(stamp)
    expect(fake.bound(update(), 'NOTES')).toBe('changed')
  })

  // Ledger Extension Hooks: scenarios "Changing tags stamps the transaction"
  // and "Unchanged tags do not stamp".
  it('replaces the tag set and stamps only when it changed', async () => {
    fake.fixture.tagLinks = [{ REFTYPE: REFTYPE.transaction, REFID: 1, TAGID: 4 }]

    await ledgerRepo.saveTransaction(editing({ tagIds: [4] }), { now })
    expect(fake.flat(update())).not.toContain('LASTUPDATEDTIME')
    const sql = fake.sqlList()
    expect(sql).toContain('DELETE FROM TAGLINK_V1 WHERE REFTYPE = ? AND REFID = ?')
    expect(fake.all().slice(-1)[0]!.bind).toEqual([REFTYPE.transaction, 1, 4])

    fake.batches.length = 0
    await ledgerRepo.saveTransaction(editing({ tagIds: [4, 6] }), { now })
    expect(fake.bound(update(), 'LASTUPDATEDTIME')).toBe(stamp)
  })

  describe('with stored split lines', () => {
    const lines = [
      { CATEGID: 3, SPLITTRANSAMOUNT: 60, NOTES: null, tagIds: [7] },
      { CATEGID: 4, SPLITTRANSAMOUNT: 40, NOTES: null },
    ]
    const splitDraft = (splits = lines) => editing({ categoryId: null, splits })

    beforeEach(() => {
      fake.fixture.transactions = [
        transactionRow({ CATEGID: -1, TRANSAMOUNT: 100, TOTRANSAMOUNT: 100 }),
      ]
      fake.fixture.splits = [
        { SPLITTRANSID: 70, TRANSID: 1, CATEGID: 3, SPLITTRANSAMOUNT: 60, NOTES: null },
        { SPLITTRANSID: 71, TRANSID: 1, CATEGID: 4, SPLITTRANSAMOUNT: 40, NOTES: null },
      ]
      fake.fixture.tagLinks = [{ REFTYPE: REFTYPE.transactionSplit, REFID: 70, TAGID: 7 }]
    })

    // Scenarios "Unchanged splits do not stamp" and "Split tags survive an
    // edit"; design D6 — desktop's stamp for tagged splits is not reproduced.
    it('does not stamp unchanged split lines, tagged or not, and re-attaches their tags', async () => {
      await ledgerRepo.saveTransaction(splitDraft(), { now })
      expect(fake.flat(update())).not.toContain('LASTUPDATEDTIME')
      const sql = fake.sqlList()
      expect(sql).toContain(
        'DELETE FROM TAGLINK_V1 WHERE REFTYPE = ? AND REFID IN (SELECT SPLITTRANSID FROM SPLITTRANSACTIONS_V1 WHERE TRANSID = ?)',
      )
      const splitTag = fake.all().find((s) => fake.flat(s).includes(NEW_SPLIT))!
      expect(splitTag.bind).toEqual([REFTYPE.transactionSplit, 7])
    })

    it('stamps a changed split amount', async () => {
      await ledgerRepo.saveTransaction(
        splitDraft([{ ...lines[0]!, SPLITTRANSAMOUNT: 70 }, lines[1]!]),
        { now },
      )
      expect(fake.bound(update(), 'LASTUPDATEDTIME')).toBe(stamp)
      expect(fake.bound(update(), 'TRANSAMOUNT')).toBe(110)
    })

    it('stamps a changed split tag set', async () => {
      await ledgerRepo.saveTransaction(splitDraft([lines[0]!, { ...lines[1]!, tagIds: [8] }]), {
        now,
      })
      expect(fake.bound(update(), 'LASTUPDATEDTIME')).toBe(stamp)
    })
  })

  // Statement Lock Enforcement: a locked stored row is read-only.
  it('refuses a stored row inside its account locked period, naming the lock date', async () => {
    fake.fixture.accounts[0] = accountRow(10, { STATEMENTLOCKED: 1, STATEMENTDATE: '2026-08-31' })

    const refusal = await ledgerRepo
      .saveTransaction(editing({ notes: 'x', date: '2026-09-15' }), {
        now,
        acknowledged: ['lockedPeriod'],
      })
      .catch((error: unknown) => error)
    expect(refusal).toBeInstanceOf(LedgerLockedError)
    expect((refusal as LedgerLockedError).transactionIds).toEqual([1])
    expect((refusal as LedgerLockedError).statementDate).toBe('2026-08-31')
    expect(fake.batches).toHaveLength(0)
  })

  // Scenario "The destination account's lock does not apply".
  it('accepts an edit of a transfer whose destination account is locked', async () => {
    fake.fixture.accounts[1] = accountRow(20, { STATEMENTLOCKED: 1, STATEMENTDATE: '2026-12-31' })
    fake.fixture.transactions = [
      transactionRow({ TRANSCODE: 'Transfer', TOACCOUNTID: 20, PAYEEID: -1 }),
    ]
    await ledgerRepo.saveTransaction(
      editing({ type: 'Transfer', toAccountId: 20, payeeId: null, notes: 'x' }),
      { now },
    )
    expect(fake.batches).toHaveLength(1)
  })

  // Model_Checking::save stamps only while the row is outside the trash.
  it('does not stamp a row that is in the trash', async () => {
    fake.fixture.transactions = [transactionRow({ DELETEDTIME: '2026-09-01T00:00:00' })]
    await ledgerRepo.saveTransaction(editing({ notes: 'changed' }), { now })
    expect(fake.flat(update())).not.toContain('LASTUPDATEDTIME')
  })

  it('refuses a stored linked transaction', async () => {
    fake.fixture.transactions = [transactionRow({ TOACCOUNTID: 32701 })]
    const refusal = await ledgerRepo.saveTransaction(editing(), { now }).catch((e: unknown) => e)
    expect((refusal as LedgerValidationError).refusals).toEqual([
      { field: 'transaction', reason: 'linked' },
    ])
    expect(fake.batches).toHaveLength(0)
  })

  it('fails for a transaction that does not exist', async () => {
    await expect(ledgerRepo.saveTransaction(draft({ id: 99 }), { now })).rejects.toThrow(
      /not found/,
    )
  })
})

// Transaction Save Operation, scenario "Last used updates the payee"
// (transdialog.cpp ValidateData; transaction-taxonomy, Payee Records).
describe('the payee default under the Last used mode', () => {
  const payeeUpdate = () => fake.all().find((s) => fake.flat(s).startsWith('UPDATE PAYEE_V1'))

  beforeEach(() => {
    // An absent key is desktop's default, Last used.
    fake.fixture.settings.delete('TRANSACTION_CATEGORY_NONE')
  })

  it('sets the payee default to the saved category in the same batch', async () => {
    await ledgerRepo.saveTransaction(draft(), { now })
    expect(fake.batches).toHaveLength(1)
    expect(fake.flat(payeeUpdate()!)).toBe('UPDATE PAYEE_V1 SET CATEGID = ? WHERE PAYEEID = ?')
    expect(payeeUpdate()!.bind).toEqual([3, 5])
  })

  it('writes -1 for a split transaction', async () => {
    await ledgerRepo.saveTransaction(
      draft({
        categoryId: null,
        splits: [
          { CATEGID: 3, SPLITTRANSAMOUNT: 60, NOTES: null },
          { CATEGID: 4, SPLITTRANSAMOUNT: 40, NOTES: null },
        ],
      }),
      { now },
    )
    expect(payeeUpdate()!.bind).toEqual([-1, 5])
  })

  it('leaves the payee alone for a hidden category, a transfer, or another mode', async () => {
    await ledgerRepo.saveTransaction(draft({ categoryId: 9 }), { now })
    expect(payeeUpdate()).toBeUndefined()

    await ledgerRepo.saveTransaction(draft({ type: 'Transfer', toAccountId: 20, payeeId: null }), {
      now,
    })
    expect(payeeUpdate()).toBeUndefined()

    fake.fixture.settings.set('TRANSACTION_CATEGORY_NONE', '3')
    await ledgerRepo.saveTransaction(draft(), { now })
    expect(payeeUpdate()).toBeUndefined()
  })
})
