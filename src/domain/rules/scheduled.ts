import { formatIsoTimestamp, isoDatePart, parseIsoDateTime } from '../conventions'
import type { ScheduledRecord } from '../records'

/**
 * Pure scheduled-series rules (openspec: scheduled-transactions). The repeat
 * configuration is multiplexed into a single integer, and executing or skipping
 * an occurrence mutates the series -- these operations are not idempotent.
 */

/** REPEATS = autoExecute * 100 + repeatType (Model_Billsdeposits.h). */
export const REPEAT_MULTIPLEX_BASE = 100

export const REPEAT_TYPE = {
  once: 0,
  weekly: 1,
  fortnightly: 2,
  monthly: 3,
  everyTwoMonths: 4,
  quarterly: 5,
  halfYearly: 6,
  yearly: 7,
  fourMonths: 8,
  fourWeeks: 9,
  daily: 10,
  inXDays: 11,
  inXMonths: 12,
  everyXDays: 13,
  everyXMonths: 14,
  monthlyLastDay: 15,
  monthlyLastBusinessDay: 16,
} as const

export type RepeatType = (typeof REPEAT_TYPE)[keyof typeof REPEAT_TYPE]

/** Labels mirror the desktop dialog; they are display-only. */
export const REPEAT_TYPE_LABEL: Record<number, string> = {
  0: 'Once',
  1: 'Weekly',
  2: 'Fortnightly',
  3: 'Monthly',
  4: 'Every 2 Months',
  5: 'Quarterly',
  6: 'Half-Yearly',
  7: 'Yearly',
  8: 'Four Months',
  9: 'Four Weeks',
  10: 'Daily',
  11: 'In (n) Days',
  12: 'In (n) Months',
  13: 'Every (n) Days',
  14: 'Every (n) Months',
  15: 'Monthly (last day)',
  16: 'Monthly (last business day)',
}

export const AUTO_EXECUTE = {
  none: 0,
  /** Prompt the user to enter the payment. */
  prompt: 1,
  /** Execute without interaction. */
  silent: 2,
} as const

export type AutoExecuteMode = (typeof AUTO_EXECUTE)[keyof typeof AUTO_EXECUTE]

export const REPEAT_COUNT = {
  infinite: -1,
  unknown: 0,
} as const

export interface RepeatConfig {
  repeatType: number
  autoExecute: number
}

export const decodeRepeats = (repeats: number | null | undefined): RepeatConfig => {
  const value = repeats ?? 0
  return {
    repeatType: value % REPEAT_MULTIPLEX_BASE,
    autoExecute: Math.trunc(value / REPEAT_MULTIPLEX_BASE),
  }
}

export const encodeRepeats = (config: RepeatConfig): number =>
  config.autoExecute * REPEAT_MULTIPLEX_BASE + config.repeatType

/** Types 11-14 read their (n) parameter from NUMOCCURRENCES. */
export const usesCountParameter = (repeatType: number): boolean =>
  repeatType >= REPEAT_TYPE.inXDays && repeatType <= REPEAT_TYPE.everyXMonths

/**
 * A series of type 11-14 whose count is not positive is a legacy inactive entry:
 * it must not execute, and its auto-execute mode is treated as none.
 */
export const isLegacyInactive = (
  series: Pick<ScheduledRecord, 'REPEATS' | 'NUMOCCURRENCES'>,
): boolean => {
  const { repeatType } = decodeRepeats(series.REPEATS)
  return usesCountParameter(repeatType) && (series.NUMOCCURRENCES ?? 0) < 1
}

export const effectiveAutoExecute = (
  series: Pick<ScheduledRecord, 'REPEATS' | 'NUMOCCURRENCES'>,
): number =>
  isLegacyInactive(series) ? AUTO_EXECUTE.none : decodeRepeats(series.REPEATS).autoExecute

const lastDayOfMonth = (date: Date): Date =>
  new Date(
    date.getFullYear(),
    date.getMonth() + 1,
    0,
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
  )

const addMonths = (date: Date, months: number): Date => {
  const result = new Date(date.getTime())
  result.setMonth(result.getMonth() + months)
  return result
}

const addDays = (date: Date, days: number): Date => {
  const result = new Date(date.getTime())
  result.setDate(result.getDate() + days)
  return result
}

/**
 * The next occurrence date for a series.
 *
 * Mirrors Model_Billsdeposits::nextOccurDate, including the two month-end
 * types: advance a month, snap to the last day, and for the business-day
 * variant step back to Friday when that lands on a weekend.
 */
export const nextOccurrenceDate = (
  repeatType: number,
  count: number,
  from: Date,
  reverse = false,
): Date => {
  const step = reverse ? -1 : 1
  const n = count || 0

  switch (repeatType) {
    case REPEAT_TYPE.weekly:
      return addDays(from, 7 * step)
    case REPEAT_TYPE.fortnightly:
      return addDays(from, 14 * step)
    case REPEAT_TYPE.fourWeeks:
      return addDays(from, 28 * step)
    case REPEAT_TYPE.daily:
      return addDays(from, step)
    case REPEAT_TYPE.monthly:
      return addMonths(from, step)
    case REPEAT_TYPE.everyTwoMonths:
      return addMonths(from, 2 * step)
    case REPEAT_TYPE.quarterly:
      return addMonths(from, 3 * step)
    case REPEAT_TYPE.fourMonths:
      return addMonths(from, 4 * step)
    case REPEAT_TYPE.halfYearly:
      return addMonths(from, 6 * step)
    case REPEAT_TYPE.yearly:
      return addMonths(from, 12 * step)
    case REPEAT_TYPE.inXDays:
    case REPEAT_TYPE.everyXDays:
      return addDays(from, n * step)
    case REPEAT_TYPE.inXMonths:
    case REPEAT_TYPE.everyXMonths:
      return addMonths(from, n * step)
    case REPEAT_TYPE.monthlyLastDay:
    case REPEAT_TYPE.monthlyLastBusinessDay: {
      const advanced = lastDayOfMonth(addMonths(from, step))
      if (repeatType === REPEAT_TYPE.monthlyLastBusinessDay) {
        const weekday = advanced.getDay()
        if (weekday === 0) return addDays(advanced, -2)
        if (weekday === 6) return addDays(advanced, -1)
      }
      return advanced
    }
    default:
      // REPEAT_ONCE and anything unrecognized do not advance.
      return new Date(from.getTime())
  }
}

/** Due when the due date is less than a day away. */
export const isDue = (series: Pick<ScheduledRecord, 'NEXTOCCURRENCEDATE'>, now: Date): boolean => {
  const due = parseIsoDateTime(series.NEXTOCCURRENCEDATE)
  if (!due) return false
  return due.getTime() - now.getTime() < 86_400_000
}

export interface AdvancedSeries {
  /** Null when the series is exhausted and must be deleted with its splits. */
  series: ScheduledRecord | null
  exhausted: boolean
}

/**
 * Advances a series by one occurrence, as executing or skipping does.
 *
 * Mirrors Model_Billsdeposits::completeBDInSeries: a Once series and a countable
 * series on its last payment are exhausted; the in-(n) types convert to Once
 * while keeping their auto-execute mode; otherwise both dates move forward and a
 * positive count above one is decremented.
 */
export const advanceSeries = (series: ScheduledRecord): AdvancedSeries => {
  const { repeatType, autoExecute } = decodeRepeats(series.REPEATS)
  const count = series.NUMOCCURRENCES ?? REPEAT_COUNT.unknown

  const exhausted =
    repeatType === REPEAT_TYPE.once || (!usesCountParameter(repeatType) && count === 1)
  if (exhausted) return { series: null, exhausted: true }

  const advanced: ScheduledRecord = { ...series }
  const dueDate = parseIsoDateTime(series.NEXTOCCURRENCEDATE)
  const paidDate = parseIsoDateTime(series.TRANSDATE)
  if (dueDate) {
    advanced.NEXTOCCURRENCEDATE = formatIsoTimestamp(nextOccurrenceDate(repeatType, count, dueDate))
  }
  if (paidDate) {
    advanced.TRANSDATE = formatIsoTimestamp(nextOccurrenceDate(repeatType, count, paidDate))
  }

  if (repeatType === REPEAT_TYPE.inXDays || repeatType === REPEAT_TYPE.inXMonths) {
    // A one-shot delay becomes an ordinary Once series once it has fired.
    advanced.REPEATS = encodeRepeats({ repeatType: REPEAT_TYPE.once, autoExecute })
    advanced.NUMOCCURRENCES = REPEAT_COUNT.infinite
  } else if (count > 1) {
    advanced.NUMOCCURRENCES = count - 1
  }

  return { series: advanced, exhausted: false }
}

export interface ProjectedOccurrence {
  bdid: number
  /** 1-based index of this projection; real ledger rows are index 0. */
  repeatNumber: number
  date: string
}

/**
 * Projects a series' upcoming occurrences without persisting anything. The
 * horizon is bounded so an infinite series cannot produce unbounded work.
 */
export const projectOccurrences = (
  series: Pick<ScheduledRecord, 'BDID' | 'REPEATS' | 'NUMOCCURRENCES' | 'NEXTOCCURRENCEDATE'>,
  horizon: { untilDate: string; maxOccurrences?: number },
): ProjectedOccurrence[] => {
  const limit = Math.max(0, horizon.maxOccurrences ?? 120)
  const { repeatType } = decodeRepeats(series.REPEATS)
  const occurrences: ProjectedOccurrence[] = []

  let cursor = parseIsoDateTime(series.NEXTOCCURRENCEDATE)
  if (!cursor) return occurrences
  let remaining = series.NUMOCCURRENCES ?? REPEAT_COUNT.unknown
  let index = 0

  while (
    index < limit &&
    isoDatePart(formatIsoTimestamp(cursor)) <= isoDatePart(horizon.untilDate)
  ) {
    index += 1
    occurrences.push({
      bdid: series.BDID,
      repeatNumber: index,
      date: formatIsoTimestamp(cursor),
    })
    if (repeatType === REPEAT_TYPE.once) break
    if (remaining > 0) {
      remaining -= 1
      if (remaining === 0) break
    }
    const advanced = nextOccurrenceDate(repeatType, series.NUMOCCURRENCES ?? 0, cursor)
    if (advanced.getTime() <= cursor.getTime()) break
    cursor = advanced
  }

  return occurrences
}
