# create-database — Specification

## 1. Database State Machine

The PWA application lifecycle is gated by the OPFS database state:

```
                    ┌─────────────────────┐
                    │    App Start        │
                    │  (Browser loads)    │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │  Probe OPFS for DB  │
                    └──────────┬──────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
          ▼                    ▼                    ▼
   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
   │ S1: No DB    │    │ S2: DB Found │    │ E: Error     │
   │ in OPFS      │    │              │    │ (OPFS fail)  │
   └──────┬───────┘    └──────┬───────┘    └──────┬───────┘
          │                   │                    │
          ▼                   ▼                    ▼
   ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐
   │ Init new DB  │    │ Open DB      │    │ Show error page  │
   │ (tables.sql  │    │ Read version │    │ with retry       │
   │  + version)  │    └──────┬───────┘    └──────────────────┘
   └──────┬───────┘           │
          │            ┌──────┴──────┐
          ▼            │             │
   ┌──────────────┐    ▼             ▼
   │ S1a: Wizard  │    ┌──────┐ ┌──────────┐
   │ select curr  │    │ OK  │ │ Stale    │
   │ + username   │    └──┬───┘ └────┬─────┘
   └──────┬───────┘       │          │
          │               │    ┌─────▼──────┐
          ▼               │    │ Run one or │
   ┌──────────────┐       │    │ more incr. │
   │ S1b: Ready   │       │    │ upgrades   │
   └──────────────┘       │    └─────┬──────┘
                          │          │
                          ├──────────┘
                          ▼
                   ┌──────────────┐
                   │ S2b: Ready   │
                   └──────────────┘
```

When the user is in **S1b / S2b (Ready)** and triggers "New Database" manually:

```
  ┌──────────────┐
  │ S3: User     │
  │ clicks       │
  │ "New DB"     │
  └──────┬───────┘
         │
         ▼
  ┌──────────────┐
  │ Warning      │  "Database will be destroyed"
  │ Dialog       │  [Cancel] → return to Ready
  └──────┬───────┘  [Confirm] → continue
         │ (Confirm)
         ▼
  ┌──────────────┐
  │ Destroy OPFS │  Close DB, delete OPFS file
  │ DB           │
  └──────┬───────┘
         │
         ▼
  ┌──────────────┐
  │ → S1: Init   │  (same as first-run flow)
  │   new DB     │
  └──────────────┘
```

## 2. Worker API

The `sqlite.worker.ts` and `db-client.ts` layer must expose the following operations:

| Message type | Direction | Payload | Returns | Description |
|---|---|---|---|---|
| `open-or-create` | Client → Worker | none | `{ status, version }` | Probe OPFS. If DB exists, open it and trigger migration if needed. If not, create new DB (run tables.sql, set PRAGMA user_version). |
| `exec` | Client → Worker | `{ sql, bind? }` | `{ rows }` | Execute arbitrary SQL (for wizard data, queries, etc.) |
| `destroy` | Client → Worker | none | `{ status }` | Close DB connection and delete the OPFS file. |

### Worker internal flow for `open-or-create`:

```
openOrCreate():
  1. Try OpfsDb(path)  — open existing (no create flag)
     ├── Success:
     │     migrateDb()  — check version, run upgrades if needed
     │     postMessage({ type: 'open-or-create', status: 'existing', version })
     │
     └── Fail (file not found):
           OpfsDb(path, 'c')  — create new
           db.exec(tablesSql)
           db.exec("PRAGMA user_version = {latestVersion}")
           postMessage({ type: 'open-or-create', status: 'created', version: latestVersion })
```

### Worker internal flow for `migrateDb`:

```
migrateDb(db):
  1. version = PRAGMA user_version
  2. if version == 0:
       → Check legacy INFOTABLE_V1.DATAVERSION
       → if found, set PRAGMA user_version = legacy version
       → if not found (brand new empty DB with tables already created):
           return  (already up-to-date via open-or-create path)
  3. while upgrades.has(version + 1):
       → db.transaction():
           run each statement from upgrade SQL file
           PRAGMA user_version = ++version
  4. return final version
```

## 3. New Database Wizard UX (Scenario 1)

A single-page wizard shown immediately after DB initialization when no prior database existed.

### Dialog layout (Quasar QDialog / QStepper):

```
┌─────────────────────────────────────┐
│  Create New Database                │
│                                     │
│  ┌─────────────────────────────────┐│
│  │ Base Currency                   ││
│  │ ┌─────────────────────────┬────┐││
│  │ │ US Dollar (USD)         │ ▼  │││
│  │ └─────────────────────────┴────┘││
│  │ 152 ISO currencies, searchable  ││
│  └─────────────────────────────────┘│
│                                     │
│  ┌─────────────────────────────────┐│
│  │ User Name (optional)            ││
│  │ ┌─────────────────────────────┐ ││
│  │ │                             │ ││
│  │ └─────────────────────────────┘ ││
│  │ Used as database title for      ││
│  │ displayed and printed reports   ││
│  └─────────────────────────────────┘│
│                                     │
│     [Cancel]           [Create]     │
└─────────────────────────────────────┘
```

- Currency selector: QSelect with filtering, 152 entries from predefined list
- User name: QInput, optional
- Cancel: close dialog, do nothing (but DB already exists — app remains in usable state)
- Create: save base currency + user name to DB settings → transition to Ready

## 4. Version Migration UX (Scenario 2)

When an existing database needs upgrading, show a non-blocking progress indication:

```
┌──────────────────────────────────┐
│  Upgrading Database              │
│                                  │
│  Version 15 → 16 ████████░░░░ 60%│
│  (Do not close this window)      │
└──────────────────────────────────┘
```

- If all upgrades succeed → transition to Ready
- If an upgrade fails → show error dialog with the failure details

## 5. Manual New Database UX (Scenario 3)

```
┌──────────────────────────────────┐
│  Create New Database             │
│                                  │
│  ⚠  This will destroy the        │
│  current database.               │
│                                  │
│  All existing data will be lost. │
│  This action cannot be undone.   │
│                                  │
│     [Cancel]    [Continue]       │
└──────────────────────────────────┘
```

- Cancel: dismiss, stay in Ready state
- Continue: destroy current OPFS DB → enter S1 (init new DB + wizard)

## 6. Currency Data

The 152 ISO currency records MUST match the same data as `DB_Table_Currencyformats_V1.h::ensure_data()`. This data should be stored as a JSON file in the project and loaded during DB initialization.

## 7. Error States

| Error | Cause | UX |
|---|---|---|
| OPFS unavailable | Browser does not support OPFS / COOP/COEP headers missing | Full-page error with explanation |
| OPFS open failed | File system error | Error toast + retry button |
| Upgrade SQL error | Corrupt DB or unexpected schema | Error dialog with details; suggest user to contact support |
| Destroy failed | OPFS file locked | Error toast + retry |

## Requirements

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


<!-- @trace
source: create-database
updated: 2026-06-01
code:
  - .opencode/skills/openspec-explore/SKILL.md
  - .opencode/skills/spectra-ask/SKILL.md
  - .opencode/commands/spectra-ask.md
  - .opencode/skills/spectra-propose/SKILL.md
  - src/locales/en-US.json
  - .opencode/commands/spectra-commit.md
  - .opencode/commands/spectra-drift.md
  - .opencode/skills/openspec-propose/SKILL.md
  - .opencode/skills/spectra-ingest/SKILL.md
  - .opencode/skills/spectra-apply/SKILL.md
  - .opencode/skills/openspec-archive-change/SKILL.md
  - .github/skills/openspec-apply-change/SKILL.md
  - .opencode/commands/spectra-debug.md
  - src/components/database/NewDatabaseWizard.vue
  - .opencode/commands/spectra-archive.md
  - .opencode/skills/spectra-discuss/SKILL.md
  - .opencode/commands/spectra-propose.md
  - src/pages/DatabaseInitPage.vue
  - .github/prompts/opsx-apply.prompt.md
  - .github/prompts/opsx-explore.prompt.md
  - .opencode/commands/spectra-apply.md
  - .opencode/commands/spectra-discuss.md
  - src/stores/database-store.ts
  - .github/skills/openspec-explore/SKILL.md
  - .opencode/commands/spectra-ingest.md
  - src/locales/zh-TW.json
  - .github/skills/openspec-propose/SKILL.md
  - .github/prompts/opsx-archive.prompt.md
  - .opencode/skills/spectra-drift/SKILL.md
  - src/workers/sqlite.worker.ts
  - .opencode/skills/spectra-archive/SKILL.md
  - src/data/currencies.json
  - .opencode/commands/opsx-propose.md
  - .opencode/commands/opsx-apply.md
  - src/App.vue
  - src/components/database/ConfirmDestroyDialog.vue
  - .github/prompts/opsx-propose.prompt.md
  - .opencode/skills/spectra-debug/SKILL.md
  - .opencode/commands/spectra-audit.md
  - .github/skills/openspec-archive-change/SKILL.md
  - .opencode/commands/opsx-explore.md
  - src/router/index.ts
  - src/workers/db-client.ts
  - AGENTS.md
  - .opencode/skills/spectra-audit/SKILL.md
  - .opencode/commands/opsx-archive.md
  - src/components/database/DatabaseMigration.vue
  - .opencode/skills/openspec-apply-change/SKILL.md
  - .opencode/skills/spectra-commit/SKILL.md
tests:
  - src/__tests__/ConfirmDestroyDialog.spec.ts
  - src/__tests__/db-client.spec.ts
  - e2e/vue.spec.ts
  - src/__tests__/sqlite.worker.spec.ts
  - src/__tests__/database-store.spec.ts
  - src/__tests__/NewDatabaseWizard.spec.ts
-->

---
### Requirement: Worker exposes open-or-create API
The Web Worker SHALL handle an `open-or-create` message type that performs the probe-and-init flow, and respond with `{ status, version }`.

#### Scenario: Worker receives open-or-create → creates new DB
- **WHEN** the Worker receives `open-or-create` and no DB exists in OPFS
- **THEN** the Worker SHALL create the new DB, run `tables.sql`, set `PRAGMA user_version`, and respond with `{ status: 'created', version: <latest> }`

#### Scenario: Worker receives open-or-create → opens existing DB
- **WHEN** the Worker receives `open-or-create` and a DB exists in OPFS
- **THEN** the Worker SHALL open the DB, call `migrateDb()` if needed, and respond with `{ status: 'existing', version: <version> }`


<!-- @trace
source: create-database
updated: 2026-06-01
code:
  - .opencode/skills/openspec-explore/SKILL.md
  - .opencode/skills/spectra-ask/SKILL.md
  - .opencode/commands/spectra-ask.md
  - .opencode/skills/spectra-propose/SKILL.md
  - src/locales/en-US.json
  - .opencode/commands/spectra-commit.md
  - .opencode/commands/spectra-drift.md
  - .opencode/skills/openspec-propose/SKILL.md
  - .opencode/skills/spectra-ingest/SKILL.md
  - .opencode/skills/spectra-apply/SKILL.md
  - .opencode/skills/openspec-archive-change/SKILL.md
  - .github/skills/openspec-apply-change/SKILL.md
  - .opencode/commands/spectra-debug.md
  - src/components/database/NewDatabaseWizard.vue
  - .opencode/commands/spectra-archive.md
  - .opencode/skills/spectra-discuss/SKILL.md
  - .opencode/commands/spectra-propose.md
  - src/pages/DatabaseInitPage.vue
  - .github/prompts/opsx-apply.prompt.md
  - .github/prompts/opsx-explore.prompt.md
  - .opencode/commands/spectra-apply.md
  - .opencode/commands/spectra-discuss.md
  - src/stores/database-store.ts
  - .github/skills/openspec-explore/SKILL.md
  - .opencode/commands/spectra-ingest.md
  - src/locales/zh-TW.json
  - .github/skills/openspec-propose/SKILL.md
  - .github/prompts/opsx-archive.prompt.md
  - .opencode/skills/spectra-drift/SKILL.md
  - src/workers/sqlite.worker.ts
  - .opencode/skills/spectra-archive/SKILL.md
  - src/data/currencies.json
  - .opencode/commands/opsx-propose.md
  - .opencode/commands/opsx-apply.md
  - src/App.vue
  - src/components/database/ConfirmDestroyDialog.vue
  - .github/prompts/opsx-propose.prompt.md
  - .opencode/skills/spectra-debug/SKILL.md
  - .opencode/commands/spectra-audit.md
  - .github/skills/openspec-archive-change/SKILL.md
  - .opencode/commands/opsx-explore.md
  - src/router/index.ts
  - src/workers/db-client.ts
  - AGENTS.md
  - .opencode/skills/spectra-audit/SKILL.md
  - .opencode/commands/opsx-archive.md
  - src/components/database/DatabaseMigration.vue
  - .opencode/skills/openspec-apply-change/SKILL.md
  - .opencode/skills/spectra-commit/SKILL.md
tests:
  - src/__tests__/ConfirmDestroyDialog.spec.ts
  - src/__tests__/db-client.spec.ts
  - e2e/vue.spec.ts
  - src/__tests__/sqlite.worker.spec.ts
  - src/__tests__/database-store.spec.ts
  - src/__tests__/NewDatabaseWizard.spec.ts
-->

---
### Requirement: Worker exposes destroy API
The Web Worker SHALL handle a `destroy` message type that closes the database connection and deletes the OPFS file.

#### Scenario: Worker receives destroy
- **WHEN** the Worker receives `destroy`
- **THEN** the Worker SHALL close the database connection and delete the OPFS file, then respond with `{ status: 'success' }`

#### Scenario: Destroy fails
- **WHEN** the Worker receives `destroy` but the OPFS file cannot be deleted
- **THEN** the Worker SHALL respond with `{ status: 'error', message: <details> }`


<!-- @trace
source: create-database
updated: 2026-06-01
code:
  - .opencode/skills/openspec-explore/SKILL.md
  - .opencode/skills/spectra-ask/SKILL.md
  - .opencode/commands/spectra-ask.md
  - .opencode/skills/spectra-propose/SKILL.md
  - src/locales/en-US.json
  - .opencode/commands/spectra-commit.md
  - .opencode/commands/spectra-drift.md
  - .opencode/skills/openspec-propose/SKILL.md
  - .opencode/skills/spectra-ingest/SKILL.md
  - .opencode/skills/spectra-apply/SKILL.md
  - .opencode/skills/openspec-archive-change/SKILL.md
  - .github/skills/openspec-apply-change/SKILL.md
  - .opencode/commands/spectra-debug.md
  - src/components/database/NewDatabaseWizard.vue
  - .opencode/commands/spectra-archive.md
  - .opencode/skills/spectra-discuss/SKILL.md
  - .opencode/commands/spectra-propose.md
  - src/pages/DatabaseInitPage.vue
  - .github/prompts/opsx-apply.prompt.md
  - .github/prompts/opsx-explore.prompt.md
  - .opencode/commands/spectra-apply.md
  - .opencode/commands/spectra-discuss.md
  - src/stores/database-store.ts
  - .github/skills/openspec-explore/SKILL.md
  - .opencode/commands/spectra-ingest.md
  - src/locales/zh-TW.json
  - .github/skills/openspec-propose/SKILL.md
  - .github/prompts/opsx-archive.prompt.md
  - .opencode/skills/spectra-drift/SKILL.md
  - src/workers/sqlite.worker.ts
  - .opencode/skills/spectra-archive/SKILL.md
  - src/data/currencies.json
  - .opencode/commands/opsx-propose.md
  - .opencode/commands/opsx-apply.md
  - src/App.vue
  - src/components/database/ConfirmDestroyDialog.vue
  - .github/prompts/opsx-propose.prompt.md
  - .opencode/skills/spectra-debug/SKILL.md
  - .opencode/commands/spectra-audit.md
  - .github/skills/openspec-archive-change/SKILL.md
  - .opencode/commands/opsx-explore.md
  - src/router/index.ts
  - src/workers/db-client.ts
  - AGENTS.md
  - .opencode/skills/spectra-audit/SKILL.md
  - .opencode/commands/opsx-archive.md
  - src/components/database/DatabaseMigration.vue
  - .opencode/skills/openspec-apply-change/SKILL.md
  - .opencode/skills/spectra-commit/SKILL.md
tests:
  - src/__tests__/ConfirmDestroyDialog.spec.ts
  - src/__tests__/db-client.spec.ts
  - e2e/vue.spec.ts
  - src/__tests__/sqlite.worker.spec.ts
  - src/__tests__/database-store.spec.ts
  - src/__tests__/NewDatabaseWizard.spec.ts
-->

---
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


<!-- @trace
source: create-database
updated: 2026-06-01
code:
  - .opencode/skills/openspec-explore/SKILL.md
  - .opencode/skills/spectra-ask/SKILL.md
  - .opencode/commands/spectra-ask.md
  - .opencode/skills/spectra-propose/SKILL.md
  - src/locales/en-US.json
  - .opencode/commands/spectra-commit.md
  - .opencode/commands/spectra-drift.md
  - .opencode/skills/openspec-propose/SKILL.md
  - .opencode/skills/spectra-ingest/SKILL.md
  - .opencode/skills/spectra-apply/SKILL.md
  - .opencode/skills/openspec-archive-change/SKILL.md
  - .github/skills/openspec-apply-change/SKILL.md
  - .opencode/commands/spectra-debug.md
  - src/components/database/NewDatabaseWizard.vue
  - .opencode/commands/spectra-archive.md
  - .opencode/skills/spectra-discuss/SKILL.md
  - .opencode/commands/spectra-propose.md
  - src/pages/DatabaseInitPage.vue
  - .github/prompts/opsx-apply.prompt.md
  - .github/prompts/opsx-explore.prompt.md
  - .opencode/commands/spectra-apply.md
  - .opencode/commands/spectra-discuss.md
  - src/stores/database-store.ts
  - .github/skills/openspec-explore/SKILL.md
  - .opencode/commands/spectra-ingest.md
  - src/locales/zh-TW.json
  - .github/skills/openspec-propose/SKILL.md
  - .github/prompts/opsx-archive.prompt.md
  - .opencode/skills/spectra-drift/SKILL.md
  - src/workers/sqlite.worker.ts
  - .opencode/skills/spectra-archive/SKILL.md
  - src/data/currencies.json
  - .opencode/commands/opsx-propose.md
  - .opencode/commands/opsx-apply.md
  - src/App.vue
  - src/components/database/ConfirmDestroyDialog.vue
  - .github/prompts/opsx-propose.prompt.md
  - .opencode/skills/spectra-debug/SKILL.md
  - .opencode/commands/spectra-audit.md
  - .github/skills/openspec-archive-change/SKILL.md
  - .opencode/commands/opsx-explore.md
  - src/router/index.ts
  - src/workers/db-client.ts
  - AGENTS.md
  - .opencode/skills/spectra-audit/SKILL.md
  - .opencode/commands/opsx-archive.md
  - src/components/database/DatabaseMigration.vue
  - .opencode/skills/openspec-apply-change/SKILL.md
  - .opencode/skills/spectra-commit/SKILL.md
tests:
  - src/__tests__/ConfirmDestroyDialog.spec.ts
  - src/__tests__/db-client.spec.ts
  - e2e/vue.spec.ts
  - src/__tests__/sqlite.worker.spec.ts
  - src/__tests__/database-store.spec.ts
  - src/__tests__/NewDatabaseWizard.spec.ts
-->

---
### Requirement: DbClient exposes openOrCreate and destroy methods
The `DbClient` class SHALL expose `openOrCreate(): Promise<{status, version}>` and `destroy(): Promise<void>` methods that wrap the Worker message passing.

#### Scenario: openOrCreate resolves
- **WHEN** a caller calls `dbClient.openOrCreate()`
- **THEN** the method SHALL send an `open-or-create` message to the Worker and resolve the promise with the response payload

#### Scenario: destroy resolves
- **WHEN** a caller calls `dbClient.destroy()`
- **THEN** the method SHALL send a `destroy` message to the Worker and resolve the promise when complete


<!-- @trace
source: create-database
updated: 2026-06-01
code:
  - .opencode/skills/openspec-explore/SKILL.md
  - .opencode/skills/spectra-ask/SKILL.md
  - .opencode/commands/spectra-ask.md
  - .opencode/skills/spectra-propose/SKILL.md
  - src/locales/en-US.json
  - .opencode/commands/spectra-commit.md
  - .opencode/commands/spectra-drift.md
  - .opencode/skills/openspec-propose/SKILL.md
  - .opencode/skills/spectra-ingest/SKILL.md
  - .opencode/skills/spectra-apply/SKILL.md
  - .opencode/skills/openspec-archive-change/SKILL.md
  - .github/skills/openspec-apply-change/SKILL.md
  - .opencode/commands/spectra-debug.md
  - src/components/database/NewDatabaseWizard.vue
  - .opencode/commands/spectra-archive.md
  - .opencode/skills/spectra-discuss/SKILL.md
  - .opencode/commands/spectra-propose.md
  - src/pages/DatabaseInitPage.vue
  - .github/prompts/opsx-apply.prompt.md
  - .github/prompts/opsx-explore.prompt.md
  - .opencode/commands/spectra-apply.md
  - .opencode/commands/spectra-discuss.md
  - src/stores/database-store.ts
  - .github/skills/openspec-explore/SKILL.md
  - .opencode/commands/spectra-ingest.md
  - src/locales/zh-TW.json
  - .github/skills/openspec-propose/SKILL.md
  - .github/prompts/opsx-archive.prompt.md
  - .opencode/skills/spectra-drift/SKILL.md
  - src/workers/sqlite.worker.ts
  - .opencode/skills/spectra-archive/SKILL.md
  - src/data/currencies.json
  - .opencode/commands/opsx-propose.md
  - .opencode/commands/opsx-apply.md
  - src/App.vue
  - src/components/database/ConfirmDestroyDialog.vue
  - .github/prompts/opsx-propose.prompt.md
  - .opencode/skills/spectra-debug/SKILL.md
  - .opencode/commands/spectra-audit.md
  - .github/skills/openspec-archive-change/SKILL.md
  - .opencode/commands/opsx-explore.md
  - src/router/index.ts
  - src/workers/db-client.ts
  - AGENTS.md
  - .opencode/skills/spectra-audit/SKILL.md
  - .opencode/commands/opsx-archive.md
  - src/components/database/DatabaseMigration.vue
  - .opencode/skills/openspec-apply-change/SKILL.md
  - .opencode/skills/spectra-commit/SKILL.md
tests:
  - src/__tests__/ConfirmDestroyDialog.spec.ts
  - src/__tests__/db-client.spec.ts
  - e2e/vue.spec.ts
  - src/__tests__/sqlite.worker.spec.ts
  - src/__tests__/database-store.spec.ts
  - src/__tests__/NewDatabaseWizard.spec.ts
-->

---
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


<!-- @trace
source: create-database
updated: 2026-06-01
code:
  - .opencode/skills/openspec-explore/SKILL.md
  - .opencode/skills/spectra-ask/SKILL.md
  - .opencode/commands/spectra-ask.md
  - .opencode/skills/spectra-propose/SKILL.md
  - src/locales/en-US.json
  - .opencode/commands/spectra-commit.md
  - .opencode/commands/spectra-drift.md
  - .opencode/skills/openspec-propose/SKILL.md
  - .opencode/skills/spectra-ingest/SKILL.md
  - .opencode/skills/spectra-apply/SKILL.md
  - .opencode/skills/openspec-archive-change/SKILL.md
  - .github/skills/openspec-apply-change/SKILL.md
  - .opencode/commands/spectra-debug.md
  - src/components/database/NewDatabaseWizard.vue
  - .opencode/commands/spectra-archive.md
  - .opencode/skills/spectra-discuss/SKILL.md
  - .opencode/commands/spectra-propose.md
  - src/pages/DatabaseInitPage.vue
  - .github/prompts/opsx-apply.prompt.md
  - .github/prompts/opsx-explore.prompt.md
  - .opencode/commands/spectra-apply.md
  - .opencode/commands/spectra-discuss.md
  - src/stores/database-store.ts
  - .github/skills/openspec-explore/SKILL.md
  - .opencode/commands/spectra-ingest.md
  - src/locales/zh-TW.json
  - .github/skills/openspec-propose/SKILL.md
  - .github/prompts/opsx-archive.prompt.md
  - .opencode/skills/spectra-drift/SKILL.md
  - src/workers/sqlite.worker.ts
  - .opencode/skills/spectra-archive/SKILL.md
  - src/data/currencies.json
  - .opencode/commands/opsx-propose.md
  - .opencode/commands/opsx-apply.md
  - src/App.vue
  - src/components/database/ConfirmDestroyDialog.vue
  - .github/prompts/opsx-propose.prompt.md
  - .opencode/skills/spectra-debug/SKILL.md
  - .opencode/commands/spectra-audit.md
  - .github/skills/openspec-archive-change/SKILL.md
  - .opencode/commands/opsx-explore.md
  - src/router/index.ts
  - src/workers/db-client.ts
  - AGENTS.md
  - .opencode/skills/spectra-audit/SKILL.md
  - .opencode/commands/opsx-archive.md
  - src/components/database/DatabaseMigration.vue
  - .opencode/skills/openspec-apply-change/SKILL.md
  - .opencode/skills/spectra-commit/SKILL.md
tests:
  - src/__tests__/ConfirmDestroyDialog.spec.ts
  - src/__tests__/db-client.spec.ts
  - e2e/vue.spec.ts
  - src/__tests__/sqlite.worker.spec.ts
  - src/__tests__/database-store.spec.ts
  - src/__tests__/NewDatabaseWizard.spec.ts
-->

---
### Requirement: Router has /init route
The Vue Router SHALL define an `/init` route that renders `DatabaseInitPage.vue`, and a global `beforeEach` guard that redirects to `/init` when the DB is not in `ready` state.

#### Scenario: App loads with no DB
- **WHEN** the app loads and DB state is `uninitialized` or `probing`
- **THEN** the route guard SHALL redirect to `/init`

#### Scenario: App loads with ready DB
- **WHEN** the app loads and DB state is `ready`
- **THEN** the route guard SHALL allow navigation to the requested route


<!-- @trace
source: create-database
updated: 2026-06-01
code:
  - .opencode/skills/openspec-explore/SKILL.md
  - .opencode/skills/spectra-ask/SKILL.md
  - .opencode/commands/spectra-ask.md
  - .opencode/skills/spectra-propose/SKILL.md
  - src/locales/en-US.json
  - .opencode/commands/spectra-commit.md
  - .opencode/commands/spectra-drift.md
  - .opencode/skills/openspec-propose/SKILL.md
  - .opencode/skills/spectra-ingest/SKILL.md
  - .opencode/skills/spectra-apply/SKILL.md
  - .opencode/skills/openspec-archive-change/SKILL.md
  - .github/skills/openspec-apply-change/SKILL.md
  - .opencode/commands/spectra-debug.md
  - src/components/database/NewDatabaseWizard.vue
  - .opencode/commands/spectra-archive.md
  - .opencode/skills/spectra-discuss/SKILL.md
  - .opencode/commands/spectra-propose.md
  - src/pages/DatabaseInitPage.vue
  - .github/prompts/opsx-apply.prompt.md
  - .github/prompts/opsx-explore.prompt.md
  - .opencode/commands/spectra-apply.md
  - .opencode/commands/spectra-discuss.md
  - src/stores/database-store.ts
  - .github/skills/openspec-explore/SKILL.md
  - .opencode/commands/spectra-ingest.md
  - src/locales/zh-TW.json
  - .github/skills/openspec-propose/SKILL.md
  - .github/prompts/opsx-archive.prompt.md
  - .opencode/skills/spectra-drift/SKILL.md
  - src/workers/sqlite.worker.ts
  - .opencode/skills/spectra-archive/SKILL.md
  - src/data/currencies.json
  - .opencode/commands/opsx-propose.md
  - .opencode/commands/opsx-apply.md
  - src/App.vue
  - src/components/database/ConfirmDestroyDialog.vue
  - .github/prompts/opsx-propose.prompt.md
  - .opencode/skills/spectra-debug/SKILL.md
  - .opencode/commands/spectra-audit.md
  - .github/skills/openspec-archive-change/SKILL.md
  - .opencode/commands/opsx-explore.md
  - src/router/index.ts
  - src/workers/db-client.ts
  - AGENTS.md
  - .opencode/skills/spectra-audit/SKILL.md
  - .opencode/commands/opsx-archive.md
  - src/components/database/DatabaseMigration.vue
  - .opencode/skills/openspec-apply-change/SKILL.md
  - .opencode/skills/spectra-commit/SKILL.md
tests:
  - src/__tests__/ConfirmDestroyDialog.spec.ts
  - src/__tests__/db-client.spec.ts
  - e2e/vue.spec.ts
  - src/__tests__/sqlite.worker.spec.ts
  - src/__tests__/database-store.spec.ts
  - src/__tests__/NewDatabaseWizard.spec.ts
-->

---
### Requirement: New Database Wizard
A single-page wizard SHALL be shown when a new DB is created. It SHALL include a searchable currency selector (152 ISO currencies) and an optional user name input.

#### Scenario: Wizard creates database
- **WHEN** the user selects a base currency, optionally enters a user name, and clicks `Create`
- **THEN** the system SHALL save the currency setting and user name to the database and transition to `ready`

#### Scenario: Wizard cancel
- **WHEN** the user clicks `Cancel` in the wizard
- **THEN** the system SHALL close the dialog (the DB already exists in `needs-wizard` state, the app remains on `/init`)


<!-- @trace
source: create-database
updated: 2026-06-01
code:
  - .opencode/skills/openspec-explore/SKILL.md
  - .opencode/skills/spectra-ask/SKILL.md
  - .opencode/commands/spectra-ask.md
  - .opencode/skills/spectra-propose/SKILL.md
  - src/locales/en-US.json
  - .opencode/commands/spectra-commit.md
  - .opencode/commands/spectra-drift.md
  - .opencode/skills/openspec-propose/SKILL.md
  - .opencode/skills/spectra-ingest/SKILL.md
  - .opencode/skills/spectra-apply/SKILL.md
  - .opencode/skills/openspec-archive-change/SKILL.md
  - .github/skills/openspec-apply-change/SKILL.md
  - .opencode/commands/spectra-debug.md
  - src/components/database/NewDatabaseWizard.vue
  - .opencode/commands/spectra-archive.md
  - .opencode/skills/spectra-discuss/SKILL.md
  - .opencode/commands/spectra-propose.md
  - src/pages/DatabaseInitPage.vue
  - .github/prompts/opsx-apply.prompt.md
  - .github/prompts/opsx-explore.prompt.md
  - .opencode/commands/spectra-apply.md
  - .opencode/commands/spectra-discuss.md
  - src/stores/database-store.ts
  - .github/skills/openspec-explore/SKILL.md
  - .opencode/commands/spectra-ingest.md
  - src/locales/zh-TW.json
  - .github/skills/openspec-propose/SKILL.md
  - .github/prompts/opsx-archive.prompt.md
  - .opencode/skills/spectra-drift/SKILL.md
  - src/workers/sqlite.worker.ts
  - .opencode/skills/spectra-archive/SKILL.md
  - src/data/currencies.json
  - .opencode/commands/opsx-propose.md
  - .opencode/commands/opsx-apply.md
  - src/App.vue
  - src/components/database/ConfirmDestroyDialog.vue
  - .github/prompts/opsx-propose.prompt.md
  - .opencode/skills/spectra-debug/SKILL.md
  - .opencode/commands/spectra-audit.md
  - .github/skills/openspec-archive-change/SKILL.md
  - .opencode/commands/opsx-explore.md
  - src/router/index.ts
  - src/workers/db-client.ts
  - AGENTS.md
  - .opencode/skills/spectra-audit/SKILL.md
  - .opencode/commands/opsx-archive.md
  - src/components/database/DatabaseMigration.vue
  - .opencode/skills/openspec-apply-change/SKILL.md
  - .opencode/skills/spectra-commit/SKILL.md
tests:
  - src/__tests__/ConfirmDestroyDialog.spec.ts
  - src/__tests__/db-client.spec.ts
  - e2e/vue.spec.ts
  - src/__tests__/sqlite.worker.spec.ts
  - src/__tests__/database-store.spec.ts
  - src/__tests__/NewDatabaseWizard.spec.ts
-->

---
### Requirement: Manual "New Database" with confirmation
A confirmation dialog SHALL be shown when the user triggers "New Database" from the UI while a database is already open. The dialog SHALL warn that all data will be lost.

#### Scenario: Confirm destroy
- **WHEN** the user confirms the destroy warning
- **THEN** the system SHALL destroy the current OPFS database and enter the same new-DB flow as first run (probe → create → wizard)

#### Scenario: Cancel destroy
- **WHEN** the user cancels the destroy warning
- **THEN** the system SHALL dismiss the dialog and stay in `ready` state


<!-- @trace
source: create-database
updated: 2026-06-01
code:
  - .opencode/skills/openspec-explore/SKILL.md
  - .opencode/skills/spectra-ask/SKILL.md
  - .opencode/commands/spectra-ask.md
  - .opencode/skills/spectra-propose/SKILL.md
  - src/locales/en-US.json
  - .opencode/commands/spectra-commit.md
  - .opencode/commands/spectra-drift.md
  - .opencode/skills/openspec-propose/SKILL.md
  - .opencode/skills/spectra-ingest/SKILL.md
  - .opencode/skills/spectra-apply/SKILL.md
  - .opencode/skills/openspec-archive-change/SKILL.md
  - .github/skills/openspec-apply-change/SKILL.md
  - .opencode/commands/spectra-debug.md
  - src/components/database/NewDatabaseWizard.vue
  - .opencode/commands/spectra-archive.md
  - .opencode/skills/spectra-discuss/SKILL.md
  - .opencode/commands/spectra-propose.md
  - src/pages/DatabaseInitPage.vue
  - .github/prompts/opsx-apply.prompt.md
  - .github/prompts/opsx-explore.prompt.md
  - .opencode/commands/spectra-apply.md
  - .opencode/commands/spectra-discuss.md
  - src/stores/database-store.ts
  - .github/skills/openspec-explore/SKILL.md
  - .opencode/commands/spectra-ingest.md
  - src/locales/zh-TW.json
  - .github/skills/openspec-propose/SKILL.md
  - .github/prompts/opsx-archive.prompt.md
  - .opencode/skills/spectra-drift/SKILL.md
  - src/workers/sqlite.worker.ts
  - .opencode/skills/spectra-archive/SKILL.md
  - src/data/currencies.json
  - .opencode/commands/opsx-propose.md
  - .opencode/commands/opsx-apply.md
  - src/App.vue
  - src/components/database/ConfirmDestroyDialog.vue
  - .github/prompts/opsx-propose.prompt.md
  - .opencode/skills/spectra-debug/SKILL.md
  - .opencode/commands/spectra-audit.md
  - .github/skills/openspec-archive-change/SKILL.md
  - .opencode/commands/opsx-explore.md
  - src/router/index.ts
  - src/workers/db-client.ts
  - AGENTS.md
  - .opencode/skills/spectra-audit/SKILL.md
  - .opencode/commands/opsx-archive.md
  - src/components/database/DatabaseMigration.vue
  - .opencode/skills/openspec-apply-change/SKILL.md
  - .opencode/skills/spectra-commit/SKILL.md
tests:
  - src/__tests__/ConfirmDestroyDialog.spec.ts
  - src/__tests__/db-client.spec.ts
  - e2e/vue.spec.ts
  - src/__tests__/sqlite.worker.spec.ts
  - src/__tests__/database-store.spec.ts
  - src/__tests__/NewDatabaseWizard.spec.ts
-->

---
### Requirement: Migration progress UI
A non-blocking progress indicator SHALL be shown while incremental upgrades are running.

#### Scenario: Migration completes
- **WHEN** migration finishes successfully
- **THEN** the system SHALL transition to `ready` and redirect to the dashboard

#### Scenario: Migration fails
- **WHEN** migration fails due to an SQL error
- **THEN** the system SHALL show an error dialog with failure details and a retry option


<!-- @trace
source: create-database
updated: 2026-06-01
code:
  - .opencode/skills/openspec-explore/SKILL.md
  - .opencode/skills/spectra-ask/SKILL.md
  - .opencode/commands/spectra-ask.md
  - .opencode/skills/spectra-propose/SKILL.md
  - src/locales/en-US.json
  - .opencode/commands/spectra-commit.md
  - .opencode/commands/spectra-drift.md
  - .opencode/skills/openspec-propose/SKILL.md
  - .opencode/skills/spectra-ingest/SKILL.md
  - .opencode/skills/spectra-apply/SKILL.md
  - .opencode/skills/openspec-archive-change/SKILL.md
  - .github/skills/openspec-apply-change/SKILL.md
  - .opencode/commands/spectra-debug.md
  - src/components/database/NewDatabaseWizard.vue
  - .opencode/commands/spectra-archive.md
  - .opencode/skills/spectra-discuss/SKILL.md
  - .opencode/commands/spectra-propose.md
  - src/pages/DatabaseInitPage.vue
  - .github/prompts/opsx-apply.prompt.md
  - .github/prompts/opsx-explore.prompt.md
  - .opencode/commands/spectra-apply.md
  - .opencode/commands/spectra-discuss.md
  - src/stores/database-store.ts
  - .github/skills/openspec-explore/SKILL.md
  - .opencode/commands/spectra-ingest.md
  - src/locales/zh-TW.json
  - .github/skills/openspec-propose/SKILL.md
  - .github/prompts/opsx-archive.prompt.md
  - .opencode/skills/spectra-drift/SKILL.md
  - src/workers/sqlite.worker.ts
  - .opencode/skills/spectra-archive/SKILL.md
  - src/data/currencies.json
  - .opencode/commands/opsx-propose.md
  - .opencode/commands/opsx-apply.md
  - src/App.vue
  - src/components/database/ConfirmDestroyDialog.vue
  - .github/prompts/opsx-propose.prompt.md
  - .opencode/skills/spectra-debug/SKILL.md
  - .opencode/commands/spectra-audit.md
  - .github/skills/openspec-archive-change/SKILL.md
  - .opencode/commands/opsx-explore.md
  - src/router/index.ts
  - src/workers/db-client.ts
  - AGENTS.md
  - .opencode/skills/spectra-audit/SKILL.md
  - .opencode/commands/opsx-archive.md
  - src/components/database/DatabaseMigration.vue
  - .opencode/skills/openspec-apply-change/SKILL.md
  - .opencode/skills/spectra-commit/SKILL.md
tests:
  - src/__tests__/ConfirmDestroyDialog.spec.ts
  - src/__tests__/db-client.spec.ts
  - e2e/vue.spec.ts
  - src/__tests__/sqlite.worker.spec.ts
  - src/__tests__/database-store.spec.ts
  - src/__tests__/NewDatabaseWizard.spec.ts
-->

---
### Requirement: Currency data as JSON
The 152 ISO currency records matching `DB_Table_Currencyformats_V1.h::ensure_data()` SHALL be stored as `src/data/currencies.json` and loaded during new-DB initialization.

#### Scenario: Currencies loaded on new DB
- **WHEN** a new database is created and the wizard is shown
- **THEN** the currency selector SHALL be populated from `src/data/currencies.json`

<!-- @trace
source: create-database
updated: 2026-06-01
code:
  - .opencode/skills/openspec-explore/SKILL.md
  - .opencode/skills/spectra-ask/SKILL.md
  - .opencode/commands/spectra-ask.md
  - .opencode/skills/spectra-propose/SKILL.md
  - src/locales/en-US.json
  - .opencode/commands/spectra-commit.md
  - .opencode/commands/spectra-drift.md
  - .opencode/skills/openspec-propose/SKILL.md
  - .opencode/skills/spectra-ingest/SKILL.md
  - .opencode/skills/spectra-apply/SKILL.md
  - .opencode/skills/openspec-archive-change/SKILL.md
  - .github/skills/openspec-apply-change/SKILL.md
  - .opencode/commands/spectra-debug.md
  - src/components/database/NewDatabaseWizard.vue
  - .opencode/commands/spectra-archive.md
  - .opencode/skills/spectra-discuss/SKILL.md
  - .opencode/commands/spectra-propose.md
  - src/pages/DatabaseInitPage.vue
  - .github/prompts/opsx-apply.prompt.md
  - .github/prompts/opsx-explore.prompt.md
  - .opencode/commands/spectra-apply.md
  - .opencode/commands/spectra-discuss.md
  - src/stores/database-store.ts
  - .github/skills/openspec-explore/SKILL.md
  - .opencode/commands/spectra-ingest.md
  - src/locales/zh-TW.json
  - .github/skills/openspec-propose/SKILL.md
  - .github/prompts/opsx-archive.prompt.md
  - .opencode/skills/spectra-drift/SKILL.md
  - src/workers/sqlite.worker.ts
  - .opencode/skills/spectra-archive/SKILL.md
  - src/data/currencies.json
  - .opencode/commands/opsx-propose.md
  - .opencode/commands/opsx-apply.md
  - src/App.vue
  - src/components/database/ConfirmDestroyDialog.vue
  - .github/prompts/opsx-propose.prompt.md
  - .opencode/skills/spectra-debug/SKILL.md
  - .opencode/commands/spectra-audit.md
  - .github/skills/openspec-archive-change/SKILL.md
  - .opencode/commands/opsx-explore.md
  - src/router/index.ts
  - src/workers/db-client.ts
  - AGENTS.md
  - .opencode/skills/spectra-audit/SKILL.md
  - .opencode/commands/opsx-archive.md
  - src/components/database/DatabaseMigration.vue
  - .opencode/skills/openspec-apply-change/SKILL.md
  - .opencode/skills/spectra-commit/SKILL.md
tests:
  - src/__tests__/ConfirmDestroyDialog.spec.ts
  - src/__tests__/db-client.spec.ts
  - e2e/vue.spec.ts
  - src/__tests__/sqlite.worker.spec.ts
  - src/__tests__/database-store.spec.ts
  - src/__tests__/NewDatabaseWizard.spec.ts
-->