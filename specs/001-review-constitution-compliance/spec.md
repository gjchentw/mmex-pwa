# Feature Specification: Constitution Compliance Review

**Feature Branch**: `[001-review-constitution-compliance]`  
**Created**: 2026-03-14  
**Status**: Draft  
**Input**: User description: "請根據憲法檢視此專案目前不合規的地方，提出修正建議"

## Clarifications

### Session 2026-03-14

- Q: What should be the formal compliance assessment baseline? → A: Option C - Produce dual outputs: master committed baseline and local uncommitted-delta baseline.
- Q: Which severity model should govern finding prioritization? → A: Option B - Use Critical/High/Medium/Low with required remediation deadlines per level.
- Q: What closure deadlines should apply to each severity level? → A: Option A - Critical 2 business days, High 5 business days, Medium 10 business days, Low 30 business days.
- Q: What evidence format should each finding require? → A: Option B - Structured evidence fields: file path, line, clause id, observation, and impact.
- Q: What is the minimum pass condition for remediation recommendations? → A: Option C - Every non-compliant finding must include at least one verifiable remediation recommendation or the report fails.

## User Scenarios & Testing *(mandatory)*

<!--
  IMPORTANT: User stories should be PRIORITIZED as user journeys ordered by importance.
  Each user story/journey must be INDEPENDENTLY TESTABLE - meaning if you implement just ONE of them,
  you should still have a viable MVP (Minimum Viable Product) that delivers value.
  
  Assign priorities (P1, P2, P3, etc.) to each story, where P1 is the most critical.
  Think of each story as a standalone slice of functionality that can be:
  - Developed independently
  - Tested independently
  - Deployed independently
  - Demonstrated to users independently
-->

### User Story 1 - Identify Constitution Gaps (Priority: P1)

As a project maintainer, I need a full constitution compliance assessment of the current repository so I can immediately see where the project is out of policy.

**Why this priority**: Without a clear baseline of violations, no remediation work can be sequenced or measured.

**Independent Test**: Execute the assessment process on the current repository and confirm it produces a complete gap list mapped to constitution principles, with evidence and severity for each finding.

**Acceptance Scenarios**:

1. **Given** the repository and constitution are available, **When** a compliance assessment is run, **Then** every constitution principle is marked as compliant, non-compliant, or partially compliant.
2. **Given** a non-compliance finding exists, **When** the report is generated, **Then** the finding includes evidence and a clear rationale linked to the relevant constitution clause.

---

### User Story 2 - Receive Actionable Remediation Plan (Priority: P2)

As a project maintainer, I need practical remediation recommendations for each violation so the team can fix gaps in a controlled and auditable way.

**Why this priority**: A gap report without actions does not reduce policy risk or improve project readiness.

**Independent Test**: Review the remediation output and verify each non-compliance item has at least one concrete correction action, expected outcome, and priority.

**Acceptance Scenarios**:

1. **Given** a non-compliance finding, **When** recommendations are produced, **Then** each recommendation includes priority, expected benefit, and completion verification criteria.
2. **Given** multiple findings, **When** remediation is prioritized, **Then** the plan orders work by constitution impact and delivery risk.

---

### User Story 3 - Track Closure and Revalidation (Priority: P3)

As a project maintainer, I need closure criteria for each remediation item so compliance can be revalidated and sustained over time.

**Why this priority**: Revalidation prevents repeated drift and protects long-term alignment with the constitution.

**Independent Test**: Mark sample findings as fixed, rerun validation, and confirm status transitions to compliant only when all evidence-based completion criteria are met.

**Acceptance Scenarios**:

1. **Given** a remediation item is marked complete, **When** compliance is rechecked, **Then** the item is only closed if all linked criteria pass.
2. **Given** previously closed items regress, **When** compliance is rechecked, **Then** those items are automatically reopened with updated evidence.

---

### Edge Cases

- A constitution clause has no directly mappable repository evidence and requires a documented assessment rationale.
- A single repository artifact conflicts with multiple constitution clauses and requires split findings.
- A finding is identified but cannot be remediated immediately due to external dependency constraints.
- A remediation recommendation introduces risk to Local First or UX First principles and must be flagged as non-acceptable.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The assessment MUST evaluate the full active constitution and explicitly cover every principle and policy section.
- **FR-002**: The assessment MUST classify each clause as compliant, partially compliant, or non-compliant.
- **FR-003**: Every partially compliant or non-compliant result MUST include concrete repository evidence and a written rationale.
- **FR-004**: Findings MUST include severity levels based on business impact to delivery, data safety, and community acceptance readiness.
- **FR-005**: The output MUST provide at least one remediation recommendation per non-compliant finding.
- **FR-006**: Each remediation recommendation MUST define expected outcome, verification method, and target completion milestone.
- **FR-007**: The remediation plan MUST prioritize work so higher-risk constitution gaps are addressed before lower-risk gaps.
- **FR-008**: The process MUST identify dependencies or blockers that prevent immediate remediation.
- **FR-009**: The output MUST include a revalidation process describing how compliance is rechecked after changes.
- **FR-010**: The assessment and remediation outputs MUST be written in clear English suitable for external MMEX community review.
- **FR-011**: The assessment MUST produce dual outputs: one report against the latest committed `master` baseline and one delta report for local uncommitted workspace changes.
- **FR-012**: Every finding MUST be assigned one of four severity levels: Critical, High, Medium, or Low.
- **FR-013**: The remediation plan MUST define and enforce a maximum closure deadline for each severity level.
- **FR-014**: The maximum closure deadlines MUST be: Critical within 2 business days, High within 5 business days, Medium within 10 business days, and Low within 30 business days.
- **FR-015**: Every finding MUST include structured evidence fields: file path, line number, constitution clause identifier, observation, and impact statement.
- **FR-016**: The compliance report MUST be marked as failed if any non-compliant finding lacks at least one verifiable remediation recommendation.

### Assumptions & Dependencies

- The latest constitution stored in the repository is authoritative for this assessment cycle.
- The compliance review must evaluate both committed `master` state and current local workspace deltas in the same assessment cycle.
- Repository artifacts needed for evidence collection are accessible and up to date at assessment time.
- Maintainers can assign owners and due milestones after recommendations are generated.
- Community acceptance readiness is evaluated by constitution alignment, not by immediate upstream merge status.

### Key Entities *(include if feature involves data)*

- **Constitution Clause Assessment**: Represents evaluation status of one constitution clause, including clause identifier, compliance status, severity, structured evidence (file path, line, observation, impact), and rationale.
- **Compliance Finding**: Represents a gap that must be remediated, including impacted principles, risk level, and acceptance impact.
- **Remediation Recommendation**: Represents a proposed corrective action, including priority, expected outcome, verification criteria, dependency notes, and target milestone.
- **Severity Policy**: Represents the allowed severity levels and their corresponding maximum remediation deadlines.
- **Revalidation Record**: Represents a follow-up check result, including prior status, current status, evidence delta, and closure decision.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of constitution clauses are assessed and mapped to a compliance status in one report cycle.
- **SC-002**: 100% of non-compliant findings include at least one evidence-backed remediation recommendation.
- **SC-003**: Maintainers can review and approve a prioritized remediation plan for all high-severity findings within 2 business days of report publication.
- **SC-004**: At least 80% of identified non-compliant findings reach compliant status within the agreed remediation milestones.
- **SC-005**: Revalidation detects and reports any regression in previously closed findings within one assessment cycle.
- **SC-006**: 100% of remediation items have due dates that match the approved severity deadline matrix.
- **SC-007**: 0 non-compliant findings are published without at least one verifiable remediation recommendation.
