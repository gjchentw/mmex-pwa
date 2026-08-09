import { enumCodec, isoDatePart, parseIsoDateTime, UPDATE_TYPE } from '../conventions'
import type { CurrencyHistoryRecord, CurrencyRecord } from '../records'

/**
 * Pure currency rules (openspec: currency-management). Amounts stay in
 * JavaScript numbers because upstream computes in C++ doubles; matching that is
 * what keeps derived caches comparable with desktop.
 */

export const CURRENCY_TYPES = ['Fiat', 'Crypto'] as const
export type CurrencyType = (typeof CURRENCY_TYPES)[number]
export const currencyTypeCodec = enumCodec(CURRENCY_TYPES, 'Fiat')

export { UPDATE_TYPE }

/**
 * Display precision is derived from the currency's scale: 100 gives 2 decimals,
 * 1 gives 0 (JPY), 100000000 gives 8 (BTC).
 */
export const precisionFromScale = (scale: number | null | undefined): number => {
  if (!scale || scale <= 0) return 0
  return Math.round(Math.log10(scale))
}

export const currencyPrecision = (currency: Pick<CurrencyRecord, 'SCALE'>): number =>
  precisionFromScale(currency.SCALE)

/**
 * Renders an amount using the currency's formatting fields. Formatting is a
 * display concern only and never changes what is persisted.
 */
export const formatAmount = (
  amount: number,
  currency: Pick<
    CurrencyRecord,
    'SCALE' | 'DECIMAL_POINT' | 'GROUP_SEPARATOR' | 'PFX_SYMBOL' | 'SFX_SYMBOL'
  >,
  options: { withSymbols?: boolean } = {},
): string => {
  const precision = currencyPrecision(currency)
  const negative = amount < 0
  const fixed = Math.abs(amount).toFixed(precision)
  const [whole = '0', fraction = ''] = fixed.split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, currency.GROUP_SEPARATOR ?? '')
  const decimalPoint = currency.DECIMAL_POINT ?? '.'
  let text = fraction ? `${grouped}${decimalPoint}${fraction}` : grouped
  if (options.withSymbols !== false) {
    text = `${currency.PFX_SYMBOL ?? ''}${text}${currency.SFX_SYMBOL ?? ''}`
  }
  return negative ? `-${text}` : text
}

/** Strips formatting back to a plain number, tolerating separators and symbols. */
export const parseAmount = (
  text: string,
  currency: Pick<CurrencyRecord, 'DECIMAL_POINT' | 'GROUP_SEPARATOR'>,
): number => {
  const group = currency.GROUP_SEPARATOR ?? ''
  const point = currency.DECIMAL_POINT ?? '.'
  let normalized = text.trim()
  if (group) normalized = normalized.split(group).join('')
  if (point !== '.') normalized = normalized.split(point).join('.')
  normalized = normalized.replace(/[^0-9.+-]/g, '')
  const value = Number.parseFloat(normalized)
  return Number.isNaN(value) ? 0 : value
}

export interface RateContext {
  /** The database's base currency; its rate is always 1. */
  baseCurrencyId: number
  /** When false, the flat BASECONVRATE applies and history is ignored. */
  useCurrencyHistory: boolean
}

/**
 * Resolves the conversion rate for a currency on a date.
 *
 * Mirrors Model_CurrencyHistory::getDayRate: history disabled or base currency
 * short-circuit first; then an exact-date row; then the temporally nearest row
 * with ties resolved in favour of the earlier one; finally the flat rate.
 */
export const resolveDayRate = (
  currency: Pick<CurrencyRecord, 'CURRENCYID' | 'BASECONVRATE'> | null | undefined,
  history: readonly Pick<CurrencyHistoryRecord, 'CURRDATE' | 'CURRVALUE'>[],
  isoDate: string,
  context: RateContext,
): number => {
  const flatRate = currency?.BASECONVRATE ?? 1
  if (!currency) return 1
  if (!context.useCurrencyHistory) return flatRate
  if (currency.CURRENCYID === context.baseCurrencyId || currency.CURRENCYID === -1) return 1
  if (history.length === 0) return flatRate

  const target = isoDatePart(isoDate)
  const exact = history.find((row) => isoDatePart(row.CURRDATE) === target)
  if (exact) return exact.CURRVALUE

  const sorted = [...history].sort((a, b) =>
    isoDatePart(a.CURRDATE).localeCompare(isoDatePart(b.CURRDATE)),
  )
  const previous = [...sorted].reverse().find((row) => isoDatePart(row.CURRDATE) < target)
  const next = sorted.find((row) => isoDatePart(row.CURRDATE) > target)

  if (previous && next) {
    const targetTime = parseIsoDateTime(target)?.getTime() ?? 0
    const pastSpan = targetTime - (parseIsoDateTime(previous.CURRDATE)?.getTime() ?? 0)
    const futureSpan = (parseIsoDateTime(next.CURRDATE)?.getTime() ?? 0) - targetTime
    // A tie favours the earlier row, matching the upstream `<=` comparison.
    return pastSpan <= futureSpan ? previous.CURRVALUE : next.CURRVALUE
  }
  if (previous) return previous.CURRVALUE
  if (next) return next.CURRVALUE
  return flatRate
}

/** The newest history point, or null when the currency has no history. */
export const latestRate = (
  history: readonly Pick<CurrencyHistoryRecord, 'CURRDATE' | 'CURRVALUE'>[],
): number | null => {
  if (history.length === 0) return null
  const newest = [...history].sort((a, b) =>
    isoDatePart(a.CURRDATE).localeCompare(isoDatePart(b.CURRDATE)),
  )[history.length - 1]
  return newest?.CURRVALUE ?? null
}
