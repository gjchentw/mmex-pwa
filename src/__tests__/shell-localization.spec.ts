import { describe, it, expect } from 'vitest'
import { createI18n } from 'vue-i18n'
import enUS from '../locales/en-US.json'
import zhTW from '../locales/zh-TW.json'

/**
 * Spec: app-shell-navigation, requirement "Localized Shell Text". The shell used
 * to render a hardcoded title and hardcoded English lifecycle labels; these
 * assertions keep every shell string in the catalogs.
 */

const DATABASE_STATES = [
  'uninitialized',
  'probing',
  'creating',
  'opening',
  'migrating',
  'needs-wizard',
  'ready',
  'error',
] as const

const collectKeys = (value: unknown, prefix = ''): string[] => {
  if (typeof value !== 'object' || value === null) return [prefix]
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    collectKeys(child, prefix ? `${prefix}.${key}` : key),
  )
}

const i18n = createI18n({
  legacy: false,
  locale: 'en-US',
  fallbackLocale: 'en-US',
  messages: { 'en-US': enUS, 'zh-TW': zhTW },
})
const { t } = i18n.global

describe('shell localization', () => {
  it('keeps both catalogs at exactly the same keys', () => {
    const en = new Set(collectKeys(enUS))
    const zh = new Set(collectKeys(zhTW))
    expect([...en].filter((key) => !zh.has(key))).toEqual([])
    expect([...zh].filter((key) => !en.has(key))).toEqual([])
  })

  // Scenario "State identifiers never reach the user".
  it('translates every database lifecycle state in both locales', () => {
    for (const locale of ['en-US', 'zh-TW'] as const) {
      i18n.global.locale.value = locale
      for (const state of DATABASE_STATES) {
        const label = t(`database.status.${state}`)
        expect(label, `${locale} missing status.${state}`).not.toBe(`database.status.${state}`)
        expect(label).not.toBe(state)
      }
    }
    i18n.global.locale.value = 'en-US'
  })

  // Scenario "Switching locale translates the shell".
  it('translates the shell surfaces in both locales', () => {
    const keys = [
      'app.name',
      'menu.home',
      'home.title',
      'home.emptyTitle',
      'home.emptyBody',
      'notFound.title',
      'notFound.body',
      'notFound.backHome',
    ]
    for (const locale of ['en-US', 'zh-TW'] as const) {
      i18n.global.locale.value = locale
      for (const key of keys) {
        expect(t(key), `${locale} missing ${key}`).not.toBe(key)
      }
    }

    i18n.global.locale.value = 'zh-TW'
    expect(t('menu.home')).not.toBe(enUS.menu.home)
    i18n.global.locale.value = 'en-US'
  })

  it('interpolates the status line and the schema version', () => {
    expect(t('database.dbStatus', { status: t('database.status.ready') })).toContain(
      t('database.status.ready'),
    )
    expect(t('database.schemaVersion', { version: 21 })).toContain('21')
  })

  // The about destination was removed with its broken link (design.md D6).
  it('no longer carries the retired about label', () => {
    expect(collectKeys(enUS)).not.toContain('menu.about')
    expect(collectKeys(zhTW)).not.toContain('menu.about')
  })
})
