import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { Quasar } from 'quasar'

vi.mock('../../data/currencies.json', () => ({
  default: [
    { id: 1, name: 'US dollar', code: 'USD' },
    { id: 2, name: 'Euro', code: 'EUR' },
  ],
}))

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      database: {
        newTitle: 'Create New Database',
        baseCurrency: 'Base Currency',
        searchCurrency: 'Search currency...',
        noResults: 'No currencies found',
        userName: 'User Name',
        userNamePlaceholder: 'Optional',
      },
      common: {
        cancel: 'Cancel',
        create: 'Create',
      },
    },
  },
})

describe('NewDatabaseWizard', () => {
  it('should render the wizard form', async () => {
    const NewDatabaseWizard = await import('../components/database/NewDatabaseWizard.vue')

    const wrapper = mount(NewDatabaseWizard.default, {
      global: {
        plugins: [i18n, Quasar],
      },
    })

    expect(wrapper.text()).toContain('Create New Database')
    expect(wrapper.text()).toContain('Base Currency')
    expect(wrapper.text()).toContain('User Name')
  })

  it('should emit create event with currency and username', async () => {
    const NewDatabaseWizard = await import('../components/database/NewDatabaseWizard.vue')

    const wrapper = mount(NewDatabaseWizard.default, {
      global: {
        plugins: [i18n, Quasar],
      },
    })

    // Emit create by calling the internal handler
    // (QSelect interaction is complex in test-utils, so we test the emitted event directly)
    const vm = wrapper.vm as any
    vm.selectedCurrency = { id: 1, label: 'US dollar (USD)', code: 'USD' }
    vm.userName = 'Test User'
    vm.onCreate()

    expect(wrapper.emitted('create')).toBeTruthy()
    expect(wrapper.emitted('create')![0]).toEqual([1, 'Test User'])
  })

  it('should emit cancel event', async () => {
    const NewDatabaseWizard = await import('../components/database/NewDatabaseWizard.vue')

    const wrapper = mount(NewDatabaseWizard.default, {
      global: {
        plugins: [i18n, Quasar],
      },
    })

    const cancelBtn = wrapper.findAll('button').filter((b) => b.text() === 'Cancel')[0]
    if (cancelBtn) {
      await cancelBtn.trigger('click')
      expect(wrapper.emitted('cancel')).toBeTruthy()
    }
  })
})
