# Data Model: Organization & Tools Module

**Feature**: 002-organize-tools-module  
**Date**: 2026-03-19 (updated)

## Entity Definitions

All entities map directly to existing MMEX upstream SQLite tables. No DDL changes required.

### Category

**Table**: `CATEGORY_V1`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| CATEGID | INTEGER | PRIMARY KEY | Auto-increment ID |
| CATEGNAME | TEXT | NOT NULL, COLLATE NOCASE | Category display name |
| ACTIVE | INTEGER | — | 1 = active, 0 = hidden |
| PARENTID | INTEGER | — | FK to CATEGORY_V1.CATEGID; -1 = root category |

**Indexes**:
- `IDX_CATEGORY_CATEGNAME` on `(CATEGNAME)`
- `IDX_CATEGORY_CATEGNAME_PARENTID` on `(CATEGNAME, PARENTID)` — enforces UNIQUE constraint

**Validation Rules**:
- `CATEGNAME` must be non-empty after trimming
- `(CATEGNAME, PARENTID)` must be unique — same name allowed under different parents
- Deletion blocked if referenced by: CHECKINGACCOUNT_V1, SPLITTRANSACTIONS_V1, BILLSDEPOSITS_V1, BUDGETSPLITTRANSACTIONS_V1, BUDGETTABLE_V1, or PAYEE_V1.CATEGID
- Deletion blocked if CATEGID is a parent of any other category

**State Transitions**:
- Active → Hidden: set `ACTIVE = 0`; entity remains in DB, hidden from selection UI
- Hidden → Active: set `ACTIVE = 1`

---

### Payee

**Table**: `PAYEE_V1`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| PAYEEID | INTEGER | PRIMARY KEY | Auto-increment ID |
| PAYEENAME | TEXT | NOT NULL, UNIQUE, COLLATE NOCASE | Display name (globally unique) |
| CATEGID | INTEGER | — | FK to CATEGORY_V1.CATEGID; default category for new transactions |
| NUMBER | TEXT | — | Reference/account number |
| WEBSITE | TEXT | — | Contact website URL |
| NOTES | TEXT | — | Free-text notes |
| ACTIVE | INTEGER | — | 1 = active, 0 = hidden |
| PATTERN | TEXT | DEFAULT '' | Regex pattern(s) for auto-matching imported transactions |

**Indexes**:
- `IDX_PAYEE_INFONAME` on `(PAYEENAME)`

**Validation Rules**:
- `PAYEENAME` must be non-empty after trimming
- `PAYEENAME` must be globally unique (case-insensitive)
- `PATTERN` stores one or more regex patterns (newline-separated)
- Deletion blocked if referenced by CHECKINGACCOUNT_V1.PAYEEID or BILLSDEPOSITS_V1.PAYEEID

**State Transitions**: Same as Category (Active ↔ Hidden via ACTIVE flag)

---

### Tag

**Table**: `TAG_V1`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| TAGID | INTEGER | PRIMARY KEY | Auto-increment ID |
| TAGNAME | TEXT | NOT NULL, UNIQUE, COLLATE NOCASE | Tag display name (globally unique) |
| ACTIVE | INTEGER | — | 1 = active, 0 = hidden |

**Indexes**:
- `IDX_TAGNAME` on `(TAGNAME)`

**Validation Rules**:
- `TAGNAME` must be non-empty after trimming
- `TAGNAME` must be globally unique (case-insensitive)
- Deletion blocked if TAGID is referenced by any row in TAGLINK_V1

---

### TagLink (Junction Table)

**Table**: `TAGLINK_V1`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| TAGLINKID | INTEGER | PRIMARY KEY | Auto-increment ID |
| REFTYPE | TEXT | NOT NULL | Entity type: 'Transaction', 'Stock', 'Asset', 'BankAccount', 'RepeatingTransaction', 'Payee' |
| REFID | INTEGER | NOT NULL | ID of the referenced entity |
| TAGID | INTEGER | NOT NULL, FK → TAG_V1.TAGID | Associated tag |

**Indexes**:
- `IDX_TAGLINK` on `(REFTYPE, REFID, TAGID)` — also enforces UNIQUE constraint

**Validation Rules**:
- `(REFTYPE, REFID, TAGID)` must be unique — prevents duplicate tag assignments
- During tag merge: if target tag already linked to same (REFTYPE, REFID), delete the source link instead of updating

---

### CustomField (Definition)

**Table**: `CUSTOMFIELD_V1`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| FIELDID | INTEGER | PRIMARY KEY, NOT NULL | Auto-increment ID |
| REFTYPE | TEXT | NOT NULL | Applicable entity: 'Transaction', 'Stock', 'Asset', 'BankAccount', 'RepeatingTransaction', 'Payee' |
| DESCRIPTION | TEXT | COLLATE NOCASE | Field label shown in UI |
| TYPE | TEXT | NOT NULL | Data type: 'String', 'Integer', 'Decimal', 'Boolean', 'Date', 'Time', 'SingleChoice', 'MultiChoice' |
| PROPERTIES | TEXT | NOT NULL | JSON object with optional keys |

**Indexes**:
- `IDX_CUSTOMFIELD_REF` on `(REFTYPE)`

**PROPERTIES JSON Schema**:
```json
{
  "regex": "^[A-Z]{2}\\d+$",
  "tooltip": "Enter invoice number",
  "autocomplete": true,
  "default": "",
  "choices": ["Option A", "Option B", "Option C"],
  "scale": 2
}
```

All keys are optional. `choices` is only relevant for SingleChoice/MultiChoice types. `scale` is only relevant for Decimal type.

**Validation Rules**:
- `DESCRIPTION` must be non-empty after trimming
- `TYPE` must be one of the 8 defined values
- `REFTYPE` must be one of the 6 defined values
- Deleting a field definition cascades to delete all rows in CUSTOMFIELDDATA_V1 with matching FIELDID

---

### CustomFieldData (Values)

**Table**: `CUSTOMFIELDDATA_V1`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| FIELDATADID | INTEGER | PRIMARY KEY, NOT NULL | Auto-increment ID (note: upstream typo preserved) |
| FIELDID | INTEGER | NOT NULL | FK → CUSTOMFIELD_V1.FIELDID |
| REFID | INTEGER | NOT NULL | ID of the entity record |
| CONTENT | TEXT | — | Stored value as text |

**Indexes**:
- `IDX_CUSTOMFIELDDATA_REF` on `(FIELDID, REFID)` — also enforces UNIQUE constraint

**Validation Rules**:
- `(FIELDID, REFID)` must be unique
- `CONTENT` is validated client-side against the field's TYPE and PROPERTIES before storage
- Boolean stored as "TRUE"/"FALSE"; Date as "YYYY-MM-DD"; Time as "HH:MM"

---

### Setting (Preferences)

**Table**: `SETTING_V1`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| SETTINGID | INTEGER | PRIMARY KEY, NOT NULL | Auto-increment ID |
| SETTINGNAME | TEXT | NOT NULL, UNIQUE, COLLATE NOCASE | Setting key |
| SETTINGVALUE | TEXT | — | Setting value (string-encoded) |

**Indexes**:
- `IDX_SETTING_SETTINGNAME` on `(SETTINGNAME)`

**Known Setting Keys** (used by this feature):

| SETTINGNAME | Values | Default | Description |
|-------------|--------|---------|-------------|
| LANGUAGE | Locale code (e.g., `en_US`) | `en_US` | UI display language |
| DATEFORMAT | Format string (e.g., `%Y/%m/%d`) | `%Y-%m-%d` | Date display format |
| BASECURRENCYID | Integer (FK to CURRENCYFORMATS_V1) | — | Base currency |
| USERNAME | Text | — | User display name |
| THEME_MODE | `light`, `dark`, `auto` | `auto` | UI theme preference |

---

### DateRange (Custom Date Ranges)

**Storage**: JSON array in `SETTING_V1` under key `CUSTOM_DATE_RANGES`.
No dedicated database table — stored as a serialized array of `DateRangeSpec` objects.

**DateRangeSpec Schema**:
```json
[
  { "label": "Last Month", "spec": "M-1", "isDefault": false, "sortOrder": 0 },
  { "label": "Current Quarter", "spec": "Q", "isDefault": true, "sortOrder": 1 }
]
```

**Spec Format**: `^([MQY])(?:([+-])(\d+))?$`
- `M` = Month, `Q` = Quarter, `Y` = Year
- Optional `+/-` offset (e.g., `M-1` = previous month, `Q+2` = two quarters ahead)

**Validation Rules**:
- `label` must be non-empty
- `spec` must match the regex pattern
- `sortOrder` managed automatically by the composable during reorder operations
- At most one range may have `isDefault = true`

---

## Relationships

```
CATEGORY_V1 (self-referencing via PARENTID)
  ├── CHECKINGACCOUNT_V1.CATEGID (transactions)
  ├── SPLITTRANSACTIONS_V1.CATEGID (split transactions)
  ├── BILLSDEPOSITS_V1.CATEGID (recurring transactions)
  ├── BUDGETTABLE_V1.CATEGID (budgets)
  ├── BUDGETSPLITTRANSACTIONS_V1.CATEGID (budget splits)
  └── PAYEE_V1.CATEGID (default category)

PAYEE_V1
  ├── CHECKINGACCOUNT_V1.PAYEEID (transactions)
  └── BILLSDEPOSITS_V1.PAYEEID (recurring transactions)

TAG_V1
  └── TAGLINK_V1.TAGID → (REFTYPE, REFID) → multiple entity types

CUSTOMFIELD_V1
  └── CUSTOMFIELDDATA_V1.FIELDID → (REFID) → multiple entity types

SETTING_V1 (standalone key-value store, no FKs)
```

## Relocation Impact Matrix

**Unified Stats Structure**: All entity types return the same `RelocationStats` interface.
Fields not applicable to a given entity type are `0`. UI hides entries with value `0`.

| Field | Category | Payee | Tag |
|-------|----------|-------|-----|
| transactions | ✓ | ✓ | 0 |
| splitTransactions | ✓ | 0 | 0 |
| recurringTransactions | ✓ | ✓ | 0 |
| budgets | ✓ | 0 | 0 |
| budgetSplits | ✓ | 0 | 0 |
| payeeDefaults | ✓ | 0 | 0 |

Note: Tags use TAGLINK_V1 count mapped to `transactions` field (taglink count = usage count).

### Category Merge (source → target)

| Table | Column | Operation |
|-------|--------|-----------|
| CHECKINGACCOUNT_V1 | CATEGID | UPDATE SET CATEGID = target WHERE CATEGID = source |
| SPLITTRANSACTIONS_V1 | CATEGID | UPDATE SET CATEGID = target WHERE CATEGID = source |
| BILLSDEPOSITS_V1 | CATEGID | UPDATE SET CATEGID = target WHERE CATEGID = source |
| BUDGETTABLE_V1 | CATEGID | UPDATE SET CATEGID = target WHERE CATEGID = source |
| BUDGETSPLITTRANSACTIONS_V1 | CATEGID | UPDATE SET CATEGID = target WHERE CATEGID = source |
| PAYEE_V1 | CATEGID | UPDATE SET CATEGID = target WHERE CATEGID = source |

### Payee Merge (source → target)

| Table | Column | Operation |
|-------|--------|-----------|
| CHECKINGACCOUNT_V1 | PAYEEID | UPDATE SET PAYEEID = target WHERE PAYEEID = source |
| BILLSDEPOSITS_V1 | PAYEEID | UPDATE SET PAYEEID = target WHERE PAYEEID = source |

### Tag Merge (source → target)

| Table | Column | Operation |
|-------|--------|-----------|
| TAGLINK_V1 | TAGID | UPDATE SET TAGID = target WHERE TAGID = source AND NOT EXISTS duplicate |
| TAGLINK_V1 | (cleanup) | DELETE WHERE TAGID = source (remaining after unique conflict) |

## TypeScript Interfaces

```typescript
/** CATEGORY_V1 row */
interface Category {
  CATEGID: number
  CATEGNAME: string
  ACTIVE: number
  PARENTID: number
}

/** Tree node for QTree rendering */
interface CategoryNode {
  id: number
  label: string
  active: boolean
  parentId: number
  children: CategoryNode[]
}

/** PAYEE_V1 row */
interface Payee {
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
interface Tag {
  TAGID: number
  TAGNAME: string
  ACTIVE: number
}

/** TAGLINK_V1 row */
interface TagLink {
  TAGLINKID: number
  REFTYPE: string
  REFID: number
  TAGID: number
}

/** CUSTOMFIELD_V1 row */
interface CustomField {
  FIELDID: number
  REFTYPE: string
  DESCRIPTION: string
  TYPE: CustomFieldType
  PROPERTIES: string  // JSON string
}

type CustomFieldType =
  | 'String'
  | 'Integer'
  | 'Decimal'
  | 'Boolean'
  | 'Date'
  | 'Time'
  | 'SingleChoice'
  | 'MultiChoice'

/** Parsed PROPERTIES JSON */
interface CustomFieldProperties {
  regex?: string
  tooltip?: string
  autocomplete?: boolean
  default?: string
  choices?: string[]
  scale?: number
}

/** CUSTOMFIELDDATA_V1 row */
interface CustomFieldData {
  FIELDATADID: number
  FIELDID: number
  REFID: number
  CONTENT: string | null
}

/** SETTING_V1 row */
interface Setting {
  SETTINGID: number
  SETTINGNAME: string
  SETTINGVALUE: string | null
}

/** Relocation impact statistics — unified for all entity types */
interface RelocationStats {
  transactions: number         // Category: CHECKINGACCOUNT_V1; Payee: CHECKINGACCOUNT_V1; Tag: TAGLINK_V1 count
  splitTransactions: number    // Category only; Payee/Tag: 0
  recurringTransactions: number // Category + Payee; Tag: 0
  budgets: number              // Category only; Payee/Tag: 0
  budgetSplits: number         // Category only; Payee/Tag: 0
  payeeDefaults: number        // Category only; Payee/Tag: 0
}

/** Custom date range specification */
interface DateRangeSpec {
  label: string      // User-visible name, e.g., "Last Quarter"
  spec: string       // Formula: "M", "M-1", "Q", "Y-1", etc.
  isDefault: boolean // At most one range is default
  sortOrder: number  // Display order in filter lists
}

/** Resolved date range with concrete dates */
interface ResolvedDateRange {
  start: Date
  end: Date
}
```
