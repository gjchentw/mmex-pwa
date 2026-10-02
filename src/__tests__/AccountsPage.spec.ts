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

import { setDomainDb, type DomainDb, type SqlStatement } from '../domain/db'
import { i18n } from '../i18n'
import AccountsPage from '../pages/AccountsPage.vue'
import AccountDetailDialog from '../components/account/AccountDetailDialog.vue'
import AccountEditorDialog from '../components/account/AccountEditorDialog.vue'
import AccountEditorForm from '../components/account/AccountEditorForm.vue'
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

/** A file whose account rows take the page's writes, so a test sees what was saved. */
const fakeFile = { failWrites: false, stallLedger: false }

const makeFakeDb = (accounts: AccountRecord[]): DomainDb => {
  const rows = accounts.map((a) => ({ ...a }))
  // A real query returns fresh rows; handing out the stored objects would let a
  // write change what the page already holds behind Vue's back.
  const copies = (list: AccountRecord[]) => list.map((a) => ({ ...a }))
  return {
    async query<T>(sql: string, bind: unknown[] = []): Promise<T[]> {
      if (sql.includes('FROM ACCOUNTLIST_V1') && sql.includes('COLLATE NOCASE')) {
        const [name, exclude] = bind as [string, number]
        return copies(
          rows.filter(
            (a) => a.ACCOUNTID !== exclude && a.ACCOUNTNAME.toLowerCase() === name.toLowerCase(),
          ),
        ) as T[]
      }
      if (sql.includes('FROM ACCOUNTLIST_V1') && sql.includes('WHERE ACCOUNTID')) {
        return copies(rows.filter((a) => a.ACCOUNTID === bind[0])) as T[]
      }
      if (sql.includes('FROM ACCOUNTLIST_V1')) {
        return copies(rows).sort((a, b) => a.ACCOUNTNAME.localeCompare(b.ACCOUNTNAME)) as T[]
      }
      if (sql.includes('FROM CURRENCYFORMATS_V1')) return CURRENCIES as T[]
      // A ledger read that never finishes stands in for a slow balance.
      if (fakeFile.stallLedger && sql.includes('FROM CHECKINGACCOUNT_V1')) {
        return new Promise<T[]>(() => {})
      }
      return [] as T[]
    },
    async mutate(statements: SqlStatement[]): Promise<void> {
      if (fakeFile.failWrites) throw new Error('disk full')
      for (const s of statements) {
        const bind = s.bind ?? []
        const update = /UPDATE ACCOUNTLIST_V1 SET (.*) WHERE ACCOUNTID = \?/.exec(s.sql)
        if (update) {
          const columns = (update[1] ?? '').split(', ').map((part) => part.replace(' = ?', ''))
          const row = rows.find((a) => a.ACCOUNTID === bind[bind.length - 1])
          columns.forEach((column, index) => {
            if (row) (row as unknown as Record<string, unknown>)[column] = bind[index]
          })
        }
        if (s.sql.includes('DELETE FROM ACCOUNTLIST_V1')) {
          const index = rows.findIndex((a) => a.ACCOUNTID === bind[0])
          if (index >= 0) rows.splice(index, 1)
        }
      }
    },
  }
}

const Harness = defineComponent({
  render: () => h(QLayout, { view: 'hHh lpR fFf' }, () => h(QPageContainer, () => h(AccountsPage))),
})

const mountPage = async (accounts: AccountRecord[]) => {
  setDomainDb(makeFakeDb(accounts))
  const wrapper = mount(Harness, { global: { plugins: [i18n, Quasar] } })
  await flushPromises()
  return wrapper
}

/** Dialogs are teleported to document.body, outside the wrapper. */
const inBody = (testid: string) => document.querySelector<HTMLElement>(`[data-testid="${testid}"]`)
const bodyText = (testid: string) => inBody(testid)?.textContent ?? ''
const clickInBody = async (testid: string) => {
  inBody(testid)?.click()
  await flushPromises()
}

const openDetail = async (wrapper: ReturnType<typeof mount>, accountId: number) => {
  await wrapper.find(`[data-account-id="${accountId}"]`).trigger('click')
  await flushPromises()
}

beforeEach(() => {
  setActivePinia(createPinia())
  i18n.global.locale.value = 'en-US'
  fakeFile.failWrites = false
  fakeFile.stallLedger = false
  document.body.innerHTML = ''
})

afterEach(() => setDomainDb())

describe('AccountsPage list display', () => {
  // Requirement "Account List Display", scenario "All accounts are listed".
  it('lists every account with its name and currency code', async () => {
    const wrapper = await mountPage([
      account(1, 'Everyday Checking'),
      account(2, 'Amex Gold', { ACCOUNTTYPE: 'Credit Card', CURRENCYID: 2 }),
    ])

    const list = wrapper.find('[data-testid="account-list"]')
    expect(list.text()).toContain('Everyday Checking')
    expect(list.text()).toContain('Amex Gold')
    // The code, which CURRENCYFORMATS_V1 holds in CURRENCY_SYMBOL, not the name.
    expect(list.text()).toContain('EUR')
    expect(list.text()).not.toContain('Euro')
  })

  // Scenario "Accounts are grouped by type": desktop's tree order, whose
  // headings name each account's type.
  it('groups the accounts under their type in desktop order', async () => {
    const wrapper = await mountPage([
      account(1, 'Wallet', { ACCOUNTTYPE: 'Cash' }),
      account(2, 'Amex Gold', { ACCOUNTTYPE: 'Credit Card' }),
      account(3, 'Everyday Checking'),
    ])

    const headings = wrapper.findAll('[data-testid="account-group"]').map((g) => g.text())
    expect(headings).toEqual(['Checking', 'Credit Card', 'Cash'])
  })

  it('names the groups in the active language', async () => {
    i18n.global.locale.value = 'zh-TW'
    const wrapper = await mountPage([account(1, 'Wallet', { ACCOUNTTYPE: 'Cash' })])

    expect(wrapper.find('[data-testid="account-group"]').text()).toBe('現金')
  })

  // Requirement "Account List Display": Closed accounts are visually distinct.
  it('marks a closed account and leaves open ones unmarked', async () => {
    const wrapper = await mountPage([
      account(1, 'Everyday Checking'),
      account(2, 'Old Savings', { STATUS: 'Closed' }),
    ])

    expect(wrapper.findAll('[data-testid="account-closed-badge"]')).toHaveLength(1)
  })

  // Requirement "Favorite Account Indication": a star that is drawn and named.
  it('marks a favorite account with a labelled star', async () => {
    const wrapper = await mountPage([
      account(1, 'Everyday Checking'),
      account(2, 'Amex Gold', { FAVORITEACCT: 'TRUE' }),
    ])

    const stars = wrapper.findAll('[data-testid="account-favorite-badge"]')
    expect(stars).toHaveLength(1)
    expect(stars[0]!.classes()).toContain('mdi-star')
    expect(stars[0]!.attributes('aria-label')).toBe('Favorite')
  })

  // Requirement "Balance Display Formatting", scenario "Balance formatted with
  // currency symbols".
  it('renders each balance in the account currency', async () => {
    const wrapper = await mountPage([account(1, 'Everyday Checking', { INITIALBAL: 1234.5 })])

    const balance = wrapper.find('[data-testid="account-balance"]')
    expect(balance.text()).toContain('1,234.50')
    expect(balance.text()).toContain('$')
  })

  // Scenario "Negative balance is indicated".
  it('renders a negative balance with its sign', async () => {
    const wrapper = await mountPage([account(1, 'Amex Gold', { INITIALBAL: -80 })])

    expect(wrapper.find('[data-testid="account-balance"]').text()).toContain('-')
  })

  // Risk R2, accepted: balances can be slow, so the list must not wait for them.
  it('lists the accounts while their balances are still being computed', async () => {
    fakeFile.stallLedger = true
    const wrapper = await mountPage([account(1, 'Everyday Checking')])

    expect(wrapper.find('[data-testid="account-list"]').text()).toContain('Everyday Checking')
    expect(wrapper.find('[data-testid="account-balance"]').text()).toBe('Loading...')
  })

  it('explains an empty file rather than showing a bare list', async () => {
    const wrapper = await mountPage([])

    expect(wrapper.find('[data-testid="account-empty"]').exists()).toBe(true)
  })

  // Requirement "Account Creation": creation starts from the list.
  it('offers the add action', async () => {
    const wrapper = await mountPage([account(1, 'Everyday Checking')])

    expect(wrapper.find('[data-testid="account-add"]').exists()).toBe(true)
  })
})

describe('AccountsPage detail', () => {
  // Requirement "Account Creation" makes initial balance required, so zero is a
  // value the account holds, not an absent one.
  it('shows a zero initial balance as an amount, not as unset', async () => {
    const wrapper = await mountPage([account(1, 'Everyday Checking', { INITIALBAL: 0 })])

    await openDetail(wrapper, 1)

    expect(bodyText('account-detail-initial-balance')).toContain('$0.00')
    expect(bodyText('account-detail-initial-balance')).not.toContain('Not set')
  })

  // Requirement "Account Editing" lists every field desktop edits; the detail
  // shows them all, and Requirement "Account Planning Fields" holds for any type.
  it('shows every editable field, the planning fields included, for a Cash account', async () => {
    const wrapper = await mountPage([
      account(1, 'Wallet', {
        ACCOUNTTYPE: 'Cash',
        CREDITLIMIT: 5000,
        HELDAT: 'First Bank',
        WEBSITE: 'https://bank.example',
        CONTACTINFO: 'Branch manager',
        ACCESSINFO: 'user: me',
        ACCOUNTNUM: '123-456',
        NOTES: 'Joint account',
      }),
    ])

    await openDetail(wrapper, 1)

    expect(bodyText('account-detail-credit-limit')).toContain('$5,000.00')
    expect(bodyText('account-detail-minimum-balance')).toContain('Not set')
    expect(bodyText('account-detail-held-at')).toContain('First Bank')
    expect(bodyText('account-detail-website')).toContain('https://bank.example')
    expect(bodyText('account-detail-contact-info')).toContain('Branch manager')
    expect(bodyText('account-detail-access-info')).toContain('user: me')
    expect(bodyText('account-detail-account-number')).toContain('123-456')
    expect(bodyText('account-detail-notes')).toContain('Joint account')
    expect(bodyText('account-detail-type')).toContain('Cash')
  })

  // Requirement "Account Editing", "returned to the account detail with changes
  // visible": the detail shows the saved values without being reopened.
  it('shows an edit in the detail that stayed open', async () => {
    const wrapper = await mountPage([account(1, 'Old Name', { INITIALBAL: 10 })])
    await openDetail(wrapper, 1)

    await clickInBody('account-detail-edit')
    const form = wrapper.findComponent(AccountEditorForm)
    await form.find('[data-testid="account-name"]').setValue('New Name')
    await form.find('[data-testid="account-initial-balance"]').setValue('500')
    await form.find('[data-testid="account-save"]').trigger('click')
    await flushPromises()

    expect(bodyText('account-detail-name')).toBe('New Name')
    expect(bodyText('account-detail-balance')).toContain('$500.00')
  })

  // Requirement "Favorite Account Indication": the toggle shows its new state at
  // once, so a second click is not needed to see it took.
  it('shows a favorite toggle in the detail at once', async () => {
    const wrapper = await mountPage([account(1, 'Everyday Checking')])
    await openDetail(wrapper, 1)

    await clickInBody('account-detail-favorite')

    expect(inBody('account-detail-favorite')?.getAttribute('aria-pressed')).toBe('true')
  })

  // Requirement "Account Deletion from Surface": back to the list.
  it('closes the detail once its account is deleted', async () => {
    const wrapper = await mountPage([account(1, 'Doomed'), account(2, 'Keeper')])
    await openDetail(wrapper, 1)

    await clickInBody('account-detail-delete')
    await clickInBody('account-delete-confirm')

    expect(wrapper.findComponent(AccountDetailDialog).props('modelValue')).toBe(false)
    expect(wrapper.find('[data-testid="account-list"]').text()).not.toContain('Doomed')
  })

  // An editor left open on a deleted account would "save" an UPDATE that
  // matches no row.
  it('closes the editor once the account it edits is deleted', async () => {
    const wrapper = await mountPage([account(1, 'Doomed')])
    await openDetail(wrapper, 1)
    await clickInBody('account-detail-edit')

    await wrapper
      .findComponent(AccountEditorForm)
      .find('[data-testid="account-delete"]')
      .trigger('click')
    await flushPromises()
    await clickInBody('account-delete-confirm')

    expect(wrapper.findComponent(AccountEditorDialog).props('modelValue')).toBe(false)
    expect(wrapper.findComponent(AccountDetailDialog).props('modelValue')).toBe(false)
  })

  // A failed action outside the editor is shown, not swallowed.
  it('shows a failed favorite toggle on the page', async () => {
    const wrapper = await mountPage([account(1, 'Everyday Checking')])
    await openDetail(wrapper, 1)
    fakeFile.failWrites = true

    await clickInBody('account-detail-favorite')

    expect(wrapper.find('[data-testid="account-action-error"]').text()).toContain('disk full')
  })

  it('shows a failed deletion on the page', async () => {
    const wrapper = await mountPage([account(1, 'Everyday Checking')])
    await openDetail(wrapper, 1)
    fakeFile.failWrites = true

    await clickInBody('account-detail-delete')
    await clickInBody('account-delete-confirm')

    expect(wrapper.find('[data-testid="account-action-error"]').text()).toContain('disk full')
  })
})
