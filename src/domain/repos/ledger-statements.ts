import { REFTYPE, formatUtcTimestamp } from '../conventions'
import { insertStatement, type SqlStatement } from '../db'
import type { NormalizedTransaction, SplitLine } from '../rules/ledger-entry'

/**
 * Statement builders for writing a ledger row and what hangs off it (openspec:
 * transaction-ledger, Transaction Save Operation). They take a normalized
 * record, so no caller can write NULL into a column desktop fills with a
 * sentinel. Kept free of other repositories so the ledger, the scheduled
 * materialization and the trade recorder can all use them.
 */

/**
 * The parent of the rows being written: a stored id, or the transaction the
 * same batch inserted just before. SQLite assigns a new INTEGER PRIMARY KEY as
 * one more than the largest key present and a batch is one transaction, so
 * MAX(key) right after an insert is that row's key (domain-write-fixes D1).
 */
export type ParentKey = number | 'inserted'

const NEW_TRANSACTION = '(SELECT MAX(TRANSID) FROM CHECKINGACCOUNT_V1)'
const NEW_SPLIT = '(SELECT MAX(SPLITTRANSID) FROM SPLITTRANSACTIONS_V1)'

/** A new transaction is stamped with the time it was saved (Model_Checking::save). */
export const insertTransactionStatement = (
  record: NormalizedTransaction,
  now: Date,
): SqlStatement =>
  insertStatement('CHECKINGACCOUNT_V1', { ...record, LASTUPDATEDTIME: formatUtcTimestamp(now) })

/** Each split row, followed at once by its tag links while MAX(SPLITTRANSID) is still that row's key. */
export const splitLineStatements = (
  parent: ParentKey,
  splits: readonly SplitLine[],
): SqlStatement[] =>
  splits.flatMap((split) => [
    parent === 'inserted'
      ? {
          sql: `INSERT INTO SPLITTRANSACTIONS_V1 (TRANSID, CATEGID, SPLITTRANSAMOUNT, NOTES)
                VALUES (${NEW_TRANSACTION}, ?, ?, ?)`,
          bind: [split.CATEGID, split.SPLITTRANSAMOUNT, split.NOTES],
        }
      : insertStatement('SPLITTRANSACTIONS_V1', {
          TRANSID: parent,
          CATEGID: split.CATEGID,
          SPLITTRANSAMOUNT: split.SPLITTRANSAMOUNT,
          NOTES: split.NOTES,
        }),
    ...(split.tagIds ?? []).map((tagId) => ({
      sql: `INSERT OR IGNORE INTO TAGLINK_V1 (REFTYPE, REFID, TAGID)
            VALUES (?, ${NEW_SPLIT}, ?)`,
      bind: [REFTYPE.transactionSplit, tagId],
    })),
  ])

/** The transaction's own tag links; the unique index makes a repeated tag a no-op. */
export const transactionTagStatements = (
  parent: ParentKey,
  tagIds: readonly number[],
): SqlStatement[] =>
  tagIds.map((tagId) =>
    parent === 'inserted'
      ? {
          sql: `INSERT OR IGNORE INTO TAGLINK_V1 (REFTYPE, REFID, TAGID)
                VALUES (?, ${NEW_TRANSACTION}, ?)`,
          bind: [REFTYPE.transaction, tagId],
        }
      : {
          sql: 'INSERT OR IGNORE INTO TAGLINK_V1 (REFTYPE, REFID, TAGID) VALUES (?, ?, ?)',
          bind: [REFTYPE.transaction, parent, tagId],
        },
  )
