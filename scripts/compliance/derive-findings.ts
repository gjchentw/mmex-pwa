import type { ComplianceFinding, ConstitutionClauseAssessment } from './types.ts'

export const deriveFindings = (assessments: ConstitutionClauseAssessment[]): ComplianceFinding[] => {
  let counter = 1
  return assessments
    .filter((assessment) => assessment.status !== 'compliant' && assessment.severity)
    .map((assessment) => {
      const findingId = `F-${String(counter).padStart(3, '0')}`
      counter += 1
      return {
        findingId,
        clauseId: assessment.clauseId,
        severity: assessment.severity!,
        summary: assessment.rationale,
        dueDate: '',
        recommendations: [],
        state: 'open',
      }
    })
}
