# Composable API Contracts

**Feature**: 002-organize-tools-module  
**Date**: 2026-03-19 (updated)

## useCategories()

```typescript
interface UseCategoriesReturn {
  /** Flat list of all categories from DB */
  categories: Ref<Category[]>
  /** Tree structure for QTree rendering */
  tree: ComputedRef<CategoryNode[]>
  /** Loading state */
  loading: Ref<boolean>

  /** Fetch all categories from DB */
  refresh(): Promise<void>
  /** Create a new category. Returns the new CATEGID. */
  create(name: string, parentId: number): Promise<number>
  /** Update category name */
  rename(categId: number, newName: string): Promise<void>
  /** Delete a category (fails if in use or has children) */
  remove(categId: number): Promise<void>
  /** Toggle active/hidden status */
  toggleActive(categId: number): Promise<void>
  /** Check if category is referenced by any record */
  isUsed(categId: number): Promise<boolean>
  /** Check if category has child categories */
  hasChildren(categId: number): boolean
  /** Get full path name (e.g., "Food:Groceries") */
  fullName(categId: number): string
  /** Get relocation impact statistics */
  getRelocationStats(sourceId: number): Promise<RelocationStats>
  /** Merge source category into target (atomic transaction) */
  relocate(sourceId: number, targetId: number, deleteSource: boolean): Promise<void>
}
```

## usePayees()

```typescript
interface UsePayeesReturn {
  /** List of all payees from DB */
  payees: Ref<Payee[]>
  /** Loading state */
  loading: Ref<boolean>

  /** Fetch all payees from DB */
  refresh(): Promise<void>
  /** Create a new payee. Returns the new PAYEEID. */
  create(name: string): Promise<number>
  /** Update payee fields */
  update(payee: Partial<Payee> & { PAYEEID: number }): Promise<void>
  /** Delete a payee (fails if in use) */
  remove(payeeId: number): Promise<void>
  /** Toggle active/hidden status */
  toggleActive(payeeId: number): Promise<void>
  /** Check if payee is referenced by any transaction */
  isUsed(payeeId: number): Promise<boolean>
  /** Get relocation impact statistics (unified structure, inapplicable fields = 0) */
  getRelocationStats(sourceId: number): Promise<RelocationStats>
  /** Merge source payee into target (atomic transaction) */
  relocate(sourceId: number, targetId: number, deleteSource: boolean): Promise<void>
}
```

## useTags()

```typescript
interface UseTagsReturn {
  /** List of all tags from DB */
  tags: Ref<Tag[]>
  /** Loading state */
  loading: Ref<boolean>

  /** Fetch all tags from DB */
  refresh(): Promise<void>
  /** Create a new tag. Returns the new TAGID. */
  create(name: string): Promise<number>
  /** Rename a tag */
  rename(tagId: number, newName: string): Promise<void>
  /** Delete a tag (fails if in use) */
  remove(tagId: number): Promise<void>
  /** Toggle active/hidden status */
  toggleActive(tagId: number): Promise<void>
  /** Check if tag is referenced by any taglink */
  isUsed(tagId: number): Promise<boolean>
  /** Get count of taglinks referencing this tag */
  getUsageCount(tagId: number): Promise<number>
  /** Get relocation impact statistics (unified structure: taglink count in transactions field, rest = 0) */
  getRelocationStats(sourceId: number): Promise<RelocationStats>
  /** Merge source tag into target (atomic, handles duplicate links) */
  relocate(sourceId: number, targetId: number, deleteSource: boolean): Promise<void>
}
```

## useCustomFields()

```typescript
interface UseCustomFieldsReturn {
  /** List of all custom field definitions */
  fields: Ref<CustomField[]>
  /** Loading state */
  loading: Ref<boolean>

  /** Fetch all field definitions from DB */
  refresh(): Promise<void>
  /** Create a new field definition. Returns the new FIELDID. */
  create(field: Omit<CustomField, 'FIELDID'>): Promise<number>
  /** Update a field definition */
  update(field: Partial<CustomField> & { FIELDID: number }): Promise<void>
  /** Delete a field definition (cascades to all stored data) */
  remove(fieldId: number): Promise<void>
  /** Get fields applicable to a specific entity type */
  getByRefType(refType: string): CustomField[]
  /** Parse PROPERTIES JSON string */
  parseProperties(properties: string): CustomFieldProperties

  /** Get stored data values for a specific entity record */
  getData(refType: string, refId: number): Promise<CustomFieldData[]>
  /** Save a field value for a specific entity record */
  saveData(fieldId: number, refId: number, content: string | null): Promise<void>
  /** Delete all field data for a specific entity record */
  deleteData(refType: string, refId: number): Promise<void>
}
```

## useSettings()

```typescript
interface UseSettingsReturn {
  /** Reactive map of setting key → value */
  settings: Ref<Map<string, string | null>>
  /** Loading state */
  loading: Ref<boolean>

  /** Load all settings from DB */
  refresh(): Promise<void>
  /** Get a single setting value */
  get(key: string, defaultValue?: string): string | null
  /** Set a single setting value (persists to DB immediately) */
  set(key: string, value: string): Promise<void>
  /** Delete a setting */
  remove(key: string): Promise<void>

  /** Convenience getters */
  language: ComputedRef<string>
  dateFormat: ComputedRef<string>
  baseCurrencyId: ComputedRef<number | null>
  userName: ComputedRef<string>
  themeMode: ComputedRef<'light' | 'dark' | 'auto'>
}
```

## useDateRanges()

```typescript
interface DateRangeSpec {
  label: string
  spec: string           // e.g., "M", "M-1", "Q", "Y-1"
  isDefault: boolean
  sortOrder: number
}

interface ResolvedDateRange {
  start: Date
  end: Date
}

interface UseDateRangesReturn {
  /** List of all custom date ranges */
  ranges: Ref<DateRangeSpec[]>
  /** Loading state */
  loading: Ref<boolean>

  /** Load date ranges from settings */
  refresh(): Promise<void>
  /** Add a new date range */
  create(spec: Omit<DateRangeSpec, 'sortOrder'>): Promise<void>
  /** Update a date range */
  update(index: number, spec: Partial<DateRangeSpec>): Promise<void>
  /** Delete a date range */
  remove(index: number): Promise<void>
  /** Reorder ranges */
  reorder(fromIndex: number, toIndex: number): Promise<void>
  /** Set a range as default */
  setDefault(index: number): Promise<void>

  /** Resolve a spec string to concrete start/end dates */
  resolve(spec: string, referenceDate?: Date): ResolvedDateRange
}
```
