## Context

The PWA has a minimal SQLite Worker (`sqlite.worker.ts`, ~111 lines) that unconditionally creates a fresh OPFS database on every page load. A thin `DbClient` wrapper communicates via `postMessage` with request IDs. No database lifecycle management exists — no probing for existing OPFS data, no schema migration, no destroy capability. The desktop MMEX schema (26 tables + 22 incremental upgrades) is available as a submodule at `mmex/database/`.

## Goals / Non-Goals

**Goals:**
- App startup probes OPFS; routes to init flow, migration, or dashboard based on what it finds
- Worker exposes `open-or-create`, `destroy`, and `migrateDb` operations
- New Pinia store (`database-store.ts`) drives reactive UI state
- `/init` route handles all DB lifecycle; `App.vue` guards redirect until ready
- New DB wizard: single-page form with currency selector (152 ISO currencies) + optional user name
- Migration UI: non-blocking progress bar during incremental upgrades
- Manual "New Database": warning dialog → destroy → recreate

**Non-Goals:**
- Encrypted DB (`SQLCipher` / `.emb`) — deferred
- Google Drive / cloud sync — deferred
- Account creation wizard — users add accounts manually later
- Database export / import

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| **OPFS as sole storage** | Only OPFS; no IndexedDB fallback | Coop/COEP headers already set; OPFS is the target for sqlite-wasm; simplicity |
| **Unified openOrCreate()** | Single probe replacing dual-path | The spec itself defines it; simplifies Worker state |
| **Migration in Worker (not main thread)** | All SQL runs in Worker | Blocking SQL on main thread freezes UI; Worker keeps UI responsive |
| **Single-page wizard** | No multi-step stepper | Desktop MMEX uses a 2-page wizard; collapsing to 1 page reduces complexity |
| **152 currencies fully loaded** | Full `ensure_data()` list | Matches desktop; no reason to subset |
| **Pinia store for DB state** | Reactive state driving route guards | Clean separation; components just read `store.state` |
| **`App.vue` guards, not per-route** | Global `beforeEach` redirect to `/init` | Keeps route definitions simple; single guard point |

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| OPFS unavailable at runtime | Detect in probe → show full-page error with browser requirements |
| Corrupt DB or upgrade SQL failure | Catch errors in Worker; surface to error page with retry option |
| Destroy fails because DB is locked | Error toast + retry; Worker closes connection first |
| Migration progress granularity | Worker posts `{ from, to, current }` on each upgrade step; UI shows QLinearProgress |
| First-run UX delay | Wizard is lightweight (1 page, no network); tested on slow devices |
