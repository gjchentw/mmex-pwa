import { enumCodec } from '../conventions'
import type { AccountRecord, TransactionRecord } from '../records'
import { accountFlow } from './ledger'

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

/** Balance counting only reconciled rows. */
export const reconciledBalance = (
  account: Pick<AccountRecord, 'ACCOUNTID' | 'INITIALBAL'>,
  transactions: readonly (Parameters<typeof accountFlow>[0] & Pick<TransactionRecord, 'STATUS'>)[],
): number =>
  transactions.reduce(
    (sum, transaction) =>
      transaction.STATUS === 'R' ? sum + accountFlow(transaction, account.ACCOUNTID) : sum,
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
