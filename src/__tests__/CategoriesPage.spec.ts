import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { Quasar, QLayout, QPageContainer, QToggle, QTree } from 'quasar'

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
import CategoriesPage from '../pages/CategoriesPage.vue'
import { useCategoryStore } from '../stores/category-store'
import type { CategoryRecord } from '../domain/records'

/**
 * Spec: transaction-taxonomy, Category Manager Display (search over full
 * paths, show-hidden toggle, hidden marking), Category Deletion from the
 * Surface (the three branches); design D3, R1.
 */

const category = (
  id: number,
  name: string,
  parentId = -1,
  active: number | null = 1,
): CategoryRecord => ({ CATEGID: id, CATEGNAME: name, PARENTID: parentId, ACTIVE: active })

const makeFakeDb = () => {
  const state = {
    categories: [
      category(1, 'Food'),
      category(2, 'Snacks', 1),
      category(3, 'Drinks', 1, 0),
      category(5, 'Bills'),
    ],
    /** Usage counts by first bound id: live transactions etc. */
    counts: {} as Record<number, Record<string, number>>,
    trashed: [] as number[],
  }
  const batches: SqlStatement[][] = []
  const db: DomainDb = {
    async query<T>(sql: string, bind: readonly unknown[] = []): Promise<T[]> {
      const flat = sql.replace(/\s+/g, ' ')
      if (flat.startsWith('SELECT * FROM CATEGORY_V1')) return state.categories as T[]
      if (flat.includes('AS transactions')) {
        const id = bind.find((v): v is number => typeof v === 'number') ?? -1
        return [
          { transactions: 0, splits: 0, series: 0, seriesSplits: 0, ...state.counts[id] },
        ] as T[]
      }
      if (flat.includes('AS trashedTransactionId')) {
        return state.trashed.map((id) => ({ trashedTransactionId: id })) as T[]
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
/** Mounted harnesses are torn down so teleported dialog content does not outlive its test. */
const mounted: VueWrapper[] = []
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
  document.body.innerHTML = ''
  setDomainDb()
})

/** A q-page renders only inside a layout, as the other page specs do it. */
const Harness = defineComponent({
  render: () =>
    h(QLayout, { view: 'hHh lpR fFf' }, () => h(QPageContainer, () => h(CategoriesPage))),
})

const mountPage = async () => {
  const wrapper = mount(Harness, { global: { plugins: [i18n, Quasar] } })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

const toggleById = (wrapper: VueWrapper, testid: string) =>
  wrapper.findAllComponents(QToggle).find((c) => c.vm.$attrs['data-testid'] === testid)!

describe('categories page', () => {
  it('renders the tree with hidden nodes marked', async () => {
    const wrapper = await mountPage()
    const tree = wrapper.find('[data-testid="category-tree"]')
    expect(tree.text()).toContain('Food')
    expect(tree.text()).toContain('Snacks')
    expect(wrapper.find('[data-testid="category-node-3"]').classes()).toContain('text-grey')
    expect(wrapper.find('[data-testid="category-node-2"]').classes()).not.toContain('text-grey')
  })

  // Scenario "Search matches the full path" (design R1, checked first).
  it('filters on the full name and keeps the ancestors', async () => {
    const wrapper = await mountPage()
    await wrapper.find('[data-testid="category-search"]').setValue('snack')
    await flushPromises()

    expect(wrapper.findComponent(QTree).props('filter')).toBe('snack')
    expect(wrapper.find('[data-testid="category-node-2"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="category-node-1"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="category-node-5"]').exists()).toBe(false)
  })

  // Scenario "Hidden categories follow the preference".
  it('writes the show-hidden preference when the toggle changes', async () => {
    const wrapper = await mountPage()
    await toggleById(wrapper, 'category-show-hidden').vm.$emit('update:modelValue', false)
    await flushPromises()

    const store = useCategoryStore()
    expect(store.showHidden).toBe(false)
    expect(fake.batches.flat().some((s) => s.bind?.[1] === 'FALSE')).toBe(true)
    expect(wrapper.find('[data-testid="category-node-3"]').exists()).toBe(false)
  })

  // Scenario "Live use is refused on the surface".
  it('refuses deleting a category whose subcategory is used, with the reason', async () => {
    fake.state.counts = { 2: { transactions: 1 } }
    const wrapper = await mountPage()
    await wrapper.find('[data-testid="category-node-1"]').trigger('click')
    await wrapper.find('[data-testid="category-delete"]').trigger('click')
    await flushPromises()

    const banner = wrapper.find('[data-testid="category-action-error"]')
    expect(banner.text()).toContain('Subcategory in use.')
    expect(banner.text()).toContain('merge command')
    expect(wrapper.find('[data-testid="taxonomy-delete-card"]').exists()).toBe(false)
    expect(fake.batches).toHaveLength(0)
  })

  // Scenario "Deletion with subtree is confirmed" / "Purge is disclosed": the
  // page passes the subtree and the purge flag to the confirmation.
  it('opens the confirmation with the subtree and the purge sentence', async () => {
    fake.state.trashed = [9]
    const wrapper = await mountPage()
    await wrapper.find('[data-testid="category-node-1"]').trigger('click')
    await wrapper.find('[data-testid="category-delete"]').trigger('click')
    await flushPromises()

    const store = useCategoryStore()
    expect(store.pendingDeletion?.names).toEqual(['Food'])
    expect(store.pendingDeletion?.subcategories).toEqual(['Drinks', 'Snacks'])
    expect(store.pendingDeletion?.purge).toBe(true)
    expect(fake.batches).toHaveLength(0)
  })

  /** Dialog content is teleported to document.body, outside the wrapper. */
  const inBody = (testid: string) =>
    ((all) => all[all.length - 1] ?? null)([
      ...document.querySelectorAll<HTMLElement>(`[data-testid="${testid}"]`),
    ])

  // Scenario "A duplicate sibling is refused at the entry" (4.3).
  it('shows the duplicate refusal at the name entry and writes nothing', async () => {
    const wrapper = await mountPage()
    await wrapper.find('[data-testid="category-node-1"]').trigger('click')
    await wrapper.find('[data-testid="category-new"]').trigger('click')
    await flushPromises()
    const input = inBody('category-name') as HTMLInputElement
    input.value = 'snacks'
    input.dispatchEvent(new Event('input'))
    inBody('category-name-save')!.click()
    await flushPromises()

    expect(document.body.textContent).toContain('already exists for the parent')
    expect(fake.batches).toHaveLength(0)
  })

  // Scenario "Case-only rename is accepted" (4.3).
  it('accepts a case-only rename through the edit prompt', async () => {
    const wrapper = await mountPage()
    await wrapper.find('[data-testid="category-node-1"]').trigger('click')
    await wrapper.find('[data-testid="category-edit"]').trigger('click')
    await flushPromises()
    const input = inBody('category-name') as HTMLInputElement
    input.value = 'FOOD'
    input.dispatchEvent(new Event('input'))
    inBody('category-name-save')!.click()
    await flushPromises()

    const update = fake.batches.flat().find((st) => st.sql.includes('SET CATEGNAME'))
    expect(update?.bind).toEqual(['FOOD', 1])
  })

  // Scenario "A cyclic move is not offered" (4.3): the picker excludes the subtree.
  it('offers neither the category nor its subtree as a new parent', async () => {
    const wrapper = await mountPage()
    await wrapper.find('[data-testid="category-node-1"]').trigger('click')
    await wrapper.find('[data-testid="category-move"]').trigger('click')
    await flushPromises()

    const picker = wrapper.findComponent({ name: 'CategoryPicker' })
    expect(picker.exists()).toBe(true)
    expect(picker.props('excludeSubtreeOf')).toBe(1)
    expect(picker.props('allowTopLevel')).toBe(true)
  })

  // Category Visibility Actions (4.5): hide cascades, unhide-all in one batch.
  it('hides the selected subtree and unhides everything on request', async () => {
    const wrapper = await mountPage()
    await wrapper.find('[data-testid="category-node-1"]').trigger('click')
    await wrapper.find('[data-testid="category-hide"]').trigger('click')
    await flushPromises()
    expect(fake.batches[0]![0]!.sql.replace(/\s+/g, ' ')).toBe(
      'UPDATE CATEGORY_V1 SET ACTIVE = ? WHERE CATEGID IN (?, ?, ?)',
    )
    expect(fake.batches[0]![0]!.bind).toEqual([0, 1, 2, 3])

    await wrapper.find('[data-testid="category-unhide-all"]').trigger('click')
    await flushPromises()
    expect(fake.batches[1]!.map((st) => st.bind)).toEqual([[1, 3]])
  })

  // Merge Screens (4.5): the merge dialog gets used-only sources and the tree facts.
  it('opens the merge screen with usage and children facts', async () => {
    const wrapper = await mountPage()
    await wrapper.find('[data-testid="category-merge-open"]').trigger('click')
    await flushPromises()

    const dialog = wrapper.findComponent({ name: 'MergeDialog' })
    expect(dialog.props('modelValue')).toBe(true)
    expect(dialog.props('kind')).toBe('category')
    const options = dialog.props('options') as Array<{
      id: number
      hasChildren: boolean
      used: boolean
    }>
    expect(options.find((o) => o.id === 1)?.hasChildren).toBe(true)
    expect(options.find((o) => o.id === 2)?.hasChildren).toBe(false)
  })
})
