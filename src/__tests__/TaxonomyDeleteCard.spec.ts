import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { Quasar } from 'quasar'
import { i18n } from '../i18n'
import TaxonomyDeleteCard from '../components/taxonomy/TaxonomyDeleteCard.vue'

/**
 * Spec: transaction-taxonomy, Requirements "Category Deletion from the
 * Surface", "Payee Deletion from the Surface", "Tag Deletion from the Surface"
 * (design D5). The card is the dialog's content; the dialog itself is a portal
 * that renders nothing under test.
 */

const mountCard = (props: Partial<Record<string, unknown>> = {}) =>
  mount(TaxonomyDeleteCard, {
    global: { plugins: [i18n, Quasar] },
    props: {
      kind: 'category',
      title: 'Confirm Category Deletion',
      names: ['Food'],
      lines: ['The following subcategories will be deleted with it: Snacks'],
      purge: false,
      ...props,
    },
  })

describe('taxonomy delete card', () => {
  it('shows the title, the names and the consequence lines', () => {
    const wrapper = mountCard()
    expect(wrapper.text()).toContain('Confirm Category Deletion')
    expect(wrapper.find('[data-testid="taxonomy-delete-names"]').text()).toContain('Food')
    expect(wrapper.find('[data-testid="taxonomy-delete-lines"]').text()).toContain('Snacks')
    expect(wrapper.find('[data-testid="taxonomy-delete-purge"]').exists()).toBe(false)
  })

  // Scenario "Purge is disclosed": desktop's two sentences and the question.
  it('adds desktop purge sentences for the kind when purge is set', () => {
    const category = mountCard({ purge: true })
    const purge = category.find('[data-testid="taxonomy-delete-purge"]')
    expect(purge.text()).toContain('Deleted transactions exist which use this category')
    expect(purge.text()).toContain('automatically purge')
    expect(purge.text()).toContain('Do you want to continue?')

    const tag = mountCard({ kind: 'tag', purge: true, names: ['travel'], purgeName: 'travel' })
    expect(tag.find('[data-testid="taxonomy-delete-purge"]').text()).toContain(
      "Deleted transactions exist which use tag 'travel'",
    )
  })

  it('emits confirm and cancel from its two buttons', async () => {
    const wrapper = mountCard()
    await wrapper.find('[data-testid="taxonomy-delete-confirm"]').trigger('click')
    await wrapper.find('[data-testid="taxonomy-delete-cancel"]').trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })
})
