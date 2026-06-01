## Why

The PWA currently has no database lifecycle management. On every page load, `sqlite.worker.ts` unconditionally creates a fresh OPFS database — no probing for existing data, no migration from older schemas, no way to start fresh. Until this is fixed, the app cannot persist user data across sessions, making every PWA feature (transactions, accounts, reports) impossible.

## What Changes

- **Database state machine**: App startup probes OPFS; routes to init flow (new DB), migration (stale DB), or dashboard (ready DB)
- **Worker refactor**: Replace unconditional `initDb()` with `openOrCreate()` probe, add `destroy()` and `migrateDb()` operations
- **`DbClient` API**: Add `openOrCreate()`, `destroy()` methods
- **New Pinia store** (`database-store.ts`): Reactive `DbState` driving route guards and UI
- **New components**: `DatabaseInitPage`, `NewDatabaseWizard`, `DatabaseMigration`, `ConfirmDestroyDialog`
- **Currency data**: 152 ISO currencies extracted from C++ header as `src/data/currencies.json`, loaded during new-DB init
- **Router changes**: Add `/init` route; `App.vue` guards redirect to `/init` until DB is ready
- **BREAKING**: Worker no longer auto-initializes on instantiation; caller must `openOrCreate()` explicitly

## Capabilities

### New Capabilities
- `create-database`: OPFS database lifecycle — probe, create, open, migrate, destroy

### Modified Capabilities
- (none — no prior specs exist)

## Impact

- `src/workers/sqlite.worker.ts` — major refactor (add handlers, remove auto-init)
- `src/workers/db-client.ts` — add methods, simplify constructor
- `src/stores/database-store.ts` — new Pinia store
- `src/components/database/*.vue` — 3 new components
- `src/pages/DatabaseInitPage.vue` — new page
- `src/router/index.ts` — add `/init` route
- `src/App.vue` — DB-ready guard
- `src/data/currencies.json` — new data file
- `src/__tests__/` — unit tests for store and worker logic
- `e2e/` — E2E tests for 3 lifecycle scenarios
