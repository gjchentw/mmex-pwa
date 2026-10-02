import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { accountRepo, type OpeningDateConflict } from '../domain/repos/account'
import { currencyRepo } from '../domain/repos/currency'
import { fileFacts } from '../domain/repos/metadata'
import { encodeFavorite, groupByType, isFavorite, isOpen } from '../domain/rules/account'
import type { AccountRecord, CurrencyRecord } from '../domain/records'

/**
 * The accounts surface's state (openspec: account-management).
 *
 * The store delegates every read and write to the repositories (design D10).
 * Accounts arrive in the repository's name order, which is the column's NOCASE
 * collation desktop also sorts by, and are grouped by type for the list
 * (design D1).
 */
export const useAccountStore = defineStore('account', () => {
  const loading = ref(false)
  const error = ref<string | null>(null)

  const accounts = ref<AccountRecord[]>([])
  const currencies = ref<CurrencyRecord[]>([])

  /** The file's base currency, which new accounts default to; null until loaded. */
  const baseCurrencyId = ref<number | null>(null)

  /** Account ID to balance, kept until the next write refreshes it (design D6). */
  const balances = ref<Map<number, number>>(new Map())

  /** The list's groups, in desktop's tree order (design D1). */
  const groupedAccounts = computed(() => groupByType(accounts.value))

  const isAccountFavorite = (account: Pick<AccountRecord, 'FAVORITEACCT'>) => isFavorite(account)

  const isClosed = (account: Pick<AccountRecord, 'STATUS'>): boolean => !isOpen(account)

  const getById = (accountId: number): AccountRecord | null =>
    accounts.value.find((a) => a.ACCOUNTID === accountId) ?? null

  const getCurrencyById = (currencyId: number): CurrencyRecord | null =>
    currencies.value.find((c) => c.CURRENCYID === currencyId) ?? null

  /** The ISO code, which CURRENCYFORMATS_V1 holds in CURRENCY_SYMBOL. */
  const getCurrencyCode = (account: Pick<AccountRecord, 'CURRENCYID'>): string =>
    getCurrencyById(account.CURRENCYID)?.CURRENCY_SYMBOL ?? ''

  /** Reads through the repositories on entry (design D3). */
  async function load() {
    loading.value = true
    error.value = null
    try {
      const [allAccounts, allCurrencies, baseId] = await Promise.all([
        accountRepo.all(),
        currencyRepo.all(),
        fileFacts.baseCurrencyId(),
      ])
      accounts.value = allAccounts
      currencies.value = allCurrencies
      baseCurrencyId.value = baseId
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : String(err)
    } finally {
      loading.value = false
    }
  }

  /** The cached balance, computing and caching it on first use (design D6). */
  async function getBalance(accountId: number): Promise<number> {
    const cached = balances.value.get(accountId)
    if (cached !== undefined) return cached
    const balance = await accountRepo.balance(accountId)
    const next = new Map(balances.value)
    next.set(accountId, balance)
    balances.value = next
    return balance
  }

  const getCachedBalance = (accountId: number): number | null =>
    balances.value.get(accountId) ?? null

  /** Recomputes every account's balance, replacing the cache. */
  async function loadBalances() {
    const next = new Map<number, number>()
    await Promise.all(
      accounts.value.map(async (account) => {
        next.set(account.ACCOUNTID, await accountRepo.balance(account.ACCOUNTID))
      }),
    )
    balances.value = next
  }

  /** Adds a new account, or applies an edit to one that exists. */
  async function save(account: Partial<AccountRecord> & { ACCOUNTID?: number }) {
    if (account.ACCOUNTID) {
      const { ACCOUNTID, ...values } = account
      await accountRepo.save(ACCOUNTID, values)
    } else {
      // The key is left for SQLite to assign.
      const values = { ...account }
      delete values.ACCOUNTID
      await accountRepo.add(values as Omit<AccountRecord, 'ACCOUNTID'>)
    }
    await load()
    // The initial balance may have moved, and a new account has no cached entry.
    await loadBalances()
  }

  /** Removes an account with its full cascade (design D8). */
  async function remove(accountId: number) {
    await accountRepo.remove(accountId)
    await load()
    await loadBalances()
  }

  /** Whether no other account holds the name, in any letter case (risk R1). */
  async function validateName(name: string, excludeAccountId?: number): Promise<boolean> {
    return (await accountRepo.findByName(name, excludeAccountId)) === null
  }

  /** The dependent record an existing account's opening date would come after, if any. */
  const openingDateConflict = (
    accountId: number,
    openingDate: string,
  ): Promise<OpeningDateConflict | null> => accountRepo.openingDateConflict(accountId, openingDate)

  /** Flips FAVORITEACCT between its TRUE and FALSE text forms (design D9). */
  async function toggleFavorite(accountId: number) {
    const account = getById(accountId)
    if (!account) return
    await accountRepo.save(accountId, { FAVORITEACCT: encodeFavorite(!isFavorite(account)) })
    await load()
  }

  return {
    loading,
    error,
    accounts,
    currencies,
    baseCurrencyId,
    groupedAccounts,
    getById,
    getCurrencyById,
    getCurrencyCode,
    isAccountFavorite,
    isOpen,
    isClosed,
    load,
    loadBalances,
    getBalance,
    getCachedBalance,
    save,
    remove,
    validateName,
    openingDateConflict,
    toggleFavorite,
  }
})
