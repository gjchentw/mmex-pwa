# Phase 0 Research: Constitution Compliance Review

## Decision 1: Dual-output assessment is mandatory

- Decision: Generate two outputs for every run: (a) master committed baseline report, and (b) local uncommitted-delta report.
- Rationale: This separates inherited repository debt from newly introduced drift, improves triage, and supports reviewer traceability.
- Alternatives considered:
  - Single merged report: rejected because it obscures whether violations pre-existed.
  - Delta-only report: rejected because it cannot establish full constitutional coverage.

## Decision 2: Severity policy is fixed to four levels with closure SLAs

- Decision: Use Critical/High/Medium/Low with strict deadlines: Critical 2 business days, High 5, Medium 10, Low 30.
- Rationale: This creates deterministic prioritization and converts findings into schedulable work.
- Alternatives considered:
  - Three-level severity: rejected due to insufficient distinction for blocking issues.
  - Numeric risk score only: rejected because it is less actionable for daily backlog management.

## Decision 3: Evidence must be structured and machine-checkable

- Decision: Every finding stores file path, line number, clause id, observation, and impact.
- Rationale: Structured evidence is reproducible, auditable, and can be validated automatically in CI.
- Alternatives considered:
  - Free-form narrative evidence: rejected because review quality becomes inconsistent.
  - Path-only evidence: rejected because it is not specific enough for repeatable verification.

## Decision 4: Missing remediation is a hard fail condition

- Decision: Any non-compliant finding without at least one verifiable remediation recommendation fails the report.
- Rationale: Prevents non-actionable audits and enforces direct path from discovery to closure.
- Alternatives considered:
  - Advisory-only recommendation policy: rejected because unresolved findings accumulate.
  - High/Critical-only requirement: rejected due to medium-risk backlog rot.

## Decision 5: Revalidation is continuous and regression-aware

- Decision: Revalidation runs after remediation and must reopen findings when evidence regresses.
- Rationale: Constitutional compliance must be sustained, not only achieved once.
- Alternatives considered:
  - Periodic manual audits only: rejected due to long detection windows.
  - Checklist-only closure: rejected because no executable verification exists.

## Decision 6: Performance and scope targets for this repository

- Decision: Set operational targets to keep compliance checks lightweight.
- Rationale: The repository is a small-to-medium TypeScript Vue project, so governance checks must not create heavy developer friction.
- Targets:
  - Local assessment latency: under 5 seconds.
  - Report generation latency: under 2 seconds.
  - Additional CI overhead: under 15 seconds.
  - Regression linkage: 100% of remediated findings mapped to at least one verification method.
- Alternatives considered:
  - No explicit targets: rejected because performance regressions would be invisible.
