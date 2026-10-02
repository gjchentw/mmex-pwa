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
import { usePayeeStore } from '../stores/payee-store'
import type { CategoryRecord, PayeeRecord } from '../domain/records'

/**
 * Spec: transaction-taxonomy, Payee Manager Display (Used, the mode-dependent
 * column, show-hidden), Payee Selection Actions, Payee Deletion from the
 * Surface; design D4, D8, D9 of transaction-taxonomy-surfaces.
 */

const payee = (id: number, name: string, extra: Partial<PayeeRecord> = {}): PayeeRecord => ({
  PAYEEID: id,
  PAYEENAME: name,
  CATEGID: -1,
  NUMBER: null,
  WEBSITE: null,
  NOTES: null,
  ACTIVE: 1,
  PATTERN: null,
  ...extra,
})

const category = (id: number, name: string, parentId = -1): CategoryRecord => ({
  CATEGID: id,
  CATEGNAME: name,
  PARENTID: parentId,
  ACTIVE: 1,
})

const makeFakeDb = (opts: { setting?: [string, string][]; info?: [string, string][] } = {}) => {
  const state = {
    payees: [
      payee(1, 'Shop', { CATEGID: 8, NUMBER: 'ACC-1', WEBSITE: 'shop.example.com/' }),
      payee(2, 'Old Shop', { ACTIVE: 0 }),
      payee(3, 'New Shop', { PATTERN: '{\n    "0": "A",\n    "1": "B"\n}' }),
    ],
    categories: [category(7, 'Food'), category(8, 'Snacks', 7)],
    setting: new Map<string, string>(opts.setting ?? []),
    info: new Map<string, string>(opts.info ?? []),
    bulk: [[1, 3]] as Array<[number, number]>,
    /** Per-payee usage counts by the first bound id. */
    counts: {} as Record<number, Record<string, number>>,
    trashed: [] as number[],
  }
  const batches: SqlStatement[][] = []
  const db: DomainDb = {
    async query<T>(sql: string, bind: readonly unknown[] = []): Promise<T[]> {
      const flat = sql.replace(/\s+/g, ' ')
      if (flat.startsWith('SELECT * FROM PAYEE_V1')) {
        return (
          flat.includes('WHERE PAYEEID = ?')
            ? state.payees.filter((p) => p.PAYEEID === bind[0])
            : state.payees
        ) as T[]
      }
      if (flat.startsWith('SELECT * FROM CATEGORY_V1')) return state.categories as T[]
      if (flat.includes('GROUP BY id')) return state.bulk.map(([id, n]) => ({ id, n })) as T[]
      if (flat.includes('AS transactions')) {
        const id = bind.find((v): v is number => typeof v === 'number') ?? -1
        return [{ transactions: 0, series: 0, ...state.counts[id] }] as T[]
      }
      if (flat.includes('AS trashedTransactionId')) {
        return state.trashed.map((id) => ({ trashedTransactionId: id })) as T[]
      }
      if (flat.includes('FROM SETTING_V1') && flat.includes('WHERE SETTINGNAME')) {
        const value = state.setting.get(String(bind[0]))
        return (value === undefined ? [] : [{ SETTINGVALUE: value }]) as T[]
      }
      if (flat.includes('FROM INFOTABLE_V1') && flat.includes('WHERE INFONAME')) {
        const value = state.info.get(String(bind[0]))
        return (value === undefined ? [] : [{ INFOVALUE: value }]) as T[]
      }
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
  setActivePinia(createPinia())
  fake = makeFakeDb()
  setDomainDb(fake.db)
})
afterEach(() => setDomainDb())

const flat = (statement: SqlStatement) => statement.sql.replace(/\s+/g, ' ')

describe('payee store', () => {
  // Scenario "Used counts live transactions and series"; patterns joined by a space.
  it('builds rows with full category names, joined patterns and the Used count', async () => {
    const store = usePayeeStore()
    await store.load()

    expect(store.showHidden).toBe(true)
    expect(store.rows.map((r) => r.name)).toEqual(['New Shop', 'Old Shop', 'Shop'])
    const shop = store.rows.find((r) => r.name === 'Shop')!
    expect(shop.categoryName).toBe('Food:Snacks')
    expect(shop.used).toBe(3)
    expect(shop.reference).toBe('ACC-1')
    expect(store.rows.find((r) => r.name === 'New Shop')!.patternText).toBe('A B')
    expect(store.rows.find((r) => r.name === 'Old Shop')!.hidden).toBe(true)
  })

  // Scenario "The default-category column follows the mode".
  it('titles the category column by the default-category mode', async () => {
    const store = usePayeeStore()
    await store.load()
    expect(store.categoryColumnTitleKey).toBe('payee.columns.lastUsedCategory')

    fake = makeFakeDb({ setting: [['TRANSACTION_CATEGORY_NONE', '3']] })
    setDomainDb(fake.db)
    await store.load()
    expect(store.categoryColumnTitleKey).toBe('payee.columns.defaultCategory')
  })

  it('filters hidden payees by the stored preference and by the search', async () => {
    fake = makeFakeDb({ setting: [['SHOW_HIDDEN_PAYEES', 'FALSE']] })
    setDomainDb(fake.db)
    const store = usePayeeStore()
    await store.load()

    expect(store.showHidden).toBe(false)
    expect(store.rows.map((r) => r.name)).toEqual(['New Shop', 'Shop'])
    store.search = 'NEW'
    expect(store.rows.map((r) => r.name)).toEqual(['New Shop'])
  })

  // Show-Hidden Preferences, scenario "Toggle is persisted".
  it('writes the show-hidden choice as desktop reads it', async () => {
    const store = usePayeeStore()
    await store.load()
    await store.setShowHidden(false)

    const write = fake.batches.flat().find((s) => flat(s).includes('INTO SETTING_V1'))!
    expect(write.bind).toEqual(['SHOW_HIDDEN_PAYEES', 'FALSE'])
  })

  // Payee Selection Actions: one statement per gesture over the selection.
  it('runs the selection actions through the bulk builders', async () => {
    const store = usePayeeStore()
    await store.load()

    await store.setHidden([1, 3], true)
    await store.setDefaultCategory([1, 3], 7)
    await store.setDefaultCategory([1], null)

    expect(fake.batches.map((b) => b.map((s) => s.bind))).toEqual([
      [[0, 1, 3]],
      [[7, 1, 3]],
      [[-1, 1]],
    ])
  })

  it('adds and saves through the repository builders', async () => {
    const store = usePayeeStore()
    await store.load()

    await store.add({ PAYEENAME: 'Baker' })
    await store.save(1, { PAYEENAME: 'Shop 2' })

    const [insert] = fake.batches[0]!
    expect(flat(insert!)).toContain('INSERT INTO PAYEE_V1')
    const columns = /\(([^)]*)\) VALUES/.exec(insert!.sql)![1]!.split(', ')
    expect(insert!.bind![columns.indexOf('CATEGID')]).toBe(-1)
    expect(flat(fake.batches[1]![0]!)).toBe('UPDATE PAYEE_V1 SET PAYEENAME = ? WHERE PAYEEID = ?')
  })

  // Scenario "A mixed selection is partly deleted".
  it('keeps used payees aside, confirms the rest, and deletes them in one batch', async () => {
    fake.state.counts = { 1: { transactions: 1 } }
    const store = usePayeeStore()
    await store.load()

    await store.requestDeletion([1, 3])
    expect(store.pendingDeletion?.ids).toEqual([3])
    expect(store.pendingDeletion?.names).toEqual(['New Shop'])
    expect(store.pendingDeletion?.kept.map((k) => k.name)).toEqual(['Shop'])
    expect(store.pendingDeletion?.purge).toBe(false)
    expect(fake.batches).toHaveLength(0)

    const result = await store.confirmDeletion()
    expect(result?.removed).toEqual([3])
    expect(fake.batches[fake.batches.length - 1]!.map(flat).slice(-1)[0]).toBe(
      'DELETE FROM PAYEE_V1 WHERE PAYEEID IN (?)',
    )
    expect(store.pendingDeletion).toBeNull()
  })

  it('refuses when every selected payee is used', async () => {
    fake.state.counts = { 1: { transactions: 1 } }
    const store = usePayeeStore()
    await store.load()
    await expect(store.requestDeletion([1])).rejects.toMatchObject({ kind: 'payee' })
  })
})
