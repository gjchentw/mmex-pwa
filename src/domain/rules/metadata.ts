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
  /** Desktop's std::locale name for amount formatting -- never the UI language. */
  locale: 'LOCALE',
  /** The Currency Manager's "Show all" box, which desktop persists in the file. */
  showHiddenCurrencies: 'SHOW_HIDDEN_CURRENCIES',
  /** The separator desktop joins category paths with (Model_Category.cpp full_name). */
  categoryDelimiter: 'CATEG_DELIMITER',
} as const

/** Well-known SETTING_V1 keys this build understands. Unknown keys are preserved. */
export const SETTING_KEY = {
  deletedTransactionRetainDays: 'DELETED_TRANS_RETAIN_DAYS',
  budgetDeductMonthlyFromYear: 'BUDGET_DEDUCT_MONTH_FROM_YEAR',
  budgetOverride: 'BUDGET_OVERRIDE',
  /** The UI language, as desktop stores it (constants.cpp LANGUAGE_PARAMETER). */
  language: 'LANGUAGE',
  /** The Category Manager's "Show all" box (categdialog.cpp). */
  showHiddenCategories: 'SHOW_HIDDEN_CATEGS',
  /** The Payee Manager's "Show all" box (payeedialog.cpp). */
  showHiddenPayees: 'SHOW_HIDDEN_PAYEES',
  /** Desktop's default-category mode for payees (option.cpp USAGE_TYPE). */
  transactionCategoryNone: 'TRANSACTION_CATEGORY_NONE',
} as const

/** Upstream defaults for the keys whose absence has a defined meaning. */
export const DEFAULTS = {
  dataVersion: '3',
  /** Desktop reads an absent key as on (option.cpp getBool("USECURRENCYHISTORY", true)). */
  useCurrencyHistory: true,
  /** Desktop shows every currency unless the box was unticked (maincurrencydialog.cpp). */
  showHiddenCurrencies: true,
  /** Desktop shows hidden categories and payees unless the box was unticked. */
  showHiddenCategories: true,
  showHiddenPayees: true,
  /** option.cpp getInt("TRANSACTION_CATEGORY_NONE", Option::LASTUSED). */
  defaultCategoryMode: 'lastUsed',
  /** Model_Category.cpp getString("CATEG_DELIMITER", ":"). */
  categoryDelimiter: ':',
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

/** Booleans persist as `1`/`0`, which desktop reads from INFOTABLE_V1 alongside TRUE/FALSE. */
export const encodeBooleanValue = (value: boolean): string => (value ? '1' : '0')

/**
 * SETTING_V1 booleans are stricter: Model_Setting::getBool reads exactly `TRUE`
 * or `FALSE` and falls back for anything else, and setBool writes those words.
 */
export const parseSettingBoolean = (
  value: string | null | undefined,
  fallback: boolean,
): boolean => (value === 'TRUE' ? true : value === 'FALSE' ? false : fallback)

export const encodeSettingBoolean = (value: boolean): string => (value ? 'TRUE' : 'FALSE')

/**
 * Trash retention in days. `0` means delete immediately without trash
 * (openspec: transaction-ledger, Soft Delete, Trash, and Retention).
 */
export const retentionDays = (stored: string | null | undefined): number => {
  const days = parseIntegerValue(stored, DEFAULTS.deletedTransactionRetainDays)
  return days < 0 ? DEFAULTS.deletedTransactionRetainDays : days
}

/**
 * The UI language in the canonical form desktop stores under SETTING_V1.LANGUAGE
 * (option.cpp getLanguageID: a wxLocale canonical name such as zh_TW), keyed by
 * the locale tag this application uses. The keys are the locales this build
 * provides.
 */
export const LANGUAGE_BY_LOCALE = {
  'en-US': 'en_US',
  'zh-TW': 'zh_TW',
} as const

export type LocaleTag = keyof typeof LANGUAGE_BY_LOCALE

export const localeToLanguage = (locale: string): string | null =>
  (LANGUAGE_BY_LOCALE as Record<string, string>)[locale] ?? null

/** Null for a name this build cannot render, including desktop's numeric wxLanguage ids. */
export const languageToLocale = (language: string | null | undefined): LocaleTag | null => {
  if (!language) return null
  const entry = Object.entries(LANGUAGE_BY_LOCALE).find(([, name]) => name === language)
  return (entry?.[0] as LocaleTag | undefined) ?? null
}

/**
 * Only the earlier settings surface ever wrote a locale tag into INFOTABLE.LOCALE;
 * desktop writes std::locale names such as de_DE.UTF-8, or leaves it blank.
 */
export const isLocaleWrittenByThisApplication = (value: string | null | undefined): boolean =>
  value !== null && value !== undefined && value in LANGUAGE_BY_LOCALE

/**
 * The date-format masks desktop accepts, copied verbatim from
 * g_date_formats_map in mmex/moneymanagerex/src/util.cpp. Any other value makes
 * desktop render dates as the literal text and parse none.
 */
export const DATE_FORMAT_MASKS = [
  '%d %Mon %Y',
  '%d %Mon %y',
  '%d-%Mon-%Y',
  '%d-%Mon-%y',
  "%d %Mon'%y",
  '%d %m %y',
  '%d %m %Y',
  '%d,%m,%y',
  '%d.%m.%y',
  '%d.%m.%Y',
  "%d.%m'%Y",
  '%d,%m,%Y',
  '%d/%m %Y',
  '%d/%m/%y',
  '%d/%m/%Y',
  "%d/%m'%y",
  "%d/%m'%Y",
  '%d-%m-%y',
  '%d-%m-%Y',
  "%w %d %Mon'%y",
  '%m.%d.%y',
  '%m.%d.%Y',
  '%m/%d/%y',
  '%m/%d/%Y',
  "%m/%d'%y",
  "%m/%d'%Y",
  '%m-%d-%y',
  '%m-%d-%Y',
  '%y/%m/%d',
  '%y-%m-%d',
  '%Y %m %d',
  '%Y.%m.%d',
  '%Y/%m/%d',
  '%Y%d%m',
  '%Y%m%d',
  '%Y-%m-%d',
] as const

export const isDateFormatMask = (value: unknown): value is (typeof DATE_FORMAT_MASKS)[number] =>
  typeof value === 'string' && (DATE_FORMAT_MASKS as readonly string[]).includes(value)

const MONTH_ABBREVIATIONS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const
const WEEKDAY_ABBREVIATIONS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

const two = (value: number): string => String(value).padStart(2, '0')

/** A date rendered in one of desktop's masks, for showing the user what a mask means. */
export const renderDateMask = (mask: string, date: Date): string =>
  mask.replace(/%(Mon|[dmyYw])/g, (_, token: string) => {
    switch (token) {
      case 'd':
        return two(date.getDate())
      case 'm':
        return two(date.getMonth() + 1)
      case 'y':
        return two(date.getFullYear() % 100)
      case 'Y':
        return String(date.getFullYear())
      case 'Mon':
        return MONTH_ABBREVIATIONS[date.getMonth()] ?? ''
      case 'w':
        return WEEKDAY_ABBREVIATIONS[date.getDay()] ?? ''
      default:
        return token
    }
  })

/** Desktop's retention control allows 0 through 999 days (optionsettingsmisc.cpp). */
export const RETENTION_DAYS_MAX = 999

/**
 * A retention entry as the user typed it, or null when it is not a whole number
 * of days within desktop's range. Null is a refusal, never a value to store.
 */
export const parseRetentionDays = (input: unknown): number | null => {
  if (input === null || input === undefined) return null
  const text = String(input).trim()
  if (!/^\d+$/.test(text)) return null
  const days = Number(text)
  return days <= RETENTION_DAYS_MAX ? days : null
}
