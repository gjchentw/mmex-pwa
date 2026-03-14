import type { ComplianceFinding, RevalidationRecord } from './types.ts'
import { setFindingState } from './manage-finding-state.ts'

interface PreviousStateMap {
  [findingId: string]: 'resolved' | 'reopened' | 'open' | 'in-progress'
}

export const revalidateFindings = (
  current: ComplianceFinding[],
  previousStates: PreviousStateMap,
  checkedAt: Date,
): { findings: ComplianceFinding[]; records: RevalidationRecord[] } => {
  const records: RevalidationRecord[] = []

  const findings = current.map((finding) => {
    const previous = previousStates[finding.findingId]
    if (previous === 'resolved') {
      const reopened = setFindingState(finding, 'reopened')
      records.push({
        findingId: finding.findingId,
        previousState: 'resolved',
        currentState: 'reopened',
        checkedAt: checkedAt.toISOString(),
        evidenceDelta: 'Finding reappeared in current assessment output.',
        decision: 'reopen',
      })
      return reopened
    }

    return setFindingState(finding, finding.state ?? 'open')
  })

  return { findings, records }
}
