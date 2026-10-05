import { LINKTYPE, REFTYPE, isoDatePart } from '../conventions'
import { db, insertStatement, updateStatement, type SqlStatement } from '../db'
import type { AssetRecord, TransactionRecord, TransLinkRecord } from '../records'
import { assetValueWriteBack, valueAtDate, type LinkedAssetTransaction } from '../rules/asset'
import { applyTransactionOverrides, type TransactionOverrides } from '../rules/ledger'
import { dayRateFor } from './currency'
import { extensionCleanupStatements } from './extensions'

/**
 * Assets (openspec: asset-tracking). ASSETS_V1.VALUE is a derived cache written
 * back whenever a linked transaction changes.
 */

export const assetRepo = {
  async all(): Promise<AssetRecord[]> {
    return db.query<AssetRecord>('SELECT * FROM ASSETS_V1 ORDER BY ASSETNAME')
  },

  async get(assetId: number): Promise<AssetRecord | null> {
    const rows = await db.query<AssetRecord>('SELECT * FROM ASSETS_V1 WHERE ASSETID = ?', [assetId])
    return rows[0] ?? null
  },

  addStatement(values: Omit<AssetRecord, 'ASSETID'>): SqlStatement {
    return insertStatement('ASSETS_V1', { ...values })
  },

  updateStatement(assetId: number, values: Partial<Omit<AssetRecord, 'ASSETID'>>) {
    return updateStatement('ASSETS_V1', 'ASSETID', assetId, values)
  },

  /**
   * Linked ledger rows with the conversion rate for each one's own date, which
   * is what the valuation replay needs.
   */
  async linkedTransactions(assetId: number): Promise<LinkedAssetTransaction[]> {
    return (await this.linkedRows(assetId)).map((row) => row.linked)
  },

  /** The same rows with their transaction ids, which the post-state overrides are keyed by. */
  async linkedRows(assetId: number): Promise<{ id: number; linked: LinkedAssetTransaction }[]> {
    const rows = await db.query<TransactionRecord & { CURRENCYID: number }>(
      `SELECT c.TRANSID, c.ACCOUNTID, c.TOACCOUNTID, c.TRANSCODE, c.TRANSAMOUNT, c.TOTRANSAMOUNT,
              c.STATUS, c.DELETEDTIME, c.TRANSDATE, a.CURRENCYID
       FROM TRANSLINK_V1 l
       JOIN CHECKINGACCOUNT_V1 c ON c.TRANSID = l.CHECKINGACCOUNTID
       LEFT JOIN ACCOUNTLIST_V1 a ON a.ACCOUNTID = c.ACCOUNTID
       WHERE l.LINKTYPE = ? AND l.LINKRECORDID = ?
       ORDER BY c.TRANSDATE, c.TRANSID`,
      [LINKTYPE.asset, assetId],
    )

    const linked: { id: number; linked: LinkedAssetTransaction }[] = []
    for (const row of rows) {
      linked.push({
        id: row.TRANSID,
        linked: {
          transaction: {
            ACCOUNTID: row.ACCOUNTID,
            TOACCOUNTID: row.TOACCOUNTID,
            TRANSCODE: row.TRANSCODE,
            TRANSAMOUNT: row.TRANSAMOUNT,
            TOTRANSAMOUNT: row.TOTRANSAMOUNT,
            STATUS: row.STATUS,
            DELETEDTIME: row.DELETEDTIME,
            TRANSDATE: row.TRANSDATE,
          },
          dayRate: await dayRateFor(row.CURRENCYID ?? -1, isoDatePart(row.TRANSDATE)),
        },
      })
    }
    return linked
  },

  /** Cost and market value on a date, in the base currency. */
  async valueOn(assetId: number, onDate: Date): Promise<{ cost: number; market: number }> {
    const asset = await this.get(assetId)
    if (!asset) return { cost: 0, market: 0 }
    const links = await this.linkedTransactions(assetId)
    return valueAtDate(asset, links, onDate)
  },

  /**
   * Statements refreshing the cached VALUE column from the linked transactions.
   * `overrides` gives the state those transactions will have once the operation
   * that invalidated the cache has run, so the update can ride in its batch.
   */
  async recomputeStatements(
    assetId: number,
    options: { overrides?: TransactionOverrides } = {},
  ): Promise<SqlStatement[]> {
    const asset = await this.get(assetId)
    if (!asset) return []
    const links = applyTransactionOverrides(
      await this.linkedRows(assetId),
      (row) => row.id,
      (row, values) => ({
        ...row,
        linked: { ...row.linked, transaction: { ...row.linked.transaction, ...values } },
      }),
      options.overrides,
    ).map((row) => row.linked)
    if (links.length === 0) return []
    return [this.updateStatement(assetId, { VALUE: assetValueWriteBack(links) })]
  },

  async recompute(assetId: number): Promise<void> {
    await db.mutate(await this.recomputeStatements(assetId))
  },

  /** Assets affected by a set of ledger rows, so a change can refresh them. */
  async assetIdsForTransactions(transactionIds: readonly number[]): Promise<number[]> {
    if (transactionIds.length === 0) return []
    const rows = await db.query<Pick<TransLinkRecord, 'LINKRECORDID'>>(
      `SELECT DISTINCT LINKRECORDID FROM TRANSLINK_V1
       WHERE LINKTYPE = ? AND CHECKINGACCOUNTID IN (${transactionIds.map(() => '?').join(', ')})`,
      [LINKTYPE.asset, ...transactionIds],
    )
    return rows.map((row) => row.LINKRECORDID)
  },

  async removeStatements(assetId: number): Promise<SqlStatement[]> {
    return [
      ...extensionCleanupStatements(REFTYPE.asset, [assetId]),
      {
        sql: 'DELETE FROM TRANSLINK_V1 WHERE LINKTYPE = ? AND LINKRECORDID = ?',
        bind: [LINKTYPE.asset, assetId],
      },
      { sql: 'DELETE FROM ASSETS_V1 WHERE ASSETID = ?', bind: [assetId] },
    ]
  },

  async remove(assetId: number): Promise<void> {
    await db.mutate(await this.removeStatements(assetId))
  },
}
