# Implementation Plan: CI/CD and GitHub Pages Recovery

**Branch**: `001-fix-ci-cd-pages` | **Date**: 2026-03-14 | **Spec**: `/specs/001-fix-ci-cd-pages/spec.md`
**Input**: Feature specification from `/specs/001-fix-ci-cd-pages/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Recover and harden the repository automation so pull requests and mainline commits run deterministic quality gates, successful mainline builds publish to GitHub Pages, and failures remain diagnosable and rerunnable. The implementation approach uses explicit workflow contracts, strict deploy gating, and traceable deployment evidence without changing app runtime behavior.

## Technical Context

**Language/Version**: TypeScript 5.9 (project runtime), GitHub Actions workflow YAML  
**Primary Dependencies**: Node.js 22 runtime in CI, npm, actions/checkout@v4, actions/setup-node@v4, GitHub Pages official deploy actions  
**Storage**: N/A for feature runtime; CI artifacts and GitHub Pages deployment storage  
**Testing**: ESLint, vue-tsc type-check, Vitest unit tests, Playwright e2e tests  
**Target Platform**: GitHub-hosted Ubuntu runners and GitHub Pages hosting environment
**Project Type**: Frontend web application (Vue 3 + Vite + Quasar) with CI/CD workflows  
**Performance Goals**: 95% of mainline runs complete check-to-publish within 10 minutes; deployment availability verification within 2 minutes post-deploy  
**Constraints**: Must enforce full quality gates before deploy; master-only production publish; deterministic artifacts; no ad-hoc manual deployment; keep major version at 0 before community acceptance  
**Scale/Scope**: Workflow and release automation updates across `.github/workflows/` and feature documentation under `specs/001-fix-ci-cd-pages/`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Phase 0 Gate Review

- Local First (I): PASS. Changes are CI/CD-only and do not add network dependence to core app behavior.
- UX First (II): PASS. More reliable delivery improves user trust in public demo stability.
- Test-First (III): PASS. Plan preserves lint, unit, integration, and build checks as required gates.
- Quasar Compliance (IV): PASS. No UI framework changes are introduced.
- MMEX Schema Compatibility (V): PASS. No database schema or migration behavior changes.
- TypeScript Strictness (VI): PASS. No relaxation of type/lint constraints.
- CI/CD & Pages Discipline (VII): PASS. Feature directly enforces this principle.
- MMEX Community Acceptance (VIII): PASS. Plan remains reviewable, upstream-compatible, and SDD-driven.
- Language & Documentation Policy: PASS. Planning artifacts are documented in English.

**Gate Result**: PASS. No blocking constitutional violations.

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
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)
```text
.github/
└── workflows/
  ├── test.yml
  ├── release.yml
  └── version-guard.yml

src/
├── __tests__/
├── locales/
├── router/
├── stores/
└── workers/

e2e/
└── vue.spec.ts
```

**Structure Decision**: Use the existing single-frontend repository structure and implement this feature entirely in `.github/workflows/` plus feature documents under `specs/001-fix-ci-cd-pages/`.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No constitutional violations require justification.

## Post-Phase 1 Constitution Re-Check

- Local First (I): PASS. Design modifies CI/CD only and leaves offline-first runtime untouched.
- UX First (II): PASS. Deployment reliability and faster recovery improve end-user demo quality.
- Test-First (III): PASS. Contracts require quality gates before deploy and preserve test discipline.
- Quasar Compliance (IV): PASS. No component or design-system divergence introduced.
- MMEX Schema Compatibility (V): PASS. No schema-level work included.
- TypeScript Strictness (VI): PASS. No type policy exceptions introduced.
- CI/CD & Pages Discipline (VII): PASS. Deploy path is automated, gated, and auditable.
- MMEX Community Acceptance (VIII): PASS. Artifacts are reviewable and maintain upstream-friendly governance.
- Language & Documentation Policy: PASS. Generated planning artifacts are in English.

**Re-Check Result**: PASS.

## Implementation Notes

- Validation workflow now runs explicit staged quality gates with branch-level concurrency cancellation and failure-stage summaries.
- Release workflow now enforces workflow_run payload guards, deterministic build-from-tested-SHA, GitHub Pages deployment, and idempotent tag/release handling.
- Deployment evidence now includes source branch, source commit SHA, page URL, release tag, and reuse status for reruns.
- Documentation and quickstart now include required checks, troubleshooting runbook, and end-to-end validation checklist.
