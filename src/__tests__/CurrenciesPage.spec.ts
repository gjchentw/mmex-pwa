import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
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

import { setDomainDb, type DomainDb } from '../domain/db'
import { i18n } from '../i18n'
import CurrenciesPage from '../pages/CurrenciesPage.vue'
import { useCurrencyStore } from '../stores/currency-store'

/** Spec: currency-management, the list surface. */

const CURRENCIES = [
  { CURRENCYID: 1, CURRENCYNAME: 'US dollar', CURRENCY_SYMBOL: 'USD' },
  { CURRENCYID: 2, CURRENCYNAME: 'Euro', CURRENCY_SYMBOL: 'EUR' },
].map((c) => ({
  ...c,
  PFX_SYMBOL: '',
  SFX_SYMBOL: '',
  DECIMAL_POINT: '.',
  GROUP_SEPARATOR: ',',
  UNIT_NAME: '',
  CENT_NAME: '',
  SCALE: 100,
  BASECONVRATE: 1,
  CURRENCY_TYPE: 'Fiat',
}))

/** `usedIds` empty and no base currency is the state before accounts exist. */
const makeFakeDb = (opts: { used: number[]; base: string | null }): DomainDb => ({
  async query<T>(sql: string, bind?: unknown[]): Promise<T[]> {
    if (sql.includes('SELECT DISTINCT CURRENCYID')) {
      return opts.used.map((id) => ({ CURRENCYID: id })) as T[]
    }
    if (sql.includes('FROM CURRENCYFORMATS_V1')) return CURRENCIES as T[]
    if (sql.includes('FROM INFOTABLE_V1')) {
      const key = String(bind?.[0] ?? '')
      if (key === 'BASECURRENCYID' && opts.base !== null) return [{ INFOVALUE: opts.base }] as T[]
      return [] as T[]
    }
    return [] as T[]
  },
  async mutate(): Promise<void> {},
})

const Harness = defineComponent({
  render: () =>
    h(QLayout, { view: 'hHh lpR fFf' }, () => h(QPageContainer, () => h(CurrenciesPage))),
})

const mountPage = async () => {
  const wrapper = mount(Harness, { global: { plugins: [i18n, Quasar] } })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  setActivePinia(createPinia())
  i18n.global.locale.value = 'en-US'
})

afterEach(() => setDomainDb())

describe('CurrenciesPage empty states', () => {
  // Before accounts exist nothing references a currency, which is the normal
  // state for a new file -- reporting it as a search miss reads as a defect.
  it('explains that nothing is in use rather than claiming no match', async () => {
    setDomainDb(makeFakeDb({ used: [], base: null }))
    const wrapper = await mountPage()

    const empty = wrapper.find('[data-testid="currency-empty"]')
    expect(empty.exists()).toBe(true)
    expect(empty.text()).toContain('No currency is in use yet')
    expect(empty.text()).not.toContain('No currencies match')
    // And it offers the way out.
    expect(wrapper.find('[data-testid="currency-empty-show-all"]').exists()).toBe(true)
  })

  it('reports a genuine search miss as a search miss', async () => {
    setDomainDb(makeFakeDb({ used: [2], base: '1' }))
    const wrapper = await mountPage()
    const store = useCurrencyStore()

    store.search = 'nothing matches this'
    await flushPromises()

    const empty = wrapper.find('[data-testid="currency-empty"]')
    expect(empty.text()).toContain('No currencies match')
    expect(wrapper.find('[data-testid="currency-empty-show-all"]').exists()).toBe(false)
  })

  // Requirement "Currency Management Surface" -- the base currency counts as in
  // use even when nothing references it.
  it('lists the base currency even with nothing referencing any currency', async () => {
    setDomainDb(makeFakeDb({ used: [], base: '1' }))
    const wrapper = await mountPage()

    expect(wrapper.find('[data-testid="currency-empty"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="currency-list"]').text()).toContain('USD')
    expect(wrapper.find('[data-testid="currency-list"]').text()).not.toContain('EUR')
  })
})
