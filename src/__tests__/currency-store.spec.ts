import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const { MockWorker } = vi.hoisted(() => {
  class MockWorker {
    postMessage = vi.fn()
    addEventListener = vi.fn()
    removeEventListener = vi.fn()
    terminate = vi.fn()
  }
  return { MockWorker }
})

vi.mock('../workers/sqlite.worker?worker', () => ({ default: MockWorker }))

import { setDomainDb, type DomainDb, type SqlStatement } from '../domain/db'
import { useCurrencyStore } from '../stores/currency-store'
import type { CurrencyHistoryRecord, CurrencyRecord } from '../domain/records'

/** Spec: currency-management, the management surface. */

const currency = (
  id: number,
  name: string,
  symbol: string,
  extra: Partial<CurrencyRecord> = {},
): CurrencyRecord => ({
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
  ...extra,
})

const makeFakeDb = () => {
  const state = {
    currencies: [
      currency(1, 'US dollar', 'USD'),
      currency(2, 'Euro', 'EUR', { BASECONVRATE: 1.1 }),
      currency(3, 'Japanese yen', 'JPY', { SCALE: 1 }),
      currency(4, 'Swiss franc', 'CHF'),
    ] as CurrencyRecord[],
    usedIds: [2] as number[],
    baseCurrencyId: '1',
    useCurrencyHistory: '1',
    history: [] as CurrencyHistoryRecord[],
  }
  const batches: SqlStatement[][] = []

  const db: DomainDb = {
    async query<T>(sql: string, bind?: unknown[]): Promise<T[]> {
      if (sql.includes('SELECT DISTINCT CURRENCYID')) {
        return state.usedIds.map((id) => ({ CURRENCYID: id })) as T[]
      }
      if (sql.includes('FROM CURRENCYFORMATS_V1') && sql.includes('WHERE CURRENCYID')) {
        return state.currencies.filter((c) => c.CURRENCYID === bind?.[0]) as T[]
      }
      if (sql.includes('FROM CURRENCYFORMATS_V1') && sql.includes('COLLATE NOCASE')) {
        const [name, symbol, exclude] = bind as [string, string, number]
        return state.currencies.filter(
          (c) =>
            c.CURRENCYID !== exclude &&
            (c.CURRENCYNAME.toLowerCase() === String(name).toLowerCase() ||
              (c.CURRENCY_SYMBOL ?? '').toLowerCase() === String(symbol).toLowerCase()),
        ) as T[]
      }
      if (sql.includes('FROM CURRENCYFORMATS_V1')) return state.currencies as T[]
      if (sql.includes('FROM CURRENCYHISTORY_V1')) {
        return state.history.filter((h) => h.CURRENCYID === bind?.[0]) as T[]
      }
      if (sql.includes('FROM INFOTABLE_V1')) {
        const key = String(bind?.[0] ?? '')
        if (key === 'BASECURRENCYID') return [{ INFOVALUE: state.baseCurrencyId }] as T[]
        if (key === 'USECURRENCYHISTORY') return [{ INFOVALUE: state.useCurrencyHistory }] as T[]
        return [] as T[]
      }
      if (sql.includes('COUNT(*)')) {
        const id = bind?.[0] as number
        const count = sql.includes('ACCOUNTLIST_V1') ? (state.usedIds.includes(id) ? 1 : 0) : 0
        return [{ count }] as T[]
      }
      return [] as T[]
    },
    async mutate(statements: SqlStatement[]): Promise<void> {
      batches.push(statements)
      for (const s of statements) {
        if (s.sql.includes('INSERT INTO CURRENCYHISTORY_V1')) {
          const [cid, date, value, type] = s.bind as [number, string, number, number]
          const existing = state.history.find((h) => h.CURRENCYID === cid && h.CURRDATE === date)
          if (existing) {
            existing.CURRVALUE = value
            existing.CURRUPDTYPE = type
          } else {
            state.history.push({
              CURRHISTID: state.history.length + 1,
              CURRENCYID: cid,
              CURRDATE: date,
              CURRVALUE: value,
              CURRUPDTYPE: type,
            })
          }
        } else if (s.sql.includes('DELETE FROM CURRENCYHISTORY_V1 WHERE CURRHISTID')) {
          state.history = state.history.filter((h) => h.CURRHISTID !== s.bind?.[0])
        } else if (s.sql.includes('DELETE FROM CURRENCYFORMATS_V1')) {
          state.currencies = state.currencies.filter((c) => c.CURRENCYID !== s.bind?.[0])
        } else if (s.sql.includes('DELETE FROM CURRENCYHISTORY_V1 WHERE CURRENCYID')) {
          state.history = state.history.filter((h) => h.CURRENCYID !== s.bind?.[0])
        } else if (s.sql.includes('UPDATE CURRENCYFORMATS_V1')) {
          const id = s.bind?.[s.bind.length - 1]
          const target = state.currencies.find((c) => c.CURRENCYID === id)
          if (target) Object.assign(target, { CURRENCYNAME: s.bind?.[0] })
        } else if (s.sql.includes('INSERT INTO CURRENCYFORMATS_V1')) {
          state.currencies.push(currency(99, String(s.bind?.[0]), String(s.bind?.[9] ?? 'NEW')))
        }
      }
    },
  }
  return { db, state, batches }
}

let fake: ReturnType<typeof makeFakeDb>

beforeEach(() => {
  setActivePinia(createPinia())
  fake = makeFakeDb()
  setDomainDb(fake.db)
})

afterEach(() => setDomainDb())

describe('currency list scoping', () => {
  // Requirement "Currency Management Surface", scenario "Only the currencies in
  // use are listed by default".
  it('lists only what the file uses, plus the base currency', async () => {
    const store = useCurrencyStore()
    await store.load()

    const symbols = store.visibleCurrencies.map((c) => c.CURRENCY_SYMBOL)
    expect(symbols).toEqual(['USD', 'EUR'])
    expect(symbols).not.toContain('JPY')
  })

  // Scenario "The full set is reachable and searchable".
  it('shows every defined currency once asked', async () => {
    const store = useCurrencyStore()
    await store.load()
    store.showAll = true

    expect(store.visibleCurrencies).toHaveLength(4)
  })

  it('searches by name and by symbol', async () => {
    const store = useCurrencyStore()
    await store.load()
    store.showAll = true

    store.search = 'yen'
    expect(store.visibleCurrencies.map((c) => c.CURRENCY_SYMBOL)).toEqual(['JPY'])

    store.search = 'chf'
    expect(store.visibleCurrencies.map((c) => c.CURRENCY_SYMBOL)).toEqual(['CHF'])
  })

  it('resolves the used set in a single query rather than per currency', async () => {
    const store = useCurrencyStore()
    const spy = vi.spyOn(fake.db, 'query')
    await store.load()

    const distinctQueries = spy.mock.calls.filter((call) =>
      String(call[0]).includes('SELECT DISTINCT CURRENCYID'),
    )
    expect(distinctQueries).toHaveLength(1)
  })

  // Requirement "Base Currency Indication".
  it('identifies the base currency', async () => {
    const store = useCurrencyStore()
    await store.load()

    expect(store.isBase({ CURRENCYID: 1 })).toBe(true)
    expect(store.isBase({ CURRENCYID: 2 })).toBe(false)
  })
})

describe('editing definitions', () => {
  // Requirement "Editing and Adding Currency Definitions", scenario "A
  // conflicting name is refused".
  it('refuses a name another currency holds, in any letter case', async () => {
    const store = useCurrencyStore()
    await store.load()

    await expect(
      store.save(2, { CURRENCYNAME: 'us DOLLAR', CURRENCY_SYMBOL: 'EUR' }),
    ).rejects.toThrow(/already exists/i)
  })

  it('accepts an edit that conflicts with nothing', async () => {
    const store = useCurrencyStore()
    await store.load()

    await expect(
      store.save(2, { CURRENCYNAME: 'Euro area euro', CURRENCY_SYMBOL: 'EUR' }),
    ).resolves.toBeUndefined()
  })

  // Scenario "A currency outside the seeded set can be added".
  it('refuses an addition whose symbol is taken', async () => {
    const store = useCurrencyStore()
    await store.load()

    await expect(
      store.add({ ...fake.state.currencies[0]!, CURRENCYNAME: 'Something else' } as never),
    ).rejects.toThrow(/already exists/i)
  })
})

describe('rate history', () => {
  // Requirement "Exchange Rate History Management", scenario "A rate is recorded
  // and used".
  it('records a rate against the date, marked as manual', async () => {
    const store = useCurrencyStore()
    await store.load()
    await store.recordRate(2, '2026-08-09', 1.25)

    expect(store.history).toHaveLength(1)
    expect(store.history[0]!.CURRDATE).toBe('2026-08-09')
    expect(store.history[0]!.CURRVALUE).toBe(1.25)
    // 2 is the manual update type.
    expect(store.history[0]!.CURRUPDTYPE).toBe(2)
  })

  // Scenario "Recording twice for one date replaces rather than duplicates".
  it('replaces rather than duplicates for a repeated date', async () => {
    const store = useCurrencyStore()
    await store.load()
    await store.recordRate(2, '2026-08-09', 1.25)
    await store.recordRate(2, '2026-08-09', 1.4)

    expect(store.history).toHaveLength(1)
    expect(store.history[0]!.CURRVALUE).toBe(1.4)
  })

  it('removes a recorded rate', async () => {
    const store = useCurrencyStore()
    await store.load()
    await store.recordRate(2, '2026-08-09', 1.25)
    await store.removeRate(store.history[0]!.CURRHISTID, 2)

    expect(store.history).toHaveLength(0)
  })

  it('orders recorded rates newest first', async () => {
    const store = useCurrencyStore()
    await store.load()
    await store.recordRate(2, '2026-01-01', 1.1)
    await store.recordRate(2, '2026-08-09', 1.3)

    expect(store.history.map((h) => h.CURRDATE)).toEqual(['2026-08-09', '2026-01-01'])
  })

  // Scenario "Recorded rates are shown as inactive while the setting is off".
  it('reports whether recorded rates are currently in use', async () => {
    const store = useCurrencyStore()
    await store.load()
    expect(store.useCurrencyHistory).toBe(true)

    fake.state.useCurrencyHistory = '0'
    await store.load()
    expect(store.useCurrencyHistory).toBe(false)
  })
})

describe('deletion', () => {
  // Requirement "Currency Deletion From the Surface", scenario "A currency in
  // use cannot be deleted".
  it('refuses while an account references the currency', async () => {
    const store = useCurrencyStore()
    await store.load()

    await expect(store.remove(2)).rejects.toThrow(/in use/i)
    expect(fake.state.currencies.some((c) => c.CURRENCYID === 2)).toBe(true)
  })

  it('refuses to delete the base currency', async () => {
    const store = useCurrencyStore()
    await store.load()

    await expect(store.remove(1)).rejects.toThrow(/in use/i)
  })

  // Scenario "Deleting an unused currency takes its history".
  it('deletes an unused currency together with its recorded rates', async () => {
    const store = useCurrencyStore()
    await store.load()
    await store.recordRate(3, '2026-08-09', 0.9)
    expect(fake.state.history).toHaveLength(1)

    await store.remove(3)

    expect(fake.state.currencies.some((c) => c.CURRENCYID === 3)).toBe(false)
    expect(fake.state.history.filter((h) => h.CURRENCYID === 3)).toHaveLength(0)
  })
})
