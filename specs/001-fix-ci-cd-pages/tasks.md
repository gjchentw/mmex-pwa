# Tasks: CI/CD and GitHub Pages Recovery

**Input**: Design documents from `/specs/001-fix-ci-cd-pages/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/github-actions-contract.md, quickstart.md

**Tests**: Include test tasks because the specification and constitution require test-first validation and independent verification.

**Organization**: Tasks are grouped by user story for independent implementation and testing.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish shared scripts, baseline docs, and CI prerequisites.

- [X] T001 Create shared CI helper utilities in `.github/scripts/ci/common.sh`
- [X] T002 [P] Create workflow context collector in `.github/scripts/ci/collect-run-context.sh`
- [X] T003 [P] Create workflow summary writer in `.github/scripts/ci/write-run-summary.sh`
- [X] T004 [P] Add CI/CD architecture and required checks section in `README.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build global gating and deployment foundations required by all stories.

**CRITICAL**: Complete this phase before user story implementation.

- [X] T005 Wire helper scripts into validation pipeline in `.github/workflows/test.yml`
- [X] T006 Add workflow concurrency and cancellation controls in `.github/workflows/test.yml`
- [X] T007 Add workflow_run payload guards for release entrypoint in `.github/workflows/release.yml`
- [X] T008 Define least-privilege workflow permissions in `.github/workflows/test.yml`
- [X] T009 Define least-privilege workflow permissions in `.github/workflows/release.yml`
- [X] T010 Enforce PR version guard transition rules in `.github/workflows/version-guard.yml`

**Checkpoint**: Foundation complete; user stories can proceed.

---

## Phase 3: User Story 1 - Stable Automated Build and Test (Priority: P1)

**Goal**: Ensure PR and push validations run deterministic gates with actionable outcomes.

**Independent Test**: Open a PR and verify lint -> build/type-check -> unit -> e2e passes/fails deterministically with explicit failed stage reporting.

### Tests for User Story 1

- [X] T011 [P] [US1] Add selector-based smoke assertions for app root and SQLite status in `e2e/vue.spec.ts`
- [X] T012 [P] [US1] Configure CI-only retry=1, local retry=0, and smoke timeout behavior in `playwright.config.ts`

### Implementation for User Story 1

- [X] T013 [US1] Split validation into explicit ordered jobs in `.github/workflows/test.yml`
- [X] T014 [US1] Restrict e2e matrix to Chromium for PR and master runs in `.github/workflows/test.yml`
- [X] T015 [US1] Add docs-only path ignore optimization in `.github/workflows/test.yml`
- [X] T016 [US1] Add failed-stage detection and summary reporting in `.github/workflows/test.yml`
- [X] T017 [US1] Add actionlint execution path compatible with workflow permissions in `.github/workflows/test.yml`

**Checkpoint**: User Story 1 is independently functional and testable.

---

## Phase 4: User Story 2 - Successful Publish to GitHub Pages (Priority: P2)

**Goal**: Publish successful master builds to GitHub Pages with deterministic artifacts and evidence.

**Independent Test**: Merge a passing PR to master and confirm release workflow deploys latest content and publishes evidence.

### Tests for User Story 2

- [X] T018 [P] [US2] Add deployment acceptance verification steps for Pages URL and source SHA in `specs/001-fix-ci-cd-pages/quickstart.md`
- [X] T019 [P] [US2] Add release evidence checklist items for tag and page URL in `specs/001-fix-ci-cd-pages/quickstart.md`

### Implementation for User Story 2

- [X] T020 [US2] Add tested-SHA checkout and deterministic artifact build in `.github/workflows/release.yml`
- [X] T021 [US2] Add build-pages artifact upload job in `.github/workflows/release.yml`
- [X] T022 [US2] Add deploy-pages job with github-pages environment and production concurrency in `.github/workflows/release.yml`
- [X] T023 [US2] Gate tag-and-release on successful deploy-pages execution in `.github/workflows/release.yml`
- [X] T024 [US2] Add deployment evidence summary output (branch, SHA, URL, tag) in `.github/workflows/release.yml`

**Checkpoint**: User Stories 1 and 2 both work independently.

---

## Phase 5: User Story 3 - Traceable and Recoverable Failure Handling (Priority: P3)

**Goal**: Make failures easy to diagnose and safe to rerun without feature-code changes.

**Independent Test**: Trigger a controlled failure, identify the failed stage quickly, rerun after fix, and verify successful recovery.

### Tests for User Story 3

- [X] T025 [P] [US3] Add failure-diagnosis and rerun checklist scenarios in `specs/001-fix-ci-cd-pages/quickstart.md`
- [X] T026 [P] [US3] Add operational evidence and rerun idempotency assertions in `specs/001-fix-ci-cd-pages/contracts/github-actions-contract.md`

### Implementation for User Story 3

- [X] T027 [P] [US3] Implement reusable failed-stage detector script in `.github/scripts/ci/detect-failed-stage.sh`
- [X] T028 [US3] Integrate failed-stage detection into validation summaries in `.github/workflows/test.yml`
- [X] T029 [US3] Integrate failed-stage detection into release summaries in `.github/workflows/release.yml`
- [X] T030 [US3] Add idempotent existing tag/release handling for reruns in `.github/workflows/release.yml`
- [X] T031 [US3] Prevent misleading release summaries for skipped non-master runs in `.github/workflows/release.yml`

**Checkpoint**: All user stories are independently functional and testable.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final hardening, consistency, and end-to-end validation.

- [X] T032 [P] Reconcile final implementation notes and constraints in `specs/001-fix-ci-cd-pages/plan.md`
- [X] T033 [P] Align final smoke policy wording across docs in `README.md`
- [ ] T034 Run end-to-end validation checklist and record execution results in `specs/001-fix-ci-cd-pages/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: Start immediately.
- **Phase 2 (Foundational)**: Depends on Phase 1; blocks all user stories.
- **Phase 3 (US1)**: Depends on Phase 2.
- **Phase 4 (US2)**: Depends on Phase 2 and consumes US1 validation contract.
- **Phase 5 (US3)**: Depends on Phase 2 and integrates with US1/US2 workflows.
- **Phase 6 (Polish)**: Depends on completion of all user stories.

### User Story Dependencies

- **US1 (P1)**: No dependency on other user stories.
- **US2 (P2)**: Depends on validated pipeline outputs from US1.
- **US3 (P3)**: Depends on established validation and release flow shape from US1/US2.

### Suggested Completion Order

US1 -> US2 -> US3

---

## Parallel Execution Opportunities

- Setup: T002, T003, T004 can run in parallel after T001 starts.
- Foundational: T008 and T009 can run in parallel after T005.
- US1: T011 and T012 can run in parallel; T015 can proceed after T013.
- US2: T018 and T019 can run in parallel with T020.
- US3: T025, T026, and T027 can run in parallel.
- Polish: T032 and T033 can run in parallel before T034.

---

## Parallel Example: User Story 1

```bash
Task T011: Add selector-based smoke assertions in e2e/vue.spec.ts
Task T012: Configure retry/timeout policy in playwright.config.ts
```

## Parallel Example: User Story 2

```bash
Task T018: Add deployment acceptance verification in specs/001-fix-ci-cd-pages/quickstart.md
Task T019: Add release evidence checklist in specs/001-fix-ci-cd-pages/quickstart.md
```

## Parallel Example: User Story 3

```bash
Task T026: Add rerun idempotency assertions in specs/001-fix-ci-cd-pages/contracts/github-actions-contract.md
Task T027: Implement failed-stage detector in .github/scripts/ci/detect-failed-stage.sh
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 and Phase 2.
2. Complete Phase 3 (US1).
3. Validate deterministic PR quality gates and smoke policy behavior.

### Incremental Delivery

1. Deliver US1 to stabilize quality gates and e2e smoke reliability.
2. Deliver US2 to restore trusted automatic GitHub Pages publication.
3. Deliver US3 to improve diagnosability and rerun safety.
4. Execute final polish and record end-to-end outcomes.

### Parallel Team Strategy

1. Engineer A: Shared scripts + foundational workflow controls (Phase 1-2).
2. Engineer B: US1 validation and smoke policy implementation.
3. Engineer C: US2 release/deploy pipeline hardening.
4. Engineer D: US3 failure analysis, rerun idempotency, and docs.
