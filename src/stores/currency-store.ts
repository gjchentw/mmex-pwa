import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { currencyRepo, currencyHistoryRepo } from '../domain/repos/currency'
import { fileFacts } from '../domain/repos/metadata'
import { UPDATE_TYPE } from '../domain/conventions'
import { isoDatePart } from '../domain/conventions'
import type { CurrencyHistoryRecord, CurrencyRecord } from '../domain/records'

/**
 * The currency surface's state (openspec: currency-management).
 *
 * A seeded file defines 168 currencies and typically uses one or two, so the
 * used set is resolved in a single query and the full list stays behind a
 * toggle (design D1).
 */
export const useCurrencyStore = defineStore('currency', () => {
  const loading = ref(false)
  const error = ref<string | null>(null)

  const currencies = ref<CurrencyRecord[]>([])
  const usedIds = ref<Set<number>>(new Set())
  const baseCurrencyId = ref<number | null>(null)
  const useCurrencyHistory = ref(false)

  const showAll = ref(false)
  const search = ref('')

  const history = ref<CurrencyHistoryRecord[]>([])

  const isBase = (currency: Pick<CurrencyRecord, 'CURRENCYID'>) =>
    currency.CURRENCYID === baseCurrencyId.value

  /** Referenced by an account or asset, or serving as the base currency. */
  const isUsed = (currency: Pick<CurrencyRecord, 'CURRENCYID'>) =>
    usedIds.value.has(currency.CURRENCYID) || isBase(currency)

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
      const [all, used, base, history] = await Promise.all([
        currencyRepo.all(),
        currencyRepo.usedCurrencyIds(),
        fileFacts.baseCurrencyId(),
        fileFacts.useCurrencyHistory(),
      ])
      currencies.value = all
      usedIds.value = used
      baseCurrencyId.value = base === -1 ? null : base
      useCurrencyHistory.value = history
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : String(err)
    } finally {
      loading.value = false
    }
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
  }

  async function removeRate(histId: number, currencyId: number) {
    await currencyHistoryRepo.remove(histId)
    await loadHistory(currencyId)
  }

  return {
    loading,
    error,
    currencies,
    usedIds,
    baseCurrencyId,
    useCurrencyHistory,
    showAll,
    search,
    history,
    visibleCurrencies,
    isBase,
    isUsed,
    load,
    save,
    add,
    remove,
    loadHistory,
    recordRate,
    removeRate,
  }
})
