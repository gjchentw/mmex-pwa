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
import { useCategoryStore } from '../stores/category-store'
import type { CategoryRecord } from '../domain/records'

/**
 * Spec: transaction-taxonomy, Category Manager Display (tree, show-hidden
 * preference), Category Visibility Actions, Show-Hidden Preferences (the first
 * writer); design D3, D4 of transaction-taxonomy-surfaces.
 */

const category = (
  id: number,
  name: string,
  parentId = -1,
  active: number | null = 1,
): CategoryRecord => ({ CATEGID: id, CATEGNAME: name, PARENTID: parentId, ACTIVE: active })

const makeFakeDb = (opts: { setting?: [string, string][]; info?: [string, string][] } = {}) => {
  const state = {
    categories: [
      category(1, 'Food'),
      category(2, 'Snacks', 1),
      category(3, 'Drinks', 1, 0),
      category(4, 'Travel', -1, 0),
      category(5, 'Bills'),
    ],
    setting: new Map<string, string>(opts.setting ?? []),
    info: new Map<string, string>(opts.info ?? []),
    bulk: [[2, 3]] as Array<[number, number]>,
    reads: 0,
  }
  const batches: SqlStatement[][] = []
  const db: DomainDb = {
    async query<T>(sql: string, bind: readonly unknown[] = []): Promise<T[]> {
      const flat = sql.replace(/\s+/g, ' ')
      if (flat.startsWith('SELECT * FROM CATEGORY_V1')) {
        state.reads += 1
        return state.categories as T[]
      }
      if (flat.includes('GROUP BY id')) return state.bulk.map(([id, n]) => ({ id, n })) as T[]
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

describe('category store', () => {
  it('builds the tree with hidden nodes while the preference is on (absent)', async () => {
    const store = useCategoryStore()
    await store.load()

    expect(store.showHidden).toBe(true)
    expect(store.nodes.map((n) => n.label)).toEqual(['Bills', 'Food', 'Travel'])
    const food = store.nodes.find((n) => n.label === 'Food')!
    expect(food.children.map((c) => c.label)).toEqual(['Drinks', 'Snacks'])
    expect(food.children.find((c) => c.label === 'Drinks')?.hidden).toBe(true)
    expect(food.children.find((c) => c.label === 'Snacks')?.fullName).toBe('Food:Snacks')
    expect(store.usageCounts.get(2)).toBe(3)
  })

  // Scenario "Hidden categories follow the preference".
  it('leaves hidden nodes out while the stored preference is FALSE', async () => {
    fake = makeFakeDb({ setting: [['SHOW_HIDDEN_CATEGS', 'FALSE']] })
    setDomainDb(fake.db)
    const store = useCategoryStore()
    await store.load()

    expect(store.showHidden).toBe(false)
    expect(store.nodes.map((n) => n.label)).toEqual(['Bills', 'Food'])
    expect(store.nodes.find((n) => n.label === 'Food')!.children.map((c) => c.label)).toEqual([
      'Snacks',
    ])
  })

  // Scenario "Path uses the file's delimiter".
  it('joins full names with the file delimiter', async () => {
    fake = makeFakeDb({ info: [['CATEG_DELIMITER', ' / ']] })
    setDomainDb(fake.db)
    const store = useCategoryStore()
    await store.load()

    expect(store.fullName(2)).toBe('Food / Snacks')
  })

  // Show-Hidden Preferences, scenario "Toggle is persisted": desktop's TRUE/FALSE words.
  it('writes the show-hidden choice as desktop reads it', async () => {
    const store = useCategoryStore()
    await store.load()

    await store.setShowHidden(false)

    expect(store.showHidden).toBe(false)
    const write = fake.batches.flat().find((s) => flat(s).includes('INTO SETTING_V1'))!
    expect(write.bind).toEqual(['SHOW_HIDDEN_CATEGS', 'FALSE'])
  })

  it('delegates writes to the repository and reloads afterwards', async () => {
    const store = useCategoryStore()
    await store.load()
    const readsBefore = fake.state.reads

    await store.add('Chips', 4)
    await store.rename(1, 'FOOD')
    await store.move(2, -1)
    await store.setHidden(1, true)

    const sql = fake.batches.flat().map(flat)
    expect(sql[0]).toContain('INSERT INTO CATEGORY_V1')
    expect(fake.batches[0]![0]!.bind).toEqual(['Chips', 4, 1])
    expect(sql[1]).toBe('UPDATE CATEGORY_V1 SET CATEGNAME = ? WHERE CATEGID = ?')
    expect(sql[2]).toBe('UPDATE CATEGORY_V1 SET PARENTID = ? WHERE CATEGID = ?')
    expect(fake.batches[2]![0]!.bind).toEqual([-1, 2])
    expect(sql[3]).toBe('UPDATE CATEGORY_V1 SET ACTIVE = ? WHERE CATEGID IN (?, ?, ?)')
    expect(fake.state.reads).toBeGreaterThan(readsBefore + 3)
  })

  // Category Visibility Actions: "Unhide all" (operator decision 12).
  it('unhides every hidden subtree root in one batch', async () => {
    const store = useCategoryStore()
    await store.load()

    await store.unhideAll()

    expect(fake.batches).toHaveLength(1)
    const binds = fake.batches[0]!.map((s) => s.bind)
    expect(binds).toEqual([
      [1, 3],
      [1, 4],
    ])
  })

  it('passes the purge flag and merge options through', async () => {
    const store = useCategoryStore()
    await store.load()

    await store.remove(5, { purgeTrashed: true })
    const removal = fake.batches[fake.batches.length - 1]!.map(flat)
    expect(removal[removal.length - 1]).toBe('DELETE FROM CATEGORY_V1 WHERE CATEGID IN (?)')

    const result = await store.relocate(2, 5, { deleteSource: true })
    expect(result.changed).toBe(0)
    expect(fake.batches[fake.batches.length - 1]!.map(flat).slice(-1)[0]).toBe(
      'DELETE FROM CATEGORY_V1 WHERE CATEGID IN (?)',
    )
    expect(store.hasChildren(1)).toBe(true)
    expect(store.hasChildren(2)).toBe(false)
  })
})
