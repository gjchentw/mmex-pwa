import { db, insertStatement, updateStatement, type SqlStatement } from '../db'
import type { CurrencyHistoryRecord, CurrencyRecord } from '../records'
import { resolveDayRate, type RateContext } from '../rules/currency'
import { fileFacts } from './metadata'

/** Currencies and exchange-rate history (openspec: currency-management). */

export const currencyRepo = {
  async all(): Promise<CurrencyRecord[]> {
    return db.query<CurrencyRecord>('SELECT * FROM CURRENCYFORMATS_V1 ORDER BY CURRENCYNAME')
  },

  async get(currencyId: number): Promise<CurrencyRecord | null> {
    const rows = await db.query<CurrencyRecord>(
      'SELECT * FROM CURRENCYFORMATS_V1 WHERE CURRENCYID = ?',
      [currencyId],
    )
    return rows[0] ?? null
  },

  /** Name and symbol uniqueness is case-insensitive, per the NOCASE columns. */
  async findConflict(
    name: string,
    symbol: string,
    excludeCurrencyId?: number,
  ): Promise<CurrencyRecord | null> {
    const rows = await db.query<CurrencyRecord>(
      `SELECT * FROM CURRENCYFORMATS_V1
       WHERE (CURRENCYNAME = ? COLLATE NOCASE OR CURRENCY_SYMBOL = ? COLLATE NOCASE)
         AND CURRENCYID <> ?`,
      [name, symbol, excludeCurrencyId ?? -1],
    )
    return rows[0] ?? null
  },

  addStatement(values: Omit<CurrencyRecord, 'CURRENCYID'>): SqlStatement {
    return insertStatement('CURRENCYFORMATS_V1', { ...values })
  },

  updateStatement(currencyId: number, values: Partial<Omit<CurrencyRecord, 'CURRENCYID'>>) {
    return updateStatement('CURRENCYFORMATS_V1', 'CURRENCYID', currencyId, values)
  },

  /** Applies an edit after refusing a name or symbol another currency holds. */
  async save(
    currencyId: number,
    values: Partial<Omit<CurrencyRecord, 'CURRENCYID'>>,
  ): Promise<void> {
    if (values.CURRENCYNAME !== undefined || values.CURRENCY_SYMBOL !== undefined) {
      const conflict = await this.findConflict(
        values.CURRENCYNAME ?? '',
        values.CURRENCY_SYMBOL ?? '',
        currencyId,
      )
      if (conflict) {
        throw new Error(`A currency named "${conflict.CURRENCYNAME}" already exists`)
      }
    }
    await db.mutate([this.updateStatement(currencyId, values)])
  },

  async add(values: Omit<CurrencyRecord, 'CURRENCYID'>): Promise<void> {
    const conflict = await this.findConflict(values.CURRENCYNAME, values.CURRENCY_SYMBOL)
    if (conflict) {
      throw new Error(`A currency named "${conflict.CURRENCYNAME}" already exists`)
    }
    await db.mutate([this.addStatement(values)])
  },

  /**
   * The currencies anything references, in one pass. Asking `isInUse` per
   * currency would issue hundreds of queries against a seeded file, which
   * carries 168 of them.
   */
  async usedCurrencyIds(): Promise<Set<number>> {
    const rows = await db.query<{ CURRENCYID: number }>(
      `SELECT DISTINCT CURRENCYID FROM ACCOUNTLIST_V1 WHERE CURRENCYID IS NOT NULL
       UNION
       SELECT DISTINCT CURRENCYID FROM ASSETS_V1 WHERE CURRENCYID IS NOT NULL`,
    )
    return new Set(rows.map((row) => row.CURRENCYID))
  },

  /** True when an account, an asset, or the base-currency pointer references it. */
  async isInUse(currencyId: number): Promise<boolean> {
    const [accounts, assets, baseCurrencyId] = await Promise.all([
      db.query<{ count: number }>(
        'SELECT COUNT(*) AS count FROM ACCOUNTLIST_V1 WHERE CURRENCYID = ?',
        [currencyId],
      ),
      db.query<{ count: number }>('SELECT COUNT(*) AS count FROM ASSETS_V1 WHERE CURRENCYID = ?', [
        currencyId,
      ]),
      fileFacts.baseCurrencyId(),
    ])
    if (baseCurrencyId === currencyId) return true
    return (accounts[0]?.count ?? 0) > 0 || (assets[0]?.count ?? 0) > 0
  },

  /**
   * Deleting an unused currency removes its rate history in the same atomic
   * operation; a currency in use cannot be deleted at all.
   */
  async remove(currencyId: number): Promise<void> {
    if (await this.isInUse(currencyId)) {
      throw new Error('Currency is in use and cannot be deleted')
    }
    await db.mutate([
      { sql: 'DELETE FROM CURRENCYHISTORY_V1 WHERE CURRENCYID = ?', bind: [currencyId] },
      { sql: 'DELETE FROM CURRENCYFORMATS_V1 WHERE CURRENCYID = ?', bind: [currencyId] },
    ])
  },
}

export const currencyHistoryRepo = {
  async listFor(currencyId: number): Promise<CurrencyHistoryRecord[]> {
    return db.query<CurrencyHistoryRecord>(
      'SELECT * FROM CURRENCYHISTORY_V1 WHERE CURRENCYID = ? ORDER BY CURRDATE',
      [currencyId],
    )
  },

  /** Unique per (CURRENCYID, CURRDATE): a second rate for a day replaces the first. */
  upsertStatement(row: Omit<CurrencyHistoryRecord, 'CURRHISTID'>): SqlStatement {
    return {
      sql: `INSERT INTO CURRENCYHISTORY_V1 (CURRENCYID, CURRDATE, CURRVALUE, CURRUPDTYPE)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(CURRENCYID, CURRDATE) DO UPDATE SET
              CURRVALUE = excluded.CURRVALUE, CURRUPDTYPE = excluded.CURRUPDTYPE`,
      bind: [row.CURRENCYID, row.CURRDATE, row.CURRVALUE, row.CURRUPDTYPE],
    }
  },

  removeStatement(histId: number): SqlStatement {
    return { sql: 'DELETE FROM CURRENCYHISTORY_V1 WHERE CURRHISTID = ?', bind: [histId] }
  },

  async remove(histId: number): Promise<void> {
    await db.mutate([this.removeStatement(histId)])
  },

  async record(row: Omit<CurrencyHistoryRecord, 'CURRHISTID'>): Promise<void> {
    await db.mutate([this.upsertStatement(row)])
  },

  async clearAll(): Promise<void> {
    await db.mutate([{ sql: 'DELETE FROM CURRENCYHISTORY_V1' }])
  },
}

/** Reads the file facts that govern conversion, then applies the pure rule. */
export const rateContext = async (): Promise<RateContext> => ({
  baseCurrencyId: await fileFacts.baseCurrencyId(),
  useCurrencyHistory: await fileFacts.useCurrencyHistory(),
})

export const dayRateFor = async (currencyId: number, isoDate: string): Promise<number> => {
  const context = await rateContext()
  if (!context.useCurrencyHistory) {
    const currency = await currencyRepo.get(currencyId)
    return currency?.BASECONVRATE ?? 1
  }
  if (currencyId === context.baseCurrencyId || currencyId === -1) return 1
  const [currency, history] = await Promise.all([
    currencyRepo.get(currencyId),
    currencyHistoryRepo.listFor(currencyId),
  ])
  return resolveDayRate(currency, history, isoDate, context)
}
