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
import SettingsPage from '../pages/SettingsPage.vue'
import { useSettingsStore } from '../stores/settings-store'

/** Spec: file-metadata-and-settings, the settings surface. */

const makeFakeDb = () => {
  const info = new Map<string, string>([
    ['BASECURRENCYID', '1'],
    ['DATAVERSION', '3'],
  ])
  const setting = new Map<string, string>()
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
      return [] as T[]
    },
    async mutate(statements: SqlStatement[]): Promise<void> {
      for (const s of statements) {
        const [key, value] = (s.bind ?? []) as [string, string]
        if (s.sql.includes('INTO INFOTABLE_V1')) info.set(key, value)
        else if (s.sql.includes('INTO SETTING_V1')) setting.set(key, value)
      }
    },
  }
  return { db, info, setting }
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

beforeEach(() => {
  setActivePinia(createPinia())
  fake = makeFakeDb()
  setDomainDb(fake.db)
  i18n.global.locale.value = 'en-US'
})

afterEach(() => {
  setDomainDb()
})

describe('SettingsPage', () => {
  // Requirement "Settings Surface" -- the two groups are distinguishable, and
  // file information is presented separately.
  it('presents the file facts, the preferences and the file information', async () => {
    const wrapper = await mountSettings()

    expect(wrapper.find('[data-testid="settings-file-facts"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="settings-preferences"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="settings-file-info"]').exists()).toBe(true)
  })

  // Requirement "File Information Presentation" -- read-only, and translated.
  it('shows the data version without any means of changing it', async () => {
    const wrapper = await mountSettings()
    const info = wrapper.find('[data-testid="settings-file-info"]')

    expect(info.text()).toContain('Data version')
    expect(info.text()).toContain('3')
    expect(info.findAll('input')).toHaveLength(0)
  })

  // Requirement "Base Currency Change Confirmation", scenario "Declining leaves
  // the file alone".
  describe('base currency confirmation', () => {
    it('writes nothing until the change is confirmed', async () => {
      const wrapper = await mountSettings()
      const store = useSettingsStore()

      // Picking a different currency stages the change and opens the gate.
      const page = wrapper.findComponent(SettingsPage)
      ;(page.vm as unknown as { onBaseCurrencyPicked: (v: unknown) => void }).onBaseCurrencyPicked({
        id: 2,
        label: 'EUR — Euro',
      })
      await flushPromises()

      expect(fake.info.get('BASECURRENCYID')).toBe('1')
      expect(store.baseCurrencyId).toBe(1)
    })

    it('writes the new base currency once confirmed', async () => {
      const wrapper = await mountSettings()
      const store = useSettingsStore()
      const page = wrapper.findComponent(SettingsPage)
      const vm = page.vm as unknown as {
        onBaseCurrencyPicked: (v: unknown) => void
        commitBaseCurrency: () => Promise<void>
      }

      vm.onBaseCurrencyPicked({ id: 2, label: 'EUR — Euro' })
      await vm.commitBaseCurrency()
      await flushPromises()

      expect(fake.info.get('BASECURRENCYID')).toBe('2')
      expect(store.baseCurrencyId).toBe(2)
    })

    it('leaves the stored value untouched when declined', async () => {
      const wrapper = await mountSettings()
      const page = wrapper.findComponent(SettingsPage)
      const vm = page.vm as unknown as {
        onBaseCurrencyPicked: (v: unknown) => void
        revertBaseCurrency: () => void
      }

      vm.onBaseCurrencyPicked({ id: 2, label: 'EUR — Euro' })
      vm.revertBaseCurrency()
      await flushPromises()

      expect(fake.info.get('BASECURRENCYID')).toBe('1')
    })
  })
})
