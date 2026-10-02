import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const { MockWorker } = vi.hoisted(() => {
  class MockWorker {
    postMessage = vi.fn()
    addEventListener = vi.fn()
    removeEventListener = vi.fn()
    terminate = vi.fn()
  }
  return { MockWorker }
})

vi.mock('../workers/sqlite.worker?worker', () => ({ default: MockWorker }))

import { setDomainDb, type DomainDb, type SqlStatement } from '../domain/db'
import { SettingRefusedError, useSettingsStore } from '../stores/settings-store'
import { i18n } from '../i18n'
import type { CurrencyRecord } from '../domain/records'

/**
 * Spec: file-metadata-and-settings. A fake persistence surface stands in for the
 * database, so these exercise the real repositories and the real key routing.
 */

const currency = (id: number, symbol: string, name: string, rate = 1): CurrencyRecord => ({
  CURRENCYID: id,
  CURRENCYNAME: name,
  PFX_SYMBOL: '',
  SFX_SYMBOL: '',
  DECIMAL_POINT: '.',
  GROUP_SEPARATOR: ',',
  UNIT_NAME: '',
  CENT_NAME: '',
  SCALE: 100,
  BASECONVRATE: rate,
  CURRENCY_SYMBOL: symbol,
  CURRENCY_TYPE: 'Fiat',
})

/** Minimal in-memory stand-in for the two key-value tables and the currency tables. */
const makeFakeDb = () => {
  const info = new Map<string, string>()
  const setting = new Map<string, string>()
  const currencies: CurrencyRecord[] = [currency(1, 'USD', 'US dollar'), currency(2, 'EUR', 'Euro')]
  const history: { CURRENCYID: number; CURRDATE: string }[] = []
  const batches: SqlStatement[][] = []

  const db: DomainDb = {
    async query<T>(sql: string, bind?: unknown[]): Promise<T[]> {
      const key = String(bind?.[0] ?? '')
      if (sql.includes('FROM INFOTABLE_V1') && sql.includes('WHERE INFONAME')) {
        const value = info.get(key)
        return (value === undefined ? [] : [{ INFOVALUE: value }]) as T[]
      }
      if (sql.includes('FROM SETTING_V1') && sql.includes('WHERE SETTINGNAME')) {
        const value = setting.get(key)
        return (value === undefined ? [] : [{ SETTINGVALUE: value }]) as T[]
      }
      if (sql.includes('FROM CURRENCYFORMATS_V1')) return currencies.map((c) => ({ ...c })) as T[]
      return [] as T[]
    },
    async mutate(statements: SqlStatement[]): Promise<void> {
      batches.push(statements)
      for (const statement of statements) {
        const [key, value] = (statement.bind ?? []) as [string, string]
        if (statement.sql.includes('INTO INFOTABLE_V1')) info.set(key, value)
        else if (statement.sql.includes('INTO SETTING_V1')) setting.set(key, value)
        else if (statement.sql.includes('UPDATE CURRENCYFORMATS_V1 SET BASECONVRATE = 1')) {
          for (const c of currencies) c.BASECONVRATE = 1
        } else if (statement.sql.includes('DELETE FROM CURRENCYHISTORY_V1')) history.length = 0
      }
    },
  }
  return { db, info, setting, currencies, history, batches }
}

let fake: ReturnType<typeof makeFakeDb>

beforeEach(() => {
  setActivePinia(createPinia())
  fake = makeFakeDb()
  setDomainDb(fake.db)
  i18n.global.locale.value = 'en-US'
})

afterEach(() => {
  setDomainDb()
})

describe('loading', () => {
  // Requirement "Settings Surface", scenario "Values shown are the values stored".
  it('reads every presented value from the database', async () => {
    fake.info.set('BASECURRENCYID', '2')
    fake.info.set('USERNAME', 'Alice')
    fake.info.set('DATEFORMAT', '%Y-%m-%d')
    fake.info.set('USECURRENCYHISTORY', '0')
    fake.info.set('DATAVERSION', '3')
    fake.setting.set('DELETED_TRANS_RETAIN_DAYS', '14')
    fake.setting.set('LANGUAGE', 'zh_TW')

    const store = useSettingsStore()
    await store.load()

    expect(store.baseCurrencyId).toBe(2)
    expect(store.userName).toBe('Alice')
    expect(store.dateFormat).toBe('%Y-%m-%d')
    expect(store.useCurrencyHistory).toBe(false)
    expect(store.dataVersion).toBe('3')
    expect(store.retentionDays).toBe(14)
    expect(store.storedLanguage).toBe('zh_TW')
  })

  // Requirement "Well-Known File Facts", scenario "An absent history key reads
  // as on"; Requirement "File Information Presentation", scenario "A missing
  // data version is shown as not set".
  it('falls back to desktop defaults when a key is absent, and reports no data version', async () => {
    const store = useSettingsStore()
    await store.load()

    expect(store.retentionDays).toBe(30)
    expect(store.useCurrencyHistory).toBe(true)
    expect(store.baseCurrencyId).toBeNull()
    expect(store.dataVersion).toBeNull()
  })

  // Requirement "Settings Surface", scenario "The base-currency choices are the
  // file's currencies" (design D6).
  it('offers the currencies the file holds', async () => {
    fake.currencies.push(currency(169, 'XAU', 'Gold troy ounce'))
    const store = useSettingsStore()
    await store.load()

    expect(store.currencies.map((c) => c.CURRENCY_SYMBOL)).toEqual(['USD', 'EUR', 'XAU'])
  })
})

describe('editing file facts', () => {
  // Requirement "Editing File Facts", scenario "A fact is changed and nothing
  // else moves" -- the guarantee the capability's custody rule depends on.
  it('leaves every other key intact, including ones this build does not know', async () => {
    fake.info.set('USERNAME', 'Alice')
    fake.info.set('DATAVERSION', '3')
    fake.info.set('MMEXVERSION', '1.9.0')
    fake.info.set('SOME_FUTURE_KEY', 'keep me')

    const store = useSettingsStore()
    await store.load()
    await store.setUserName('Bob')

    expect(fake.info.get('USERNAME')).toBe('Bob')
    expect(fake.info.get('DATAVERSION')).toBe('3')
    expect(fake.info.get('MMEXVERSION')).toBe('1.9.0')
    expect(fake.info.get('SOME_FUTURE_KEY')).toBe('keep me')
    expect(fake.info.size).toBe(4)
  })

  // Requirement "Editing File Facts": clearing the user name stores the empty string.
  it('stores an empty string when the user name is cleared', async () => {
    fake.info.set('USERNAME', 'Alice')
    const store = useSettingsStore()
    await store.load()
    await store.setUserName('')

    expect(fake.info.get('USERNAME')).toBe('')
    expect(store.userName).toBe('')
  })

  it('addresses writes by key name, never by row identifier', async () => {
    const store = useSettingsStore()
    await store.setUserName('Bob')

    const [statement] = fake.batches[fake.batches.length - 1]!
    expect(statement!.sql).toContain('ON CONFLICT(INFONAME)')
    expect(statement!.sql).not.toContain('INFOID')
  })

  it('records the currency-history toggle', async () => {
    const store = useSettingsStore()
    await store.setUseCurrencyHistory(true)

    expect(fake.info.get('USECURRENCYHISTORY')).toBe('1')
    expect(store.useCurrencyHistory).toBe(true)

    await store.setUseCurrencyHistory(false)
    expect(fake.info.get('USECURRENCYHISTORY')).toBe('0')
  })

  // Scenario "A date format is chosen from desktop's masks".
  it('writes a mask desktop accepts', async () => {
    const store = useSettingsStore()
    await store.setDateFormat('%d/%m/%Y')

    expect(fake.info.get('DATEFORMAT')).toBe('%d/%m/%Y')
  })

  // Scenario "A stored format outside the list is preserved": a value outside
  // the list is refused, never written (design D3).
  it('refuses a date format outside the list and writes nothing', async () => {
    fake.info.set('DATEFORMAT', 'YYYY-MM-DD')
    const store = useSettingsStore()
    await store.load()

    await expect(store.setDateFormat('DD.MM.YYYY')).rejects.toBeInstanceOf(SettingRefusedError)
    expect(fake.info.get('DATEFORMAT')).toBe('YYYY-MM-DD')
    expect(store.dateFormat).toBe('YYYY-MM-DD')
  })
})

describe('changing the base currency', () => {
  // Requirement "Base Currency Change Confirmation", scenario "Confirming
  // performs the full change"; currency-management "Base Currency" (design D4).
  it('moves the pointer, resets every rate to 1 and empties the history', async () => {
    fake.info.set('BASECURRENCYID', '1')
    fake.currencies[1]!.BASECONVRATE = 0.9
    fake.history.push(
      { CURRENCYID: 2, CURRDATE: '2026-01-01' },
      { CURRENCYID: 2, CURRDATE: '2026-02-01' },
    )
    const store = useSettingsStore()
    await store.load()

    await store.setBaseCurrency(2)

    expect(fake.info.get('BASECURRENCYID')).toBe('2')
    expect(fake.currencies.every((c) => c.BASECONVRATE === 1)).toBe(true)
    expect(fake.history).toHaveLength(0)
    expect(store.baseCurrencyId).toBe(2)
    expect(store.currencies.every((c) => c.BASECONVRATE === 1)).toBe(true)
  })

  // Risk R2: no partial state is observable.
  it('writes all of it in one batch', async () => {
    const store = useSettingsStore()
    await store.setBaseCurrency(2)

    const batch = fake.batches[0]!
    expect(batch).toHaveLength(3)
    expect(fake.batches.filter((b) => b.some((s) => s.sql.includes('BASECONVRATE')))).toHaveLength(
      1,
    )
  })
})

describe('editing preferences', () => {
  // Requirement "Editing Application Preferences", scenario "A preference never
  // lands in the file-facts store".
  it('writes a preference to the settings table only', async () => {
    const store = useSettingsStore()
    await store.setRetentionDays(7)

    expect(fake.setting.get('DELETED_TRANS_RETAIN_DAYS')).toBe('7')
    expect(fake.info.size).toBe(0)
    const [statement] = fake.batches[fake.batches.length - 1]!
    expect(statement!.sql).toContain('SETTING_V1')
    expect(statement!.sql).not.toContain('INFOTABLE_V1')
  })

  // Scenario "An empty retention entry is refused" (design D9).
  it.each(['', 'abc', '-5', '1000', 1.5])('refuses %s and writes nothing', async (input) => {
    fake.setting.set('DELETED_TRANS_RETAIN_DAYS', '30')
    const store = useSettingsStore()
    await store.load()

    await expect(store.setRetentionDays(input)).rejects.toBeInstanceOf(SettingRefusedError)
    expect(fake.setting.get('DELETED_TRANS_RETAIN_DAYS')).toBe('30')
    expect(store.retentionDays).toBe(30)
  })

  it('keeps zero, which means delete immediately, and the desktop maximum', async () => {
    const store = useSettingsStore()
    await store.setRetentionDays('0')
    expect(fake.setting.get('DELETED_TRANS_RETAIN_DAYS')).toBe('0')

    await store.setRetentionDays(999)
    expect(fake.setting.get('DELETED_TRANS_RETAIN_DAYS')).toBe('999')
  })
})

/** Requirement "Active Locale Persistence" (design D1, D2). */
describe('language persistence', () => {
  it('applies the locale and stores desktop canonical form under LANGUAGE', async () => {
    const store = useSettingsStore()
    await store.setLocale('zh-TW', true)

    expect(i18n.global.locale.value).toBe('zh-TW')
    expect(fake.setting.get('LANGUAGE')).toBe('zh_TW')
    expect(store.pendingLocale).toBeNull()
  })

  // Scenario "Switching language leaves the formatting locale alone".
  it('never writes INFOTABLE.LOCALE when the language changes', async () => {
    fake.info.set('LOCALE', 'de_DE.UTF-8')
    const store = useSettingsStore()
    await store.setLocale('zh-TW', true)

    expect(fake.info.get('LOCALE')).toBe('de_DE.UTF-8')
    expect(fake.info.size).toBe(1)
  })

  // Scenario "Switching before a database is open".
  it('holds the choice when no database is open and flushes it once ready', async () => {
    const store = useSettingsStore()
    await store.setLocale('zh-TW', false)

    expect(i18n.global.locale.value).toBe('zh-TW')
    expect(fake.setting.has('LANGUAGE')).toBe(false)
    expect(store.pendingLocale).toBe('zh-TW')

    await store.syncLocaleWithDatabase()

    expect(fake.setting.get('LANGUAGE')).toBe('zh_TW')
    expect(store.pendingLocale).toBeNull()
  })

  // Scenario "The chosen locale survives a reload".
  it('restores the stored language when the database opens', async () => {
    fake.setting.set('LANGUAGE', 'zh_TW')

    const store = useSettingsStore()
    await store.syncLocaleWithDatabase()

    expect(i18n.global.locale.value).toBe('zh-TW')
  })

  // A session choice must win over what the file happens to hold.
  it('prefers a pending choice over the stored value', async () => {
    fake.setting.set('LANGUAGE', 'en_US')

    const store = useSettingsStore()
    await store.setLocale('zh-TW', false)
    await store.syncLocaleWithDatabase()

    expect(fake.setting.get('LANGUAGE')).toBe('zh_TW')
    expect(i18n.global.locale.value).toBe('zh-TW')
  })

  // Scenario "An unsupported stored locale is tolerated".
  it('falls back for display and leaves an unsupported stored language in place', async () => {
    fake.setting.set('LANGUAGE', 'fr_FR')
    i18n.global.locale.value = 'zh-TW'

    const store = useSettingsStore()
    await store.syncLocaleWithDatabase()

    expect(i18n.global.locale.value).toBe('en-US')
    expect(fake.setting.get('LANGUAGE')).toBe('fr_FR')
    expect(store.storedLanguage).toBe('fr_FR')
  })

  it('starts in the fallback and touches nothing when neither key is set', async () => {
    i18n.global.locale.value = 'zh-TW'
    const store = useSettingsStore()
    await store.syncLocaleWithDatabase()

    expect(i18n.global.locale.value).toBe('en-US')
    expect(fake.setting.size).toBe(0)
    expect(fake.info.size).toBe(0)
  })
})

/** Design D2, risk R1: the one-time repair of a LOCALE the earlier surface wrote. */
describe('repairing a LOCALE written by the earlier surface', () => {
  // Scenario "A language the earlier surface wrote into LOCALE is repaired once".
  it('reads it as the language, records LANGUAGE, and clears LOCALE', async () => {
    fake.info.set('LOCALE', 'zh-TW')

    const store = useSettingsStore()
    await store.syncLocaleWithDatabase()

    expect(i18n.global.locale.value).toBe('zh-TW')
    expect(fake.setting.get('LANGUAGE')).toBe('zh_TW')
    expect(fake.info.get('LOCALE')).toBe('')
  })

  it.each(['de_DE.UTF-8', '', 'C'])('leaves a desktop LOCALE of %j untouched', async (value) => {
    fake.info.set('LOCALE', value)

    const store = useSettingsStore()
    await store.syncLocaleWithDatabase()

    expect(fake.info.get('LOCALE')).toBe(value)
    expect(fake.setting.has('LANGUAGE')).toBe(false)
    expect(i18n.global.locale.value).toBe('en-US')
  })

  it('does nothing when LOCALE is absent', async () => {
    const store = useSettingsStore()
    await store.syncLocaleWithDatabase()

    expect(fake.info.has('LOCALE')).toBe(false)
    expect(fake.setting.has('LANGUAGE')).toBe(false)
  })

  it('does not repair once LANGUAGE exists, even if LOCALE still holds a tag', async () => {
    fake.setting.set('LANGUAGE', 'en_US')
    fake.info.set('LOCALE', 'zh-TW')

    const store = useSettingsStore()
    await store.syncLocaleWithDatabase()

    expect(i18n.global.locale.value).toBe('en-US')
    expect(fake.info.get('LOCALE')).toBe('zh-TW')
  })

  // Risk R6: a pending choice wins, and the damaged LOCALE is still cleared.
  it('lets a pending choice win while still clearing the damaged LOCALE', async () => {
    fake.info.set('LOCALE', 'en-US')

    const store = useSettingsStore()
    await store.setLocale('zh-TW', false)
    await store.syncLocaleWithDatabase()

    expect(fake.setting.get('LANGUAGE')).toBe('zh_TW')
    expect(i18n.global.locale.value).toBe('zh-TW')
    expect(fake.info.get('LOCALE')).toBe('')
  })
})
