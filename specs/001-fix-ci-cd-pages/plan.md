# Implementation Plan: CI/CD and GitHub Pages Recovery

**Branch**: `001-fix-ci-cd-pages` | **Date**: 2026-03-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-fix-ci-cd-pages/spec.md`

## Summary

This feature fixes the GitHub Actions CI/CD pipeline and ensures stable deployment to GitHub Pages from the `main` branch. It incorporates automated quality checks (lint, build, unit, e2e), artifact management, failure notifications, and security-first secret handling.

## Technical Context

**Language/Version**: TypeScript 5.9.0, Node.js 22.x
**Primary Dependencies**: Vite 7.x, Vue 3.x, Quasar 2.x, Playwright 1.56.x, Vitest 3.x
**Storage**: GitHub Actions Artifacts, GitHub Pages
**Testing**: Playwright (E2E Smoke Tests), Vitest (Unit)
**Target Platform**: GitHub Pages (PWA)
**Project Type**: PWA (Web Application)
**Performance Goals**: Mainline check-to-publish < 10 min, Site availability < 2 min after deploy.
**Constraints**: `master` branch deployment only, 1 E2E retry in CI, Chromium only, GitHub Secrets for security.
**Scale/Scope**: CI/CD automation and deployment.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Justification |
|-----------|--------|---------------|
| I. Local First | ✅ | CI/CD does not affect local-first logic. |
| II. UX First | ✅ | Stable deployments ensure the public site version is always fresh. |
| III. Test-First | ✅ | Mandatory quality checks (Vitest, Playwright) are the core of this fix. |
| IV. Quasar Compliance | ✅ | Not applicable (DevOps focus). |
| V. MMEX Schema | ✅ | Not applicable (DevOps focus). |
| VI. TS Strictness | ✅ | Workflow scripts will be checked for quality. |
| VII. CI/CD Discipline | ✅ | This IS the implementation of CI/CD discipline. |
| VIII. MMEX Community | ✅ | Standardized, readable, and traceable automation for community trust. |

## Project Structure

### Documentation (this feature)

```text
specs/001-fix-ci-cd-pages/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (future)
```

### Source Code (repository root)

```text
.github/
├── workflows/
│   ├── test.yml          # Validation pipeline
│   ├── release.yml       # Deployment pipeline
│   └── version-guard.yml # Versioning constraints
└── scripts/ci/           # CI/CD helper scripts

playwright.config.ts      # E2E configuration
package.json              # Dependencies and build scripts
```

**Structure Decision**: Standard GitHub Actions workflow and script structure.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |
