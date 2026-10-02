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
import { CurrencyConflictError, CurrencyInUseError } from '../domain/repos/currency'
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
    accountCurrencyIds: [2] as number[],
    assetCurrencyIds: [] as number[],
    info: new Map<string, string>([
      ['BASECURRENCYID', '1'],
      ['USECURRENCYHISTORY', '1'],
    ]),
    history: [] as CurrencyHistoryRecord[],
  }
  const batches: SqlStatement[][] = []

  const latestRows = () => {
    const byCurrency = new Map<number, CurrencyHistoryRecord>()
    for (const row of state.history) {
      const current = byCurrency.get(row.CURRENCYID)
      if (!current || row.CURRDATE > current.CURRDATE) byCurrency.set(row.CURRENCYID, row)
    }
    return [...byCurrency.values()].map((r) => ({
      CURRENCYID: r.CURRENCYID,
      CURRVALUE: r.CURRVALUE,
    }))
  }

  const db: DomainDb = {
    async query<T>(sql: string, bind?: unknown[]): Promise<T[]> {
      if (sql.includes("'accounts' AS SOURCE")) {
        return [
          ...state.accountCurrencyIds.map((id) => ({ CURRENCYID: id, SOURCE: 'accounts' })),
          ...state.assetCurrencyIds.map((id) => ({ CURRENCYID: id, SOURCE: 'assets' })),
        ] as T[]
      }
      if (sql.includes('MAX(CURRDATE)')) return latestRows() as T[]
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
        const value = state.info.get(String(bind?.[0] ?? ''))
        return (value === undefined ? [] : [{ INFOVALUE: value }]) as T[]
      }
      if (sql.includes('COUNT(*)')) {
        const id = bind?.[0] as number
        const list = sql.includes('ACCOUNTLIST_V1')
          ? state.accountCurrencyIds
          : state.assetCurrencyIds
        return [{ count: list.includes(id) ? 1 : 0 }] as T[]
      }
      return [] as T[]
    },
    async mutate(statements: SqlStatement[]): Promise<void> {
      batches.push(statements)
      for (const s of statements) {
        if (s.sql.includes('INTO INFOTABLE_V1')) {
          const [key, value] = s.bind as [string, string]
          state.info.set(key, value)
        } else if (s.sql.includes('INSERT INTO CURRENCYHISTORY_V1')) {
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
          const columns = /SET (.*) WHERE/
            .exec(s.sql)![1]!
            .split(', ')
            .map((c) => c.split(' = ')[0]!)
          const id = s.bind?.[s.bind.length - 1]
          const target = state.currencies.find((c) => c.CURRENCYID === id)
          if (target) {
            columns.forEach((column, index) => {
              ;(target as unknown as Record<string, unknown>)[column] = s.bind?.[index]
            })
          }
        } else if (s.sql.includes('INSERT INTO CURRENCYFORMATS_V1')) {
          const columns = /\(([^)]*)\) VALUES/.exec(s.sql)![1]!.split(', ')
          const row = currency(99, '', '')
          columns.forEach((column, index) => {
            ;(row as unknown as Record<string, unknown>)[column] = s.bind?.[index]
          })
          state.currencies.push(row)
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
  // Scenario "Every currency is listed when the file holds no choice" (design D4).
  it('lists every currency when the file holds no SHOW_HIDDEN_CURRENCIES', async () => {
    const store = useCurrencyStore()
    await store.load()

    expect(store.showAll).toBe(true)
    expect(store.visibleCurrencies).toHaveLength(4)
  })

  // Scenario "Only the currencies in use are listed by default", for a file
  // whose box desktop unticked.
  it('lists only what the file uses, plus the base, when the stored choice says so', async () => {
    fake.state.info.set('SHOW_HIDDEN_CURRENCIES', '0')
    const store = useCurrencyStore()
    await store.load()

    const symbols = store.visibleCurrencies.map((c) => c.CURRENCY_SYMBOL)
    expect(symbols).toEqual(['USD', 'EUR'])
    expect(symbols).not.toContain('JPY')
  })

  // Scenario "The scope choice is stored in the file".
  it('writes SHOW_HIDDEN_CURRENCIES when the choice changes', async () => {
    const store = useCurrencyStore()
    await store.load()

    await store.setShowAll(false)

    expect(fake.state.info.get('SHOW_HIDDEN_CURRENCIES')).toBe('0')
    expect(store.visibleCurrencies.map((c) => c.CURRENCY_SYMBOL)).toEqual(['USD', 'EUR'])
  })

  // Scenario "The full set is reachable and searchable".
  it('searches by name and by symbol', async () => {
    const store = useCurrencyStore()
    await store.load()

    store.search = 'yen'
    expect(store.visibleCurrencies.map((c) => c.CURRENCY_SYMBOL)).toEqual(['JPY'])

    store.search = 'chf'
    expect(store.visibleCurrencies.map((c) => c.CURRENCY_SYMBOL)).toEqual(['CHF'])
  })

  it('resolves the used set in a single query rather than per currency', async () => {
    const store = useCurrencyStore()
    const spy = vi.spyOn(fake.db, 'query')
    await store.load()

    const usageQueries = spy.mock.calls.filter((call) =>
      String(call[0]).includes("'accounts' AS SOURCE"),
    )
    expect(usageQueries).toHaveLength(1)
  })

  // Requirement "Base Currency Indication".
  it('identifies the base currency', async () => {
    const store = useCurrencyStore()
    await store.load()

    expect(store.isBase({ CURRENCYID: 1 })).toBe(true)
    expect(store.isBase({ CURRENCYID: 2 })).toBe(false)
  })
})

describe('the rate column', () => {
  // Scenario "The rate column follows the history setting" (design D5).
  it('shows the latest recorded rate while history is on', async () => {
    const store = useCurrencyStore()
    await store.load()
    await store.recordRate(2, '2026-01-01', 1.2)
    await store.recordRate(2, '2026-08-09', 1.3)

    expect(store.displayedRate(fake.state.currencies[1]!)).toBe(1.3)
  })

  it('falls back to the fixed rate with no history, and shows 1 for the base', async () => {
    const store = useCurrencyStore()
    await store.load()

    expect(store.displayedRate(fake.state.currencies[1]!)).toBe(1.1)
    expect(store.displayedRate(fake.state.currencies[0]!)).toBe(1)
  })

  it('shows the fixed rate while history is off even when rates are recorded', async () => {
    fake.state.info.set('USECURRENCYHISTORY', '0')
    const store = useCurrencyStore()
    await store.load()
    await store.recordRate(2, '2026-08-09', 1.3)

    expect(store.displayedRate(fake.state.currencies[1]!)).toBe(1.1)
  })
})

describe('editing definitions', () => {
  // Scenario "A conflicting name is refused".
  it('refuses a name another currency holds, in any letter case, naming the field', async () => {
    const store = useCurrencyStore()
    await store.load()

    const attempt = store.save(2, { CURRENCYNAME: 'us DOLLAR', CURRENCY_SYMBOL: 'EUR' })
    await expect(attempt).rejects.toBeInstanceOf(CurrencyConflictError)
    await attempt.catch((err: CurrencyConflictError) => expect(err.field).toBe('name'))
  })

  // Scenario "A currency outside the seeded set can be added": what is written.
  it('writes an addition with the given columns and no key of its own', async () => {
    const store = useCurrencyStore()
    await store.load()

    await store.add(currencyWithoutId('Gold ounce', 'XAU', { SCALE: 10_000, SFX_SYMBOL: 'oz' }))

    const insert = fake.batches.find((b) => b[0]!.sql.includes('INSERT INTO CURRENCYFORMATS_V1'))!
    expect(insert[0]!.sql).not.toContain('CURRENCYID')
    const added = fake.state.currencies.find((c) => c.CURRENCY_SYMBOL === 'XAU')!
    expect(added.SCALE).toBe(10_000)
    expect(added.SFX_SYMBOL).toBe('oz')
    expect(added.CURRENCY_TYPE).toBe('Fiat')
  })

  it('writes an edit that conflicts with nothing', async () => {
    const store = useCurrencyStore()
    await store.load()

    await store.save(2, { CURRENCYNAME: 'Euro area euro', CURRENCY_SYMBOL: 'EUR', SCALE: 1000 })

    const euro = fake.state.currencies.find((c) => c.CURRENCYID === 2)!
    expect(euro.CURRENCYNAME).toBe('Euro area euro')
    expect(euro.SCALE).toBe(1000)
  })

  // Scenario "A conflicting code is refused by its own name".
  it('refuses an addition whose symbol is taken, naming the symbol', async () => {
    const store = useCurrencyStore()
    await store.load()

    const attempt = store.add(currencyWithoutId('Something else', 'usd'))
    await expect(attempt).rejects.toBeInstanceOf(CurrencyConflictError)
    await attempt.catch((err: CurrencyConflictError) => {
      expect(err.field).toBe('symbol')
      expect(err.other.CURRENCY_SYMBOL).toBe('USD')
    })
  })
})

const currencyWithoutId = (
  name: string,
  symbol: string,
  extra: Partial<CurrencyRecord> = {},
): Omit<CurrencyRecord, 'CURRENCYID'> => {
  const record: Partial<CurrencyRecord> = currency(0, name, symbol, extra)
  delete record.CURRENCYID
  return record as Omit<CurrencyRecord, 'CURRENCYID'>
}

describe('rate history', () => {
  // Scenario "A rate is recorded and used".
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

  it('removes a recorded rate and refreshes the latest rates', async () => {
    const store = useCurrencyStore()
    await store.load()
    await store.recordRate(2, '2026-08-09', 1.25)
    await store.removeRate(store.history[0]!.CURRHISTID, 2)

    expect(store.history).toHaveLength(0)
    expect(store.displayedRate(fake.state.currencies[1]!)).toBe(1.1)
  })

  it('orders recorded rates newest first, and clears them on request', async () => {
    const store = useCurrencyStore()
    await store.load()
    await store.recordRate(2, '2026-01-01', 1.1)
    await store.recordRate(2, '2026-08-09', 1.3)

    expect(store.history.map((h) => h.CURRDATE)).toEqual(['2026-08-09', '2026-01-01'])
    store.clearHistory()
    expect(store.history).toHaveLength(0)
  })

  // Scenario "Recorded rates are shown as inactive while the setting is off".
  it('reports whether recorded rates are currently in use', async () => {
    const store = useCurrencyStore()
    await store.load()
    expect(store.useCurrencyHistory).toBe(true)

    fake.state.info.set('USECURRENCYHISTORY', '0')
    await store.load()
    expect(store.useCurrencyHistory).toBe(false)
  })
})

describe('deletion', () => {
  // Requirement "Currency Deletion From the Surface": the blocker names its reason (design D1).
  it('names what blocks deletion, before any attempt', async () => {
    fake.state.assetCurrencyIds = [4]
    const store = useCurrencyStore()
    await store.load()

    expect(store.deletionBlocker({ CURRENCYID: 1 })).toBe('base')
    expect(store.deletionBlocker({ CURRENCYID: 2 })).toBe('accounts')
    expect(store.deletionBlocker({ CURRENCYID: 4 })).toBe('assets')
    expect(store.deletionBlocker({ CURRENCYID: 3 })).toBeNull()
  })

  // Scenario "A currency in use cannot be deleted".
  it('refuses while an account references the currency', async () => {
    const store = useCurrencyStore()
    await store.load()

    const attempt = store.remove(2)
    await expect(attempt).rejects.toBeInstanceOf(CurrencyInUseError)
    await attempt.catch((err: CurrencyInUseError) => expect(err.reason).toBe('accounts'))
    expect(fake.state.currencies.some((c) => c.CURRENCYID === 2)).toBe(true)
  })

  // Scenario "The base currency cannot be deleted from the surface".
  it('refuses to delete the base currency', async () => {
    const store = useCurrencyStore()
    await store.load()

    await store.remove(1).catch((err: CurrencyInUseError) => expect(err.reason).toBe('base'))
    expect(fake.state.currencies).toHaveLength(4)
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
