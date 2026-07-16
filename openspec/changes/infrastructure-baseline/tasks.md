# Infrastructure Baseline — Tasks

**Change**: `infrastructure-baseline`
**Version**: 1.0.0
**Last Updated**: 2026-07-16

Reference: [specs/infrastructure-baseline/spec.md](./specs/infrastructure-baseline/spec.md) for WHAT, [design.md](./design.md) for HOW (phase ordering follows the Migration Plan). Requirement IDs below refer to spec requirement names.

## 1. Ratify the Baseline

- [ ] 1.1 Operator reviews and approves the specification; confirm the governed stack table matches `package.json` exactly (Requirement: Governed Technology Stack Baseline)
- [ ] 1.2 Fix the README CI badge: it targets `?branch=master`, but no `master` branch exists on the remote — retarget to `main` and to the new workflow file
- [ ] 1.3 Record that the already-compliant requirements (Frontend Framework, Build System, Persistence, i18n, Styling, Testing Toolchain, Provenance) are satisfied by the current tree — no code change required

## 2. Local Hygiene (no behavior change)

- [ ] 2.1 Add a runtime version file (`.nvmrc` or `.node-version`) pinning a version that satisfies `engines: ^20.19.0 || >=22.12.0`; verify a fresh `nvm use` selects it (Requirement: Runtime and Package Management Baseline)
- [ ] 2.2 Create and commit `.env.example` enumerating `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_API_KEY`, and `VITE_GOOGLE_APP_ID` (full Google Picker configuration) with placeholder values and comments noting that all `VITE_*` values are publicly readable in the shipped bundle (Requirement: Configuration and Secrets Management)
- [ ] 2.3 Add `.env` and related real environment files to `.gitignore`; confirm no secret is currently tracked (Requirement: Configuration and Secrets Management)
- [ ] 2.4 Design and add a product icon set to `public/`, and configure `VitePWA()` with a product-specific manifest: name, short name, description, icons, and `theme_color` matching the Quasar primary `#006800` — replacing the plugin defaults (Requirement: Progressive Web App and Offline Baseline)
- [ ] 2.5 Set a product-specific `<title>` in `index.html`, replacing the default "Vite App" (Requirement: Progressive Web App and Offline Baseline)
- [ ] 2.6 Add a runtime diagnostic that detects `crossOriginIsolated === false` and surfaces an explicit, actionable error instead of an opaque persistence failure (Requirement: Cross-Origin Isolation)
- [ ] 2.7 Mirror the COOP/COEP headers from `vite.config.ts`'s `server` section into a `preview` section. Vite reads preview headers separately, so `vite preview` currently serves none — and Playwright runs the CI e2e suite against it, so every persistence test would fail once e2e joins the gate (Requirement: Cross-Origin Isolation, design.md D9)

## 3. Pre-Commit Quality Gate

- [ ] 3.0a Add `**/mmex/**` to the ESLint global ignores. ESLint currently walks the vendored submodules and reports 939 errors in upstream code, and the `--fix` in the `lint` script would rewrite those files, dirtying the submodules (Requirement: Continuous Integration Quality Gate, design.md D7b)
- [ ] 3.0b Add a non-mutating `lint:check` script (`eslint .` without `--fix`) for the pipeline, keeping the auto-fixing `lint` script for local use. A gate that repairs its own input verifies nothing (design.md D7a)
- [ ] 3.0c Relax `@typescript-eslint/no-explicit-any` for `src/**/__tests__/*`, where `any` in mock objects is idiomatic
- [ ] 3.1 Clear the 23 first-party violations: remove the unused `RouterLink`/`RouterView` imports in `App.vue`; remove the unused `baseCurrencyId` assignment in `database-store.ts` (behaviour-preserving — see design.md Open Question 3); drop the unnecessary `as any[]` cast in `NewDatabaseWizard.vue` (the JSON's shape is already inferred); and type the two `reject` callbacks in `db-client.ts` as `unknown`. Must land **before** the gate is enforced
- [ ] 3.2 Add git-hook tooling plus a staged-file runner, provisioned automatically on install via a `prepare` script (Requirement: Pre-Commit Quality Gate)
- [ ] 3.3 Configure the `pre-commit` hook to lint and format-check staged files and run the type checker; keep expensive suites out of the hook
- [ ] 3.4 Verify the gate: a staged file with a deliberate lint violation SHALL block the commit, and a fresh clone SHALL provision the hook on install with no manual step

## 4. Continuous Integration Quality Gate

- [ ] 4.1 Replace `.github/workflows/test.yml` with `.github/workflows/ci.yml`: check out submodules, provision Node from the runtime version file (`node-version-file`, not a hardcoded major), and install via `npm ci` (Requirement: Continuous Integration Quality Gate)
- [ ] 4.2 Add a `quality` job running `lint:check`, `type-check`, and unit tests
- [ ] 4.3 Add a `build` job that builds and asserts `_headers` survives into the build output
- [ ] 4.4 Delete `test.yml` so a single workflow owns the gate
- [ ] 4.5 Add a CI check asserting the runtime version file satisfies the `engines` range (Requirement: Runtime and Package Management Baseline) — satisfied by `.npmrc` `engine-strict` plus `node-version-file`, which makes `npm ci` fail with EBADENGINE on drift
- [ ] 4.6 Add a CI check asserting the emitted manifest does not retain PWA plugin defaults (name/theme color). **Blocked on task 2.4** — the manifest IS the default today, so the assertion would fail every run (Requirement: Progressive Web App and Offline Baseline)
- [ ] 4.7 Enable the `e2e` job (written and commented out in `ci.yml`). **Blocked on P1** — the production build renders raw i18n keys, so the existing e2e assertion on "Initializing" cannot pass (design.md Open Question 0)
- [ ] 4.8 Verify the gate: a push containing a lint error, a type error, or a failing test SHALL fail the pipeline, and the deploy job SHALL be skipped

## 5. Cross-Origin Isolation Validation (do before Drive work)

- [ ] 5.1 Empirically determine whether Google Sign-In / Drive endpoints function under COEP `require-corp`; if they do not, adopt `credentialless` (Requirement: Cross-Origin Isolation, design.md D5)
- [ ] 5.2 Record the chosen COEP value and the evidence behind it, and align the dev server and `_headers` on the same value
- [ ] 5.3 Add an e2e assertion that `window.crossOriginIsolated === true` and that a database opens successfully, so header regressions fail as a test

## 6. Deployment and Hosting

**Note: deploy is enabled ahead of P2 by operator decision** (design.md Open Question 0). The deployed database will not open until P2 lands; the URL serves as a pipeline smoke test, not a product. Task 6.7 is therefore split into what is verifiable now (6.7) and what needs P2 (6.8).

- [ ] 6.0 Fix P1/P2/P3 under their own change — i18n production compilation, SQLite WASM path resolution (see the two existing `copilot/fix-*wasm*` branches), and the COEP-blocked Quasar CDN logo
- [ ] 6.1 **Manual** — provision the Cloudflare Pages project named `mmex-pwa` with production branch `main`, via `wrangler pages project create` or the dashboard. It must exist first: `pages deploy` prompts for the production branch when creating one, and prompting in CI is an error (Requirement: Deployment and Hosting)
- [ ] 6.2 **Manual** — create an API token with the single permission Account → Cloudflare Pages → Edit, and set the repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (Requirement: Deployment and Hosting)
- [x] 6.3 Add `public/_headers` setting `Cross-Origin-Opener-Policy: same-origin` and the COEP value chosen in 5.2, so it is copied to the build output root (Requirement: Cross-Origin Isolation)
- [x] 6.4 Add `public/_redirects` with an SPA fallback so unmatched navigation paths serve the application shell on first load, before the service worker exists (Requirement: Deployment and Hosting)
- [x] 6.5 Add a `deploy` job to `ci.yml`: `needs:` the gate jobs, conditional on a push to `main`, downloading the verified artifact and publishing it with `wrangler pages deploy`. `e2e` is absent from `needs:` only because that job is disabled — restore it when e2e is re-enabled (Requirement: Deployment and Hosting, design.md D6)
- [x] 6.6 Supply `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_API_KEY`, and `VITE_GOOGLE_APP_ID` to the build step from repository secrets; confirm no secret enters version control, and note that all `VITE_*` values are readable in the shipped bundle (Requirement: Configuration and Secrets Management)
- [ ] 6.7 Verify what is checkable now: the deploy job runs on `main` and reports a URL; the production URL returns COOP/COEP and `window.crossOriginIsolated === true`; a deep link resolves to the app shell; and pushing a deliberate lint error leaves the deploy job **skipped**, proving the gate is structural rather than advisory (Requirement: Deployment and Hosting)
- [ ] 6.8 **Blocked on P2** — verify the database opens from OPFS in production and the app is installable and loads offline. Until then the deployed console is expected to show `Incorrect response MIME type. Expected 'application/wasm'`, which confirms P2 rather than a deployment fault

## 7. Follow-Ups

- [ ] 7.1 Evaluate migrating `vue-i18n` off the `^12.0.0-alpha.3` pre-release to the latest stable line; update the governed stack table via an OpenSpec change (design.md risks)
- [ ] 7.2 Consider automating the governed-stack-table-vs-`package.json` drift check in CI (Requirement: Governed Technology Stack Baseline)
- [ ] 7.3 Update `README.md` with the documented setup contract: submodule initialization, runtime version file, `.env.example` copy step, and the full command set
- [ ] 7.4 Archive this change with `/opsx:archive` once implementation is complete and verified, promoting the spec to `openspec/specs/infrastructure-baseline/`
