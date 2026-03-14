import type { ComplianceFinding, Recommendation } from './types.ts'

const recommendationFor = (finding: ComplianceFinding): Recommendation => {
  if (finding.summary.toLowerCase().includes('pages')) {
    return {
      action: 'Add GitHub Pages deployment workflow that runs after successful master CI.',
      verificationMethod: 'Run GitHub Actions workflow and verify Pages artifact publication.',
      expectedOutcome: 'A tested build is automatically deployed as the canonical demo.',
      milestone: 'Next CI governance update',
    }
  }

  if (finding.summary.toLowerCase().includes('migration')) {
    return {
      action: 'Execute migration routine on initialization path before success response.',
      verificationMethod: 'Add integration test validating startup migration behavior.',
      expectedOutcome: 'Schema migrations run automatically on startup without manual intervention.',
      milestone: 'Database compatibility hardening',
    }
  }

  return {
    action: 'Repair upstream PO source linkage and validate locale source consistency in CI.',
    verificationMethod: 'Run compliance and locale linkage checks in CI for locale source files.',
    expectedOutcome: 'Translation terminology traceability to upstream PO files is restored.',
    milestone: 'i18n governance alignment',
  }
}

export const generateRecommendations = (findings: ComplianceFinding[]): ComplianceFinding[] =>
  findings.map((finding) => ({
    ...finding,
    recommendations: [recommendationFor(finding)],
  }))
