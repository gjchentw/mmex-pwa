# Cloud File Sync — Design

**Change**: `cloud-file-sync`
**Version**: 1.1.0
**Last Updated**: 2026-07-18

Related artifacts: [proposal.md](./proposal.md), [specs/cloud-file-sync/spec.md](./specs/cloud-file-sync/spec.md), [specs/infrastructure-baseline/spec.md](./specs/infrastructure-baseline/spec.md), [tasks.md](./tasks.md). Governed by [AGENTS.md](../../AGENTS.md).

## Context

The sync engine already exists: `opfs-cloud-file@0.1.5` (the operator's own package, in the lockfile since its release) maps one OPFS file to one Google Drive file. Its division of labor, confirmed by reading the 0.1.5 README and API: the *library* owns upload-on-change, polling-based remote detection, timestamp-based conflict auto-resolution (newer side wins; only an exact tie emits `conflict-detected` with MD5 checksums and timestamps for manual resolution), and retry with exponential backoff (non-retryable: 4xx including 401). The *application* owns everything this change builds: acquiring and refreshing the `accessToken`, producing a `fileId`, dispatching `local-file-changed` after database writes, reacting to `cloud-file-changed` and `conflict-detected`, and presenting state.

Two inherited obligations land here: the archived baseline carried forward tasks 5.1/5.2 (verify Google endpoints under COEP `require-corp`, switch to `credentialless` if needed — the baseline's Cross-Origin Isolation requirement permits either), and the recorded floor-raise trigger for `^0.1.5`.

Operator decisions locked during proposal and refined in exploration: **`drive.file` scope** (minimal, non-restricted, no Google security audit), **local-first optional sign-in** (the drawer is the sync surface; no splash gate), and **no Picker service** — file selection is an app-rendered browser over Bearer-only REST, with pre-existing files entering via local import (D8).

## Goals / Non-Goals

**Goals:**
- A signed-out user notices nothing; a signed-in, bound user gets continuous bidirectional sync with visible state.
- Token handling that never persists secret material.
- The COEP question answered empirically before any Google surface is built on top of it.
- Material Design coherence with the existing Quasar shell.

**Non-Goals:**
- Multi-file or multi-provider sync; offline queueing beyond the library's retry; encryption-at-rest on Drive; changes to schema, migrations, or financial logic; automated e2e of the real Google consent flow (untestable headlessly — the boundary is mocked instead).

## Decisions

### D1: Google Identity Services token client, in-memory only

Auth uses the GIS token client (`google.accounts.oauth2.initTokenClient`) with scope `https://www.googleapis.com/auth/drive.file`. The token lives in a Pinia store field; nothing token-shaped touches `localStorage`, `sessionStorage`, or OPFS. Expiry (~1h) is handled by re-requesting with `prompt: ''` (silent when the Google session allows it) on a 401 or ahead of expiry; if silent renewal fails, sync pauses in the error state with a re-authenticate action. The GIS script loads lazily — injected only when the user first opens the sync surface — so the local-first path ships zero Google bytes.
**Alternatives considered**: (a) authorization-code flow with refresh token — needs a backend; this app has none by design. (b) Firebase Auth — an entire SDK for one token. (c) persisting the access token — rejected: violates the spec's in-memory requirement for marginal UX gain.

### D2: The binding persists in `localStorage`; the token never does

`fileId` (plus the bound file's display name for UI) is stored in `localStorage` under a namespaced key. It is not a secret — it is useless without a token — and it must survive sessions. Storing it inside the database itself (INFOTABLE) was rejected: the binding describes *where this database syncs to*, and a downloaded remote database would then overwrite its own binding record, a self-referential trap.

### D3: Write-event wiring at the `DbClient` seam, debounced

`DbClient.exec` ([src/workers/db-client.ts](../../../src/workers/db-client.ts)) is the single funnel for all database mutations. After a successful `exec` that is not a read-only statement, the sync layer dispatches `local-file-changed` to the `OpfsCloudFile` instance, debounced (~2s) so bursts coalesce — the library then uploads. The `OpfsCloudFile` instance runs on the **main thread** with its own worker internals (the library brings its worker support; our SQLite worker stays untouched). On `cloud-file-changed`, the handler downloads, then drives the existing `database-store` through a reload (`probe()` re-run) so the app never queries a swapped-out file with stale state.
**Alternative considered**: instantiating inside `sqlite.worker.ts` — rejected: the SQLite worker's OPFS sync-access handles hold locks the sync download would collide with; main-thread orchestration with explicit reload sequencing avoids intra-worker lock juggling.

### D4: Conflict dialog — persistent, two choices, evidence shown

`conflict-detected` (timestamp tie only) opens a `QDialog` with `persistent` (no backdrop dismiss — the spec requires deciding), showing both sides' timestamps and MD5 checksums, with exactly two actions: keep local (upload) or keep remote (download + reload). It joins the existing dialog family pattern ([ConfirmDestroyDialog.vue](../../../src/components/database/ConfirmDestroyDialog.vue)) — same structure, same i18n discipline.

### D5: COEP is validated first, and the fallback is decided in advance

Task group 1 empirically tests the GIS token popup and Bearer-authenticated Drive REST calls under the current `require-corp` — before any feature work. With the Picker iframe eliminated by D8, the validation surface shrinks to those two: plain `fetch` calls are COEP-irrelevant, leaving the GIS popup as the only historically COEP-sensitive surface (likelihood of failure downgraded from high to medium). If it fails: switch `vite.config.ts` (server + preview) and `public/_headers` to `credentialless`, verify `crossOriginIsolated` remains `true` and the database still opens, and record the outcome here. No spec amendment is needed either way — the requirement binds the outcome, not the value.

### D6: Material Design mapping (Quasar)

| Surface | Component | Material pattern |
|---|---|---|
| Sync panel | existing right `QDrawer` | contextual surface for a secondary feature |
| Sign-in/out, bind/unbind | `QBtn` (+ `QItem` list rows) | contained/text buttons per emphasis |
| Sync status | `QChip` + `QSpinner`/`QLinearProgress` in the drawer; `QBanner` for error state | persistent indicator for ongoing state; banner for actionable errors |
| Transient outcomes (synced, re-auth done) | `Notify` plugin | non-blocking snackbar |
| Conflict | `QDialog persistent` | blocking decision dialog |
| Drive file browser | `QDialog` + `QList` over `drive.files.list` (D8) | list dialog launched from an explicit user action |
| Local import | file input via `QBtn` trigger | explicit user action; reuses the init flow |

Brand palette stays the single source in [src/main.ts](../../../src/main.ts); no new colors. All strings go through both locale catalogs; the vestigial `splash.signInButton` keys are removed.

### D7: Baseline delta mechanics

The floor raise is a `MODIFIED` block against the now-archived-and-promoted main spec — the first normal-path delta since the baseline landed. **Implementation caveat discovered during self-audit**: `scripts/check-stack-drift.mjs` searches only the original baseline-change path and the main spec — it does not see this change's delta. Therefore task 2.1 updates the **main spec table directly** in the same commit as `package.json` (keeping CI atomically green), and this delta's identical MODIFIED block is applied idempotently at archive time. Extending the drift script to scan active-change deltas generically is a possible future hardening.

### D8: No Google Picker service — an app-rendered file browser over contractual REST

File selection uses a Quasar dialog listing `drive.files.list` results fetched with nothing but the `Authorization: Bearer` header. The official Google Picker (and therefore its API key) is not used at all. Decided 2026-07-18 on this evidence chain:

1. **The API-key requirement belongs to the Picker *service*, not to any wrapper.** Every npm picker package inherits it — including Google's own framework-agnostic web component (`@googleworkspace/drive-picker-element`, whose attribute table carries `developer-key`). A "keyless Picker wrapper" is not a category that exists.
2. **A Picker invoked with only an OAuth token is undocumented behavior.** The PickerBuilder reference never marks `setDeveloperKey` optional; community reports of it working keyless alternate with reports of it breaking. Building the binding path on unguaranteed behavior of a Google-hosted, unpinnable service is the same fragility class as the `locateFile` clobbering that rewrote the previous change's D1 — except unversionable. Rejected, including the "probe it empirically and keep it if it works" middle path, because even success today guarantees nothing and still functionally needs `setAppId` for `drive.file` grants.
3. **Bearer-only Drive REST is this project's proven contract**: `opfs-cloud-file`'s shipped code contains zero API-key references — the entire sync engine already runs on exactly this authentication model, with documented CORS support.

**Consequences**: the Google credential surface shrinks to the OAuth client id alone (`VITE_GOOGLE_API_KEY` and `VITE_GOOGLE_APP_ID` leave the configuration contract, CI env, and README); the COEP-hostile Picker iframe disappears from D5's validation surface; the selection UI becomes same-origin Material instead of an embedded foreign iframe. **Cost**: under `drive.file`, the listing shows only app-created files (across devices — the OAuth client defines "the app"), so a manually-uploaded pre-existing `.mmb` cannot be granted directly; the spec routes that case through local import, which doubles as a restore-from-backup capability.

## Risks / Trade-offs

- **The GIS popup fails under `require-corp`** → Likelihood: medium (the popup is the one remaining COEP-sensitive surface after D8 removed the Picker iframe; P3 demonstrated COEP blocking in general). Impact: low *because pre-decided* — D5's fallback is sanctioned, tested, and takes two files. This is why validation is task group 1.
- **Token expiry mid-sync** → Likelihood: certain (hourly). Impact: low — 401 is non-retryable in the library, surfaces as the error state with re-auth action (spec scenario covers it).
- **Remote download racing the SQLite worker's open handles** → Likelihood: medium. Impact: high if mishandled (corrupt read state). Mitigation: D3's sequencing — close/reload through `database-store.probe()` after download; the conflict dialog and download path never write while the wizard or a migration is mid-flight. Task 5.4 tests this specifically.
- **Polling quota** → Likelihood: low (single user, default interval). Impact: low; the library's 429 backoff covers bursts.
- **`localStorage` binding lost (cleared site data)** → Impact: low — re-pick the same file; Drive content is authoritative.

## Migration Plan

Feature is additive and dark until sign-in: shipping it does not alter any existing flow. Rollback is reverting the commits; the Drive file, if created, remains as an inert user file. If COEP flips to `credentialless`, that commit is independently revertible (restoring `require-corp`) as long as sync is not yet shipped — afterwards the two ship together.

## Open Questions

1. ~~**Does 0.1.5's Google Drive provider refresh tokens via callback, or is token injection push-only?**~~ **Investigated 2026-07-18 (task 3.1): the seam is missing.** The provider takes a static `accessToken` string at construction (`accessToken = i.accessToken` in the shipped bundle) and no `updateAccessToken`/provider-callback mechanism exists anywhere in 0.1.5. Since Google access tokens expire hourly, every sync after ~1h will 401 into the error state. **Operator decision (2026-07-18): recreate the `OpfsCloudFile` instance with a fresh token on renewal/401.** Works against 0.1.5 as shipped, no upstream release required. Consequences for D3: the sync layer owns an instance lifecycle — teardown (remove listeners, stop polling) and rebuild on every token renewal, with a guard so a rebuild never interrupts an in-flight sync (wait for idle or the error state first). The rejected alternatives for the record: an upstream token-provider callback (cleaner seam, deferred — a future package release can still adopt it and simplify this code), and mutating provider internals (rejected outright, same fragility class as the locateFile lesson).
2. **Polling interval default** — the library's default vs. an explicit value (candidate: 30–60s). Decided during task 5.2 with quota math recorded here.
