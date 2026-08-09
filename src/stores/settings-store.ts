import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { infoRepo, settingRepo } from '../domain/repos/metadata'
import {
  DEFAULTS,
  INFO_KEY,
  SETTING_KEY,
  encodeBooleanValue,
  parseBooleanValue,
  parseIntegerValue,
  retentionDays as normalizeRetentionDays,
} from '../domain/rules/metadata'
import { applyLocale, isSupportedLocale, activeLocale } from '../i18n'

/** Upstream records the display language as a property of the data file. */
const LOCALE_KEY = 'LOCALE'

/**
 * The settings surface's state (openspec: file-metadata-and-settings).
 *
 * Values are read from the database on entry rather than cached indefinitely --
 * synchronization can replace the file underneath the application (design D3) --
 * and every write addresses a single key, so facts this build does not present
 * are never disturbed (Unknown Key Preservation).
 */
export const useSettingsStore = defineStore('settings', () => {
  const loading = ref(false)
  const error = ref<string | null>(null)

  const baseCurrencyId = ref<number | null>(null)
  const userName = ref('')
  const dateFormat = ref('')
  const useCurrencyHistory = ref(false)
  const storedLocale = ref<string | null>(null)
  const retentionDays = ref<number>(DEFAULTS.deletedTransactionRetainDays)
  const dataVersion = ref<string | null>(null)

  /**
   * A locale chosen while no database was open. It applies to the session at
   * once and is written as soon as one becomes available (design D5).
   */
  const pendingLocale = ref<string | null>(null)

  const isLoaded = computed(() => !loading.value && error.value === null)

  async function load() {
    loading.value = true
    error.value = null
    try {
      const [base, name, format, history, locale, version, retain] = await Promise.all([
        infoRepo.get(INFO_KEY.baseCurrencyId),
        infoRepo.get(INFO_KEY.userName),
        infoRepo.get(INFO_KEY.dateFormat),
        infoRepo.get(INFO_KEY.useCurrencyHistory),
        infoRepo.get(LOCALE_KEY),
        infoRepo.get(INFO_KEY.dataVersion),
        settingRepo.get(SETTING_KEY.deletedTransactionRetainDays),
      ])

      baseCurrencyId.value = base === null ? null : parseIntegerValue(base, -1)
      userName.value = name ?? ''
      dateFormat.value = format ?? ''
      useCurrencyHistory.value = parseBooleanValue(history, false)
      storedLocale.value = locale
      dataVersion.value = version ?? DEFAULTS.dataVersion
      retentionDays.value = normalizeRetentionDays(retain)
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

  async function setDateFormat(value: string) {
    await infoRepo.set(INFO_KEY.dateFormat, value)
    dateFormat.value = value
  }

  async function setUseCurrencyHistory(value: boolean) {
    await infoRepo.set(INFO_KEY.useCurrencyHistory, encodeBooleanValue(value))
    useCurrencyHistory.value = value
  }

  /**
   * Re-bases every conversion in the file, so the surface confirms with the user
   * before calling this (openspec: Base Currency Change Confirmation).
   */
  async function setBaseCurrency(currencyId: number) {
    await infoRepo.set(INFO_KEY.baseCurrencyId, String(currencyId))
    baseCurrencyId.value = currencyId
  }

  async function setRetentionDays(value: number) {
    const days = Math.max(0, Math.trunc(value))
    await settingRepo.set(SETTING_KEY.deletedTransactionRetainDays, String(days))
    retentionDays.value = days
  }

  /**
   * Applies a locale immediately and records it. With no database open the
   * choice is held until one is, rather than being lost.
   */
  async function setLocale(value: string, canPersist: boolean) {
    applyLocale(value)
    if (!canPersist) {
      pendingLocale.value = value
      return
    }
    pendingLocale.value = null
    await infoRepo.set(LOCALE_KEY, value)
    storedLocale.value = value
  }

  /**
   * Called once the database is ready: a choice made during initialization wins
   * and is flushed; otherwise the file's own locale is restored. A stored locale
   * this build cannot render falls back for display and is left in place
   * (design D6).
   */
  async function syncLocaleWithDatabase() {
    if (pendingLocale.value) {
      const value = pendingLocale.value
      pendingLocale.value = null
      await infoRepo.set(LOCALE_KEY, value)
      storedLocale.value = value
      return
    }
    const stored = await infoRepo.get(LOCALE_KEY)
    storedLocale.value = stored
    if (isSupportedLocale(stored)) {
      applyLocale(stored)
    }
  }

  return {
    loading,
    error,
    isLoaded,
    baseCurrencyId,
    userName,
    dateFormat,
    useCurrencyHistory,
    storedLocale,
    retentionDays,
    dataVersion,
    pendingLocale,
    activeLocale,
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
