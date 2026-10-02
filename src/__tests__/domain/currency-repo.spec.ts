import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const { MockWorker } = vi.hoisted(() => {
  class MockWorker {
    postMessage = vi.fn()
    addEventListener = vi.fn()
    removeEventListener = vi.fn()
    terminate = vi.fn()
  }
  return { MockWorker }
})

vi.mock('../../workers/sqlite.worker?worker', () => ({ default: MockWorker }))

import { setDomainDb, type DomainDb, type SqlStatement } from '../../domain/db'
import {
  CurrencyConflictError,
  CurrencyInUseError,
  currencyRepo,
} from '../../domain/repos/currency'
import { fileFacts } from '../../domain/repos/metadata'
import type { CurrencyRecord } from '../../domain/records'

/** Spec: currency-management (delta: desktop fidelity), the repository's typed refusals. */

const currency = (id: number, name: string, symbol: string): CurrencyRecord => ({
  CURRENCYID: id,
  CURRENCYNAME: name,
  PFX_SYMBOL: '',
  SFX_SYMBOL: '',
  DECIMAL_POINT: '.',
  GROUP_SEPARATOR: ',',
  UNIT_NAME: '',
  CENT_NAME: '',
  SCALE: 100,
  BASECONVRATE: 1,
  CURRENCY_SYMBOL: symbol,
  CURRENCY_TYPE: 'Fiat',
})

const makeFakeDb = () => {
  const state = {
    currencies: [currency(1, 'US dollar', 'USD'), currency(2, 'Euro', 'EUR')],
    accountCounts: {} as Record<number, number>,
    assetCounts: {} as Record<number, number>,
    info: new Map<string, string>([['BASECURRENCYID', '1']]),
    latest: [] as { CURRENCYID: number; CURRVALUE: number }[],
  }
  const batches: SqlStatement[][] = []
  const db: DomainDb = {
    async query<T>(sql: string, bind?: unknown[]): Promise<T[]> {
      if (sql.includes('COLLATE NOCASE')) {
        const [name, symbol, exclude] = bind as [string, string, number]
        return state.currencies.filter(
          (c) =>
            c.CURRENCYID !== exclude &&
            (c.CURRENCYNAME.toLowerCase() === String(name).toLowerCase() ||
              (c.CURRENCY_SYMBOL ?? '').toLowerCase() === String(symbol).toLowerCase()),
        ) as T[]
      }
      if (sql.includes('COUNT(*)') && sql.includes('ACCOUNTLIST_V1')) {
        return [{ count: state.accountCounts[bind?.[0] as number] ?? 0 }] as T[]
      }
      if (sql.includes('COUNT(*)') && sql.includes('ASSETS_V1')) {
        return [{ count: state.assetCounts[bind?.[0] as number] ?? 0 }] as T[]
      }
      if (sql.includes('FROM INFOTABLE_V1')) {
        const value = state.info.get(String(bind?.[0]))
        return (value === undefined ? [] : [{ INFOVALUE: value }]) as T[]
      }
      if (sql.includes('MAX(CURRDATE)')) return state.latest as T[]
      return [] as T[]
    },
    async mutate(statements: SqlStatement[]): Promise<void> {
      batches.push(statements)
    },
  }
  return { db, state, batches }
}

let fake: ReturnType<typeof makeFakeDb>

beforeEach(() => {
  fake = makeFakeDb()
  setDomainDb(fake.db)
})

afterEach(() => setDomainDb())

describe('definition conflicts', () => {
  // Scenario "A conflicting code is refused by its own name" (design D9).
  it('names the symbol when only the symbol collides', async () => {
    const attempt = currencyRepo.add({ ...currency(0, 'Something else', 'eur') })

    await expect(attempt).rejects.toBeInstanceOf(CurrencyConflictError)
    await attempt.catch((err: CurrencyConflictError) => {
      expect(err.field).toBe('symbol')
      expect(err.other.CURRENCYNAME).toBe('Euro')
    })
    expect(fake.batches).toHaveLength(0)
  })

  // Scenario "A conflicting name is refused".
  it('names the name when the name collides, in any letter case', async () => {
    const attempt = currencyRepo.save(2, { CURRENCYNAME: 'us DOLLAR', CURRENCY_SYMBOL: 'EUR' })

    await expect(attempt).rejects.toBeInstanceOf(CurrencyConflictError)
    await attempt.catch((err: CurrencyConflictError) => expect(err.field).toBe('name'))
  })

  it('writes an edit that collides with nothing, without the key', async () => {
    await currencyRepo.save(2, { CURRENCYNAME: 'Euro area euro', CURRENCY_SYMBOL: 'EUR' })

    expect(fake.batches).toHaveLength(1)
    const [statement] = fake.batches[0]!
    expect(statement!.sql).toContain('UPDATE CURRENCYFORMATS_V1')
    expect(statement!.sql).not.toContain('CURRENCYID = ?,')
  })
})

describe('deletion refusals', () => {
  // Requirement "Currency Deletion From the Surface": the reason is named.
  it('names the base currency', async () => {
    await expect(currencyRepo.remove(1)).rejects.toBeInstanceOf(CurrencyInUseError)
    await currencyRepo.remove(1).catch((err: CurrencyInUseError) => expect(err.reason).toBe('base'))
  })

  it('names accounts, closed ones included (design D2)', async () => {
    fake.state.accountCounts[2] = 1
    await currencyRepo
      .remove(2)
      .catch((err: CurrencyInUseError) => expect(err.reason).toBe('accounts'))
    expect(fake.batches).toHaveLength(0)
  })

  it('names assets', async () => {
    fake.state.assetCounts[2] = 1
    await currencyRepo
      .remove(2)
      .catch((err: CurrencyInUseError) => expect(err.reason).toBe('assets'))
  })

  it('reports no usage for an unused currency and deletes it with its history', async () => {
    expect(await currencyRepo.usageOf(2)).toBeNull()
    await currencyRepo.remove(2)

    expect(fake.batches).toHaveLength(1)
    expect(fake.batches[0]!.map((s) => s.sql)).toEqual([
      'DELETE FROM CURRENCYHISTORY_V1 WHERE CURRENCYID = ?',
      'DELETE FROM CURRENCYFORMATS_V1 WHERE CURRENCYID = ?',
    ])
  })
})

describe('latest rates and the list scope', () => {
  // Design D5, risk R3: one query, one value per currency.
  it('maps each currency to its most recent rate', async () => {
    fake.state.latest = [
      { CURRENCYID: 2, CURRVALUE: 1.3 },
      { CURRENCYID: 3, CURRVALUE: 0.9 },
    ]
    const latest = await currencyRepo.latestRatesByCurrency()

    expect(latest.get(2)).toBe(1.3)
    expect(latest.get(3)).toBe(0.9)
    expect(latest.has(1)).toBe(false)
  })

  // Scenario "Every currency is listed when the file holds no choice" (design D4).
  it('reads SHOW_HIDDEN_CURRENCIES as on when absent, and as stored otherwise', async () => {
    expect(await fileFacts.showHiddenCurrencies()).toBe(true)
    fake.state.info.set('SHOW_HIDDEN_CURRENCIES', '0')
    expect(await fileFacts.showHiddenCurrencies()).toBe(false)
    fake.state.info.set('SHOW_HIDDEN_CURRENCIES', 'TRUE')
    expect(await fileFacts.showHiddenCurrencies()).toBe(true)
  })
})
