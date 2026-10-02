import { ref } from 'vue'
import { defineStore } from 'pinia'
import { infoRepo, settingRepo } from '../domain/repos/metadata'
import { currencyRepo } from '../domain/repos/currency'
import {
  DEFAULTS,
  INFO_KEY,
  SETTING_KEY,
  encodeBooleanValue,
  isDateFormatMask,
  isLocaleWrittenByThisApplication,
  languageToLocale,
  localeToLanguage,
  parseBooleanValue,
  parseIntegerValue,
  parseRetentionDays,
  retentionDays as normalizeRetentionDays,
} from '../domain/rules/metadata'
import type { CurrencyRecord } from '../domain/records'
import { FALLBACK_LOCALE, applyLocale } from '../i18n'

/** A value the surface refused to write, named by the field it belongs to. */
export class SettingRefusedError extends Error {
  constructor(readonly field: 'retentionDays' | 'dateFormat') {
    super(`${field} refused`)
    this.name = 'SettingRefusedError'
  }
}

/**
 * The settings surface's state (openspec: file-metadata-and-settings).
 *
 * Values are read from the database on entry rather than cached indefinitely --
 * synchronization can replace the file underneath the application -- and every
 * write addresses a single key, so facts this build does not present are never
 * disturbed (Unknown Key Preservation). Every value written is one desktop
 * reads with the same meaning (design D1 to D10 of the fidelity change).
 */
export const useSettingsStore = defineStore('settings', () => {
  const loading = ref(false)
  const error = ref<string | null>(null)

  const baseCurrencyId = ref<number | null>(null)
  const userName = ref('')
  const dateFormat = ref('')
  const useCurrencyHistory = ref<boolean>(DEFAULTS.useCurrencyHistory)
  const retentionDays = ref<number>(DEFAULTS.deletedTransactionRetainDays)
  /** Null when the file holds no DATAVERSION row; the surface then shows "not set". */
  const dataVersion = ref<string | null>(null)
  /** The file's currencies, which the base-currency picker offers (design D6). */
  const currencies = ref<CurrencyRecord[]>([])
  /** SETTING_V1.LANGUAGE as stored, in desktop's canonical form. */
  const storedLanguage = ref<string | null>(null)

  /**
   * A locale chosen while no database was open. It applies to the session at
   * once and is written as soon as one becomes available.
   */
  const pendingLocale = ref<string | null>(null)

  async function load() {
    loading.value = true
    error.value = null
    try {
      const [base, name, format, history, version, retain, language, allCurrencies] =
        await Promise.all([
          infoRepo.get(INFO_KEY.baseCurrencyId),
          infoRepo.get(INFO_KEY.userName),
          infoRepo.get(INFO_KEY.dateFormat),
          infoRepo.get(INFO_KEY.useCurrencyHistory),
          infoRepo.get(INFO_KEY.dataVersion),
          settingRepo.get(SETTING_KEY.deletedTransactionRetainDays),
          settingRepo.get(SETTING_KEY.language),
          currencyRepo.all(),
        ])

      baseCurrencyId.value = base === null ? null : parseIntegerValue(base, -1)
      userName.value = name ?? ''
      dateFormat.value = format ?? ''
      useCurrencyHistory.value = parseBooleanValue(history, DEFAULTS.useCurrencyHistory)
      dataVersion.value = version
      retentionDays.value = normalizeRetentionDays(retain)
      storedLanguage.value = language
      currencies.value = allCurrencies
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : String(err)
    } finally {
      loading.value = false
    }
  }

  async function setUserName(value: string) {
    await infoRepo.set(INFO_KEY.userName, value)
    userName.value = value
  }

  /** Only a mask desktop accepts is written (design D3). */
  async function setDateFormat(value: string) {
    if (!isDateFormatMask(value)) throw new SettingRefusedError('dateFormat')
    await infoRepo.set(INFO_KEY.dateFormat, value)
    dateFormat.value = value
  }

  async function setUseCurrencyHistory(value: boolean) {
    await infoRepo.set(INFO_KEY.useCurrencyHistory, encodeBooleanValue(value))
    useCurrencyHistory.value = value
  }

  /**
   * Performs desktop's base-currency change -- pointer, every rate to 1, history
   * emptied, in one operation -- so the surface confirms with the user first
   * (openspec: Base Currency Change Confirmation; currency-management, Base Currency).
   */
  async function setBaseCurrency(currencyId: number) {
    await currencyRepo.changeBase(currencyId)
    await load()
  }

  /** Refuses anything outside desktop's 0..999 days rather than coercing it (design D9). */
  async function setRetentionDays(value: unknown) {
    const days = parseRetentionDays(value)
    if (days === null) throw new SettingRefusedError('retentionDays')
    await settingRepo.set(SETTING_KEY.deletedTransactionRetainDays, String(days))
    retentionDays.value = days
  }

  async function writeLanguage(locale: string) {
    const language = localeToLanguage(locale)
    if (!language) return
    await settingRepo.set(SETTING_KEY.language, language)
    storedLanguage.value = language
  }

  /**
   * Applies a locale immediately and records it under SETTING_V1.LANGUAGE in
   * desktop's canonical form (design D1). With no database open the choice is
   * held until one is, rather than being lost.
   */
  async function setLocale(value: string, canPersist: boolean) {
    applyLocale(value)
    if (!canPersist) {
      pendingLocale.value = value
      return
    }
    pendingLocale.value = null
    await writeLanguage(value)
  }

  /**
   * Called once the database is ready. A choice made during initialization wins
   * and is flushed; otherwise the stored language is restored, or the fallback
   * when there is none this build can render. A LOCALE holding one of this
   * application's own tags is damage the earlier surface left: it is read once,
   * recorded under LANGUAGE, and cleared to the empty string, which desktop
   * reads as "derive the format from the currency settings" (design D2).
   */
  async function syncLocaleWithDatabase() {
    const [language, locale] = await Promise.all([
      settingRepo.get(SETTING_KEY.language),
      infoRepo.get(INFO_KEY.locale),
    ])
    storedLanguage.value = language
    const repairable = language === null && isLocaleWrittenByThisApplication(locale)

    if (pendingLocale.value) {
      const value = pendingLocale.value
      pendingLocale.value = null
      await writeLanguage(value)
      if (repairable) await infoRepo.set(INFO_KEY.locale, '')
      return
    }

    if (repairable) {
      applyLocale(locale as string)
      await writeLanguage(locale as string)
      await infoRepo.set(INFO_KEY.locale, '')
      return
    }

    applyLocale(languageToLocale(language) ?? FALLBACK_LOCALE)
  }

  return {
    loading,
    error,
    baseCurrencyId,
    userName,
    dateFormat,
    useCurrencyHistory,
    retentionDays,
    dataVersion,
    currencies,
    storedLanguage,
    pendingLocale,
    load,
    setUserName,
    setDateFormat,
    setUseCurrencyHistory,
    setBaseCurrency,
    setRetentionDays,
    setLocale,
    syncLocaleWithDatabase,
  }
})
