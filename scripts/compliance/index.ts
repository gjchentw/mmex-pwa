import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { buildDualReports } from './build-dual-reports.ts'
import { enforceFailGates } from './enforce-fail-gates.ts'
import { loadConstitution } from './load-constitution.ts'
import { resolveScope } from './resolve-scope.ts'
import { revalidateFindings } from './revalidate-findings.ts'
import { validateReport } from './validate-report.ts'
import { writeReport } from './write-report.ts'
import { writeRevalidationRecord } from './write-revalidation-record.ts'
import type { ComplianceFinding, ComplianceReport, RevalidationRecord } from './types.ts'

const parseJsonIfExists = async <T>(filePath: string, fallback: T): Promise<T> => {
  try {
    const raw = await readFile(path.resolve(filePath), 'utf8')
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

const buildPreviousStateMap = async (): Promise<Record<string, 'open' | 'in-progress' | 'resolved' | 'reopened'>> => {
  const previous = await parseJsonIfExists<ComplianceReport>('reports/compliance/local-delta.json', {
    reportType: 'local-delta',
    generatedAt: new Date(0).toISOString(),
    constitutionVersion: 'unknown',
    scope: { branch: 'unknown', commit: 'unknown' },
    assessments: [],
    findings: [],
  })

  return previous.findings.reduce<Record<string, 'open' | 'in-progress' | 'resolved' | 'reopened'>>(
    (acc, finding) => {
      acc[finding.findingId] = finding.state ?? 'open'
      return acc
    },
    {},
  )
}

const validateMode = process.argv.includes('--validate-only')

const validateExistingReports = async (): Promise<void> => {
  const reports = await Promise.all([
    parseJsonIfExists<ComplianceReport | null>('reports/compliance/master-baseline.json', null),
    parseJsonIfExists<ComplianceReport | null>('reports/compliance/local-delta.json', null),
  ])

  const errors: string[] = []
  for (const report of reports) {
    if (!report) {
      errors.push('Missing report artifact for validation mode.')
      continue
    }
    const reportErrors = validateReport(report)
    errors.push(...reportErrors.map((err) => `${report.reportType}: ${err}`))
  }

  if (errors.length > 0) {
    throw new Error(`Compliance validation failed:\n${errors.join('\n')}`)
  }
}

const run = async (): Promise<void> => {
  if (validateMode) {
    await validateExistingReports()
    console.log('Compliance reports validated successfully.')
    return
  }

  const generatedAt = new Date()
  const constitution = await loadConstitution()
  const scope = resolveScope()
  const reports = await buildDualReports({
    clauses: constitution.clauses,
    constitutionVersion: constitution.version,
    scope,
    generatedAt,
  })

  const allErrors: string[] = []
  const previousStates = await buildPreviousStateMap()
  let revalidationRecords: RevalidationRecord[] = []

  for (const report of reports) {
    const gateErrors = enforceFailGates(constitution.clauses, report.assessments, report.findings)
    allErrors.push(...gateErrors.map((e) => `${report.reportType}: ${e}`))

    if (report.reportType === 'local-delta') {
      const { findings, records } = revalidateFindings(report.findings, previousStates, generatedAt)
      report.findings = findings as ComplianceFinding[]
      revalidationRecords = records
    }

    const schemaErrors = validateReport(report)
    allErrors.push(...schemaErrors.map((e) => `${report.reportType}: ${e}`))
  }

  if (allErrors.length > 0) {
    throw new Error(`Compliance generation failed:\n${allErrors.join('\n')}`)
  }

  for (const report of reports) {
    await writeReport(report)
  }

  if (revalidationRecords.length > 0) {
    await writeRevalidationRecord(revalidationRecords)
  }

  console.log('Compliance reports generated successfully.')
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exit(1)
})
