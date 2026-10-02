import { NONE_ID, namesEqual, type RefType } from '../conventions'
import type { CategoryRecord, PayeeRecord, TagLinkRecord, TagRecord } from '../records'
import { DEFAULTS } from './metadata'

/**
 * Pure taxonomy rules (openspec: transaction-taxonomy). Categories form a
 * self-referencing tree whose roots carry the -1 sentinel as PARENTID.
 */

export const CATEGORY_ROOT_ID = NONE_ID

/** Separator used when rendering a category's path, matching upstream. */
export const CATEGORY_PATH_DELIMITER = ':'

type CategoryLike = Pick<CategoryRecord, 'CATEGID' | 'CATEGNAME' | 'PARENTID'>

/**
 * ACTIVE = 0 hides a category or payee; it stays a valid reference on existing
 * records. Tags have no hidden state in desktop (openspec: Visibility via
 * Active Flags), so no tag path consults this and a stored 0 reads as visible.
 */
export const isHidden = (record: Pick<CategoryRecord | PayeeRecord, 'ACTIVE'>): boolean =>
  record.ACTIVE === 0

export const isRoot = (category: Pick<CategoryRecord, 'PARENTID'>): boolean =>
  category.PARENTID === CATEGORY_ROOT_ID

export const childrenOf = <T extends Pick<CategoryRecord, 'PARENTID'>>(
  categories: readonly T[],
  parentId: number,
): T[] => categories.filter((category) => category.PARENTID === parentId)

/** The colon-joined path from the root down to this category. */
export const categoryFullName = (
  categoryId: number,
  categories: readonly CategoryLike[],
  delimiter: string = CATEGORY_PATH_DELIMITER,
): string => {
  const byId = new Map(categories.map((category) => [category.CATEGID, category]))
  const parts: string[] = []
  let current = byId.get(categoryId)
  const guard = new Set<number>()
  while (current && !guard.has(current.CATEGID)) {
    guard.add(current.CATEGID)
    parts.unshift(current.CATEGNAME)
    if (current.PARENTID === CATEGORY_ROOT_ID) break
    current = byId.get(current.PARENTID)
  }
  return parts.join(delimiter)
}

/** Every descendant of a category, excluding the category itself. */
export const categorySubtree = <T extends Pick<CategoryRecord, 'CATEGID' | 'PARENTID'>>(
  categories: readonly T[],
  rootId: number,
): T[] => {
  const collected: T[] = []
  const queue = [rootId]
  const seen = new Set<number>([rootId])
  while (queue.length > 0) {
    const parentId = queue.shift()!
    for (const child of childrenOf(categories, parentId)) {
      if (seen.has(child.CATEGID)) continue
      seen.add(child.CATEGID)
      collected.push(child)
      queue.push(child.CATEGID)
    }
  }
  return collected
}

/**
 * Reparenting must not make a category its own ancestor. Moving a category
 * under itself or under one of its descendants is rejected.
 */
export const wouldCreateCycle = (
  categories: readonly Pick<CategoryRecord, 'CATEGID' | 'PARENTID'>[],
  categoryId: number,
  newParentId: number,
): boolean => {
  if (newParentId === CATEGORY_ROOT_ID) return false
  if (categoryId === newParentId) return true
  return categorySubtree(categories, categoryId).some(
    (descendant) => descendant.CATEGID === newParentId,
  )
}

/** Sibling names are unique case-insensitively; the same name may exist elsewhere. */
export const hasSiblingNameConflict = (
  categories: readonly CategoryLike[],
  name: string,
  parentId: number,
  excludeCategoryId?: number,
): boolean =>
  categories.some(
    (category) =>
      category.PARENTID === parentId &&
      category.CATEGID !== excludeCategoryId &&
      namesEqual(category.CATEGNAME, name),
  )

/** Case-insensitive duplicate check for a flat name list (payees, tags). */
export const hasNameConflict = <T>(
  records: readonly T[],
  name: string,
  nameOf: (record: T) => string,
  idOf: (record: T) => number,
  excludeId?: number,
): boolean =>
  records.some((record) => idOf(record) !== excludeId && namesEqual(nameOf(record), name))

/** A payee's default category, or null when the sentinel says there is none. */
export const payeeDefaultCategory = (payee: Pick<PayeeRecord, 'CATEGID'>): number | null =>
  payee.CATEGID === null || payee.CATEGID === undefined || payee.CATEGID === NONE_ID
    ? null
    : payee.CATEGID

/**
 * Payee match patterns are preserved and editable but never executed here;
 * import-time matching belongs to a future capability. Desktop stores them as
 * a JSON object keyed "0", "1", ... (payeedialog.cpp); the legacy array form is
 * still read. Anything else reads as no patterns and is left untouched.
 */
export const parsePayeePatterns = (payee: Pick<PayeeRecord, 'PATTERN'>): string[] => {
  const raw = payee.PATTERN
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (Array.isArray(parsed)) {
    return parsed.filter((item): item is string => typeof item === 'string')
  }
  if (parsed === null || typeof parsed !== 'object') return []
  const entries = Object.entries(parsed as Record<string, unknown>)
  if (!entries.every(([key, value]) => /^\d+$/.test(key) && typeof value === 'string')) return []
  return entries.sort(([a], [b]) => Number(a) - Number(b)).map(([, value]) => value as string)
}

/**
 * Desktop's writer: blank rows dropped, keys renumbered from "0", pretty-printed
 * with a four-space indent (rapidjson PrettyWriter), which JSON.stringify
 * reproduces byte for byte for a flat object of strings.
 */
export const serializePayeePatterns = (patterns: readonly string[]): string => {
  const kept = patterns.filter((pattern) => pattern.trim() !== '')
  return JSON.stringify(
    Object.fromEntries(kept.map((pattern, index) => [String(index), pattern])),
    null,
    4,
  )
}

export const PAYEE_PATTERN_REGEX_PREFIX = 'regex:'

export type PayeeRefusal = { field: 'name' | 'website' | 'pattern'; index?: number }

/**
 * A `regex:` pattern must compile before it is stored; desktop compiles with
 * wxRE_ICASE | wxRE_EXTENDED, this build with JavaScript's engine, case-insensitive
 * (design R1 records the dialect difference). Patterns are never executed here.
 */
export const validatePayeePatterns = (patterns: readonly string[]): PayeeRefusal | null => {
  for (const [index, pattern] of patterns.entries()) {
    if (!pattern.startsWith(PAYEE_PATTERN_REGEX_PREFIX)) continue
    try {
      RegExp(pattern.slice(PAYEE_PATTERN_REGEX_PREFIX.length), 'i')
    } catch {
      return { field: 'pattern', index }
    }
  }
  return null
}

/** Identity of a tag link, used to keep (REFTYPE, REFID, TAGID) unique. */
export const tagLinkKey = (link: Pick<TagLinkRecord, 'REFTYPE' | 'REFID' | 'TAGID'>): string =>
  `${link.REFTYPE}:${link.REFID}:${link.TAGID}`

/** Drops duplicates so attaching the same tag twice never inserts a second row. */
export const dedupeTagLinks = <T extends Pick<TagLinkRecord, 'REFTYPE' | 'REFID' | 'TAGID'>>(
  links: readonly T[],
): T[] => {
  const seen = new Set<string>()
  return links.filter((link) => {
    const key = tagLinkKey(link)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export type NameRefusal = 'empty' | 'colon' | 'space' | 'reserved'

/** categdialog.cpp: the colon separates categories from subcategories, so a name never holds one. */
export const validateCategoryName = (name: string): NameRefusal | null => {
  if (name.trim() === '') return 'empty'
  if (name.includes(':')) return 'colon'
  return null
}

/** tagdialog.cpp: `&` and `|` are the filter operators, the space the tag delimiter. */
export const TAG_RESERVED_NAMES: readonly string[] = ['&', '|']

export const validateTagName = (name: string): NameRefusal | null => {
  const trimmed = name.trim()
  if (trimmed === '') return 'empty'
  if (TAG_RESERVED_NAMES.includes(trimmed)) return 'reserved'
  if (/\s/.test(trimmed)) return 'space'
  return null
}

/**
 * Desktop's isValidURI (primitive.cpp): an optional http(s) scheme, a host of
 * two or more dot-separated labels, then at least one further character, matched
 * after trimming and lowercasing. `\w` is ASCII-only here (design R2).
 */
const WEBSITE_PATTERN = /^(?:https?:\/\/)?[\w.-]+(?:\.[\w.-]+)+[\w._~:/?#[\]@!$&'()*+,;=-]+$/

export const isValidWebsite = (value: string | null | undefined): boolean => {
  const website = (value ?? '').trim().toLowerCase()
  return website === '' || WEBSITE_PATTERN.test(website)
}

/** payeedialog.cpp refuses an empty name and an invalid website before saving. */
export const validatePayee = (
  payee: Pick<PayeeRecord, 'PAYEENAME'> & Partial<Pick<PayeeRecord, 'WEBSITE'>>,
): PayeeRefusal | null => {
  if (payee.PAYEENAME.trim() === '') return { field: 'name' }
  if (!isValidWebsite(payee.WEBSITE)) return { field: 'website' }
  return null
}

/** option.h USAGE_TYPE { NONE = 0, LASTUSED, UNUSED, DEFAULT }, stored in TRANSACTION_CATEGORY_NONE. */
export const DEFAULT_CATEGORY_MODE = { none: 0, lastUsed: 1, unused: 2, default: 3 } as const

export type DefaultCategoryMode = keyof typeof DEFAULT_CATEGORY_MODE

const DEFAULT_CATEGORY_MODES = Object.keys(DEFAULT_CATEGORY_MODE) as DefaultCategoryMode[]

/** Model_Setting::getInt: a numeric string is the value, anything else the default (Last used). */
export const parseDefaultCategoryMode = (
  stored: string | null | undefined,
): DefaultCategoryMode => {
  if (stored === null || stored === undefined || !/^\d+$/.test(stored.trim())) {
    return DEFAULTS.defaultCategoryMode
  }
  const value = Number(stored)
  return (
    DEFAULT_CATEGORY_MODES.find((mode) => DEFAULT_CATEGORY_MODE[mode] === value) ??
    DEFAULTS.defaultCategoryMode
  )
}

export const encodeDefaultCategoryMode = (mode: DefaultCategoryMode): string =>
  String(DEFAULT_CATEGORY_MODE[mode])

export const tagsFor = (
  links: readonly TagLinkRecord[],
  tags: readonly TagRecord[],
  refType: RefType,
  refId: number,
): TagRecord[] => {
  const tagIds = new Set(
    links
      .filter((link) => link.REFTYPE === refType && link.REFID === refId)
      .map((link) => link.TAGID),
  )
  // A record's tags are presented by name (openspec: Tags and Polymorphic Tag Links).
  return tags
    .filter((tag) => tagIds.has(tag.TAGID))
    .sort((a, b) => a.TAGNAME.localeCompare(b.TAGNAME))
}
