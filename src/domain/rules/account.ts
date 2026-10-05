import { enumCodec } from '../conventions'
import type { AccountRecord, TransactionRecord } from '../records'
import { accountFlow, reconciledFlow } from './ledger'

/**
 * Pure account rules (openspec: account-management). The type strings and their
 * order come from Model_Account.h, which differs from the DDL comment's order.
 */

export const ACCOUNT_TYPES = [
  'Cash',
  'Checking',
  'Credit Card',
  'Loan',
  'Term',
  'Investment',
  'Asset',
  'Shares',
] as const
export type AccountType = (typeof ACCOUNT_TYPES)[number]
export const accountTypeCodec = enumCodec(ACCOUNT_TYPES, 'Cash')

export const ACCOUNT_STATUSES = ['Open', 'Closed'] as const
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number]

/** An unrecognized stored status reads as Closed, matching upstream's fallback. */
export const accountStatusCodec = enumCodec(ACCOUNT_STATUSES, 'Closed')

/**
 * The order desktop lists account groups in its navigation tree, which is not
 * ACCOUNT_TYPES order (mmframe.cpp, `ACCOUNT_IMG_TABLE`).
 */
export const ACCOUNT_TREE_ORDER: readonly AccountType[] = [
  'Checking',
  'Credit Card',
  'Cash',
  'Loan',
  'Term',
  'Investment',
  'Shares',
  'Asset',
]

/** Accounts grouped by type in desktop tree order; each group keeps the order given. */
export const groupByType = <T extends Pick<AccountRecord, 'ACCOUNTTYPE'>>(
  accounts: readonly T[],
): { type: AccountType; accounts: T[] }[] =>
  ACCOUNT_TREE_ORDER.map((type) => ({
    type,
    accounts: accounts.filter((account) => accountTypeCodec.decode(account.ACCOUNTTYPE) === type),
  })).filter((group) => group.accounts.length > 0)

/**
 * The types an existing account may take. Desktop never offers a Shares account
 * for a type change, and never offers Investment as the new type
 * (mmGUIFrame::OnChangeAccountType, Model_Account::all_checking_account_names).
 */
export const typeChangeOptions = (current: string): AccountType[] => {
  const type = accountTypeCodec.decode(current)
  if (type === 'Shares') return ['Shares']
  return ACCOUNT_TYPES.filter((candidate) => candidate === type || candidate !== 'Investment')
}

/** Accounts that hold stock positions rather than only cash movements. */
export const holdsSecurities = (account: Pick<AccountRecord, 'ACCOUNTTYPE'>): boolean => {
  const type = accountTypeCodec.decode(account.ACCOUNTTYPE)
  return type === 'Investment' || type === 'Shares'
}

/** FAVORITEACCT persists as the text TRUE/FALSE, not as an integer. */
export const isFavorite = (account: Pick<AccountRecord, 'FAVORITEACCT'>): boolean =>
  (account.FAVORITEACCT ?? '').toUpperCase() === 'TRUE'

export const encodeFavorite = (value: boolean): string => (value ? 'TRUE' : 'FALSE')

export const isOpen = (account: Pick<AccountRecord, 'STATUS'>): boolean =>
  accountStatusCodec.decode(account.STATUS) === 'Open'

/**
 * Balance is the account's initial balance plus the flow of every transaction
 * touching it, where the flow function is owned by `transaction-ledger`.
 */
export const accountBalance = (
  account: Pick<AccountRecord, 'ACCOUNTID' | 'INITIALBAL'>,
  transactions: readonly Parameters<typeof accountFlow>[0][],
): number =>
  transactions.reduce(
    (sum, transaction) => sum + accountFlow(transaction, account.ACCOUNTID),
    account.INITIALBAL ?? 0,
  )

/**
 * Balance counting only reconciled rows. The status is read through the ledger's
 * one interpretation, so a stored display name counts as its key (openspec:
 * transaction-ledger, Transaction Status Lifecycle).
 */
export const reconciledBalance = (
  account: Pick<AccountRecord, 'ACCOUNTID' | 'INITIALBAL'>,
  transactions: readonly (Parameters<typeof accountFlow>[0] & Pick<TransactionRecord, 'STATUS'>)[],
): number =>
  transactions.reduce(
    (sum, transaction) => sum + reconciledFlow(transaction, account.ACCOUNTID),
    account.INITIALBAL ?? 0,
  )

/**
 * Whether a projected balance breaches the account's configured floor, used to
 * guard scheduled execution (openspec: scheduled-transactions, Execution Guard).
 */
export const breachesFloor = (
  account: Pick<AccountRecord, 'MINIMUMBALANCE' | 'CREDITLIMIT'>,
  projectedBalance: number,
): boolean => {
  const minimum = account.MINIMUMBALANCE ?? 0
  const creditLimit = account.CREDITLIMIT ?? 0
  if (minimum && projectedBalance < minimum) return true
  if (creditLimit && projectedBalance < -creditLimit) return true
  return false
}
