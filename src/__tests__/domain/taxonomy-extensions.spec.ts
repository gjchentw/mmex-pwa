import { describe, it, expect } from 'vitest'
import { REFTYPE } from '../../domain/conventions'
import type { CategoryRecord, CustomFieldRecord } from '../../domain/records'
import {
  CATEGORY_ROOT_ID,
  categoryFullName,
  categorySubtree,
  dedupeTagLinks,
  hasSiblingNameConflict,
  isHidden,
  parsePayeePatterns,
  payeeDefaultCategory,
  tagsFor,
  wouldCreateCycle,
} from '../../domain/rules/taxonomy'
import {
  fieldChoices,
  parseFieldProperties,
  serializeFieldProperties,
  validateFieldValue,
} from '../../domain/rules/extensions'

const category = (id: number, name: string, parentId = CATEGORY_ROOT_ID): CategoryRecord => ({
  CATEGID: id,
  CATEGNAME: name,
  ACTIVE: 1,
  PARENTID: parentId,
})

const tree = [
  category(1, 'Bills'),
  category(2, 'Telephone', 1),
  category(3, 'Mobile', 2),
  category(4, 'Food'),
]

// Spec: transaction-taxonomy.
describe('taxonomy rules', () => {
  // Requirement "Category Tree Structure".
  describe('category tree', () => {
    it('renders the colon-joined path from the root', () => {
      expect(categoryFullName(3, tree)).toBe('Bills:Telephone:Mobile')
      expect(categoryFullName(1, tree)).toBe('Bills')
    })

    it('collects every descendant', () => {
      expect(categorySubtree(tree, 1).map((c) => c.CATEGID)).toEqual([2, 3])
      expect(categorySubtree(tree, 4)).toEqual([])
    })

    // Scenario "Sibling duplicate is rejected".
    it('rejects a duplicate sibling name case-insensitively', () => {
      expect(hasSiblingNameConflict(tree, 'FOOD', CATEGORY_ROOT_ID)).toBe(true)
      expect(hasSiblingNameConflict(tree, 'Food', 1)).toBe(false)
      expect(hasSiblingNameConflict(tree, 'Food', CATEGORY_ROOT_ID, 4)).toBe(false)
    })

    // Scenario "Cycle is rejected".
    it('rejects a move that would make a category its own ancestor', () => {
      expect(wouldCreateCycle(tree, 1, 3)).toBe(true)
      expect(wouldCreateCycle(tree, 1, 1)).toBe(true)
      expect(wouldCreateCycle(tree, 1, 4)).toBe(false)
      expect(wouldCreateCycle(tree, 3, CATEGORY_ROOT_ID)).toBe(false)
    })
  })

  // Requirement "Visibility via Active Flags", scenario "Hiding does not orphan
  // references".
  it('treats ACTIVE = 0 as hidden rather than deleted', () => {
    expect(isHidden({ ACTIVE: 0 })).toBe(true)
    expect(isHidden({ ACTIVE: 1 })).toBe(false)
    expect(isHidden({ ACTIVE: null })).toBe(false)
  })

  // Requirement "Payee Records" and "Payee Pattern Custody".
  describe('payees', () => {
    it('reads the default category, treating the sentinel as none', () => {
      expect(payeeDefaultCategory({ CATEGID: 7 })).toBe(7)
      expect(payeeDefaultCategory({ CATEGID: -1 })).toBeNull()
      expect(payeeDefaultCategory({ CATEGID: null })).toBeNull()
    })

    it('parses match patterns without executing them', () => {
      expect(parsePayeePatterns({ PATTERN: '["^AMZN.*","WHOLEFOODS"]' })).toEqual([
        '^AMZN.*',
        'WHOLEFOODS',
      ])
      expect(parsePayeePatterns({ PATTERN: null })).toEqual([])
      expect(parsePayeePatterns({ PATTERN: 'not json' })).toEqual([])
    })
  })

  // Requirement "Tags and Polymorphic Tag Links", scenario "Split lines are
  // independently taggable".
  describe('tag links', () => {
    const links = [
      { TAGLINKID: 1, REFTYPE: REFTYPE.transaction, REFID: 10, TAGID: 100 },
      { TAGLINKID: 2, REFTYPE: REFTYPE.transactionSplit, REFID: 55, TAGID: 200 },
    ]
    const tags = [
      { TAGID: 100, TAGNAME: 'Travel', ACTIVE: 1 },
      { TAGID: 200, TAGNAME: 'Reimbursable', ACTIVE: 1 },
    ]

    it('resolves tags per reference type and id', () => {
      expect(tagsFor(links, tags, REFTYPE.transaction, 10).map((t) => t.TAGNAME)).toEqual([
        'Travel',
      ])
      expect(tagsFor(links, tags, REFTYPE.transactionSplit, 55).map((t) => t.TAGNAME)).toEqual([
        'Reimbursable',
      ])
      expect(tagsFor(links, tags, REFTYPE.transaction, 55)).toEqual([])
    })

    it('never yields a duplicate link for the same tag on the same record', () => {
      const deduped = dedupeTagLinks([
        { REFTYPE: REFTYPE.transaction, REFID: 10, TAGID: 100 },
        { REFTYPE: REFTYPE.transaction, REFID: 10, TAGID: 100 },
        { REFTYPE: REFTYPE.transaction, REFID: 10, TAGID: 101 },
      ])
      expect(deduped).toHaveLength(2)
    })
  })
})

// Spec: record-extensions.
describe('custom field rules', () => {
  const field = (overrides: Partial<CustomFieldRecord> = {}): CustomFieldRecord => ({
    FIELDID: 1,
    REFTYPE: REFTYPE.transaction,
    DESCRIPTION: 'Project',
    TYPE: 'String',
    PROPERTIES: null,
    ...overrides,
  })

  // Requirement "Custom Field Definitions", scenario "Definition properties
  // round-trip".
  it('preserves properties this build does not understand', () => {
    const original = field({ PROPERTIES: '{"Regex":"^A","Choice":["a","b"],"Unknown":42}' })
    expect(parseFieldProperties(original).Unknown).toBe(42)
    const updated = JSON.parse(serializeFieldProperties(original, { Tooltip: 'hint' }))
    expect(updated.Unknown).toBe(42)
    expect(updated.Regex).toBe('^A')
    expect(updated.Choice).toEqual(['a', 'b'])
    expect(updated.Tooltip).toBe('hint')
  })

  it('reads the choice list', () => {
    expect(fieldChoices(field({ PROPERTIES: '{"Choice":["x","y"]}' }))).toEqual(['x', 'y'])
    expect(fieldChoices(field())).toEqual([])
  })

  // Requirement "Custom Field Values", scenario "Choice value must be a defined
  // choice".
  describe('validation', () => {
    it('rejects a value outside the defined choices', () => {
      const choice = field({ TYPE: 'SingleChoice', PROPERTIES: '{"Choice":["red","blue"]}' })
      expect(validateFieldValue(choice, 'red').valid).toBe(true)
      expect(validateFieldValue(choice, 'green').valid).toBe(false)
    })

    it('checks every selection of a multi-choice value', () => {
      const multi = field({ TYPE: 'MultiChoice', PROPERTIES: '{"Choice":["red","blue"]}' })
      expect(validateFieldValue(multi, 'red;blue').valid).toBe(true)
      expect(validateFieldValue(multi, 'red;green').valid).toBe(false)
    })

    it('enforces the declared type', () => {
      expect(validateFieldValue(field({ TYPE: 'Integer' }), '42').valid).toBe(true)
      expect(validateFieldValue(field({ TYPE: 'Integer' }), '4.2').valid).toBe(false)
      expect(validateFieldValue(field({ TYPE: 'Decimal' }), '4.2').valid).toBe(true)
      expect(validateFieldValue(field({ TYPE: 'Date' }), '2026-08-09').valid).toBe(true)
      expect(validateFieldValue(field({ TYPE: 'Date' }), '09/08/2026').valid).toBe(false)
      expect(validateFieldValue(field({ TYPE: 'Time' }), '13:45').valid).toBe(true)
    })

    it('applies the field pattern when one is defined', () => {
      const patterned = field({ PROPERTIES: '{"Regex":"^INV-"}' })
      expect(validateFieldValue(patterned, 'INV-1').valid).toBe(true)
      expect(validateFieldValue(patterned, 'PO-1').valid).toBe(false)
    })

    it('accepts an empty value and tolerates an unparseable pattern', () => {
      expect(validateFieldValue(field({ TYPE: 'Integer' }), '').valid).toBe(true)
      expect(validateFieldValue(field({ PROPERTIES: '{"Regex":"([unclosed"}' }), 'x').valid).toBe(
        true,
      )
    })
  })
})
