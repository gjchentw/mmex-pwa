import { db, type SqlStatement } from '../db'
import type { InfoRecord, ReportRecord, SettingRecord, UsageRecord } from '../records'
import {
  DEFAULTS,
  INFO_KEY,
  SETTING_KEY,
  parseBooleanValue,
  parseIntegerValue,
  parseSettingBoolean,
  retentionDays,
} from '../rules/metadata'
import { parseDefaultCategoryMode, type DefaultCategoryMode } from '../rules/taxonomy'

/**
 * The two key-value stores (openspec: file-metadata-and-settings). Writes are
 * keyed by name -- never by the integer id, because the vendored DDL seeds
 * DATAVERSION at INFOID 1 and addressing rows by id would overwrite it.
 */

const upsertInfoStatement = (name: string, value: string): SqlStatement => ({
  sql: `INSERT INTO INFOTABLE_V1 (INFONAME, INFOVALUE) VALUES (?, ?)
        ON CONFLICT(INFONAME) DO UPDATE SET INFOVALUE = excluded.INFOVALUE`,
  bind: [name, value],
})

const upsertSettingStatement = (name: string, value: string): SqlStatement => ({
  sql: `INSERT INTO SETTING_V1 (SETTINGNAME, SETTINGVALUE) VALUES (?, ?)
        ON CONFLICT(SETTINGNAME) DO UPDATE SET SETTINGVALUE = excluded.SETTINGVALUE`,
  bind: [name, value],
})

export const infoRepo = {
  async all(): Promise<InfoRecord[]> {
    return db.query<InfoRecord>('SELECT * FROM INFOTABLE_V1 ORDER BY INFOID')
  },

  async get(name: string): Promise<string | null> {
    const rows = await db.query<Pick<InfoRecord, 'INFOVALUE'>>(
      'SELECT INFOVALUE FROM INFOTABLE_V1 WHERE INFONAME = ?',
      [name],
    )
    return rows[0]?.INFOVALUE ?? null
  },

  setStatement: upsertInfoStatement,

  async set(name: string, value: string): Promise<void> {
    await db.mutate([upsertInfoStatement(name, value)])
  },

  /** Writes several file facts in one transaction, leaving other keys untouched. */
  async setMany(entries: Record<string, string>): Promise<void> {
    const statements = Object.entries(entries).map(([name, value]) =>
      upsertInfoStatement(name, value),
    )
    await db.mutate(statements)
  },
}

export const settingRepo = {
  async all(): Promise<SettingRecord[]> {
    return db.query<SettingRecord>('SELECT * FROM SETTING_V1 ORDER BY SETTINGID')
  },

  async get(name: string): Promise<string | null> {
    const rows = await db.query<Pick<SettingRecord, 'SETTINGVALUE'>>(
      'SELECT SETTINGVALUE FROM SETTING_V1 WHERE SETTINGNAME = ?',
      [name],
    )
    return rows[0]?.SETTINGVALUE ?? null
  },

  setStatement: upsertSettingStatement,

  async set(name: string, value: string): Promise<void> {
    await db.mutate([upsertSettingStatement(name, value)])
  },
}

/** The file facts other capabilities consume, resolved with upstream defaults. */
export const fileFacts = {
  async baseCurrencyId(): Promise<number> {
    return parseIntegerValue(await infoRepo.get(INFO_KEY.baseCurrencyId), -1)
  },

  /** An absent key reads as on, as desktop reads it. */
  async useCurrencyHistory(): Promise<boolean> {
    return parseBooleanValue(
      await infoRepo.get(INFO_KEY.useCurrencyHistory),
      DEFAULTS.useCurrencyHistory,
    )
  },

  /** An absent key reads as "show all", as desktop reads it. */
  async showHiddenCurrencies(): Promise<boolean> {
    return parseBooleanValue(
      await infoRepo.get(INFO_KEY.showHiddenCurrencies),
      DEFAULTS.showHiddenCurrencies,
    )
  },

  /** Desktop's Category Manager shows hidden categories unless the box was unticked. */
  async showHiddenCategories(): Promise<boolean> {
    return parseSettingBoolean(
      await settingRepo.get(SETTING_KEY.showHiddenCategories),
      DEFAULTS.showHiddenCategories,
    )
  },

  /** Desktop's Payee Manager shows hidden payees unless the box was unticked. */
  async showHiddenPayees(): Promise<boolean> {
    return parseSettingBoolean(
      await settingRepo.get(SETTING_KEY.showHiddenPayees),
      DEFAULTS.showHiddenPayees,
    )
  },

  /** Desktop's default-category mode for payees; an absent key reads as Last used. */
  async defaultCategoryMode(): Promise<DefaultCategoryMode> {
    return parseDefaultCategoryMode(await settingRepo.get(SETTING_KEY.transactionCategoryNone))
  },

  /**
   * The separator for category paths. Desktop falls back to a colon when the key
   * is absent; an empty value would join paths with nothing, so it falls back too.
   */
  async categoryDelimiter(): Promise<string> {
    const stored = await infoRepo.get(INFO_KEY.categoryDelimiter)
    return stored === null || stored === '' ? DEFAULTS.categoryDelimiter : stored
  },

  async sharePrecision(): Promise<number> {
    return parseIntegerValue(await infoRepo.get(INFO_KEY.sharePrecision), DEFAULTS.sharePrecision)
  },

  async dataVersion(): Promise<string> {
    return (await infoRepo.get(INFO_KEY.dataVersion)) ?? DEFAULTS.dataVersion
  },

  async deletedTransactionRetainDays(): Promise<number> {
    return retentionDays(await settingRepo.get(SETTING_KEY.deletedTransactionRetainDays))
  },

  async budgetOverlayOptions(): Promise<{ deductMonthlyFromYear: boolean; override: boolean }> {
    const [deduct, override] = await Promise.all([
      settingRepo.get(SETTING_KEY.budgetDeductMonthlyFromYear),
      settingRepo.get(SETTING_KEY.budgetOverride),
    ])
    return {
      deductMonthlyFromYear: parseBooleanValue(deduct, false),
      override: parseBooleanValue(override, false),
    }
  },
}

/**
 * Report definitions are preserved and never executed; their SQL, Lua and
 * template content is custody data only.
 */
export const reportCustodyRepo = {
  async all(): Promise<ReportRecord[]> {
    return db.query<ReportRecord>('SELECT * FROM REPORT_V1 ORDER BY REPORTID')
  },
}

/** Telemetry rows are read-only here: the application never appends to them. */
export const usageCustodyRepo = {
  async all(): Promise<UsageRecord[]> {
    return db.query<UsageRecord>('SELECT * FROM USAGE_V1 ORDER BY USAGEID')
  },
}
