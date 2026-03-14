import { assessClauses } from './assess-clauses.ts'
import { assignDueDates } from './assign-due-dates.ts'
import { deriveFindings } from './derive-findings.ts'
import { generateRecommendations } from './generate-recommendations.ts'
import type { ComplianceReport, ConstitutionClause, ScopeResolution } from './types.ts'

interface BuildArgs {
  clauses: ConstitutionClause[]
  constitutionVersion: string
  scope: ScopeResolution
  generatedAt: Date
}

export const buildDualReports = async ({
  clauses,
  constitutionVersion,
  scope,
  generatedAt,
}: BuildArgs): Promise<ComplianceReport[]> => {
  const masterAssessments = await assessClauses(clauses, 'master-baseline', scope)
  const localAssessments = await assessClauses(clauses, 'local-delta', scope)

  const withFindings = (assessments: typeof masterAssessments): Omit<ComplianceReport, 'reportType' | 'scope'> => {
    const findings = assignDueDates(
      generateRecommendations(deriveFindings(assessments)),
      generatedAt,
    )

    return {
      generatedAt: generatedAt.toISOString(),
      constitutionVersion,
      assessments,
      findings,
    }
  }

  const base = withFindings(masterAssessments)
  const delta = withFindings(localAssessments)

  return [
    {
      reportType: 'master-baseline',
      ...base,
      scope: {
        branch: scope.branch,
        commit: scope.masterCommit,
      },
    },
    {
      reportType: 'local-delta',
      ...delta,
      scope: {
        branch: scope.branch,
        commit: scope.headCommit,
        diffBase: scope.masterCommit,
      },
    },
  ]
}
