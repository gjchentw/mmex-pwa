export type ReportType = 'master-baseline' | 'local-delta'

export type AssessmentStatus = 'compliant' | 'partially-compliant' | 'non-compliant'

export type Severity = 'Critical' | 'High' | 'Medium' | 'Low'

export interface ConstitutionClause {
  clauseId: string
  clauseTitle: string
}

export interface EvidenceItem {
  filePath: string
  line: number
  clauseId: string
  observation: string
  impact: string
}

export interface ConstitutionClauseAssessment {
  clauseId: string
  clauseTitle: string
  status: AssessmentStatus
  severity?: Severity
  evidence?: EvidenceItem[]
  rationale: string
}

export interface Recommendation {
  action: string
  verificationMethod: string
  expectedOutcome: string
  milestone?: string
  blockers?: string[]
}

export type FindingState = 'open' | 'in-progress' | 'resolved' | 'reopened'

export interface ComplianceFinding {
  findingId: string
  clauseId: string
  severity: Severity
  summary: string
  dueDate: string
  recommendations: Recommendation[]
  state?: FindingState
}

export interface RevalidationRecord {
  findingId: string
  previousState: 'resolved' | 'reopened'
  currentState: 'resolved' | 'reopened'
  checkedAt: string
  evidenceDelta: string
  decision: 'keep-closed' | 'reopen'
}

export interface ReportScope {
  branch: string
  commit: string
  diffBase?: string
}

export interface ComplianceReport {
  reportType: ReportType
  generatedAt: string
  constitutionVersion: string
  scope: ReportScope
  assessments: ConstitutionClauseAssessment[]
  findings: ComplianceFinding[]
}

export interface ScopeResolution {
  branch: string
  headCommit: string
  masterCommit: string
  changedInBranch: string[]
  changedInWorkspace: string[]
}
