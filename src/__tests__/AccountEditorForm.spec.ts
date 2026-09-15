import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { Quasar, QSelect } from 'quasar'

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
import AccountEditorForm from '../components/account/AccountEditorForm.vue'
import { ACCOUNT_TYPES } from '../domain/rules/account'
import type { AccountRecord, CurrencyRecord } from '../domain/records'

/** Spec: account-management, the editor surface. */

const CURRENCIES: CurrencyRecord[] = [
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

const account = (type: string, extra: Partial<AccountRecord> = {}): AccountRecord => ({
  ACCOUNTID: 1,
  ACCOUNTNAME: 'Everyday Checking',
  ACCOUNTTYPE: type,
  ACCOUNTNUM: null,
  STATUS: 'Open',
  NOTES: null,
  HELDAT: null,
  WEBSITE: null,
  CONTACTINFO: null,
  ACCESSINFO: null,
  INITIALBAL: 100,
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

const fakeDb: DomainDb = {
  async query<T>(): Promise<T[]> {
    return [] as T[]
  },
  async mutate(): Promise<void> {},
}

const mountForm = async (accountProp: AccountRecord | null) => {
  const wrapper = mount(AccountEditorForm, {
    props: { account: accountProp, currencies: CURRENCIES, errorMessage: '' },
    global: { plugins: [i18n, Quasar] },
  })
  await flushPromises()
  return wrapper
}

const CREDIT_FIELDS = [
  'account-credit-limit',
  'account-minimum-balance',
  'account-interest-rate',
  'account-minimum-payment',
  'account-payment-due',
]

beforeEach(() => {
  setActivePinia(createPinia())
  setDomainDb(fakeDb)
  i18n.global.locale.value = 'en-US'
})

afterEach(() => setDomainDb())

describe('type-specific field presentation', () => {
  // Requirement "Type-Specific Field Presentation", scenario "Credit card
  // fields appear for credit card account". Risk R3.
  it.each(['Credit Card', 'Loan', 'Term'])(
    'offers the credit and loan fields for %s',
    async (type) => {
      const wrapper = await mountForm(account(type))

      for (const field of CREDIT_FIELDS) {
        expect(wrapper.find(`[data-testid="${field}"]`).exists()).toBe(true)
      }
    },
  )

  // Scenario "Cash account shows only common fields".
  it.each(['Cash', 'Checking'])('withholds the credit and loan fields for %s', async (type) => {
    const wrapper = await mountForm(account(type))

    for (const field of CREDIT_FIELDS) {
      expect(wrapper.find(`[data-testid="${field}"]`).exists()).toBe(false)
    }
  })

  // Investment-specific and asset-specific fields are reserved for
  // investment-tracking and asset-tracking, so this editor offers none of them.
  it.each(['Investment', 'Shares', 'Asset'])('offers no reserved fields for %s', async (type) => {
    const wrapper = await mountForm(account(type))

    for (const field of CREDIT_FIELDS) {
      expect(wrapper.find(`[data-testid="${field}"]`).exists()).toBe(false)
    }
    // The common fields are still there -- the type is editable, its extras are not.
    expect(wrapper.find('[data-testid="account-name"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="account-currency"]').exists()).toBe(true)
  })

  // Requirement "Account Types": the eight upstream strings, exactly.
  it('offers every upstream account type', async () => {
    const wrapper = await mountForm(null)
    const select = wrapper.findAllComponents(QSelect).find((c) => c.props('options')?.length === 8)

    expect(select?.props('options')).toEqual([...ACCOUNT_TYPES])
    expect(ACCOUNT_TYPES).toHaveLength(8)
  })
})

describe('currency binding', () => {
  // Requirement "Currency Binding". Risk R7: the selector offers only currencies
  // the file defines.
  it('populates the selector from the currencies the file holds', async () => {
    const wrapper = await mountForm(null)
    const select = wrapper
      .findAllComponents(QSelect)
      .find((c) => c.props('optionValue') === 'CURRENCYID')

    expect(select?.props('options')).toEqual(CURRENCIES)
  })

  it('binds a new account to the first available currency', async () => {
    const wrapper = await mountForm(null)

    await wrapper.find('[data-testid="account-name"]').setValue('Travel Fund')
    await wrapper.find('[data-testid="account-save"]').trigger('click')
    await flushPromises()

    const saved = wrapper.emitted('save')?.[0]?.[0] as Partial<AccountRecord>
    expect(saved?.CURRENCYID).toBe(1)
  })
})

describe('editing an existing account', () => {
  // Requirement "Account Editing", scenario "An account definition is changed".
  it('pre-populates every persisted field', async () => {
    const wrapper = await mountForm(
      account('Credit Card', { ACCOUNTNAME: 'Amex Gold', CREDITLIMIT: 5000, CURRENCYID: 2 }),
    )

    expect((wrapper.find('[data-testid="account-name"]').element as HTMLInputElement).value).toBe(
      'Amex Gold',
    )
    expect(
      (wrapper.find('[data-testid="account-credit-limit"]').element as HTMLInputElement).value,
    ).toBe('5000')
    expect(wrapper.find('[data-testid="account-editor-existing"]').exists()).toBe(true)
  })

  it('marks a new account as new', async () => {
    const wrapper = await mountForm(null)

    expect(wrapper.find('[data-testid="account-editor-existing"]').exists()).toBe(false)
    // Deleting is offered only for an account that exists.
    expect(wrapper.find('[data-testid="account-delete"]').exists()).toBe(false)
  })
})

describe('required fields', () => {
  // Requirement "Account Creation": the name is required. Risk R1.
  it('refuses to save an account with no name', async () => {
    const wrapper = await mountForm(null)

    await wrapper.find('[data-testid="account-save"]').trigger('click')
    await flushPromises()

    expect(wrapper.emitted('save')).toBeUndefined()
  })

  it('accepts a save once the name is given', async () => {
    const wrapper = await mountForm(null)

    await wrapper.find('[data-testid="account-name"]').setValue('Travel Fund')
    await wrapper.find('[data-testid="account-save"]').trigger('click')
    await flushPromises()

    const saved = wrapper.emitted('save')?.[0]?.[0] as Partial<AccountRecord>
    expect(saved?.ACCOUNTNAME).toBe('Travel Fund')
  })
})

describe('currency selection round trip', () => {
  // Risk R7: choosing a currency must leave CURRENCYID holding the reference the
  // ACCOUNTLIST_V1 column stores, not the option object the selector offered.
  it('stores the chosen currency as its identifier', async () => {
    const wrapper = await mountForm(null)
    const select = wrapper
      .findAllComponents(QSelect)
      .find((c) => c.props('optionValue') === 'CURRENCYID')

    // What Quasar emits for the second option, given this selector's props.
    await select?.setValue(select.props('emitValue') ? 2 : CURRENCIES[1])
    await wrapper.find('[data-testid="account-name"]').setValue('Travel Fund')
    await flushPromises()
    await wrapper.find('[data-testid="account-save"]').trigger('click')
    await flushPromises()

    const saved = wrapper.emitted('save')?.[0]?.[0] as Partial<AccountRecord>
    expect(saved?.CURRENCYID).toBe(2)
  })
})
