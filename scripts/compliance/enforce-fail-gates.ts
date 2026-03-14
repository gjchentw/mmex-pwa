import type { ComplianceFinding, ConstitutionClause, ConstitutionClauseAssessment } from './types.ts'

const allowed = new Set(['Critical', 'High', 'Medium', 'Low'])

export const enforceFailGates = (
  clauses: ConstitutionClause[],
  assessments: ConstitutionClauseAssessment[],
  findings: ComplianceFinding[],
): string[] => {
  const errors: string[] = []

  const expectedIds = new Set(clauses.map((c) => c.clauseId))
  const assessedIds = new Set(assessments.map((a) => a.clauseId))

  for (const id of expectedIds) {
    if (!assessedIds.has(id)) {
      errors.push(`Clause coverage missing assessment for clause: ${id}.`)
    }
  }

  for (const id of assessedIds) {
    if (!expectedIds.has(id)) {
      errors.push(`Unexpected assessment found for unknown clause: ${id}.`)
    }
  }

  const seenIds = new Map<string, number>()
  for (const assessment of assessments) {
    seenIds.set(assessment.clauseId, (seenIds.get(assessment.clauseId) ?? 0) + 1)
  }
  for (const [id, count] of seenIds) {
    if (count > 1) {
      errors.push(`Duplicate assessment found for clause: ${id}.`)
    }
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
