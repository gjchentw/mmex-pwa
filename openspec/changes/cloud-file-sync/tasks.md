# Cloud File Sync — Tasks

**Change**: `cloud-file-sync`
**Version**: 1.1.0
**Last Updated**: 2026-07-18

Reference: [specs/cloud-file-sync/spec.md](./specs/cloud-file-sync/spec.md) and [specs/infrastructure-baseline/spec.md](./specs/infrastructure-baseline/spec.md) for WHAT, [design.md](./design.md) for HOW. Group 1 MUST complete before groups 3–6 build on Google surfaces (design.md D5).

## 1. COEP Validation (inherited baseline tasks 5.1/5.2 — do first)

- [ ] 1.1 **Manual prerequisite** — provision the Google Cloud project: OAuth client id only (authorized origins: `http://localhost:5173`, `http://localhost:4173`, `https://mmex.beerops.dev`); no API key and no Picker API are needed (design.md D8). Fill local `.env`
- [ ] 1.2 (probe page BUILT at `src/pages/CoepProbePage.vue`, dev-only route `/coep-probe`; execution awaits task 1.1 credentials) Build a minimal probe (scratch page or dev-only route) exercising the GIS token popup and a Bearer-only `drive.files.list` fetch under COEP `require-corp`; record pass/fail per surface
- [ ] 1.3 If any surface fails: switch COEP to `credentialless` in `vite.config.ts` (server + preview) and `public/_headers`; re-verify `crossOriginIsolated === true` and a database open in dev, preview, and the deployed host; record the outcome and evidence in design.md D5
- [ ] 1.4 Run the local e2e suite to confirm the isolation assertions still pass under whichever COEP value survives

## 2. Dependency Floor (governed-table-first)

- [x] 2.1 Raise `package.json` `opfs-cloud-file` to `^0.1.5` **and** the main spec's governed table row (`openspec/specs/infrastructure-baseline/spec.md`, bump its version) in the same commit — the drift check reads the main spec, not this change's delta (design.md D7 caveat); this delta then re-applies identically at archive. Verify `node scripts/check-stack-drift.mjs` stays green

## 3. Google Sign-In (spec: Optional Google Sign-In)

- [x] 3.1 Resolve design Open Question 1: **no token seam exists in 0.1.5** (static `accessToken` at construction only). Operator decision 2026-07-18: recreate the instance on token renewal/401 — no upstream release needed; lifecycle rules recorded in design.md Open Question 1. Task 5.1 implements the lifecycle
- [ ] 3.2 Lazy-load the GIS script on first opening of the sync surface (no Google bytes on the local-first path); wire `initTokenClient` with `drive.file`
- [ ] 3.3 Auth store (Pinia): in-memory token, expiry tracking, silent re-request with explicit re-auth fallback, sign-out revocation; unit tests for the state transitions
- [ ] 3.4 Drawer UI: sign-in/sign-out rows with Material button semantics; remove the vestigial `splash.signInButton` keys; add all new strings to both `en-US` and `zh-TW` catalogs

## 4. Drive File Binding (spec: Drive File Binding)

- [ ] 4.1 App-rendered Drive file browser: `QDialog` + `QList` over `drive.files.list` (Bearer token only, `q` filter for `.mmb`), listing app-created files across devices (design.md D8)
- [ ] 4.2 Create-new-file path via Drive API with initial upload of the current database
- [ ] 4.3 Binding persistence in namespaced `localStorage` (fileId + display name) and the unlink action (leaves both files intact); unit tests
- [ ] 4.4 Local import path for pre-existing `.mmb` files: file input → replace the OPFS database → reinitialize via `database-store.probe()` → offer Drive binding by creating an app-owned file (spec: Import a pre-existing database file)
- [ ] 4.5 Remove `VITE_GOOGLE_API_KEY` and `VITE_GOOGLE_APP_ID` everywhere they were declared ahead of need: `.env.example`, the `build` job env in `.github/workflows/ci.yml`, and the README secrets table (design.md D8)

## 5. Sync Wiring (spec: Bidirectional Database Synchronization)

- [ ] 5.1 Instantiate `OpfsCloudFile` on the main thread against the bound fileId + live token, with the recreate-on-renewal lifecycle: teardown (listeners off, polling stopped) and rebuild on token change or 401, never interrupting an in-flight sync (design.md D3/D1, Open Question 1 resolution)
- [ ] 5.2 Wire `DbClient.exec` mutations → debounced (~2s) `local-file-changed` dispatch; decide and record the polling interval (design Open Question 2)
- [ ] 5.3 Handle `cloud-file-changed`: download, then reload database state through `database-store.probe()` before accepting queries
- [ ] 5.4 Test the download-vs-open-handles sequencing specifically (design risk: race against the SQLite worker's sync-access handles), including during wizard/migration states
- [ ] 5.5 Handle 401: pause sync, surface re-auth action, resume after renewal; unit-test the sync status state machine (unbound/idle/syncing/synced/error/conflict)

## 6. Conflict and Status UI (spec: Manual Conflict Resolution, Sync Status Presentation)

- [ ] 6.1 Conflict dialog: `QDialog persistent`, both timestamps + checksums, exactly keep-local / keep-remote, following the `ConfirmDestroyDialog` pattern; unit test that no write occurs before resolution
- [ ] 6.2 Status surfaces per design D6: drawer chip/spinner for ongoing state, `QBanner` with action for errors, `Notify` for transient outcomes
- [ ] 6.3 Locale completeness check: every new string present in both catalogs; run lint/format/type gates

## 7. Verification

- [ ] 7.1 Full local gate (drift-check, lint:check, format:check, type-check, unit, build) plus local Chromium e2e; extend e2e only with what is testable without real Google auth (signed-out state renders, sync surface opens) — the consent flow boundary stays mocked, recorded as a limitation
- [ ] 7.2 Manual end-to-end on dev: sign in → create file → write data → verify upload; second browser profile → file browser lists the created file → bind → verify download + reload; import a local `.mmb` → verify replace + rebind; force a 401 (revoke) → verify re-auth path
- [ ] 7.3 After the operator pushes and CI deploys: repeat the manual pass on https://mmex.beerops.dev/, including cross-device sync between two real browsers, and record results
- [ ] 7.4 Archive with `/opsx:archive` once verified — merges the new capability spec and applies the baseline table delta
