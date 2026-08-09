import { enumCodec } from '../conventions'
import type { CustomFieldRecord } from '../records'

/**
 * Pure rules for the polymorphic decoration tables (openspec: record-extensions).
 * Attachment binaries are permanently out of scope: the application handles
 * metadata rows only.
 */

export const CUSTOM_FIELD_TYPES = [
  'String',
  'Integer',
  'Decimal',
  'Boolean',
  'Date',
  'Time',
  'SingleChoice',
  'MultiChoice',
] as const
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number]
export const customFieldTypeCodec = enumCodec(CUSTOM_FIELD_TYPES, 'String')

/** Register-column slots a field may claim. Custody only -- never rendered as columns. */
export const UDFC_SLOTS = ['UDFC01', 'UDFC02', 'UDFC03', 'UDFC04', 'UDFC05'] as const
export type UdfcSlot = (typeof UDFC_SLOTS)[number]

export interface CustomFieldProperties {
  Tooltip?: string
  Regex?: string
  Autocomplete?: boolean
  Default?: string
  Choice?: string[]
  DigitScale?: number
  UDFC?: string
  [key: string]: unknown
}

/** Parses the PROPERTIES blob, tolerating absent or malformed content. */
export const parseFieldProperties = (
  field: Pick<CustomFieldRecord, 'PROPERTIES'>,
): CustomFieldProperties => {
  if (!field.PROPERTIES) return {}
  try {
    const parsed: unknown = JSON.parse(field.PROPERTIES)
    return parsed && typeof parsed === 'object' ? (parsed as CustomFieldProperties) : {}
  } catch {
    return {}
  }
}

/**
 * Serializes properties back, preserving every key this build does not
 * understand so a desktop-authored definition survives an edit here.
 */
export const serializeFieldProperties = (
  original: Pick<CustomFieldRecord, 'PROPERTIES'>,
  changes: CustomFieldProperties,
): string => JSON.stringify({ ...parseFieldProperties(original), ...changes })

export const fieldChoices = (field: Pick<CustomFieldRecord, 'PROPERTIES'>): string[] => {
  const choices = parseFieldProperties(field).Choice
  return Array.isArray(choices) ? choices.filter((c): c is string => typeof c === 'string') : []
}

export const fieldSlot = (field: Pick<CustomFieldRecord, 'PROPERTIES'>): string | null =>
  parseFieldProperties(field).UDFC ?? null

export interface ValidationResult {
  valid: boolean
  reason?: string
}

/**
 * Validates a value against its definition: the declared type, an optional
 * regular expression, and choice membership for the two choice types.
 */
export const validateFieldValue = (
  field: Pick<CustomFieldRecord, 'TYPE' | 'PROPERTIES'>,
  content: string,
): ValidationResult => {
  const type = customFieldTypeCodec.decode(field.TYPE)
  const properties = parseFieldProperties(field)

  if (content === '') return { valid: true }

  switch (type) {
    case 'Integer':
      if (!/^[+-]?\d+$/.test(content)) return { valid: false, reason: 'not an integer' }
      break
    case 'Decimal':
      if (!/^[+-]?\d*\.?\d+$/.test(content)) return { valid: false, reason: 'not a decimal' }
      break
    case 'Boolean':
      if (!['0', '1', 'true', 'false'].includes(content.toLocaleLowerCase()))
        return { valid: false, reason: 'not a boolean' }
      break
    case 'Date':
      if (!/^\d{4}-\d{2}-\d{2}/.test(content)) return { valid: false, reason: 'not an ISO date' }
      break
    case 'Time':
      if (!/^\d{2}:\d{2}(:\d{2})?$/.test(content)) return { valid: false, reason: 'not a time' }
      break
    case 'SingleChoice': {
      if (!fieldChoices(field).includes(content))
        return { valid: false, reason: 'not a defined choice' }
      break
    }
    case 'MultiChoice': {
      const allowed = fieldChoices(field)
      const selected = content
        .split(';')
        .map((part) => part.trim())
        .filter(Boolean)
      if (selected.some((choice) => !allowed.includes(choice)))
        return { valid: false, reason: 'not a defined choice' }
      break
    }
    default:
      break
  }

  if (properties.Regex) {
    try {
      if (!new RegExp(properties.Regex).test(content))
        return { valid: false, reason: 'fails the field pattern' }
    } catch {
      // An unparseable pattern authored elsewhere must not block editing.
    }
  }

  return { valid: true }
}
