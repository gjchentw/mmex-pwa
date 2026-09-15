import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { accountRepo } from '../domain/repos/account'
import { currencyRepo } from '../domain/repos/currency'
import { accountStatusCodec, encodeFavorite, isFavorite } from '../domain/rules/account'
import type { AccountRecord, CurrencyRecord } from '../domain/records'

/**
 * The accounts surface's state (openspec: account-management).
 *
 * The store delegates to accountRepo for all persistence. Balance computation
 * uses accountRepo.balance() which calls accountBalance() from the rules layer
 * (design D10). The list always shows all accounts, sorted alphabetically by
 * default (design D1).
 */
export const useAccountStore = defineStore('account', () => {
  const loading = ref(false)
  const error = ref<string | null>(null)

  const accounts = ref<AccountRecord[]>([])
  const currencies = ref<CurrencyRecord[]>([])

  /** Map of account ID to balance (computed on demand, design D6). */
  const balances = ref<Map<number, number>>(new Map())

  /** Custom sort order persisted as user preference (design D1). */
  const customOrder = ref<number[]>([])

  /** Whether the custom order is being used. */
  const useCustomOrder = ref(false)

  /**
   * Sorted accounts: alphabetical by name by default, or custom order if set.
   */
  const sortedAccounts = computed(() => {
    const list = [...accounts.value]
    if (useCustomOrder.value && customOrder.value.length > 0) {
      const orderMap = new Map(customOrder.value.map((id, index) => [id, index]))
      return list.sort((a, b) => {
        const aIndex = orderMap.get(a.ACCOUNTID) ?? Number.MAX_SAFE_INTEGER
        const bIndex = orderMap.get(b.ACCOUNTID) ?? Number.MAX_SAFE_INTEGER
        return aIndex - bIndex
      })
    }
    return list.sort((a, b) =>
      a.ACCOUNTNAME.localeCompare(b.ACCOUNTNAME, undefined, { sensitivity: 'base' }),
    )
  })

  /**
   * Check if an account is a favorite (FAVORITEACCT = 'TRUE').
   */
  const isAccountFavorite = (account: Pick<AccountRecord, 'FAVORITEACCT'>) => isFavorite(account)

  /**
   * Get account by ID.
   */
  const getById = (accountId: number): AccountRecord | null =>
    accounts.value.find((a) => a.ACCOUNTID === accountId) ?? null

  /**
   * Get currency by ID for display purposes.
   */
  const getCurrencyById = (currencyId: number): CurrencyRecord | null =>
    currencies.value.find((c) => c.CURRENCYID === currencyId) ?? null

  /**
   * Get currency symbol for an account.
   */
  const getCurrencySymbol = (account: Pick<AccountRecord, 'CURRENCYID'>): string =>
    getCurrencyById(account.CURRENCYID)?.CURRENCY_SYMBOL ?? ''

  /**
   * Get currency code (3-letter) for an account.
   */
  const getCurrencyCode = (account: Pick<AccountRecord, 'CURRENCYID'>): string =>
    getCurrencyById(account.CURRENCYID)?.CURRENCYNAME ?? ''

  /**
   * Check if an account is open.
   */
  const isOpen = (account: Pick<AccountRecord, 'STATUS'>): boolean =>
    accountStatusCodec.decode(account.STATUS) === 'Open'

  /**
   * Check if an account is closed.
   */
  const isClosed = (account: Pick<AccountRecord, 'STATUS'>): boolean => !isOpen(account)

  /**
   * Get the display type for an account.
   */
  const getTypeDisplay = (account: Pick<AccountRecord, 'ACCOUNTTYPE'>): string =>
    account.ACCOUNTTYPE

  /**
   * Load all accounts and currencies.
   * Reads through the repositories on entry (design D3).
   */
  async function load() {
    loading.value = true
    error.value = null
    try {
      const [allAccounts, allCurrencies] = await Promise.all([
        accountRepo.all(),
        currencyRepo.all(),
      ])
      accounts.value = allAccounts
      currencies.value = allCurrencies
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : String(err)
    } finally {
      loading.value = false
    }
  }

  /**
   * Get the balance for an account, computed on demand (design D6).
   * First checks the cache, then falls back to computing.
   */
  async function getBalance(accountId: number): Promise<number> {
    // Check cache first
    if (balances.value.has(accountId)) {
      return balances.value.get(accountId)!
    }
    const balance = await accountRepo.balance(accountId)
    // Cache the balance
    const newMap = new Map(balances.value)
    newMap.set(accountId, balance)
    balances.value = newMap
    return balance
  }

  /**
   * Get balance from cache or return null if not computed yet.
   */
  const getCachedBalance = (accountId: number): number | null => {
    return balances.value.get(accountId) ?? null
  }

  /**
   * Get accounts with their cached balances for list display.
   */
  const accountsWithBalances = computed(() => {
    return sortedAccounts.value.map((account) => ({
      ...account,
      cachedBalance: getCachedBalance(account.ACCOUNTID),
    }))
  })

  /**
   * Load balances for all accounts in parallel.
   */
  async function loadBalances() {
    const newMap = new Map<number, number>()
    const promises = accounts.value.map(async (account) => {
      const balance = await accountRepo.balance(account.ACCOUNTID)
      newMap.set(account.ACCOUNTID, balance)
    })
    await Promise.all(promises)
    balances.value = newMap
  }

  /**
   * Save an account: add for new, update for existing.
   */
  async function save(account: Partial<AccountRecord> & { ACCOUNTID?: number }) {
    if (account.ACCOUNTID) {
      // Update existing account
      const { ACCOUNTID, ...values } = account
      await accountRepo.save(ACCOUNTID, values)
    } else {
      // Add new account
      const values = account as Omit<AccountRecord, 'ACCOUNTID'>
      await accountRepo.add(values)
    }
    await load()
    // The initial balance may have moved, and a new account has no cached entry.
    await loadBalances()
  }

  /**
   * Remove an account with full cascade (design D8).
   * Uses accountRepo.remove() which already implements the cascade.
   */
  async function remove(accountId: number) {
    await accountRepo.remove(accountId)
    await load()
    await loadBalances()
  }

  /**
   * Validate account name for case-insensitive uniqueness (risk R1).
   * Uses accountRepo.findByName() which already handles case-insensitive matching.
   */
  async function validateName(name: string, excludeAccountId?: number): Promise<boolean> {
    const existing = await accountRepo.findByName(name, excludeAccountId)
    return existing === null
  }

  /**
   * Toggle favorite state for an account.
   * Uses encodeFavorite() from rules layer (design D9).
   */
  async function toggleFavorite(accountId: number) {
    const account = getById(accountId)
    if (!account) return

    const current = isFavorite(account)
    const updates: Partial<AccountRecord> = {
      FAVORITEACCT: encodeFavorite(!current),
    }
    await accountRepo.save(accountId, updates)
    await load()
  }

  /**
   * Set statement lock for an account.
   */
  async function setStatementLock(accountId: number, locked: boolean, date: string | null) {
    const updates: Partial<AccountRecord> = {
      STATEMENTLOCKED: locked ? 1 : null,
      STATEMENTDATE: date ?? null,
    }
    await accountRepo.save(accountId, updates)
    await load()
  }

  /**
   * Get accounts that reference a specific currency.
   */
  const accountsWithCurrency = (currencyId: number): AccountRecord[] =>
    accounts.value.filter((a) => a.CURRENCYID === currencyId)

  return {
    loading,
    error,
    accounts,
    currencies,
    customOrder,
    useCustomOrder,
    sortedAccounts,
    getById,
    getCurrencyById,
    getCurrencySymbol,
    getCurrencyCode,
    isAccountFavorite,
    isOpen,
    isClosed,
    getTypeDisplay,
    load,
    loadBalances,
    getBalance,
    getCachedBalance,
    accountsWithBalances,
    save,
    remove,
    validateName,
    toggleFavorite,
    setStatementLock,
    accountsWithCurrency,
  }
})
