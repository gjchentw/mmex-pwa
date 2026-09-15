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
import AccountsPage from '../pages/AccountsPage.vue'
import type { AccountRecord } from '../domain/records'

/** Spec: account-management, the list surface. */

const CURRENCIES = [
  { CURRENCYID: 1, CURRENCYNAME: 'US dollar', CURRENCY_SYMBOL: 'USD' },
  { CURRENCYID: 2, CURRENCYNAME: 'Euro', CURRENCY_SYMBOL: 'EUR' },
].map((c) => ({
  ...c,
  PFX_SYMBOL: '$',
  SFX_SYMBOL: '',
  DECIMAL_POINT: '.',
  GROUP_SEPARATOR: ',',
  UNIT_NAME: '',
  CENT_NAME: '',
  SCALE: 100,
  BASECONVRATE: 1,
  CURRENCY_TYPE: 'Fiat',
}))

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

const makeFakeDb = (accounts: AccountRecord[]): DomainDb => ({
  async query<T>(sql: string): Promise<T[]> {
    if (sql.includes('FROM ACCOUNTLIST_V1')) return accounts as T[]
    if (sql.includes('FROM CURRENCYFORMATS_V1')) return CURRENCIES as T[]
    return [] as T[]
  },
  async mutate(): Promise<void> {},
})

const Harness = defineComponent({
  render: () => h(QLayout, { view: 'hHh lpR fFf' }, () => h(QPageContainer, () => h(AccountsPage))),
})

const mountPage = async (accounts: AccountRecord[]) => {
  setDomainDb(makeFakeDb(accounts))
  const wrapper = mount(Harness, { global: { plugins: [i18n, Quasar] } })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  setActivePinia(createPinia())
  i18n.global.locale.value = 'en-US'
})

afterEach(() => setDomainDb())

describe('AccountsPage list display', () => {
  // Requirement "Account List Display", scenario "Every account in the file is
  // listed".
  it('lists every account with its name, type and currency', async () => {
    const wrapper = await mountPage([
      account(1, 'Everyday Checking'),
      account(2, 'Amex Gold', { ACCOUNTTYPE: 'Credit Card', CURRENCYID: 2 }),
    ])

    const list = wrapper.find('[data-testid="account-list"]')
    expect(list.text()).toContain('Everyday Checking')
    expect(list.text()).toContain('Amex Gold')
    expect(list.text()).toContain('Credit Card')
    expect(list.text()).toContain('Euro')
  })

  // Requirement "Account List Display": Closed accounts are visually distinct.
  it('marks a closed account and leaves open ones unmarked', async () => {
    const wrapper = await mountPage([
      account(1, 'Everyday Checking'),
      account(2, 'Old Savings', { STATUS: 'Closed' }),
    ])

    const badges = wrapper.findAll('[data-testid="account-closed-badge"]')
    expect(badges).toHaveLength(1)
  })

  // Requirement "Favorite Account Indication". Risk R6.
  it('marks a favorite account', async () => {
    const wrapper = await mountPage([
      account(1, 'Everyday Checking'),
      account(2, 'Amex Gold', { FAVORITEACCT: 'TRUE' }),
    ])

    expect(wrapper.findAll('[data-testid="account-favorite-badge"]')).toHaveLength(1)
  })

  // Requirement "Balance Display Formatting".
  it('renders each balance in the account currency', async () => {
    const wrapper = await mountPage([account(1, 'Everyday Checking', { INITIALBAL: 1234.5 })])

    const balance = wrapper.find('[data-testid="account-balance"]')
    expect(balance.exists()).toBe(true)
    expect(balance.text()).toContain('1,234.50')
    expect(balance.text()).toContain('$')
  })

  // Scenario "A negative balance is distinguishable".
  it('renders a negative balance with its sign', async () => {
    const wrapper = await mountPage([account(1, 'Amex Gold', { INITIALBAL: -80 })])

    expect(wrapper.find('[data-testid="account-balance"]').text()).toContain('-')
  })

  it('explains an empty file rather than showing a bare list', async () => {
    const wrapper = await mountPage([])

    expect(wrapper.find('[data-testid="account-empty"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="account-list"]').text()).not.toContain('Checking')
  })

  // Requirement "Accounts Surface Route": creation starts from the list.
  it('offers the add action', async () => {
    const wrapper = await mountPage([account(1, 'Everyday Checking')])

    expect(wrapper.find('[data-testid="account-add"]').exists()).toBe(true)
  })
})
