import { enumCodec } from '../conventions'
import type { BudgetRecord, BudgetYearRecord } from '../records'

/**
 * Pure budgeting rules (openspec: budget-management). Note that
 * BUDGETSPLITTRANSACTIONS_V1 is *not* budget data despite its name -- it belongs
 * to scheduled transactions.
 */

/**
 * Period strings as persisted. Authority is Model_Budget.cpp PERIOD_CHOICES; the
 * DDL comment's "Bi-Weekly"/"Bi-Monthly" spellings are stale.
 */
export const BUDGET_PERIODS = [
  'None',
  'Weekly',
  'Fortnightly',
  'Monthly',
  'Every 2 Months',
  'Quarterly',
  'Half-Yearly',
  'Yearly',
  'Daily',
] as const
export type BudgetPeriod = (typeof BUDGET_PERIODS)[number]

/** An unrecognized stored period reads as None, matching upstream's fallback. */
export const budgetPeriodCodec = enumCodec(BUDGET_PERIODS, 'None')

/** Occurrences per year for each period. */
export const ANNUAL_FACTOR: Record<BudgetPeriod, number> = {
  None: 0,
  Weekly: 52,
  Fortnightly: 26,
  Monthly: 12,
  'Every 2 Months': 6,
  Quarterly: 4,
  'Half-Yearly': 2,
  Yearly: 1,
  Daily: 365,
}

/** Yearly estimate, or the monthly twelfth of it. */
export const estimate = (period: BudgetPeriod, amount: number, monthly = false): number => {
  const yearly = amount * ANNUAL_FACTOR[period]
  return monthly ? yearly / 12 : yearly
}

export const yearlyEstimate = (entry: Pick<BudgetRecord, 'PERIOD' | 'AMOUNT'>): number =>
  estimate(budgetPeriodCodec.decode(entry.PERIOD), entry.AMOUNT, false)

export const monthlyEstimate = (entry: Pick<BudgetRecord, 'PERIOD' | 'AMOUNT'>): number =>
  estimate(budgetPeriodCodec.decode(entry.PERIOD), entry.AMOUNT, true)

/**
 * The name's form distinguishes the two kinds of budget period: a four-character
 * name is a year, anything longer is a month. This is load-bearing upstream.
 */
export const isYearlyPeriodName = (name: string): boolean => name.trim().length === 4

export const isMonthlyPeriodName = (name: string): boolean => name.trim().length > 4

export const yearlyPeriodName = (year: number): string => String(year)

export const monthlyPeriodName = (year: number, monthIndex: number): string =>
  `${year}-${String(monthIndex + 1).padStart(2, '0')}`

export const findPeriod = (
  periods: readonly BudgetYearRecord[],
  name: string,
): BudgetYearRecord | undefined => periods.find((period) => period.BUDGETYEARNAME === name)

export interface OverlayOptions {
  /** Subtract explicit monthly budgets from the yearly figure. */
  deductMonthlyFromYear: boolean
  /** Spread the remainder over unbudgeted months only. */
  override: boolean
}

/** Per-category monthly figures (index 0-11) plus the yearly total at index 12. */
export type BudgetStats = Map<number, number[]>

export const YEAR_TOTAL_INDEX = 12

/**
 * Combines the yearly budget with any monthly budgets for the same year.
 *
 * Mirrors Model_Budget::getBudgetStats. Monthly budgets are laid down first and
 * accumulated into a per-category deduction; then, month by month, the yearly
 * budget is folded in according to the two options. A category whose monthly
 * budgets already meet or exceed its yearly figure receives no yearly addition.
 */
export const buildBudgetStats = (
  yearlyEntries: readonly BudgetRecord[],
  monthlyEntriesByMonth: readonly (readonly BudgetRecord[])[],
  options: OverlayOptions,
): BudgetStats => {
  const stats: BudgetStats = new Map()
  const monthlyValue = new Map<number, number>()
  const yearlyValue = new Map<number, number>()
  const yearDeduction = new Map<number, number>()
  const budgetedMonths = new Map<number, number>()
  const isBudgeted = new Set<string>()

  const rowFor = (categoryId: number): number[] => {
    let row = stats.get(categoryId)
    if (!row) {
      row = new Array<number>(13).fill(0)
      stats.set(categoryId, row)
    }
    return row
  }

  for (const entry of yearlyEntries) {
    monthlyValue.set(entry.CATEGID, monthlyEstimate(entry))
    yearlyValue.set(entry.CATEGID, yearlyEstimate(entry))
    rowFor(entry.CATEGID)[YEAR_TOTAL_INDEX] = yearlyEstimate(entry)
  }

  for (let month = 0; month < 12; month += 1) {
    for (const entry of monthlyEntriesByMonth[month] ?? []) {
      const key = `${month}:${entry.CATEGID}`
      if (!isBudgeted.has(key)) {
        isBudgeted.add(key)
        budgetedMonths.set(entry.CATEGID, (budgetedMonths.get(entry.CATEGID) ?? 0) + 1)
      }
      const value = monthlyEstimate(entry)
      rowFor(entry.CATEGID)[month] = value
      yearDeduction.set(entry.CATEGID, (yearDeduction.get(entry.CATEGID) ?? 0) + value)
    }
  }

  for (let month = 0; month < 12; month += 1) {
    if (options.deductMonthlyFromYear) {
      for (const [categoryId, yearly] of yearlyValue) {
        const deducted = yearDeduction.get(categoryId) ?? 0
        // Monthly budgets already covering the yearly figure leave nothing to spread.
        if (deducted / yearly >= 1) continue
        const adjusted = yearly - deducted
        const row = rowFor(categoryId)
        if (!options.override) {
          row[month] = (row[month] ?? 0) + adjusted / 12
        } else if (!isBudgeted.has(`${month}:${categoryId}`)) {
          row[month] = adjusted / (12 - (budgetedMonths.get(categoryId) ?? 0))
        }
      }
    } else {
      for (const [categoryId, monthly] of monthlyValue) {
        const row = rowFor(categoryId)
        if (!options.override) {
          row[month] = (row[month] ?? 0) + monthly
        } else if (!isBudgeted.has(`${month}:${categoryId}`)) {
          row[month] = monthly
        }
      }
    }
  }

  return stats
}

/** Collapses monthly figures to one total per category. */
export const collapseToYear = (stats: BudgetStats): Map<number, number> => {
  const totals = new Map<number, number>()
  for (const [categoryId, row] of stats) {
    let sum = 0
    for (let month = 0; month < 12; month += 1) sum += row[month] ?? 0
    totals.set(categoryId, sum)
  }
  return totals
}

/**
 * Entries for a new period cloned from an existing one. When a monthly budget is
 * derived from a yearly one under the deduct option, each line becomes Monthly
 * carrying the yearly remainder spread over the months without a budget.
 */
export const copyEntries = (
  source: readonly BudgetRecord[],
  targetPeriodId: number,
  options: { toMonthly: boolean; deductMonthlyFromYear: boolean; budgetedMonths?: number } = {
    toMonthly: false,
    deductMonthlyFromYear: false,
  },
): Omit<BudgetRecord, 'BUDGETENTRYID'>[] =>
  source.map((entry) => {
    if (!options.toMonthly || !options.deductMonthlyFromYear) {
      return {
        BUDGETYEARID: targetPeriodId,
        CATEGID: entry.CATEGID,
        PERIOD: entry.PERIOD,
        AMOUNT: entry.AMOUNT,
        NOTES: entry.NOTES,
        ACTIVE: entry.ACTIVE,
      }
    }
    const budgeted = options.budgetedMonths ?? 0
    const remainingMonths = Math.max(1, 12 - budgeted)
    return {
      BUDGETYEARID: targetPeriodId,
      CATEGID: entry.CATEGID,
      PERIOD: 'Monthly',
      AMOUNT: yearlyEstimate(entry) / remainingMonths,
      NOTES: entry.NOTES,
      ACTIVE: entry.ACTIVE,
    }
  })
