import { readFile } from 'node:fs/promises'
import path from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import type { ComplianceReport } from './types.ts'

const schemaPath = path.resolve('specs/001-review-constitution-compliance/contracts/compliance-report.schema.json')

export const validateReport = async (report: ComplianceReport): Promise<string[]> => {
  const raw = await readFile(schemaPath, 'utf8')
  const schema = JSON.parse(raw) as object

  const ajv = new Ajv2020({ allErrors: true })
  addFormats(ajv)
  const validate = ajv.compile(schema)
  const valid = validate(report)

  if (valid) {
    return []
  }

  return (validate.errors ?? []).map((err) => `${err.instancePath || '/'} ${err.message}`)
}
