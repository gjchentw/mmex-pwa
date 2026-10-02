import { currencyTypeCodec, type CurrencyType } from '../../domain/rules/currency'

/**
 * Catalog keys for the currency type shown to the user. The stored value stays
 * the upstream string (openspec: currency-management, Editing and Adding
 * Currency Definitions).
 */
const TYPE_KEYS: Record<CurrencyType, string> = {
  Fiat: 'fiat',
  Crypto: 'crypto',
}

export const currencyTypeLabelKey = (type: string | null | undefined): string =>
  `currency.types.${TYPE_KEYS[currencyTypeCodec.decode(type)]}`
