import { describe, it, expect } from 'vitest'
import type { TransactionRecord } from '../../domain/records'
import {
  FOREIGN_SENTINEL,
  accountFlow,
  effectiveCategoryIds,
  isForeignAsTransfer,
  isForeignTransaction,
  isPurgeable,
  isStatementLocked,
  splitsBalance,
  statusKey,
  statusName,
} from '../../domain/rules/ledger'
import { accountBalance, reconciledBalance } from '../../domain/rules/account'

const transaction = (overrides: Partial<TransactionRecord> = {}): TransactionRecord => ({
  TRANSID: 1,
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
  LASTUPDATEDTIME: null,
  DELETEDTIME: null,
  FOLLOWUPID: null,
  TOTRANSAMOUNT: null,
  COLOR: -1,
  ...overrides,
})

// Spec: transaction-ledger.
describe('ledger rules', () => {
  // Requirement "Schema Fidelity for Ledger Tables", scenario "Status keys
  // round-trip" -- status persists as a single letter, but reading accepts the
  // display name too because imports carry both.
  describe('status keys', () => {
    it('persists single-letter keys', () => {
      expect(statusKey('R')).toBe('R')
      expect(statusKey('Reconciled')).toBe('R')
      expect(statusKey('V')).toBe('V')
      expect(statusKey('Follow Up')).toBe('F')
      expect(statusKey('D')).toBe('D')
      expect(statusKey('')).toBe('')
      expect(statusKey(null)).toBe('')
    })

    it('maps keys back to display names', () => {
      expect(statusName('R')).toBe('Reconciled')
      expect(statusName('')).toBe('Unreconciled')
    })
  })

  // Requirement "Account Flow and Balance Contribution".
  describe('account flow', () => {
    it('signs withdrawals and deposits against the owning account', () => {
      expect(accountFlow(transaction({ TRANSCODE: 'Withdrawal', TRANSAMOUNT: 100 }), 10)).toBe(-100)
      expect(accountFlow(transaction({ TRANSCODE: 'Deposit', TRANSAMOUNT: 100 }), 10)).toBe(100)
    })

    // Scenario "Cross-currency transfer uses both amounts".
    it('moves TRANSAMOUNT out of the source and TOTRANSAMOUNT into the destination', () => {
      const transfer = transaction({
        TRANSCODE: 'Transfer',
        ACCOUNTID: 10,
        TOACCOUNTID: 20,
        TRANSAMOUNT: 100,
        TOTRANSAMOUNT: 92,
      })
      expect(accountFlow(transfer, 10)).toBe(-100)
      expect(accountFlow(transfer, 20)).toBe(92)
      expect(accountFlow(transfer, 30)).toBe(0)
    })

    // Requirement "Transaction Status Lifecycle", scenario "Void removes
    // monetary effect".
    it('excludes void rows', () => {
      expect(accountFlow(transaction({ STATUS: 'V' }), 10)).toBe(0)
      expect(accountFlow(transaction({ STATUS: 'Void' }), 10)).toBe(0)
    })

    // Scenario "Deleted rows never aggregate".
    it('excludes soft-deleted rows', () => {
      expect(accountFlow(transaction({ DELETEDTIME: '2026-08-01T10:00:00' }), 10)).toBe(0)
    })

    // Requirement "Account Flow and Balance Contribution" -- a self-transfer is a
    // revaluation, not a movement.
    it('gives a self-transfer zero flow', () => {
      const revaluation = transaction({
        TRANSCODE: 'Transfer',
        ACCOUNTID: 10,
        TOACCOUNTID: 10,
        TRANSAMOUNT: 100,
        TOTRANSAMOUNT: 50_000,
      })
      expect(accountFlow(revaluation, 10)).toBe(0)
    })
  })

  // Spec: account-management, requirement "Account Balance Definition",
  // scenario "Balance is initial balance plus flows".
  it('computes a balance as the initial balance plus flows', () => {
    const account = { ACCOUNTID: 10, INITIALBAL: 100 }
    const rows = [
      transaction({ TRANSID: 1, TRANSCODE: 'Withdrawal', TRANSAMOUNT: 50 }),
      transaction({ TRANSID: 2, TRANSCODE: 'Deposit', TRANSAMOUNT: 20 }),
      transaction({ TRANSID: 3, TRANSCODE: 'Withdrawal', TRANSAMOUNT: 999, STATUS: 'V' }),
    ]
    expect(accountBalance(account, rows)).toBe(70)
  })

  // Requirement "Transaction Status Lifecycle", scenario "A stored display name
  // counts as its key": every reader resolves the status the same way.
  it('counts a status stored as its display name in the reconciled balance', () => {
    const account = { ACCOUNTID: 10, INITIALBAL: 0 }
    const rows = [
      transaction({ TRANSID: 1, TRANSCODE: 'Deposit', TRANSAMOUNT: 50, STATUS: 'Reconciled' }),
      transaction({ TRANSID: 2, TRANSCODE: 'Deposit', TRANSAMOUNT: 20, STATUS: 'R' }),
      transaction({ TRANSID: 3, TRANSCODE: 'Deposit', TRANSAMOUNT: 9, STATUS: '' }),
    ]
    expect(reconciledBalance(account, rows)).toBe(70)
  })

  // Requirement "Split Transactions", scenario "Splits shadow the parent category".
  describe('splits', () => {
    it('supersedes the parent category when split rows exist', () => {
      const parent = transaction({ CATEGID: 3 })
      expect(effectiveCategoryIds(parent, [])).toEqual([3])
      expect(effectiveCategoryIds(parent, [{ CATEGID: 7 }, { CATEGID: 9 }])).toEqual([7, 9])
    })

    // Scenario "Split sum is validated".
    it('requires split amounts to sum to the transaction amount', () => {
      const parent = transaction({ TRANSAMOUNT: 100 })
      expect(splitsBalance(parent, [{ SPLITTRANSAMOUNT: 60 }, { SPLITTRANSAMOUNT: 40 }])).toBe(true)
      expect(splitsBalance(parent, [{ SPLITTRANSAMOUNT: 60 }, { SPLITTRANSAMOUNT: 30 }])).toBe(
        false,
      )
      expect(splitsBalance(parent, [])).toBe(true)
    })
  })

  // Requirement "Foreign Transaction Linkage Representation", scenario
  // "Sentinels survive a round-trip".
  describe('foreign transactions', () => {
    it('recognizes a linked deposit or withdrawal by its positive TOACCOUNTID', () => {
      expect(isForeignTransaction(transaction({ TRANSCODE: 'Deposit', TOACCOUNTID: 32702 }))).toBe(
        true,
      )
      expect(isForeignTransaction(transaction({ TRANSCODE: 'Transfer', TOACCOUNTID: 20 }))).toBe(
        false,
      )
      expect(isForeignTransaction(transaction({ TOACCOUNTID: null }))).toBe(false)
    })

    it('keeps the upstream sentinel values', () => {
      expect(FOREIGN_SENTINEL.asIncomeExpense).toBe(32701)
      expect(FOREIGN_SENTINEL.asTransfer).toBe(32702)
    })

    // Model_Checking::account_flow ignores the sentinels: a linked row moves its
    // account's balance like any deposit or withdrawal (delta: desktop fidelity).
    it('does not let a sentinel change the account flow', () => {
      const asTransfer = transaction({
        TRANSCODE: 'Withdrawal',
        TRANSAMOUNT: 100,
        TOACCOUNTID: 32702,
      })
      expect(accountFlow(asTransfer, 10)).toBe(-100)
    })

    // Model_Checking::foreignTransactionAsTransfer: what the sentinel excludes
    // is income and expense aggregation. Scenario "An income-or-expense linked
    // row is aggregated".
    it('marks a linked row as a transfer by the 32702 sentinel or its own account', () => {
      expect(isForeignAsTransfer(transaction({ TOACCOUNTID: 32702 }))).toBe(true)
      expect(isForeignAsTransfer(transaction({ ACCOUNTID: 10, TOACCOUNTID: 10 }))).toBe(true)
      expect(isForeignAsTransfer(transaction({ TOACCOUNTID: 32701 }))).toBe(false)
      expect(isForeignAsTransfer(transaction({ TOACCOUNTID: -1 }))).toBe(false)
      expect(isForeignAsTransfer(transaction({ TOACCOUNTID: null }))).toBe(false)
      // A real transfer is never "foreign".
      expect(
        isForeignAsTransfer(transaction({ TRANSCODE: 'Transfer', ACCOUNTID: 10, TOACCOUNTID: 10 })),
      ).toBe(false)
    })
  })

  // Requirement "Statement Lock Enforcement", scenario "Locked transaction
  // cannot be deleted".
  describe('statement lock', () => {
    const locked = { STATEMENTLOCKED: 1, STATEMENTDATE: '2026-06-30' }

    it('freezes rows dated on or before the statement date', () => {
      expect(isStatementLocked(locked, transaction({ TRANSDATE: '2026-06-01' }))).toBe(true)
      expect(isStatementLocked(locked, transaction({ TRANSDATE: '2026-06-30T23:00:00' }))).toBe(
        true,
      )
      expect(isStatementLocked(locked, transaction({ TRANSDATE: '2026-07-01' }))).toBe(false)
    })

    it('leaves an unlocked account alone', () => {
      expect(
        isStatementLocked(
          { STATEMENTLOCKED: 0, STATEMENTDATE: '2026-06-30' },
          transaction({ TRANSDATE: '2026-01-01' }),
        ),
      ).toBe(false)
      expect(isStatementLocked(null, transaction())).toBe(false)
    })
  })

  // Requirement "Soft Delete, Trash, and Retention".
  describe('retention', () => {
    const now = new Date(2026, 7, 9)

    it('purges trashed rows once the window has passed', () => {
      const trashed = transaction({ DELETEDTIME: '2026-07-01T00:00:00' })
      expect(isPurgeable(trashed, 30, now)).toBe(true)
      expect(isPurgeable(trashed, 60, now)).toBe(false)
    })

    // Scenario "The cutoff is the retention period": desktop purges rows whose
    // DELETEDTIME is at or before now(UTC) minus the retention (mmframe.cpp
    // autocleanDeletedTransactions, LESS_OR_EQUAL).
    it('purges at the cutoff second and not one second later', () => {
      const at = new Date(Date.UTC(2026, 7, 31, 12, 0, 0))
      expect(isPurgeable(transaction({ DELETEDTIME: '2026-08-01T12:00:00' }), 30, at)).toBe(true)
      expect(isPurgeable(transaction({ DELETEDTIME: '2026-08-01T12:00:01' }), 30, at)).toBe(false)
      expect(isPurgeable(transaction({ DELETEDTIME: '2026-07-31T23:59:59' }), 30, at)).toBe(true)
    })

    it('never purges a live row', () => {
      expect(isPurgeable(transaction(), 0, now)).toBe(false)
    })

    it('treats a retention of zero as delete immediately', () => {
      const trashed = transaction({ DELETEDTIME: '2026-08-09T00:00:00' })
      expect(isPurgeable(trashed, 0, now)).toBe(true)
    })
  })
})
