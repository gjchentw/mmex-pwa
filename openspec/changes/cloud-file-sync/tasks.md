# Cloud File Sync — Tasks

**Change**: `cloud-file-sync`
**Version**: 1.1.0
**Last Updated**: 2026-07-18

Reference: [specs/cloud-file-sync/spec.md](./specs/cloud-file-sync/spec.md) and [specs/infrastructure-baseline/spec.md](./specs/infrastructure-baseline/spec.md) for WHAT, [design.md](./design.md) for HOW. Group 1 MUST complete before groups 3–6 build on Google surfaces (design.md D5).

## 1. COEP Validation (inherited baseline tasks 5.1/5.2 — do first)

- [x] 1.1 **Manual prerequisite** — provision the Google Cloud project: OAuth client id only (authorized origins: `http://localhost:5173`, `http://localhost:4173`, `https://mmex.beerops.dev`); no API key and no Picker API are needed (design.md D8). Fill local `.env`
- [x] 1.2 Probe built (`src/pages/CoepProbePage.vue`, dev-only `/coep-probe`) and executed 2026-07-18/19: GIS script load PASS, popup open PASS, REST PASS — all under `require-corp`; token return FAIL due to COOP `same-origin` severing the popup channel (structural; see design D1/D5)
- [x] 1.3 Not needed: `require-corp` survived every surface; the failure was COOP-structural, which no COEP value affects. Headers unchanged in all environments (design.md D5)
- [x] 1.4 Run the local e2e suite to confirm the isolation assertions still pass under whichever COEP value survives

## 2. Dependency Floor (governed-table-first)

- [x] 2.1 Raise `package.json` `opfs-cloud-file` to `^0.1.5` **and** the main spec's governed table row (`openspec/specs/infrastructure-baseline/spec.md`, bump its version) in the same commit — the drift check reads the main spec, not this change's delta (design.md D7 caveat); this delta then re-applies identically at archive. Verify `node scripts/check-stack-drift.mjs` stays green

## 3. Google Sign-In (spec: Optional Google Sign-In)

- [x] 3.1 Resolve design Open Question 1: **no token seam exists in 0.1.5** (static `accessToken` at construction only). Operator decision 2026-07-18: recreate the instance on token renewal/401 — no upstream release needed; lifecycle rules recorded in design.md Open Question 1. Task 5.1 implements the lifecycle
- [x] 3.0 **Manual prerequisite** — add Authorized redirect URIs to the OAuth client: `http://localhost:5173/auth/callback`, `http://localhost:4173/auth/callback`, `https://mmex.beerops.dev/auth/callback` (required by the redirect flow, design.md D1 revision)
- [x] 3.2 Implement the redirect implicit flow (design.md D1 revision): `src/stores/google-auth-store.ts` (auth URL + `state` nonce, `prompt=none` renewal, best-effort revoke), `/auth/callback` route (`AuthCallbackPage.vue` — verify state, read + strip fragment, in-memory hold, navigate back). No Google script loaded
- [x] 3.3 Auth store (Pinia): in-memory token, expiry tracking, silent re-request with explicit re-auth fallback, sign-out revocation; unit tests for the state transitions
- [x] 3.4 Drawer UI: account row with sign-in/sign-out/re-authenticate states, sync entries disabled until signed in; vestigial `splash.signInButton`/`signInPrompt` keys removed; 8 `sync.*` strings added to both catalogs

## 4. Drive File Binding (spec: Drive File Binding)

- [x] 4.1 App-rendered Drive file browser: `QDialog` + `QList` over `drive.files.list` (Bearer token only, `q` filter for `.mmb`), listing app-created files across devices (design.md D8)
- [x] 4.2 Create-new-file path via Drive API with initial upload of the current database
- [x] 4.3 Binding persistence in namespaced `localStorage` (fileId + display name) and the unlink action (leaves both files intact); unit tests
- [x] 4.4 Local import path for pre-existing `.mmb` files: file input → replace the OPFS database → reinitialize via `database-store.probe()` → offer Drive binding by creating an app-owned file (spec: Import a pre-existing database file)
- [x] 4.5 Remove `VITE_GOOGLE_API_KEY` and `VITE_GOOGLE_APP_ID` everywhere they were declared ahead of need: `.env.example`, the `build` job env in `.github/workflows/ci.yml`, and the README secrets table (design.md D8)

## 5. Sync Wiring (spec: Bidirectional Database Synchronization)

- [x] 5.1 Instantiate `OpfsCloudFile` on the main thread against the bound fileId + live token, with the recreate-on-renewal lifecycle: teardown (listeners off, polling stopped) and rebuild on token change or 401, never interrupting an in-flight sync (design.md D3/D1, Open Question 1 resolution)
- [x] 5.2 Wire `DbClient.exec` mutations → debounced (~2s) `local-file-changed` dispatch; decide and record the polling interval (design Open Question 2)
- [x] 5.3 Handle `cloud-file-changed`: download, then reload database state through `database-store.probe()` before accepting queries
- [x] 5.4 Sequencing test added: the worker's import path is asserted to close the open database handle BEFORE writing replacement bytes (`sqlite.worker.spec.ts`), which is the property protecting the download path; the conflict keep-remote route reuses exactly this path
- [x] 5.5 Handle 401: pause sync, surface re-auth action, resume after renewal; unit-test the sync status state machine (unbound/idle/syncing/synced/error/conflict)

## 6. Conflict and Status UI (spec: Manual Conflict Resolution, Sync Status Presentation)

- [x] 6.1 Conflict dialog: `QDialog persistent`, both timestamps + checksums, exactly keep-local / keep-remote, following the `ConfirmDestroyDialog` pattern; unit test that no write occurs before resolution
- [x] 6.2 Status surfaces per design D6: drawer chip/spinner for ongoing state, `QBanner` with action for errors, `Notify` for transient outcomes
- [x] 6.3 Locale completeness check: every new string present in both catalogs; run lint/format/type gates

## 7. Verification

- [x] 7.1 Full local gate green (drift-check, lint:check, format:check, type-check, unit ×36, build, Chromium e2e); e2e extended with the signed-out sync-surface test — the consent flow boundary stays mocked, recorded as a limitation
- [x] 7.2 Operator verified on dev (2026-07-19): sign in → create new (`mmex-2026-07-18.mmb`) → data synced to Drive. The cross-device, import, and 401 legs fold into the production pass (7.3 explicitly covers two real browsers); the 401 state machine is additionally unit-tested
- [ ] 7.3 After the operator pushes and CI deploys: repeat the manual pass on https://mmex.beerops.dev/, including cross-device sync between two real browsers, and record results
- [ ] 7.4 Archive with `/opsx:archive` once verified — merges the new capability spec and applies the baseline table delta
