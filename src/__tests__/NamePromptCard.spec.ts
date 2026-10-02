import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { Quasar } from 'quasar'
import { i18n } from '../i18n'
import NamePromptCard from '../components/taxonomy/NamePromptCard.vue'

/**
 * Spec: transaction-taxonomy, Category Creation, Renaming and Moving and Tag
 * Creation and Renaming (the shared name prompt, test ids per kind).
 */

const mountCard = (props: Partial<Record<string, unknown>> = {}) =>
  mount(NamePromptCard, {
    global: { plugins: [i18n, Quasar] },
    props: {
      prefix: 'category',
      title: 'Add Category',
      prompt: 'Enter the name for the new category:',
      initialName: '',
      errorMessage: '',
      ...props,
    },
  })

describe('name prompt card', () => {
  it('shows the title and the prompt and emits the typed name', async () => {
    const wrapper = mountCard()
    expect(wrapper.text()).toContain('Add Category')
    expect(wrapper.text()).toContain('Enter the name for the new category:')
    await wrapper.find('[data-testid="category-name"]').setValue('Chips')
    await wrapper.find('[data-testid="category-name-save"]').trigger('click')
    expect(wrapper.emitted('save')?.[0]).toEqual(['Chips'])
  })

  it('offers the current name for editing and emits cancel', async () => {
    const wrapper = mountCard({ title: 'Edit Category', initialName: 'Food' })
    expect((wrapper.find('[data-testid="category-name"]').element as HTMLInputElement).value).toBe(
      'Food',
    )
    await wrapper.find('[data-testid="category-name-cancel"]').trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  // Scenario "Colon in a name is refused": the refusal sits at the entry.
  it('shows the refusal at the entry', () => {
    const wrapper = mountCard({
      errorMessage: 'The colon (:) character is used to separate categories and subcategories',
    })
    expect(wrapper.text()).toContain('colon (:) character')
  })

  it('names its test ids after the kind', () => {
    const wrapper = mountCard({ prefix: 'tag', title: 'Add Tag' })
    expect(wrapper.find('[data-testid="tag-name"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="category-name"]').exists()).toBe(false)
  })
})
