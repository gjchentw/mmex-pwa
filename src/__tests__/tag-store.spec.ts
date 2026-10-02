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
import { useTagStore } from '../stores/tag-store'
import type { TagRecord } from '../domain/records'

/**
 * Spec: transaction-taxonomy, Tag Manager Display (counts, search, never
 * hidden), Tag Creation and Renaming, Tag Deletion from the Surface, Merge
 * Screens (collapsed count).
 */

const tag = (id: number, name: string, active: number | null = 1): TagRecord => ({
  TAGID: id,
  TAGNAME: name,
  ACTIVE: active,
})

const makeFakeDb = () => {
  const state = {
    tags: [tag(1, 'travel'), tag(2, 'trip'), tag(3, 'legacy', 0)],
    bulk: [[1, 2]] as Array<[number, number]>,
    counts: {} as Record<number, Record<string, number>>,
    trashed: [] as number[],
    collapsed: 0,
    links: 0,
  }
  const batches: SqlStatement[][] = []
  const db: DomainDb = {
    async query<T>(sql: string, bind: readonly unknown[] = []): Promise<T[]> {
      const flat = sql.replace(/\s+/g, ' ')
      if (flat.startsWith('SELECT * FROM TAG_V1')) {
        return (
          flat.includes('WHERE TAGID = ?')
            ? state.tags.filter((t) => t.TAGID === bind[0])
            : state.tags
        ) as T[]
      }
      if (flat.includes('GROUP BY id')) return state.bulk.map(([id, n]) => ({ id, n })) as T[]
      if (flat.includes('AS transactions')) {
        const id = bind.find((v): v is number => typeof v === 'number') ?? -1
        return [
          {
            transactions: 0,
            splits: 0,
            series: 0,
            seriesSplits: 0,
            trashedLinks: 0,
            links: 0,
            ...state.counts[id],
          },
        ] as T[]
      }
      if (flat.includes('AS trashedTransactionId')) {
        return state.trashed.map((id) => ({ trashedTransactionId: id })) as T[]
      }
      if (flat.includes('AS collapsed')) return [{ collapsed: state.collapsed }] as T[]
      if (flat.includes('AS links')) return [{ links: state.links }] as T[]
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

describe('tag store', () => {
  // Scenario "Tags list their use"; a stored ACTIVE 0 tag is visible like any other.
  it('lists every tag by name with its live use', async () => {
    const store = useTagStore()
    await store.load()
    expect(store.rows.map((r) => [r.name, r.used])).toEqual([
      ['legacy', 0],
      ['travel', 2],
      ['trip', 0],
    ])
  })

  it('searches case-insensitively on a substring', async () => {
    const store = useTagStore()
    await store.load()
    store.search = 'TR'
    expect(store.rows.map((r) => r.name)).toEqual(['travel', 'trip'])
  })

  it('adds and renames through the repository, always writing ACTIVE 1', async () => {
    const store = useTagStore()
    await store.load()
    await store.add('camp')
    await store.rename(3, 'old')
    expect(fake.batches[0]![0]!.bind).toEqual(['camp', 1])
    expect(flat(fake.batches[1]![0]!)).toBe(
      'UPDATE TAG_V1 SET TAGNAME = ?, ACTIVE = ? WHERE TAGID = ?',
    )
    expect(fake.batches[1]![0]!.bind).toEqual(['old', 1, 3])
  })

  // Scenario "Deleting a used tag is refused by name"; a mixed selection keeps the used one.
  it('keeps used tags aside, confirms the rest, and deletes them in one batch', async () => {
    fake.state.counts = { 1: { transactions: 1, links: 1 } }
    const store = useTagStore()
    await store.load()

    await store.requestDeletion([1, 3])
    expect(store.pendingDeletion?.ids).toEqual([3])
    expect(store.pendingDeletion?.kept.map((k) => k.name)).toEqual(['travel'])
    await store.confirmDeletion()

    const deletes = fake.batches.flat().filter((s) => flat(s).startsWith('DELETE FROM TAG_V1'))
    expect(deletes.map((s) => s.bind)).toEqual([[3]])
    expect(store.keptNames).toEqual(['travel'])
    await expect(store.requestDeletion([1])).rejects.toMatchObject({ kind: 'tag' })
  })

  it('names the tag whose trashed transactions a confirmed deletion purges', async () => {
    fake.state.counts = { 2: { trashedLinks: 1, links: 1 } }
    fake.state.trashed = [9]
    const store = useTagStore()
    await store.load()
    await store.requestDeletion([2])
    expect(store.pendingDeletion).toMatchObject({ ids: [2], purge: true, purgeName: 'trip' })
  })

  // Merge Screens: the tag result carries moved and collapsed.
  it('merges and reports moved and collapsed counts', async () => {
    fake.state.links = 3
    fake.state.collapsed = 1
    const store = useTagStore()
    await store.load()
    const result = await store.relocate(2, 1, { deleteSource: false })
    expect(result).toEqual({ changed: 2, collapsed: 1 })
    expect(fake.batches.flat().map(flat)).toContain(
      'UPDATE OR IGNORE TAGLINK_V1 SET TAGID = ? WHERE TAGID = ?',
    )
  })
})
