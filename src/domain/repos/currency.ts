import { db, insertStatement, updateStatement, type SqlStatement } from '../db'
import type { CurrencyHistoryRecord, CurrencyRecord } from '../records'
import { resolveDayRate, type RateContext } from '../rules/currency'
import { fileFacts, infoRepo } from './metadata'
import { INFO_KEY } from '../rules/metadata'

/** Currencies and exchange-rate history (openspec: currency-management). */

/** Why an addition or edit was refused: the name or the code collides with another currency. */
export class CurrencyConflictError extends Error {
  constructor(
    readonly field: 'name' | 'symbol',
    readonly other: Pick<CurrencyRecord, 'CURRENCYID' | 'CURRENCYNAME' | 'CURRENCY_SYMBOL'>,
  ) {
    super(`currency ${field} conflicts with "${other.CURRENCYNAME}" (${other.CURRENCY_SYMBOL})`)
    this.name = 'CurrencyConflictError'
  }
}

/** What keeps a currency in use: the base pointer, accounts, or assets. */
export type CurrencyUsage = 'base' | 'accounts' | 'assets'

export class CurrencyInUseError extends Error {
  constructor(readonly reason: CurrencyUsage) {
    super(`currency is in use: ${reason}`)
    this.name = 'CurrencyInUseError'
  }
}

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

  /**
   * Changes the base currency as desktop's SetBaseCurrency does: every stored
   * rate is denominated in the old base, so the pointer moves, every
   * BASECONVRATE becomes 1 and the rate history is emptied, in one transaction
   * (openspec: currency-management, Base Currency).
   */
  async changeBase(currencyId: number): Promise<void> {
    await db.mutate([
      infoRepo.setStatement(INFO_KEY.baseCurrencyId, String(currencyId)),
      { sql: 'UPDATE CURRENCYFORMATS_V1 SET BASECONVRATE = 1', bind: [] },
      { sql: 'DELETE FROM CURRENCYHISTORY_V1', bind: [] },
    ])
  },

  /** Throws the typed conflict, naming the field that collides, or returns quietly. */
  async refuseConflict(name: string, symbol: string, excludeCurrencyId?: number): Promise<void> {
    const conflict = await this.findConflict(name, symbol, excludeCurrencyId)
    if (!conflict) return
    const field =
      name !== '' && conflict.CURRENCYNAME.toLocaleLowerCase() === name.toLocaleLowerCase()
        ? 'name'
        : 'symbol'
    throw new CurrencyConflictError(field, conflict)
  },

  /** Applies an edit after refusing a name or symbol another currency holds. */
  async save(
    currencyId: number,
    values: Partial<Omit<CurrencyRecord, 'CURRENCYID'>>,
  ): Promise<void> {
    if (values.CURRENCYNAME !== undefined || values.CURRENCY_SYMBOL !== undefined) {
      await this.refuseConflict(values.CURRENCYNAME ?? '', values.CURRENCY_SYMBOL ?? '', currencyId)
    }
    await db.mutate([this.updateStatement(currencyId, values)])
  },

  async add(values: Omit<CurrencyRecord, 'CURRENCYID'>): Promise<void> {
    await this.refuseConflict(values.CURRENCYNAME, values.CURRENCY_SYMBOL ?? '')
    await db.mutate([this.addStatement(values)])
  },

  /**
   * Which currencies accounts reference and which assets reference, in one
   * pass, so the surface can say why a currency cannot be deleted.
   */
  async currencyUsage(): Promise<{ accounts: Set<number>; assets: Set<number> }> {
    const rows = await db.query<{ CURRENCYID: number; SOURCE: string }>(
      `SELECT DISTINCT CURRENCYID, 'accounts' AS SOURCE FROM ACCOUNTLIST_V1 WHERE CURRENCYID IS NOT NULL
       UNION
       SELECT DISTINCT CURRENCYID, 'assets' AS SOURCE FROM ASSETS_V1 WHERE CURRENCYID IS NOT NULL`,
    )
    return {
      accounts: new Set(rows.filter((r) => r.SOURCE === 'accounts').map((r) => r.CURRENCYID)),
      assets: new Set(rows.filter((r) => r.SOURCE === 'assets').map((r) => r.CURRENCYID)),
    }
  },

  /** Each currency's most recent recorded rate, in one query (design D5). */
  async latestRatesByCurrency(): Promise<Map<number, number>> {
    const rows = await db.query<{ CURRENCYID: number; CURRVALUE: number }>(
      `SELECT h.CURRENCYID, h.CURRVALUE FROM CURRENCYHISTORY_V1 h
       JOIN (SELECT CURRENCYID, MAX(CURRDATE) AS CURRDATE FROM CURRENCYHISTORY_V1 GROUP BY CURRENCYID) m
         ON m.CURRENCYID = h.CURRENCYID AND m.CURRDATE = h.CURRDATE`,
    )
    return new Map(rows.map((row) => [row.CURRENCYID, row.CURRVALUE]))
  },

  /**
   * What keeps a currency in use, in the order desktop's own checks run: the
   * base pointer, then accounts (any status, deliberately stricter than
   * desktop's open-only rule, design D2), then assets. Null when unused.
   */
  async usageOf(currencyId: number): Promise<CurrencyUsage | null> {
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
    if (baseCurrencyId === currencyId) return 'base'
    if ((accounts[0]?.count ?? 0) > 0) return 'accounts'
    if ((assets[0]?.count ?? 0) > 0) return 'assets'
    return null
  },

  /** True when an account, an asset, or the base-currency pointer references it. */
  async isInUse(currencyId: number): Promise<boolean> {
    return (await this.usageOf(currencyId)) !== null
  },

  /**
   * Deleting an unused currency removes its rate history in the same atomic
   * operation; a currency in use cannot be deleted at all.
   */
  async remove(currencyId: number): Promise<void> {
    const usage = await this.usageOf(currencyId)
    if (usage) throw new CurrencyInUseError(usage)
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
