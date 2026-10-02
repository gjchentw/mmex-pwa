import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const { MockWorker } = vi.hoisted(() => {
  class MockWorker {
    postMessage = vi.fn()
    addEventListener = vi.fn()
    removeEventListener = vi.fn()
    terminate = vi.fn()
  }
  return { MockWorker }
})

vi.mock('../../workers/sqlite.worker?worker', () => ({ default: MockWorker }))

import { setDomainDb, type DomainDb, type SqlStatement } from '../../domain/db'
import { currencyRepo } from '../../domain/repos/currency'
import { fileFacts } from '../../domain/repos/metadata'
import {
  DATE_FORMAT_MASKS,
  INFO_KEY,
  RETENTION_DAYS_MAX,
  SETTING_KEY,
  isDateFormatMask,
  isLocaleWrittenByThisApplication,
  languageToLocale,
  localeToLanguage,
  parseRetentionDays,
  renderDateMask,
  storeForKey,
} from '../../domain/rules/metadata'

/** Spec: file-metadata-and-settings (delta: desktop fidelity) and currency-management, Base Currency. */

describe('key placement', () => {
  // Requirement "Store Separation": the UI language is a preference, the
  // formatting locale a file fact.
  it('places LANGUAGE in the settings store and LOCALE in the info table', () => {
    expect(storeForKey('LANGUAGE')).toBe('setting')
    expect(storeForKey('LOCALE')).toBe('infotable')
  })

  // currency-management, Currency Management Surface: desktop keeps the Currency
  // Manager's "Show all" box in the file.
  it('places SHOW_HIDDEN_CURRENCIES in the info table', () => {
    expect(storeForKey('SHOW_HIDDEN_CURRENCIES')).toBe('infotable')
  })

  // transaction-taxonomy (delta: desktop fidelity), Show-Hidden Preferences and
  // the default-category mode are preferences (categdialog.cpp 133, option.cpp
  // 511); the category delimiter describes the file (Model_Category.cpp 145).
  it('places the taxonomy keys where desktop keeps them', () => {
    expect(SETTING_KEY.showHiddenCategories).toBe('SHOW_HIDDEN_CATEGS')
    expect(SETTING_KEY.showHiddenPayees).toBe('SHOW_HIDDEN_PAYEES')
    expect(SETTING_KEY.transactionCategoryNone).toBe('TRANSACTION_CATEGORY_NONE')
    expect(INFO_KEY.categoryDelimiter).toBe('CATEG_DELIMITER')
    expect(storeForKey('SHOW_HIDDEN_CATEGS')).toBe('setting')
    expect(storeForKey('SHOW_HIDDEN_PAYEES')).toBe('setting')
    expect(storeForKey('TRANSACTION_CATEGORY_NONE')).toBe('setting')
    expect(storeForKey('CATEG_DELIMITER')).toBe('infotable')
  })
})

describe('language mapping', () => {
  // Requirement "Active Locale Persistence": desktop's canonical names.
  it('maps each supported locale to desktop canonical form and back', () => {
    expect(localeToLanguage('en-US')).toBe('en_US')
    expect(localeToLanguage('zh-TW')).toBe('zh_TW')
    expect(languageToLocale('en_US')).toBe('en-US')
    expect(languageToLocale('zh_TW')).toBe('zh-TW')
  })

  it('treats an unknown name, and desktop numeric language ids, as unsupported', () => {
    expect(localeToLanguage('fr-FR')).toBeNull()
    expect(languageToLocale('fr_FR')).toBeNull()
    // Desktop may store the wxLanguage number instead of the canonical name.
    expect(languageToLocale('175')).toBeNull()
    expect(languageToLocale(null)).toBeNull()
    expect(languageToLocale('')).toBeNull()
  })

  // Only the earlier surface wrote these tags into LOCALE; desktop writes
  // std::locale names or leaves it blank.
  it('recognises only this application own locale tags in LOCALE', () => {
    expect(isLocaleWrittenByThisApplication('zh-TW')).toBe(true)
    expect(isLocaleWrittenByThisApplication('en-US')).toBe(true)
    expect(isLocaleWrittenByThisApplication('de_DE.UTF-8')).toBe(false)
    expect(isLocaleWrittenByThisApplication('')).toBe(false)
    expect(isLocaleWrittenByThisApplication(null)).toBe(false)
  })
})

describe('date-format masks', () => {
  // Requirement "Editing File Facts": the list desktop defines, exactly.
  it('carries the 36 masks desktop accepts', () => {
    expect(DATE_FORMAT_MASKS).toHaveLength(36)
    expect(DATE_FORMAT_MASKS).toContain('%d/%m/%Y')
    expect(DATE_FORMAT_MASKS).toContain('%Y-%m-%d')
    expect(DATE_FORMAT_MASKS).toContain("%w %d %Mon'%y")
  })

  it('rejects anything outside the list', () => {
    expect(isDateFormatMask('%Y-%m-%d')).toBe(true)
    expect(isDateFormatMask('YYYY-MM-DD')).toBe(false)
    expect(isDateFormatMask('')).toBe(false)
    expect(isDateFormatMask(null)).toBe(false)
  })

  // Risk R5: every token desktop uses renders.
  const date = new Date(2026, 2, 7) // Saturday, 7 March 2026
  it.each([
    ['%d', '07'],
    ['%m', '03'],
    ['%y', '26'],
    ['%Y', '2026'],
    ['%Mon', 'Mar'],
    ['%w', 'Sat'],
  ])('renders %s', (mask, expected) => {
    expect(renderDateMask(mask, date)).toBe(expected)
  })

  it('renders a mask mixing tokens and literal text', () => {
    expect(renderDateMask("%d %Mon'%y", date)).toBe("07 Mar'26")
    expect(renderDateMask('%Y%m%d', date)).toBe('20260307')
  })
})

describe('retention entry', () => {
  // Requirement "Editing Application Preferences": 0 through 999, whole days.
  it('accepts whole numbers within desktop range', () => {
    expect(parseRetentionDays('0')).toBe(0)
    expect(parseRetentionDays(30)).toBe(30)
    expect(parseRetentionDays(' 999 ')).toBe(999)
    expect(RETENTION_DAYS_MAX).toBe(999)
  })

  it('refuses empty, non-numeric, negative, fractional and out-of-range entries', () => {
    expect(parseRetentionDays('')).toBeNull()
    expect(parseRetentionDays('abc')).toBeNull()
    expect(parseRetentionDays('-1')).toBeNull()
    expect(parseRetentionDays('1.5')).toBeNull()
    expect(parseRetentionDays('1000')).toBeNull()
    expect(parseRetentionDays(null)).toBeNull()
    expect(parseRetentionDays(undefined)).toBeNull()
  })
})

/** A fake file for the repository-level rules below. */
const makeFakeDb = () => {
  const info = new Map<string, string>()
  const setting = new Map<string, string>()
  const batches: SqlStatement[][] = []
  const db: DomainDb = {
    async query<T>(sql: string, bind?: unknown[]): Promise<T[]> {
      if (sql.includes('FROM INFOTABLE_V1') && sql.includes('WHERE INFONAME')) {
        const value = info.get(String(bind?.[0]))
        return (value === undefined ? [] : [{ INFOVALUE: value }]) as T[]
      }
      if (sql.includes('FROM SETTING_V1') && sql.includes('WHERE SETTINGNAME')) {
        const value = setting.get(String(bind?.[0]))
        return (value === undefined ? [] : [{ SETTINGVALUE: value }]) as T[]
      }
      return [] as T[]
    },
    async mutate(statements: SqlStatement[]): Promise<void> {
      batches.push(statements)
    },
  }
  return { db, info, setting, batches }
}

let fake: ReturnType<typeof makeFakeDb>

beforeEach(() => {
  fake = makeFakeDb()
  setDomainDb(fake.db)
})

afterEach(() => setDomainDb())

describe('rate history default', () => {
  // Requirement "Well-Known File Facts", scenario "An absent history key reads
  // as on" (option.cpp getBool("USECURRENCYHISTORY", true)).
  it('reads an absent key as on', async () => {
    expect(await fileFacts.useCurrencyHistory()).toBe(true)
  })

  it('reads a stored 0 as off', async () => {
    fake.info.set('USECURRENCYHISTORY', '0')
    expect(await fileFacts.useCurrencyHistory()).toBe(false)
  })
})

// transaction-taxonomy (delta: desktop fidelity): Show-Hidden Preferences,
// scenario "Absent preference shows hidden entries"; Payee Records, scenario
// "Mode is read with desktop's default"; Category Tree Structure, scenario
// "Path uses the file's delimiter".
describe('taxonomy file facts', () => {
  it('reads absent keys with desktop defaults', async () => {
    expect(await fileFacts.showHiddenCategories()).toBe(true)
    expect(await fileFacts.showHiddenPayees()).toBe(true)
    expect(await fileFacts.defaultCategoryMode()).toBe('lastUsed')
    expect(await fileFacts.categoryDelimiter()).toBe(':')
  })

  // Model_Setting::getBool reads exactly TRUE or FALSE and falls back otherwise.
  it('reads stored preferences as desktop reads them', async () => {
    fake.setting.set('SHOW_HIDDEN_CATEGS', 'FALSE')
    fake.setting.set('SHOW_HIDDEN_PAYEES', 'TRUE')
    expect(await fileFacts.showHiddenCategories()).toBe(false)
    expect(await fileFacts.showHiddenPayees()).toBe(true)
    fake.setting.set('SHOW_HIDDEN_PAYEES', '1')
    expect(await fileFacts.showHiddenPayees()).toBe(true)
  })

  it('reads the mode and the delimiter as stored', async () => {
    fake.setting.set('TRANSACTION_CATEGORY_NONE', '2')
    fake.info.set('CATEG_DELIMITER', ' / ')
    expect(await fileFacts.defaultCategoryMode()).toBe('unused')
    expect(await fileFacts.categoryDelimiter()).toBe(' / ')
  })
})

describe('changing the base currency', () => {
  // currency-management Requirement "Base Currency", scenario "Changing the
  // base resets every rate". Risk R2: one batch, so no partial state.
  it('moves the pointer, resets every rate and empties the history in one batch', async () => {
    await currencyRepo.changeBase(7)

    expect(fake.batches).toHaveLength(1)
    const batch = fake.batches[0]!
    expect(batch).toHaveLength(3)
    expect(batch[0]!.sql).toContain('INTO INFOTABLE_V1')
    expect(batch[0]!.bind).toEqual(['BASECURRENCYID', '7'])
    expect(batch[1]!.sql).toBe('UPDATE CURRENCYFORMATS_V1 SET BASECONVRATE = 1')
    expect(batch[2]!.sql).toBe('DELETE FROM CURRENCYHISTORY_V1')
  })
})
