# Implementation Plan: CI/CD and GitHub Pages Recovery

**Branch**: `001-fix-ci-cd-pages` | **Date**: 2026-03-14 | **Spec**: `/specs/001-fix-ci-cd-pages/spec.md`
**Input**: Feature specification from `/specs/001-fix-ci-cd-pages/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Recover and harden repository automation so pull requests and master commits run deterministic quality gates, successful master runs publish to GitHub Pages, and failures remain diagnosable and rerunnable. The technical approach uses strict validation/release workflow separation, deterministic deployment gates, and stable e2e smoke policy (selector-based checks, CI-only retry, 10-second readiness timeout, Chromium-only matrix).

## Technical Context

**Language/Version**: TypeScript 5.9 (project runtime), GitHub Actions workflow YAML  
**Primary Dependencies**: Node.js 22 in CI, npm, actions/checkout@v4, actions/setup-node@v4, actions/upload-pages-artifact@v3, actions/deploy-pages@v4, Playwright  
**Storage**: N/A for runtime feature scope; CI artifacts and GitHub Pages deployment storage  
**Testing**: ESLint, vue-tsc, Vitest unit tests, Playwright e2e smoke tests  
**Target Platform**: GitHub-hosted Ubuntu runners and GitHub Pages environment
**Project Type**: Frontend web application with CI/CD workflows  
**Performance Goals**: 95% of master runs complete check-to-publish within 10 minutes; public site verification within 2 minutes after deploy  
**Constraints**: Full quality-gate enforcement before deploy; master-only publish; deterministic artifacts; major version must remain 0; e2e smoke policy uses selector-based assertions, CI-only retry=1, timeout=10s, Chromium-only  
**Scale/Scope**: Workflow and release automation updates in `.github/workflows/` and supporting design docs in `specs/001-fix-ci-cd-pages/`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Phase 0 Gate Review

- Local First (I): PASS. Scope is CI/CD and e2e policy only; no runtime data flow change.
- UX First (II): PASS. Stable deployment and reliable smoke checks improve confidence in public demo quality.
- Test-First (III): PASS. Validation gate sequence remains mandatory and explicit.
- Quasar Compliance (IV): PASS. No Quasar component or design system changes are introduced.
- MMEX Schema Compatibility (V): PASS. No schema or migration logic change is planned.
- TypeScript Strictness (VI): PASS. No relaxation of strict typing or linting.
- CI/CD & Pages Discipline (VII): PASS. Plan directly reinforces governed automated deployment.
- MMEX Community Acceptance (VIII): PASS. Decisions are documented, reviewable, and upstream-friendly.
- Language & Documentation Policy: PASS. Planning artifacts remain in English.

**Gate Result**: PASS.

## Project Structure

### Documentation (this feature)

```text
specs/001-fix-ci-cd-pages/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── github-actions-contract.md
└── tasks.md
```

### Source Code (repository root)

```text
.github/
├── scripts/ci/
│   ├── collect-run-context.sh
│   ├── common.sh
│   ├── detect-failed-stage.sh
│   └── write-run-summary.sh
└── workflows/
    ├── test.yml
    ├── release.yml
    └── version-guard.yml

e2e/
└── vue.spec.ts

src/
├── __tests__/
└── workers/
```

**Structure Decision**: Keep the existing single-repo frontend layout and implement all behavior in workflow files plus existing e2e test surface, with no new service boundaries.

## Complexity Tracking

No constitutional violations require justification.

## Post-Phase 1 Constitution Re-Check

- Local First (I): PASS. No network dependency is introduced into core app behavior.
- UX First (II): PASS. Selector-based e2e checks reduce flaky CI outcomes and improve release confidence.
- Test-First (III): PASS. Design requires mandatory gates and explicit smoke policy coverage.
- Quasar Compliance (IV): PASS. UI framework usage remains unchanged.
- MMEX Schema Compatibility (V): PASS. Schema compatibility remains untouched.
- TypeScript Strictness (VI): PASS. Design does not permit type-safety regressions.
- CI/CD & Pages Discipline (VII): PASS. Deploy remains gated, auditable, and deterministic.
- MMEX Community Acceptance (VIII): PASS. Versioning, docs, and traceability remain aligned with governance.
- Language & Documentation Policy: PASS. Artifacts stay in English.

**Re-Check Result**: PASS.

## Implementation Notes

- Validation workflow keeps explicit ordered gates and failure-stage summaries.
- E2E smoke policy is fixed as selector-based, root+SQLite presence checks, CI-only retry=1, timeout=10s, Chromium-only.
- Release workflow deploys only from qualified master validation runs and emits deployment evidence.
- Version-guard remains active with pre-1.0 policy and approved semver transition rules.
