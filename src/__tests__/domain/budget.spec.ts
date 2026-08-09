import { describe, it, expect } from 'vitest'
import type { BudgetRecord } from '../../domain/records'
import {
  ANNUAL_FACTOR,
  BUDGET_PERIODS,
  YEAR_TOTAL_INDEX,
  budgetPeriodCodec,
  buildBudgetStats,
  collapseToYear,
  isMonthlyPeriodName,
  isYearlyPeriodName,
  monthlyEstimate,
  yearlyEstimate,
} from '../../domain/rules/budget'

const entry = (overrides: Partial<BudgetRecord> = {}): BudgetRecord => ({
  BUDGETENTRYID: 1,
  BUDGETYEARID: 1,
  CATEGID: 7,
  PERIOD: 'Monthly',
  AMOUNT: 100,
  NOTES: null,
  ACTIVE: 1,
  ...overrides,
})

const noMonthlyBudgets = Array.from({ length: 12 }, () => [] as BudgetRecord[])

// Spec: budget-management.
describe('budget rules', () => {
  // Requirement "Budget Entry Periods and Annualization". The persisted strings
  // come from the C++ period table, not the DDL comment.
  describe('periods', () => {
    it('persists the upstream period strings', () => {
      expect(BUDGET_PERIODS).toContain('Fortnightly')
      expect(BUDGET_PERIODS).toContain('Every 2 Months')
      expect(BUDGET_PERIODS).not.toContain('Bi-Weekly')
      expect(BUDGET_PERIODS).not.toContain('Bi-Monthly')
    })

    it('falls back to None for an unrecognized stored period', () => {
      expect(budgetPeriodCodec.decode('Bi-Weekly')).toBe('None')
      expect(budgetPeriodCodec.decode('Weekly')).toBe('Weekly')
    })

    // Scenario "Weekly entry annualizes by 52".
    it('annualizes by the fixed factors', () => {
      expect(ANNUAL_FACTOR.Weekly).toBe(52)
      expect(ANNUAL_FACTOR.Fortnightly).toBe(26)
      expect(ANNUAL_FACTOR.Daily).toBe(365)
      expect(ANNUAL_FACTOR.None).toBe(0)
      expect(yearlyEstimate(entry({ PERIOD: 'Weekly', AMOUNT: 10 }))).toBe(520)
      expect(monthlyEstimate(entry({ PERIOD: 'Weekly', AMOUNT: 10 }))).toBeCloseTo(520 / 12, 10)
    })
  })

  // Requirement "Budget Period Naming", scenario "Name form determines period kind".
  describe('period naming', () => {
    it('distinguishes a year from a month by name length', () => {
      expect(isYearlyPeriodName('2025')).toBe(true)
      expect(isMonthlyPeriodName('2025')).toBe(false)
      expect(isMonthlyPeriodName('2024-11')).toBe(true)
      expect(isYearlyPeriodName('2024-11')).toBe(false)
    })
  })

  // Requirement "Yearly and Monthly Overlay Computation".
  describe('overlay', () => {
    const yearly = [entry({ PERIOD: 'Yearly', AMOUNT: 1200 })]

    it('spreads a yearly budget across every month when nothing else applies', () => {
      const stats = buildBudgetStats(yearly, noMonthlyBudgets, {
        deductMonthlyFromYear: false,
        override: false,
      })
      const row = stats.get(7)!
      expect(row[YEAR_TOTAL_INDEX]).toBe(1200)
      expect(row[0]).toBe(100)
      expect(row[11]).toBe(100)
    })

    // Scenario "Monthly budget overrides its month".
    it('deducts monthly budgets and spreads the remainder over unbudgeted months', () => {
      const monthly = noMonthlyBudgets.map((_, month) =>
        month === 2 ? [entry({ PERIOD: 'Monthly', AMOUNT: 300 })] : [],
      )
      const stats = buildBudgetStats(yearly, monthly, {
        deductMonthlyFromYear: true,
        override: true,
      })
      const row = stats.get(7)!
      // March keeps its explicit figure.
      expect(row[2]).toBe(300)
      // The remaining 900 spreads over the other eleven months.
      expect(row[0]).toBeCloseTo(900 / 11, 10)
      expect(row[11]).toBeCloseTo(900 / 11, 10)
    })

    it('spreads the remainder over all twelve months when override is off', () => {
      const monthly = noMonthlyBudgets.map((_, month) =>
        month === 2 ? [entry({ PERIOD: 'Monthly', AMOUNT: 300 })] : [],
      )
      const stats = buildBudgetStats(yearly, monthly, {
        deductMonthlyFromYear: true,
        override: false,
      })
      const row = stats.get(7)!
      expect(row[0]).toBeCloseTo(900 / 12, 10)
      // March keeps its own amount on top of the shared remainder.
      expect(row[2]).toBeCloseTo(300 + 900 / 12, 10)
    })

    it('adds the yearly twelfth on top of monthly budgets when not deducting', () => {
      const monthly = noMonthlyBudgets.map((_, month) =>
        month === 2 ? [entry({ PERIOD: 'Monthly', AMOUNT: 300 })] : [],
      )
      const stats = buildBudgetStats(yearly, monthly, {
        deductMonthlyFromYear: false,
        override: false,
      })
      const row = stats.get(7)!
      expect(row[0]).toBe(100)
      expect(row[2]).toBe(400)
    })

    it('adds nothing yearly once monthly budgets already cover the year', () => {
      const monthly = noMonthlyBudgets.map(() => [entry({ PERIOD: 'Monthly', AMOUNT: 200 })])
      const stats = buildBudgetStats(yearly, monthly, {
        deductMonthlyFromYear: true,
        override: false,
      })
      const row = stats.get(7)!
      expect(row[0]).toBe(200)
    })

    it('collapses the monthly figures to one total per category', () => {
      const stats = buildBudgetStats(yearly, noMonthlyBudgets, {
        deductMonthlyFromYear: false,
        override: false,
      })
      expect(collapseToYear(stats).get(7)).toBeCloseTo(1200, 10)
    })
  })
})
