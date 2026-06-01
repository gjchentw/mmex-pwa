## 1. Data Preparation

- [x] 1.1 Extract 168 currency records from `DB_Table_Currencyformats_V1.h::ensure_data()` into `src/data/currencies.json` with schema: id, name, prefix, suffix, decimalPoint, groupSeparator, unitName, centName, code, type, scale, baseRate

## 2. Worker Refactor

- [x] 2.1 Add `openOrCreate()` function: probe OPFS (open without create flag), if exists → `migrateDb()` and return `{ status: 'existing', version }`, if not → create with `'c'` flag, run `tablesSql`, set `PRAGMA user_version`, return `{ status: 'created', version }`
- [x] 2.2 Add `destroyDb()` function: close DB connection, delete OPFS file
- [x] 2.3 Update `migrateDb(db)` function: return final version number
- [x] 2.4 Add `open-or-create` and `destroy` message handlers to Worker
- [x] 2.5 Remove unconditional `initDb()` / `openDb()` auto-init

## 3. DbClient Update

- [x] 3.1 Add `openOrCreate(): Promise<{status, version}>` method
- [x] 3.2 Add `destroy(): Promise<void>` method
- [x] 3.3 Simplify to single ready promise (remove init/open dual-constructor pattern)

## 4. Pinia Store

- [x] 4.1 Define `DbState` union type: `'uninitialized' | 'probing' | 'creating' | 'opening' | 'migrating' | 'needs-wizard' | 'ready' | 'error'`
- [x] 4.2 Implement `probe()` action → calls `dbClient.openOrCreate()` and sets state based on response
- [x] 4.3 Implement `initNewDb(currencyId, userName)` action → saves wizard data via `dbClient.exec()`
- [x] 4.4 Implement `destroyAndRecreate()` action → calls `dbClient.destroy()` then `probe()`
- [x] 4.5 Implement `reset()` action → resets to `uninitialized`

## 5. UI Components

- [x] 5.1 Create `DatabaseInitPage.vue`: probe on mount, route based on state (probing→spinner, needs-wizard→wizard, migrating→progress, error→error+retry)
- [x] 5.2 Create `NewDatabaseWizard.vue`: QCard with QSelect for currency (168 items, searchable), QInput for optional user name, Cancel/Create buttons
- [x] 5.3 Create `DatabaseMigration.vue`: QLinearProgress bar, text "Upgrading database v{n} → v{n+1}...", auto-dismiss on completion
- [x] 5.4 Create `ConfirmDestroyDialog.vue`: warning text, Cancel/Continue buttons

## 6. Router & App

- [x] 6.1 Add `/init` route pointing to `DatabaseInitPage.vue`
- [x] 6.2 Add global `beforeEach` guard: if DB not `ready`, redirect to `/init`
- [x] 6.3 Add "New Database" action in UI that shows `ConfirmDestroyDialog`

## 7. Tests

- [x] 7.1 Unit test `database-store.ts` with mocked Worker
- [x] 7.2 Unit test `NewDatabaseWizard.vue` with @vue/test-utils
- [x] 7.3 Unit test `ConfirmDestroyDialog.vue`
- [x] 7.4 Unit test Worker `openOrCreate()` / `migrateDb()` / `destroy()` logic
- [x] 7.5 E2E test first-run flow (no DB → wizard → ready)
- [x] 7.6 E2E test migration flow (create old-version DB → open → upgrade → ready)
- [x] 7.7 E2E test manual destroy + recreate flow
