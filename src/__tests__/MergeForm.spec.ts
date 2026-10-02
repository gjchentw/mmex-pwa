import { describe, it, expect, vi } from 'vitest'

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
import { mount, flushPromises } from '@vue/test-utils'
import { Quasar, QCheckbox, QSelect } from 'quasar'
import { i18n } from '../i18n'
import MergeForm from '../components/taxonomy/MergeForm.vue'
import { TaxonomyMergeError, type TaxonomyUsage } from '../domain/repos/taxonomy'

/** Spec: transaction-taxonomy, Requirement "Merge Screens" (design D7). */

const usage = (extra: Partial<TaxonomyUsage> = {}): TaxonomyUsage => ({
  transactions: 0,
  splits: 0,
  series: 0,
  seriesSplits: 0,
  budgetRows: 0,
  payeeDefaults: 0,
  descendantUsed: false,
  trashedTransactionIds: [],
  orphanLinks: 0,
  state: 'used',
  ...extra,
})

const options = [
  { id: 1, label: 'Food', hidden: false, used: true, hasChildren: true },
  { id: 2, label: 'Food:Snacks', hidden: false, used: true, hasChildren: false },
  { id: 3, label: 'Drinks', hidden: true, used: false, hasChildren: false },
  { id: 5, label: 'Bills', hidden: false, used: false, hasChildren: false },
]

const mountForm = (props: Partial<Record<string, unknown>> = {}) => {
  const usageOf = vi.fn(async () =>
    usage({
      transactions: 2,
      splits: 1,
      series: 0,
      seriesSplits: 0,
      budgetRows: 1,
      payeeDefaults: 0,
    }),
  )
  const relocate = vi.fn(async () => ({ changed: 4 }))
  const wrapper = mount(MergeForm, {
    global: { plugins: [i18n, Quasar] },
    props: { kind: 'category', options, usageOf, relocate, ...props },
  })
  return { wrapper, usageOf, relocate }
}

const selectById = (wrapper: ReturnType<typeof mountForm>['wrapper'], testid: string) =>
  wrapper.findAllComponents(QSelect).find((c) => c.vm.$attrs['data-testid'] === testid)!
const labels = (select: ReturnType<typeof selectById>) =>
  (select.props('options') as Array<{ label: string }>).map((o) => o.label)
const pick = async (select: ReturnType<typeof selectById>, id: number) => {
  await select.vm.$emit(
    'update:modelValue',
    (select.props('options') as Array<{ value: number }>).find((o) => o.value === id),
  )
  await flushPromises()
}

describe('merge form', () => {
  it('offers used entities as sources and visible ones other than the source as targets', async () => {
    const { wrapper } = mountForm()
    expect(labels(selectById(wrapper, 'merge-source'))).toEqual(['Food', 'Food:Snacks'])
    await pick(selectById(wrapper, 'merge-source'), 2)
    expect(labels(selectById(wrapper, 'merge-target'))).toEqual(['Food', 'Bills'])
  })

  // Scenario "Counts are shown before the merge".
  it('shows desktop count lines for the chosen source', async () => {
    const { wrapper, usageOf } = mountForm()
    await pick(selectById(wrapper, 'merge-source'), 2)
    expect(usageOf).toHaveBeenCalledWith(2)
    const counts = wrapper.find('[data-testid="merge-counts"]').text()
    expect(counts).toContain('Records found in transactions: 2')
    expect(counts).toContain('Records found in split transactions: 1')
    expect(counts).toContain('Records found in budget: 1')
    expect(counts).toContain('Records found as default payee category: 0')
  })

  it('disables delete-source for a category with subcategories', async () => {
    const { wrapper } = mountForm()
    await pick(selectById(wrapper, 'merge-source'), 1)
    expect(wrapper.findComponent(QCheckbox).props('disable')).toBe(true)
    await pick(selectById(wrapper, 'merge-source'), 2)
    expect(wrapper.findComponent(QCheckbox).props('disable')).toBe(false)
  })

  // Scenario "The merge reports what changed".
  it('confirms From … to …, merges with the chosen options, and reports the count', async () => {
    const { wrapper, relocate } = mountForm()
    await pick(selectById(wrapper, 'merge-source'), 2)
    await pick(selectById(wrapper, 'merge-target'), 5)
    await wrapper.findComponent(QCheckbox).vm.$emit('update:modelValue', true)
    await wrapper.find('[data-testid="merge-confirm"]').trigger('click')
    expect(wrapper.text()).toContain('From Food:Snacks to Bills')
    await wrapper.find('[data-testid="merge-confirm-accept"]').trigger('click')
    await flushPromises()
    expect(relocate).toHaveBeenCalledWith(2, 5, { deleteSource: true })
    expect(wrapper.find('[data-testid="merge-result"]').text()).toContain('4 records changed')
    expect(wrapper.emitted('merged')?.[0]).toEqual([{ changed: 4 }])
  })

  it('reports the collapsed links for tags', async () => {
    const tagOptions = [
      { id: 1, label: 'travel', hidden: false, used: true },
      { id: 2, label: 'trip', hidden: false, used: true },
    ]
    const relocate = vi.fn(async () => ({ changed: 2, collapsed: 1 }))
    const { wrapper } = mountForm({ kind: 'tag', options: tagOptions, relocate })
    await pick(selectById(wrapper, 'merge-source'), 2)
    await pick(selectById(wrapper, 'merge-target'), 1)
    await wrapper.find('[data-testid="merge-confirm"]').trigger('click')
    await wrapper.find('[data-testid="merge-confirm-accept"]').trigger('click')
    await flushPromises()
    const result = wrapper.find('[data-testid="merge-result"]').text()
    expect(result).toContain('2 records changed')
    expect(result).toContain('1 duplicate links collapsed')
  })

  it('shows a refusal on the form and writes nothing more', async () => {
    const relocate = vi.fn(async () => {
      throw new TaxonomyMergeError('hiddenTarget')
    })
    const { wrapper } = mountForm({ relocate })
    await pick(selectById(wrapper, 'merge-source'), 2)
    await pick(selectById(wrapper, 'merge-target'), 5)
    await wrapper.find('[data-testid="merge-confirm"]').trigger('click')
    await wrapper.find('[data-testid="merge-confirm-accept"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="merge-error"]').text()).toContain('hidden')
    expect(wrapper.find('[data-testid="merge-result"]').exists()).toBe(false)
  })

  // Payee Selection Actions / Tag Manager Display: Merge opens with the selected
  // entity as the source, counts already loading.
  it('preselects the initial source and loads its counts', async () => {
    const { wrapper, usageOf } = mountForm({ initialSource: 2 })
    await flushPromises()
    expect(usageOf).toHaveBeenCalledWith(2)
    expect(wrapper.find('[data-testid="merge-counts"]').text()).toContain(
      'Records found in transactions: 2',
    )
    expect(labels(selectById(wrapper, 'merge-target'))).toEqual(['Food', 'Bills'])
  })
})
