# Infrastructure Baseline — Tasks

**Change**: `infrastructure-baseline`
**Version**: 1.0.0
**Last Updated**: 2026-07-16

Reference: [specs/infrastructure-baseline/spec.md](./specs/infrastructure-baseline/spec.md) for WHAT, [design.md](./design.md) for HOW (phase ordering follows the Migration Plan). Requirement IDs below refer to spec requirement names.

## 1. Ratify the Baseline

- [ ] 1.1 Operator reviews and approves the specification; confirm the governed stack table matches `package.json` exactly (Requirement: Governed Technology Stack Baseline)
- [ ] 1.2 Resolve Open Question: confirm `main` is the intended default branch, and fix the README CI badge which currently targets `master`
- [ ] 1.3 Record that the already-compliant requirements (Frontend Framework, Build System, Persistence, i18n, Styling, Quality Toolchain, Testing Toolchain, Provenance) are satisfied by the current tree — no code change required

## 2. Local Hygiene (no behavior change)

- [ ] 2.1 Add a runtime version file (`.nvmrc` or `.node-version`) pinning a version that satisfies `engines: ^20.19.0 || >=22.12.0`; verify a fresh `nvm use` selects it (Requirement: Runtime and Package Management Baseline)
- [ ] 2.2 Create and commit `.env.example` enumerating every required variable with placeholder values and comments, including the Google OAuth client id (Requirement: Configuration and Secrets Management)
- [ ] 2.3 Add `.env` and related real environment files to `.gitignore`; confirm no secret is currently tracked (Requirement: Configuration and Secrets Management)
- [ ] 2.4 Design and add a product icon set to `public/`, and configure `VitePWA()` with a product-specific manifest: name, short name, description, icons, and `theme_color` matching the Quasar primary `#006800` — replacing the plugin defaults (Requirement: Progressive Web App and Offline Baseline)
- [ ] 2.5 Set a product-specific `<title>` in `index.html`, replacing the default "Vite App" (Requirement: Progressive Web App and Offline Baseline)
- [ ] 2.6 Add a runtime diagnostic that detects `crossOriginIsolated === false` and surfaces an explicit, actionable error instead of an opaque persistence failure (Requirement: Cross-Origin Isolation)

## 3. Pre-Commit Quality Gate

- [ ] 3.1 Run `npm run lint`, `npm run format`, and `npm run type-check` across the current tree and fix all existing violations **before** any gate is enforced (per design.md: enforcing a gate on a dirty tree makes the next unrelated PR fail)
- [ ] 3.2 Add git-hook tooling plus a staged-file runner, provisioned automatically on install via a `prepare` script (Requirement: Pre-Commit Quality Gate)
- [ ] 3.3 Configure the `pre-commit` hook to lint and format-check staged files and run the type checker; keep expensive suites out of the hook
- [ ] 3.4 Verify the gate: a staged file with a deliberate lint violation SHALL block the commit, and a fresh clone SHALL provision the hook on install with no manual step

## 4. Continuous Integration Quality Gate

- [ ] 4.1 Extend `.github/workflows/test.yml` to check out submodules (already done), provision the pinned Node version from the runtime version file, and install via `npm ci` (Requirement: Continuous Integration Quality Gate)
- [ ] 4.2 Add a lint stage and a type-check stage to the pipeline
- [ ] 4.3 Add an e2e stage: install Playwright browsers, build, and run the suite against the preview server (`playwright.config.ts` already handles CI port 4173 and retries)
- [ ] 4.4 Add a production build stage
- [ ] 4.5 Add a CI check asserting the runtime version file satisfies the `engines` range (Requirement: Runtime and Package Management Baseline)
- [ ] 4.6 Add a CI check asserting the emitted manifest does not retain PWA plugin defaults (name/theme color) (Requirement: Progressive Web App and Offline Baseline)
- [ ] 4.7 Verify the gate: a PR containing a lint error, a type error, or a failing test SHALL be blocked from merging

## 5. Cross-Origin Isolation Validation (do before Drive work)

- [ ] 5.1 Empirically determine whether Google Sign-In / Drive endpoints function under COEP `require-corp`; if they do not, adopt `credentialless` (Requirement: Cross-Origin Isolation, design.md D5)
- [ ] 5.2 Record the chosen COEP value and the evidence behind it, and align the dev server and `_headers` on the same value
- [ ] 5.3 Add an e2e assertion that `window.crossOriginIsolated === true` and that a database opens successfully, so header regressions fail as a test

## 6. Deployment and Hosting

- [ ] 6.1 Provision the Cloudflare Pages project and resolve Open Question: ownership and whether PR preview deployments are enabled (Requirement: Deployment and Hosting)
- [ ] 6.2 Add a `_headers` file to the build output setting `Cross-Origin-Opener-Policy: same-origin` and the COEP value chosen in 5.2 (Requirement: Cross-Origin Isolation)
- [ ] 6.3 Configure SPA fallback so unmatched navigation paths serve the application shell and client-side routing resolves (Requirement: Deployment and Hosting)
- [ ] 6.4 Store the Google OAuth client id in the Cloudflare/CI secret store and inject it at build time; confirm no secret enters version control
- [ ] 6.5 Add a CI deploy stage that publishes to Cloudflare Pages from the default branch only, with CI as the sole producer of deployed artifacts (Requirement: Deployment and Hosting, design.md D6)
- [ ] 6.6 Verify the deployment end-to-end: the production URL returns COOP/COEP headers, `window.crossOriginIsolated === true`, the database opens from OPFS, a deep link resolves, and the app is installable and loads offline

## 7. Follow-Ups

- [ ] 7.1 Evaluate migrating `vue-i18n` off the `^12.0.0-alpha.3` pre-release to the latest stable line; update the governed stack table via an OpenSpec change (design.md risks)
- [ ] 7.2 Consider automating the governed-stack-table-vs-`package.json` drift check in CI (Requirement: Governed Technology Stack Baseline)
- [ ] 7.3 Update `README.md` with the documented setup contract: submodule initialization, runtime version file, `.env.example` copy step, and the full command set
- [ ] 7.4 Archive this change with `/opsx:archive` once implementation is complete and verified, promoting the spec to `openspec/specs/infrastructure-baseline/`
