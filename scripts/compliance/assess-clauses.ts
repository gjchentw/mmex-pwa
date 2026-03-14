import { lstat, readFile } from 'node:fs/promises'
import path from 'node:path'
import { buildEvidenceFromNeedle } from './extract-evidence.ts'
import type {
  ConstitutionClause,
  ConstitutionClauseAssessment,
  ReportType,
  ScopeResolution,
  Severity,
} from './types.ts'

interface FailureResult {
  status: 'partially-compliant' | 'non-compliant'
  severity: Severity
  rationale: string
  evidence: Awaited<ReturnType<typeof buildEvidenceFromNeedle>>[]
}

const checkPagesWorkflow = async (
  clauseId: string,
  reportType: ReportType,
  scope: ScopeResolution,
): Promise<FailureResult | null> => {
  const workflowPath = path.resolve('.github/workflows')
  const files = await readFile(path.resolve('.github/workflows/test.yml'), 'utf8').catch(() => '')
  const release = await readFile(path.resolve('.github/workflows/release.yml'), 'utf8').catch(() => '')
  const combined = `${files}\n${release}`
  const hasPages = /pages|deploy/i.test(combined)
  const impacted = scope.changedInWorkspace.some((f) => f.startsWith('.github/workflows/'))

  if (hasPages) {
    return null
  }

  if (reportType === 'local-delta' && !impacted) {
    return null
  }

  const evidence = [
    await buildEvidenceFromNeedle(
      clauseId,
      '.github/workflows/release.yml',
      'name: release',
      'GitHub Pages deployment workflow is not present in current CI definitions.',
      'Public demo deployment discipline cannot be guaranteed from CI.',
    ),
  ]

  return {
    status: 'non-compliant',
    severity: 'High',
    rationale: `No Pages deployment signal found under ${workflowPath}.`,
    evidence,
  }
}

const checkMigrationStartup = async (
  clauseId: string,
  reportType: ReportType,
  scope: ScopeResolution,
): Promise<FailureResult | null> => {
  const workerPath = path.resolve('src/workers/sqlite.worker.ts')
  const worker = await readFile(workerPath, 'utf8').catch(() => '')
  const initHasMigrate = /const initDb[\s\S]*migrateDb\(db\)/m.test(worker)
  const impacted = scope.changedInWorkspace.includes('src/workers/sqlite.worker.ts')
  if (initHasMigrate || (reportType === 'local-delta' && !impacted)) {
    return null
  }
  const evidence = [
    await buildEvidenceFromNeedle(
      clauseId,
      'src/workers/sqlite.worker.ts',
      'const initDb',
      'Initialization path does not execute migration routine before reporting success.',
      'Schema drift can persist at startup, weakening compatibility guarantees.',
    ),
  ]
  return {
    status: 'partially-compliant',
    severity: 'Critical',
    rationale: 'Migration is implemented but not enforced on the initialization path.',
    evidence,
  }
}

const checkPoLinkage = async (
  clauseId: string,
  reportType: ReportType,
  scope: ScopeResolution,
): Promise<FailureResult | null> => {
  const candidates = ['src/locales/en_US.po', 'src/locales/zh_TW.po']
  const impacted = scope.changedInWorkspace.some((f) => f.startsWith('src/locales/'))
  if (reportType === 'local-delta' && !impacted) {
    return null
  }

  for (const file of candidates) {
    try {
      const stat = await lstat(path.resolve(file))
      if (stat.isSymbolicLink()) {
        // Broken symlinks throw on readFile in local setup; detect by trying to read.
        await readFile(path.resolve(file), 'utf8')
      }
    } catch {
      const evidence = [
        await buildEvidenceFromNeedle(
          clauseId,
          'src/locales/en-US.json',
          '"app"',
          `${file} cannot be resolved to an upstream PO source in this workspace.`,
          'Terminology traceability to upstream MMEX PO files is weakened.',
        ),
      ]
      return {
        status: 'partially-compliant',
        severity: 'Medium',
        rationale: 'Upstream-first translation source references are present but not fully resolvable.',
        evidence,
      }
    }
  }

  return null
}

export const assessClauses = async (
  clauses: ConstitutionClause[],
  reportType: ReportType,
  scope: ScopeResolution,
): Promise<ConstitutionClauseAssessment[]> => {
  const assessments: ConstitutionClauseAssessment[] = []

  for (const clause of clauses) {
    let failure: FailureResult | null = null

    if (clause.clauseTitle.includes('CI/CD & GitHub Pages')) {
      failure = await checkPagesWorkflow(clause.clauseId, reportType, scope)
    } else if (clause.clauseTitle.includes('MMEX Schema Compatibility')) {
      failure = await checkMigrationStartup(clause.clauseId, reportType, scope)
    } else if (clause.clauseTitle.includes('MMEX Community Acceptance')) {
      failure = await checkPoLinkage(clause.clauseId, reportType, scope)
    }

    if (failure) {
      assessments.push({
        clauseId: clause.clauseId,
        clauseTitle: clause.clauseTitle,
        status: failure.status,
        severity: failure.severity,
        evidence: failure.evidence,
        rationale: failure.rationale,
      })
      continue
    }

    assessments.push({
      clauseId: clause.clauseId,
      clauseTitle: clause.clauseTitle,
      status: 'compliant',
      rationale:
        reportType === 'local-delta'
          ? 'No local delta evidence indicates a constitutional regression for this clause.'
          : 'No non-compliant evidence detected for this clause in baseline assessment.',
    })
  }

  return assessments
}
