import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { RevalidationRecord } from './types.ts'

export const writeRevalidationRecord = async (records: RevalidationRecord[]): Promise<string> => {
  const filePath = path.resolve('reports/compliance/revalidation-records.json')
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(records, null, 2)}\n`, 'utf8')
  return filePath
}
