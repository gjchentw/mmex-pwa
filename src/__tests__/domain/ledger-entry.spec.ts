import { describe, it, expect } from 'vitest'
import type { TransactionRecord } from '../../domain/records'
import {
  confirmationsFor,
  defaultStatusKey,
  defaultTransactionDate,
  normalizeTransaction,
  splitSetChanged,
  tagSetChanged,
  transactionChanged,
  validateTransaction,
  type EntryAccount,
  type NormalizedTransaction,
  type SaveContext,
  type TransactionDraft,
} from '../../domain/rules/ledger-entry'

/**
 * Spec: transaction-ledger (delta: desktop fidelity) — Transaction Entry
 * Validation, Transaction Entry Confirmations, Transaction Types, Split
 * Transactions, Schema Fidelity, Transaction Save Operation (the stamp
 * comparison), Transaction Entry Defaults. Pure rules; the repository tests
 * cover the statements built from them.
 */

const account = (extra: Partial<EntryAccount> = {}): EntryAccount => ({
  ACCOUNTID: 10,
  INITIALDATE: '2026-01-01',
  CURRENCYID: 1,
  STATEMENTLOCKED: 0,
  STATEMENTDATE: null,
  MINIMUMBALANCE: 0,
  CREDITLIMIT: 0,
  ...extra,
})

const context = (extra: Partial<SaveContext> = {}): SaveContext => ({
  account: account(),
  toAccount: null,
  stored: null,
  useDateTime: false,
  categoryIds: new Set([3, 4]),
  payeeIds: new Set([5]),
  ...extra,
})

const draft = (extra: Partial<TransactionDraft> = {}): TransactionDraft => ({
  accountId: 10,
  type: 'Withdrawal',
  date: '2026-08-09',
  amount: 80,
  payeeId: 5,
  categoryId: 3,
  ...extra,
})

const transfer = (extra: Partial<TransactionDraft> = {}): TransactionDraft =>
  draft({ type: 'Transfer', payeeId: null, toAccountId: 20, ...extra })

const transferContext = (extra: Partial<SaveContext> = {}): SaveContext =>
  context({ toAccount: account({ ACCOUNTID: 20 }), ...extra })

const stored = (extra: Partial<TransactionRecord> = {}): TransactionRecord => ({
  TRANSID: 1,
  ACCOUNTID: 10,
  TOACCOUNTID: -1,
  PAYEEID: 5,
  TRANSCODE: 'Withdrawal',
  TRANSAMOUNT: 80,
  STATUS: '',
  TRANSACTIONNUMBER: '',
  NOTES: '',
  CATEGID: 3,
  TRANSDATE: '2026-08-09T00:00:00',
  LASTUPDATEDTIME: '2026-08-09T01:00:00',
  DELETEDTIME: '',
  FOLLOWUPID: -1,
  TOTRANSAMOUNT: 80,
  COLOR: -1,
  ...extra,
})

const reasons = (d: TransactionDraft, c: SaveContext = context()) =>
  validateTransaction(d, c).map((r) => `${r.field}:${r.reason}`)

// transdialog.cpp ValidateData, in its order.
describe('entry validation', () => {
  it('accepts a complete withdrawal, and a zero amount', () => {
    expect(reasons(draft())).toEqual([])
    // Scenario "A zero amount is accepted": checkValue rejects only a negative.
    expect(reasons(draft({ type: 'Deposit', amount: 0 }))).toEqual([])
  })

  it('refuses a negative amount and a negative second amount', () => {
    expect(reasons(draft({ amount: -1 }))).toEqual(['amount:negative'])
    expect(reasons(transfer({ toAmount: -5 }), transferContext())).toEqual(['toAmount:negative'])
  })

  it('refuses a missing account', () => {
    expect(reasons(draft(), context({ account: null }))).toContain('account:missing')
  })

  // Scenario "A date before the opening date is refused".
  it('refuses a date before the opening date and accepts the opening date itself', () => {
    expect(reasons(draft({ date: '2025-12-31' }))).toEqual(['date:beforeAccountOpening'])
    expect(reasons(draft({ date: '2026-01-01' }))).toEqual([])
  })

  // Scenario "A category is required for a transfer too".
  it('requires an existing category when there are no splits, for every type', () => {
    expect(reasons(draft({ categoryId: null }))).toEqual(['category:missing'])
    expect(reasons(draft({ categoryId: -1 }))).toEqual(['category:missing'])
    expect(reasons(draft({ categoryId: 99 }))).toEqual(['category:missing'])
    expect(reasons(draft({ type: 'Deposit', categoryId: null }))).toEqual(['category:missing'])
    expect(reasons(transfer({ categoryId: null }), transferContext())).toEqual(['category:missing'])
  })

  it('requires an existing payee on a withdrawal or deposit, not on a transfer', () => {
    expect(reasons(draft({ payeeId: null }))).toEqual(['payee:missing'])
    expect(reasons(draft({ payeeId: 77 }))).toEqual(['payee:missing'])
    expect(reasons(transfer(), transferContext())).toEqual([])
  })

  // Scenario "A transfer to the same account is refused".
  it('requires a different, existing destination account on a transfer', () => {
    expect(reasons(transfer({ toAccountId: null }))).toEqual(['toAccount:missing'])
    expect(reasons(transfer({ toAccountId: 20 }), context({ toAccount: null }))).toEqual([
      'toAccount:missing',
    ])
    expect(
      reasons(transfer({ toAccountId: 10 }), context({ toAccount: account({ ACCOUNTID: 10 }) })),
    ).toEqual(['toAccount:sameAccount'])
  })

  it('refuses a date before the destination account opened', () => {
    expect(
      reasons(
        transfer(),
        transferContext({ toAccount: account({ ACCOUNTID: 20, INITIALDATE: '2026-09-01' }) }),
      ),
    ).toEqual(['date:beforeToAccountOpening'])
  })

  // Scenario "A transfer with splits is refused"; splittransactionsdialog.cpp OnOk.
  it('refuses split lines on a transfer, a line without a category, and a negative total', () => {
    const lines = [
      { CATEGID: 3, SPLITTRANSAMOUNT: 60, NOTES: null },
      { CATEGID: 4, SPLITTRANSAMOUNT: 40, NOTES: null },
    ]
    expect(reasons(transfer({ splits: lines }), transferContext())).toContain('splits:onTransfer')
    expect(
      reasons(
        draft({
          categoryId: null,
          splits: [lines[0]!, { CATEGID: -1, SPLITTRANSAMOUNT: 40, NOTES: null }],
        }),
      ),
    ).toEqual(['splits:lineWithoutCategory'])
    expect(
      reasons(
        draft({
          categoryId: null,
          splits: [
            { CATEGID: 3, SPLITTRANSAMOUNT: 10, NOTES: null },
            { CATEGID: 4, SPLITTRANSAMOUNT: -40, NOTES: null },
          ],
        }),
      ),
    ).toEqual(['splits:negativeTotal'])
    // A negative line is allowed while the total is not negative; no category is needed with splits.
    expect(
      reasons(
        draft({
          categoryId: null,
          splits: [
            { CATEGID: 3, SPLITTRANSAMOUNT: 100, NOTES: null },
            { CATEGID: 4, SPLITTRANSAMOUNT: -40, NOTES: null },
          ],
        }),
      ),
    ).toEqual([])
  })

  it('reports every refusal that applies, in desktop order', () => {
    expect(reasons(draft({ amount: -1, categoryId: null, payeeId: null }))).toEqual([
      'amount:negative',
      'category:missing',
      'payee:missing',
    ])
  })

  // Linked rows are edited through their position (investment-tracking, asset-tracking).
  it('refuses a stored linked transaction', () => {
    expect(reasons(draft({ id: 1 }), context({ stored: stored({ TOACCOUNTID: 32701 }) }))).toEqual([
      'transaction:linked',
    ])
  })
})

describe('normalization', () => {
  const normalized = (d: TransactionDraft, c: SaveContext = context()) =>
    normalizeTransaction(d, c).record

  // Scenario "A withdrawal stores desktop's unused-column values".
  it('stores -1 and the amount in the columns a withdrawal does not use', () => {
    expect(normalized(draft())).toMatchObject({
      ACCOUNTID: 10,
      TOACCOUNTID: -1,
      PAYEEID: 5,
      TRANSCODE: 'Withdrawal',
      TRANSAMOUNT: 80,
      TOTRANSAMOUNT: 80,
      CATEGID: 3,
      FOLLOWUPID: -1,
    })
  })

  it('keeps the TOACCOUNTID of a stored linked row', () => {
    expect(
      normalized(draft({ id: 1 }), context({ stored: stored({ TOACCOUNTID: 32702 }) })).TOACCOUNTID,
    ).toBe(32702)
  })

  // Scenario "A transfer stores no payee".
  it('stores no payee on a transfer and the second amount or the amount', () => {
    expect(normalized(transfer({ amount: 100, toAmount: 92 }), transferContext())).toMatchObject({
      PAYEEID: -1,
      TOACCOUNTID: 20,
      TRANSAMOUNT: 100,
      TOTRANSAMOUNT: 92,
    })
    expect(normalized(transfer({ amount: 100 }), transferContext()).TOTRANSAMOUNT).toBe(100)
    expect(normalized(transfer({ amount: 100, payeeId: 5 }), transferContext()).PAYEEID).toBe(-1)
  })

  // Scenario "A split transaction stores the sentinel category and the total".
  it('stores CATEGID -1 and the split total for two or more split lines', () => {
    const result = normalizeTransaction(
      draft({
        amount: 1,
        categoryId: 3,
        splits: [
          { CATEGID: 3, SPLITTRANSAMOUNT: 60, NOTES: null, tagIds: [7] },
          { CATEGID: 4, SPLITTRANSAMOUNT: 40, NOTES: 'b' },
        ],
      }),
      context(),
    )
    expect(result.record).toMatchObject({ CATEGID: -1, TRANSAMOUNT: 100, TOTRANSAMOUNT: 100 })
    expect(result.splits).toHaveLength(2)
    expect(result.splits[0]!.tagIds).toEqual([7])
  })

  // Scenario "One split line is a plain transaction".
  it('collapses a single split line into a plain transaction', () => {
    const result = normalizeTransaction(
      draft({
        amount: 1,
        categoryId: null,
        splits: [{ CATEGID: 4, SPLITTRANSAMOUNT: 60, NOTES: null }],
      }),
      context(),
    )
    expect(result.record).toMatchObject({ CATEGID: 4, TRANSAMOUNT: 60, TOTRANSAMOUNT: 60 })
    expect(result.splits).toEqual([])
  })

  it('clamps the colour to 1..7 or -1', () => {
    for (const color of [0, 8, -5, null, undefined]) {
      expect(normalized(draft({ color })).COLOR).toBe(-1)
    }
    expect(normalized(draft({ color: 3 })).COLOR).toBe(3)
  })

  // Scenario "The time part defaults to midnight".
  it('writes midnight unless the file keeps times', () => {
    expect(normalized(draft({ time: '13:45:10' })).TRANSDATE).toBe('2026-08-09T00:00:00')
    expect(normalized(draft({ time: '13:45:10' }), context({ useDateTime: true })).TRANSDATE).toBe(
      '2026-08-09T13:45:10',
    )
    expect(normalized(draft(), context({ useDateTime: true })).TRANSDATE).toBe(
      '2026-08-09T00:00:00',
    )
  })

  // Scenario "A live row stores an empty deletion time"; desktop writes '' for empty text.
  it('stores the status key, empty strings for empty text, and no null anywhere', () => {
    const record = normalized(draft({ status: 'Reconciled', notes: null, number: undefined }))
    expect(record.STATUS).toBe('R')
    expect(record.NOTES).toBe('')
    expect(record.TRANSACTIONNUMBER).toBe('')
    expect(record.DELETEDTIME).toBe('')
    expect(Object.values(record).some((value) => value === null || value === undefined)).toBe(false)
  })

  // Design R8: a row this application once wrote with NULLs gets desktop's values on its next save.
  it('replaces stored NULL sentinels with desktop values on the next save', () => {
    const legacy = stored({ PAYEEID: 5, TOACCOUNTID: null, TOTRANSAMOUNT: null, DELETEDTIME: null })
    expect(normalized(draft({ id: 1 }), context({ stored: legacy }))).toMatchObject({
      TOACCOUNTID: -1,
      TOTRANSAMOUNT: 80,
      DELETEDTIME: '',
    })
  })

  it('preserves the vestigial FOLLOWUPID of a stored row', () => {
    expect(
      normalized(draft({ id: 1 }), context({ stored: stored({ FOLLOWUPID: 42 }) })).FOLLOWUPID,
    ).toBe(42)
  })
})

describe('entry confirmations', () => {
  const locked = account({ STATEMENTLOCKED: 1, STATEMENTDATE: '2026-08-31' })

  // Scenario "A new transaction inside the locked period is confirmed, not refused".
  it('reports the locked period for a new or moved date on or before the lock date', () => {
    expect(confirmationsFor(draft(), context({ account: locked }), null)).toEqual(['lockedPeriod'])
    expect(
      confirmationsFor(draft({ id: 1, date: '2026-08-31' }), context({ account: locked }), null),
    ).toEqual(['lockedPeriod'])
    expect(
      confirmationsFor(draft({ date: '2026-09-01' }), context({ account: locked }), null),
    ).toEqual([])
    expect(confirmationsFor(draft(), context(), null)).toEqual([])
  })

  // transdialog.cpp: new or duplicate only, withdrawal or transfer, not void.
  it('reports the account limit for a new withdrawal or transfer that would breach it', () => {
    const limited = account({ MINIMUMBALANCE: 50 })
    expect(confirmationsFor(draft({ amount: 80 }), context({ account: limited }), 100)).toEqual([
      'accountLimit',
    ])
    expect(confirmationsFor(draft({ amount: 40 }), context({ account: limited }), 100)).toEqual([])
    expect(
      confirmationsFor(transfer({ amount: 80 }), transferContext({ account: limited }), 100),
    ).toEqual(['accountLimit'])
    const credit = account({ CREDITLIMIT: 500 })
    expect(confirmationsFor(draft({ amount: 700 }), context({ account: credit }), 100)).toEqual([
      'accountLimit',
    ])
  })

  // Scenario "An edit is not checked against the account limit".
  it('does not report the account limit for a deposit, a void row, or an edit', () => {
    const limited = account({ MINIMUMBALANCE: 50 })
    const c = context({ account: limited })
    expect(confirmationsFor(draft({ type: 'Deposit', amount: 80 }), c, 100)).toEqual([])
    expect(confirmationsFor(draft({ status: 'V', amount: 80 }), c, 100)).toEqual([])
    expect(confirmationsFor(draft({ id: 1, amount: 80 }), c, 100)).toEqual([])
    expect(confirmationsFor(draft({ amount: 80 }), context(), 100)).toEqual([])
  })

  // Scenario "A cross-currency transfer without a second amount is confirmed".
  it('reports different currencies only when no second amount is given', () => {
    const euro = account({ ACCOUNTID: 20, CURRENCYID: 2 })
    expect(confirmationsFor(transfer(), transferContext({ toAccount: euro }), null)).toEqual([
      'differentCurrencies',
    ])
    expect(
      confirmationsFor(transfer({ toAmount: 74 }), transferContext({ toAccount: euro }), null),
    ).toEqual([])
    expect(confirmationsFor(transfer(), transferContext(), null)).toEqual([])
  })
})

// Transaction Save Operation: the stamp moves only on a real change (design D4, R2).
describe('change detection', () => {
  const next = (extra: Partial<NormalizedTransaction> = {}): NormalizedTransaction => ({
    ACCOUNTID: 10,
    TOACCOUNTID: -1,
    PAYEEID: 5,
    TRANSCODE: 'Withdrawal',
    TRANSAMOUNT: 80,
    STATUS: '',
    TRANSACTIONNUMBER: '',
    NOTES: '',
    CATEGID: 3,
    TRANSDATE: '2026-08-09T00:00:00',
    DELETEDTIME: '',
    FOLLOWUPID: -1,
    TOTRANSAMOUNT: 80,
    COLOR: -1,
    ...extra,
  })

  it('sees no change in an identical record, whatever the stamp says', () => {
    expect(transactionChanged(stored(), next())).toBe(false)
    expect(transactionChanged(stored({ LASTUPDATEDTIME: null }), next())).toBe(false)
  })

  // Every column of the normalized record is compared: a column added later
  // fails here until it is considered.
  it('sees a change in each column alone', () => {
    const changes: { [K in keyof NormalizedTransaction]: NormalizedTransaction[K] } = {
      ACCOUNTID: 11,
      TOACCOUNTID: 20,
      PAYEEID: 6,
      TRANSCODE: 'Deposit',
      TRANSAMOUNT: 81,
      STATUS: 'R',
      TRANSACTIONNUMBER: '7',
      NOTES: 'changed',
      CATEGID: 4,
      TRANSDATE: '2026-08-10T00:00:00',
      DELETEDTIME: '2026-09-01T00:00:00',
      FOLLOWUPID: 2,
      TOTRANSAMOUNT: 81,
      COLOR: 2,
    }
    for (const key of Object.keys(next()) as (keyof NormalizedTransaction)[]) {
      expect(transactionChanged(stored(), next({ [key]: changes[key] })), key).toBe(true)
    }
    expect(Object.keys(changes).sort()).toEqual(Object.keys(next()).sort())
  })

  it('treats NULL and the empty string alike on text columns only', () => {
    expect(
      transactionChanged(
        stored({ NOTES: null, TRANSACTIONNUMBER: null, DELETEDTIME: null }),
        next(),
      ),
    ).toBe(false)
    expect(transactionChanged(stored({ TOACCOUNTID: null }), next())).toBe(true)
  })

  it('compares split lines as a set, tags included', () => {
    const lines = [
      { CATEGID: 3, SPLITTRANSAMOUNT: 60, NOTES: null, tagIds: [7] },
      { CATEGID: 4, SPLITTRANSAMOUNT: 40, NOTES: 'b', tagIds: [] },
    ]
    expect(splitSetChanged(lines, [lines[1]!, lines[0]!])).toBe(false)
    expect(splitSetChanged(lines, [{ ...lines[0]!, tagIds: [7, 8] }, lines[1]!])).toBe(true)
    expect(splitSetChanged(lines, [{ ...lines[0]!, tagIds: [] }, lines[1]!])).toBe(true)
    expect(splitSetChanged(lines, [{ ...lines[0]!, SPLITTRANSAMOUNT: 61 }, lines[1]!])).toBe(true)
    expect(splitSetChanged(lines, [lines[0]!])).toBe(true)
    expect(splitSetChanged(lines, [{ ...lines[0]!, NOTES: '' }, lines[1]!])).toBe(false)
  })

  it('compares tag ids as a set', () => {
    expect(tagSetChanged([1, 2], [2, 1])).toBe(false)
    expect(tagSetChanged([1, 2], [1])).toBe(true)
    expect(tagSetChanged([], [3])).toBe(true)
  })
})

// Transaction Entry Defaults: Model_Checking::getEmptyData.
describe('entry defaults', () => {
  const now = new Date(2026, 7, 20, 12, 0, 0)
  const rows = [
    stored({ TRANSID: 1, TRANSDATE: '2026-08-09T00:00:00' }),
    stored({ TRANSID: 2, TRANSDATE: '2026-08-15' }),
    stored({ TRANSID: 3, TRANSDATE: '2026-08-18T00:00:00', DELETEDTIME: '2026-08-19T00:00:00' }),
    stored({ TRANSID: 4, TRANSDATE: '2026-09-01T00:00:00' }),
  ]

  // Scenario "The default date is today unless the preference says last used".
  it('defaults the date to today, or to the latest live date not after now', () => {
    expect(defaultTransactionDate(0, rows, now)).toBe('2026-08-20')
    expect(defaultTransactionDate(1, rows, now)).toBe('2026-08-15')
  })

  // Scenario "A future-dated or trashed transaction does not set the default date".
  it('falls back to today when no live, non-future transaction exists', () => {
    expect(defaultTransactionDate(1, [rows[2]!, rows[3]!], now)).toBe('2026-08-20')
    expect(defaultTransactionDate(1, [], now)).toBe('2026-08-20')
  })

  // Scenario "The default status follows the preference".
  it('maps the status index to its key, falling back to unreconciled', () => {
    expect(defaultStatusKey(0)).toBe('')
    expect(defaultStatusKey(1)).toBe('R')
    expect(defaultStatusKey(2)).toBe('V')
    expect(defaultStatusKey(3)).toBe('F')
    expect(defaultStatusKey(4)).toBe('D')
    expect(defaultStatusKey(9)).toBe('')
  })
})
