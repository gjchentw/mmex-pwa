import { NONE_ID, formatIsoDate, formatIsoTimestamp, isNone, isoDatePart } from '../conventions'
import type { AccountRecord, SplitRecord, TransactionRecord } from '../records'
import { breachesFloor } from './account'
import {
  TRANSACTION_STATUSES,
  isDeleted,
  isForeignTransaction,
  isStatementLocked,
  statusKey,
  type TransactionStatusKey,
  type TransactionType,
} from './ledger'

/**
 * Rules for entering a transaction (openspec: transaction-ledger — Transaction
 * Entry Validation, Transaction Entry Confirmations, Transaction Save
 * Operation, Transaction Entry Defaults). They mirror desktop's entry dialog
 * (transdialog.cpp ValidateData and OnOk): what is refused, what is only
 * confirmed, and what a saved record carries in the columns its type does not
 * use. Kept apart from `ledger.ts` because they need the account rules too.
 */

/** A split line as a surface submits it: content plus the tags to attach to the new row. */
export type SplitLine = Omit<SplitRecord, 'SPLITTRANSID' | 'TRANSID'> & {
  tagIds?: readonly number[]
}

/** What a surface submits for a transaction; the repository loads the rest. */
export interface TransactionDraft {
  /** Present when an existing transaction is being edited. */
  id?: number
  accountId: number
  type: TransactionType
  /** `YYYY-MM-DD`. */
  date: string
  /** `HH:MM:SS`; used only when the file keeps transaction times. */
  time?: string | null
  amount: number
  toAccountId?: number | null
  /** The amount the destination receives. Absent means desktop's "Advanced" box is off. */
  toAmount?: number | null
  payeeId?: number | null
  categoryId?: number | null
  splits?: readonly SplitLine[]
  /** A status key or display name. */
  status?: string | null
  number?: string | null
  notes?: string | null
  color?: number | null
  tagIds?: readonly number[]
}

export type EntryAccount = Pick<
  AccountRecord,
  | 'ACCOUNTID'
  | 'INITIALDATE'
  | 'CURRENCYID'
  | 'STATEMENTLOCKED'
  | 'STATEMENTDATE'
  | 'MINIMUMBALANCE'
  | 'CREDITLIMIT'
>

/** The stored facts the rules are decided against. */
export interface SaveContext {
  account: EntryAccount | null
  toAccount: EntryAccount | null
  stored: TransactionRecord | null
  /** `SETTING_V1.TRANSACTION_USE_DATE_TIME`. */
  useDateTime: boolean
  /** The categories and payees, among those the draft names, that exist. */
  categoryIds: ReadonlySet<number>
  payeeIds: ReadonlySet<number>
}

export type LedgerRefusal =
  | { field: 'transaction'; reason: 'linked' }
  | { field: 'amount' | 'toAmount'; reason: 'negative' }
  | { field: 'account'; reason: 'missing' }
  | { field: 'date'; reason: 'beforeAccountOpening' | 'beforeToAccountOpening' }
  | { field: 'splits'; reason: 'onTransfer' | 'lineWithoutCategory' | 'negativeTotal' }
  | { field: 'category'; reason: 'missing' }
  | { field: 'payee'; reason: 'missing' }
  | { field: 'toAccount'; reason: 'missing' | 'sameAccount' }

/** Conditions desktop asks the user to confirm instead of refusing. */
export type LedgerCondition = 'lockedPeriod' | 'accountLimit' | 'differentCurrencies'

/**
 * A record ready to store. No column a type leaves unused is nullable here:
 * desktop writes -1, the amount, or the empty string, never NULL.
 */
export interface NormalizedTransaction {
  ACCOUNTID: number
  TOACCOUNTID: number
  PAYEEID: number
  TRANSCODE: TransactionType
  TRANSAMOUNT: number
  STATUS: TransactionStatusKey
  TRANSACTIONNUMBER: string
  NOTES: string
  CATEGID: number
  TRANSDATE: string
  DELETEDTIME: string
  FOLLOWUPID: number
  TOTRANSAMOUNT: number
  COLOR: number
}

const MIDNIGHT = '00:00:00'
const COLOR_MIN = 1
const COLOR_MAX = 7
/** Guards the split total against binary-fraction noise before the sign test. */
const TOTAL_EPSILON = 1e-9

const splitTotal = (splits: readonly SplitLine[]): number =>
  splits.reduce((sum, split) => sum + split.SPLITTRANSAMOUNT, 0)

/**
 * The category, amount and split lines the draft amounts to. Two or more lines
 * make a split transaction whose amount is their total; a single line is a
 * plain transaction carrying that line's category and amount (transdialog.cpp).
 */
const effectiveEntry = (
  draft: TransactionDraft,
): { splits: readonly SplitLine[]; categoryId: number | null; amount: number } => {
  const splits = draft.splits ?? []
  if (draft.type === 'Transfer' || splits.length === 0) {
    return { splits: [], categoryId: draft.categoryId ?? null, amount: draft.amount }
  }
  if (splits.length === 1) {
    return { splits: [], categoryId: splits[0]!.CATEGID, amount: splits[0]!.SPLITTRANSAMOUNT }
  }
  return { splits, categoryId: null, amount: splitTotal(splits) }
}

/**
 * Desktop's refusals, in its order. Every refusal that applies is returned so a
 * surface can mark each field; nothing is written while any remains.
 */
export const validateTransaction = (
  draft: TransactionDraft,
  context: SaveContext,
): LedgerRefusal[] => {
  // A linked row is edited through its stock or asset, not through this path.
  if (context.stored && isForeignTransaction(context.stored)) {
    return [{ field: 'transaction', reason: 'linked' }]
  }

  const refusals: LedgerRefusal[] = []
  const isTransfer = draft.type === 'Transfer'
  const submittedSplits = draft.splits ?? []
  const entry = effectiveEntry(draft)

  // checkValue rejects only a negative amount; zero is accepted.
  if (draft.amount < 0) refusals.push({ field: 'amount', reason: 'negative' })

  if (!context.account) {
    refusals.push({ field: 'account', reason: 'missing' })
  } else if (draft.date < isoDatePart(context.account.INITIALDATE)) {
    refusals.push({ field: 'date', reason: 'beforeAccountOpening' })
  }

  if (submittedSplits.length > 0) {
    if (isTransfer) {
      refusals.push({ field: 'splits', reason: 'onTransfer' })
    } else if (submittedSplits.some((split) => isNone(split.CATEGID))) {
      refusals.push({ field: 'splits', reason: 'lineWithoutCategory' })
    } else if (splitTotal(submittedSplits) < -TOTAL_EPSILON) {
      refusals.push({ field: 'splits', reason: 'negativeTotal' })
    }
  }

  // A category is required whenever there are no split lines, transfers included.
  const splitDecides = !isTransfer && submittedSplits.length >= 2
  if (!splitDecides) {
    const categoryId = isTransfer ? (draft.categoryId ?? null) : entry.categoryId
    if (isNone(categoryId) || !context.categoryIds.has(categoryId as number)) {
      const alreadyReported = refusals.some((refusal) => refusal.field === 'splits')
      if (!alreadyReported) refusals.push({ field: 'category', reason: 'missing' })
    }
  }

  if (!isTransfer) {
    if (isNone(draft.payeeId) || !context.payeeIds.has(draft.payeeId as number)) {
      refusals.push({ field: 'payee', reason: 'missing' })
    }
    return refusals
  }

  if (isNone(draft.toAccountId) || !context.toAccount) {
    refusals.push({ field: 'toAccount', reason: 'missing' })
  } else if (draft.toAccountId === draft.accountId) {
    refusals.push({ field: 'toAccount', reason: 'sameAccount' })
  } else if (draft.date < isoDatePart(context.toAccount.INITIALDATE)) {
    refusals.push({ field: 'date', reason: 'beforeToAccountOpening' })
  }
  if (draft.toAmount !== null && draft.toAmount !== undefined && draft.toAmount < 0) {
    refusals.push({ field: 'toAmount', reason: 'negative' })
  }
  return refusals
}

/**
 * The record desktop's dialog would store for this draft, with its split lines
 * and tags. It does not validate; `validateTransaction` decides whether the
 * result may be written.
 */
export const normalizeTransaction = (
  draft: TransactionDraft,
  context: SaveContext,
): { record: NormalizedTransaction; splits: readonly SplitLine[]; tagIds: readonly number[] } => {
  const isTransfer = draft.type === 'Transfer'
  const entry = effectiveEntry(draft)
  const stored = context.stored
  const color = draft.color ?? NONE_ID
  const time = context.useDateTime && draft.time ? draft.time : MIDNIGHT

  const record: NormalizedTransaction = {
    ACCOUNTID: draft.accountId,
    // A stored linked row keeps its sentinel; otherwise a non-transfer has no destination.
    TOACCOUNTID: isTransfer
      ? (draft.toAccountId ?? NONE_ID)
      : stored && isForeignTransaction(stored)
        ? (stored.TOACCOUNTID as number)
        : NONE_ID,
    PAYEEID: isTransfer ? NONE_ID : (draft.payeeId ?? NONE_ID),
    TRANSCODE: draft.type,
    TRANSAMOUNT: entry.amount,
    STATUS: statusKey(draft.status),
    TRANSACTIONNUMBER: draft.number ?? '',
    NOTES: draft.notes ?? '',
    CATEGID: entry.splits.length > 0 ? NONE_ID : (entry.categoryId ?? NONE_ID),
    TRANSDATE: `${draft.date}T${time}`,
    DELETEDTIME: stored?.DELETEDTIME ?? '',
    FOLLOWUPID: stored?.FOLLOWUPID ?? NONE_ID,
    // Without a second amount the destination receives the amount itself.
    TOTRANSAMOUNT: isTransfer ? (draft.toAmount ?? entry.amount) : entry.amount,
    COLOR: color >= COLOR_MIN && color <= COLOR_MAX ? color : NONE_ID,
  }
  return { record, splits: entry.splits, tagIds: draft.tagIds ?? [] }
}

/**
 * The conditions that apply to this draft. `balance` is the account's current
 * balance, needed only for the account limit; pass null when it was not read.
 */
export const confirmationsFor = (
  draft: TransactionDraft,
  context: SaveContext,
  balance: number | null,
): LedgerCondition[] => {
  const conditions: LedgerCondition[] = []
  const account = context.account
  const isTransfer = draft.type === 'Transfer'

  if (isStatementLocked(account, { TRANSDATE: draft.date })) conditions.push('lockedPeriod')

  // Desktop checks the limit for a new or duplicated transaction only, never an edit.
  const isNew = draft.id === undefined
  const spends = draft.type === 'Withdrawal' || isTransfer
  if (
    isNew &&
    spends &&
    account &&
    balance !== null &&
    statusKey(draft.status) !== 'V' &&
    breachesFloor(account, balance - effectiveEntry(draft).amount)
  ) {
    conditions.push('accountLimit')
  }

  const noSecondAmount = draft.toAmount === null || draft.toAmount === undefined
  if (
    isTransfer &&
    noSecondAmount &&
    account &&
    context.toAccount &&
    account.CURRENCYID !== context.toAccount.CURRENCYID
  ) {
    conditions.push('differentCurrencies')
  }
  return conditions
}

const TEXT_COLUMNS: ReadonlySet<keyof NormalizedTransaction> = new Set([
  'TRANSCODE',
  'STATUS',
  'TRANSACTIONNUMBER',
  'NOTES',
  'TRANSDATE',
  'DELETEDTIME',
])

/**
 * Whether saving `next` over `stored` changes the record — desktop's test for
 * moving LASTUPDATEDTIME (Model_Checking::save). NULL and the empty string are
 * the same text to both applications; a NULL number is not the same as -1.
 */
export const transactionChanged = (
  stored: TransactionRecord,
  next: NormalizedTransaction,
): boolean =>
  (Object.keys(next) as (keyof NormalizedTransaction)[]).some((column) =>
    TEXT_COLUMNS.has(column)
      ? (stored[column] ?? '') !== next[column]
      : stored[column] !== next[column],
  )

type ComparableSplit = Pick<SplitRecord, 'CATEGID' | 'SPLITTRANSAMOUNT' | 'NOTES'> & {
  tagIds?: readonly number[]
}

const tagKey = (tagIds: readonly number[] | undefined): string =>
  [...(tagIds ?? [])].sort((a, b) => a - b).join(',')

/**
 * Desktop's test for stamping the transaction after its split lines were
 * replaced (Model_Splittransaction::update), extended to each line's tags: a
 * different count, or a submitted line with no stored line of the same
 * category, amount, notes and tag set left to pair with, is a change.
 */
export const splitSetChanged = (
  stored: readonly ComparableSplit[],
  submitted: readonly ComparableSplit[],
): boolean => {
  if (stored.length !== submitted.length) return true
  const unmatched = [...stored]
  for (const line of submitted) {
    const index = unmatched.findIndex(
      (row) =>
        row.CATEGID === line.CATEGID &&
        row.SPLITTRANSAMOUNT === line.SPLITTRANSAMOUNT &&
        (row.NOTES ?? '') === (line.NOTES ?? '') &&
        tagKey(row.tagIds) === tagKey(line.tagIds),
    )
    if (index === -1) return true
    unmatched.splice(index, 1)
  }
  return false
}

/** Whether two tag sets differ (Model_Taglink::update stamps the transaction when they do). */
export const tagSetChanged = (stored: readonly number[], next: readonly number[]): boolean =>
  tagKey([...new Set(stored)]) !== tagKey([...new Set(next)])

/**
 * A new transaction's default date (Model_Checking::getEmptyData): today, or —
 * when `TRANSACTION_DATE_DEFAULT` is on — the date of the account's latest live
 * transaction that is not later than now.
 */
export const defaultTransactionDate = (
  mode: number,
  accountTransactions: readonly Pick<TransactionRecord, 'TRANSDATE' | 'DELETEDTIME'>[],
  now: Date,
): string => {
  const today = formatIsoDate(now)
  if (mode === 0) return today
  const nowStamp = formatIsoTimestamp(now)
  let latest = ''
  for (const transaction of accountTransactions) {
    const date = transaction.TRANSDATE ?? ''
    if (!isDeleted(transaction) && date > latest && date <= nowStamp) latest = date
  }
  return latest === '' ? today : isoDatePart(latest)
}

/** The default status for a new transaction, from desktop's index into the status list. */
export const defaultStatusKey = (index: number): TransactionStatusKey =>
  TRANSACTION_STATUSES[index]?.key ?? ''
