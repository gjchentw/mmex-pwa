import type { ComplianceFinding, ConstitutionClause, ConstitutionClauseAssessment } from './types.ts'

const allowed = new Set(['Critical', 'High', 'Medium', 'Low'])

export const enforceFailGates = (
  clauses: ConstitutionClause[],
  assessments: ConstitutionClauseAssessment[],
  findings: ComplianceFinding[],
): string[] => {
  const errors: string[] = []

  if (assessments.length !== clauses.length) {
    errors.push(`Clause coverage mismatch: expected ${clauses.length}, got ${assessments.length}.`)
  }

  for (const finding of findings) {
    if (!allowed.has(finding.severity)) {
      errors.push(`Invalid severity for ${finding.findingId}: ${finding.severity}`)
    }

    if (!finding.recommendations || finding.recommendations.length === 0) {
      errors.push(`Missing remediation recommendation for ${finding.findingId}.`)
    }

    if (!finding.dueDate) {
      errors.push(`Missing due date for ${finding.findingId}.`)
    }
  }

  return errors
}
