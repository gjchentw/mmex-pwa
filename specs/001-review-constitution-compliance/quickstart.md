# Quickstart: Constitution Compliance Review

## 1. Preconditions

- Ensure repository dependencies are installed:
  - npm ci
- Ensure working tree is available for dual-output mode:
  - master committed baseline is reachable.
  - local workspace changes (if any) are present for delta output.

## 2. Generate assessment inputs

- Confirm constitution source:
  - .specify/memory/constitution.md
- Confirm feature spec source:
  - specs/001-review-constitution-compliance/spec.md
- Confirm output contract:
  - specs/001-review-constitution-compliance/contracts/compliance-report.schema.json

## 3. Produce dual outputs

Run:

- `npm run compliance:run`

- Baseline report target:
  - reports/compliance/master-baseline.json
- Local delta report target:
  - reports/compliance/local-delta.json

Each report must include:
- Clause coverage status.
- Structured evidence entries (filePath, line, clauseId, observation, impact).
- Severity and SLA-derived due date for each non-compliant finding.
- At least one verifiable remediation recommendation per non-compliant finding.

## 4. Validate report contract

- Validate each report against compliance-report.schema.json:
  - `npm run compliance:validate`
- Reject report if any schema error occurs.

## 5. Enforce fail gates

A report is failed when any of the following is true:
- A constitution clause is not evaluated.
- A non-compliant finding has no remediation recommendation.
- Severity is missing or outside Critical/High/Medium/Low.
- Due date does not match SLA matrix:
  - Critical: 2 business days
  - High: 5 business days
  - Medium: 10 business days
  - Low: 30 business days

## 6. Revalidation flow

- After a remediation is marked resolved, run assessment again.
- If evidence indicates recurrence, reopen finding and create RevalidationRecord.
- Closure is valid only when verification method passes and no regression appears.

## 7. CI integration targets

- Keep additional compliance step overhead below 15 seconds.
- Publish both outputs as CI artifacts for maintainer review.
- Block merge when fail gate conditions are met.

## 8. Troubleshooting

- If schema validation reports draft version errors:
  - Ensure `ajv` and `ajv-formats` are installed and lockfile is up to date.
- If local delta output appears empty unexpectedly:
  - Confirm there are uncommitted changes via `git status`.
- If recommendation fail gate triggers:
  - Add at least one recommendation with `action`, `verificationMethod`, and `expectedOutcome`.
- If due date checks fail:
  - Recalculate SLA windows using business-day rules (Critical 2, High 5, Medium 10, Low 30).
