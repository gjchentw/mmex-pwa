# Tasks: CI/CD and GitHub Pages Recovery

**Input**: Design documents from `/specs/001-fix-ci-cd-pages/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and workflow standardization

- [X] T001 Verify and maintain branch naming as `master` in all workflow triggers in .github/workflows/
- [X] T002 [P] Update `package.json` engines and script descriptions for CI/CD clarity in package.json
- [X] T003 [P] Configure GitHub repository settings to allow GitHub Actions write permissions for Pages and Releases

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core CI/CD infrastructure and policies

- [X] T004 Update `playwright.config.ts` to enforce CI-specific retry (1) and local retry (0) per FR-010 in playwright.config.ts
- [X] T005 [P] Implement `SR-001` by verifying all workflow steps use `secrets.GITHUB_TOKEN` or repository Secrets in .github/workflows/
- [X] T006 [P] Update `.github/scripts/ci/collect-run-context.sh` to handle the `master` branch correctly in .github/scripts/ci/collect-run-context.sh

---

## Phase 3: User Story 1 - Stable Automated Build and Test (Priority: P1) 🎯 MVP

**Goal**: Ensure every PR and commit to `master` runs a consistent validation pipeline.

**Independent Test**: Trigger `test.yml` on a PR and verify all stages (lint, build, unit, e2e) complete and report status.

### Implementation for User Story 1

- [X] T007 [US1] Update `test.yml` triggers to include `master` branch and exclude non-release paths in .github/workflows/test.yml
- [X] T008 [US1] Add Chromium-only restriction to Playwright installation step in `test.yml` per FR-012 in .github/workflows/test.yml
- [X] T009 [P] [US1] Add artifact upload step for production build output (`dist/`) in `test.yml` per FR-013 in .github/workflows/test.yml
- [X] T010 [P] [US1] Add artifact upload step for Playwright test results and traces in `test.yml` in .github/workflows/test.yml
- [X] T011 [US1] Refine `e2e-tests` job to use stable selectors (`data-testid`) and 10s timeout for SQLite status per FR-008, FR-011 in src/__tests__/sqlite.worker.spec.ts

---

## Phase 4: User Story 2 - Successful Publish to GitHub Pages (Priority: P2)

**Goal**: Automatically publish `master` updates to GitHub Pages.

**Independent Test**: Merge a change to `main` and verify the `release.yml` workflow deploys to the public site.

### Implementation for User Story 2

- [X] T012 [US2] Update `release.yml` to trigger only on successful `test` workflow completion on the `master` branch in .github/workflows/release.yml
- [X] T013 [US2] Configure `deploy-pages` job permissions for `id-token: write` and `pages: write` in .github/workflows/release.yml
- [X] T014 [X] [US2] Ensure `tag-and-release` job correctly enforces the pre-1.0 versioning policy (`0.x.x`) in .github/workflows/release.yml
- [X] T015 [US2] Implement deployment evidence logging in `release-summary` job per FR-007 in .github/workflows/release.yml

---

## Phase 5: User Story 3 - Traceable and Recoverable Failure Handling (Priority: P3)

**Goal**: Provide actionable failure details and automatic notifications.

**Independent Test**: Intentionally break a test and verify the failure notification and summary report.

### Implementation for User Story 3

- [X] T016 [US3] Implement automatic failure notifications (GitHub/Slack/Discord) in `test.yml` and `release.yml` per FR-014 in .github/workflows/test.yml
- [X] T017 [P] [US3] Update `.github/scripts/ci/detect-failed-stage.sh` to accurately identify failed jobs in .github/scripts/ci/detect-failed-stage.sh
- [X] T018 [P] [US3] Update `.github/scripts/ci/write-run-summary.sh` to include failed stage and cause diagnostics in .github/scripts/ci/write-run-summary.sh

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T019 [P] Update `README.md` with current CI/CD status badges and deployment URL in README.md
- [X] T020 Run `quickstart.md` validation to ensure the entire flow is documented and reproducible

## Implementation Summary

- Phase 1 (Setup): Standardized branch triggers and package.json.
- Phase 2 (Foundational): Verified security, retries, and run context.
- Phase 3 (US1): Updated test.yml for artifact uploads and Chromium restriction.
- Phase 4 (US2): Confirmed release.yml triggers and permissions.
- Phase 5 (US3): Verified failure diagnostics and notifications.
- Phase 6 (Polish): README and Quickstart verified.

All tasks completed and verified.
