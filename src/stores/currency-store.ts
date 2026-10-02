import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { currencyRepo, currencyHistoryRepo, type CurrencyUsage } from '../domain/repos/currency'
import { fileFacts, infoRepo } from '../domain/repos/metadata'
import { INFO_KEY, encodeBooleanValue } from '../domain/rules/metadata'
import { UPDATE_TYPE } from '../domain/conventions'
import { isoDatePart } from '../domain/conventions'
import type { CurrencyHistoryRecord, CurrencyRecord } from '../domain/records'

/**
 * The currency surface's state (openspec: currency-management).
 *
 * The list scope follows desktop's Currency Manager: every currency unless the
 * file's SHOW_HIDDEN_CURRENCIES box was unticked (design D4). The used set is
 * resolved in one query, by source, so the surface can say why a currency
 * cannot be deleted (design D1).
 */
export const useCurrencyStore = defineStore('currency', () => {
  const loading = ref(false)
  const error = ref<string | null>(null)

  const currencies = ref<CurrencyRecord[]>([])
  const usedByAccounts = ref<Set<number>>(new Set())
  const usedByAssets = ref<Set<number>>(new Set())
  const baseCurrencyId = ref<number | null>(null)
  const useCurrencyHistory = ref(true)
  /** Each currency's most recent recorded rate, for the list and the editor (design D5). */
  const latestRates = ref<Map<number, number>>(new Map())

  /** Desktop's "Show all" box, read from and written to the file. */
  const showAll = ref(true)
  const search = ref('')

  const history = ref<CurrencyHistoryRecord[]>([])

  const isBase = (currency: Pick<CurrencyRecord, 'CURRENCYID'>) =>
    currency.CURRENCYID === baseCurrencyId.value

  /**
   * What keeps a currency in use, or null. Any account counts, closed ones
   * included, which is deliberately stricter than desktop (design D2).
   */
  const deletionBlocker = (currency: Pick<CurrencyRecord, 'CURRENCYID'>): CurrencyUsage | null => {
    if (isBase(currency)) return 'base'
    if (usedByAccounts.value.has(currency.CURRENCYID)) return 'accounts'
    if (usedByAssets.value.has(currency.CURRENCYID)) return 'assets'
    return null
  }

  /** Referenced by an account or asset, or serving as the base currency. */
  const isUsed = (currency: Pick<CurrencyRecord, 'CURRENCYID'>) =>
    deletionBlocker(currency) !== null

  /**
   * The rate the list shows: the latest recorded rate while history is on and
   * one exists, the fixed rate otherwise, and always 1 for the base (design D5).
   */
  const displayedRate = (currency: Pick<CurrencyRecord, 'CURRENCYID' | 'BASECONVRATE'>): number => {
    if (isBase(currency)) return 1
    if (useCurrencyHistory.value) {
      const latest = latestRates.value.get(currency.CURRENCYID)
      if (latest !== undefined) return latest
    }
    return currency.BASECONVRATE ?? 1
  }

  const visibleCurrencies = computed(() => {
    const term = search.value.trim().toLocaleLowerCase()
    return currencies.value
      .filter((currency) => (showAll.value ? true : isUsed(currency)))
      .filter((currency) =>
        term
          ? currency.CURRENCYNAME.toLocaleLowerCase().includes(term) ||
            (currency.CURRENCY_SYMBOL ?? '').toLocaleLowerCase().includes(term)
          : true,
      )
  })

  async function load() {
    loading.value = true
    error.value = null
    try {
      const [all, usage, base, historyOn, showHidden, latest] = await Promise.all([
        currencyRepo.all(),
        currencyRepo.currencyUsage(),
        fileFacts.baseCurrencyId(),
        fileFacts.useCurrencyHistory(),
        fileFacts.showHiddenCurrencies(),
        currencyRepo.latestRatesByCurrency(),
      ])
      currencies.value = all
      usedByAccounts.value = usage.accounts
      usedByAssets.value = usage.assets
      baseCurrencyId.value = base === -1 ? null : base
      useCurrencyHistory.value = historyOn
      showAll.value = showHidden
      latestRates.value = latest
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : String(err)
    } finally {
      loading.value = false
    }
  }

  /** Writes desktop's SHOW_HIDDEN_CURRENCIES so both applications list the same scope. */
  async function setShowAll(value: boolean) {
    showAll.value = value
    await infoRepo.set(INFO_KEY.showHiddenCurrencies, encodeBooleanValue(value))
  }

  async function save(currencyId: number, values: Partial<Omit<CurrencyRecord, 'CURRENCYID'>>) {
    await currencyRepo.save(currencyId, values)
    await load()
  }

  async function add(values: Omit<CurrencyRecord, 'CURRENCYID'>) {
    await currencyRepo.add(values)
    await load()
  }

  /**
   * Refuses where the capability forbids it; deleting takes the currency's
   * recorded rates with it.
   */
  async function remove(currencyId: number) {
    await currencyRepo.remove(currencyId)
    await load()
  }

  function clearHistory() {
    history.value = []
  }

  async function loadHistory(currencyId: number) {
    // Newest first: the most recent rate is the one a reader looks for.
    const rows = await currencyHistoryRepo.listFor(currencyId)
    history.value = [...rows].sort((a, b) =>
      isoDatePart(b.CURRDATE).localeCompare(isoDatePart(a.CURRDATE)),
    )
  }

  /** Rates entered here are manual, leaving the online marker for a future source. */
  async function recordRate(currencyId: number, isoDate: string, value: number) {
    await currencyHistoryRepo.record({
      CURRENCYID: currencyId,
      CURRDATE: isoDatePart(isoDate),
      CURRVALUE: value,
      CURRUPDTYPE: UPDATE_TYPE.manual,
    })
    await loadHistory(currencyId)
    latestRates.value = await currencyRepo.latestRatesByCurrency()
  }

  async function removeRate(histId: number, currencyId: number) {
    await currencyHistoryRepo.remove(histId)
    await loadHistory(currencyId)
    latestRates.value = await currencyRepo.latestRatesByCurrency()
  }

  return {
    loading,
    error,
    currencies,
    baseCurrencyId,
    useCurrencyHistory,
    latestRates,
    showAll,
    search,
    history,
    visibleCurrencies,
    isBase,
    isUsed,
    deletionBlocker,
    displayedRate,
    load,
    setShowAll,
    save,
    add,
    remove,
    clearHistory,
    loadHistory,
    recordRate,
    removeRate,
  }
})
