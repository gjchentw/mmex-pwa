# Cloud File Sync — Proposal

**Change**: `cloud-file-sync`
**Version**: 1.1.0
**Last Updated**: 2026-07-18

Related artifacts: [design.md](./design.md) (how), [specs/cloud-file-sync/spec.md](./specs/cloud-file-sync/spec.md) (new capability), [specs/infrastructure-baseline/spec.md](./specs/infrastructure-baseline/spec.md) (baseline delta), [tasks.md](./tasks.md) (implementation steps). Governed by [AGENTS.md](../../AGENTS.md).

## Why

The user's entire financial database lives in one browser's origin-private file system. A lost laptop, a cleared browser profile, or simply owning a second device means losing or fragmenting the data — an unacceptable posture for a finance application, and the reason the Drive sync buttons have sat in the UI as inert placeholders since the project began. The enabling library, `opfs-cloud-file@0.1.5` (the operator's own package, already in the lockfile), now provides the complete sync engine: automatic upload on local change, polling-based remote change detection, timestamp-based conflict auto-resolution with a manual-resolution event for true ties, and built-in retry with exponential backoff. What the application must supply — a Google sign-in flow producing an access token, a Drive file binding, write-event wiring, and Material Design surfaces for status and conflicts — is exactly this change. It also discharges two inherited obligations: the archived baseline's carried-forward COEP-versus-Google validation (tasks 5.1/5.2), and the recorded trigger for raising the `opfs-cloud-file` declared floor ("the first code that actually calls a 0.1.5-only API").

## What Changes

- **Google Sign-In (new)**: an optional, drawer-initiated OAuth flow using Google Identity Services with the minimal `drive.file` scope. The application remains **local-first**: every existing feature works without signing in; the token lives in memory only; sign-out fully severs the session. The vestigial splash sign-in concept in the locale catalogs is retired in favor of the drawer flow.
- **Drive file binding (new)**: the user selects an app-visible `.mmb` database from an application-rendered Drive file browser (authenticated listing — no picker service, no API key), creates a new one, or imports a pre-existing local file; the binding is persisted and can be severed.
- **Database sync (new)**: local database writes trigger debounced upload; polling detects remote changes and downloads them; conflicts resolve automatically by newest timestamp, and the rare timestamp-tie raises a blocking Material dialog for the user to decide. Sync state (idle/syncing/synced/error/conflict) is always visible.
- **UI/UX**: all new surfaces follow Quasar's Material Design conventions, consistent with the existing Quasar shell.
- **Baseline delta**: the governed stack table's `opfs-cloud-file` constraint rises from `^0.1.4` to `^0.1.5`, honoring the governance rule that the table changes before the dependency is relied upon.
- **COEP validation (inherited)**: before any Google surface is built, empirically verify the Google Identity Services popup and Bearer-authenticated Drive API calls under COEP `require-corp`; if they fail, switch every environment to `credentialless` (which the baseline's Cross-Origin Isolation requirement already permits).

## Capabilities

### New Capabilities
- `cloud-file-sync`: Optional Google sign-in, Drive file binding, bidirectional database synchronization, conflict resolution UX, and sync-status presentation for the client-side database.

### Modified Capabilities
- `infrastructure-baseline`: MODIFIES `Requirement: Governed Technology Stack Baseline` — the `opfs-cloud-file` version constraint rises to `^0.1.5` (no other row changes).

## Impact

- **Code**: new auth/sync store(s) and composables, drawer UI in [src/App.vue](../../../src/App.vue), conflict/status components, wiring in [src/workers/db-client.ts](../../../src/workers/db-client.ts) or the database store, locale additions to both catalogs, `index.html` (GIS script). `package.json` floor bump.
- **Configuration**: the Google credential surface shrinks to a single variable — `VITE_GOOGLE_CLIENT_ID` becomes load-bearing, while `VITE_GOOGLE_API_KEY` and `VITE_GOOGLE_APP_ID` are removed from `.env.example`, the CI build environment, and the README (design.md D8: no picker service). The operator provisions the client id locally and in the CI secret store.
- **Possible COEP change**: if Google surfaces fail under `require-corp`, the COEP value changes to `credentialless` in `vite.config.ts` (server + preview) and `public/_headers` — permitted by the baseline spec without amendment; the decision gets recorded in this change's design.
- **External dependencies**: a Google Cloud project with an OAuth client id only (no API key, no Picker API); Drive API quotas for polling.
- **Out of scope**: multi-file sync, sync providers other than Google Drive, offline queueing beyond the library's built-in retry, and any change to database schema or business logic.
