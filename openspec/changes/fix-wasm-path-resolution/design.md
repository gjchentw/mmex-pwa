# Fix WASM Path Resolution — Design

**Change**: `fix-wasm-path-resolution`
**Version**: 1.0.0
**Last Updated**: 2026-07-18

Related artifacts: [proposal.md](./proposal.md), [specs/infrastructure-baseline/spec.md](./specs/infrastructure-baseline/spec.md), [tasks.md](./tasks.md). Governed by [AGENTS.md](../../AGENTS.md).

## Context

Root cause, established by reading the shipped bundle and the package source (not inherited from the deleted reference branches):

1. [src/workers/sqlite.worker.ts](../../../src/workers/sqlite.worker.ts) calls `sqlite3InitModule({ print, printErr })` — **no `locateFile`**.
2. Without it, the Emscripten loader inside `@sqlite.org/sqlite-wasm` resolves the bare string `'sqlite3.wasm'` against its script directory. In a production build the worker lives at `/assets/sqlite.worker-<hash>.js`, so the runtime requests `/assets/sqlite3.wasm` — a file that does not exist, because Vite emitted the binary as `sqlite3-<hash>.wasm`.
3. The bundle actually *contains* the correct hashed URL (Vite rewrote one `new URL(..., import.meta.url)` occurrence inside the package), but the code path taken at runtime is the bare-string fallback, so the rewrite is dead weight.
4. The failure is masked twice: the SPA fallback (`_redirects` in production, the preview server's history fallback locally) answers the missing path with `index.html` and HTTP 200, and `WebAssembly.compile` then reports an "Incorrect response MIME type" — an error pointing at MIME configuration, two steps away from the real cause.
5. Development never fails because `optimizeDeps.exclude` leaves the package unbundled: the dev server serves `sqlite3.mjs` from `node_modules` with the real `sqlite3.wasm` sitting beside it.

This is why the entire quality gate stayed green while production was broken: no stage exercised "a built artifact opens a database in a real browser."

## Goals / Non-Goals

**Goals:**
- Production, preview, and development all load the exact WASM artifact the build emitted.
- A regression in this area is observable through an automated assertion (originally CI-blocking; e2e was removed from CI by operator decision on 2026-07-18 — see D2/D3 status notes — so the assertion now runs locally).
- Fulfill the baseline's binding condition: WebKit rejoins the governed engine set the moment the suite asserts database opening.
- Close P3 (COEP-blocked CDN logo) with a local asset.

**Non-Goals:**
- Any change to migration logic, worker protocol, or database semantics.
- Hardening the SPA fallback itself (e.g., 404ing unknown `/assets/*` paths) — considered and deferred; the e2e assertion covers the regression risk without adding host-config complexity.
- New dependencies.

## Decisions

### D1: Make the engine's computed URLs real (revised during implementation)

**The original plan — pass `locateFile` to `sqlite3InitModule` — does not work, and the reason is worth recording**: the package's pre-js *unconditionally overwrites* both `Module['locateFile']` and `Module['instantiateWasm']` on the caller's config (`sqlite3.mjs` line 63: `Module['locateFile'] = function (path) { return new URL(path, import.meta.url).href }`). Whatever the caller passes is discarded. In a bundle, `import.meta.url` is the worker bundle's URL, so the engine computes `<outdir>/assets/sqlite3.wasm` — and, one layer deeper, the OPFS VFS spawns its helper worker the same way (`new Worker(new URL('sqlite3-opfs-async-proxy.js', import.meta.url))`, line ~11685). That second layer was invisible until the first was fixed: with the WASM loading, the failure moved to `SQLITE_CANTOPEN` from a failed proxy-worker fetch.

Since the engine's URLs cannot be changed, the build makes them correct:

1. **`assetFileNames` emits `sqlite3.wasm` unhashed** — in *both* rollup outputs. Empirical discovery: the WASM is emitted by the **worker sub-build**, which has its own `worker.rollupOptions`; the top-level `build.rollupOptions` alone does nothing for it.
2. **A ten-line inline plugin emits `sqlite3-opfs-async-proxy.js`** into `assets/`, read straight from the installed package — no fork, no new dependency. Nothing references the file statically, so no bundler mechanism emits it otherwise.
3. **Workbox is told which filenames are actually hashed** (`dontCacheBustURLsMatching` narrowed to `-[hash].` patterns). Without this, the service worker precached the now-unhashed files with `revision: null` — meaning a package upgrade would ship a new worker with a *stale cached wasm*. Both unhashed files now carry content-based revisions; the host additionally revalidates by ETag.
4. The `?url` import and explicit `locateFile` are **kept**: today they are belt-and-suspenders (all three mechanisms agree on the same URL), and if a future package version stops clobbering the option, the explicit path takes over seamlessly.

**Alternatives considered**: (a) committing copies under `public/` — rejected: forks the binaries from the npm package version; (b) monkey-patching `self.fetch` in the worker to redirect the requests — rejected: fragile interception of package internals; (c) upstream patch to stop clobbering `locateFile` — worth pursuing separately, but this project should not depend on it.

### D2: The regression test asserts outcomes, not mechanisms

> **Status update (2026-07-18)**: after this change was implemented and the assertions verified on Chromium, the operator removed e2e execution from CI entirely (infrastructure-baseline design.md D12). The assertions remain and run locally.

The e2e suite gains assertions that `window.crossOriginIsolated === true` and that the app *leaves its loading state* — on a fresh browser context the database creates, and the new-database wizard renders. Wizard-visible is the observable proof that WASM compiled, OPFS mounted, and the schema applied.

**Rationale**: asserting the wizard rather than network internals keeps the test resilient to refactoring while still failing for every failure class that matters here (headers lost, WASM unresolvable, OPFS unavailable, schema broken). It also retires the current weak assertion, which passed whether or not the app worked ("Database Error" *or* "Initializing").

### D3: WebKit rejoins the governed engine set now

> **Status update (2026-07-18)**: WebKit stays in the local Playwright project matrix, but with CI e2e execution removed (D12), no automated WebKit run exists. The local WebKit browser install was additionally flaky on the development machine (incomplete download); Open Question 1 therefore remains empirically unanswered.

The baseline's Automated Testing Toolchain requirement states: WHEN the suite begins asserting cross-origin isolation or database opening, WebKit SHALL be added back **first**, because every iOS browser is WebKit and OPFS + `SharedArrayBuffer` is exactly where that engine diverges. D2 triggers that condition, so this change re-enables the WebKit Playwright project and installs it in CI (`playwright install --with-deps chromium webkit`). Firefox stays out — no binding condition covers it, and desktop Firefox users have Chromium-equivalent OPFS behavior for our purposes.

**Risk acknowledged**: WebKit's OPFS-in-worker support under Playwright's headless build is the empirical unknown this exists to surface. If the WebKit run fails on OPFS grounds, that is *signal about our iOS viability*, not test noise — the task list treats it as a pause-and-report finding, never as a reason to quietly drop the engine again.

### D4: P3 — replace the CDN logo with the product icon

`src/App.vue` loads `https://cdn.quasar.dev/logo-v2/svg/logo-mono-white.svg`, which COEP `require-corp` blocks. It is replaced with the local product icon already shipped for the PWA manifest. This removes the only cross-origin subresource in the app shell — meaning `require-corp` currently costs us nothing, which is worth knowing before the Google Drive work re-tests that boundary (baseline task 5.1).

### D5: Amend the active baseline in place; keep this change's delta additive

The governed-engine-set sentence and table row live in the still-active `infrastructure-baseline` change. This change edits them there directly (bumping the baseline spec to v1.2.0), following the precedent set by the Node 24 amendment, while this change's own delta carries only the ADDED requirement. A `MODIFIED` delta against a capability that exists only inside another active change would duplicate content and create an archive-merge hazard; direct amendment keeps one source of truth and keeps the drift check meaningful. **Consequence**: `infrastructure-baseline` MUST archive before this change does.

## Risks / Trade-offs

- **WebKit + OPFS in CI is unproven** → Likelihood: medium. Impact: medium (red e2e lane). Mitigation: D3 treats a WebKit-specific failure as a reportable finding with its own decision point; Chromium remains an independent lane, so the fix itself is still verified either way.
- **`?url` import inside a module worker** → Likelihood: low. Impact: low (build-time failure, immediately visible). Vite resolves asset URLs in workers it bundles; verified empirically before the gate runs (task 1.2).
- **e2e asserting wizard text couples to i18n strings** → Likelihood: low. Impact: low. Mitigation: assert on a stable selector/heading; the task notes this.
- **Archive-order dependency between the two changes** → Likelihood: low. Impact: low (tooling error at archive time). Recorded in the proposal and here; baseline archives first.

## Migration Plan

Single deployable step; no data, schema, or host-config changes. Rollback is `git revert` of one commit. Client-side databases are untouched by construction — the fix changes how the engine *loads*, not what it does.

## Open Questions

1. **WebKit OPFS support in Playwright's build** — resolved empirically by task 2.3; a failure there pauses the change with findings rather than proceeding.
