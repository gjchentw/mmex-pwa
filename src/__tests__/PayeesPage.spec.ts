import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { Quasar, QLayout, QPageContainer, QToggle } from 'quasar'

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
import PayeesPage from '../pages/PayeesPage.vue'
import { usePayeeStore } from '../stores/payee-store'
import type { CategoryRecord, PayeeRecord } from '../domain/records'

/**
 * Spec: transaction-taxonomy, Payee Manager Display, Payee Selection Actions,
 * Payee Deletion from the Surface, Merge Screens; design D8.
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

const categories: CategoryRecord[] = [{ CATEGID: 7, CATEGNAME: 'Food', PARENTID: -1, ACTIVE: 1 }]

const makeFakeDb = (opts: { setting?: [string, string][] } = {}) => {
  const state = {
    payees: [
      payee(1, 'Shop', { CATEGID: 7 }),
      payee(2, 'Old Shop', { ACTIVE: 0 }),
      payee(3, 'New Shop'),
    ],
    setting: new Map<string, string>(opts.setting ?? []),
    bulk: [[1, 3]] as Array<[number, number]>,
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
      if (flat.startsWith('SELECT * FROM CATEGORY_V1')) return categories as T[]
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
  render: () => h(QLayout, { view: 'hHh lpR fFf' }, () => h(QPageContainer, () => h(PayeesPage))),
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
const toggleById = (wrapper: VueWrapper, testid: string) =>
  wrapper.findAllComponents(QToggle).find((c) => c.vm.$attrs['data-testid'] === testid)!
const row = (wrapper: VueWrapper, id: number) => wrapper.find(`[data-payee-id="${id}"]`)

describe('payees page', () => {
  // Scenarios "The default-category column follows the mode", "Used counts…".
  it('renders desktop columns, the mode title, the Used cell and the hidden mark', async () => {
    const wrapper = await mountPage()
    const table = wrapper.find('[data-testid="payee-table"]')
    expect(table.text()).toContain('Last Used Category')
    expect(table.text()).toContain('Reference')
    expect(table.text()).toContain('Match Pattern')
    expect(row(wrapper, 1).text()).toContain('Food')
    expect(row(wrapper, 1).find('[data-testid="payee-used"]').text()).toBe('3')
    expect(row(wrapper, 2).find('[data-testid="payee-hidden-mark"]').exists()).toBe(true)
    expect(row(wrapper, 1).find('[data-testid="payee-hidden-mark"]').exists()).toBe(false)
  })

  it('titles the column Default Category for mode 3', async () => {
    fake = makeFakeDb({ setting: [['TRANSACTION_CATEGORY_NONE', '3']] })
    setDomainDb(fake.db)
    const wrapper = await mountPage()
    expect(wrapper.find('[data-testid="payee-table"]').text()).toContain('Default Category')
  })

  it('writes the show-hidden preference and drops hidden rows when turned off', async () => {
    const wrapper = await mountPage()
    await toggleById(wrapper, 'payee-show-hidden').vm.$emit('update:modelValue', false)
    await flushPromises()
    expect(fake.batches.flat().some((s) => s.bind?.[1] === 'FALSE')).toBe(true)
    expect(row(wrapper, 2).exists()).toBe(false)
  })

  // Scenario "A default category is defined for a selection".
  it('disables the toolbar without a selection and defines a category over the selection', async () => {
    const wrapper = await mountPage()
    const define = wrapper.find('[data-testid="payee-define-category"]')
    expect(define.attributes('disabled')).toBeDefined()

    usePayeeStore().selectedIds = [1, 3]
    await flushPromises()
    await wrapper.find('[data-testid="payee-define-category"]').trigger('click')
    await flushPromises()
    const picker = wrapper.findComponent({ name: 'CategoryPicker' })
    await picker.vm.$emit('update:modelValue', 7)
    inBody('payee-define-category-confirm')!.click()
    await flushPromises()

    const update = fake.batches.flat().find((s) => s.sql.includes('SET CATEGID'))!
    expect(update.bind).toEqual([7, 1, 3])
  })

  it('hides the selection in one statement', async () => {
    const wrapper = await mountPage()
    usePayeeStore().selectedIds = [1, 3]
    await flushPromises()
    await wrapper.find('[data-testid="payee-hide"]').trigger('click')
    await flushPromises()
    expect(fake.batches[0]![0]!.bind).toEqual([0, 1, 3])
  })

  // Scenario "A mixed selection is partly deleted".
  it('deletes the deletable part of a selection and reports the kept payee', async () => {
    fake.state.counts = { 1: { transactions: 1 } }
    const wrapper = await mountPage()
    usePayeeStore().selectedIds = [1, 3]
    await flushPromises()
    await wrapper.find('[data-testid="payee-remove"]').trigger('click')
    await flushPromises()
    expect(inBody('taxonomy-delete-names')?.textContent).toContain('New Shop')
    inBody('taxonomy-delete-confirm')!.click()
    await flushPromises()

    const deletes = fake.batches.flat().filter((s) => s.sql.includes('DELETE FROM PAYEE_V1'))
    expect(deletes.map((s) => s.bind)).toEqual([[3]])
    expect(wrapper.find('[data-testid="payee-kept"]').text()).toContain('Shop')
  })

  it('opens the editor for a new payee and the merge screen for one selected payee', async () => {
    const wrapper = await mountPage()
    await wrapper.find('[data-testid="payee-add"]').trigger('click')
    expect(wrapper.findComponent({ name: 'PayeeEditorDialog' }).props('modelValue')).toBe(true)

    usePayeeStore().selectedIds = [1]
    await flushPromises()
    await wrapper.find('[data-testid="payee-merge"]').trigger('click')
    const merge = wrapper.findComponent({ name: 'MergeDialog' })
    expect(merge.props('modelValue')).toBe(true)
    expect(merge.props('kind')).toBe('payee')
    expect(merge.props('initialSource')).toBe(1)
  })
})
