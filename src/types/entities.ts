/** CATEGORY_V1 row */
export interface Category {
  CATEGID: number
  CATEGNAME: string
  ACTIVE: number
  PARENTID: number
}

/** Tree node for QTree rendering */
export interface CategoryNode {
  id: number
  label: string
  active: boolean
  parentId: number
  children: CategoryNode[]
}

/** PAYEE_V1 row */
export interface Payee {
  PAYEEID: number
  PAYEENAME: string
  CATEGID: number | null
  NUMBER: string
  WEBSITE: string
  NOTES: string
  ACTIVE: number
  PATTERN: string
}

/** TAG_V1 row */
export interface Tag {
  TAGID: number
  TAGNAME: string
  ACTIVE: number
}

/** TAGLINK_V1 row */
export interface TagLink {
  TAGLINKID: number
  REFTYPE: string
  REFID: number
  TAGID: number
}

/** CUSTOMFIELD_V1 row */
export interface CustomField {
  FIELDID: number
  REFTYPE: string
  DESCRIPTION: string
  TYPE: CustomFieldType
  PROPERTIES: string // JSON string
}

export type CustomFieldType =
  | 'String'
  | 'Integer'
  | 'Decimal'
  | 'Boolean'
  | 'Date'
  | 'Time'
  | 'SingleChoice'
  | 'MultiChoice'

/** Parsed PROPERTIES JSON */
export interface CustomFieldProperties {
  regex?: string
  tooltip?: string
  autocomplete?: boolean
  default?: string
  choices?: string[]
  scale?: number
}

/** CUSTOMFIELDDATA_V1 row */
export interface CustomFieldData {
  FIELDATADID: number
  FIELDID: number
  REFID: number
  CONTENT: string | null
}

/** SETTING_V1 row */
export interface Setting {
  SETTINGID: number
  SETTINGNAME: string
  SETTINGVALUE: string | null
}

/** Relocation impact statistics */
export interface RelocationStats {
  transactions: number
  splitTransactions: number
  recurringTransactions: number
  budgets: number
  budgetSplits: number
  payeeDefaults: number // only for category relocation
}

/** Custom date range specification */
export interface DateRangeSpec {
  label: string
  spec: string // e.g., "M", "M-1", "Q", "Y-1"
  isDefault: boolean
  sortOrder: number
}

/** Resolved date range with concrete dates */
export interface ResolvedDateRange {
  start: Date
  end: Date
}
