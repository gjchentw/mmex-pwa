import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { Quasar, QDialog, QLayout, QPageContainer, QToggle } from 'quasar'

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
import CurrenciesPage from '../pages/CurrenciesPage.vue'
import CurrencyEditorDialog from '../components/currency/CurrencyEditorDialog.vue'
import { useCurrencyStore } from '../stores/currency-store'
import type { CurrencyHistoryRecord, CurrencyRecord } from '../domain/records'

/** Spec: currency-management, the list surface (delta: desktop fidelity). */

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

/** A small file: USD is the base, EUR is used by an account, CHF by nothing. */
const makeFakeDb = (
  opts: { used?: number[]; base?: string | null; info?: [string, string][] } = {},
) => {
  const state = {
    currencies: [
      currency(1, 'US dollar', 'USD'),
      currency(2, 'Euro', 'EUR', { BASECONVRATE: 1.1 }),
      currency(4, 'Swiss franc', 'CHF', { BASECONVRATE: 0.9 }),
    ],
    used: opts.used ?? [2],
    info: new Map<string, string>([
      ...(opts.base === null ? [] : [['BASECURRENCYID', opts.base ?? '1'] as [string, string]]),
      ['USECURRENCYHISTORY', '1'],
      ...(opts.info ?? []),
    ]),
    history: [] as CurrencyHistoryRecord[],
    failWrites: false,
  }
  const db: DomainDb = {
    async query<T>(sql: string, bind?: unknown[]): Promise<T[]> {
      if (sql.includes("'accounts' AS SOURCE")) {
        return state.used.map((id) => ({ CURRENCYID: id, SOURCE: 'accounts' })) as T[]
      }
      if (sql.includes('MAX(CURRDATE)')) {
        const latest = new Map<number, CurrencyHistoryRecord>()
        for (const row of state.history) {
          const current = latest.get(row.CURRENCYID)
          if (!current || row.CURRDATE > current.CURRDATE) latest.set(row.CURRENCYID, row)
        }
        return [...latest.values()].map((r) => ({
          CURRENCYID: r.CURRENCYID,
          CURRVALUE: r.CURRVALUE,
        })) as T[]
      }
      if (sql.includes('COLLATE NOCASE')) {
        const [name, symbol, exclude] = bind as [string, string, number]
        return state.currencies.filter(
          (c) =>
            c.CURRENCYID !== exclude &&
            (c.CURRENCYNAME.toLowerCase() === String(name).toLowerCase() ||
              c.CURRENCY_SYMBOL.toLowerCase() === String(symbol).toLowerCase()),
        ) as T[]
      }
      if (sql.includes('FROM CURRENCYFORMATS_V1'))
        return state.currencies.map((c) => ({ ...c })) as T[]
      if (sql.includes('FROM CURRENCYHISTORY_V1')) {
        return state.history.filter((h) => h.CURRENCYID === bind?.[0]) as T[]
      }
      if (sql.includes('FROM INFOTABLE_V1')) {
        const value = state.info.get(String(bind?.[0] ?? ''))
        return (value === undefined ? [] : [{ INFOVALUE: value }]) as T[]
      }
      if (sql.includes('COUNT(*)')) {
        const id = bind?.[0] as number
        const count = sql.includes('ACCOUNTLIST_V1') && state.used.includes(id) ? 1 : 0
        return [{ count }] as T[]
      }
      return [] as T[]
    },
    async mutate(statements: SqlStatement[]): Promise<void> {
      if (state.failWrites) throw new Error('disk full')
      for (const s of statements) {
        if (s.sql.includes('INTO INFOTABLE_V1')) {
          const [key, value] = s.bind as [string, string]
          state.info.set(key, value)
        } else if (s.sql.includes('INSERT INTO CURRENCYHISTORY_V1')) {
          const [cid, date, value, type] = s.bind as [number, string, number, number]
          state.history.push({
            CURRHISTID: state.history.length + 1,
            CURRENCYID: cid,
            CURRDATE: date,
            CURRVALUE: value,
            CURRUPDTYPE: type,
          })
        } else if (s.sql.includes('DELETE FROM CURRENCYHISTORY_V1 WHERE CURRENCYID')) {
          state.history = state.history.filter((h) => h.CURRENCYID !== s.bind?.[0])
        } else if (s.sql.includes('DELETE FROM CURRENCYFORMATS_V1')) {
          state.currencies = state.currencies.filter((c) => c.CURRENCYID !== s.bind?.[0])
        }
      }
    },
  }
  return { db, state }
}

let fake: ReturnType<typeof makeFakeDb>

const Harness = defineComponent({
  render: () =>
    h(QLayout, { view: 'hHh lpR fFf' }, () => h(QPageContainer, () => h(CurrenciesPage))),
})

const mountPage = async (opts: Parameters<typeof makeFakeDb>[0] = {}) => {
  fake = makeFakeDb(opts)
  setDomainDb(fake.db)
  const wrapper = mount(Harness, { global: { plugins: [i18n, Quasar] } })
  await flushPromises()
  return wrapper
}

/** Dialogs are teleported to document.body, outside the wrapper. */
const inBody = (testid: string) => document.querySelector<HTMLElement>(`[data-testid="${testid}"]`)
const clickInBody = async (testid: string) => {
  inBody(testid)?.click()
  await flushPromises()
}
/** QDialog keeps its content in the body through its closing transition, so the model is what says it closed. */
const deleteDialogOpen = (wrapper: VueWrapper) =>
  wrapper
    .findAllComponents(QDialog)
    .find((c) => c.vm.$attrs['data-testid'] === 'currency-delete-dialog')
    ?.props('modelValue')

const openCurrency = async (wrapper: VueWrapper, symbol: string) => {
  await wrapper.find(`[data-currency="${symbol}"]`).trigger('click')
  await flushPromises()
}

beforeEach(() => {
  setActivePinia(createPinia())
  i18n.global.locale.value = 'en-US'
  document.body.innerHTML = ''
})

afterEach(() => setDomainDb())

describe('CurrenciesPage list', () => {
  // Scenario "Every currency is listed when the file holds no choice" (design D4).
  it('lists every currency by default, as desktop does', async () => {
    const wrapper = await mountPage()

    const list = wrapper.find('[data-testid="currency-list"]')
    expect(list.text()).toContain('USD')
    expect(list.text()).toContain('EUR')
    expect(list.text()).toContain('CHF')
  })

  // Scenario "The scope choice is stored in the file".
  it('writes SHOW_HIDDEN_CURRENCIES when the toggle changes, and narrows the list', async () => {
    const wrapper = await mountPage()

    const toggle = wrapper
      .findAllComponents(QToggle)
      .find((c) => c.vm.$attrs['data-testid'] === 'currency-show-all')!
    await toggle.trigger('click')
    await flushPromises()

    expect(fake.state.info.get('SHOW_HIDDEN_CURRENCIES')).toBe('0')
    const list = wrapper.find('[data-testid="currency-list"]')
    expect(list.text()).toContain('EUR')
    expect(list.text()).not.toContain('CHF')
  })

  // Scenario "Only the currencies in use are listed by default", stored choice off.
  it('explains that nothing is in use when the stored choice hides the rest and nothing is used', async () => {
    const wrapper = await mountPage({
      used: [],
      base: null,
      info: [['SHOW_HIDDEN_CURRENCIES', '0']],
    })

    const empty = wrapper.find('[data-testid="currency-empty"]')
    expect(empty.text()).toContain('No currency is in use yet')
    expect(wrapper.find('[data-testid="currency-empty-show-all"]').exists()).toBe(true)
  })

  it('reports a genuine search miss as a search miss', async () => {
    const wrapper = await mountPage()
    const store = useCurrencyStore()

    store.search = 'nothing matches this'
    await flushPromises()

    expect(wrapper.find('[data-testid="currency-empty"]').text()).toContain('No currencies match')
  })

  // Scenario "The rate column follows the history setting" (design D5).
  it('titles the rate column "Last rate" and shows the latest recorded rate while history is on', async () => {
    const wrapper = await mountPage()
    const store = useCurrencyStore()
    await store.recordRate(2, '2026-01-01', 1.2)
    await store.recordRate(2, '2026-08-09', 1.3)
    await flushPromises()

    expect(wrapper.find('[data-testid="currency-rate-column"]').text()).toBe('Last rate')
    const euro = wrapper.find('[data-currency="EUR"] [data-testid="currency-rate-cell"]')
    expect(euro.text()).toBe('1.3')
  })

  it('titles the rate column "Fixed rate" and shows BASECONVRATE while history is off', async () => {
    const wrapper = await mountPage({ info: [['USECURRENCYHISTORY', '0']] })

    expect(wrapper.find('[data-testid="currency-rate-column"]').text()).toBe('Fixed rate')
    expect(wrapper.find('[data-currency="EUR"] [data-testid="currency-rate-cell"]').text()).toBe(
      '1.1',
    )
  })

  // Design D8: the type is translated for display only.
  it('names the type in the active language', async () => {
    i18n.global.locale.value = 'zh-TW'
    const wrapper = await mountPage()

    expect(wrapper.find('[data-currency="EUR"]').text()).toContain('法定貨幣')
  })
})

describe('CurrenciesPage deletion', () => {
  // Scenario "Deleting an unused currency takes its history", through the real
  // confirmation (design D1).
  it('asks before deleting, then removes the currency and its history and closes the editor', async () => {
    const wrapper = await mountPage()
    const store = useCurrencyStore()
    await store.recordRate(4, '2026-08-09', 0.95)
    await openCurrency(wrapper, 'CHF')

    await clickInBody('currency-delete')
    expect(inBody('currency-delete-dialog')).not.toBeNull()
    expect(inBody('currency-delete-dialog')?.textContent).toContain('Swiss franc (CHF)')
    expect(fake.state.currencies.some((c) => c.CURRENCYID === 4)).toBe(true)

    await clickInBody('currency-delete-confirm')

    expect(fake.state.currencies.some((c) => c.CURRENCYID === 4)).toBe(false)
    expect(fake.state.history.filter((h) => h.CURRENCYID === 4)).toHaveLength(0)
    expect(wrapper.findComponent(CurrencyEditorDialog).props('modelValue')).toBe(false)
    expect(wrapper.find('[data-testid="currency-list"]').text()).not.toContain('CHF')
  })

  // Scenario "Declining the confirmation deletes nothing".
  it('deletes nothing when the confirmation is declined', async () => {
    const wrapper = await mountPage()
    await openCurrency(wrapper, 'CHF')

    await clickInBody('currency-delete')
    await clickInBody('currency-delete-cancel')

    expect(deleteDialogOpen(wrapper)).toBe(false)
    expect(fake.state.currencies.some((c) => c.CURRENCYID === 4)).toBe(true)
    expect(wrapper.findComponent(CurrencyEditorDialog).props('modelValue')).toBe(true)
  })

  // Scenario "A currency in use cannot be deleted": the control is disabled with the reason.
  it('disables deletion of a currency an account uses, saying so', async () => {
    const wrapper = await mountPage()
    await openCurrency(wrapper, 'EUR')

    expect(inBody('currency-delete')?.hasAttribute('disabled')).toBe(true)
    expect(inBody('currency-delete-reason')?.textContent).toContain('Accounts use this currency')
  })

  // Scenario "The base currency cannot be deleted from the surface".
  it('disables deletion of the base currency, saying so', async () => {
    const wrapper = await mountPage()
    await openCurrency(wrapper, 'USD')

    expect(inBody('currency-delete')?.hasAttribute('disabled')).toBe(true)
    expect(inBody('currency-delete-reason')?.textContent).toContain('This is the base currency')
  })

  // A failed deletion is shown on the page and the currency stays listed.
  it('shows a failed deletion on the page and keeps the currency', async () => {
    const wrapper = await mountPage()
    await openCurrency(wrapper, 'CHF')
    fake.state.failWrites = true

    await clickInBody('currency-delete')
    await clickInBody('currency-delete-confirm')

    expect(wrapper.find('[data-testid="currency-action-error"]').text()).toContain('disk full')
    expect(wrapper.find('[data-testid="currency-list"]').text()).toContain('CHF')
  })
})

describe('CurrenciesPage history and conflicts', () => {
  // A failed history write is shown in the editor and the entry kept (design D11).
  it('shows a failed rate write in the editor', async () => {
    const wrapper = await mountPage()
    await openCurrency(wrapper, 'CHF')
    fake.state.failWrites = true

    const dateInput = inBody('rate-date') as HTMLInputElement
    const valueInput = inBody('rate-value') as HTMLInputElement
    dateInput.value = '2026-08-09'
    dateInput.dispatchEvent(new Event('input'))
    valueInput.value = '0.95'
    valueInput.dispatchEvent(new Event('input'))
    await flushPromises()
    await clickInBody('rate-add')

    expect(inBody('currency-editor-error')?.textContent).toContain('disk full')
    expect((inBody('rate-value') as HTMLInputElement).value).toBe('0.95')
    void wrapper
  })

  // Scenario "A conflicting name is refused", translated with the other currency (design D9).
  it('names the colliding name and currency when an edit conflicts', async () => {
    const wrapper = await mountPage()
    await openCurrency(wrapper, 'CHF')

    const input = inBody('currency-name') as HTMLInputElement
    input.value = 'euro'
    input.dispatchEvent(new Event('input'))
    await flushPromises()
    await clickInBody('currency-save')

    expect(inBody('currency-editor-error')?.textContent).toContain(
      'Another currency is already named Euro (EUR)',
    )
    expect(fake.state.currencies.find((c) => c.CURRENCYID === 4)?.CURRENCYNAME).toBe('Swiss franc')
  })

  // Scenario "A conflicting code is refused by its own name", translated (design D9).
  it('names the colliding code and currency when an addition conflicts', async () => {
    const wrapper = await mountPage()
    await wrapper.find('[data-testid="currency-add"]').trigger('click')
    await flushPromises()

    const set = (testid: string, value: string) => {
      const input = inBody(testid) as HTMLInputElement
      input.value = value
      input.dispatchEvent(new Event('input'))
    }
    set('currency-name', 'Something else')
    set('currency-symbol', 'eur')
    set('currency-rate', '2')
    await flushPromises()
    await clickInBody('currency-save')

    expect(inBody('currency-editor-error')?.textContent).toContain(
      'The code EUR already belongs to Euro',
    )
    expect(fake.state.currencies).toHaveLength(3)
  })
})
