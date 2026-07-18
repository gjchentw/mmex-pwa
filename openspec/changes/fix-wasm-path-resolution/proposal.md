# Fix WASM Path Resolution — Proposal

**Change**: `fix-wasm-path-resolution`
**Version**: 1.0.0
**Last Updated**: 2026-07-18

Related artifacts: [design.md](./design.md) (how), [specs/infrastructure-baseline/spec.md](./specs/infrastructure-baseline/spec.md) (requirement delta), [tasks.md](./tasks.md) (implementation steps). Governed by [AGENTS.md](../../AGENTS.md).

## Why

The database cannot open in any production build (defect P2 in the infrastructure-baseline change). The SQLite worker initializes the engine without a `locateFile` option, so Emscripten falls back to resolving the bare filename `sqlite3.wasm` against the script directory — requesting the unhashed `/assets/sqlite3.wasm` while the build emits a content-hashed `sqlite3-<hash>.wasm`. The missing path does not 404: the SPA fallback answers it with `index.html` (HTTP 200), so `WebAssembly.compile` rejects `text/html` far from the actual cause. Development is unaffected because the dev server serves the package unbundled with the real `sqlite3.wasm` sitting beside its loader, which is exactly why every unit test, lint, type-check, and build stayed green while production was broken. This was verified live on 2026-07-18 against https://mmex.beerops.dev/ — the deployed site is currently a pipeline smoke test, not a working application, and this defect is the only thing in between.

## What Changes

- **The fix**: pass an explicit `locateFile` to `sqlite3InitModule`, resolving the WASM through the bundler (`?url` import of the package's exported `./sqlite3.wasm`), so development and production both load the exact asset the build emitted.
- **Regression coverage**: extend the end-to-end suite to assert `window.crossOriginIsolated === true` and that the database actually opens in a built artifact (the new-database wizard appears, proving OPFS + WASM initialized). This is the missing check that let P2 ship green, and it fulfills the baseline's task 5.3.
- **WebKit returns to the governed engine set**: the baseline's Automated Testing Toolchain requirement binds this — WHEN the suite begins asserting isolation or database opening, WebKit SHALL be added back first, because iOS permits only WebKit and OPFS + `SharedArrayBuffer` is where it diverges. The engine-set sentence and governed table row in the active baseline change are amended accordingly.
- **Defect P3 rides along**: the toolbar loads a Quasar logo from `cdn.quasar.dev`, which COEP `require-corp` blocks (`ERR_BLOCKED_BY_RESPONSE`). The cross-origin fetch is replaced with the product's own local icon, which also removes stale third-party branding from a finance app's chrome.
- Together with the P1 fix that already landed, this closes the baseline's task 6.0 entirely.

## Capabilities

### New Capabilities
<!-- None. -->

### Modified Capabilities
- `infrastructure-baseline`: ADDS a requirement that production builds resolve runtime-fetched binary assets to the exact content-hashed artifacts the build emitted, verified end-to-end. The governed-engine-set wording change is applied directly to the still-active baseline change (the precedent set by the Node 24 amendment) rather than duplicated as a MODIFIED delta — see design.md for why.

## Impact

- **Code**: [src/workers/sqlite.worker.ts](../../../src/workers/sqlite.worker.ts) (the fix), [e2e/vue.spec.ts](../../../e2e/vue.spec.ts) (regression assertions), [playwright.config.ts](../../../playwright.config.ts) (WebKit project), [.github/workflows/ci.yml](../../../.github/workflows/ci.yml) (WebKit browser install), [src/App.vue](../../../src/App.vue) (P3 logo).
- **Cross-change**: the active `infrastructure-baseline` change is amended — engine-set requirement text, governed table row (`E2E browser engine set`), spec version bump, and checkboxes 5.3/6.0/6.8 as they complete.
- **Archive ordering**: `infrastructure-baseline` MUST be archived before this change, since this delta modifies that capability.
- **No dependency changes**: the fix uses the package's existing `./sqlite3.wasm` export; no new packages.
- **Deployed behavior**: after this lands and deploys, the production database opens — the deployed URL stops being a smoke test.
