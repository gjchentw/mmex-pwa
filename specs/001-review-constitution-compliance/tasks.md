# Tasks: Constitution Compliance Review

**Input**: Design documents from `/specs/001-review-constitution-compliance/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/, quickstart.md

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Bootstrap compliance-review execution paths and repository wiring.

- [X] T001 Create compliance script entrypoint scaffold in `scripts/compliance/index.ts`
- [X] T002 Create compliance types scaffold for report structures in `scripts/compliance/types.ts`
- [X] T003 [P] Add compliance output directory placeholder in `reports/compliance/.gitkeep`
- [X] T004 [P] Add compliance script commands in `package.json`
- [X] T005 Create repository-level compliance usage guide in `docs/compliance-review.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Implement shared infrastructure required by all user stories.

**⚠️ CRITICAL**: No user story work begins before this phase is complete.

- [X] T006 Implement constitution source loader from `.specify/memory/constitution.md` in `scripts/compliance/load-constitution.ts`
- [X] T007 [P] Implement git baseline and delta scope resolver in `scripts/compliance/resolve-scope.ts`
- [X] T008 [P] Implement JSON Schema validator for reports in `scripts/compliance/validate-report.ts`
- [X] T009 Implement severity SLA policy mapper (2/5/10/30 business days) in `scripts/compliance/severity-policy.ts`
- [X] T010 Add CI workflow for compliance generation and contract validation in `.github/workflows/compliance-review.yml`

**Checkpoint**: Foundation ready. User stories can now be implemented independently.

---

## Phase 3: User Story 1 - Identify Constitution Gaps (Priority: P1) 🎯 MVP

**Goal**: Produce complete clause-by-clause compliance assessments with structured evidence in dual outputs.

**Independent Test**: Run compliance generation and confirm both `master-baseline.json` and `local-delta.json` contain full clause coverage with status and structured evidence fields.

### Implementation for User Story 1

- [X] T011 [US1] Implement clause assessment engine for compliant/partial/non-compliant classification in `scripts/compliance/assess-clauses.ts`
- [X] T012 [P] [US1] Implement structured evidence extractor (file path, line, clauseId, observation, impact) in `scripts/compliance/extract-evidence.ts`
- [X] T013 [US1] Implement dual report builder for master baseline and local delta in `scripts/compliance/build-dual-reports.ts`
- [X] T014 [US1] Implement report writer to `reports/compliance/master-baseline.json` in `scripts/compliance/write-report.ts`
- [X] T015 [US1] Implement report writer to `reports/compliance/local-delta.json` in `scripts/compliance/write-report.ts`

**Checkpoint**: US1 produces complete, evidence-backed dual compliance reports.

---

## Phase 4: User Story 2 - Receive Actionable Remediation Plan (Priority: P2)

**Goal**: Ensure every non-compliant finding has prioritized, verifiable remediation recommendations and SLA-aligned due dates.

**Independent Test**: Generate findings and verify each non-compliant item has severity, due date from SLA matrix, and at least one recommendation with verification method.

### Implementation for User Story 2

- [X] T016 [US2] Implement finding derivation from assessments in `scripts/compliance/derive-findings.ts`
- [X] T017 [P] [US2] Implement recommendation generator with verification method and expected outcome in `scripts/compliance/generate-recommendations.ts`
- [X] T018 [US2] Implement fail-gate enforcement for missing recommendations in `scripts/compliance/enforce-fail-gates.ts`
- [X] T019 [US2] Implement SLA due-date assignment by severity in `scripts/compliance/assign-due-dates.ts`

**Checkpoint**: US2 outputs actionable remediation plans and fails on non-actionable reports.

---

## Phase 5: User Story 3 - Track Closure and Revalidation (Priority: P3)

**Goal**: Revalidate remediated findings, detect regressions, and reopen findings with traceable history.

**Independent Test**: Re-run compliance after simulated closure and confirm regressions reopen findings with revalidation records and updated decision state.

### Implementation for User Story 3

- [X] T020 [US3] Implement finding lifecycle state transition handler in `scripts/compliance/manage-finding-state.ts`
- [X] T021 [P] [US3] Implement revalidation evaluator comparing prior and current evidence in `scripts/compliance/revalidate-findings.ts`
- [X] T022 [US3] Implement revalidation record emitter (previousState/currentState/evidenceDelta/decision) in `scripts/compliance/write-revalidation-record.ts`
- [X] T023 [US3] Integrate revalidation step into main compliance pipeline in `scripts/compliance/index.ts`

**Checkpoint**: US3 can keep findings closed only when verification still passes, otherwise reopens automatically.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final consistency, developer usability, and release readiness.

- [X] T024 [P] Add example compliant and non-compliant sample reports in `specs/001-review-constitution-compliance/examples/`
- [X] T025 Update quickstart execution commands and troubleshooting notes in `specs/001-review-constitution-compliance/quickstart.md`
- [X] T026 Run quickstart end-to-end validation and record outcomes in `specs/001-review-constitution-compliance/validation-log.md`
- [X] T027 [P] Update root project documentation for compliance workflow usage in `README.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: Starts immediately.
- **Phase 2 (Foundational)**: Depends on Phase 1; blocks all user stories.
- **Phase 3 (US1)**: Depends on Phase 2 completion.
- **Phase 4 (US2)**: Depends on Phase 3 outputs (assessments/evidence).
- **Phase 5 (US3)**: Depends on Phase 4 outputs (findings/recommendations).
- **Phase 6 (Polish)**: Depends on all user story phases.

### User Story Dependencies

- **US1 (P1)**: First deliverable, no dependency on other user stories.
- **US2 (P2)**: Requires US1 report artifacts.
- **US3 (P3)**: Requires US2 actionable findings and due dates.

### Within Each User Story

- Build core model/logic before orchestration steps.
- Ensure output contract validation passes before moving to next story.
- Close story only when its independent test criterion passes.

## Parallel Opportunities

- Setup: T003 and T004 can run in parallel after T001/T002 scaffolding starts.
- Foundational: T007 and T008 can run in parallel after T006.
- US1: T012 can run in parallel with T011 before report assembly T013.
- US2: T017 can run in parallel with T016 before enforcement T018.
- US3: T021 can run in parallel with T020 before integration T023.
- Polish: T024 and T027 can run in parallel.

## Parallel Example: User Story 1

```bash
# Parallel implementation for US1:
Task: "T011 [US1] Implement clause assessment engine in scripts/compliance/assess-clauses.ts"
Task: "T012 [P] [US1] Implement structured evidence extractor in scripts/compliance/extract-evidence.ts"
```

## Parallel Example: User Story 2

```bash
# Parallel implementation for US2:
Task: "T016 [US2] Implement finding derivation in scripts/compliance/derive-findings.ts"
Task: "T017 [P] [US2] Implement recommendation generator in scripts/compliance/generate-recommendations.ts"
```

## Parallel Example: User Story 3

```bash
# Parallel implementation for US3:
Task: "T020 [US3] Implement finding lifecycle state handler in scripts/compliance/manage-finding-state.ts"
Task: "T021 [P] [US3] Implement revalidation evaluator in scripts/compliance/revalidate-findings.ts"
```

## Implementation Strategy

### MVP First (US1)

1. Finish Phase 1 and Phase 2.
2. Deliver Phase 3 (US1) dual compliance outputs.
3. Validate US1 independent test before expanding scope.

### Incremental Delivery

1. Add US1 for complete visibility of gaps.
2. Add US2 for actionable remediation and fail-gates.
3. Add US3 for sustained compliance through revalidation.
4. Finish with polish tasks for onboarding and repeatability.

### Team Parallelization

1. One developer handles foundation pipeline (T006-T010).
2. One developer implements assessment/evidence path (US1).
3. One developer implements remediation/revalidation path (US2/US3) after US1 contract is stable.
