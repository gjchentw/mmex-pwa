# Infrastructure Baseline — Delta: opfs-cloud-file Floor Raise

**Change**: `cloud-file-sync`
**Capability**: `infrastructure-baseline`
**Version**: 1.1.0
**Last Updated**: 2026-07-18

Only the `opfs-cloud-file` version constraint changes (`^0.1.4` → `^0.1.5`): this change contains the first code that requires 0.1.5 behavior, which is exactly the trigger recorded when 0.1.5 entered the lockfile. Relative links below are written to resolve from the requirement's post-archive home (`openspec/specs/infrastructure-baseline/`), per the lesson of the previous archive's link repair.

## MODIFIED Requirements

### Requirement: Governed Technology Stack Baseline

The project SHALL build on the governed technology stack recorded in the table below. Each entry names the concrete component that implements a capability-level requirement of this specification. Adding, removing, or changing the major version of any governed component SHALL require an OpenSpec change that updates this table first.

The `npm package` column is machine-readable: an automated drift check compares every row whose package cell is not `n/a` against the dependency manifest, and fails continuous integration on mismatch. Rows with `n/a` are governed by other mechanisms (the runtime by `engines` plus install-time enforcement; the engine set by the test configuration; hosting by the deployment pipeline).

| Concern | Governed component | npm package | Version constraint |
|---|---|---|---|
| Runtime | Node.js | n/a | `>=24.0.0` |
| Package manager | npm (with committed lockfile) | n/a | bundled with Node |
| UI framework | Vue | `vue` | `^3.5.22` |
| Component library | Quasar | `quasar` | `^2.18.6` |
| Language | TypeScript (strict) | `typescript` | `~5.9.0` |
| Build system | Vite | `vite` | `^7.1.11` |
| PWA/service worker | vite-plugin-pwa (Workbox) | `vite-plugin-pwa` | `^1.1.0` |
| State management | Pinia | `pinia` | `^3.0.3` |
| Routing | vue-router | `vue-router` | `^4.6.3` |
| Internationalization runtime | vue-i18n | `vue-i18n` | `^11.4.6` |
| Internationalization build plugin | Intlify unplugin | `@intlify/unplugin-vue-i18n` | `^11.2.4` |
| Embedded SQL engine | SQLite WASM | `@sqlite.org/sqlite-wasm` | `^3.51.1-build1` |
| Cloud file sync | opfs-cloud-file | `opfs-cloud-file` | `^0.1.5` |
| CSS preprocessor | Sass (embedded) | `sass-embedded` | `^1.93.3` |
| Icon set | Quasar extras (MDI v7) | `@quasar/extras` | `^1.17.0` |
| Linter | ESLint (flat config) | `eslint` | `^9.37.0` |
| Formatter | Prettier | `prettier` | `3.6.2` |
| Unit test runner | Vitest | `vitest` | `^3.2.4` |
| Unit test DOM environment | jsdom | `jsdom` | `^27.0.1` |
| E2E test runner | Playwright | `@playwright/test` | `^1.56.1` |
| E2E browser engine set | Chromium + WebKit (via Playwright) | n/a | n/a |
| Type checker | vue-tsc | `vue-tsc` | `^3.1.1` |
| Git hook manager | husky | `husky` | `^9.1.7` |
| Staged-file runner | lint-staged | `lint-staged` | `^17.0.8` |
| Hosting | Cloudflare Pages | n/a | n/a |

Traceability: [package.json](../../../package.json), [.gitmodules](../../../.gitmodules).

#### Scenario: Governed stack matches the dependency manifest

- **WHEN** an auditor compares this table against `package.json`
- **THEN** every governed component SHALL be present with a version satisfying the recorded constraint

#### Scenario: Introducing an ungoverned infrastructure component

- **WHEN** a contributor proposes adding a framework, bundler, test runner, or persistence engine that is absent from this table
- **THEN** the proposal SHALL be rejected until an OpenSpec change amends this specification to record the component
