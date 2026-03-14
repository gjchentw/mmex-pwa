# Data Model: Constitution Compliance Review

## Entity: ConstitutionClauseAssessment

- Purpose: Captures compliance status for one constitution clause.
- Fields:
  - clauseId (string, required): Stable identifier for constitution clause.
  - clauseTitle (string, required): Human-readable clause title.
  - status (enum, required): compliant | partially-compliant | non-compliant.
  - severity (enum, required when status != compliant): Critical | High | Medium | Low.
  - evidence (array<EvidenceItem>, required when status != compliant): Structured evidence references.
  - rationale (string, required): Why status was assigned.
- Validation rules:
  - status must be one of the allowed enum values.
  - severity is forbidden for compliant items.
  - severity is mandatory for partially-compliant and non-compliant items.

## Entity: EvidenceItem

- Purpose: Reproducible proof for an assessment finding.
- Fields:
  - filePath (string, required): Workspace-relative path.
  - line (integer, required): 1-based line number.
  - clauseId (string, required): Must match parent clause id.
  - observation (string, required): Factual observation.
  - impact (string, required): User/project impact if unresolved.
- Validation rules:
  - filePath must be non-empty and point to repository content.
  - line must be >= 1.
  - observation and impact must be non-empty.

## Entity: ComplianceFinding

- Purpose: Actionable violation record derived from assessments.
- Fields:
  - findingId (string, required): Unique identifier.
  - clauseId (string, required): Referenced constitution clause.
  - severity (enum, required): Critical | High | Medium | Low.
  - summary (string, required): Short description of the violation.
  - recommendationIds (array<string>, required): One or more remediation references.
  - dueDate (date, required): SLA-based target date.
  - state (enum, required): open | in-progress | resolved | reopened.
- Validation rules:
  - recommendationIds length must be >= 1 for all non-compliant findings.
  - dueDate must align with SLA matrix for severity.

## Entity: RemediationRecommendation

- Purpose: Concrete corrective action for one finding.
- Fields:
  - recommendationId (string, required): Unique identifier.
  - findingId (string, required): Parent finding.
  - action (string, required): Specific change to implement.
  - verificationMethod (string, required): How closure will be verified.
  - expectedOutcome (string, required): Measurable post-fix behavior.
  - milestone (string, required): Planned completion milestone.
  - blockers (array<string>, optional): Dependencies or constraints.
- Validation rules:
  - verificationMethod must be executable or inspectable.
  - expectedOutcome must be testable.

## Entity: SeverityPolicy

- Purpose: Defines mandatory closure SLA by severity.
- Fields:
  - severity (enum, required): Critical | High | Medium | Low.
  - maxBusinessDaysToClose (integer, required): 2 | 5 | 10 | 30.
- Validation rules:
  - Mapping is immutable for this feature scope.

## Entity: RevalidationRecord

- Purpose: Tracks post-remediation regression checks.
- Fields:
  - findingId (string, required)
  - previousState (enum, required): resolved | reopened.
  - currentState (enum, required): resolved | reopened.
  - checkedAt (datetime, required)
  - evidenceDelta (string, required): What changed since prior check.
  - decision (enum, required): keep-closed | reopen.
- Validation rules:
  - decision must match currentState.

## Relationships

- ConstitutionClauseAssessment 1..N EvidenceItem.
- ConstitutionClauseAssessment 1..N ComplianceFinding.
- ComplianceFinding 1..N RemediationRecommendation.
- ComplianceFinding 1..N RevalidationRecord.
- SeverityPolicy 1..N ComplianceFinding by severity key.

## State Transitions

- ComplianceFinding:
  - open -> in-progress -> resolved.
  - resolved -> reopened when regression evidence is detected.
  - reopened -> in-progress -> resolved after corrective action.
