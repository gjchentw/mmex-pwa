import { LINKTYPE, NONE_ID, REFTYPE, formatUtcTimestamp, isoDatePart } from '../conventions'
import { db, placeholders, updateStatement, type SqlStatement } from '../db'
import type {
  AccountRecord,
  CategoryRecord,
  PayeeRecord,
  SplitRecord,
  TagLinkRecord,
  TransactionRecord,
  TransLinkRecord,
} from '../records'
import { accountBalance } from '../rules/account'
import {
  isDeleted,
  isPurgeable,
  isStatementLocked,
  splitsBalance,
  statusKey,
  type TransactionOverrides,
  type TransactionPatch,
} from '../rules/ledger'
import {
  confirmationsFor,
  normalizeTransaction,
  splitSetChanged,
  tagSetChanged,
  transactionChanged,
  validateTransaction,
  type LedgerCondition,
  type LedgerRefusal,
  type SaveContext,
  type SplitLine,
  type TransactionDraft,
} from '../rules/ledger-entry'
import { assetRepo } from './asset'
import { extensionCleanupStatements } from './extensions'
import { stockRepo } from './investment'
import {
  insertTransactionStatement,
  splitLineStatements,
  transactionTagStatements,
} from './ledger-statements'
import { fileFacts } from './metadata'

/**
 * The transaction ledger (openspec: transaction-ledger). A transaction is saved
 * from a validated draft in one batch; soft delete is the default path for
 * removal: rows are trashed, remain restorable, and are hard-deleted only once
 * the retention window has passed. Every refusal is typed so a surface can
 * translate it.
 */

export type { SplitLine } from '../rules/ledger-entry'

/** The draft breaks a rule desktop's entry dialog enforces; nothing was written. */
export class LedgerValidationError extends Error {
  constructor(readonly refusals: readonly LedgerRefusal[]) {
    super(`transaction refused: ${refusals.map((r) => `${r.field} ${r.reason}`).join(', ')}`)
    this.name = 'LedgerValidationError'
  }
}

/** The stored transactions are dated on or before their account's locked statement date. */
export class LedgerLockedError extends Error {
  constructor(
    readonly transactionIds: readonly number[],
    readonly statementDate: string,
  ) {
    super(`transaction is locked by its account statement to ${statementDate}`)
    this.name = 'LedgerLockedError'
  }
}

/** Desktop would ask before saving; the save proceeds once each condition is acknowledged. */
export class LedgerConfirmationRequired extends Error {
  constructor(
    readonly conditions: readonly LedgerCondition[],
    /** The lock date, when the locked period is among the conditions. */
    readonly statementDate: string | null,
  ) {
    super(`confirmation required: ${conditions.join(', ')}`)
    this.name = 'LedgerConfirmationRequired'
  }
}

/** What an operation over many transactions did, and which rows the statement lock kept out of it. */
export interface LockedPartition {
  skippedLocked: number[]
}

const LIVE = "COALESCE(DELETEDTIME, '') = ''"

/** A stored split line with the tags attached to it. */
type StoredSplitLine = SplitRecord & { tagIds: number[] }

export interface LedgerQuery {
  accountId?: number
  fromDate?: string
  toDate?: string
  includeDeleted?: boolean
  onlyDeleted?: boolean
}

const buildWhere = (query: LedgerQuery): { clause: string; bind: unknown[] } => {
  const conditions: string[] = []
  const bind: unknown[] = []
  if (query.accountId !== undefined) {
    conditions.push('(ACCOUNTID = ? OR TOACCOUNTID = ?)')
    bind.push(query.accountId, query.accountId)
  }
  if (query.fromDate) {
    conditions.push('TRANSDATE >= ?')
    bind.push(query.fromDate)
  }
  if (query.toDate) {
    // Compare on the date part so a combined timestamp still falls inside the day.
    conditions.push('substr(TRANSDATE, 1, 10) <= ?')
    bind.push(query.toDate.slice(0, 10))
  }
  if (query.onlyDeleted) {
    conditions.push(`NOT (${LIVE})`)
  } else if (!query.includeDeleted) {
    conditions.push(LIVE)
  }
  return {
    clause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    bind,
  }
}

const distinct = (ids: readonly (number | null | undefined)[]): number[] => [
  ...new Set(ids.filter((id): id is number => typeof id === 'number' && id !== NONE_ID)),
]

const accountsById = async (
  ids: readonly (number | null | undefined)[],
): Promise<Map<number, AccountRecord>> => {
  const wanted = distinct(ids)
  if (wanted.length === 0) return new Map()
  const rows = await db.query<AccountRecord>(
    `SELECT * FROM ACCOUNTLIST_V1 WHERE ACCOUNTID IN (${placeholders(wanted.length)})`,
    wanted,
  )
  return new Map(rows.map((row) => [row.ACCOUNTID, row]))
}

/** The removal of a transaction's split lines and of the tag links those rows carry. */
const clearSplitsStatements = (transactionId: number): SqlStatement[] => [
  {
    sql: `DELETE FROM TAGLINK_V1 WHERE REFTYPE = ? AND REFID IN
          (SELECT SPLITTRANSID FROM SPLITTRANSACTIONS_V1 WHERE TRANSID = ?)`,
    bind: [REFTYPE.transactionSplit, transactionId],
  },
  { sql: 'DELETE FROM SPLITTRANSACTIONS_V1 WHERE TRANSID = ?', bind: [transactionId] },
]

/**
 * The position updates for the stocks and assets linked to the given
 * transactions, computed over their state after the operation, so they ride in
 * the same batch as the change that invalidated them (design D7; openspec:
 * investment-tracking, Position Fields Are Derived Caches). Must be built
 * before the batch runs: a hard delete removes the link rows it reads.
 */
const positionStatements = async (
  overrides: TransactionOverrides,
  now: Date,
): Promise<SqlStatement[]> => {
  const ids = [...overrides.keys()]
  if (ids.length === 0) return []
  const links = await db.query<Pick<TransLinkRecord, 'LINKTYPE' | 'LINKRECORDID'>>(
    `SELECT DISTINCT LINKTYPE, LINKRECORDID FROM TRANSLINK_V1
     WHERE CHECKINGACCOUNTID IN (${placeholders(ids.length)})`,
    ids,
  )
  const seen = new Set<string>()
  const statements: SqlStatement[] = []
  for (const link of links) {
    const key = `${link.LINKTYPE}:${link.LINKRECORDID}`
    if (seen.has(key)) continue
    seen.add(key)
    if (link.LINKTYPE === LINKTYPE.stock) {
      statements.push(
        ...(await stockRepo.recomputeStatements(link.LINKRECORDID, { now, overrides })),
      )
    } else if (link.LINKTYPE === LINKTYPE.asset) {
      statements.push(...(await assetRepo.recomputeStatements(link.LINKRECORDID, { overrides })))
    }
  }
  return statements
}

const overridesFor = (
  ids: readonly number[],
  patch: TransactionPatch | null,
): TransactionOverrides => new Map(ids.map((id) => [id, patch]))

export const ledgerRepo = {
  async list(query: LedgerQuery = {}): Promise<TransactionRecord[]> {
    const { clause, bind } = buildWhere(query)
    return db.query<TransactionRecord>(
      `SELECT * FROM CHECKINGACCOUNT_V1 ${clause} ORDER BY TRANSDATE, TRANSID`,
      bind,
    )
  },

  async get(transactionId: number): Promise<TransactionRecord | null> {
    const rows = await db.query<TransactionRecord>(
      'SELECT * FROM CHECKINGACCOUNT_V1 WHERE TRANSID = ?',
      [transactionId],
    )
    return rows[0] ?? null
  },

  async splitsFor(transactionId: number): Promise<SplitRecord[]> {
    return db.query<SplitRecord>(
      'SELECT * FROM SPLITTRANSACTIONS_V1 WHERE TRANSID = ? ORDER BY SPLITTRANSID',
      [transactionId],
    )
  },

  /** A transaction's split lines with the tags each carries. */
  async splitLinesFor(transactionId: number): Promise<StoredSplitLine[]> {
    const rows = await this.splitsFor(transactionId)
    if (rows.length === 0) return []
    const links = await db.query<Pick<TagLinkRecord, 'REFID' | 'TAGID'>>(
      `SELECT REFID, TAGID FROM TAGLINK_V1
       WHERE REFTYPE = ? AND REFID IN (${placeholders(rows.length)})`,
      [REFTYPE.transactionSplit, ...rows.map((row) => row.SPLITTRANSID)],
    )
    return rows.map((row) => ({
      ...row,
      tagIds: links.filter((link) => link.REFID === row.SPLITTRANSID).map((link) => link.TAGID),
    }))
  },

  async tagIdsFor(transactionId: number): Promise<number[]> {
    const links = await db.query<Pick<TagLinkRecord, 'TAGID'>>(
      'SELECT TAGID FROM TAGLINK_V1 WHERE REFTYPE = ? AND REFID = ?',
      [REFTYPE.transaction, transactionId],
    )
    return links.map((link) => link.TAGID)
  },

  /**
   * Refuses the change when the owning account is statement-locked and the row
   * falls on or before the statement date. The lock is the lock of the row's own
   * account; a transfer's destination account is not consulted (Model_Checking::is_locked).
   */
  async assertEditable(transaction: TransactionRecord): Promise<void> {
    const owner = (await accountsById([transaction.ACCOUNTID])).get(transaction.ACCOUNTID)
    if (isStatementLocked(owner, transaction)) {
      throw new LedgerLockedError([transaction.TRANSID], isoDatePart(owner?.STATEMENTDATE))
    }
  },

  /**
   * Splits the given transactions into those the statement lock covers and the
   * rest. Desktop processes the rest and warns about the locked ones; when
   * nothing is left to process the operation is refused outright.
   */
  async partitionByLock(
    transactionIds: readonly number[],
  ): Promise<{ free: TransactionRecord[]; locked: TransactionRecord[] }> {
    if (transactionIds.length === 0) return { free: [], locked: [] }
    const rows = await db.query<TransactionRecord>(
      `SELECT * FROM CHECKINGACCOUNT_V1 WHERE TRANSID IN (${placeholders(transactionIds.length)})`,
      [...transactionIds],
    )
    const accounts = await accountsById(rows.map((row) => row.ACCOUNTID))
    const free: TransactionRecord[] = []
    const locked: TransactionRecord[] = []
    for (const row of rows) {
      if (isStatementLocked(accounts.get(row.ACCOUNTID), row)) locked.push(row)
      else free.push(row)
    }
    if (free.length === 0 && locked.length > 0) {
      const owner = accounts.get(locked[0]!.ACCOUNTID)
      throw new LedgerLockedError(
        locked.map((row) => row.TRANSID),
        isoDatePart(owner?.STATEMENTDATE),
      )
    }
    return { free, locked }
  },

  /**
   * Saves a transaction as desktop's entry dialog does (transdialog.cpp OnOk):
   * refused when a rule is broken, stopped until each condition desktop would
   * ask about is acknowledged, and otherwise written whole -- the row, its split
   * lines with their tags, its tags, and under the Last used mode the payee's
   * default category -- in one batch. LASTUPDATEDTIME moves on insert and on a
   * real change of the record, its split set or its tag set, never otherwise
   * (openspec: transaction-ledger, Transaction Save Operation).
   */
  async saveTransaction(
    draft: TransactionDraft,
    options: { acknowledged?: readonly LedgerCondition[]; now?: Date } = {},
  ): Promise<void> {
    const now = options.now ?? new Date()
    const stored = draft.id === undefined ? null : await this.get(draft.id)
    if (draft.id !== undefined && !stored) throw new Error(`Transaction ${draft.id} not found`)

    const accounts = await accountsById([draft.accountId, draft.toAccountId, stored?.ACCOUNTID])
    // A stored row inside its own account's locked period is read-only; desktop
    // does not open it for editing.
    if (stored) {
      const owner = accounts.get(stored.ACCOUNTID)
      if (isStatementLocked(owner, stored)) {
        throw new LedgerLockedError([stored.TRANSID], isoDatePart(owner?.STATEMENTDATE))
      }
    }

    const categoryIds = distinct([
      draft.categoryId,
      ...(draft.splits ?? []).map((split) => split.CATEGID),
    ])
    const payeeIds = distinct([draft.payeeId])
    const [categories, payees, useDateTime, categoryMode] = await Promise.all([
      categoryIds.length === 0
        ? []
        : db.query<Pick<CategoryRecord, 'CATEGID' | 'ACTIVE'>>(
            `SELECT CATEGID, ACTIVE FROM CATEGORY_V1 WHERE CATEGID IN (${placeholders(categoryIds.length)})`,
            categoryIds,
          ),
      payeeIds.length === 0
        ? []
        : db.query<Pick<PayeeRecord, 'PAYEEID'>>(
            `SELECT PAYEEID FROM PAYEE_V1 WHERE PAYEEID IN (${placeholders(payeeIds.length)})`,
            payeeIds,
          ),
      fileFacts.transactionUseDateTime(),
      fileFacts.defaultCategoryMode(),
    ])

    const account = accounts.get(draft.accountId) ?? null
    const context: SaveContext = {
      account,
      toAccount:
        draft.toAccountId === null || draft.toAccountId === undefined
          ? null
          : (accounts.get(draft.toAccountId) ?? null),
      stored,
      useDateTime,
      categoryIds: new Set(categories.map((category) => category.CATEGID)),
      payeeIds: new Set(payees.map((payee) => payee.PAYEEID)),
    }

    const refusals = validateTransaction(draft, context)
    if (refusals.length > 0) throw new LedgerValidationError(refusals)

    // The balance is read only when an account limit could be breached.
    const limited =
      account && ((account.MINIMUMBALANCE ?? 0) !== 0 || (account.CREDITLIMIT ?? 0) !== 0)
    const balance =
      account && limited && draft.id === undefined
        ? accountBalance(account, await this.list({ accountId: account.ACCOUNTID }))
        : null
    const acknowledged = new Set(options.acknowledged ?? [])
    const pending = confirmationsFor(draft, context, balance).filter(
      (condition) => !acknowledged.has(condition),
    )
    if (pending.length > 0) {
      throw new LedgerConfirmationRequired(
        pending,
        pending.includes('lockedPeriod') ? isoDatePart(account?.STATEMENTDATE) : null,
      )
    }

    const { record, splits, tagIds } = normalizeTransaction(draft, context)
    const statements: SqlStatement[] = []
    if (!stored) {
      statements.push(
        insertTransactionStatement(record, now),
        ...splitLineStatements('inserted', splits),
        ...transactionTagStatements('inserted', tagIds),
      )
    } else {
      const [storedSplits, storedTagIds] = await Promise.all([
        this.splitLinesFor(stored.TRANSID),
        this.tagIdsFor(stored.TRANSID),
      ])
      const changed =
        transactionChanged(stored, record) ||
        splitSetChanged(storedSplits, splits) ||
        tagSetChanged(storedTagIds, tagIds)
      // Desktop stamps a change only while the row is outside the trash (Model_Checking::save).
      const values =
        changed && !isDeleted(stored)
          ? { ...record, LASTUPDATEDTIME: formatUtcTimestamp(now) }
          : { ...record }
      statements.push(
        updateStatement('CHECKINGACCOUNT_V1', 'TRANSID', stored.TRANSID, values),
        ...clearSplitsStatements(stored.TRANSID),
        ...splitLineStatements(stored.TRANSID, splits),
        {
          sql: 'DELETE FROM TAGLINK_V1 WHERE REFTYPE = ? AND REFID = ?',
          bind: [REFTYPE.transaction, stored.TRANSID],
        },
        ...transactionTagStatements(stored.TRANSID, tagIds),
      )
    }

    // Last used: the payee's default follows the saved category -- -1 for a split
    // transaction -- unless that category is hidden (transdialog.cpp ValidateData).
    const hidden = categories.some(
      (category) => category.CATEGID === record.CATEGID && category.ACTIVE === 0,
    )
    if (
      categoryMode === 'lastUsed' &&
      record.TRANSCODE !== 'Transfer' &&
      record.PAYEEID !== NONE_ID &&
      !hidden
    ) {
      statements.push({
        sql: 'UPDATE PAYEE_V1 SET CATEGID = ? WHERE PAYEEID = ?',
        bind: [record.CATEGID, record.PAYEEID],
      })
    }

    await db.mutate(statements)
  },

  /**
   * Replaces a transaction's split lines, validating that they sum to its amount.
   * As desktop does (Model_Splittransaction::update), the rows are replaced, not
   * edited in place; their tag links are written in the same batch, each right
   * after its row, and the transaction is stamped only when the split set changed
   * -- a different count, or a category, amount, note or tag set that differs
   * (openspec: transaction-ledger, Split Transactions).
   */
  async replaceSplitsStatements(
    transaction: Pick<TransactionRecord, 'TRANSID' | 'TRANSAMOUNT'>,
    splits: readonly SplitLine[],
    options: { now?: Date } = {},
  ): Promise<SqlStatement[]> {
    if (!splitsBalance(transaction, splits)) {
      throw new Error('Split amounts must sum to the transaction amount')
    }
    const current = await this.splitLinesFor(transaction.TRANSID)
    const statements: SqlStatement[] = [
      ...clearSplitsStatements(transaction.TRANSID),
      ...splitLineStatements(transaction.TRANSID, splits),
    ]
    if (splitSetChanged(current, splits)) {
      statements.push({
        sql: 'UPDATE CHECKINGACCOUNT_V1 SET LASTUPDATEDTIME = ? WHERE TRANSID = ?',
        bind: [formatUtcTimestamp(options.now ?? new Date()), transaction.TRANSID],
      })
    }
    return statements
  },

  /**
   * Sets the status of one or many transactions (mmchecking_list.cpp
   * onMarkTransaction): rows the statement lock covers are skipped and reported,
   * rows already at the status are left untouched, and each live row that changes
   * is stamped. A linked position is recomputed in the same batch, since a void
   * trade leaves the cost book (openspec: transaction-ledger, Transaction Status
   * Lifecycle).
   */
  async setStatus(
    transactionIds: readonly number[],
    status: string,
    options: { now?: Date } = {},
  ): Promise<{ changed: number[] } & LockedPartition> {
    const now = options.now ?? new Date()
    const key = statusKey(status)
    const { free, locked } = await this.partitionByLock(transactionIds)
    const skippedLocked = locked.map((row) => row.TRANSID)
    const changing = free.filter((row) => statusKey(row.STATUS) !== key)
    if (changing.length === 0) return { changed: [], skippedLocked }

    const liveIds = changing.filter((row) => !isDeleted(row)).map((row) => row.TRANSID)
    const trashedIds = changing.filter((row) => isDeleted(row)).map((row) => row.TRANSID)
    const statements: SqlStatement[] = []
    if (liveIds.length > 0) {
      statements.push({
        sql: `UPDATE CHECKINGACCOUNT_V1 SET STATUS = ?, LASTUPDATEDTIME = ? WHERE TRANSID IN (${placeholders(liveIds.length)})`,
        bind: [key, formatUtcTimestamp(now), ...liveIds],
      })
    }
    if (trashedIds.length > 0) {
      statements.push({
        sql: `UPDATE CHECKINGACCOUNT_V1 SET STATUS = ? WHERE TRANSID IN (${placeholders(trashedIds.length)})`,
        bind: [key, ...trashedIds],
      })
    }
    const changed = changing.map((row) => row.TRANSID)
    statements.push(...(await positionStatements(overridesFor(changed, { STATUS: key }), now)))
    await db.mutate(statements)
    return { changed, skippedLocked }
  },

  /** Stamps DELETEDTIME, leaving the row and everything attached to it restorable. */
  softDeleteStatement(transactionIds: readonly number[], now = new Date()): SqlStatement {
    return {
      sql: `UPDATE CHECKINGACCOUNT_V1 SET DELETEDTIME = ? WHERE TRANSID IN (${placeholders(transactionIds.length)})`,
      bind: [formatUtcTimestamp(now), ...transactionIds],
    }
  },

  /**
   * Removes transactions outright along with everything that hangs off them:
   * split lines, the tag links of both the rows and their splits, attachments,
   * custom field values, and any share detail and stock or asset linkage
   * (Model_Checking::remove).
   */
  async hardDeleteStatements(transactionIds: readonly number[]): Promise<SqlStatement[]> {
    if (transactionIds.length === 0) return []
    const list = placeholders(transactionIds.length)
    const ids = [...transactionIds]

    const splits = await db.query<Pick<SplitRecord, 'SPLITTRANSID'>>(
      `SELECT SPLITTRANSID FROM SPLITTRANSACTIONS_V1 WHERE TRANSID IN (${list})`,
      ids,
    )
    const splitIds = splits.map((split) => split.SPLITTRANSID)

    return [
      ...extensionCleanupStatements(REFTYPE.transaction, ids),
      ...extensionCleanupStatements(REFTYPE.transactionSplit, splitIds),
      { sql: `DELETE FROM SPLITTRANSACTIONS_V1 WHERE TRANSID IN (${list})`, bind: [...ids] },
      { sql: `DELETE FROM SHAREINFO_V1 WHERE CHECKINGACCOUNTID IN (${list})`, bind: [...ids] },
      { sql: `DELETE FROM TRANSLINK_V1 WHERE CHECKINGACCOUNTID IN (${list})`, bind: [...ids] },
      { sql: `DELETE FROM CHECKINGACCOUNT_V1 WHERE TRANSID IN (${list})`, bind: [...ids] },
    ]
  },

  /** The cascade alone, with no lock check and no position update; for callers that own both. */
  async hardDelete(transactionIds: readonly number[]): Promise<void> {
    await db.mutate(await this.hardDeleteStatements(transactionIds))
  },

  /**
   * Deletes the given transactions as desktop's register does
   * (mmchecking_list.cpp onDeleteTransaction): rows the statement lock covers are
   * skipped and reported; a live row is trashed, or removed outright when the
   * retention is zero; a row already in the trash is removed outright. Linked
   * positions are recomputed in the same batch.
   */
  async remove(
    transactionIds: readonly number[],
    options: { now?: Date } = {},
  ): Promise<{ removed: number[] } & LockedPartition> {
    const now = options.now ?? new Date()
    const { free, locked } = await this.partitionByLock(transactionIds)
    const retention = await fileFacts.deletedTransactionRetainDays()
    const hardIds = free.filter((row) => isDeleted(row) || retention <= 0).map((row) => row.TRANSID)
    const softIds = free.filter((row) => !isDeleted(row) && retention > 0).map((row) => row.TRANSID)

    const overrides: TransactionOverrides = new Map<number, TransactionPatch | null>([
      ...softIds.map((id): [number, TransactionPatch] => [
        id,
        { DELETEDTIME: formatUtcTimestamp(now) },
      ]),
      ...hardIds.map((id): [number, null] => [id, null]),
    ])
    const statements: SqlStatement[] = [
      ...(softIds.length > 0 ? [this.softDeleteStatement(softIds, now)] : []),
      ...(await this.hardDeleteStatements(hardIds)),
      ...(await positionStatements(overrides, now)),
    ]
    if (statements.length > 0) await db.mutate(statements)
    return {
      removed: free.map((row) => row.TRANSID),
      skippedLocked: locked.map((row) => row.TRANSID),
    }
  },

  /**
   * Brings trashed transactions back (onRestoreTransaction): DELETEDTIME becomes
   * the empty string, as desktop writes it; the statement lock is not consulted
   * and LASTUPDATEDTIME is not touched. Linked positions are recomputed in the
   * same batch.
   */
  async restore(transactionIds: readonly number[], options: { now?: Date } = {}): Promise<void> {
    if (transactionIds.length === 0) return
    const ids = [...transactionIds]
    await db.mutate([
      {
        sql: `UPDATE CHECKINGACCOUNT_V1 SET DELETEDTIME = ? WHERE TRANSID IN (${placeholders(ids.length)})`,
        bind: ['', ...ids],
      },
      ...(await positionStatements(
        overridesFor(ids, { DELETEDTIME: '' }),
        options.now ?? new Date(),
      )),
    ])
  },

  /**
   * Permanently deletes transactions at the user's request, as from the trash
   * view: rows the statement lock covers are skipped and reported, the rest are
   * removed with their cascade and their linked positions recomputed.
   */
  async purge(
    transactionIds: readonly number[],
    options: { now?: Date } = {},
  ): Promise<{ removed: number[] } & LockedPartition> {
    const { free, locked } = await this.partitionByLock(transactionIds)
    const ids = free.map((row) => row.TRANSID)
    const statements: SqlStatement[] = [
      ...(await this.hardDeleteStatements(ids)),
      ...(await positionStatements(overridesFor(ids, null), options.now ?? new Date())),
    ]
    if (statements.length > 0) await db.mutate(statements)
    return { removed: ids, skippedLocked: locked.map((row) => row.TRANSID) }
  },

  /**
   * Purges trashed rows whose retention has elapsed (mmframe.cpp
   * autocleanDeletedTransactions). The statement lock is not consulted. It runs
   * once the database is ready and synchronization has settled, at most once a
   * calendar day (operator decision 2026-08-08) -- the maintenance store owns
   * that cadence.
   */
  async purgeExpired(now = new Date()): Promise<number> {
    const retention = await fileFacts.deletedTransactionRetainDays()
    const trashed = await this.list({ onlyDeleted: true, includeDeleted: true })
    const expired = trashed
      .filter((transaction) => isPurgeable(transaction, retention, now))
      .map((transaction) => transaction.TRANSID)
    if (expired.length === 0) return 0
    await db.mutate([
      ...(await this.hardDeleteStatements(expired)),
      ...(await positionStatements(overridesFor(expired, null), now)),
    ])
    return expired.length
  },
}
