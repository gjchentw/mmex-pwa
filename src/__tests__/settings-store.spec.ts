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
import { useSettingsStore } from '../stores/settings-store'
import { i18n } from '../i18n'

/**
 * Spec: file-metadata-and-settings. A fake persistence surface stands in for the
 * database, so these exercise the real repositories and the real key routing.
 */

/** Minimal in-memory stand-in for the two key-value tables. */
const makeFakeDb = () => {
  const info = new Map<string, string>()
  const setting = new Map<string, string>()
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
      return [] as T[]
    },
    async mutate(statements: SqlStatement[]): Promise<void> {
      batches.push(statements)
      for (const statement of statements) {
        const [key, value] = (statement.bind ?? []) as [string, string]
        if (statement.sql.includes('INTO INFOTABLE_V1')) info.set(key, value)
        else if (statement.sql.includes('INTO SETTING_V1')) setting.set(key, value)
      }
    },
  }
  return { db, info, setting, batches }
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
    fake.info.set('BASECURRENCYID', '42')
    fake.info.set('USERNAME', 'Alice')
    fake.info.set('DATEFORMAT', '%Y-%m-%d')
    fake.info.set('USECURRENCYHISTORY', '1')
    fake.info.set('DATAVERSION', '3')
    fake.setting.set('DELETED_TRANS_RETAIN_DAYS', '14')

    const store = useSettingsStore()
    await store.load()

    expect(store.baseCurrencyId).toBe(42)
    expect(store.userName).toBe('Alice')
    expect(store.dateFormat).toBe('%Y-%m-%d')
    expect(store.useCurrencyHistory).toBe(true)
    expect(store.dataVersion).toBe('3')
    expect(store.retentionDays).toBe(14)
  })

  it('falls back to the upstream defaults when a key is absent', async () => {
    const store = useSettingsStore()
    await store.load()

    expect(store.retentionDays).toBe(30)
    expect(store.useCurrencyHistory).toBe(false)
    expect(store.baseCurrencyId).toBeNull()
  })
})

describe('editing file facts', () => {
  // Requirement "Editing File Facts", scenario "A fact is changed and nothing
  // else moves" -- the guarantee the capability's custody rule depends on
  // (design risk R1).
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

  it('writes the base currency when asked', async () => {
    const store = useSettingsStore()
    await store.setBaseCurrency(7)

    expect(fake.info.get('BASECURRENCYID')).toBe('7')
    expect(store.baseCurrencyId).toBe(7)
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

  it('never stores a negative retention window', async () => {
    const store = useSettingsStore()
    await store.setRetentionDays(-5)

    expect(fake.setting.get('DELETED_TRANS_RETAIN_DAYS')).toBe('0')
    expect(store.retentionDays).toBe(0)
  })

  it('keeps zero, which means delete immediately', async () => {
    const store = useSettingsStore()
    await store.setRetentionDays(0)

    expect(fake.setting.get('DELETED_TRANS_RETAIN_DAYS')).toBe('0')
  })
})

/** Requirement "Active Locale Persistence". */
describe('locale persistence', () => {
  it('applies and stores a locale when a database is open', async () => {
    const store = useSettingsStore()
    await store.setLocale('zh-TW', true)

    expect(i18n.global.locale.value).toBe('zh-TW')
    expect(fake.info.get('LOCALE')).toBe('zh-TW')
    expect(store.pendingLocale).toBeNull()
  })

  // Scenario "Switching before a database is open".
  it('holds the choice when no database is open and flushes it once ready', async () => {
    const store = useSettingsStore()
    await store.setLocale('zh-TW', false)

    expect(i18n.global.locale.value).toBe('zh-TW')
    expect(fake.info.has('LOCALE')).toBe(false)
    expect(store.pendingLocale).toBe('zh-TW')

    await store.syncLocaleWithDatabase()

    expect(fake.info.get('LOCALE')).toBe('zh-TW')
    expect(store.pendingLocale).toBeNull()
  })

  // Scenario "The chosen locale survives a reload".
  it('restores the stored locale when the database opens', async () => {
    fake.info.set('LOCALE', 'zh-TW')

    const store = useSettingsStore()
    await store.syncLocaleWithDatabase()

    expect(i18n.global.locale.value).toBe('zh-TW')
  })

  // A session choice must win over what the file happens to hold.
  it('prefers a pending choice over the stored value', async () => {
    fake.info.set('LOCALE', 'en-US')

    const store = useSettingsStore()
    await store.setLocale('zh-TW', false)
    await store.syncLocaleWithDatabase()

    expect(fake.info.get('LOCALE')).toBe('zh-TW')
    expect(i18n.global.locale.value).toBe('zh-TW')
  })

  // Scenario "An unsupported stored locale is tolerated".
  it('falls back for display and leaves an unsupported stored locale in place', async () => {
    fake.info.set('LOCALE', 'fr-FR')

    const store = useSettingsStore()
    await store.syncLocaleWithDatabase()

    expect(i18n.global.locale.value).toBe('en-US')
    expect(fake.info.get('LOCALE')).toBe('fr-FR')
    expect(store.storedLocale).toBe('fr-FR')
  })
})
