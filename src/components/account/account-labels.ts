import { accountTypeCodec, isOpen, type AccountType } from '../../domain/rules/account'

/**
 * Catalog keys for the account type and status shown to the user. The stored
 * values stay the upstream strings; desktop likewise translates them only for
 * display (`wxGetTranslation(ACCOUNTTYPE)`).
 */

const TYPE_KEYS: Record<AccountType, string> = {
  Cash: 'cash',
  Checking: 'checking',
  'Credit Card': 'creditCard',
  Loan: 'loan',
  Term: 'term',
  Investment: 'investment',
  Asset: 'asset',
  Shares: 'shares',
}

export const typeLabelKey = (type: string): string =>
  `account.types.${TYPE_KEYS[accountTypeCodec.decode(type)]}`

export const statusLabelKey = (status: string): string =>
  isOpen({ STATUS: status }) ? 'account.open' : 'account.closed'
