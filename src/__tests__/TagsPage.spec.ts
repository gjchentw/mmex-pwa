import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { Quasar, QLayout, QPageContainer } from 'quasar'

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
import { i18n } from '../i18n'
import TagsPage from '../pages/TagsPage.vue'
import { useTagStore } from '../stores/tag-store'
import type { TagRecord } from '../domain/records'

/**
 * Spec: transaction-taxonomy, Tag Manager Display, Tag Creation and Renaming,
 * Tag Deletion from the Surface, Merge Screens.
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
      if (flat.includes('AS collapsed')) return [{ collapsed: 0 }] as T[]
      if (flat.includes('AS links')) return [{ links: 0 }] as T[]
      return [] as T[]
    },
    async mutate(statements: SqlStatement[]): Promise<void> {
      batches.push(statements)
    },
  }
  return { db, state, batches }
}

let fake: ReturnType<typeof makeFakeDb>
const mounted: VueWrapper[] = []

beforeEach(() => {
  setActivePinia(createPinia())
  fake = makeFakeDb()
  setDomainDb(fake.db)
})
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
  document.body.innerHTML = ''
  setDomainDb()
})

const Harness = defineComponent({
  render: () => h(QLayout, { view: 'hHh lpR fFf' }, () => h(QPageContainer, () => h(TagsPage))),
})

const mountPage = async () => {
  const wrapper = mount(Harness, { global: { plugins: [i18n, Quasar] } })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

const inBody = (testid: string) =>
  ((all) => all[all.length - 1] ?? null)([
    ...document.querySelectorAll<HTMLElement>(`[data-testid="${testid}"]`),
  ])
const row = (wrapper: VueWrapper, id: number) => wrapper.find(`[data-tag-id="${id}"]`)
const typeInBody = (testid: string, value: string) => {
  const input = inBody(testid) as HTMLInputElement
  input.value = value
  input.dispatchEvent(new Event('input'))
}

describe('tags page', () => {
  // Scenario "Tags list their use"; no hide action exists for tags.
  it('lists tags with counts, including a stored inactive tag, and offers no hide action', async () => {
    const wrapper = await mountPage()
    expect(row(wrapper, 1).find('[data-testid="tag-used"]').text()).toBe('2')
    expect(row(wrapper, 3).exists()).toBe(true)
    expect(wrapper.find('[data-testid="tag-hide"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="tag-show-hidden"]').exists()).toBe(false)
  })

  it('enables Edit and Merge for exactly one checked tag', async () => {
    const wrapper = await mountPage()
    expect(wrapper.find('[data-testid="tag-edit"]').attributes('disabled')).toBeDefined()
    useTagStore().selectedIds = [1, 2]
    await flushPromises()
    expect(wrapper.find('[data-testid="tag-edit"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="tag-delete"]').attributes('disabled')).toBeUndefined()
    useTagStore().selectedIds = [1]
    await flushPromises()
    expect(wrapper.find('[data-testid="tag-edit"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-testid="tag-merge"]').attributes('disabled')).toBeUndefined()
  })

  // Scenario "A reserved name is refused at the entry".
  it('refuses a name with a space at the entry and writes nothing', async () => {
    const wrapper = await mountPage()
    await wrapper.find('[data-testid="tag-add"]').trigger('click')
    await flushPromises()
    typeInBody('tag-name', 'summer trip')
    inBody('tag-name-save')!.click()
    await flushPromises()
    expect(document.body.textContent).toContain("space (' ') character")
    expect(fake.batches).toHaveLength(0)
  })

  // Scenario "Deleting a used tag is refused by name".
  it('refuses deleting a used tag, naming it', async () => {
    fake.state.counts = { 1: { transactions: 1, links: 1 } }
    const wrapper = await mountPage()
    useTagStore().selectedIds = [1]
    await flushPromises()
    await wrapper.find('[data-testid="tag-delete"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="tag-action-error"]').text()).toContain("Tag 'travel' in use")
    expect(fake.batches).toHaveLength(0)
  })

  it('deletes the deletable part of a selection after confirming and reports the kept tag', async () => {
    fake.state.counts = { 1: { transactions: 1, links: 1 } }
    const wrapper = await mountPage()
    useTagStore().selectedIds = [1, 3]
    await flushPromises()
    await wrapper.find('[data-testid="tag-delete"]').trigger('click')
    await flushPromises()
    expect(inBody('taxonomy-delete-names')?.textContent).toContain('legacy')
    inBody('taxonomy-delete-confirm')!.click()
    await flushPromises()
    const deletes = fake.batches.flat().filter((s) => s.sql.includes('DELETE FROM TAG_V1'))
    expect(deletes.map((s) => s.bind)).toEqual([[3]])
    expect(wrapper.find('[data-testid="tag-kept"]').text()).toContain('travel')
  })

  it('opens the merge screen for the checked tag', async () => {
    const wrapper = await mountPage()
    useTagStore().selectedIds = [2]
    await flushPromises()
    await wrapper.find('[data-testid="tag-merge"]').trigger('click')
    const merge = wrapper.findComponent({ name: 'MergeDialog' })
    expect(merge.props('modelValue')).toBe(true)
    expect(merge.props('kind')).toBe('tag')
    expect(merge.props('initialSource')).toBe(2)
  })
})
