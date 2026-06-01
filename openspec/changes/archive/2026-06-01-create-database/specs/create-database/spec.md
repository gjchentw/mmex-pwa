## ADDED Requirements

### Requirement: Database probe on startup
The system SHALL probe OPFS for an existing database on every app load. The probe SHALL determine whether the database exists, what version it is at, and whether migration is needed.

#### Scenario: First-run probe (no DB exists)
- **WHEN** the app starts and no OPFS database file is found
- **THEN** the system SHALL create a new database with the schema from `mmex/database/tables.sql`, set `PRAGMA user_version` to the latest schema version, and transition to the `needs-wizard` state

#### Scenario: Existing DB at current version
- **WHEN** the app starts and an existing OPFS database is found at the latest schema version
- **THEN** the system SHALL open the database and transition to the `ready` state without running any migration

#### Scenario: Existing DB at a stale version
- **WHEN** the app starts and an existing OPFS database is found with a version lower than the latest schema version
- **THEN** the system SHALL run incremental upgrade scripts (from `mmex/database/incremental_upgrade/`) for each missing version, increment `PRAGMA user_version` after each upgrade, and transition to the `ready` state

#### Scenario: UPFS probe fails
- **WHEN** the OPFS probe throws an error (OPFS unavailable, file system error)
- **THEN** the system SHALL transition to the `error` state and display a full-page error with browser requirements and a retry button

### Requirement: Worker exposes open-or-create API
The Web Worker SHALL handle an `open-or-create` message type that performs the probe-and-init flow, and respond with `{ status, version }`.

#### Scenario: Worker receives open-or-create → creates new DB
- **WHEN** the Worker receives `open-or-create` and no DB exists in OPFS
- **THEN** the Worker SHALL create the new DB, run `tables.sql`, set `PRAGMA user_version`, and respond with `{ status: 'created', version: <latest> }`

#### Scenario: Worker receives open-or-create → opens existing DB
- **WHEN** the Worker receives `open-or-create` and a DB exists in OPFS
- **THEN** the Worker SHALL open the DB, call `migrateDb()` if needed, and respond with `{ status: 'existing', version: <version> }`

### Requirement: Worker exposes destroy API
The Web Worker SHALL handle a `destroy` message type that closes the database connection and deletes the OPFS file.

#### Scenario: Worker receives destroy
- **WHEN** the Worker receives `destroy`
- **THEN** the Worker SHALL close the database connection and delete the OPFS file, then respond with `{ status: 'success' }`

#### Scenario: Destroy fails
- **WHEN** the Worker receives `destroy` but the OPFS file cannot be deleted
- **THEN** the Worker SHALL respond with `{ status: 'error', message: <details> }`

### Requirement: Worker migration logic
The Worker SHALL implement a `migrateDb(db)` function that reads the current `PRAGMA user_version`, then applies incremental upgrade scripts from `mmex/database/incremental_upgrade/` for each missing version.

#### Scenario: Clean migration from version N to N+1
- **WHEN** `migrateDb` is called on a DB at version N and an upgrade script for N+1 exists
- **THEN** the Worker SHALL run the upgrade script in a transaction and increment `PRAGMA user_version` to N+1

#### Scenario: Legacy version 0 detection
- **WHEN** `migrateDb` reads `PRAGMA user_version` as 0
- **THEN** the Worker SHALL check `INFOTABLE_V1.DATAVERSION` for a legacy version, and if found, set `PRAGMA user_version` to that legacy version before continuing migration

#### Scenario: Upgrade SQL error
- **WHEN** an upgrade SQL script fails during migration
- **THEN** the Worker SHALL abort the migration, NOT commit the failed transaction, and return an error response with details

### Requirement: DbClient exposes openOrCreate and destroy methods
The `DbClient` class SHALL expose `openOrCreate(): Promise<{status, version}>` and `destroy(): Promise<void>` methods that wrap the Worker message passing.

#### Scenario: openOrCreate resolves
- **WHEN** a caller calls `dbClient.openOrCreate()`
- **THEN** the method SHALL send an `open-or-create` message to the Worker and resolve the promise with the response payload

#### Scenario: destroy resolves
- **WHEN** a caller calls `dbClient.destroy()`
- **THEN** the method SHALL send a `destroy` message to the Worker and resolve the promise when complete

### Requirement: Pinia store manages DB lifecycle state
A Pinia store (`database-store.ts`) SHALL define a reactive `DbState` union type and expose actions for `probe()`, `initNewDb()`, `destroyAndRecreate()`, and `reset()`.

#### Scenario: Store probe triggers worker
- **WHEN** `store.probe()` is called
- **THEN** the store SHALL set state to `probing`, call `dbClient.openOrCreate()`, and update state based on the response (`needs-wizard` for created, `ready` for existing, `error` on failure)

#### Scenario: Store initNewDb saves wizard data
- **WHEN** `store.initNewDb(currencyId, userName)` is called after the wizard is completed
- **THEN** the store SHALL call `dbClient.exec()` to save the base currency and user name to `CURRENCYFORMATS_V1` and `INFOTABLE_V1`, then set state to `ready`

#### Scenario: Store destroyAndRecreate
- **WHEN** `store.destroyAndRecreate()` is called
- **THEN** the store SHALL call `dbClient.destroy()`, then call `dbClient.openOrCreate()` again (entering the same flow as first run)

### Requirement: Router has /init route
The Vue Router SHALL define an `/init` route that renders `DatabaseInitPage.vue`, and a global `beforeEach` guard that redirects to `/init` when the DB is not in `ready` state.

#### Scenario: App loads with no DB
- **WHEN** the app loads and DB state is `uninitialized` or `probing`
- **THEN** the route guard SHALL redirect to `/init`

#### Scenario: App loads with ready DB
- **WHEN** the app loads and DB state is `ready`
- **THEN** the route guard SHALL allow navigation to the requested route

### Requirement: New Database Wizard
A single-page wizard SHALL be shown when a new DB is created. It SHALL include a searchable currency selector (152 ISO currencies) and an optional user name input.

#### Scenario: Wizard creates database
- **WHEN** the user selects a base currency, optionally enters a user name, and clicks `Create`
- **THEN** the system SHALL save the currency setting and user name to the database and transition to `ready`

#### Scenario: Wizard cancel
- **WHEN** the user clicks `Cancel` in the wizard
- **THEN** the system SHALL close the dialog (the DB already exists in `needs-wizard` state, the app remains on `/init`)

### Requirement: Manual "New Database" with confirmation
A confirmation dialog SHALL be shown when the user triggers "New Database" from the UI while a database is already open. The dialog SHALL warn that all data will be lost.

#### Scenario: Confirm destroy
- **WHEN** the user confirms the destroy warning
- **THEN** the system SHALL destroy the current OPFS database and enter the same new-DB flow as first run (probe → create → wizard)

#### Scenario: Cancel destroy
- **WHEN** the user cancels the destroy warning
- **THEN** the system SHALL dismiss the dialog and stay in `ready` state

### Requirement: Migration progress UI
A non-blocking progress indicator SHALL be shown while incremental upgrades are running.

#### Scenario: Migration completes
- **WHEN** migration finishes successfully
- **THEN** the system SHALL transition to `ready` and redirect to the dashboard

#### Scenario: Migration fails
- **WHEN** migration fails due to an SQL error
- **THEN** the system SHALL show an error dialog with failure details and a retry option

### Requirement: Currency data as JSON
The 152 ISO currency records matching `DB_Table_Currencyformats_V1.h::ensure_data()` SHALL be stored as `src/data/currencies.json` and loaded during new-DB initialization.

#### Scenario: Currencies loaded on new DB
- **WHEN** a new database is created and the wizard is shown
- **THEN** the currency selector SHALL be populated from `src/data/currencies.json`
