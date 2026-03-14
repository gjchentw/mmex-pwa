import type { Severity } from './types.ts'

const policyDays: Record<Severity, number> = {
  Critical: 2,
  High: 5,
  Medium: 10,
  Low: 30,
}

export const getSeverityBusinessDays = (severity: Severity): number => policyDays[severity]

export const addBusinessDays = (baseDate: Date, days: number): Date => {
  const date = new Date(baseDate)
  let remaining = days
  while (remaining > 0) {
    date.setDate(date.getDate() + 1)
    const day = date.getDay()
    if (day !== 0 && day !== 6) {
      remaining -= 1
    }
  }
  return date
}
