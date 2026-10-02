import { describe, it, expect } from 'vitest'
import { REFTYPE } from '../../domain/conventions'
import {
  DEFAULT_CATEGORY_MODE,
  encodeDefaultCategoryMode,
  isValidWebsite,
  parseDefaultCategoryMode,
  parsePayeePatterns,
  serializePayeePatterns,
  tagsFor,
  validateCategoryName,
  validatePayee,
  validatePayeePatterns,
  validateTagName,
} from '../../domain/rules/taxonomy'

/**
 * Spec: transaction-taxonomy (delta: desktop fidelity). Every rule here is a
 * pure function; the repository tests cover how the statements use them.
 */

// Requirement "Category Tree Structure", scenario "Colon in a name is refused".
describe('category names', () => {
  it('refuses an empty or blank name', () => {
    expect(validateCategoryName('')).toBe('empty')
    expect(validateCategoryName('   ')).toBe('empty')
  })

  // categdialog.cpp 347: the colon separates categories from subcategories.
  it('refuses a colon anywhere in the name', () => {
    expect(validateCategoryName('Food:Snacks')).toBe('colon')
    expect(validateCategoryName(':')).toBe('colon')
  })

  it('accepts an ordinary name, spaces included', () => {
    expect(validateCategoryName('Eating out')).toBeNull()
  })
})

// Requirement "Tags and Polymorphic Tag Links", scenario "Reserved tag name is refused".
describe('tag names', () => {
  it('refuses an empty or blank name', () => {
    expect(validateTagName('')).toBe('empty')
    expect(validateTagName(' ')).toBe('empty')
  })

  // tagdialog.cpp 181-191: the space is the tag delimiter, & and | the filter operators.
  it('refuses a space and the two reserved names', () => {
    expect(validateTagName('summer trip')).toBe('space')
    expect(validateTagName('&')).toBe('reserved')
    expect(validateTagName('|')).toBe('reserved')
  })

  it('accepts a name that merely contains an operator character', () => {
    expect(validateTagName('a&b')).toBeNull()
    expect(validateTagName('travel')).toBeNull()
  })
})

// Requirement "Payee Records", scenario "Invalid website is refused".
describe('payee validation', () => {
  // primitive.cpp 83-88, isValidURI: optional scheme, two or more host labels,
  // then at least one more character.
  it('accepts the shapes desktop accepts', () => {
    expect(isValidWebsite('')).toBe(true)
    expect(isValidWebsite(null)).toBe(true)
    expect(isValidWebsite('example.com/x')).toBe(true)
    expect(isValidWebsite('https://shop.example.com/?a=1')).toBe(true)
    expect(isValidWebsite('  HTTP://Example.COM/path  ')).toBe(true)
  })

  it('refuses the shapes desktop refuses', () => {
    expect(isValidWebsite('not a url')).toBe(false)
    expect(isValidWebsite('example')).toBe(false)
    expect(isValidWebsite('http://')).toBe(false)
  })

  // Design R2: JavaScript's \w is ASCII-only, so an internationalized host that
  // desktop's wxRegEx may accept is refused here. Recorded, not hidden.
  it('refuses a non-ASCII host label (design R2, recorded difference)', () => {
    expect(isValidWebsite('münchen.example/x')).toBe(false)
  })

  it('names the field that fails', () => {
    expect(validatePayee({ PAYEENAME: '', WEBSITE: null })).toEqual({ field: 'name' })
    expect(validatePayee({ PAYEENAME: '  ', WEBSITE: null })).toEqual({ field: 'name' })
    expect(validatePayee({ PAYEENAME: 'Shop', WEBSITE: 'not a url' })).toEqual({
      field: 'website',
    })
    expect(validatePayee({ PAYEENAME: 'Shop', WEBSITE: 'shop.example.com/' })).toBeNull()
  })
})

// Requirement "Payee Pattern Custody".
describe('payee patterns', () => {
  // payeedialog.cpp 224-240 writes a rapidjson PrettyWriter object: four-space
  // indent, one key per line, keys counted from "0".
  const desktopForm = '{\n    "0": "AMAZON*",\n    "1": "regex:^AMZN"\n}'

  // Scenario "A desktop pattern set round-trips".
  it('reads the object form in key order and writes it back byte for byte', () => {
    const patterns = parsePayeePatterns({ PATTERN: desktopForm })
    expect(patterns).toEqual(['AMAZON*', 'regex:^AMZN'])
    expect(serializePayeePatterns(patterns)).toBe(desktopForm)
  })

  it('reads a compact object and orders by numeric key, not by text', () => {
    expect(
      parsePayeePatterns({ PATTERN: '{"10": "ten", "2": "two", "0": "zero", "1": "one"}' }),
    ).toEqual(['zero', 'one', 'two', 'ten'])
  })

  it('still reads the legacy array form and treats anything else as no patterns', () => {
    expect(parsePayeePatterns({ PATTERN: '["^AMZN.*","WHOLEFOODS"]' })).toEqual([
      '^AMZN.*',
      'WHOLEFOODS',
    ])
    expect(parsePayeePatterns({ PATTERN: '{"0": 5}' })).toEqual([])
    expect(parsePayeePatterns({ PATTERN: 'not json' })).toEqual([])
    expect(parsePayeePatterns({ PATTERN: null })).toEqual([])
  })

  it('drops blank entries and renumbers from zero when writing', () => {
    expect(serializePayeePatterns(['  ', 'A', '', 'B'])).toBe('{\n    "0": "A",\n    "1": "B"\n}')
    expect(serializePayeePatterns([])).toBe('{}')
  })

  // Scenario "Invalid regular expression is refused". Design R1: JavaScript
  // syntax, case-insensitive, as desktop compiles with wxRE_ICASE | wxRE_EXTENDED.
  it('refuses a regex: pattern that does not compile, naming its index', () => {
    expect(validatePayeePatterns(['AMAZON*', 'regex:(unclosed'])).toEqual({
      field: 'pattern',
      index: 1,
    })
    expect(validatePayeePatterns(['regex:^AMZN', 'regex:a{2,}'])).toBeNull()
    // Accepted by both engines.
    expect(validatePayeePatterns(['regex:(?:amzn|amazon) +mktp'])).toBeNull()
    // Accepted by JavaScript, refused by POSIX extended syntax (design R1): a
    // lookbehind and a Perl-style class. Desktop would reject these on save; this
    // application stores them and never executes them.
    expect(validatePayeePatterns(['regex:(?<=x)y'])).toBeNull()
    expect(validatePayeePatterns(['regex:\\d+'])).toBeNull()
  })
})

// Requirement "Payee Records", scenario "Mode is read with desktop's default".
describe('default-category mode', () => {
  // option.h 34: enum USAGE_TYPE { NONE = 0, LASTUSED, UNUSED, DEFAULT };
  // option.cpp 511: getInt("TRANSACTION_CATEGORY_NONE", Option::LASTUSED).
  it('maps desktop integers and falls back to Last used', () => {
    expect(DEFAULT_CATEGORY_MODE).toEqual({ none: 0, lastUsed: 1, unused: 2, default: 3 })
    expect(parseDefaultCategoryMode('0')).toBe('none')
    expect(parseDefaultCategoryMode('2')).toBe('unused')
    expect(parseDefaultCategoryMode('3')).toBe('default')
    expect(parseDefaultCategoryMode(null)).toBe('lastUsed')
    expect(parseDefaultCategoryMode('')).toBe('lastUsed')
    expect(parseDefaultCategoryMode('7')).toBe('lastUsed')
    expect(parseDefaultCategoryMode('abc')).toBe('lastUsed')
  })

  it('encodes as the integer string desktop reads', () => {
    expect(encodeDefaultCategoryMode('unused')).toBe('2')
  })
})

// Requirement "Tags and Polymorphic Tag Links", scenario "Tags are listed by name".
describe('tag ordering', () => {
  it('orders a record tags by name regardless of link order', () => {
    const links = [
      { TAGLINKID: 1, REFTYPE: REFTYPE.transaction, REFID: 10, TAGID: 100 },
      { TAGLINKID: 2, REFTYPE: REFTYPE.transaction, REFID: 10, TAGID: 200 },
    ]
    const tags = [
      { TAGID: 100, TAGNAME: 'travel', ACTIVE: 1 },
      { TAGID: 200, TAGNAME: 'business', ACTIVE: 1 },
    ]
    expect(tagsFor(links, tags, REFTYPE.transaction, 10).map((t) => t.TAGNAME)).toEqual([
      'business',
      'travel',
    ])
  })
})
