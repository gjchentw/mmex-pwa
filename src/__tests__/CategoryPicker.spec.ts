import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { Quasar, QSelect } from 'quasar'
import { i18n } from '../i18n'
import CategoryPicker from '../components/taxonomy/CategoryPicker.vue'
import type { CategoryRecord } from '../domain/records'

/**
 * Spec: transaction-taxonomy, "Visibility via Active Flags" (hidden not offered
 * for a new value, an edited record keeps its current one), "Category
 * Creation, Renaming and Moving" (a cyclic move is not offered); design D12.
 */

const category = (
  id: number,
  name: string,
  parentId = -1,
  active: number | null = 1,
): CategoryRecord => ({ CATEGID: id, CATEGNAME: name, PARENTID: parentId, ACTIVE: active })

const categories = [
  category(1, 'Food'),
  category(2, 'Snacks', 1),
  category(3, 'Drinks', 1, 0),
  category(4, 'Travel', -1, 0),
  category(5, 'Bills'),
]

const mountPicker = (props: Partial<Record<string, unknown>> = {}) =>
  mount(CategoryPicker, {
    global: { plugins: [i18n, Quasar] },
    props: { modelValue: null, categories, delimiter: ':', ...props },
  })

const options = (wrapper: ReturnType<typeof mountPicker>) =>
  (wrapper.findComponent(QSelect).props('options') as Array<{ label: string; value: number }>).map(
    (o) => o.label,
  )

describe('category picker', () => {
  it('offers visible categories by full name and leaves hidden ones out', () => {
    expect(options(mountPicker())).toEqual(['Bills', 'Food', 'Food:Snacks'])
  })

  it('keeps a hidden current value selectable', () => {
    expect(options(mountPicker({ modelValue: 4 }))).toContain('Travel')
  })

  it('joins with the file delimiter', () => {
    expect(options(mountPicker({ delimiter: ' / ' }))).toContain('Food / Snacks')
  })

  // Scenario "A cyclic move is not offered".
  it('excludes a category and its subtree when asked', () => {
    const labels = options(mountPicker({ excludeSubtreeOf: 1 }))
    expect(labels).not.toContain('Food')
    expect(labels).not.toContain('Food:Snacks')
    expect(labels).toContain('Bills')
  })

  // Scenario "Move to the top level".
  it('offers the top level when allowed, as the -1 sentinel', () => {
    const wrapper = mountPicker({ allowTopLevel: true })
    const all = wrapper.findComponent(QSelect).props('options') as Array<{
      label: string
      value: number
    }>
    expect(all[0]).toEqual({ label: 'Top level', value: -1 })
  })

  it('emits the chosen id', async () => {
    const wrapper = mountPicker()
    await wrapper.findComponent(QSelect).vm.$emit('update:modelValue', { label: 'Bills', value: 5 })
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([5])
  })
})
