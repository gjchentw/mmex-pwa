import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { Quasar, QLayout, QPageContainer, QSelect } from 'quasar'

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
import SettingsPage from '../pages/SettingsPage.vue'
import { useSettingsStore } from '../stores/settings-store'
import { renderDateMask } from '../domain/rules/metadata'
import type { CurrencyRecord } from '../domain/records'

/** Spec: file-metadata-and-settings, the settings surface. */

const currency = (id: number, symbol: string, name: string, rate = 1): CurrencyRecord => ({
  CURRENCYID: id,
  CURRENCYNAME: name,
  PFX_SYMBOL: '',
  SFX_SYMBOL: '',
  DECIMAL_POINT: '.',
  GROUP_SEPARATOR: ',',
  UNIT_NAME: '',
  CENT_NAME: '',
  SCALE: 100,
  BASECONVRATE: rate,
  CURRENCY_SYMBOL: symbol,
  CURRENCY_TYPE: 'Fiat',
})

const makeFakeDb = () => {
  const info = new Map<string, string>([
    ['BASECURRENCYID', '1'],
    ['DATAVERSION', '3'],
  ])
  const setting = new Map<string, string>()
  // A file that was edited after creation: one seed currency gone, one added.
  const currencies: CurrencyRecord[] = [
    currency(1, 'USD', 'US dollar'),
    currency(2, 'EUR', 'Euro', 0.9),
    currency(169, 'XAU', 'Gold troy ounce', 0.0005),
  ]
  const history = [{ CURRENCYID: 2, CURRDATE: '2026-01-01' }]
  const state = { failWrites: false }
  const db: DomainDb = {
    async query<T>(sql: string, bind?: unknown[]): Promise<T[]> {
      const key = String(bind?.[0] ?? '')
      if (sql.includes('FROM INFOTABLE_V1') && sql.includes('WHERE INFONAME')) {
        const v = info.get(key)
        return (v === undefined ? [] : [{ INFOVALUE: v }]) as T[]
      }
      if (sql.includes('FROM SETTING_V1') && sql.includes('WHERE SETTINGNAME')) {
        const v = setting.get(key)
        return (v === undefined ? [] : [{ SETTINGVALUE: v }]) as T[]
      }
      if (sql.includes('FROM CURRENCYFORMATS_V1')) return currencies.map((c) => ({ ...c })) as T[]
      return [] as T[]
    },
    async mutate(statements: SqlStatement[]): Promise<void> {
      if (state.failWrites) throw new Error('disk full')
      for (const s of statements) {
        const [key, value] = (s.bind ?? []) as [string, string]
        if (s.sql.includes('INTO INFOTABLE_V1')) info.set(key, value)
        else if (s.sql.includes('INTO SETTING_V1')) setting.set(key, value)
        else if (s.sql.includes('SET BASECONVRATE = 1'))
          for (const c of currencies) c.BASECONVRATE = 1
        else if (s.sql.includes('DELETE FROM CURRENCYHISTORY_V1')) history.length = 0
      }
    },
  }
  return { db, info, setting, currencies, history, state }
}

let fake: ReturnType<typeof makeFakeDb>

const Harness = defineComponent({
  render: () => h(QLayout, { view: 'hHh lpR fFf' }, () => h(QPageContainer, () => h(SettingsPage))),
})

const mountSettings = async () => {
  const wrapper = mount(Harness, { global: { plugins: [i18n, Quasar] } })
  await flushPromises()
  return wrapper
}

/** QSelect keeps data-testid among its attrs rather than on its root element. */
const selectById = (wrapper: VueWrapper, testid: string) =>
  wrapper.findAllComponents(QSelect).find((c) => c.vm.$attrs['data-testid'] === testid)

const optionLabels = (wrapper: VueWrapper, testid: string): string[] =>
  (selectById(wrapper, testid)?.props('options') as { label: string }[]).map((o) => o.label)

/**
 * QField listens for focusin and focusout on its control, and emits blur from a
 * timer, so a save-on-blur field needs the whole sequence and a tick to settle.
 */
const leaveField = async (field: ReturnType<VueWrapper['find']>) => {
  await field.trigger('focusin')
  await field.trigger('focusout')
  await new Promise((resolve) => setTimeout(resolve, 5))
  await flushPromises()
}

/** The confirmation dialog is teleported to document.body, outside the wrapper. */
const inBody = (testid: string) => document.querySelector<HTMLElement>(`[data-testid="${testid}"]`)
const clickInBody = async (testid: string) => {
  inBody(testid)?.click()
  await flushPromises()
}

/** Picks the EUR option through the real select, which stages a base change. */
const pickEuro = async (wrapper: VueWrapper) => {
  const select = selectById(wrapper, 'settings-base-currency')!
  const euro = (select.props('options') as { id: number; label: string }[]).find((o) => o.id === 2)
  await select.setValue(euro)
  await flushPromises()
  return select
}

beforeEach(() => {
  setActivePinia(createPinia())
  fake = makeFakeDb()
  setDomainDb(fake.db)
  i18n.global.locale.value = 'en-US'
  document.body.innerHTML = ''
})

afterEach(() => {
  setDomainDb()
})

describe('SettingsPage', () => {
  // Requirement "Settings Surface": the two groups are distinguishable, and
  // file information is presented separately.
  it('presents the file facts, the preferences and the file information', async () => {
    const wrapper = await mountSettings()

    expect(wrapper.find('[data-testid="settings-file-facts"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="settings-preferences"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="settings-file-info"]').exists()).toBe(true)
  })

  // Requirement "File Information Presentation": read-only, and translated.
  it('shows the data version without any means of changing it', async () => {
    const wrapper = await mountSettings()
    const info = wrapper.find('[data-testid="settings-file-info"]')

    expect(info.text()).toContain('Data version')
    expect(info.find('[data-testid="settings-data-version"]').text()).toBe('3')
    expect(info.findAll('input')).toHaveLength(0)
  })

  // Scenario "A missing data version is shown as not set" (design D10).
  it('shows a missing data version as not set, not as a default', async () => {
    fake.info.delete('DATAVERSION')
    const wrapper = await mountSettings()

    expect(wrapper.find('[data-testid="settings-data-version"]').text()).toBe('Not set')
  })

  // Scenario "The base-currency choices are the file's currencies" (design D6).
  it('offers the file currencies, labelled by code and name', async () => {
    const wrapper = await mountSettings()

    const labels = optionLabels(wrapper, 'settings-base-currency')
    expect(labels).toContain('XAU — Gold troy ounce')
    expect(labels).toContain('EUR — Euro')
    expect(labels).toHaveLength(3)
    expect(selectById(wrapper, 'settings-base-currency')?.props('modelValue')).toEqual({
      id: 1,
      label: 'USD — US dollar',
    })
  })

  describe('date format', () => {
    // Scenario "A date format is chosen from desktop's masks" (design D3).
    it('offers desktop masks shown as today date, and writes the chosen mask', async () => {
      const wrapper = await mountSettings()
      const today = renderDateMask('%d/%m/%Y', new Date())

      const labels = optionLabels(wrapper, 'settings-date-format')
      expect(labels).toHaveLength(36)
      expect(labels).toContain(`${today}  (%d/%m/%Y)`)

      await selectById(wrapper, 'settings-date-format')?.setValue('%d/%m/%Y')
      await flushPromises()

      expect(fake.info.get('DATEFORMAT')).toBe('%d/%m/%Y')
    })

    // Scenario "A stored format outside the list is preserved".
    it('shows a stored value outside the list as stored and does not rewrite it', async () => {
      fake.info.set('DATEFORMAT', 'YYYY-MM-DD')
      const wrapper = await mountSettings()

      const select = selectById(wrapper, 'settings-date-format')!
      expect(select.props('modelValue')).toBe('YYYY-MM-DD')
      expect(optionLabels(wrapper, 'settings-date-format')[0]).toContain('YYYY-MM-DD')
      expect(fake.info.get('DATEFORMAT')).toBe('YYYY-MM-DD')
    })
  })

  describe('retention', () => {
    // Scenario "An empty retention entry is refused" (design D9).
    it.each(['', '1000'])('refuses %j, writes nothing and restores the field', async (entry) => {
      fake.setting.set('DELETED_TRANS_RETAIN_DAYS', '30')
      const wrapper = await mountSettings()
      const field = wrapper.find('[data-testid="settings-retention"]')

      await field.setValue(entry)
      await leaveField(field)

      expect(fake.setting.get('DELETED_TRANS_RETAIN_DAYS')).toBe('30')
      expect((field.element as HTMLInputElement).value).toBe('30')
      expect(wrapper.text()).toContain('Enter a whole number of days from 0 to 999')
    })

    it('writes a value within range', async () => {
      const wrapper = await mountSettings()
      const field = wrapper.find('[data-testid="settings-retention"]')

      await field.setValue('14')
      await leaveField(field)

      expect(fake.setting.get('DELETED_TRANS_RETAIN_DAYS')).toBe('14')
    })
  })

  // Scenario "A failed write is shown and the field restored" (design D7).
  it('shows a failed write on the page and restores the field', async () => {
    fake.info.set('USERNAME', 'Alice')
    const wrapper = await mountSettings()
    fake.state.failWrites = true
    const field = wrapper.find('[data-testid="settings-user-name"]')

    await field.setValue('Bob')
    await leaveField(field)

    expect(wrapper.find('[data-testid="settings-action-error"]').text()).toContain('disk full')
    expect((field.element as HTMLInputElement).value).toBe('Alice')
    expect(fake.info.get('USERNAME')).toBe('Alice')
  })

  // Requirement "Active Locale Persistence": the field shows what the shell uses.
  it('follows the shell when the language changes elsewhere', async () => {
    const wrapper = await mountSettings()

    i18n.global.locale.value = 'zh-TW'
    await flushPromises()

    expect(selectById(wrapper, 'settings-language')?.props('modelValue')).toBe('zh-TW')
    expect(optionLabels(wrapper, 'settings-language')).toEqual(['English', '繁體中文'])
  })

  // Requirement "Base Currency Change Confirmation", driven through the real
  // select and the real dialog rather than the component's methods.
  describe('base currency confirmation', () => {
    // Scenario "The consequence is stated before the change".
    it('opens the confirmation stating the reset, and writes nothing yet', async () => {
      const wrapper = await mountSettings()

      await pickEuro(wrapper)

      const dialog = inBody('base-currency-confirm')
      expect(dialog).not.toBeNull()
      expect(dialog?.textContent).toContain('reset to 1')
      expect(dialog?.textContent).toContain('historical rates deleted')
      expect(dialog?.textContent).toContain('EUR — Euro')
      expect(fake.info.get('BASECURRENCYID')).toBe('1')
      expect(fake.currencies[1]!.BASECONVRATE).toBe(0.9)
    })

    // Scenario "Confirming performs the full change".
    it('performs desktop change once confirmed', async () => {
      const wrapper = await mountSettings()
      const store = useSettingsStore()

      const select = await pickEuro(wrapper)
      await clickInBody('base-currency-confirm-accept')

      expect(fake.info.get('BASECURRENCYID')).toBe('2')
      expect(fake.currencies.every((c) => c.BASECONVRATE === 1)).toBe(true)
      expect(fake.history).toHaveLength(0)
      expect(store.baseCurrencyId).toBe(2)
      expect((select.props('modelValue') as { id: number }).id).toBe(2)
    })

    // Scenario "Declining leaves the file alone": stored value and selection.
    it('restores the selection and writes nothing when declined', async () => {
      const wrapper = await mountSettings()

      const select = await pickEuro(wrapper)
      expect((select.props('modelValue') as { id: number }).id).toBe(2)
      await clickInBody('base-currency-confirm-cancel')

      expect(fake.info.get('BASECURRENCYID')).toBe('1')
      expect(fake.currencies[1]!.BASECONVRATE).toBe(0.9)
      expect((select.props('modelValue') as { id: number }).id).toBe(1)
    })
  })
})
