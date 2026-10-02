import { describe, it, expect } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { Quasar } from 'quasar'
import { i18n } from '../i18n'
import PayeeEditorForm from '../components/payee/PayeeEditorForm.vue'
import type { CategoryRecord, PayeeRecord } from '../domain/records'

/**
 * Spec: transaction-taxonomy, Requirement "Payee Editing" (desktop's fields,
 * refusals at their field, PATTERN untouched unless the lines changed);
 * design D11.
 */

const payee = (extra: Partial<PayeeRecord> = {}): PayeeRecord => ({
  PAYEEID: 1,
  PAYEENAME: 'Shop',
  CATEGID: 7,
  NUMBER: 'ACC-1',
  WEBSITE: null,
  NOTES: null,
  ACTIVE: 1,
  PATTERN: '{\n    "0": "AMAZON*"\n}',
  ...extra,
})

const categories: CategoryRecord[] = [
  { CATEGID: 7, CATEGNAME: 'Food', PARENTID: -1, ACTIVE: 1 },
  { CATEGID: 8, CATEGNAME: 'Old', PARENTID: -1, ACTIVE: 0 },
]

const mountForm = (props: Partial<Record<string, unknown>> = {}) =>
  mount(PayeeEditorForm, {
    global: { plugins: [i18n, Quasar] },
    props: {
      payee: payee(),
      categories,
      delimiter: ':',
      mode: 'lastUsed',
      errorMessage: '',
      ...props,
    },
  })

const setField = async (wrapper: VueWrapper, testid: string, value: string) =>
  wrapper.find(`[data-testid="${testid}"]`).setValue(value)
const save = async (wrapper: VueWrapper) =>
  wrapper.find('[data-testid="payee-save"]').trigger('click')

describe('payee editor form', () => {
  it('shows desktop fields and titles the category by the mode', () => {
    const wrapper = mountForm()
    expect(wrapper.text()).toContain('Edit Payee')
    expect(wrapper.text()).toContain('Last Used Category')
    expect(wrapper.text()).toContain('Reference')
    expect(wrapper.text()).toContain('Match Patterns on Import')
    expect(
      (wrapper.find('[data-testid="payee-patterns"]').element as HTMLTextAreaElement).value,
    ).toBe('AMAZON*')
    expect(mountForm({ mode: 'default' }).text()).toContain('Default Category')
    expect(mountForm({ payee: null }).text()).toContain('New Payee')
  })

  // Scenario "An invalid website is reported at its field".
  it('refuses an invalid website at its field and emits nothing', async () => {
    const wrapper = mountForm()
    await setField(wrapper, 'payee-website', 'not a url')
    await save(wrapper)
    expect(wrapper.text()).toContain('Please enter a valid URL')
    expect(wrapper.emitted('save')).toBeUndefined()
  })

  it('refuses an empty name and an invalid pattern line, naming the line', async () => {
    const wrapper = mountForm()
    await setField(wrapper, 'payee-name', '  ')
    await save(wrapper)
    expect(wrapper.text()).toContain('A payee name is required')

    await setField(wrapper, 'payee-name', 'Shop')
    await setField(wrapper, 'payee-patterns', 'AMAZON*\nregex:(')
    await save(wrapper)
    expect(wrapper.text()).toContain('Line 2')
    expect(wrapper.emitted('save')).toBeUndefined()
  })

  // Scenario "Patterns survive editing other fields": no `patterns` in a name-only edit.
  it('leaves patterns out of the draft when only other fields changed', async () => {
    const wrapper = mountForm()
    await setField(wrapper, 'payee-name', 'Shop 2')
    await save(wrapper)
    const [draft] = wrapper.emitted('save')![0] as [Record<string, unknown>]
    expect(draft.PAYEENAME).toBe('Shop 2')
    expect(draft).not.toHaveProperty('patterns')
  })

  // Scenario "Patterns are edited as lines".
  it('emits the pattern lines in order when they were edited', async () => {
    const wrapper = mountForm()
    await setField(wrapper, 'payee-patterns', 'AMAZON*\nregex:^AMZN')
    await save(wrapper)
    const [draft] = wrapper.emitted('save')![0] as [Record<string, unknown>]
    expect(draft.patterns).toEqual(['AMAZON*', 'regex:^AMZN'])
  })

  it('emits a full draft for a new payee, with the sentinel default', async () => {
    const wrapper = mountForm({ payee: null })
    await setField(wrapper, 'payee-name', 'Baker')
    await save(wrapper)
    const [draft] = wrapper.emitted('save')![0] as [Record<string, unknown>]
    expect(draft).toMatchObject({ PAYEENAME: 'Baker', CATEGID: null, hidden: false, patterns: [] })
  })

  it('shows a repository refusal under the form', () => {
    const wrapper = mountForm({ errorMessage: 'A payee with this name already exists' })
    expect(wrapper.find('[data-testid="payee-editor-error"]').text()).toContain('already exists')
  })
})
