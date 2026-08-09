/**
 * Typed shapes for every table the application reads or writes. Fields keep the
 * upstream column names verbatim: round-trip fidelity is far easier to audit
 * when a type names the column it persists to (openspec: domain-data-access,
 * Single Typed Access Path). Nullability mirrors the DDL, which declares almost
 * nothing NOT NULL and uses -1 rather than NULL for "no reference".
 */

export interface AccountRecord {
  ACCOUNTID: number
  ACCOUNTNAME: string
  ACCOUNTTYPE: string
  ACCOUNTNUM: string | null
  STATUS: string
  NOTES: string | null
  HELDAT: string | null
  WEBSITE: string | null
  CONTACTINFO: string | null
  ACCESSINFO: string | null
  INITIALBAL: number | null
  INITIALDATE: string | null
  FAVORITEACCT: string
  CURRENCYID: number
  STATEMENTLOCKED: number | null
  STATEMENTDATE: string | null
  MINIMUMBALANCE: number | null
  CREDITLIMIT: number | null
  INTERESTRATE: number | null
  PAYMENTDUEDATE: string | null
  MINIMUMPAYMENT: number | null
}

export interface TransactionRecord {
  TRANSID: number
  ACCOUNTID: number
  TOACCOUNTID: number | null
  PAYEEID: number | null
  TRANSCODE: string
  TRANSAMOUNT: number
  STATUS: string | null
  TRANSACTIONNUMBER: string | null
  NOTES: string | null
  CATEGID: number | null
  TRANSDATE: string | null
  LASTUPDATEDTIME: string | null
  DELETEDTIME: string | null
  FOLLOWUPID: number | null
  TOTRANSAMOUNT: number | null
  COLOR: number | null
}

export interface SplitRecord {
  SPLITTRANSID: number
  TRANSID: number
  CATEGID: number
  SPLITTRANSAMOUNT: number
  NOTES: string | null
}

export interface ScheduledRecord {
  BDID: number
  ACCOUNTID: number
  TOACCOUNTID: number | null
  PAYEEID: number | null
  TRANSCODE: string
  TRANSAMOUNT: number
  STATUS: string | null
  TRANSACTIONNUMBER: string | null
  NOTES: string | null
  CATEGID: number | null
  TRANSDATE: string | null
  FOLLOWUPID: number | null
  TOTRANSAMOUNT: number | null
  REPEATS: number | null
  NEXTOCCURRENCEDATE: string | null
  NUMOCCURRENCES: number | null
  COLOR: number | null
}

/**
 * Split lines of a scheduled series. Despite the table name this belongs to
 * scheduled transactions, not budgeting (openspec: budget-management non-scope).
 */
export interface ScheduledSplitRecord {
  SPLITTRANSID: number
  TRANSID: number
  CATEGID: number
  SPLITTRANSAMOUNT: number
  NOTES: string | null
}

export interface CategoryRecord {
  CATEGID: number
  CATEGNAME: string
  ACTIVE: number | null
  PARENTID: number
}

export interface PayeeRecord {
  PAYEEID: number
  PAYEENAME: string
  CATEGID: number | null
  NUMBER: string | null
  WEBSITE: string | null
  NOTES: string | null
  ACTIVE: number | null
  PATTERN: string | null
}

export interface TagRecord {
  TAGID: number
  TAGNAME: string
  ACTIVE: number | null
}

export interface TagLinkRecord {
  TAGLINKID: number
  REFTYPE: string
  REFID: number
  TAGID: number
}

export interface CurrencyRecord {
  CURRENCYID: number
  CURRENCYNAME: string
  PFX_SYMBOL: string | null
  SFX_SYMBOL: string | null
  DECIMAL_POINT: string | null
  GROUP_SEPARATOR: string | null
  UNIT_NAME: string | null
  CENT_NAME: string | null
  SCALE: number | null
  BASECONVRATE: number | null
  CURRENCY_SYMBOL: string
  CURRENCY_TYPE: string | null
}

export interface CurrencyHistoryRecord {
  CURRHISTID: number
  CURRENCYID: number
  CURRDATE: string
  CURRVALUE: number
  CURRUPDTYPE: number | null
}

export interface BudgetYearRecord {
  BUDGETYEARID: number
  BUDGETYEARNAME: string
}

export interface BudgetRecord {
  BUDGETENTRYID: number
  BUDGETYEARID: number
  CATEGID: number
  PERIOD: string
  AMOUNT: number
  NOTES: string | null
  ACTIVE: number | null
}

export interface StockRecord {
  STOCKID: number
  HELDAT: number
  PURCHASEDATE: string | null
  STOCKNAME: string
  SYMBOL: string | null
  NUMSHARES: number | null
  PURCHASEPRICE: number | null
  NOTES: string | null
  CURRENTPRICE: number | null
  VALUE: number | null
  COMMISSION: number | null
}

export interface StockHistoryRecord {
  HISTID: number
  SYMBOL: string
  DATE: string
  VALUE: number
  UPDTYPE: number | null
}

export interface ShareInfoRecord {
  SHAREINFOID: number
  CHECKINGACCOUNTID: number
  SHARENUMBER: number | null
  SHAREPRICE: number | null
  SHARECOMMISSION: number | null
  SHARELOT: string | null
}

export interface TransLinkRecord {
  TRANSLINKID: number
  CHECKINGACCOUNTID: number
  LINKTYPE: string
  LINKRECORDID: number
}

export interface AssetRecord {
  ASSETID: number
  STARTDATE: string | null
  ASSETNAME: string
  ASSETSTATUS: string | null
  CURRENCYID: number | null
  VALUECHANGEMODE: string | null
  VALUE: number | null
  VALUECHANGE: string | null
  NOTES: string | null
  VALUECHANGERATE: number | null
  ASSETTYPE: string | null
}

export interface AttachmentRecord {
  ATTACHMENTID: number
  REFTYPE: string
  REFID: number
  DESCRIPTION: string | null
  FILENAME: string | null
}

export interface CustomFieldRecord {
  FIELDID: number
  REFTYPE: string
  DESCRIPTION: string | null
  TYPE: string
  PROPERTIES: string | null
}

export interface CustomFieldDataRecord {
  /** Upstream spells this FIELDATADID -- the typo is part of the schema. */
  FIELDATADID: number
  FIELDID: number
  REFID: number
  CONTENT: string | null
}

export interface InfoRecord {
  INFOID: number
  INFONAME: string
  INFOVALUE: string
}

export interface SettingRecord {
  SETTINGID: number
  SETTINGNAME: string
  SETTINGVALUE: string | null
}

export interface ReportRecord {
  REPORTID: number
  REPORTNAME: string
  GROUPNAME: string | null
  ACTIVE: number | null
  SQLCONTENT: string | null
  LUACONTENT: string | null
  TEMPLATECONTENT: string | null
  DESCRIPTION: string | null
}

export interface UsageRecord {
  USAGEID: number
  USAGEDATE: string | null
  JSONCONTENT: string | null
}
