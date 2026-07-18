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
- [ ] 2.2 Re-enable the `webkit` Playwright project, and update the CI e2e job to `npx playwright install --with-deps chromium webkit` (design.md D3; baseline spec: Automated Testing Toolchain binding condition)
- [ ] 2.3 Run the full e2e suite on both engines locally. **If WebKit fails on OPFS/isolation grounds, PAUSE and report** — that is an iOS-viability finding requiring an operator decision, not test noise to suppress (design.md D3, Open Question 1)
- [x] 2.4 Amend the active `infrastructure-baseline` spec: engine-set sentence ("currently comprises Chromium only" → Chromium and WebKit, with the binding condition marked fulfilled), governed table row `E2E browser engine set`, version bump to 1.2.0
- [x] 2.5 Check off baseline tasks 5.3 and 6.0 with outcome notes referencing this change

## 3. P3 — COEP-Blocked Logo

- [x] 3.1 Replace the `cdn.quasar.dev` logo URL in `src/App.vue` with the local product icon (`/icon-192.png`), removing the app shell's only cross-origin subresource (design.md D4)
- [x] 3.2 Verify the browser console shows no `ERR_BLOCKED_BY_RESPONSE` under `require-corp`, in dev and preview

## 4. Gate and Production Verification

- [ ] 4.1 Full gate green: drift-check, lint:check, format:check, type-check, unit, build, e2e (both engines)
- [ ] 4.2 After the operator pushes and CI deploys: verify on https://mmex.beerops.dev/ that the database opens (wizard appears on a fresh profile), the WASM request targets the hashed asset, and no COEP resource errors remain — then check off baseline task 6.8 (production database verification)
