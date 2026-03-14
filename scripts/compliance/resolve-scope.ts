import { execSync } from 'node:child_process'
import type { ScopeResolution } from './types.ts'

const run = (cmd: string): string => execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()

const splitLines = (value: string): string[] =>
  value
    .split('\n')
    .map((v) => v.trim())
    .filter((v) => v.length > 0)

export const resolveScope = (): ScopeResolution => {
  const branch = run('git branch --show-current')
  const headCommit = run('git rev-parse HEAD')
  const masterCommit = run('git rev-parse master')

  const changedInBranch = splitLines(run('git diff --name-only master...HEAD'))
  const statusRaw = splitLines(run('git status --porcelain'))
  const changedInWorkspace = statusRaw.map((line) => line.slice(3)).filter((v) => v.length > 0)

  return {
    branch,
    headCommit,
    masterCommit,
    changedInBranch,
    changedInWorkspace,
  }
}
