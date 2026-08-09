import { NONE_ID, namesEqual, type RefType } from '../conventions'
import type { CategoryRecord, PayeeRecord, TagLinkRecord, TagRecord } from '../records'

/**
 * Pure taxonomy rules (openspec: transaction-taxonomy). Categories form a
 * self-referencing tree whose roots carry the -1 sentinel as PARENTID.
 */

export const CATEGORY_ROOT_ID = NONE_ID

/** Separator used when rendering a category's path, matching upstream. */
export const CATEGORY_PATH_DELIMITER = ':'

type CategoryLike = Pick<CategoryRecord, 'CATEGID' | 'CATEGNAME' | 'PARENTID'>

/** ACTIVE = 0 hides an entity; it stays a valid reference on existing records. */
export const isHidden = (record: { ACTIVE?: number | null }): boolean => record.ACTIVE === 0

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
 * import-time matching belongs to a future capability.
 */
export const parsePayeePatterns = (payee: Pick<PayeeRecord, 'PATTERN'>): string[] => {
  const raw = payee.PATTERN
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : []
  } catch {
    return []
  }
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
  return tags.filter((tag) => tagIds.has(tag.TAGID))
}
