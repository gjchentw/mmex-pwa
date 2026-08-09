/**
 * Cross-cutting rules every domain module inherits (openspec:
 * domain-data-conventions). Values here are the single source for anything the
 * schema persists; the upstream C++ model headers are the authority where the
 * DDL comments disagree with them.
 */

/**
 * Reference-type strings used by every polymorphic (REFTYPE, REFID) link.
 * Authority: mmex/moneymanagerex/src/model/Model.cpp REFTYPE_CHOICES. The DDL
 * comments are stale -- they read "Bank Account" / "Repeating Transaction" and
 * omit the split types.
 */
export const REFTYPE = {
  transaction: 'Transaction',
  stock: 'Stock',
  asset: 'Asset',
  bankAccount: 'BankAccount',
  recurringTransaction: 'RecurringTransaction',
  payee: 'Payee',
  transactionSplit: 'TransactionSplit',
  recurringTransactionSplit: 'RecurringTransactionSplit',
} as const

export type RefType = (typeof REFTYPE)[keyof typeof REFTYPE]

/** TRANSLINK_V1.LINKTYPE has its own two-value vocabulary. */
export const LINKTYPE = {
  asset: 'Asset',
  stock: 'Stock',
} as const

export type LinkType = (typeof LINKTYPE)[keyof typeof LINKTYPE]

/**
 * The universal "none" sentinel. A -1 reference is an intentional absence, not
 * a dangling row, and must never be reported as an integrity violation.
 */
export const NONE_ID = -1

export const isNone = (id: number | null | undefined): boolean =>
  id === null || id === undefined || id === NONE_ID

/** Price/rate history rows record how the value arrived. */
export const UPDATE_TYPE = {
  online: 1,
  manual: 2,
} as const

const pad = (value: number, width = 2): string => String(value).padStart(width, '0')

/** `YYYY-MM-DD` in local time -- calendar dates carry no timezone upstream. */
export const formatIsoDate = (date: Date): string =>
  `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

/** `YYYY-MM-DDTHH:MM:SS` in local time -- the form schema v20 normalized dates to. */
export const formatIsoTimestamp = (date: Date): string =>
  `${formatIsoDate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`

/**
 * `LASTUPDATEDTIME` and `DELETEDTIME` are stamped in UTC upstream
 * (Model_Checking.cpp: `wxDateTime::Now().ToUTC().FormatISOCombined()`).
 */
export const formatUtcTimestamp = (date: Date): string =>
  `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}` +
  `T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`

/**
 * Accepts both stored forms: the combined `YYYY-MM-DDTHH:MM:SS` written since
 * schema v20 and the bare `YYYY-MM-DD` still present in older files. Returns
 * null rather than an Invalid Date so callers can branch explicitly.
 */
export const parseIsoDateTime = (value: string | null | undefined): Date | null => {
  if (!value) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(value)
  if (!match) return null
  const [, year, month, day, hour, minute, second] = match
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour ?? 0),
    Number(minute ?? 0),
    Number(second ?? 0),
  )
}

/** The date part of either stored form, safe for lexicographic comparison. */
export const isoDatePart = (value: string | null | undefined): string => (value ?? '').slice(0, 10)

/** Whole days from `from` to `to`, ignoring the time of day. */
export const daysBetween = (from: Date, to: Date): number => {
  const startUtc = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())
  const endUtc = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate())
  return Math.round((endUtc - startUtc) / 86_400_000)
}

/**
 * Name uniqueness is case-insensitive throughout the schema (COLLATE NOCASE on
 * every user-facing name column), so lookups and duplicate checks must be too.
 */
export const namesEqual = (a: string | null | undefined, b: string | null | undefined): boolean =>
  (a ?? '').toLocaleLowerCase() === (b ?? '').toLocaleLowerCase()

/**
 * Builds a codec for an enumeration persisted as its English display string.
 * Reading tolerates unknown values by falling back, because files written by
 * other MMEX versions may carry values this build does not know.
 */
export const enumCodec = <T extends string>(values: readonly T[], fallback: T) => ({
  values,
  fallback,
  /** The value to persist -- never localized (openspec: Persisted Enumeration Discipline). */
  encode: (value: T): T => value,
  decode: (stored: string | null | undefined): T =>
    values.find((candidate) => namesEqual(candidate, stored ?? '')) ?? fallback,
  ordinal: (value: T): number => values.indexOf(value),
  fromOrdinal: (index: number): T => values[index] ?? fallback,
})
