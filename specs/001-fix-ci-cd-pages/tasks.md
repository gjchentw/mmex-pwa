# Tasks: CI/CD and GitHub Pages Recovery

**Input**: Design documents from `/specs/001-fix-ci-cd-pages/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/github-actions-contract.md, quickstart.md

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish shared workflow tooling and documentation baseline.

- [x] T001 Create CI run context helper script in `.github/scripts/ci/collect-run-context.sh`
- [x] T002 [P] Create workflow summary helper script in `.github/scripts/ci/write-run-summary.sh`
- [x] T003 [P] Add CI/CD architecture overview section in `README.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build core workflow foundations that all user stories depend on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T004 Add strict shell defaults and shared helpers in `.github/scripts/ci/common.sh`
- [x] T005 Wire shared helper scripts into validation workflow in `.github/workflows/test.yml`
- [x] T006 Add workflow-level concurrency and cancel-in-progress controls in `.github/workflows/test.yml`
- [x] T007 Add workflow_run payload guard checks in `.github/workflows/release.yml`
- [x] T008 Define least-privilege baseline permissions in `.github/workflows/release.yml`

**Checkpoint**: Foundation ready - user story implementation can now begin.

---

## Phase 3: User Story 1 - Stable Automated Build and Test (Priority: P1) 🎯 MVP

**Goal**: Ensure every PR and push executes deterministic quality gates with clear pass/fail outcomes.

**Independent Test**: Open a PR with a valid change and verify lint, build/type-check, unit, and e2e all execute in order with explicit status and failure-stage visibility.

### Implementation for User Story 1

- [x] T009 [US1] Split validation into explicit lint/build/unit/e2e jobs in `.github/workflows/test.yml`
- [x] T010 [P] [US1] Add workflow syntax validation step using actionlint in `.github/workflows/test.yml`
- [x] T011 [US1] Enforce gate ordering with job dependencies in `.github/workflows/test.yml`
- [x] T012 [US1] Block deploy eligibility when any quality gate fails in `.github/workflows/test.yml`
- [x] T013 [P] [US1] Add docs-only path filters to reduce unnecessary full runs in `.github/workflows/test.yml`
- [x] T014 [US1] Add failure-stage summary output for failed validation runs in `.github/workflows/test.yml`
- [x] T015 [US1] Document validation workflow behavior and required checks in `README.md`

**Checkpoint**: User Story 1 is independently functional and testable.

---

## Phase 4: User Story 2 - Successful Publish to GitHub Pages (Priority: P2)

**Goal**: Publish approved master builds to GitHub Pages with deterministic artifacts and auditable outcomes.

**Independent Test**: Merge a passing PR to master and verify release workflow publishes latest content to GitHub Pages and exposes deployment evidence.

### Implementation for User Story 2

- [x] T016 [US2] Add Pages deployment permissions and environment settings in `.github/workflows/release.yml`
- [x] T017 [US2] Add build-and-upload Pages artifact job in `.github/workflows/release.yml`
- [x] T018 [US2] Add deploy-pages job with production concurrency group in `.github/workflows/release.yml`
- [x] T019 [US2] Gate tag and GitHub Release creation on successful master deployment in `.github/workflows/release.yml`
- [x] T020 [US2] Add post-deploy evidence summary (URL, SHA, release tag) in `.github/workflows/release.yml`
- [x] T021 [US2] Add public-site verification steps for master deploys in `specs/001-fix-ci-cd-pages/quickstart.md`

**Checkpoint**: User Stories 1 and 2 both work independently.

---

## Phase 5: User Story 3 - Traceable and Recoverable Failure Handling (Priority: P3)

**Goal**: Make failures easy to diagnose and rerun without code changes.

**Independent Test**: Trigger a controlled workflow failure, verify failed stage is explicit, fix config, rerun, and confirm recovery to successful validation/deploy.

### Implementation for User Story 3

- [x] T022 [P] [US3] Create failed-stage detection helper script in `.github/scripts/ci/detect-failed-stage.sh`
- [x] T023 [US3] Integrate failed-stage detection into validation workflow summaries in `.github/workflows/test.yml`
- [x] T024 [US3] Integrate failed-stage detection into release workflow summaries in `.github/workflows/release.yml`
- [x] T025 [US3] Add idempotent rerun safeguards for existing tags/releases in `.github/workflows/release.yml`
- [x] T026 [US3] Add troubleshooting and rerun runbook steps in `specs/001-fix-ci-cd-pages/quickstart.md`
- [x] T027 [US3] Align operational evidence requirements with implemented workflow outputs in `specs/001-fix-ci-cd-pages/contracts/github-actions-contract.md`

**Checkpoint**: All user stories are independently functional and testable.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final consistency, hardening, and end-to-end validation.

- [x] T028 [P] Harden workflow timeout/retry settings for external dependencies in `.github/workflows/test.yml`
- [x] T029 [P] Harden workflow timeout/retry settings for deployment steps in `.github/workflows/release.yml`
- [x] T030 Reconcile final implementation notes with constitution gates in `specs/001-fix-ci-cd-pages/plan.md`
- [ ] T031 Run end-to-end validation checklist and record outcomes in `specs/001-fix-ci-cd-pages/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies; start immediately.
- **Phase 2 (Foundational)**: Depends on Phase 1; blocks all user story phases.
- **Phase 3 (US1)**: Depends on Phase 2 completion.
- **Phase 4 (US2)**: Depends on Phase 2 completion and uses US1 quality-gate outputs.
- **Phase 5 (US3)**: Depends on Phase 2 completion; can run alongside late US2 work once deploy flow exists.
- **Phase 6 (Polish)**: Depends on completion of all user stories.

### User Story Dependencies

- **US1 (P1)**: No dependency on other user stories.
- **US2 (P2)**: Depends on foundational setup and consumes successful validation contract from US1.
- **US3 (P3)**: Depends on foundational setup; integrates with both validation and release workflows after US1/US2 structures exist.

### Suggested Completion Order

- US1 -> US2 -> US3

---

## Parallel Execution Opportunities

- Setup parallel tasks: T002, T003
- Foundational tasks with low coupling: T006 and T008 after T005
- US1 parallel tasks: T010 and T013
- US2 parallelizable documentation/verification: T021 can run after T018 starts
- US3 parallel tasks: T022 and T026
- Polish parallel tasks: T028 and T029

---

## Parallel Example: User Story 1

```bash
# Parallelizable within US1 after T009 starts:
Task T010: Add workflow syntax validation step in .github/workflows/test.yml
Task T013: Add docs-only path filters in .github/workflows/test.yml
```

## Parallel Example: User Story 2

```bash
# Parallelizable after deploy job shape is defined:
Task T020: Add post-deploy evidence summary in .github/workflows/release.yml
Task T021: Add public-site verification steps in specs/001-fix-ci-cd-pages/quickstart.md
```

## Parallel Example: User Story 3

```bash
# Parallelizable diagnostics work:
Task T022: Create failed-stage detection helper in .github/scripts/ci/detect-failed-stage.sh
Task T026: Add troubleshooting and rerun runbook in specs/001-fix-ci-cd-pages/quickstart.md
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 1 and Phase 2.
2. Complete Phase 3 (US1).
3. Validate PR quality-gate reliability and failure reporting before proceeding.

### Incremental Delivery

1. Deliver US1 to stabilize CI gate reliability.
2. Deliver US2 to restore trusted automatic GitHub Pages publication.
3. Deliver US3 to optimize incident diagnosis and recovery.
4. Finish Phase 6 polish and final quickstart validation.

### Parallel Team Strategy

1. One developer handles shared scripts and foundational workflow wiring (Phase 1-2).
2. One developer implements US1 validation reliability tasks.
3. One developer implements US2 deployment flow after US1 contract is stable.
4. One developer implements US3 diagnostics/runbook tasks after core workflow shapes are in place.
