import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { Quasar } from 'quasar'

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  messages: {
    'en-US': {
      database: {
        destroyTitle: 'Create New Database',
        destroyWarning: 'This will destroy the current database.',
        destroyDetail:
          'All existing data will be lost. This action cannot be undone.',
      },
      common: {
        cancel: 'Cancel',
        continue: 'Continue',
      },
    },
  },
})

describe('ConfirmDestroyDialog', () => {
  it('should render with modelValue true', async () => {
    const ConfirmDestroyDialog = await import(
      '../components/database/ConfirmDestroyDialog.vue'
    )

    const wrapper = mount(ConfirmDestroyDialog.default, {
      global: {
        plugins: [i18n, Quasar],
      },
      props: {
        modelValue: true,
      },
    })

    expect(wrapper.findComponent({ name: 'QDialog' }).exists()).toBe(true)
  })

  it('should emit confirm on Continue click', async () => {
    const ConfirmDestroyDialog = await import(
      '../components/database/ConfirmDestroyDialog.vue'
    )

    const wrapper = mount(ConfirmDestroyDialog.default, {
      global: {
        plugins: [i18n, Quasar],
      },
      props: {
        modelValue: true,
      },
    })

    const vm = wrapper.vm as any
    vm.onConfirm()

    expect(wrapper.emitted('confirm')).toBeTruthy()
  })

  it('should emit cancel on Cancel click', async () => {
    const ConfirmDestroyDialog = await import(
      '../components/database/ConfirmDestroyDialog.vue'
    )

    const wrapper = mount(ConfirmDestroyDialog.default, {
      global: {
        plugins: [i18n, Quasar],
      },
      props: {
        modelValue: true,
      },
    })

    const vm = wrapper.vm as any
    vm.onCancel()

    expect(wrapper.emitted('cancel')).toBeTruthy()
  })
})
