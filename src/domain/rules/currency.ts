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
 * 1 gives 0 (JPY), 100000000 gives 8 (BTC). A scale that is not a power of ten
 * truncates, as desktop's `(int)log10(SCALE)` does (Model_Currency::precision).
 */
export const precisionFromScale = (scale: number | null | undefined): number => {
  if (!scale || scale <= 0) return 0
  const exact = Math.log10(scale)
  const nearest = Math.round(exact)
  return Math.abs(exact - nearest) < 1e-9 ? nearest : Math.trunc(exact)
}

/** Desktop's currency dialog offers 0 through 9 decimal places (currencydialog.cpp). */
export const DECIMAL_PLACES_MAX = 9

export const decimalPlacesFromScale = (scale: number | null | undefined): number =>
  Math.min(DECIMAL_PLACES_MAX, precisionFromScale(scale))

/** The stored SCALE for a number of decimal places, as desktop's `pow10(scale)`. */
export const scaleFromDecimalPlaces = (places: number): number =>
  10 ** Math.min(DECIMAL_PLACES_MAX, Math.max(0, Math.trunc(places)))

/** The separator choices desktop's currency dialog offers (currencydialog.cpp). */
export const DECIMAL_CHARACTERS = ['.', ','] as const
export const GROUPING_CHARACTERS = ['', '.', ',', ' '] as const

/** Desktop limits the currency code to 12 characters (currencydialog.cpp SetMaxLength). */
export const CURRENCY_CODE_MAX_LENGTH = 12

/** Below this magnitude desktop renders an amount as zero (Model_Currency::toString LIMIT). */
export const AMOUNT_TOLERANCE = 1e-10

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
  const magnitude = Math.abs(amount) < AMOUNT_TOLERANCE ? 0 : Math.abs(amount)
  const fixed = magnitude.toFixed(precision)
  const [whole = '0', fraction = ''] = fixed.split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, currency.GROUP_SEPARATOR ?? '')
  const decimalPoint = currency.DECIMAL_POINT ?? '.'
  // Desktop signs the digits and only then wraps them in the symbols: $-80.00.
  const sign = amount < 0 && magnitude !== 0 ? '-' : ''
  const digits = fraction ? `${grouped}${decimalPoint}${fraction}` : grouped
  if (options.withSymbols === false) return `${sign}${digits}`
  return `${currency.PFX_SYMBOL ?? ''}${sign}${digits}${currency.SFX_SYMBOL ?? ''}`
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

/**
 * A currency definition as desktop's dialog edits it: one symbol with a
 * placement, decimal places rather than the raw scale (openspec:
 * currency-management, Editing and Adding Currency Definitions).
 */
export interface CurrencyDefinitionDraft {
  CURRENCYNAME: string
  CURRENCY_SYMBOL: string
  symbol: string
  symbolPlacement: 'prefix' | 'suffix'
  DECIMAL_POINT: string
  GROUP_SEPARATOR: string
  UNIT_NAME: string
  CENT_NAME: string
  decimalPlaces: number
  CURRENCY_TYPE: string
  /** As typed: a number, a string, or empty. */
  BASECONVRATE: number | string | null
}

export type CurrencyDraftField = 'name' | 'code' | 'grouping' | 'rate'
export type CurrencyRefusal =
  | 'nameRequired'
  | 'codeRequired'
  | 'codeTooLong'
  | 'separatorsEqual'
  | 'rateInvalid'

/** A stored record read into the editor's shape, as desktop's dialog reads it. */
export const draftFromCurrency = (
  record: Omit<CurrencyRecord, 'CURRENCYID'> | null,
): CurrencyDefinitionDraft => {
  if (!record) {
    return {
      CURRENCYNAME: '',
      CURRENCY_SYMBOL: '',
      symbol: '',
      symbolPlacement: 'prefix',
      DECIMAL_POINT: '.',
      GROUP_SEPARATOR: ',',
      UNIT_NAME: '',
      CENT_NAME: '',
      decimalPlaces: 2,
      CURRENCY_TYPE: 'Fiat',
      BASECONVRATE: 1,
    }
  }
  // Desktop shows the prefix when one is set and the suffix otherwise; a record
  // holding both (only the earlier editor could store that) reads as prefix.
  const prefix = record.PFX_SYMBOL ?? ''
  const suffix = record.SFX_SYMBOL ?? ''
  return {
    CURRENCYNAME: record.CURRENCYNAME,
    CURRENCY_SYMBOL: record.CURRENCY_SYMBOL ?? '',
    symbol: prefix !== '' ? prefix : suffix,
    symbolPlacement: prefix !== '' || suffix === '' ? 'prefix' : 'suffix',
    DECIMAL_POINT: record.DECIMAL_POINT ?? '.',
    GROUP_SEPARATOR: record.GROUP_SEPARATOR ?? '',
    UNIT_NAME: record.UNIT_NAME ?? '',
    CENT_NAME: record.CENT_NAME ?? '',
    decimalPlaces: decimalPlacesFromScale(record.SCALE),
    CURRENCY_TYPE: currencyTypeCodec.decode(record.CURRENCY_TYPE),
    BASECONVRATE: record.BASECONVRATE,
  }
}

const parsePositiveNumber = (input: unknown): number | null => {
  if (input === null || input === undefined) return null
  const text = String(input).trim()
  if (text === '') return null
  const value = Number(text)
  return Number.isFinite(value) && value > 0 ? value : null
}

/**
 * The refusals desktop's dialog applies on OK (currencydialog.cpp OnOk), keyed by
 * the field that carries each. An empty result means the draft may be stored.
 */
export const validateCurrencyDefinition = (
  draft: CurrencyDefinitionDraft,
): Partial<Record<CurrencyDraftField, CurrencyRefusal>> => {
  const refusals: Partial<Record<CurrencyDraftField, CurrencyRefusal>> = {}
  if (draft.CURRENCYNAME.trim() === '') refusals.name = 'nameRequired'
  const code = draft.CURRENCY_SYMBOL.trim()
  if (code === '') refusals.code = 'codeRequired'
  else if (code.length > CURRENCY_CODE_MAX_LENGTH) refusals.code = 'codeTooLong'
  if (draft.decimalPlaces > 0 && draft.GROUP_SEPARATOR === draft.DECIMAL_POINT) {
    refusals.grouping = 'separatorsEqual'
  }
  if (parsePositiveNumber(draft.BASECONVRATE) === null) refusals.rate = 'rateInvalid'
  return refusals
}

/**
 * The record a valid draft stores: trimmed name and code, the symbol in exactly
 * one slot, SCALE from the decimal places, the rate as a number. Call only after
 * `validateCurrencyDefinition` returned no refusals.
 */
export const normalizeCurrencyDefinition = (
  draft: CurrencyDefinitionDraft,
): Omit<CurrencyRecord, 'CURRENCYID'> => ({
  CURRENCYNAME: draft.CURRENCYNAME.trim(),
  CURRENCY_SYMBOL: draft.CURRENCY_SYMBOL.trim(),
  PFX_SYMBOL: draft.symbolPlacement === 'prefix' ? draft.symbol : '',
  SFX_SYMBOL: draft.symbolPlacement === 'suffix' ? draft.symbol : '',
  DECIMAL_POINT: draft.DECIMAL_POINT,
  GROUP_SEPARATOR: draft.GROUP_SEPARATOR,
  UNIT_NAME: draft.UNIT_NAME,
  CENT_NAME: draft.CENT_NAME,
  SCALE: scaleFromDecimalPlaces(draft.decimalPlaces),
  BASECONVRATE: parsePositiveNumber(draft.BASECONVRATE) ?? 1,
  CURRENCY_TYPE: currencyTypeCodec.encode(currencyTypeCodec.decode(draft.CURRENCY_TYPE)),
})

/**
 * A rate entry for the history, as typed. Desktop refuses a negative price and
 * accepts zero (maincurrencydialog.cpp); empty or non-numeric is a refusal too.
 */
export const parseRateEntry = (input: unknown): number | null => {
  if (input === null || input === undefined) return null
  const text = String(input).trim()
  if (text === '') return null
  const value = Number(text)
  return Number.isFinite(value) && value >= 0 ? value : null
}
