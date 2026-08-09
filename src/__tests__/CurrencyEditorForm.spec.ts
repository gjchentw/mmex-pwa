import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { Quasar } from 'quasar'
import { i18n } from '../i18n'
import CurrencyEditorForm from '../components/currency/CurrencyEditorForm.vue'
import type { CurrencyRecord } from '../domain/records'

/** Spec: currency-management, the definition editor. */

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

const mountEditor = (props: Partial<Record<string, unknown>> = {}) =>
  mount(CurrencyEditorForm, {
    global: { plugins: [i18n, Quasar] },
    props: {
      currency: currency(),
      isBase: false,
      history: [],
      historyActive: true,
      errorMessage: '',
      ...props,
    },
  })

type EditorVm = {
  draft: Omit<CurrencyRecord, 'CURRENCYID'>
  preview: string
  onSave: () => void
  addRate: () => void
  rateDate: string
  rateValue: number | null
}

describe('CurrencyEditorForm', () => {
  // Guard against vacuous passes: an absence assertion against an empty wrapper
  // succeeds for the wrong reason, which is how the dialog-based version of
  // these tests hid the fact that it rendered nothing at all.
  it('actually renders, so absence assertions below mean something', () => {
    const wrapper = mountEditor()
    expect(wrapper.html().length).toBeGreaterThan(500)
    expect(wrapper.find('[data-testid="currency-editor"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="currency-preview"]').exists()).toBe(true)
  })

  // Requirement "Format Preview".
  describe('format preview', () => {
    it('renders a representative amount under the edited definition', () => {
      const vm = mountEditor().vm as unknown as EditorVm
      expect(vm.preview).toBe('€1,234,567.89')
    })

    // Scenario "Changing the scale changes the preview" -- precision follows
    // the scale, so a scale of one renders no decimals.
    it('drops the decimals when the scale becomes one', async () => {
      const wrapper = mountEditor()
      const vm = wrapper.vm as unknown as EditorVm

      vm.draft.SCALE = 1
      await wrapper.vm.$nextTick()

      expect(vm.preview).toBe('€1,234,568')
    })

    it('follows the separators as they are edited', async () => {
      const wrapper = mountEditor()
      const vm = wrapper.vm as unknown as EditorVm

      vm.draft.GROUP_SEPARATOR = '.'
      vm.draft.DECIMAL_POINT = ','
      await wrapper.vm.$nextTick()

      expect(vm.preview).toBe('€1.234.567,89')
    })
  })

  // Requirement "Editing and Adding Currency Definitions" -- the base currency's
  // rate is definitionally one.
  describe('base currency', () => {
    it('pins the rate to one and marks the field read-only', async () => {
      const wrapper = mountEditor({ isBase: true, currency: currency({ BASECONVRATE: 7 }) })
      const vm = wrapper.vm as unknown as EditorVm
      await wrapper.vm.$nextTick()

      expect(vm.draft.BASECONVRATE).toBe(1)
      const rateInput = wrapper.find('[data-testid="currency-rate"]')
      expect(rateInput.attributes('readonly')).toBeDefined()
    })

    it('saves the base currency with a rate of one whatever was typed', () => {
      const wrapper = mountEditor({ isBase: true })
      const vm = wrapper.vm as unknown as EditorVm

      vm.draft.BASECONVRATE = 42
      vm.onSave()

      const saved = wrapper.emitted('save')?.[0]?.[0] as CurrencyRecord
      expect(saved.BASECONVRATE).toBe(1)
    })

    // Requirement "Exchange Rate History Management" -- the base currency has
    // no history, because its rate is always one.
    it('offers no rate history for the base currency', () => {
      const wrapper = mountEditor({ isBase: true })
      expect(wrapper.find('[data-testid="rate-add"]').exists()).toBe(false)
    })
  })

  // Scenario "Recorded rates are shown as inactive while the setting is off".
  describe('history activity notice', () => {
    it('marks recorded rates inactive when the file setting is off', () => {
      const wrapper = mountEditor({ historyActive: false })
      expect(wrapper.find('[data-testid="currency-history-inactive"]').exists()).toBe(true)
    })

    it('shows no such notice while the setting is on', () => {
      const wrapper = mountEditor({ historyActive: true })
      expect(wrapper.find('[data-testid="currency-history-inactive"]').exists()).toBe(false)
    })
  })

  it('emits a rate to record with its date', () => {
    const wrapper = mountEditor()
    const vm = wrapper.vm as unknown as EditorVm

    vm.rateDate = '2026-08-09'
    vm.rateValue = 1.25
    vm.addRate()

    expect(wrapper.emitted('add-rate')?.[0]?.[0]).toEqual({ date: '2026-08-09', value: 1.25 })
  })

  it('surfaces a refusal from the capability', () => {
    const wrapper = mountEditor({ errorMessage: 'A currency named "Euro" already exists' })
    expect(wrapper.find('[data-testid="currency-editor-error"]').text()).toContain('already exists')
  })
})
