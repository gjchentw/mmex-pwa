import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
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
import { formatIsoDate } from '../domain/conventions'
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

/** What the fake file holds for the checks the form makes before saving. */
const fileState = {
  /** An account that already holds whatever name is asked about. */
  nameTaken: false,
  /** Which opening-date query finds a record dated too early. */
  earlyRecordIn: null as null | 'CHECKINGACCOUNT_V1' | 'STOCK_V1' | 'BILLSDEPOSITS_V1',
}

const fakeDb: DomainDb = {
  async query<T>(sql: string): Promise<T[]> {
    if (sql.includes('COLLATE NOCASE')) {
      return (fileState.nameTaken ? [account('Checking', { ACCOUNTID: 9 })] : []) as T[]
    }
    if (fileState.earlyRecordIn && sql.includes(`FROM ${fileState.earlyRecordIn} WHERE`)) {
      return [{ 1: 1 }] as T[]
    }
    return [] as T[]
  },
  async mutate(): Promise<void> {},
}

const mountForm = async (accountProp: AccountRecord | null, baseCurrencyId: number | null = 1) => {
  const wrapper = mount(AccountEditorForm, {
    props: { account: accountProp, currencies: CURRENCIES, errorMessage: '', baseCurrencyId },
    global: { plugins: [i18n, Quasar] },
  })
  await flushPromises()
  return wrapper
}

const field = (wrapper: VueWrapper, testid: string) => wrapper.find(`[data-testid="${testid}"]`)

/** QSelect keeps data-testid among its attrs rather than on its root element. */
const selectById = (wrapper: VueWrapper, testid: string) =>
  wrapper.findAllComponents(QSelect).find((c) => c.vm.$attrs['data-testid'] === testid)

const save = async (wrapper: VueWrapper) => {
  await field(wrapper, 'account-save').trigger('click')
  await flushPromises()
  return wrapper.emitted('save')?.[0]?.[0] as Partial<AccountRecord> | undefined
}

const PLANNING_FIELDS = [
  'account-credit-limit',
  'account-minimum-balance',
  'account-interest-rate',
  'account-minimum-payment',
  'account-payment-due',
]

const OTHER_INFO = {
  ACCOUNTNUM: 'account-account-number',
  HELDAT: 'account-held-at',
  WEBSITE: 'account-website',
  CONTACTINFO: 'account-contact-info',
  ACCESSINFO: 'account-access-info',
  NOTES: 'account-notes',
} as const

beforeEach(() => {
  setActivePinia(createPinia())
  setDomainDb(fakeDb)
  fileState.nameTaken = false
  fileState.earlyRecordIn = null
  i18n.global.locale.value = 'en-US'
  // Dialogs teleport to the body and would otherwise leak between tests.
  document.body.innerHTML = ''
})

afterEach(() => setDomainDb())

describe('planning fields', () => {
  // Requirement "Account Planning Fields": offered for every type, as desktop
  // does, because the scheduled-transaction guard reads them on any account.
  it.each([...ACCOUNT_TYPES])('offers the credit and loan fields for %s', async (type) => {
    const wrapper = await mountForm(account(type))

    for (const testid of PLANNING_FIELDS) {
      expect(field(wrapper, testid).exists()).toBe(true)
    }
  })
})

describe('other information', () => {
  // Requirement "Account Editing": the six free-text columns desktop edits.
  it('pre-populates and saves every other-information field', async () => {
    const wrapper = await mountForm(
      account('Checking', {
        ACCOUNTNUM: '123-456',
        HELDAT: 'First Bank',
        WEBSITE: 'https://bank.example',
        CONTACTINFO: 'Branch manager',
        ACCESSINFO: 'user: me',
        NOTES: 'Joint account',
      }),
    )

    for (const testid of Object.values(OTHER_INFO)) {
      expect(field(wrapper, testid).exists()).toBe(true)
    }
    await field(wrapper, OTHER_INFO.HELDAT).setValue('Second Bank')
    const saved = await save(wrapper)

    expect(saved?.HELDAT).toBe('Second Bank')
    expect(saved?.ACCOUNTNUM).toBe('123-456')
    expect(saved?.ACCESSINFO).toBe('user: me')
  })
})

describe('account types', () => {
  const typeValues = (wrapper: VueWrapper) =>
    (selectById(wrapper, 'account-type')?.props('options') as { value: string }[]).map(
      (o) => o.value,
    )

  // Requirement "Account Creation": the eight upstream strings, exactly.
  it('offers every upstream type for a new account', async () => {
    const wrapper = await mountForm(null)

    expect(typeValues(wrapper)).toEqual([...ACCOUNT_TYPES])
  })

  // Requirement "Account Type Change": no account may become Investment.
  it('withholds Investment as a new type for an existing account', async () => {
    const wrapper = await mountForm(account('Checking'))

    expect(typeValues(wrapper)).not.toContain('Investment')
    expect(typeValues(wrapper)).toHaveLength(7)
  })

  it('keeps an Investment account able to stay Investment', async () => {
    const wrapper = await mountForm(account('Investment'))

    expect(typeValues(wrapper)).toEqual([...ACCOUNT_TYPES])
  })

  // Same requirement: a Shares account keeps its type.
  it('offers a Shares account no other type', async () => {
    const wrapper = await mountForm(account('Shares'))

    expect(typeValues(wrapper)).toEqual(['Shares'])
    expect(selectById(wrapper, 'account-type')?.props('readonly')).toBe(true)
  })

  // Scenario "Type change takes effect without a warning".
  it('changes the type with no confirmation step', async () => {
    const wrapper = await mountForm(account('Checking'))

    await selectById(wrapper, 'account-type')?.setValue('Credit Card')
    const saved = await save(wrapper)

    expect(document.querySelector('[data-testid="account-type-change-confirm"]')).toBeNull()
    expect(saved?.ACCOUNTTYPE).toBe('Credit Card')
  })

  // The stored value stays the upstream string; only the label is translated.
  it('labels the types in the active language', async () => {
    i18n.global.locale.value = 'zh-TW'
    const wrapper = await mountForm(null)
    const options = selectById(wrapper, 'account-type')?.props('options') as {
      value: string
      label: string
    }[]

    expect(options.find((o) => o.value === 'Cash')?.label).toBe('現金')
  })
})

describe('new account defaults', () => {
  // Requirement "Account Creation", scenario "New account starts with desktop's
  // defaults" (mmAddAccountWizard).
  it('starts as a favorite in the base currency, opened today with a zero balance', async () => {
    const wrapper = await mountForm(null, 2)

    await field(wrapper, 'account-name').setValue('Travel Fund')
    const saved = await save(wrapper)

    expect(saved?.FAVORITEACCT).toBe('TRUE')
    expect(saved?.CURRENCYID).toBe(2)
    expect(saved?.INITIALBAL).toBe(0)
    expect(saved?.INITIALDATE).toBe(formatIsoDate(new Date()))
    expect(saved?.STATEMENTLOCKED).toBe(0)
    // The key is left for SQLite to assign.
    expect(saved && 'ACCOUNTID' in saved).toBe(false)
  })

  // The editor can open before the page has read the file's currencies; the
  // default is applied once they arrive rather than lost.
  it('applies the base currency when it arrives after the editor opened', async () => {
    const wrapper = mount(AccountEditorForm, {
      props: { account: null, currencies: [], errorMessage: '', baseCurrencyId: null },
      global: { plugins: [i18n, Quasar] },
    })
    await flushPromises()

    await wrapper.setProps({ currencies: CURRENCIES, baseCurrencyId: 2 })
    await field(wrapper, 'account-name').setValue('Travel Fund')
    const saved = await save(wrapper)

    expect(saved?.CURRENCYID).toBe(2)
  })

  // With no usable base currency nothing is preselected, as desktop's
  // "Select Currency" button shows.
  it('preselects no currency when the base currency is unknown', async () => {
    const wrapper = await mountForm(null, -1)

    await field(wrapper, 'account-name').setValue('Travel Fund')
    const saved = await save(wrapper)

    expect(saved).toBeUndefined()
    expect(wrapper.text()).toContain('Currency is required')
  })
})

describe('currency binding', () => {
  // Risk R7: the selector offers only currencies the file defines.
  it('populates the selector from the currencies the file holds', async () => {
    const wrapper = await mountForm(null)

    expect(selectById(wrapper, 'account-currency')?.props('options')).toEqual(CURRENCIES)
  })

  // Risk R7: choosing a currency leaves CURRENCYID holding the reference the
  // column stores, not the option object the selector offered.
  it('stores the chosen currency as its identifier', async () => {
    const wrapper = await mountForm(null)

    await selectById(wrapper, 'account-currency')?.setValue(2)
    await field(wrapper, 'account-name').setValue('Travel Fund')
    const saved = await save(wrapper)

    expect(saved?.CURRENCYID).toBe(2)
  })

  // Risk R7: a reference to a currency the file lacks is refused, not saved.
  it('refuses a currency the file does not define', async () => {
    const wrapper = await mountForm(account('Checking', { CURRENCYID: 99 }))

    const saved = await save(wrapper)

    expect(saved).toBeUndefined()
    expect(wrapper.text()).toContain('Select a currency this file defines')
  })
})

describe('editing an existing account', () => {
  // Requirement "Account Editing".
  it('pre-populates every persisted field', async () => {
    const wrapper = await mountForm(
      account('Credit Card', { ACCOUNTNAME: 'Amex Gold', CREDITLIMIT: 5000, CURRENCYID: 2 }),
    )

    expect((field(wrapper, 'account-name').element as HTMLInputElement).value).toBe('Amex Gold')
    expect((field(wrapper, 'account-credit-limit').element as HTMLInputElement).value).toBe('5000')
    expect(field(wrapper, 'account-editor-existing').exists()).toBe(true)
  })

  it('marks a new account as new', async () => {
    const wrapper = await mountForm(null)

    expect(field(wrapper, 'account-editor-existing').exists()).toBe(false)
    // Deleting is offered only for an account that exists.
    expect(field(wrapper, 'account-delete').exists()).toBe(false)
  })
})

describe('required fields', () => {
  // Requirement "Account Creation", scenario "Missing required field prevents
  // creation": refused, and the message names the field.
  it('names the missing account name', async () => {
    const wrapper = await mountForm(null)

    const saved = await save(wrapper)

    expect(saved).toBeUndefined()
    expect(wrapper.text()).toContain('Account name is required')
  })

  it('names a missing initial balance', async () => {
    const wrapper = await mountForm(null)

    await field(wrapper, 'account-name').setValue('Travel Fund')
    await field(wrapper, 'account-initial-balance').setValue('')
    const saved = await save(wrapper)

    expect(saved).toBeUndefined()
    expect(wrapper.text()).toContain('Initial balance is required')
  })

  it('names a missing initial date', async () => {
    const wrapper = await mountForm(null)

    await field(wrapper, 'account-name').setValue('Travel Fund')
    await field(wrapper, 'account-initial-date').setValue('')
    const saved = await save(wrapper)

    expect(saved).toBeUndefined()
    expect(wrapper.text()).toContain('Initial date is required')
  })

  // Zero is a real opening balance; testing falsiness would reject it.
  it('accepts zero as an initial balance', async () => {
    const wrapper = await mountForm(null)

    await field(wrapper, 'account-name').setValue('Travel Fund')
    await field(wrapper, 'account-initial-balance').setValue('0')
    const saved = await save(wrapper)

    expect(saved?.INITIALBAL).toBe(0)
  })
})

describe('account name', () => {
  // Desktop trims the name before saving (mmNewAcctDialog::OnOk), so "Foo " and
  // "Foo" cannot both exist.
  it('saves the name without surrounding spaces', async () => {
    const wrapper = await mountForm(null)

    await field(wrapper, 'account-name').setValue('  Travel Fund  ')
    const saved = await save(wrapper)

    expect(saved?.ACCOUNTNAME).toBe('Travel Fund')
  })

  // Scenario "Duplicate account name is rejected", checked at save time so a
  // click that beats the blur cannot slip a duplicate through. Risk R1.
  it('refuses a name another account holds', async () => {
    fileState.nameTaken = true
    const wrapper = await mountForm(null)

    await field(wrapper, 'account-name').setValue('amex gold')
    const saved = await save(wrapper)

    expect(saved).toBeUndefined()
    expect(wrapper.text()).toContain('Another account already has this name')
  })
})

describe('opening date', () => {
  // Requirement "Opening Date Rule": never in the future.
  it('refuses an opening date in the future', async () => {
    const wrapper = await mountForm(null)

    await field(wrapper, 'account-name').setValue('Travel Fund')
    await field(wrapper, 'account-initial-date').setValue('2999-01-01')
    const saved = await save(wrapper)

    expect(saved).toBeUndefined()
    expect(wrapper.text()).toContain('Opening date cannot be in the future')
  })

  // Same requirement: not after the account's earliest dependent record.
  it.each([
    ['CHECKINGACCOUNT_V1', 'Transactions for this account already exist before this date'],
    ['STOCK_V1', 'Stock purchases for this account already exist before this date'],
    ['BILLSDEPOSITS_V1', 'Scheduled transactions for this account are scheduled before this date'],
  ] as const)('refuses a date after a record in %s', async (table, message) => {
    fileState.earlyRecordIn = table
    const wrapper = await mountForm(account('Checking'))

    await field(wrapper, 'account-initial-date').setValue('2026-03-01')
    const saved = await save(wrapper)

    expect(saved).toBeUndefined()
    expect(wrapper.text()).toContain(message)
  })
})

describe('optional values', () => {
  // A number cleared from the keyboard arrives as '', which a NUMERIC column
  // must not store.
  it('writes a cleared credit limit as empty, not as text', async () => {
    const wrapper = await mountForm(account('Credit Card', { CREDITLIMIT: 5000 }))

    await field(wrapper, 'account-credit-limit').setValue('')
    const saved = await save(wrapper)

    expect(saved?.CREDITLIMIT).toBeNull()
  })
})

describe('statement lock', () => {
  const lockToggle = (wrapper: VueWrapper) => field(wrapper, 'account-statement-lock-toggle')

  // Requirement "Statement Lock Management": setting a lock requires a date.
  it('refuses to save a lock without a statement date', async () => {
    const wrapper = await mountForm(account('Checking'))

    await lockToggle(wrapper).trigger('click')
    const saved = await save(wrapper)

    expect(saved).toBeUndefined()
    expect(wrapper.text()).toContain('Statement date is required')
  })

  // Scenario "User sets statement lock".
  it('saves a lock once its date is given', async () => {
    const wrapper = await mountForm(account('Checking'))

    await lockToggle(wrapper).trigger('click')
    await field(wrapper, 'account-statement-date').setValue('2026-07-31')
    const saved = await save(wrapper)

    expect(saved?.STATEMENTLOCKED).toBe(1)
    expect(saved?.STATEMENTDATE).toBe('2026-07-31')
  })

  // Scenario "User clears statement lock": desktop writes 0 and keeps the date.
  it('writes 0 and keeps the date when the lock is cleared', async () => {
    const wrapper = await mountForm(
      account('Checking', { STATEMENTLOCKED: 1, STATEMENTDATE: '2026-07-31' }),
    )

    await lockToggle(wrapper).trigger('click')
    const saved = await save(wrapper)

    expect(saved?.STATEMENTLOCKED).toBe(0)
    expect(saved?.STATEMENTDATE).toBe('2026-07-31')
  })
})
