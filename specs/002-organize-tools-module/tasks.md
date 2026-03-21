# Tasks: 組織與工具模組 (Organize & Tools Module)

**Input**: Design documents from `/specs/002-organize-tools-module/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Included — Constitution Principle III mandates Test-First (TDD). Unit tests for all composables.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Single project layout at repository root: `src/`
- Composables: `src/composables/`
- Components: `src/components/`
- Views: `src/views/`
- Types: `src/types/`
- Tests: `src/__tests__/`
- Locales: `src/locales/`
- Workers: `src/workers/`

---

## Phase 1: Setup (Build Error Fixes + Shared Infrastructure)

**Purpose**: Fix pre-existing TypeScript build errors on the feature branch, create shared type definitions, and register routes

- [X] T001 [P] Fix missing `ref` import — add `ref` to the `import { ... } from 'vue'` statement in src/components/SettingsPanel.vue
- [X] T002 [P] Fix incomplete MessageEvent mock — cast mock object via `as unknown as MessageEvent` for type safety in src/__tests__/sqlite.worker.spec.ts
- [X] T003 [P] Fix possibly-undefined object errors — add non-null assertion operator `!` at result access points (lines 61, 156, 185) in src/__tests__/relocate.spec.ts
- [X] T004 [P] Create shared TypeScript entity interfaces (Category, CategoryNode, Payee, Tag, TagLink, CustomField, CustomFieldType, CustomFieldProperties, CustomFieldData, Setting, RelocationStats, DateRangeSpec, ResolvedDateRange) in src/types/entities.ts
- [X] T005 [P] Add routes for /categories, /payees, /tags, /custom-fields, /date-ranges, /settings views in src/router/index.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Extend worker protocol for atomic multi-statement transactions; align RelocateDialog to unified RelocationStats type contract

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Tests (write first, must FAIL before implementation)

- [X] T006 [P] Write unit test for exec-transaction worker message handler (success, rollback on error, empty statements) in src/__tests__/sqlite.worker.spec.ts
- [X] T007 [P] Write unit test for execTransaction method on DbClient (sends correct message, resolves on success, rejects on error) in src/__tests__/db-client.spec.ts

### Implementation

- [X] T008 [P] Implement exec-transaction message handler in self.onmessage switch block — execute statements array within db.transaction() in src/workers/sqlite.worker.ts
- [X] T009 Implement execTransaction(statements) method on DbClient class — send exec-transaction message and handle response in src/workers/db-client.ts
- [X] T010 Align RelocateDialog to unified RelocationStats type — change props from Record<string, number> to RelocationStats, iterate over typed fields, hide entries with value 0 in src/components/RelocateDialog.vue
- [X] T011 Remove unsafe `as Record<string, number>` cast on RelocationStats in src/views/CategoriesView.vue (depends on T010)

**Checkpoint**: Build passes with zero TypeScript errors. Worker supports atomic multi-statement execution. RelocateDialog accepts typed RelocationStats. User story implementation can begin.

---

## Phase 3: User Story 1 — 類別管理 (Priority: P1) 🎯 MVP

**Goal**: CRUD management for hierarchical categories with tree rendering, active/hidden toggle, and reference-safe deletion

**Independent Test**: 開啟類別管理介面，新增一個父類別與子類別，編輯名稱，再刪除未使用的類別，驗證樹狀結構正確呈現

**Covers**: FR-001, FR-002, FR-003, FR-004, FR-005

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T012 [P] [US1] Write unit tests for useCategories composable (refresh, create, rename, remove, toggleActive, isUsed, hasChildren, fullName, flat-to-tree transform) in src/__tests__/useCategories.spec.ts

### Implementation for User Story 1

- [X] T013 [US1] Implement useCategories composable with CRUD operations, tree computed property (flat→CategoryNode[]), and validation (unique name per parent via CATEGNAME+PARENTID index) in src/composables/useCategories.ts
- [X] T014 [US1] Create CategoryTreeDialog component using QDialog + useDialogPluginComponent() + QInput for category name creation and editing in src/components/CategoryTreeDialog.vue
- [X] T015 [US1] Create CategoriesView page with QTree display, toolbar (add root/add child/edit/delete/toggle active), and search filter in src/views/CategoriesView.vue
- [X] T016 [P] [US1] Add category management i18n keys (categories namespace: name, addRoot, addChild, rename, delete, hide, show, inUse, hasChildren, duplicateName) in src/locales/en-US.json and src/locales/zh-TW.json

**Checkpoint**: Category CRUD with hierarchical tree fully functional and independently testable

---

## Phase 4: User Story 2 — 收款人管理 (Priority: P1)

**Goal**: CRUD management for payees with default category, match patterns, and reference-safe deletion

**Independent Test**: 新增一個收款人並設定預設類別，驗證在建立交易時選擇該收款人後類別自動填入

**Covers**: FR-006, FR-007, FR-008, FR-009, FR-010, FR-011

### Tests for User Story 2

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T017 [P] [US2] Write unit tests for usePayees composable (refresh, create, update, remove, toggleActive, isUsed, pattern management) in src/__tests__/usePayees.spec.ts

### Implementation for User Story 2

- [X] T018 [US2] Implement usePayees composable with CRUD operations, pattern field handling (newline-separated regex), and validation (globally unique PAYEENAME) in src/composables/usePayees.ts
- [X] T019 [US2] Create PayeeDialog component using QDialog + useDialogPluginComponent() with form fields (name, default category via QSelect with useCategories, number, website, notes, pattern textarea) in src/components/PayeeDialog.vue
- [X] T020 [US2] Create PayeesView page with QTable listing, search, active/hidden filter, and toolbar (add/edit/delete/toggle active) in src/views/PayeesView.vue
- [X] T021 [P] [US2] Add payee management i18n keys (payees namespace: name, defaultCategory, number, website, notes, pattern, inUse, duplicateName) in src/locales/en-US.json and src/locales/zh-TW.json

**Checkpoint**: Payee CRUD with all fields fully functional and independently testable

---

## Phase 5: User Story 3 — 標籤管理 (Priority: P2)

**Goal**: CRUD management for tags with globally unique names, active/hidden toggle, and reference-safe deletion

**Independent Test**: 新增數個標籤，切換至交易編輯介面驗證可選取多個標籤並儲存

**Covers**: FR-012, FR-013, FR-014, FR-015

### Tests for User Story 3

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T022 [P] [US3] Write unit tests for useTags composable (refresh, create, rename, remove, toggleActive, isUsed, getUsageCount) in src/__tests__/useTags.spec.ts

### Implementation for User Story 3

- [X] T023 [US3] Implement useTags composable with CRUD operations and validation (globally unique TAGNAME, deletion blocked if referenced in TAGLINK_V1) in src/composables/useTags.ts
- [X] T024 [US3] Create TagDialog component using QDialog + useDialogPluginComponent() + QInput for tag name creation and editing in src/components/TagDialog.vue
- [X] T025 [US3] Create TagsView page with QTable listing, search, active/hidden filter, and toolbar (add/edit/delete/toggle active) in src/views/TagsView.vue
- [X] T026 [P] [US3] Add tag management i18n keys (tags namespace: name, rename, delete, hide, show, inUse, duplicateName, usageCount) in src/locales/en-US.json and src/locales/zh-TW.json

**Checkpoint**: Tag CRUD fully functional and independently testable

---

## Phase 6: User Story 4 — 資料整併工具 (Priority: P2)

**Goal**: Merge/relocate tool for categories, payees, and tags — atomic multi-table UPDATE within a single transaction, with unified RelocationStats impact preview and optional source deletion

**Independent Test**: 建立兩個相似的收款人，使用整併工具將來源合併至目標，驗證所有交易紀錄已更新且來源項目可選擇刪除

**Covers**: FR-016, FR-017, FR-018, FR-019, FR-019a, FR-020, FR-021, FR-021a

**Dependencies**: Requires US1 (useCategories), US2 (usePayees), US3 (useTags) composables and Phase 2 (exec-transaction + typed RelocateDialog)

### Tests for User Story 4

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T027 [P] [US4] Write unit tests for relocation logic (category merge SQL generation across 6 tables, payee merge across 2 tables, tag merge with duplicate link handling, self-merge rejection, getRelocationStats for all 3 entity types returning unified RelocationStats) in src/__tests__/relocate.spec.ts

### Implementation for User Story 4

- [X] T028 [P] [US4] Add relocate(sourceId, targetId, deleteSource) and getRelocationStats(sourceId) methods to useCategories — generate UPDATE statements for CHECKINGACCOUNT_V1, SPLITTRANSACTIONS_V1, BILLSDEPOSITS_V1, BUDGETTABLE_V1, BUDGETSPLITTRANSACTIONS_V1, PAYEE_V1 via execTransaction; stats query counts all 6 tables in src/composables/useCategories.ts
- [X] T029 [P] [US4] Add relocate(sourceId, targetId, deleteSource) and getRelocationStats(sourceId) methods to usePayees — generate UPDATE statements for CHECKINGACCOUNT_V1, BILLSDEPOSITS_V1 via execTransaction; return unified RelocationStats with inapplicable fields (splitTransactions, budgets, budgetSplits, payeeDefaults) = 0 in src/composables/usePayees.ts
- [X] T030 [P] [US4] Add relocate(sourceId, targetId, deleteSource) and getRelocationStats(sourceId) methods to useTags — UPDATE TAGLINK_V1 with self-join dedup pattern via execTransaction; return unified RelocationStats with taglink count in transactions field, all other fields = 0 in src/composables/useTags.ts
- [X] T031 [US4] Integrate RelocateDialog into CategoriesView, PayeesView, and TagsView toolbar (add "Merge" action button that passes entity-specific getRelocationStats and relocate callbacks) in src/views/CategoriesView.vue, src/views/PayeesView.vue, and src/views/TagsView.vue
- [X] T032 [P] [US4] Add relocation i18n keys (relocation namespace: mergeTitle, source, target, impactSummary, transactions, splitTransactions, recurringTransactions, budgets, budgetSplits, payeeDefaults, deleteSource, confirm, selfMergeError) in src/locales/en-US.json and src/locales/zh-TW.json

**Checkpoint**: Merge tool works for all three entity types with atomic transactions, unified RelocationStats impact preview (zero-value fields hidden), and optional source deletion

---

## Phase 7: User Story 5 — 自訂欄位管理 (Priority: P3)

**Goal**: Define custom field definitions (8 data types) per entity type, store/retrieve field values per record, with cascading delete

**Independent Test**: 建立一個文字型自訂欄位並指定適用於交易，驗證在交易編輯介面中出現該欄位並可填入資料

**Covers**: FR-022, FR-023, FR-024, FR-025

### Tests for User Story 5

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T033 [P] [US5] Write unit tests for useCustomFields composable (field CRUD, getByRefType, parseProperties, getData, saveData, deleteData, type validation for 8 types, regex validation) in src/__tests__/useCustomFields.spec.ts

### Implementation for User Story 5

- [X] T034 [US5] Implement useCustomFields composable with field definition CRUD, data CRUD, PROPERTIES JSON parse/serialize, and type-specific validation (String/Integer/Decimal/Boolean/Date/Time/SingleChoice/MultiChoice) in src/composables/useCustomFields.ts
- [X] T035 [US5] Create CustomFieldDialog component using QDialog + useDialogPluginComponent() with field type selector (QSelect, 8 types), REFTYPE selector (6 entity types), description input, and dynamic properties form (regex, tooltip, autocomplete, default, choices for SingleChoice/MultiChoice) in src/components/CustomFieldDialog.vue
- [X] T036 [US5] Create CustomFieldsView page with QTable listing grouped by REFTYPE, toolbar (add/edit/delete), and cascade-delete confirmation warning in src/views/CustomFieldsView.vue
- [X] T037 [P] [US5] Add custom field i18n keys (customFields namespace: description, type, refType, properties, regex, tooltip, autocomplete, defaultValue, choices, cascadeDeleteWarning, types.String, types.Integer, types.Decimal, types.Boolean, types.Date, types.Time, types.SingleChoice, types.MultiChoice) in src/locales/en-US.json and src/locales/zh-TW.json

**Checkpoint**: Custom field definitions and data storage fully functional

---

## Phase 8: User Story 6 — 偏好設定 (Priority: P3)

**Goal**: Preferences UI with tabbed layout for language, date format, base currency, username, and theme (dark/light/auto) — persisted to SETTING_V1

**Independent Test**: 開啟偏好設定介面，變更日期格式與語言，驗證整個系統介面立即反映新設定

**Covers**: FR-026, FR-027, FR-028, FR-029

### Tests for User Story 6

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T038 [P] [US6] Write unit tests for useSettings composable (refresh, get/set/remove, convenience getters for language/dateFormat/baseCurrencyId/userName/themeMode, immediate reactivity via Map reassignment) in src/__tests__/useSettings.spec.ts

### Implementation for User Story 6

- [X] T039 [US6] Implement useSettings composable with reactive Map<string, string|null>, get/set/remove operations (Map reassignment for reactivity), and computed convenience getters — use Quasar Dark.set() for theme toggle in src/composables/useSettings.ts
- [X] T040 [US6] Create SettingsPanel component with QTabs layout (General tab: language QSelect, date format QSelect, base currency QSelect, username QInput; Appearance tab: theme mode QOptionGroup light/dark/auto) in src/components/SettingsPanel.vue
- [X] T041 [US6] Expand existing SettingsView to integrate SettingsPanel with unsaved-changes detection and immediate-apply behavior in src/views/SettingsView.vue
- [X] T042 [P] [US6] Add settings and preferences i18n keys (settings namespace: general, appearance, language, dateFormat, baseCurrency, userName, themeMode, light, dark, auto, unsavedChanges) in src/locales/en-US.json and src/locales/zh-TW.json

**Checkpoint**: Preferences with tabbed UI, theme toggle, and immediate-apply fully functional

---

## Phase 9: User Story 7 — 自訂日期範圍管理 (Priority: P3)

**Goal**: Create/manage custom date ranges with MMEX DateRange2::Spec syntax (M, M-1, Q, Y-1, etc.), reorder, set default, and resolve to concrete start/end dates

**Independent Test**: 建立一個自訂日期範圍「上季」，驗證在報表篩選器中可選取該範圍並正確計算日期

**Covers**: FR-030, FR-031, FR-032, FR-033

**Dependencies**: Requires US6 (useSettings) for storage in SETTING_V1 under key CUSTOM_DATE_RANGES

### Tests for User Story 7

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T043 [P] [US7] Write unit tests for useDateRanges composable (CRUD, reorder, setDefault, resolve spec strings M/M-1/Q/Q-1/Y/Y-1 to concrete dates, edge cases for year/quarter boundaries) in src/__tests__/useDateRanges.spec.ts

### Implementation for User Story 7

- [X] T044 [US7] Implement useDateRanges composable with spec string parser (regex: ^([MQY])(?:([+-])(\d+))?$), date resolver (period type + offset calculation), and CRUD operations persisted as JSON array via useSettings in src/composables/useDateRanges.ts
- [X] T045 [US7] Create DateRangeDialog component using QDialog + useDialogPluginComponent() with label QInput, spec QSelect (predefined options M/M-1/Q/Q-1/Y/Y-1 + custom input), and preview showing resolved start/end dates in src/components/DateRangeDialog.vue
- [X] T046 [US7] Create DateRangesView page with QTable listing showing label/spec/resolved dates, toolbar (add/edit/delete/reorder/set default), and drag-to-reorder support in src/views/DateRangesView.vue
- [X] T047 [P] [US7] Add date range i18n keys (dateRanges namespace: label, spec, startDate, endDate, setDefault, reorder, specOptions.currentMonth, specOptions.lastMonth, specOptions.currentQuarter, specOptions.lastQuarter, specOptions.currentYear, specOptions.lastYear) in src/locales/en-US.json and src/locales/zh-TW.json

**Checkpoint**: Custom date ranges fully functional with correct spec resolution

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Shared i18n keys, final validation, and cleanup

- [X] T048 [P] Add common shared i18n keys (common namespace: save, cancel, confirm, delete, edit, add, search, filter, active, hidden, error, success, noData) in src/locales/en-US.json and src/locales/zh-TW.json
- [X] T049 Run type-check (npx vue-tsc --noEmit) and verify 0 TypeScript errors
- [X] T050 Run all unit tests (npm run test:unit) and verify 100% pass rate
- [X] T051 Run quickstart.md validation — verify all views accessible via routes, all composables importable, and dev server starts without errors

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (types must exist, build errors fixed) — BLOCKS all user stories
- **User Stories (Phase 3–9)**: All depend on Phase 2 completion
  - User stories can proceed in parallel (if staffed) or sequentially in priority order
- **Polish (Phase 10)**: Depends on all desired user stories being complete

### User Story Dependencies

- **US1 — Categories (P1)**: Can start after Phase 2 — no dependencies on other stories
- **US2 — Payees (P1)**: Can start after Phase 2 — soft dependency on US1 for PayeeDialog category picker (QSelect uses useCategories for default category selection)
- **US3 — Tags (P2)**: Can start after Phase 2 — no dependencies on other stories
- **US4 — Relocation (P2)**: **Depends on US1 + US2 + US3** — extends their composables with merge methods; requires exec-transaction from Phase 2 and typed RelocateDialog from T010
- **US5 — Custom Fields (P3)**: Can start after Phase 2 — no dependencies on other stories
- **US6 — Settings (P3)**: Can start after Phase 2 — no dependencies on other stories
- **US7 — Date Ranges (P3)**: **Depends on US6** — uses useSettings composable for JSON persistence in SETTING_V1

### Within Each User Story

1. Tests MUST be written and FAIL before implementation
2. Composable before components/dialogs
3. Dialogs before views (views import dialogs)
4. i18n keys can be prepared in parallel with UI tasks
5. Story complete before moving to next priority

### Parallel Opportunities

- **Phase 1**: T001–T005 all in different files → all parallel
- **Phase 2**: T006 and T007 (tests) parallel; T008 parallel with T010; T009 depends on T008; T011 depends on T010
- **Phase 3–9**: Test tasks (T012, T017, T022, T027, T033, T038, T043) and i18n tasks are always [P]
- **After Phase 2**: US1, US2, US3, US5, US6 can all start in parallel (different composable files)
- **After US1+US2+US3**: US4 (Relocation) — T028, T029, T030 are parallel (different composable files)
- **After US6**: US7 can start immediately

---

## Parallel Example: User Story 1

```bash
# Write tests first (RED):
Task: T012 "Write unit tests for useCategories composable in src/__tests__/useCategories.spec.ts"

# Implement composable (GREEN):
Task: T013 "Implement useCategories composable in src/composables/useCategories.ts"

# Build UI (can launch i18n in parallel with dialog/view):
Task: T016 "Add category i18n keys in src/locales/en-US.json and src/locales/zh-TW.json"  ← [P]
Task: T014 "Create CategoryTreeDialog in src/components/CategoryTreeDialog.vue"
Task: T015 "Create CategoriesView in src/views/CategoriesView.vue"
```

## Parallel Example: User Story 4 (Relocation)

```bash
# Write tests first (RED):
Task: T027 "Write unit tests for relocation logic in src/__tests__/relocate.spec.ts"

# Implement all three entity relocation methods in parallel (GREEN):
Task: T028 "Add relocate + getRelocationStats to useCategories in src/composables/useCategories.ts"  ← [P]
Task: T029 "Add relocate + getRelocationStats to usePayees in src/composables/usePayees.ts"          ← [P]
Task: T030 "Add relocate + getRelocationStats to useTags in src/composables/useTags.ts"              ← [P]

# Then build shared UI integration:
Task: T031 "Integrate RelocateDialog into CategoriesView, PayeesView, TagsView"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (fix build errors + types + routes)
2. Complete Phase 2: Foundational (exec-transaction + unified RelocateDialog)
3. Complete Phase 3: User Story 1 — Categories
4. **STOP and VALIDATE**: Test category CRUD with tree independently
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Build passes, foundation ready
2. Add US1 (Categories) → Test independently → Deploy (MVP!)
3. Add US2 (Payees) → Test independently → Deploy
4. Add US3 (Tags) → Test independently → Deploy
5. Add US4 (Relocation) → Test merge across all 3 entities with unified stats → Deploy
6. Add US5 (Custom Fields) → Test independently → Deploy
7. Add US6 (Settings) → Test preferences → Deploy
8. Add US7 (Date Ranges) → Test spec resolution → Deploy
9. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Phase 2 is done:
   - Developer A: US1 (Categories) → US4 (Relocation)
   - Developer B: US2 (Payees) + US3 (Tags)
   - Developer C: US5 (Custom Fields) + US6 (Settings) → US7 (Date Ranges)
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- TDD: verify tests fail before implementing (Constitution Principle III)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- All relocation operations use `dbClient.execTransaction()` for atomicity (Constitution Principle I)
- All entity types return unified `RelocationStats` — inapplicable fields = 0, UI hides zero entries (FR-019)
- i18n keys use upstream MMEX PO translations first (Constitution Principle VIII)
