import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { ComplianceReport, ReportType } from './types.ts'

const outputFileFor = (type: ReportType): string =>
  type === 'master-baseline'
    ? 'reports/compliance/master-baseline.json'
    : 'reports/compliance/local-delta.json'

export const writeReport = async (report: ComplianceReport): Promise<string> => {
  const filePath = path.resolve(outputFileFor(report.reportType))
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  return filePath
}
