import { addBusinessDays, getSeverityBusinessDays } from './severity-policy.ts'
import type { ComplianceFinding } from './types.ts'

const formatDate = (date: Date): string => date.toISOString().slice(0, 10)

export const assignDueDates = (findings: ComplianceFinding[], generatedAt: Date): ComplianceFinding[] =>
  findings.map((finding) => {
    const days = getSeverityBusinessDays(finding.severity)
    const due = addBusinessDays(generatedAt, days)
    return { ...finding, dueDate: formatDate(due) }
  })
