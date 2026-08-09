import { createI18n } from 'vue-i18n'
import enUS from './locales/en-US.json'
import zhTW from './locales/zh-TW.json'

/**
 * The locales this build provides. A stored locale outside this set falls back
 * for display and is left in the file untouched (openspec:
 * file-metadata-and-settings, Active Locale Persistence).
 */
export const SUPPORTED_LOCALES = ['en-US', 'zh-TW'] as const
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

export const FALLBACK_LOCALE: SupportedLocale = 'en-US'

export const isSupportedLocale = (value: unknown): value is SupportedLocale =>
  typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value)

/**
 * Shared instance so the shell, the settings surface and the settings store all
 * drive one locale rather than each holding their own copy.
 */
export const i18n = createI18n({
  legacy: false,
  locale: FALLBACK_LOCALE,
  fallbackLocale: FALLBACK_LOCALE,
  messages: {
    'en-US': enUS,
    'zh-TW': zhTW,
  },
})

export const activeLocale = (): string => i18n.global.locale.value

export const applyLocale = (value: string): void => {
  if (!isSupportedLocale(value)) return
  i18n.global.locale.value = value
}
