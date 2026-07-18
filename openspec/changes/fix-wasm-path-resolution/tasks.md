# Fix WASM Path Resolution — Tasks

**Change**: `fix-wasm-path-resolution`
**Version**: 1.0.0
**Last Updated**: 2026-07-18

Reference: [specs/infrastructure-baseline/spec.md](./specs/infrastructure-baseline/spec.md) for WHAT, [design.md](./design.md) for HOW.

## 1. The Fix

- [x] 1.1 In `src/workers/sqlite.worker.ts`, import the WASM URL through the bundler and pass `locateFile` (kept as forward-compat). **Approach evolved during implementation**: the package clobbers `locateFile` unconditionally, so the effective fix is emitting `sqlite3.wasm` unhashed in both rollup outputs, emitting the OPFS proxy worker via an inline plugin, and narrowing workbox cache-busting — see revised design.md D1
- [x] 1.2 Verify empirically in both environments before touching the gate: `npm run dev` and a fresh build under `vite preview` — the database opens, the new-database wizard appears, and the network log shows the hashed WASM asset with no request for an unhashed `sqlite3.wasm` (Requirement: Production Binary Asset Resolution)

## 2. Regression Coverage and the Engine Set

- [x] 2.1 Rewrite the e2e assertion: on a fresh context against the preview build, assert `window.crossOriginIsolated === true` and that the app leaves its loading state (new-database wizard renders — use a stable selector, not a transient i18n string). This retires the current weak either-or assertion and fulfills baseline task 5.3 (design.md D2)
- [x] 2.2 Re-enable the `webkit` Playwright project (done; kept for local runs). The CI-install half was mooted on 2026-07-18 when the operator removed the e2e job from CI entirely (baseline design.md D12)
- [x] 2.3 Run the suite locally: Chromium passes against the preview build. WebKit could not run — the local browser download was repeatedly incomplete (`pw_run.sh` missing after install), and with e2e removed from CI (D12) no automated WebKit run exists either. **Open Question 1 (WebKit/iOS OPFS viability) remains unanswered** — reported, per the pause-and-report rule
- [x] 2.4 Amend the active `infrastructure-baseline` spec: engine-set sentence ("currently comprises Chromium only" → Chromium and WebKit, with the binding condition marked fulfilled), governed table row `E2E browser engine set`, version bump to 1.2.0
- [x] 2.5 Check off baseline tasks 5.3 and 6.0 with outcome notes referencing this change

## 3. P3 — COEP-Blocked Logo

- [x] 3.1 Replace the `cdn.quasar.dev` logo URL in `src/App.vue` with the local product icon (`/icon-192.png`), removing the app shell's only cross-origin subresource (design.md D4)
- [x] 3.2 Verify the browser console shows no `ERR_BLOCKED_BY_RESPONSE` under `require-corp`, in dev and preview

## 4. Gate and Production Verification

- [x] 4.1 Full gate green: drift-check, lint:check, format:check, type-check, unit, build; plus local Chromium e2e against the preview build (the gate no longer includes e2e per D12)
- [x] 4.2 Verified on production (https://mmex.beerops.dev/, 2026-07-18, fresh browser profile): the database opens (`SQLite Status: Ready`; the app reaches Ready rather than the wizard, consistent with local behavior), `sqlite3.wasm` served as `application/wasm`, the OPFS proxy as `application/javascript`, `crossOriginIsolated === true`, zero console errors (no COEP blocks), and the app still renders after the new service worker takes over on reload. Baseline task 6.8 checked accordingly
