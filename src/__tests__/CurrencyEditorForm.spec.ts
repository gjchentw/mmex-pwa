import { describe, it, expect, beforeEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { Quasar, QRadio, QSelect } from 'quasar'
import { i18n } from '../i18n'
import CurrencyEditorForm from '../components/currency/CurrencyEditorForm.vue'
import type { CurrencyHistoryRecord, CurrencyRecord } from '../domain/records'

/** Spec: currency-management, the definition editor (delta: desktop fidelity). */

const currency = (extra: Partial<CurrencyRecord> = {}): CurrencyRecord => ({
  CURRENCYID: 2,
  CURRENCYNAME: 'Euro',
  PFX_SYMBOL: '€',
  SFX_SYMBOL: '',
  DECIMAL_POINT: '.',
  GROUP_SEPARATOR: ',',
  UNIT_NAME: 'Euro',
  CENT_NAME: 'Cent',
  SCALE: 100,
  BASECONVRATE: 1.1,
  CURRENCY_SYMBOL: 'EUR',
  CURRENCY_TYPE: 'Fiat',
  ...extra,
})

const rate = (id: number, date: string, value: number): CurrencyHistoryRecord => ({
  CURRHISTID: id,
  CURRENCYID: 2,
  CURRDATE: date,
  CURRVALUE: value,
  CURRUPDTYPE: 2,
})

const mountEditor = (props: Partial<Record<string, unknown>> = {}) =>
  mount(CurrencyEditorForm, {
    global: { plugins: [i18n, Quasar] },
    props: {
      currency: currency(),
      isBase: false,
      history: [],
      historyActive: true,
      errorMessage: '',
      deletionBlocker: null,
      latestRate: null,
      ...props,
    },
  })

const field = (wrapper: VueWrapper, testid: string) => wrapper.find(`[data-testid="${testid}"]`)
const value = (wrapper: VueWrapper, testid: string) =>
  (field(wrapper, testid).element as HTMLInputElement).value
const previewText = (wrapper: VueWrapper) => field(wrapper, 'currency-preview').text()

/** Quasar keeps data-testid among a component's attrs rather than on its root. */
const selectById = (wrapper: VueWrapper, testid: string) =>
  wrapper.findAllComponents(QSelect).find((c) => c.vm.$attrs['data-testid'] === testid)
const radioById = (wrapper: VueWrapper, testid: string) =>
  wrapper.findAllComponents(QRadio).find((c) => c.vm.$attrs['data-testid'] === testid)

const save = async (wrapper: VueWrapper) => {
  await field(wrapper, 'currency-save').trigger('click')
  return wrapper.emitted('save')?.[0]?.[0] as Omit<CurrencyRecord, 'CURRENCYID'> | undefined
}

beforeEach(() => {
  i18n.global.locale.value = 'en-US'
})

describe('CurrencyEditorForm', () => {
  it('actually renders, so absence assertions below mean something', () => {
    const wrapper = mountEditor()
    expect(wrapper.html().length).toBeGreaterThan(500)
    expect(field(wrapper, 'currency-editor').exists()).toBe(true)
  })

  // Requirement "Editing and Adding Currency Definitions": desktop's field shape (design D3).
  describe('desktop field shape', () => {
    it('offers decimal places 0 through 9, one symbol with a placement, and fixed separator sets', () => {
      const wrapper = mountEditor()

      expect(selectById(wrapper, 'currency-decimal-places')?.props('options')).toEqual([
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
      ])
      expect(field(wrapper, 'currency-sign').exists()).toBe(true)
      expect(radioById(wrapper, 'currency-prefix')).toBeDefined()
      expect(radioById(wrapper, 'currency-suffix')).toBeDefined()
      const grouping = selectById(wrapper, 'currency-grouping')?.props('options') as {
        value: string
      }[]
      expect(grouping.map((o) => o.value)).toEqual(['', '.', ',', ' '])
      const decimal = selectById(wrapper, 'currency-decimal')?.props('options') as {
        value: string
      }[]
      expect(decimal.map((o) => o.value)).toEqual(['.', ','])
      expect(field(wrapper, 'currency-symbol').attributes('maxlength')).toBe('12')
    })

    // Scenario "A stored scale outside the powers of ten is shown and normalized".
    it('shows a stored scale of 50 as 1 decimal place and both symbols as the prefix', () => {
      const wrapper = mountEditor({ currency: currency({ SCALE: 50, SFX_SYMBOL: 'x' }) })

      expect(selectById(wrapper, 'currency-decimal-places')?.props('modelValue')).toBe(1)
      expect(value(wrapper, 'currency-sign')).toBe('€')
      expect(radioById(wrapper, 'currency-prefix')?.props('modelValue')).toBe('prefix')
    })

    it('offers a stored separator outside desktop set as the current choice', () => {
      const wrapper = mountEditor({ currency: currency({ DECIMAL_POINT: ';' }) })

      const options = selectById(wrapper, 'currency-decimal')?.props('options') as {
        value: string
        label: string
      }[]
      expect(options[0]).toEqual({ value: ';', label: '; (as stored)' })
      expect(selectById(wrapper, 'currency-decimal')?.props('modelValue')).toBe(';')
    })

    it('labels the type in the active language', () => {
      i18n.global.locale.value = 'zh-TW'
      const wrapper = mountEditor()

      const options = selectById(wrapper, 'currency-type')?.props('options') as {
        value: string
        label: string
      }[]
      expect(options.find((o) => o.value === 'Fiat')?.label).toBe('法定貨幣')
    })
  })

  // Requirement "Format Preview".
  describe('format preview', () => {
    it('renders a representative amount under the edited definition', () => {
      expect(previewText(mountEditor())).toContain('€1,234,567.89')
    })

    // Scenario "Changing the scale changes the preview".
    it('drops the decimals when the decimal places become zero', async () => {
      const wrapper = mountEditor()

      await selectById(wrapper, 'currency-decimal-places')?.setValue(0)

      expect(previewText(wrapper)).toContain('€1,234,568')
    })

    // Scenario "Moving the symbol changes the preview".
    it('moves the symbol after the digits when suffix is chosen', async () => {
      const wrapper = mountEditor()

      await radioById(wrapper, 'currency-suffix')?.trigger('click')

      expect(previewText(wrapper)).toContain('1,234,567.89€')
    })

    it('follows the separators as they are chosen', async () => {
      const wrapper = mountEditor()

      await selectById(wrapper, 'currency-grouping')?.setValue('.')
      await selectById(wrapper, 'currency-decimal')?.setValue(',')

      expect(previewText(wrapper)).toContain('€1.234.567,89')
    })
  })

  // Requirement "Editing and Adding Currency Definitions": refusals on their fields (design D10).
  describe('save-time validation', () => {
    // Scenario "An empty name or code is refused".
    it.each([
      ['currency-name', '', 'A name is required'],
      ['currency-symbol', '', 'A code is required'],
      ['currency-rate', '', 'Enter a conversion rate greater than zero'],
      ['currency-rate', '-1', 'Enter a conversion rate greater than zero'],
      ['currency-rate', '0', 'Enter a conversion rate greater than zero'],
    ])('refuses %s set to %j and names the field', async (testid, entry, message) => {
      const wrapper = mountEditor()

      await field(wrapper, testid).setValue(entry)
      const saved = await save(wrapper)

      expect(saved).toBeUndefined()
      expect(wrapper.text()).toContain(message)
    })

    // Scenario "Equal separators are refused when there are decimals".
    it('refuses equal separators while there are decimal places', async () => {
      const wrapper = mountEditor()

      await selectById(wrapper, 'currency-grouping')?.setValue('.')
      const saved = await save(wrapper)

      expect(saved).toBeUndefined()
      expect(wrapper.text()).toContain('grouping character cannot be the same')
    })

    // Scenario "A currency outside the seeded set can be added": what is emitted.
    it('emits a normalized definition: trimmed, scale from decimals, one symbol slot', async () => {
      const wrapper = mountEditor({ currency: null })

      await field(wrapper, 'currency-name').setValue('  Gold ounce ')
      await field(wrapper, 'currency-symbol').setValue('XAU')
      await field(wrapper, 'currency-sign').setValue('oz')
      await radioById(wrapper, 'currency-suffix')?.trigger('click')
      await selectById(wrapper, 'currency-decimal-places')?.setValue(4)
      await field(wrapper, 'currency-rate').setValue('1850.5')
      const saved = await save(wrapper)

      expect(saved).toMatchObject({
        CURRENCYNAME: 'Gold ounce',
        CURRENCY_SYMBOL: 'XAU',
        PFX_SYMBOL: '',
        SFX_SYMBOL: 'oz',
        SCALE: 10_000,
        BASECONVRATE: 1850.5,
        CURRENCY_TYPE: 'Fiat',
      })
      expect(saved && 'CURRENCYID' in saved).toBe(false)
    })

    // Scenario "A stored scale outside the powers of ten is shown and normalized".
    it('normalizes a stored scale of 50 to 10 on save', async () => {
      const wrapper = mountEditor({ currency: currency({ SCALE: 50 }) })

      const saved = await save(wrapper)

      expect(saved?.SCALE).toBe(10)
    })
  })

  // The base currency's rate is definitionally one.
  describe('base currency', () => {
    it('pins the rate to one and marks the field read-only', () => {
      const wrapper = mountEditor({ isBase: true, currency: currency({ BASECONVRATE: 7 }) })

      expect(value(wrapper, 'currency-rate')).toBe('1')
      expect(field(wrapper, 'currency-rate').attributes('readonly')).toBeDefined()
    })

    it('saves the base currency with a rate of one whatever was typed', async () => {
      const wrapper = mountEditor({ isBase: true })

      await field(wrapper, 'currency-rate').setValue('42')
      const saved = await save(wrapper)

      expect(saved?.BASECONVRATE).toBe(1)
    })

    it('offers no rate history for the base currency', () => {
      const wrapper = mountEditor({ isBase: true })
      expect(field(wrapper, 'rate-add').exists()).toBe(false)
      expect(field(wrapper, 'currency-history-off').exists()).toBe(false)
    })
  })

  // Requirement "Exchange Rate History Management".
  describe('rate history', () => {
    // Scenario "Recorded rates are shown as inactive while the setting is off" (design D6).
    it('hides the panel and explains why while the file setting is off', () => {
      const wrapper = mountEditor({ historyActive: false, history: [rate(1, '2026-08-09', 1.2)] })

      expect(field(wrapper, 'currency-history-panel').exists()).toBe(false)
      expect(field(wrapper, 'rate-list').exists()).toBe(false)
      expect(field(wrapper, 'currency-history-off').text()).toContain('not in use')
    })

    it('shows the panel while the setting is on', () => {
      const wrapper = mountEditor({ historyActive: true })
      expect(field(wrapper, 'currency-history-panel').exists()).toBe(true)
      expect(field(wrapper, 'currency-history-off').exists()).toBe(false)
    })

    // Scenario "The editor prefills the latest recorded rate" (design D5).
    it('prefills the fixed rate from the latest recorded rate while history is on', () => {
      const wrapper = mountEditor({ latestRate: 1.3 })
      expect(value(wrapper, 'currency-rate')).toBe('1.3')
    })

    it('keeps the fixed rate when history is off, whatever was recorded', () => {
      const wrapper = mountEditor({ latestRate: 1.3, historyActive: false })
      expect(value(wrapper, 'currency-rate')).toBe('1.1')
    })

    // Scenario "A rate is recorded and used": the entry reaches the parent.
    it('emits a rate to record with its date', async () => {
      const wrapper = mountEditor()

      await field(wrapper, 'rate-date').setValue('2026-08-09')
      await field(wrapper, 'rate-value').setValue('1.25')
      await field(wrapper, 'rate-add').trigger('click')

      expect(wrapper.emitted('add-rate')?.[0]?.[0]).toEqual({ date: '2026-08-09', value: 1.25 })
      // The entry is kept until the parent confirms the write.
      expect(value(wrapper, 'rate-value')).toBe('1.25')
    })

    // Scenario "An invalid rate entry is refused" (design D11).
    it.each(['', '-1', 'abc'])('refuses a rate entry of %j and emits nothing', async (entry) => {
      const wrapper = mountEditor()

      await field(wrapper, 'rate-date').setValue('2026-08-09')
      await field(wrapper, 'rate-value').setValue(entry)
      await field(wrapper, 'rate-add').trigger('click')

      expect(wrapper.emitted('add-rate')).toBeUndefined()
      expect(wrapper.text()).toContain('Enter a rate of zero or more')
    })

    it('accepts zero, as desktop does', async () => {
      const wrapper = mountEditor()

      await field(wrapper, 'rate-date').setValue('2026-08-09')
      await field(wrapper, 'rate-value').setValue('0')
      await field(wrapper, 'rate-add').trigger('click')

      expect(wrapper.emitted('add-rate')?.[0]?.[0]).toEqual({ date: '2026-08-09', value: 0 })
    })

    it('clears the entry once the parent hands back a fresh history', async () => {
      const wrapper = mountEditor()
      await field(wrapper, 'rate-value').setValue('1.25')

      await wrapper.setProps({ history: [rate(1, '2026-08-09', 1.25)] })

      expect(value(wrapper, 'rate-value')).toBe('')
      expect(field(wrapper, 'rate-remove').attributes('aria-label')).toBe('Remove this rate')
    })
  })

  // Requirement "Currency Deletion From the Surface" (design D1).
  describe('deletion control', () => {
    it.each([
      ['base', 'This is the base currency'],
      ['accounts', 'Accounts use this currency'],
      ['assets', 'Assets use this currency'],
    ] as const)('is disabled with the reason when blocked by %s', (blocker, reason) => {
      const wrapper = mountEditor({ deletionBlocker: blocker })

      expect(field(wrapper, 'currency-delete').attributes('disabled')).toBeDefined()
      expect(field(wrapper, 'currency-delete-reason').text()).toBe(reason)
    })

    it('is enabled, with no reason, for an unused currency', async () => {
      const wrapper = mountEditor()

      expect(field(wrapper, 'currency-delete').attributes('disabled')).toBeUndefined()
      expect(field(wrapper, 'currency-delete-reason').exists()).toBe(false)
      await field(wrapper, 'currency-delete').trigger('click')
      expect(wrapper.emitted('delete')).toHaveLength(1)
    })
  })

  it('surfaces a refusal from the capability', () => {
    const wrapper = mountEditor({ errorMessage: 'The code EUR already belongs to Euro' })
    expect(field(wrapper, 'currency-editor-error').text()).toContain('already belongs')
  })
})
