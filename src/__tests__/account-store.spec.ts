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
import { useAccountStore } from '../stores/account-store'
import type { AccountRecord, CurrencyRecord, TransactionRecord } from '../domain/records'

/** Spec: account-management, the accounts surface. */

const account = (id: number, name: string, extra: Partial<AccountRecord> = {}): AccountRecord => ({
  ACCOUNTID: id,
  ACCOUNTNAME: name,
  ACCOUNTTYPE: 'Checking',
  ACCOUNTNUM: null,
  STATUS: 'Open',
  NOTES: null,
  HELDAT: null,
  WEBSITE: null,
  CONTACTINFO: null,
  ACCESSINFO: null,
  INITIALBAL: 0,
  INITIALDATE: '2026-01-01',
  FAVORITEACCT: 'FALSE',
  CURRENCYID: 1,
  STATEMENTLOCKED: null,
  STATEMENTDATE: null,
  MINIMUMBALANCE: null,
  CREDITLIMIT: null,
  INTERESTRATE: null,
  PAYMENTDUEDATE: null,
  MINIMUMPAYMENT: null,
  ...extra,
})

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

/** Only the fields the account-flow rule reads. */
const txn = (
  id: number,
  accountId: number,
  code: string,
  amount: number,
  extra: Partial<TransactionRecord> = {},
): Partial<TransactionRecord> => ({
  TRANSID: id,
  ACCOUNTID: accountId,
  TOACCOUNTID: null,
  TRANSCODE: code,
  TRANSAMOUNT: amount,
  TOTRANSAMOUNT: null,
  STATUS: '',
  DELETEDTIME: null,
  TRANSDATE: '2026-02-01',
  ...extra,
})

const makeFakeDb = () => {
  const state = {
    accounts: [
      account(1, 'Everyday Checking', { INITIALBAL: 250 }),
      account(2, 'Amex Gold', { ACCOUNTTYPE: 'Credit Card', FAVORITEACCT: 'TRUE' }),
      account(3, 'Old Savings', { STATUS: 'Closed', CURRENCYID: 2 }),
    ] as AccountRecord[],
    currencies: [currency(1, 'US dollar', 'USD'), currency(2, 'Euro', 'EUR')] as CurrencyRecord[],
    transactions: [] as Partial<TransactionRecord>[],
    scheduledIds: [] as number[],
    stockIds: [] as number[],
    nextId: 4,
    failQueries: false,
  }
  const batches: SqlStatement[][] = []

  const db: DomainDb = {
    async query<T>(sql: string, bind?: unknown[]): Promise<T[]> {
      if (state.failQueries) throw new Error('database unavailable')
      if (sql.includes('FROM ACCOUNTLIST_V1') && sql.includes('COLLATE NOCASE')) {
        const [name, exclude] = bind as [string, number]
        return state.accounts.filter(
          (a) =>
            a.ACCOUNTID !== exclude && a.ACCOUNTNAME.toLowerCase() === String(name).toLowerCase(),
        ) as T[]
      }
      if (sql.includes('FROM ACCOUNTLIST_V1') && sql.includes('WHERE ACCOUNTID')) {
        return state.accounts.filter((a) => a.ACCOUNTID === bind?.[0]) as T[]
      }
      if (sql.includes('FROM ACCOUNTLIST_V1')) return state.accounts as T[]
      if (sql.includes('FROM CURRENCYFORMATS_V1')) return state.currencies as T[]
      if (sql.includes('FROM CHECKINGACCOUNT_V1')) {
        const id = bind?.[0]
        return state.transactions.filter((t) => t.ACCOUNTID === id || t.TOACCOUNTID === id) as T[]
      }
      if (sql.includes('FROM BILLSDEPOSITS_V1')) {
        return state.scheduledIds.map((id) => ({ BDID: id })) as T[]
      }
      if (sql.includes('FROM STOCK_V1')) {
        return state.stockIds.map((id) => ({ STOCKID: id })) as T[]
      }
      return [] as T[]
    },
    async mutate(statements: SqlStatement[]): Promise<void> {
      batches.push(statements)
      for (const s of statements) {
        const bind = s.bind ?? []
        const insert = /INSERT INTO ACCOUNTLIST_V1 \(([^)]*)\) VALUES/.exec(s.sql)
        if (insert) {
          const columns = (insert[1] ?? '').split(', ')
          const row = account(state.nextId++, '')
          columns.forEach((column, index) => {
            ;(row as unknown as Record<string, unknown>)[column] = bind[index]
          })
          state.accounts.push(row)
          continue
        }
        const update = /UPDATE ACCOUNTLIST_V1 SET (.*) WHERE ACCOUNTID = \?/.exec(s.sql)
        if (update) {
          const columns = (update[1] ?? '').split(', ').map((part) => part.replace(' = ?', ''))
          const id = bind[bind.length - 1]
          const row = state.accounts.find((a) => a.ACCOUNTID === id)
          if (row) {
            columns.forEach((column, index) => {
              ;(row as unknown as Record<string, unknown>)[column] = bind[index]
            })
          }
          continue
        }
        if (s.sql.includes('DELETE FROM ACCOUNTLIST_V1')) {
          state.accounts = state.accounts.filter((a) => a.ACCOUNTID !== bind[0])
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

describe('loading the accounts surface', () => {
  // Requirement "Account List Display", scenario "Every account in the file is
  // listed".
  it('lists every account, closed ones included', async () => {
    const store = useAccountStore()
    await store.load()

    expect(store.accounts).toHaveLength(3)
    expect(store.sortedAccounts.map((a) => a.ACCOUNTNAME)).toContain('Old Savings')
  })

  // Requirement "Account List Display": the default order is alphabetical.
  it('sorts alphabetically by name by default', async () => {
    const store = useAccountStore()
    await store.load()

    expect(store.sortedAccounts.map((a) => a.ACCOUNTNAME)).toEqual([
      'Amex Gold',
      'Everyday Checking',
      'Old Savings',
    ])
  })

  // Requirement "Currency Binding": the surface offers the file's currencies.
  it('exposes the currency list the binding field needs', async () => {
    const store = useAccountStore()
    await store.load()

    expect(store.currencies.map((c) => c.CURRENCY_SYMBOL)).toEqual(['USD', 'EUR'])
    expect(store.getCurrencyCode({ CURRENCYID: 2 })).toBe('Euro')
  })

  it('reports a load failure instead of throwing', async () => {
    fake.state.failQueries = true
    const store = useAccountStore()
    await store.load()

    expect(store.error).toBe('database unavailable')
    expect(store.loading).toBe(false)
  })

  // Requirement "Account Status": Closed accounts are distinguishable.
  it('distinguishes open from closed accounts', async () => {
    const store = useAccountStore()
    await store.load()

    expect(store.isOpen(store.getById(1)!)).toBe(true)
    expect(store.isClosed(store.getById(3)!)).toBe(true)
  })
})

describe('balance computation', () => {
  // Requirement "Account Balance Definition": initial balance plus every flow.
  it('adds every transaction flow to the initial balance', async () => {
    fake.state.transactions = [txn(1, 1, 'Deposit', 100), txn(2, 1, 'Withdrawal', 30)]
    const store = useAccountStore()
    await store.load()

    expect(await store.getBalance(1)).toBe(320)
  })

  // Requirement "Balance Display Formatting": a negative balance is a real value.
  it('reports a negative balance', async () => {
    fake.state.transactions = [txn(1, 1, 'Withdrawal', 400)]
    const store = useAccountStore()
    await store.load()

    expect(await store.getBalance(1)).toBe(-150)
  })

  it('caches a computed balance rather than recomputing it', async () => {
    const store = useAccountStore()
    await store.load()
    await store.getBalance(1)

    const spy = vi.spyOn(fake.db, 'query')
    await store.getBalance(1)

    expect(spy).not.toHaveBeenCalled()
  })

  // A write can move the initial balance, so the cache must not outlive it.
  it('refreshes cached balances after an edit', async () => {
    const store = useAccountStore()
    await store.load()
    await store.loadBalances()
    expect(store.getCachedBalance(1)).toBe(250)

    await store.save({ ACCOUNTID: 1, INITIALBAL: 900 })

    expect(store.getCachedBalance(1)).toBe(900)
  })
})

describe('account creation', () => {
  // Requirement "Account Creation", scenario "A new account is created".
  it('persists a new account with the fields it was given', async () => {
    const store = useAccountStore()
    await store.load()

    await store.save({
      ACCOUNTNAME: 'Travel Fund',
      ACCOUNTTYPE: 'Cash',
      STATUS: 'Open',
      CURRENCYID: 2,
      INITIALBAL: 500,
      INITIALDATE: '2026-03-01',
      FAVORITEACCT: 'FALSE',
    })

    const created = store.accounts.find((a) => a.ACCOUNTNAME === 'Travel Fund')
    expect(created).toBeDefined()
    expect(created?.ACCOUNTTYPE).toBe('Cash')
    expect(created?.CURRENCYID).toBe(2)
    expect(created?.INITIALBAL).toBe(500)
    expect(created?.INITIALDATE).toBe('2026-03-01')
  })

  // Risk R1: account names are unique case-insensitively.
  it('refuses a name another account holds, in any letter case', async () => {
    const store = useAccountStore()
    await store.load()

    await expect(store.save({ ACCOUNTNAME: 'amex gold', ACCOUNTTYPE: 'Cash' })).rejects.toThrow(
      /already exists/,
    )
    expect(store.accounts).toHaveLength(3)
  })

  it('reports an unused name as available', async () => {
    const store = useAccountStore()
    await store.load()

    expect(await store.validateName('Travel Fund')).toBe(true)
    expect(await store.validateName('AMEX GOLD')).toBe(false)
  })
})

describe('account editing', () => {
  // Requirement "Account Editing", scenario "An account definition is changed".
  it('persists the edit', async () => {
    const store = useAccountStore()
    await store.load()

    await store.save({ ACCOUNTID: 1, ACCOUNTNAME: 'Renamed Checking', STATUS: 'Closed' })

    const edited = store.getById(1)
    expect(edited?.ACCOUNTNAME).toBe('Renamed Checking')
    expect(store.isClosed(edited!)).toBe(true)
  })

  // Risk R1 again, this time on the edit path.
  it('refuses a name another account holds', async () => {
    const store = useAccountStore()
    await store.load()

    await expect(store.save({ ACCOUNTID: 1, ACCOUNTNAME: 'AMEX GOLD' })).rejects.toThrow(
      /already exists/,
    )
  })

  it('lets an account keep its own name', async () => {
    const store = useAccountStore()
    await store.load()

    await store.save({ ACCOUNTID: 2, ACCOUNTNAME: 'Amex Gold', CREDITLIMIT: 5000 })

    expect(store.getById(2)?.CREDITLIMIT).toBe(5000)
  })
})

describe('favorite accounts', () => {
  // Risk R6: the toggle writes FAVORITEACCT through the rules-layer encoder.
  it('marks an account as favorite', async () => {
    const store = useAccountStore()
    await store.load()

    await store.toggleFavorite(1)

    expect(store.getById(1)?.FAVORITEACCT).toBe('TRUE')
    expect(store.isAccountFavorite(store.getById(1)!)).toBe(true)
  })

  it('clears the favorite flag on the second toggle', async () => {
    const store = useAccountStore()
    await store.load()

    await store.toggleFavorite(2)

    expect(store.getById(2)?.FAVORITEACCT).toBe('FALSE')
    expect(store.isAccountFavorite(store.getById(2)!)).toBe(false)
  })

  it('ignores a toggle for an account that does not exist', async () => {
    const store = useAccountStore()
    await store.load()

    await store.toggleFavorite(99)

    expect(fake.batches).toHaveLength(0)
  })
})

describe('statement lock', () => {
  // Requirement "Statement Lock Management", scenario "A statement lock is set".
  it('records the lock and its date', async () => {
    const store = useAccountStore()
    await store.load()

    await store.setStatementLock(1, true, '2026-08-31')

    expect(store.getById(1)?.STATEMENTLOCKED).toBe(1)
    expect(store.getById(1)?.STATEMENTDATE).toBe('2026-08-31')
  })

  // Scenario "A statement lock is cleared".
  it('clears both the state and the date', async () => {
    const store = useAccountStore()
    await store.load()
    await store.setStatementLock(1, true, '2026-08-31')

    await store.setStatementLock(1, false, null)

    expect(store.getById(1)?.STATEMENTLOCKED).toBeNull()
    expect(store.getById(1)?.STATEMENTDATE).toBeNull()
  })
})

describe('account deletion', () => {
  // Requirement "Account Deletion Cascade", scenario "Deleting an account
  // leaves no orphans". Risk R4.
  it('removes the account and every record that depended on it, in one batch', async () => {
    fake.state.transactions = [txn(1, 1, 'Withdrawal', 20)]
    fake.state.scheduledIds = [7]
    fake.state.stockIds = [11]
    const store = useAccountStore()
    await store.load()

    await store.remove(1)

    expect(store.getById(1)).toBeNull()
    const batch = fake.batches[0]!
    const targets = batch.map((s) => s.sql)
    expect(targets.some((sql) => sql.includes('DELETE FROM ACCOUNTLIST_V1'))).toBe(true)
    expect(targets.some((sql) => sql.includes('DELETE FROM BILLSDEPOSITS_V1'))).toBe(true)
    expect(targets.some((sql) => sql.includes('DELETE FROM STOCK_V1'))).toBe(true)
    // A single logical operation: one batch, not one per table.
    expect(fake.batches).toHaveLength(1)
  })

  it('deletes an account that has no dependants', async () => {
    const store = useAccountStore()
    await store.load()

    await store.remove(3)

    expect(store.getById(3)).toBeNull()
    expect(store.accounts).toHaveLength(2)
  })
})
