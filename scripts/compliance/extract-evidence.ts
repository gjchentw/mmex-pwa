import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { EvidenceItem } from './types.ts'

const findLine = (text: string, needle: string): number => {
  const lines = text.split('\n')
  const index = lines.findIndex((line) => line.includes(needle))
  return index >= 0 ? index + 1 : 1
}

export const buildEvidenceFromNeedle = async (
  clauseId: string,
  filePath: string,
  needle: string,
  observation: string,
  impact: string,
): Promise<EvidenceItem> => {
  const absolute = path.resolve(filePath)
  const content = await readFile(absolute, 'utf8')
  return {
    filePath,
    line: findLine(content, needle),
    clauseId,
    observation,
    impact,
  }
}
