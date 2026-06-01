# create-database — Frontend Design

## 1. Directory Changes

```
src/
├── workers/
│   ├── sqlite.worker.ts    ← MODIFY: add open-or-create, destroy handlers
│   └── db-client.ts        ← MODIFY: add openOrCreate(), destroy() methods
├── stores/
│   └── database-store.ts   ← NEW: Pinia store for DB lifecycle state
├── components/
│   └── database/
│       ├── NewDatabaseWizard.vue   ← NEW: 1-page wizard (currency + username)
│       ├── DatabaseMigration.vue   ← NEW: upgrade progress indicator
│       └── ConfirmDestroyDialog.vue ← NEW: warning dialog
├── pages/
│   └── DatabaseInitPage.vue        ← NEW: startup page (probe OPFS → route)
├── router/
│   └── index.ts            ← MODIFY: add /init route
├── data/
│   └── currencies.json     ← NEW: 152 ISO currencies (extracted from C++ code)
└── App.vue                 ← MODIFY: gate on DB ready state
```

## 2. Pinia Store: `database-store.ts`

```typescript
// States
type DbState =
  | 'uninitialized'   // initial, no probe done yet
  | 'probing'          // worker probing OPFS
  | 'creating'         // creating new DB
  | 'opening'          // opening existing DB
  | 'migrating'        // running incremental upgrades
  | 'needs-wizard'     // new DB created, needs wizard input
  | 'ready'            // DB is open and operational
  | 'error'            // unrecoverable error

interface DatabaseStore {
  state: DbState
  version: number | null
  latestVersion: number
  error: string | null
  migrationProgress: { from: number; to: number; current: number } | null
  stats: { pageCount?: number; fileSize?: number } | null
}
```

### Key actions:

| Action | Description |
|---|---|
| `probe()` | Send `open-or-create` to worker. Based on response status, set state to `needs-wizard`, `ready`, or `error`. |
| `initNewDb()` | Called after wizard completes. Save base currency and user name via `exec()`. |
| `destroyAndRecreate()` | Send `destroy` to worker, then call `probe()` again. |
| `reset()` | Reset to `uninitialized`. |

## 3. Router

```
/           → Dashboard (requires db-state = 'ready')
/init       → DatabaseInitPage (handles probing, wizard, migration)
```

- `App.vue` guards: if state is `uninitialized` or `probing`, redirect to `/init`
- `/init` page handles the full lifecycle: probe → [wizard | migration | ready]
- On `ready`, redirect to `/`

## 4. Component Tree

```
App.vue
  └── <router-view>
        ├── /init → DatabaseInitPage.vue
        │     ├── [state=probing]    → Loading spinner
        │     ├── [state=creating]   → Loading spinner
        │     ├── [state=needs-wizard] → NewDatabaseWizard.vue
        │     ├── [state=migrating]  → DatabaseMigration.vue
        │     └── [state=error]      → Error display + retry
        │
        └── / → MainLayout.vue
              ├── Dashboard
              ├── Accounts
              └── ... (future pages)
```

## 5. Worker Changes

### `sqlite.worker.ts` — new message handlers

```typescript
// Add to onmessage:
case 'open-or-create':
  const result = await openOrCreate()
  self.postMessage({ id, type: 'open-or-create', ...result })
  break

case 'destroy':
  await destroyDb()
  self.postMessage({ id, type: 'destroy', status: 'success' })
  break
```

### `db-client.ts` — new methods

```typescript
class DbClient {
  async openOrCreate(): Promise<{ status: string; version: number }>
  async destroy(): Promise<void>
  // existing: exec(), ready()
}
```

## 6. Currency Data Format (`src/data/currencies.json`)

```json
[
  {
    "id": 1,
    "name": "US dollar",
    "symbol": "$",
    "prefix": "",
    "decimalPoint": ".",
    "groupSeparator": ",",
    "unitName": "Dollar",
    "centName": "Cent",
    "code": "USD",
    "type": "Fiat",
    "scale": 100,
    "baseRate": 1
  },
  ...
]
```

Extracted from `DB_Table_Currencyformats_V1.h::~ensure_data()` — all 152 entries.

## 7. Data Flow

```
User opens PWA
  → App.vue: state === 'uninitialized'
  → redirect to /init
  → DatabaseInitPage.vue mounted
    → store.probe()
      → worker.openOrCreate()
        ├── OPFS empty → create DB + tables
        │     → postMessage({ status: 'created', version: 21 })
        │     → store.state = 'needs-wizard'
        │     → NewDatabaseWizard.vue shown
        │         → user picks currency + optional name
        │         → store.initNewDb()
        │           → worker.exec("INSERT INTO INFOTABLE_V1 ...")
        │           → worker.exec("UPDATE CURRENCYFORMATS_V1 SET ...")
        │         → store.state = 'ready'
        │         → redirect to /
        │
        └── OPFS has DB → open + migrateDb()
              ├── version current → postMessage({ status: 'existing', version })
              │     → store.state = 'ready'
              │     → redirect to /
              │
              └── version stale → run upgrades
                    → postMessage({ status: 'migrating', from, to, current })
                    → store.state = 'migrating'
                    → DatabaseMigration.vue shown
                    → when done → postMessage({ status: 'existing', version })
                    → store.state = 'ready'
                    → redirect to /
```

## 8. Manual New DB Flow

```
User clicks "New Database" in app
  → ConfirmDestroyDialog.vue shown
    → Cancel → dismiss
    → Confirm:
        → store.destroyAndRecreate()
          → worker.destroy() → close + delete OPFS file
          → store.probe() → enters same flow as first run
```
