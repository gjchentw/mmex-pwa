<!--
SYNC IMPACT REPORT
==================
Version change      : 1.4.0 → 1.5.0 (MINOR — redefined versioning enforcement boundary)
Principles modified : none
Sections modified   : Product Versioning & Release Policy (clarified agent vs CI responsibility), Development Workflow & Quality Gates (removed CI version enforcement)
Sections added      : none
Sections removed    : none
Templates reviewed  :
  ✅ .specify/templates/plan-template.md  — no direct versioning logic; no update needed
  ✅ .specify/templates/spec-template.md  — no direct versioning logic; no update needed
  ✅ .specify/templates/tasks-template.md — no direct versioning logic; no update needed
Runtime docs reviewed:
  ✅ README.md — no conflicting policy text; no update needed
Deferred TODOs      : none
-->

# MMEX PWA Constitution

## Core Principles

### I. Local First (NON-NEGOTIABLE)

The device is the source of truth. All features MUST function fully without a network
connection. OPFS (Origin Private File System) is the sole primary persistence layer;
remote sync, if introduced in future, is strictly additive and MUST NEVER block local
operations or risk data loss.

- All reads and writes MUST target the local OPFS SQLite database first.
- The application MUST start, operate, and save data entirely offline.
- Network availability is treated as an enhancement, never a prerequisite.
- Any data written by the user MUST be durably persisted before the UI confirms success.

### II. UX First

Every design decision, from architecture to micro-interaction, MUST optimise the user
experience. Connectivity state transitions (offline → online, online → offline, intermittent
signal) MUST be handled gracefully with clear, non-intrusive feedback.

- Zero data-loss guarantee: no user-initiated action may silently discard data.
- Connectivity changes MUST surface as unobtrusive, accessible UI indicators.
- UI MUST remain responsive and usable regardless of network state.
- Innovative interaction patterns are encouraged; complexity is justified only when it
  measurably improves the user journey.

### III. Test-First (NON-NEGOTIABLE)

TDD is mandatory. Tests MUST be written and confirmed to fail before implementation begins.
The Red → Green → Refactor cycle is strictly enforced on every feature.

- Unit tests MUST cover all business logic, store actions, and worker interfaces.
- Integration tests MUST cover OPFS read/write flows, DB migrations, and key user journeys.
- No feature branch may be merged unless all relevant tests pass in CI.
- Test coverage gates are enforced in GitHub Actions; bypassing them requires documented
  justification approved by the project maintainer.

### IV. Quasar Design System Compliance

All UI components and layouts MUST use the Quasar Framework and follow its official Best
Practices and core design philosophy (Material Design with Quasar extensions).

- Custom CSS that contradicts or duplicates Quasar's design tokens is forbidden; use
  Quasar's SCSS variables and utility classes instead.
- Component composition MUST follow Quasar's recommended pattern (QLayout, QPage,
  QDrawer, etc.) before reaching for lower-level primitives.
- Accessibility (a11y) attributes provided by Quasar components MUST NOT be stripped.
- Innovative UI is encouraged within Quasar's component system; new patterns MUST be
  evaluated for alignment with Quasar's design language before adoption.

### V. MMEX Schema Compatibility

This project is a frontend rewrite of MoneyManagerEX
(`https://github.com/moneymanagerex/moneymanagerex`). Database DDL and schema versions
MUST track the upstream project.

- Every upstream schema change MUST be reflected as a versioned migration script in this
  repository before the consuming feature is developed.
- Migration scripts MUST be idempotent and run automatically on application startup.
- Schema version is stored in the OPFS database and checked at launch; a version mismatch
  MUST trigger a migration or a clear user-facing error — never silent data corruption.
- Breaking schema changes require a dedicated migration task in the feature spec.

### VI. TypeScript Strictness

The codebase MUST be TypeScript throughout with `strict: true` and no implicit `any`.

- The runtime target is browser and WebKit only; Node-only APIs are forbidden in
  application code outside of build tooling.
- `any` types require an inline comment explaining why the type cannot be narrowed.
- All worker interfaces (OPFS SQLite worker, db-client) MUST have fully typed message
  contracts.
- ESLint rules enforcing TypeScript strictness are non-bypassable without documented
  justification.

### VII. CI/CD & GitHub Pages Deployment Discipline

Every merge to `master` MUST pass the full GitHub Actions CI pipeline (lint → unit tests
→ integration tests → build). A passing `master` build is automatically deployed to
GitHub Pages as the live demo site.

- All workflows are defined under `.github/workflows/`; ad-hoc manual deployments are
  forbidden.
- Build artefacts are deterministic; environment-specific secrets are injected via GitHub
  Actions secrets, never committed.
- The GitHub Pages deployment represents the canonical public demo and MUST always reflect
  a fully functional, tested build.
- CI/CD MUST automatically create a Git tag and GitHub Release for each production version
  after successful pipeline completion on `master`, including release source code archives.

### VIII. MMEX Community Acceptance

The ultimate goal of this project is to be accepted and potentially adopted by the
MoneyManagerEX open-source community (`https://github.com/moneymanagerex/moneymanagerex`).
Every technical and design decision MUST be made with upstream maintainer reviewability
and community adoption in mind.

- **Upstream compatibility first**: any behaviour, data format, or workflow that diverges
  from the upstream MMEX desktop application MUST be explicitly justified and documented.
  Unnecessary divergence is forbidden.
- **Contribution-ready code quality**: code MUST meet the standards a maintainer of a
  mature open-source project would accept — readable, well-structured, and accompanied by
  clear commit messages and PR descriptions.
- **Open governance**: all architectural decisions that may affect upstream compatibility
  MUST be recorded in spec or plan documents so they can be reviewed and discussed by the
  community.
- **No vendor lock-in**: technology choices MUST remain transferable and
  community-maintainable; proprietary services or closed toolchains are forbidden.
- **Internationalisation by default**: the application MUST support i18n from the outset
  to serve MMEX's global user base; new user-visible strings MUST be registered in all
  active locale files before merge.
- **Upstream-first translations**: unless a term is unique to this PWA project, all
  translation strings MUST follow existing MoneyManagerEX upstream PO terminology from
  `https://github.com/moneymanagerex/moneymanagerex/tree/master/po/`.
- **Pre-1.0 stability signaling**: until the MMEX community formally accepts this project,
  the major version MUST remain `0`.
- **SDD as the only engineering mode**: this project MUST be developed with
  Specification-Driven Development (SDD). Direct coding without an approved spec and plan
  is forbidden.
- **Community contribution boundary**: the project does NOT accept direct community source
  code contributions at this stage. Community participation is accepted through feature
  requests, which MUST be treated as prior evidence for product and specification decisions.

## Technology Stack & Platform Constraints

- **Language**: TypeScript (strict mode); ES2022 target.
- **Frontend Framework**: Vue 3 (Composition API) + Quasar Framework.
- **Persistence**: OPFS via SQLite (sql.js or @sqlite.org/sqlite-wasm) running in a
  dedicated Web Worker.
- **Build Tool**: Vite.
- **Testing**: Vitest (unit), Playwright (e2e / integration).
- **i18n**: vue-i18n; locale files under `src/locales/`.
- **Runtime Target**: Browser and WebKit only (PWA); no Node.js server-side rendering.
- **Deployment**: GitHub Pages via GitHub Actions.
- **Upstream Reference**: MoneyManagerEX (`moneymanagerex/moneymanagerex`).

No dependency on server-side infrastructure is permitted for core application functionality.
Third-party libraries introducing server-side assumptions MUST be wrapped or replaced.

## Language & Documentation Policy

All project documentation — including specifications (`spec.md`), implementation plans
(`plan.md`), task lists (`tasks.md`), code comments, commit messages, pull request
descriptions, and GitHub Issues — MUST be written in **English**.

- English is the mandatory language to maximise readability and review accessibility for
  the global MMEX community and any future open-source contributors.
- Locale translation files (e.g., `zh-TW.json`, `en-US.json`) are the only sanctioned
  location for non-English natural language strings; UI-facing content MUST be
  externalised via vue-i18n rather than hard-coded in source files.
- Translation authoring MUST use upstream MMEX PO terms as first choice. Project-specific
  new terms are allowed only when no equivalent upstream term exists, and the reason MUST
  be documented in the related PR or spec.
- Inline code comments MUST be in English and MUST explain non-obvious intent, not simply
  restate what the code does.
- Meeting notes, decision records, and design rationale captured in repository files MUST
  be in English.

Non-English content appearing outside of locale files will be treated as a review
defect and MUST be corrected before merge.

## Product Versioning & Release Policy

The project version in `package.json` is the canonical product version for this repository.

- **Agent-Driven Automation**: AI agents MUST strictly ensure every specification evolution
  increments the PATCH version by exactly +1 automatically (for example, `0.0.0` → `0.0.1`). 
- **CI/CD Enforcement Boundary**: The CI/CD pipeline SHOULD NOT strictly block builds based
  on version increment checks to allow for emergency maintenance or non-spec metadata changes.
  Version integrity is the primary responsibility of the AI agent during the SDD lifecycle.
- **Maintainer Oversight**: MINOR version increments (for example, `0.1.0`) are maintainer-directed
  and MUST occur only when explicitly requested by the maintainer.
- **MMEX Community Guardrail**: MAJOR version MUST remain `0` until formal MMEX community
  acceptance has been documented.
- **Release Artifacts**: Version tags MUST follow `v<semver>` format and match `package.json`
  exactly. GitHub Release entries MUST be generated from CI/CD and include the corresponding
  source code archives for traceable distribution.

## Development Workflow & Quality Gates

1. **Spec before code**: Every feature MUST have a spec (`spec.md`) and plan (`plan.md`)
   reviewed before implementation begins.
2. **SDD enforcement**: no implementation PR is valid unless it references an approved
  feature spec and implementation plan generated through the SDD flow.
3. **Test first**: Write tests, confirm failure, implement, confirm green, refactor.
4. **Constitution Check in plan.md**: Every plan MUST include a Constitution Check gate
   before Phase 0 research and re-checked after Phase 1 design.
5. **PR requirements**:
   - All automated CI checks pass (lint, unit, integration, build).
   - At least one reviewer approves (or maintainer self-reviews with documented rationale).
   - Spec and plan documents updated to reflect implementation decisions.
6. **Schema migrations**: Any DB DDL change ships as a versioned, tested migration script
   in the same PR as the consuming feature.
7. **No broken deployments**: If `master` CI fails, fixing the pipeline takes priority
   over all other work.

## Governance

This constitution supersedes all other project practices and guides. Amendments require:

1. A proposed change documented in a pull request with rationale.
2. Version increment per the semantic versioning policy below.
3. Consistency propagation: all affected templates and guidance files MUST be updated in
   the same PR.
4. Maintainer approval before merge.

**Versioning policy**:

- MAJOR — backward-incompatible governance or principle removal / fundamental redefinition.
- MINOR — new principle or section added; materially expanded guidance.
- PATCH — clarifications, wording refinements, typo fixes, non-semantic changes.

All PRs and code reviews MUST verify compliance with the principles above. Complexity MUST
be justified against the UX First and Local First principles. When in doubt, the simpler,
more offline-capable solution is preferred.

**Version**: 1.5.0 | **Ratified**: 2026-03-14 | **Last Amended**: 2026-03-16