import { LINKTYPE, REFTYPE, UPDATE_TYPE, isoDatePart } from '../conventions'
import { db, insertStatement, updateStatement, type SqlStatement } from '../db'
import type {
  ShareInfoRecord,
  StockHistoryRecord,
  StockRecord,
  TransactionRecord,
  TransLinkRecord,
} from '../records'
import { positionWriteBack, tradeCashAmount, type LinkedTrade } from '../rules/investment'
import { extensionCleanupStatements } from './extensions'
import { ledgerRepo } from './ledger'

/**
 * Stock positions and share trades (openspec: investment-tracking). The position
 * summary columns are derived caches, so every mutation that touches a linked
 * transaction must write them back in the same atomic operation.
 */

export const stockRepo = {
  async all(): Promise<StockRecord[]> {
    return db.query<StockRecord>('SELECT * FROM STOCK_V1 ORDER BY STOCKNAME')
  },

  async listForAccount(accountId: number): Promise<StockRecord[]> {
    return db.query<StockRecord>('SELECT * FROM STOCK_V1 WHERE HELDAT = ? ORDER BY STOCKNAME', [
      accountId,
    ])
  },

  async get(stockId: number): Promise<StockRecord | null> {
    const rows = await db.query<StockRecord>('SELECT * FROM STOCK_V1 WHERE STOCKID = ?', [stockId])
    return rows[0] ?? null
  },

  addStatement(values: Omit<StockRecord, 'STOCKID'>): SqlStatement {
    return insertStatement('STOCK_V1', { ...values })
  },

  /** The linked ledger rows and their share detail, in one shape for the cost book. */
  async linkedTrades(stockId: number): Promise<LinkedTrade[]> {
    const rows = await db.query<TransactionRecord & ShareInfoRecord>(
      `SELECT c.TRANSID, c.TRANSDATE, c.STATUS, c.DELETEDTIME,
              s.SHARENUMBER, s.SHAREPRICE, s.SHARECOMMISSION
       FROM TRANSLINK_V1 l
       JOIN CHECKINGACCOUNT_V1 c ON c.TRANSID = l.CHECKINGACCOUNTID
       LEFT JOIN SHAREINFO_V1 s ON s.CHECKINGACCOUNTID = l.CHECKINGACCOUNTID
       WHERE l.LINKTYPE = ? AND l.LINKRECORDID = ?
       ORDER BY c.TRANSDATE, c.TRANSID`,
      [LINKTYPE.stock, stockId],
    )
    return rows.map((row) => ({
      transaction: {
        TRANSID: row.TRANSID,
        TRANSDATE: row.TRANSDATE,
        STATUS: row.STATUS,
        DELETEDTIME: row.DELETEDTIME,
      },
      share: {
        SHARENUMBER: row.SHARENUMBER,
        SHAREPRICE: row.SHAREPRICE,
        SHARECOMMISSION: row.SHARECOMMISSION,
      },
    }))
  },

  /**
   * Statements refreshing the cached position fields. Folded into whichever
   * operation invalidated them, never applied on its own afterwards.
   */
  async recomputeStatements(stockId: number, now = new Date()): Promise<SqlStatement[]> {
    const stock = await this.get(stockId)
    if (!stock) return []
    const trades = await this.linkedTrades(stockId)
    const values = positionWriteBack(stock, trades, now)
    return [updateStatement('STOCK_V1', 'STOCKID', stockId, values)]
  },

  async recompute(stockId: number, now = new Date()): Promise<void> {
    await db.mutate(await this.recomputeStatements(stockId, now))
  },

  /** Positions affected by a set of ledger rows, so a change can refresh them. */
  async stockIdsForTransactions(transactionIds: readonly number[]): Promise<number[]> {
    if (transactionIds.length === 0) return []
    const rows = await db.query<Pick<TransLinkRecord, 'LINKRECORDID'>>(
      `SELECT DISTINCT LINKRECORDID FROM TRANSLINK_V1
       WHERE LINKTYPE = ? AND CHECKINGACCOUNTID IN (${transactionIds.map(() => '?').join(', ')})`,
      [LINKTYPE.stock, ...transactionIds],
    )
    return rows.map((row) => row.LINKRECORDID)
  },

  /**
   * Records a trade as the upstream triple -- ledger row, link, share detail --
   * plus a manual price point, then refreshes the cached position. A sell is a
   * Deposit carrying a negative share count.
   */
  async recordTrade(input: {
    stockId: number
    accountId: number
    shares: number
    price: number
    commission: number
    lot?: string
    date: string
    categoryId?: number
    payeeId?: number
    notes?: string
    now?: Date
  }): Promise<void> {
    const now = input.now ?? new Date()
    const stock = await this.get(input.stockId)
    if (!stock) throw new Error(`Stock position ${input.stockId} not found`)

    const isBuy = input.shares >= 0
    const amount = tradeCashAmount(input.shares, input.price, input.commission)

    const statements: SqlStatement[] = [
      ledgerRepo.addStatement(
        {
          ACCOUNTID: input.accountId,
          TOACCOUNTID: null,
          // PAYEEID is NOT NULL; desktop writes -1 for a trade with no payee.
          PAYEEID: input.payeeId ?? -1,
          TRANSCODE: isBuy ? 'Withdrawal' : 'Deposit',
          TRANSAMOUNT: amount,
          STATUS: '',
          TRANSACTIONNUMBER: null,
          NOTES: input.notes ?? null,
          CATEGID: input.categoryId ?? null,
          TRANSDATE: input.date,
          LASTUPDATEDTIME: null,
          DELETEDTIME: null,
          FOLLOWUPID: null,
          TOTRANSAMOUNT: amount,
          COLOR: -1,
        },
        { now },
      ),
      {
        sql: `INSERT INTO TRANSLINK_V1 (CHECKINGACCOUNTID, LINKTYPE, LINKRECORDID)
              VALUES (last_insert_rowid(), ?, ?)`,
        bind: [LINKTYPE.stock, input.stockId],
      },
      {
        sql: `INSERT INTO SHAREINFO_V1 (CHECKINGACCOUNTID, SHARENUMBER, SHAREPRICE, SHARECOMMISSION, SHARELOT)
              SELECT CHECKINGACCOUNTID, ?, ?, ?, ? FROM TRANSLINK_V1 WHERE TRANSLINKID = last_insert_rowid()`,
        bind: [input.shares, input.price, input.commission, input.lot ?? ''],
      },
    ]

    // Free "loyalty" shares carry no price and must not create a history point.
    if (input.price !== 0 && stock.SYMBOL) {
      statements.push(
        stockHistoryRepo.upsertStatement({
          SYMBOL: stock.SYMBOL,
          DATE: isoDatePart(input.date),
          VALUE: input.price,
          UPDTYPE: UPDATE_TYPE.manual,
        }),
      )
    }

    await db.mutate(statements)
    await this.recompute(input.stockId, now)
  },

  /**
   * Deleting a position drops its price history only when no other position
   * uses the same symbol.
   */
  async removeStatements(stockId: number): Promise<SqlStatement[]> {
    const stock = await this.get(stockId)
    if (!stock) return []
    const statements: SqlStatement[] = [
      ...extensionCleanupStatements(REFTYPE.stock, [stockId]),
      {
        sql: 'DELETE FROM TRANSLINK_V1 WHERE LINKTYPE = ? AND LINKRECORDID = ?',
        bind: [LINKTYPE.stock, stockId],
      },
      { sql: 'DELETE FROM STOCK_V1 WHERE STOCKID = ?', bind: [stockId] },
    ]
    if (stock.SYMBOL) {
      const others = await db.query<{ count: number }>(
        'SELECT COUNT(*) AS count FROM STOCK_V1 WHERE SYMBOL = ? AND STOCKID <> ?',
        [stock.SYMBOL, stockId],
      )
      if ((others[0]?.count ?? 0) === 0) {
        statements.push({
          sql: 'DELETE FROM STOCKHISTORY_V1 WHERE SYMBOL = ?',
          bind: [stock.SYMBOL],
        })
      }
    }
    return statements
  },

  async remove(stockId: number): Promise<void> {
    await db.mutate(await this.removeStatements(stockId))
  },
}

export const stockHistoryRepo = {
  async listFor(symbol: string): Promise<StockHistoryRecord[]> {
    return db.query<StockHistoryRecord>(
      'SELECT * FROM STOCKHISTORY_V1 WHERE SYMBOL = ? ORDER BY DATE',
      [symbol],
    )
  },

  /** Unique per (SYMBOL, DATE): a second price for a day replaces the first. */
  upsertStatement(row: Omit<StockHistoryRecord, 'HISTID'>): SqlStatement {
    return {
      sql: `INSERT INTO STOCKHISTORY_V1 (SYMBOL, DATE, VALUE, UPDTYPE) VALUES (?, ?, ?, ?)
            ON CONFLICT(SYMBOL, DATE) DO UPDATE SET VALUE = excluded.VALUE, UPDTYPE = excluded.UPDTYPE`,
      bind: [row.SYMBOL, row.DATE, row.VALUE, row.UPDTYPE],
    }
  },

  /** A price update propagates to every position holding that symbol. */
  updateCurrentPriceStatement(symbol: string, price: number): SqlStatement {
    return { sql: 'UPDATE STOCK_V1 SET CURRENTPRICE = ? WHERE SYMBOL = ?', bind: [price, symbol] }
  },
}
