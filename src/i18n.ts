import { createI18n } from 'vue-i18n'
import enUS from './locales/en-US.json'
import zhTW from './locales/zh-TW.json'
import { LANGUAGE_BY_LOCALE, type LocaleTag } from './domain/rules/metadata'

/**
 * The locales this build provides: the keys of the desktop language mapping, so
 * every locale offered has a form desktop can store. A stored language outside
 * this set falls back for display and is left in the file untouched (openspec:
 * file-metadata-and-settings, Active Locale Persistence).
 */
export const SUPPORTED_LOCALES = Object.keys(LANGUAGE_BY_LOCALE) as readonly LocaleTag[]
export type SupportedLocale = LocaleTag

export const FALLBACK_LOCALE: SupportedLocale = 'en-US'

/** Each language named in itself, as the shell and the settings surface both show it. */
export const LOCALE_LABELS: Record<SupportedLocale, string> = {
  'en-US': 'English',
  'zh-TW': '繁體中文',
}

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

export const applyLocale = (value: string): void => {
  if (!isSupportedLocale(value)) return
  i18n.global.locale.value = value
}
