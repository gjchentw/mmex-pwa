# Research: Organization & Tools Module

**Feature**: 002-organize-tools-module  
**Date**: 2026-03-19 (updated)

## 1. Vue Composable Pattern for Database CRUD

**Decision**: Use Vue 3 composables (`use*.ts`) to encapsulate all database operations and reactive state for each entity type. Composables call `dbClient.exec()` directly — no intermediate service or store layer.

**Rationale**: The existing codebase already implements this pattern across all six composables (`useCategories`, `usePayees`, `useTags`, `useCustomFields`, `useDateRanges`, `useSettings`). Composables provide reactive state management with `ref()`/`computed()` while keeping logic testable and reusable across views and dialogs.

**Alternatives considered**:
- Pinia stores per entity — rejected because entity lists are view-scoped (loaded when navigating to the management page) and don't need global singleton state.
- Direct SQL in components — rejected because it violates separation of concerns and makes testing difficult.

## 2. Hierarchical Category Tree Rendering

**Decision**: Use Quasar's `QTree` component with lazy-loading disabled (load all categories upfront). Categories are fetched as a flat list from SQLite and transformed client-side into a tree structure using `PARENTID` relationships.

**Rationale**: `QTree` natively supports hierarchical data with expand/collapse, selection, filtering, and drag-and-drop. The `useCategories` composable already computes a `tree: ComputedRef<CategoryNode[]>` from the flat category list. The transformation is O(n).

**Alternatives considered**:
- Custom recursive component — rejected; QTree provides all needed features out of the box.
- Lazy-loaded tree nodes — rejected; category counts are small enough to load fully.

## 3. Relocation/Merge Transaction Safety

**Decision**: All merge operations execute within a single `dbClient.execTransaction()` call, which sends an `exec-transaction` message to the worker. The worker wraps statements in a SQLite transaction (BEGIN/COMMIT with ROLLBACK on error).

**Rationale**: Constitution Principle I (Local First) requires zero data loss. The existing worker protocol already supports `exec-transaction` message type. All three composables (`useCategories`, `usePayees`, `useTags`) already use this pattern with arrays of `{ sql, bind? }` statements.

**Alternatives considered**:
- Multiple sequential exec calls — rejected; no atomicity guarantee across separate worker messages.
- Client-side rollback logic — rejected; complex and error-prone vs native SQLite transactions.

## 4. Unified Relocation Stats Structure

**Decision**: All entity types (Category, Payee, Tag) share the single `RelocationStats` interface. Fields not applicable to a given entity type are set to `0`. UI hides stats entries with value `0`.

**Rationale**: The spec clarification (Session 2026-03-19) explicitly chose a unified structure. The existing `RelocationStats` interface already has the correct fields (transactions, splitTransactions, recurringTransactions, budgets, budgetSplits, payeeDefaults).

**Current code issues**:
- `CategoriesView.vue` and `PayeesView.vue` cast `RelocationStats` to `Record<string, number>` — this causes a build error.
- `useTags` uses `getUsageCount()` instead of returning `RelocationStats`.
- `RelocateDialog.vue` accepts `Record<string, number>` instead of `RelocationStats`.

**Required changes**:
1. Update `RelocateDialog.vue` props from `Record<string, number>` to `RelocationStats`.
2. Update `usePayees.getRelocationStats()` to return full `RelocationStats` with zeros for inapplicable fields.
3. Add `getRelocationStats()` to `useTags` returning full `RelocationStats` with taglink count in a suitable field and zeros elsewhere.
4. Remove unsafe type casts in view files.
5. Update `RelocateDialog` template to iterate over `RelocationStats` entries, hiding `0` values.

**Alternatives considered**:
- Per-entity stats interfaces: Rejected because it adds type complexity without benefit.
- Keep `Record<string, number>`: Violates Constitution Principle VI (TypeScript Strictness).

## 5. Custom Fields JSON Properties Storage

**Decision**: Store custom field properties as a JSON string in the `PROPERTIES` column of `CUSTOMFIELD_V1`, matching the upstream MMEX C++ format. Parse with `JSON.parse()` on read, serialize with `JSON.stringify()` on write.

**Rationale**: Upstream compatibility (Constitution Principle V). The `CustomFieldProperties` interface maps the parsed JSON with keys: `regex`, `tooltip`, `autocomplete`, `default`, `choices`, `scale`.

**Alternatives considered**:
- Separate columns per property — rejected; schema change would break upstream compatibility.

## 6. Settings Persistence Strategy

**Decision**: Read/write preferences to the `SETTING_V1` table using key-value pairs. Settings are loaded into a reactive `Map<string, string | null>` composable on app startup and written back on change.

**Rationale**: Upstream MMEX stores all preferences in `SETTING_V1`. Map reassignment (`settings.value = new Map(settings.value)`) is required to trigger Vue reactivity since `Map.set()` mutations don't trigger updates.

**Alternatives considered**:
- localStorage — rejected; breaks Local First principle (data must be in OPFS SQLite).
- Pinia persisted store — rejected; adds a second persistence layer.

## 7. Dark/Light Theme Implementation

**Decision**: Use Quasar's built-in dark mode API (`Dark.set(true/false)`) triggered from the settings composable. Theme preference stored in `SETTING_V1` with key `THEME_MODE` (values: `light`, `dark`, `auto`).

**Rationale**: Quasar provides `$q.dark` and `Dark` plugin for toggle and detection. `auto` mode respects `prefers-color-scheme` media query.

**Alternatives considered**:
- CSS custom properties — rejected; Quasar already handles this.

## 8. Date Range Calculation Engine

**Decision**: Implement a lightweight date range calculator that parses spec strings matching `^([MQY])(?:([+-])(\d+))?$`. Period types: Month, Quarter, Year with optional numeric offsets.

**Rationale**: The existing `useDateRanges.resolve()` function already implements this. It handles year boundaries correctly (e.g., M-1 from January → December of previous year).

**Storage**: All custom date ranges stored as a single JSON array in `SETTING_V1` under a dedicated key. This avoids creating new database tables (upholding Constitution Principle V).

**Alternatives considered**:
- Day.js/date-fns library — evaluated but the spec parsing is domain-specific and simpler to implement directly.
- Dedicated DB table — rejected; diverges from upstream schema.

## 9. Tag Relocation Deduplication Strategy

**Decision**: Use a SQL self-join exclusion pattern to handle many-to-many tag merge. UPDATE non-conflicting taglinks, DELETE conflicting ones (where the target tag is already linked to the same ref).

**Rationale**: The existing `useTags.relocate()` already implements this correctly:
```sql
UPDATE TAGLINK_V1 SET TAGID = ? WHERE TAGID = ? AND TAGLINKID NOT IN (
  SELECT tl1.TAGLINKID FROM TAGLINK_V1 tl1
  INNER JOIN TAGLINK_V1 tl2 ON tl1.REFTYPE = tl2.REFTYPE AND tl1.REFID = tl2.REFID
  WHERE tl1.TAGID = ? AND tl2.TAGID = ?
)
DELETE FROM TAGLINK_V1 WHERE TAGID = ?
```

**Alternatives considered**:
- INSERT OR IGNORE + DELETE: Less efficient, creates new rows.
- Application-level dedup: Slower, risks race conditions.

## 10. Build Error Resolution Strategy

**Decision**: Fix the four TypeScript errors on the current branch as a prerequisite to this feature's implementation.

**Rationale**: Constitution Principles VI (TypeScript Strictness) and VII (CI/CD Discipline) require the build to pass.

**Errors and fixes**:
1. `SettingsPanel.vue:69` — missing `ref` import → add `ref` to `vue` import.
2. `CategoriesView.vue:149` — `RelocationStats` cast to `Record<string, number>` → update `RelocateDialog` prop type (see item 4).
3. `relocate.spec.ts:61,156,185` — `Object is possibly 'undefined'` → add non-null assertions with `!` operator.
4. `sqlite.worker.spec.ts:195` — incomplete `MessageEvent` mock → cast via `unknown` first.

## 11. i18n Strategy

**Decision**: All user-facing strings externalised in `src/locales/en-US.json` and `src/locales/zh-TW.json`. Upstream MMEX PO translations used as first choice.

**Rationale**: Constitutional requirement (Principle VIII). Existing locale files follow namespace patterns.

## 12. Testing Strategy

**Decision**: Unit test composables by mocking `dbClient.exec()` and `dbClient.execTransaction()` with `vi.mock()`. Test SQL generation, response parsing, and reactive state transitions.

**Rationale**: The existing test suite already establishes this pattern across all composables. Each test file mocks the worker client and validates the exact SQL statements and bindings generated by composable functions.
