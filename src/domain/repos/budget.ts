import { db, insertStatement, type SqlStatement } from '../db'
import type { BudgetRecord, BudgetYearRecord } from '../records'
import { effectiveCategoryIds } from '../rules/ledger'
import {
  buildBudgetStats,
  copyEntries,
  monthlyPeriodName,
  yearlyPeriodName,
  type BudgetStats,
} from '../rules/budget'
import { ledgerRepo } from './ledger'
import { fileFacts } from './metadata'

/** Budget periods and entries (openspec: budget-management). */

export const budgetPeriodRepo = {
  async all(): Promise<BudgetYearRecord[]> {
    return db.query<BudgetYearRecord>('SELECT * FROM BUDGETYEAR_V1 ORDER BY BUDGETYEARNAME')
  },

  async findByName(name: string): Promise<BudgetYearRecord | null> {
    const rows = await db.query<BudgetYearRecord>(
      'SELECT * FROM BUDGETYEAR_V1 WHERE BUDGETYEARNAME = ? COLLATE NOCASE',
      [name],
    )
    return rows[0] ?? null
  },

  addStatement(name: string): SqlStatement {
    return insertStatement('BUDGETYEAR_V1', { BUDGETYEARNAME: name })
  },

  /** Removing a period takes its entries with it. */
  async remove(periodId: number): Promise<void> {
    await db.mutate([
      { sql: 'DELETE FROM BUDGETTABLE_V1 WHERE BUDGETYEARID = ?', bind: [periodId] },
      { sql: 'DELETE FROM BUDGETYEAR_V1 WHERE BUDGETYEARID = ?', bind: [periodId] },
    ])
  },
}

export const budgetRepo = {
  async entriesFor(periodId: number): Promise<BudgetRecord[]> {
    return db.query<BudgetRecord>('SELECT * FROM BUDGETTABLE_V1 WHERE BUDGETYEARID = ?', [periodId])
  },

  upsertStatement(values: Omit<BudgetRecord, 'BUDGETENTRYID'>): SqlStatement {
    return insertStatement('BUDGETTABLE_V1', { ...values })
  },

  /**
   * The combined yearly and monthly figures for a calendar year, honoring the
   * two overlay options recorded in the settings store.
   */
  async statsForYear(year: number): Promise<BudgetStats> {
    const options = await fileFacts.budgetOverlayOptions()
    const yearlyPeriod = await budgetPeriodRepo.findByName(yearlyPeriodName(year))
    const yearlyEntries = yearlyPeriod ? await this.entriesFor(yearlyPeriod.BUDGETYEARID) : []

    const monthlyEntriesByMonth: BudgetRecord[][] = []
    for (let month = 0; month < 12; month += 1) {
      const period = await budgetPeriodRepo.findByName(monthlyPeriodName(year, month))
      monthlyEntriesByMonth.push(period ? await this.entriesFor(period.BUDGETYEARID) : [])
    }

    return buildBudgetStats(yearlyEntries, monthlyEntriesByMonth, options)
  },

  /**
   * Actual spending per category for a date range, joined by category alone --
   * there is no stored relationship between budgets and transactions. Void and
   * soft-deleted rows are excluded by the ledger query itself.
   */
  async actualsByCategory(fromDate: string, toDate: string): Promise<Map<number, number>> {
    const transactions = await ledgerRepo.list({ fromDate, toDate })
    const totals = new Map<number, number>()
    for (const transaction of transactions) {
      const splits = await ledgerRepo.splitsFor(transaction.TRANSID)
      const signed = transaction.TRANSCODE === 'Deposit' ? 1 : -1
      if (splits.length > 0) {
        for (const split of splits) {
          totals.set(
            split.CATEGID,
            (totals.get(split.CATEGID) ?? 0) + signed * split.SPLITTRANSAMOUNT,
          )
        }
        continue
      }
      for (const categoryId of effectiveCategoryIds(transaction, [])) {
        totals.set(categoryId, (totals.get(categoryId) ?? 0) + signed * transaction.TRANSAMOUNT)
      }
    }
    return totals
  },

  /** Clones a period's entries into another period. */
  async copyPeriod(
    sourcePeriodId: number,
    targetPeriodId: number,
    options: { toMonthly?: boolean; budgetedMonths?: number } = {},
  ): Promise<void> {
    const { deductMonthlyFromYear } = await fileFacts.budgetOverlayOptions()
    const source = await this.entriesFor(sourcePeriodId)
    const cloned = copyEntries(source, targetPeriodId, {
      toMonthly: options.toMonthly ?? false,
      deductMonthlyFromYear,
      budgetedMonths: options.budgetedMonths,
    })
    await db.mutate(cloned.map((entry) => this.upsertStatement(entry)))
  },
}
