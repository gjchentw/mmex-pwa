import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { ConstitutionClause } from './types.ts'

const constitutionPath = path.resolve('.specify/memory/constitution.md')

const toClauseId = (title: string): string => {
  const m = title.match(/^([IVXLC]+)\.\s*(.+)$/)
  if (!m) {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  }
  const roman = m[1]
  const slug = m[2].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  return `${roman}.${slug}`
}

export interface ConstitutionData {
  version: string
  clauses: ConstitutionClause[]
}

export const loadConstitution = async (): Promise<ConstitutionData> => {
  const raw = await readFile(constitutionPath, 'utf8')
  const versionMatch = raw.match(/\*\*Version\*\*:\s*([^|\n]+)/)
  const version = versionMatch ? versionMatch[1].trim() : 'unknown'

  const clauses: ConstitutionClause[] = raw
    .split('\n')
    .filter((line) => line.startsWith('### '))
    .map((line) => line.replace(/^###\s+/, '').trim())
    .filter((title) => /^[IVXLC]+\./.test(title))
    .map((title) => ({ clauseId: toClauseId(title), clauseTitle: title }))

  return { version, clauses }
}
