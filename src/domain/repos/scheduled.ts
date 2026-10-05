import { NONE_ID, REFTYPE } from '../conventions'
import { db, insertStatement, placeholders, updateStatement, type SqlStatement } from '../db'
import type { ScheduledRecord, ScheduledSplitRecord } from '../records'
import { accountBalance, breachesFloor } from '../rules/account'
import { statusKey, transactionTypeCodec } from '../rules/ledger'
import type { NormalizedTransaction } from '../rules/ledger-entry'
import { advanceSeries, effectiveAutoExecute, isDue, isLegacyInactive } from '../rules/scheduled'
import { accountRepo } from './account'
import { extensionCleanupStatements } from './extensions'
import { ledgerRepo } from './ledger'
import { insertTransactionStatement, splitLineStatements } from './ledger-statements'

/**
 * Recurring series (openspec: scheduled-transactions). Executing or skipping an
 * occurrence mutates the series, so these operations are not idempotent.
 */

export const scheduledRepo = {
  async all(): Promise<ScheduledRecord[]> {
    return db.query<ScheduledRecord>('SELECT * FROM BILLSDEPOSITS_V1 ORDER BY NEXTOCCURRENCEDATE')
  },

  async get(bdid: number): Promise<ScheduledRecord | null> {
    const rows = await db.query<ScheduledRecord>('SELECT * FROM BILLSDEPOSITS_V1 WHERE BDID = ?', [
      bdid,
    ])
    return rows[0] ?? null
  },

  /** Split lines of a series -- BUDGETSPLITTRANSACTIONS_V1 despite the name. */
  async splitsFor(bdid: number): Promise<ScheduledSplitRecord[]> {
    return db.query<ScheduledSplitRecord>(
      'SELECT * FROM BUDGETSPLITTRANSACTIONS_V1 WHERE TRANSID = ? ORDER BY SPLITTRANSID',
      [bdid],
    )
  },

  addStatement(values: Omit<ScheduledRecord, 'BDID'>): SqlStatement {
    return insertStatement('BILLSDEPOSITS_V1', { ...values })
  },

  updateStatement(bdid: number, values: Partial<Omit<ScheduledRecord, 'BDID'>>) {
    return updateStatement('BILLSDEPOSITS_V1', 'BDID', bdid, values)
  },

  /** Series due for attention, excluding legacy inactive entries. */
  async due(now = new Date()): Promise<ScheduledRecord[]> {
    const all = await this.all()
    return all.filter((series) => !isLegacyInactive(series) && isDue(series, now))
  },

  /**
   * The split rows' tag links go with the rows (openspec: Series Split Line
   * Replacement); the subquery resolves their ids inside the batch so the
   * statements can be built without a read.
   */
  splitLinkCleanupStatement(bdids: readonly number[]): SqlStatement {
    return {
      sql: `DELETE FROM TAGLINK_V1 WHERE REFTYPE = ? AND REFID IN
            (SELECT SPLITTRANSID FROM BUDGETSPLITTRANSACTIONS_V1 WHERE TRANSID IN (${placeholders(bdids.length)}))`,
      bind: [REFTYPE.recurringTransactionSplit, ...bdids],
    }
  },

  removeStatements(bdid: number): SqlStatement[] {
    return [
      ...extensionCleanupStatements(REFTYPE.recurringTransaction, [bdid]),
      {
        sql: `DELETE FROM TAGLINK_V1 WHERE REFTYPE = ? AND REFID IN
              (SELECT SPLITTRANSID FROM BUDGETSPLITTRANSACTIONS_V1 WHERE TRANSID = ?)`,
        bind: [REFTYPE.recurringTransactionSplit, bdid],
      },
      { sql: 'DELETE FROM BUDGETSPLITTRANSACTIONS_V1 WHERE TRANSID = ?', bind: [bdid] },
      { sql: 'DELETE FROM BILLSDEPOSITS_V1 WHERE BDID = ?', bind: [bdid] },
    ]
  },

  /** Statements advancing a series, or removing it once exhausted. */
  advanceStatements(series: ScheduledRecord): SqlStatement[] {
    const { series: advanced, exhausted } = advanceSeries(series)
    if (exhausted || !advanced) return this.removeStatements(series.BDID)
    return [
      this.updateStatement(series.BDID, {
        TRANSDATE: advanced.TRANSDATE,
        NEXTOCCURRENCEDATE: advanced.NEXTOCCURRENCEDATE,
        REPEATS: advanced.REPEATS,
        NUMOCCURRENCES: advanced.NUMOCCURRENCES,
      }),
    ]
  },

  /**
   * Materializes a ledger transaction from the series template for a date,
   * carrying the series' split lines across as ordinary splits.
   */
  async materializeStatements(
    series: ScheduledRecord,
    onDate: string,
    now = new Date(),
  ): Promise<SqlStatement[]> {
    const splits = await this.splitsFor(series.BDID)
    // The series row is copied as desktop copies it (fusedtransaction.cpp), with
    // desktop's values wherever the template holds nothing, so no column the
    // ledger fills with a sentinel is written as NULL and DELETEDTIME is empty
    // (openspec: transaction-ledger, Transaction Types, Schema Fidelity).
    const record: NormalizedTransaction = {
      ACCOUNTID: series.ACCOUNTID,
      TOACCOUNTID: series.TOACCOUNTID ?? NONE_ID,
      PAYEEID: series.PAYEEID ?? NONE_ID,
      TRANSCODE: transactionTypeCodec.decode(series.TRANSCODE),
      TRANSAMOUNT: series.TRANSAMOUNT,
      STATUS: statusKey(series.STATUS),
      TRANSACTIONNUMBER: series.TRANSACTIONNUMBER ?? '',
      NOTES: series.NOTES ?? '',
      CATEGID: series.CATEGID ?? NONE_ID,
      TRANSDATE: onDate,
      DELETEDTIME: '',
      FOLLOWUPID: series.FOLLOWUPID ?? NONE_ID,
      TOTRANSAMOUNT: series.TOTRANSAMOUNT ?? series.TRANSAMOUNT,
      COLOR: series.COLOR ?? NONE_ID,
    }

    // The batch runs in one transaction, and SQLite assigns a new INTEGER
    // PRIMARY KEY as one more than the largest key present, so MAX(TRANSID) is
    // the key the transaction insert just received for every split that
    // follows. last_insert_rowid() would be the previous split's own key after
    // the first one (openspec: Series Advancement on Execute or Skip).
    return [insertTransactionStatement(record, now), ...splitLineStatements('inserted', splits)]
  },

  /**
   * Whether executing this occurrence would breach the account's minimum
   * balance or credit limit; the caller must confirm before proceeding.
   */
  async breachesLimit(series: ScheduledRecord): Promise<boolean> {
    const account = await accountRepo.get(series.ACCOUNTID)
    if (!account) return false
    const transactions = await ledgerRepo.list({ accountId: series.ACCOUNTID })
    const current = accountBalance(account, transactions)
    const projected =
      current - (series.TRANSCODE === 'Deposit' ? -series.TRANSAMOUNT : series.TRANSAMOUNT)
    return breachesFloor(account, projected)
  },

  /**
   * Executes one occurrence: writes the ledger rows and advances the series in
   * a single atomic operation.
   */
  async executeOccurrence(bdid: number, onDate: string, now = new Date()): Promise<void> {
    const series = await this.get(bdid)
    if (!series) throw new Error(`Scheduled series ${bdid} not found`)
    if (isLegacyInactive(series)) {
      throw new Error('This series is inactive and cannot be executed')
    }
    const statements = [
      ...(await this.materializeStatements(series, onDate, now)),
      ...this.advanceStatements(series),
    ]
    await db.mutate(statements)
  },

  /** Skips one occurrence: advances the series without writing to the ledger. */
  async skipOccurrence(bdid: number): Promise<void> {
    const series = await this.get(bdid)
    if (!series) throw new Error(`Scheduled series ${bdid} not found`)
    await db.mutate(this.advanceStatements(series))
  },

  /**
   * Runs the silent-mode series that are due. Prompt-mode series are returned
   * for the caller to surface non-modally (operator decision 2026-08-08).
   */
  async processDue(
    now = new Date(),
  ): Promise<{ executed: number[]; needsPrompt: ScheduledRecord[] }> {
    const due = await this.due(now)
    const executed: number[] = []
    const needsPrompt: ScheduledRecord[] = []
    for (const series of due) {
      const mode = effectiveAutoExecute(series)
      if (mode === 2) {
        await this.executeOccurrence(series.BDID, series.NEXTOCCURRENCEDATE ?? '', now)
        executed.push(series.BDID)
      } else if (mode === 1) {
        needsPrompt.push(series)
      }
    }
    return { executed, needsPrompt }
  },

  /**
   * Replaces a series' split lines as desktop does (Model_Budgetsplittransaction::update
   * replaces the rows), writing each row's tag links right after it while
   * MAX(SPLITTRANSID) is that row's key. BILLSDEPOSITS_V1 has no update stamp.
   */
  replaceSplitsStatements(
    bdid: number,
    splits: readonly (Omit<ScheduledSplitRecord, 'SPLITTRANSID' | 'TRANSID'> & {
      tagIds?: readonly number[]
    })[],
  ): SqlStatement[] {
    const statements: SqlStatement[] = [
      {
        sql: `DELETE FROM TAGLINK_V1 WHERE REFTYPE = ? AND REFID IN
              (SELECT SPLITTRANSID FROM BUDGETSPLITTRANSACTIONS_V1 WHERE TRANSID = ?)`,
        bind: [REFTYPE.recurringTransactionSplit, bdid],
      },
      { sql: 'DELETE FROM BUDGETSPLITTRANSACTIONS_V1 WHERE TRANSID = ?', bind: [bdid] },
    ]
    for (const split of splits) {
      statements.push(
        insertStatement('BUDGETSPLITTRANSACTIONS_V1', {
          TRANSID: bdid,
          CATEGID: split.CATEGID,
          SPLITTRANSAMOUNT: split.SPLITTRANSAMOUNT,
          NOTES: split.NOTES,
        }),
        ...(split.tagIds ?? []).map((tagId) => ({
          sql: `INSERT OR IGNORE INTO TAGLINK_V1 (REFTYPE, REFID, TAGID)
                VALUES (?, (SELECT MAX(SPLITTRANSID) FROM BUDGETSPLITTRANSACTIONS_V1), ?)`,
          bind: [REFTYPE.recurringTransactionSplit, tagId],
        })),
      )
    }
    return statements
  },

  async removeMany(bdids: readonly number[]): Promise<void> {
    if (bdids.length === 0) return
    const list = placeholders(bdids.length)
    await db.mutate([
      ...extensionCleanupStatements(REFTYPE.recurringTransaction, bdids),
      this.splitLinkCleanupStatement(bdids),
      {
        sql: `DELETE FROM BUDGETSPLITTRANSACTIONS_V1 WHERE TRANSID IN (${list})`,
        bind: [...bdids],
      },
      { sql: `DELETE FROM BILLSDEPOSITS_V1 WHERE BDID IN (${list})`, bind: [...bdids] },
    ])
  },
}
