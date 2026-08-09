import { REFTYPE, formatUtcTimestamp } from '../conventions'
import { db, insertStatement, placeholders, updateStatement, type SqlStatement } from '../db'
import type { AccountRecord, SplitRecord, TransactionRecord } from '../records'
import { isPurgeable, isStatementLocked, splitsBalance } from '../rules/ledger'
import { extensionCleanupStatements } from './extensions'
import { fileFacts } from './metadata'

/**
 * The transaction ledger (openspec: transaction-ledger). Soft delete is the
 * default path: rows are trashed, remain restorable, and are hard-deleted only
 * once the retention window has passed.
 */

const LIVE = "COALESCE(DELETEDTIME, '') = ''"

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

  /**
   * Refuses the edit when the owning account is statement-locked and the row
   * falls on or before the statement date.
   */
  async assertEditable(transaction: TransactionRecord): Promise<void> {
    const rows = await db.query<AccountRecord>('SELECT * FROM ACCOUNTLIST_V1 WHERE ACCOUNTID = ?', [
      transaction.ACCOUNTID,
    ])
    if (isStatementLocked(rows[0], transaction)) {
      throw new Error('Transaction is locked by its account statement and cannot be changed')
    }
  },

  /**
   * LASTUPDATEDTIME is stamped only when the record actually changes, and never
   * by a soft delete or restore (Model_Checking::save).
   */
  saveStatement(
    transaction: TransactionRecord,
    options: { stampUpdate?: boolean; now?: Date } = {},
  ): SqlStatement {
    const values: Partial<TransactionRecord> = { ...transaction }
    delete values.TRANSID
    if (options.stampUpdate !== false) {
      values.LASTUPDATEDTIME = formatUtcTimestamp(options.now ?? new Date())
    }
    return updateStatement('CHECKINGACCOUNT_V1', 'TRANSID', transaction.TRANSID, values)
  },

  addStatement(
    transaction: Omit<TransactionRecord, 'TRANSID'>,
    options: { now?: Date } = {},
  ): SqlStatement {
    return insertStatement('CHECKINGACCOUNT_V1', {
      ...transaction,
      LASTUPDATEDTIME: formatUtcTimestamp(options.now ?? new Date()),
    })
  },

  /** Replaces a transaction's split lines, validating that they sum to its amount. */
  replaceSplitsStatements(
    transaction: Pick<TransactionRecord, 'TRANSID' | 'TRANSAMOUNT'>,
    splits: readonly Omit<SplitRecord, 'SPLITTRANSID' | 'TRANSID'>[],
  ): SqlStatement[] {
    if (!splitsBalance(transaction, splits)) {
      throw new Error('Split amounts must sum to the transaction amount')
    }
    return [
      { sql: 'DELETE FROM SPLITTRANSACTIONS_V1 WHERE TRANSID = ?', bind: [transaction.TRANSID] },
      ...splits.map((split) =>
        insertStatement('SPLITTRANSACTIONS_V1', {
          TRANSID: transaction.TRANSID,
          CATEGID: split.CATEGID,
          SPLITTRANSAMOUNT: split.SPLITTRANSAMOUNT,
          NOTES: split.NOTES,
        }),
      ),
    ]
  },

  /** Stamps DELETEDTIME, leaving the row restorable. */
  softDeleteStatement(transactionIds: readonly number[], now = new Date()): SqlStatement {
    return {
      sql: `UPDATE CHECKINGACCOUNT_V1 SET DELETEDTIME = ? WHERE TRANSID IN (${placeholders(transactionIds.length)})`,
      bind: [formatUtcTimestamp(now), ...transactionIds],
    }
  },

  restoreStatement(transactionIds: readonly number[]): SqlStatement {
    return {
      sql: `UPDATE CHECKINGACCOUNT_V1 SET DELETEDTIME = NULL WHERE TRANSID IN (${placeholders(transactionIds.length)})`,
      bind: [...transactionIds],
    }
  },

  /**
   * Removes transactions outright along with everything that hangs off them:
   * split lines, the tag links of both the rows and their splits, attachments,
   * custom field values, and any stock or asset linkage.
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

  async hardDelete(transactionIds: readonly number[]): Promise<void> {
    await db.mutate(await this.hardDeleteStatements(transactionIds))
  },

  /**
   * Trashes the given transactions, or removes them outright when retention is
   * zero. Callers recompute any linked position afterwards.
   */
  async remove(transactionIds: readonly number[], now = new Date()): Promise<void> {
    const retention = await fileFacts.deletedTransactionRetainDays()
    if (retention <= 0) {
      await this.hardDelete(transactionIds)
      return
    }
    await db.mutate([this.softDeleteStatement(transactionIds, now)])
  },

  /**
   * Purges trashed rows whose retention has elapsed. Runs once the database is
   * ready and synchronization has settled, at most once a calendar day
   * (operator decision 2026-08-08) -- the caller owns that cadence.
   */
  async purgeExpired(now = new Date()): Promise<number> {
    const retention = await fileFacts.deletedTransactionRetainDays()
    const trashed = await this.list({ onlyDeleted: true, includeDeleted: true })
    const expired = trashed
      .filter((transaction) => isPurgeable(transaction, retention, now))
      .map((transaction) => transaction.TRANSID)
    if (expired.length === 0) return 0
    await this.hardDelete(expired)
    return expired.length
  },
}
