# create-database — Tasks

## Task 1: Extract currency data

- [ ] Extract the 152 ISO currency records from `DB_Table_Currencyformats_V1.h::ensure_data()` into `src/data/currencies.json`
- [ ] Verify the JSON format matches the expected schema (id, name, symbol, code, etc.)

## Task 2: Refactor worker — add `open-or-create` and `destroy`

- [ ] Add `openOrCreate()` function to `sqlite.worker.ts`:
  - Probe OPFS: try opening without create flag
  - If exists: run `migrateDb()`, return `{ status: 'existing', version }`
  - If not: create with `'c'` flag, run `tablesSql`, set `PRAGMA user_version`, return `{ status: 'created', version }`
- [ ] Add `destroyDb()` function: close connection, delete OPFS file
- [ ] Add message handlers for `open-or-create` and `destroy`
- [ ] Remove the old `initDb()` / `openDb()` dual-path (replace with unified `openOrCreate()`)

## Task 3: Update `db-client.ts`

- [ ] Add `openOrCreate(): Promise<{status, version}>` method
- [ ] Add `destroy(): Promise<void>` method
- [ ] Remove the init/open dual-constructor pattern (simplify to single ready promise)

## Task 4: Create `database-store.ts` (Pinia)

- [ ] Define `DbState` union type
- [ ] Implement `probe()` action → calls `dbClient.openOrCreate()`
- [ ] Implement `initNewDb(currencyId, userName)` action
- [ ] Implement `destroyAndRecreate()` action
- [ ] Add reactive state: `state`, `version`, `error`, `migrationProgress`

## Task 5: Create `NewDatabaseWizard.vue`

- [ ] QDialog with QSelect for currency (searchable, 152 items)
- [ ] QInput for optional user name
- [ ] Cancel / Create buttons
- [ ] Emit or store the selected values on confirm

## Task 6: Create `DatabaseMigration.vue`

- [ ] QLinearProgress bar showing migration progress
- [ ] Text: "Upgrading database v{n} → v{n+1}..."
- [ ] Auto-dismiss on completion

## Task 7: Create `ConfirmDestroyDialog.vue`

- [ ] Warning text: "This will destroy the current database. All existing data will be lost. This action cannot be undone."
- [ ] [Cancel] and [Continue] buttons

## Task 8: Create `DatabaseInitPage.vue`

- [ ] Probe OPFS on mount
- [ ] Route based on state:
  - `probing` / `creating` → spinner
  - `needs-wizard` → NewDatabaseWizard
  - `migrating` → DatabaseMigration
  - `error` → error display + retry button

## Task 9: Update router and `App.vue`

- [ ] Add `/init` route
- [ ] Add global route guard: if DB not ready, redirect to `/init`
- [ ] Add "New Database" action (accessible from Dashboard) that shows ConfirmDestroyDialog

## Task 10: Unit tests

- [ ] Test `database-store.ts` with mocked worker
- [ ] Test `NewDatabaseWizard.vue` with @vue/test-utils
- [ ] Test `ConfirmDestroyDialog.vue`
- [ ] Test worker `openOrCreate()` logic with mocked OpfsDb

## Task 11: E2E tests

- [ ] Test first-run flow (no existing OPFS DB → wizard → ready)
- [ ] Test migration flow (create old-version DB → open → upgrade → ready)
- [ ] Test manual destroy + recreate flow
