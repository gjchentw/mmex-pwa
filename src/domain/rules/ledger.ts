import { enumCodec, formatUtcTimestamp, isoDatePart, namesEqual } from '../conventions'
import type { AccountRecord, SplitRecord, TransactionRecord } from '../records'

/**
 * Pure ledger rules (openspec: transaction-ledger). Every monetary aggregate in
 * the application is built from `accountFlow`; nothing else may decide whether a
 * transaction counts.
 */

export const TRANSACTION_TYPES = ['Withdrawal', 'Deposit', 'Transfer'] as const
export type TransactionType = (typeof TRANSACTION_TYPES)[number]
export const transactionTypeCodec = enumCodec(TRANSACTION_TYPES, 'Withdrawal')

/**
 * Display aliases used on investment and share accounts. The persisted
 * TRANSCODE stays canonical -- only the label changes.
 */
export const TRADE_TYPE_LABEL: Record<TransactionType, string> = {
  Withdrawal: 'Buy',
  Deposit: 'Sell',
  Transfer: 'Revalue',
}

/**
 * Status is the one enumeration persisted as a key rather than a display name.
 * Reading accepts either, because imports and older files carry both.
 */
export const TRANSACTION_STATUSES = [
  { key: '', name: 'Unreconciled' },
  { key: 'R', name: 'Reconciled' },
  { key: 'V', name: 'Void' },
  { key: 'F', name: 'Follow Up' },
  { key: 'D', name: 'Duplicate' },
] as const

export type TransactionStatusKey = (typeof TRANSACTION_STATUSES)[number]['key']

/** Resolves a stored status to its persisted key, accepting a key or a display name. */
export const statusKey = (stored: string | null | undefined): TransactionStatusKey => {
  const value = (stored ?? '').trim()
  if (value === '') return ''
  const match = TRANSACTION_STATUSES.find(
    (status) => namesEqual(status.key, value) || namesEqual(status.name, value),
  )
  return match?.key ?? ''
}

export const statusName = (stored: string | null | undefined): string =>
  TRANSACTION_STATUSES.find((status) => status.key === statusKey(stored))?.name ?? 'Unreconciled'

/**
 * TOACCOUNTID sentinels used by share transactions (Model_Translink.h). They are
 * preserved verbatim and never change the row's account flow; `asTransfer`
 * keeps the row out of income and expense aggregation (`isForeignAsTransfer`).
 */
export const FOREIGN_SENTINEL = {
  asIncomeExpense: 32701,
  asTransfer: 32702,
} as const

/** What an operation is about to do to a stored transaction: new field values, or `null` for removal. */
export type TransactionPatch = Partial<Pick<TransactionRecord, 'STATUS' | 'DELETEDTIME'>>

/**
 * The state of transactions after an operation that has not run yet, by id. A
 * derived cache recomputed from linked rows applies these so its update can
 * ride in the same batch as the operation (openspec: investment-tracking,
 * Position Fields Are Derived Caches).
 */
export type TransactionOverrides = ReadonlyMap<number, TransactionPatch | null>

/** Applies overrides to rows read before the operation: removed rows drop out, patched rows change. */
export const applyTransactionOverrides = <T>(
  rows: readonly T[],
  idOf: (row: T) => number,
  patch: (row: T, values: TransactionPatch) => T,
  overrides: TransactionOverrides | undefined,
): T[] => {
  if (!overrides || overrides.size === 0) return [...rows]
  const result: T[] = []
  for (const row of rows) {
    const id = idOf(row)
    if (!overrides.has(id)) {
      result.push(row)
      continue
    }
    const values = overrides.get(id)
    if (values) result.push(patch(row, values))
  }
  return result
}

export const isVoid = (transaction: Pick<TransactionRecord, 'STATUS'>): boolean =>
  statusKey(transaction.STATUS) === 'V'

export const isDeleted = (transaction: Pick<TransactionRecord, 'DELETEDTIME'>): boolean =>
  Boolean(transaction.DELETEDTIME && transaction.DELETEDTIME.length > 0)

export const isSelfTransfer = (
  transaction: Pick<TransactionRecord, 'ACCOUNTID' | 'TOACCOUNTID' | 'TRANSCODE'>,
): boolean =>
  transaction.ACCOUNTID === transaction.TOACCOUNTID &&
  transactionTypeCodec.decode(transaction.TRANSCODE) === 'Transfer'

/**
 * A Deposit or Withdrawal carrying a positive TOACCOUNTID is linked to a stock
 * or asset record rather than to another account.
 */
export const isForeignTransaction = (
  transaction: Pick<TransactionRecord, 'TOACCOUNTID' | 'TRANSCODE'>,
): boolean =>
  transactionTypeCodec.decode(transaction.TRANSCODE) !== 'Transfer' &&
  (transaction.TOACCOUNTID ?? 0) > 0

/**
 * A linked row desktop treats as a transfer: marked with the `asTransfer`
 * sentinel, or pointing at its own account (Model_Checking::
 * foreignTransactionAsTransfer). Such a row still moves its account's balance;
 * it is left out of every income and expense aggregation -- category
 * statistics, summaries, reports, forecasts (openspec: Foreign Transaction
 * Linkage Representation).
 */
export const isForeignAsTransfer = (
  transaction: Pick<TransactionRecord, 'ACCOUNTID' | 'TOACCOUNTID' | 'TRANSCODE'>,
): boolean =>
  isForeignTransaction(transaction) &&
  (transaction.TOACCOUNTID === FOREIGN_SENTINEL.asTransfer ||
    transaction.TOACCOUNTID === transaction.ACCOUNTID)

/**
 * The transaction's signed contribution to one account's flow.
 *
 * Mirrors Model_Checking::account_flow: a self-transfer is a revaluation and
 * contributes nothing; void and soft-deleted rows contribute nothing; a
 * transfer moves TRANSAMOUNT out of the source and TOTRANSAMOUNT into the
 * destination, which is how cross-currency transfers stay balanced.
 */
export const accountFlow = (
  transaction: Pick<
    TransactionRecord,
    | 'ACCOUNTID'
    | 'TOACCOUNTID'
    | 'TRANSCODE'
    | 'TRANSAMOUNT'
    | 'TOTRANSAMOUNT'
    | 'STATUS'
    | 'DELETEDTIME'
  >,
  accountId: number,
): number => {
  if (isSelfTransfer(transaction)) return 0
  if (isVoid(transaction) || isDeleted(transaction)) return 0

  const type = transactionTypeCodec.decode(transaction.TRANSCODE)
  if (accountId === transaction.ACCOUNTID) {
    if (type === 'Deposit') return transaction.TRANSAMOUNT
    return -transaction.TRANSAMOUNT
  }
  if (accountId === transaction.TOACCOUNTID && type === 'Transfer') {
    return transaction.TOTRANSAMOUNT ?? 0
  }
  return 0
}

export const accountInflow = (
  transaction: Parameters<typeof accountFlow>[0],
  accountId: number,
): number => Math.max(accountFlow(transaction, accountId), 0)

export const accountOutflow = (
  transaction: Parameters<typeof accountFlow>[0],
  accountId: number,
): number => Math.max(-accountFlow(transaction, accountId), 0)

/** Flow counted only when the row is reconciled. */
export const reconciledFlow = (
  transaction: Parameters<typeof accountFlow>[0] & Pick<TransactionRecord, 'STATUS'>,
  accountId: number,
): number => (statusKey(transaction.STATUS) === 'R' ? accountFlow(transaction, accountId) : 0)

export const hasSplits = (splits: readonly SplitRecord[]): boolean => splits.length > 0

/**
 * Split rows supersede the parent CATEGID, which is why category aggregation
 * must read the splits when any exist.
 */
export const effectiveCategoryIds = (
  transaction: Pick<TransactionRecord, 'CATEGID'>,
  splits: readonly Pick<SplitRecord, 'CATEGID'>[],
): number[] =>
  splits.length > 0
    ? splits.map((split) => split.CATEGID)
    : transaction.CATEGID === null || transaction.CATEGID === undefined
      ? []
      : [transaction.CATEGID]

const CENT_TOLERANCE = 0.0001

/** Split amounts must sum to the transaction amount before the edit is persisted. */
export const splitsBalance = (
  transaction: Pick<TransactionRecord, 'TRANSAMOUNT'>,
  splits: readonly Pick<SplitRecord, 'SPLITTRANSAMOUNT'>[],
): boolean => {
  if (splits.length === 0) return true
  const total = splits.reduce((sum, split) => sum + split.SPLITTRANSAMOUNT, 0)
  return Math.abs(total - transaction.TRANSAMOUNT) < CENT_TOLERANCE
}

/**
 * A statement-locked account freezes everything dated on or before its
 * statement date: no edit, no status change, no deletion.
 */
export const isStatementLocked = (
  account: Pick<AccountRecord, 'STATEMENTLOCKED' | 'STATEMENTDATE'> | null | undefined,
  transaction: Pick<TransactionRecord, 'TRANSDATE'>,
): boolean => {
  if (!account || !account.STATEMENTLOCKED) return false
  const statementDate = isoDatePart(account.STATEMENTDATE)
  const transactionDate = isoDatePart(transaction.TRANSDATE)
  if (!statementDate || !transactionDate) return false
  return transactionDate <= statementDate
}

const DAY_MS = 86_400_000

/**
 * Whether a trashed row has outlived the retention window: its DELETEDTIME is
 * at or before now (UTC) minus the retention, which is desktop's cutoff
 * (mmframe.cpp autocleanDeletedTransactions). A retention of 0 means rows are
 * hard-deleted immediately instead of being trashed.
 */
export const isPurgeable = (
  transaction: Pick<TransactionRecord, 'DELETEDTIME'>,
  retentionDays: number,
  now: Date,
): boolean => {
  if (!isDeleted(transaction)) return false
  if (retentionDays <= 0) return true
  const cutoff = formatUtcTimestamp(new Date(now.getTime() - retentionDays * DAY_MS))
  return (transaction.DELETEDTIME as string) <= cutoff
}
