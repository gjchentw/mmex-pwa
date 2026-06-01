# create-database

## Scope

Define how the PWA creates and manages the local SQLite database in OPFS (Origin Private File System) when no existing database is found, or when the user explicitly requests a new database.

## Scenarios

1. **First run (quick start)** — PWA starts, no database found in OPFS → automatically enter the new database creation flow → user selects base currency and optional username → ready.
2. **Existing database** — PWA starts, finds a database in OPFS → open it → check version against latest schema → if stale, run incremental upgrades → ready.
3. **Manual new database** — User clicks "New Database" from the UI → warning dialog: "Current database will be destroyed" → if confirmed, destroy the existing OPFS database → enter the new database creation flow (same as scenario 1).

## Non-goals

- Encrypted database support (`.emb` / SQLCipher) — deferred to a future spec
- Google Drive / cloud sync — deferred to a separate spec
- Account creation wizard — users will add accounts manually from the Dashboard after the database is ready
- Database export / import

## User flow reference

See `database-lifecycle.drawio` for the state machine diagram of all three scenarios.
