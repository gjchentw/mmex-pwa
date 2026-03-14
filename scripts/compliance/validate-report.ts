import { readFileSync } from 'node:fs'
import path from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import type { ComplianceReport } from './types.ts'

const schemaPath = path.resolve('specs/001-review-constitution-compliance/contracts/compliance-report.schema.json')
const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as object
const ajv = new Ajv2020({ allErrors: true })
addFormats(ajv)
const compiledValidator = ajv.compile(schema)

export const validateReport = (report: ComplianceReport): string[] => {
  const valid = compiledValidator(report)

  if (valid) {
    return []
  }

  return (compiledValidator.errors ?? []).map((err) => `${err.instancePath || '/'} ${err.message}`)
}
