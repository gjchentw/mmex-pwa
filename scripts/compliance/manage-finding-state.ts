import type { ComplianceFinding, FindingState } from './types.ts'

export const setFindingState = (finding: ComplianceFinding, state: FindingState): ComplianceFinding => ({
  ...finding,
  state,
})
