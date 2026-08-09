/**
 * Pure rules for the two key-value stores (openspec: file-metadata-and-settings).
 * Placement is the load-bearing rule: facts about the data file live in
 * INFOTABLE_V1, application/user preferences in SETTING_V1, and neither key nor
 * store may migrate between them.
 */

/** Well-known INFOTABLE_V1 keys this build understands. Unknown keys are preserved. */
export const INFO_KEY = {
  dataVersion: 'DATAVERSION',
  baseCurrencyId: 'BASECURRENCYID',
  useCurrencyHistory: 'USECURRENCYHISTORY',
  dateFormat: 'DATEFORMAT',
  userName: 'USERNAME',
  sharePrecision: 'SHARE_PRECISION',
  assetCompounding: 'ASSET_COMPOUNDING',
  financialYearStartDay: 'FINANCIAL_YEAR_START_DAY',
  financialYearStartMonth: 'FINANCIAL_YEAR_START_MONTH',
  budgetDaysOffset: 'BUDGET_DAYS_OFFSET',
} as const

/** Well-known SETTING_V1 keys this build understands. Unknown keys are preserved. */
export const SETTING_KEY = {
  deletedTransactionRetainDays: 'DELETED_TRANS_RETAIN_DAYS',
  budgetDeductMonthlyFromYear: 'BUDGET_DEDUCT_MONTH_FROM_YEAR',
  budgetOverride: 'BUDGET_OVERRIDE',
} as const

/** Upstream defaults for the keys whose absence has a defined meaning. */
export const DEFAULTS = {
  dataVersion: '3',
  deletedTransactionRetainDays: 30,
  sharePrecision: 4,
  assetCompounding: 'Day',
} as const

export type KeyValueStore = 'infotable' | 'setting'

/**
 * Where a key belongs. Anything describing this database file is a file fact;
 * anything describing how the application behaves or looks is a preference.
 */
export const storeForKey = (key: string): KeyValueStore =>
  (Object.values(INFO_KEY) as string[]).includes(key) ? 'infotable' : 'setting'

const truthy = new Set(['1', 'true', 'yes', 'y'])

export const parseBooleanValue = (value: string | null | undefined, fallback = false): boolean => {
  if (value === null || value === undefined || value === '') return fallback
  return truthy.has(value.trim().toLocaleLowerCase())
}

export const parseIntegerValue = (value: string | null | undefined, fallback: number): number => {
  if (value === null || value === undefined || value === '') return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? fallback : parsed
}

/** Booleans persist as `1`/`0`, matching how upstream writes them. */
export const encodeBooleanValue = (value: boolean): string => (value ? '1' : '0')

/**
 * Trash retention in days. `0` means delete immediately without trash
 * (openspec: transaction-ledger, Soft Delete, Trash, and Retention).
 */
export const retentionDays = (stored: string | null | undefined): number => {
  const days = parseIntegerValue(stored, DEFAULTS.deletedTransactionRetainDays)
  return days < 0 ? DEFAULTS.deletedTransactionRetainDays : days
}
