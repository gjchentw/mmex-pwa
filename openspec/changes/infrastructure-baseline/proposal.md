# Infrastructure Baseline — Proposal

**Change**: `infrastructure-baseline`
**Version**: 1.0.0
**Last Updated**: 2026-07-16

Related artifacts: [design.md](./design.md) (how), [specs/infrastructure-baseline/spec.md](./specs/infrastructure-baseline/spec.md) (requirements), [tasks.md](./tasks.md) (implementation steps). Governed by [AGENTS.md](../../AGENTS.md).

## Why

The project's development infrastructure (framework, build system, client-side database, quality tooling, CI, and hosting) exists only implicitly in configuration files and has never been formalized as a governing specification; `openspec/specs/` is currently empty. Without a baseline, tool choices cannot be verified, best-practice gaps stay invisible, and new contributors have no authoritative statement of what the project requires to build, test, and ship. This change establishes that baseline as the first managed specification and, at the same time, prescribes the missing best practices as normative requirements so the specification defines the target state, not merely the current state.

## What Changes

- Introduce a single new capability, `infrastructure-baseline`, that governs the project's development and deployment infrastructure at the capability level (WHAT), with a companion reference table naming the concrete governed tech stack and versions (traceability).
- Codify the **current** infrastructure as the managed baseline: Vue 3 + Quasar UI + TypeScript (strict) on Vite; PWA via Workbox; client-side SQLite compiled to WebAssembly running in a dedicated Web Worker with OPFS persistence and `PRAGMA user_version` migrations sourced from vendored git submodules; Pinia, vue-router, vue-i18n; ESLint (flat) + Prettier + EditorConfig; Vitest (unit) and Playwright (e2e).
- Prescribe the following **gap-closing** requirements as normative:
  - Mandatory cross-origin isolation (`COOP: same-origin` + `COEP`) in **every** environment, not just the dev server, because SQLite-WASM/OPFS/`SharedArrayBuffer` depend on it.
  - Exact Node version pinning via `.nvmrc`/`.node-version` aligned with `engines`.
  - A pre-commit quality gate (lint, format, type-check on staged files).
  - A full CI quality gate: lint + type-check + unit + e2e + build (submodules checked out), extending the current unit-tests-only pipeline.
  - Deployment to Cloudflare Pages with a `_headers` file that sets COOP/COEP, plus SPA fallback and build-time environment injection.
  - A committed `.env.example` documenting required `VITE_*` variables (e.g. `VITE_GOOGLE_CLIENT_ID`); secrets never committed.
  - A customized PWA web manifest (name, icons, theme) replacing the plugin defaults.
- **Scope boundary**: this specification covers infrastructure and tooling only. It does **not** specify any application/business logic (accounts, transactions, reports, financial rules, or database schema semantics).

## Capabilities

### New Capabilities
- `infrastructure-baseline`: The mandated development and deployment infrastructure for the project — runtime and package management, frontend framework and build system, client-side data-persistence infrastructure, cross-origin isolation, internationalization, styling/theming, code-quality and formatting tooling, automated testing, pre-commit and CI quality gates, deployment/hosting, configuration/secrets handling, and vendored source provenance.

### Modified Capabilities
<!-- None. openspec/specs/ is empty; this is the first capability. -->

## Impact

- **New OpenSpec artifacts**: `openspec/changes/infrastructure-baseline/{proposal.md, design.md, tasks.md}` and `openspec/changes/infrastructure-baseline/specs/infrastructure-baseline/spec.md`. On archive, the capability spec lands under `openspec/specs/infrastructure-baseline/`.
- **Configuration/tooling affected when the prescribed gaps are implemented** (implementation is out of scope for this change; tracked in `tasks.md`): `.nvmrc`/`.node-version`, git-hook tooling, `.github/workflows/*`, a Cloudflare Pages project + `_headers`, `.env.example`, PWA manifest/icons, and `index.html` metadata.
- **External dependencies**: a Cloudflare Pages account/project (new); continued reliance on the `mmex/database` and `mmex/moneymanagerex` git submodules; a Google OAuth client id for Drive sync.
- **No application source-code behavior changes** are mandated by this specification.
- **Governing rules**: all artifacts comply with [openspec/AGENTS.md](../../AGENTS.md).
