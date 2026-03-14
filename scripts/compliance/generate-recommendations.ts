import type { ComplianceFinding, Recommendation } from './types.ts'

const recommendationByClause: Record<string, Recommendation> = {
  'I.ci-cd-github-pages': {
    action: 'Add GitHub Pages deployment workflow that runs after successful master CI.',
    verificationMethod: 'Run GitHub Actions workflow and verify Pages artifact publication.',
    expectedOutcome: 'A tested build is automatically deployed as the canonical demo.',
    milestone: 'Next CI governance update',
  },
  'II.mmex-schema-compatibility': {
    action: 'Execute migration routine on initialization path before success response.',
    verificationMethod: 'Add integration test validating startup migration behavior.',
    expectedOutcome: 'Schema migrations run automatically on startup without manual intervention.',
    milestone: 'Database compatibility hardening',
  },
  'III.mmex-community-acceptance': {
    action: 'Repair upstream PO source linkage and validate locale source consistency in CI.',
    verificationMethod: 'Run compliance and locale linkage checks in CI for locale source files.',
    expectedOutcome: 'Translation terminology traceability to upstream PO files is restored.',
    milestone: 'i18n governance alignment',
  },
}

const fallbackRecommendation: Recommendation = {
  action: 'Review and address the identified constitutional violation.',
  verificationMethod: 'Run compliance checks in CI and confirm all clause assessments pass.',
  expectedOutcome: 'All constitution clauses are satisfied and compliance report has no findings.',
  milestone: 'Constitution compliance alignment',
}

const recommendationFor = (finding: ComplianceFinding): Recommendation =>
  recommendationByClause[finding.clauseId] ?? fallbackRecommendation

export const generateRecommendations = (findings: ComplianceFinding[]): ComplianceFinding[] =>
  findings.map((finding) => ({
    ...finding,
    recommendations: [recommendationFor(finding)],
  }))
