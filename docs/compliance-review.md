# Compliance Review Workflow

This project includes a constitution compliance pipeline that generates two outputs per run:

- `reports/compliance/master-baseline.json`
- `reports/compliance/local-delta.json`

## Commands

- `npm run compliance:run`: generate baseline and delta reports.
- `npm run compliance:validate`: validate existing report artifacts against contract schema.
- `npm run compliance:all`: run generation and validation in sequence.

## Output Guarantees

- Every constitution clause is assessed as `compliant`, `partially-compliant`, or `non-compliant`.
- Every non-compliant finding has severity, SLA-aligned due date, and at least one remediation recommendation.
- Evidence entries are structured with `filePath`, `line`, `clauseId`, `observation`, and `impact`.

## Fail Gates

The run fails when any of the following is true:

- Clause coverage is incomplete.
- A non-compliant finding has no remediation recommendation.
- Severity is missing or invalid.
- Report output fails schema validation.
