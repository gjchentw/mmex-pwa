import { NONE_ID, REFTYPE, formatUtcTimestamp, type RefType } from '../conventions'
import { db, insertStatement, placeholders, updateStatement, type SqlStatement } from '../db'
import type { CategoryRecord, PayeeRecord, TagLinkRecord, TagRecord } from '../records'
import {
  CATEGORY_ROOT_ID,
  categorySubtree,
  childrenOf,
  hasNameConflict,
  hasSiblingNameConflict,
  isHidden,
  serializePayeePatterns,
  validateCategoryName,
  validatePayee,
  validatePayeePatterns,
  validateTagName,
  wouldCreateCycle,
  type NameRefusal,
  type PayeeRefusal,
} from '../rules/taxonomy'
import { extensionCleanupStatements } from './extensions'
import { ledgerRepo } from './ledger'

/**
 * Categories, payees and tags (openspec: transaction-taxonomy). Every refusal is
 * typed so a surface can translate it; every multi-row operation is one batch.
 */

export type TaxonomyKind = 'category' | 'payee' | 'tag'

export class TaxonomyNameError extends Error {
  constructor(
    readonly kind: TaxonomyKind,
    readonly reason: NameRefusal | 'duplicate',
  ) {
    super(`${kind} name refused: ${reason}`)
    this.name = 'TaxonomyNameError'
  }
}

export class TaxonomyInUseError extends Error {
  constructor(
    readonly kind: TaxonomyKind,
    readonly usage: TaxonomyUsage,
  ) {
    super(
      `${kind} is ${usage.state === 'onlyTrashed' ? 'referenced by trashed transactions' : 'in use'}`,
    )
    this.name = 'TaxonomyInUseError'
  }
}

export class TaxonomyMergeError extends Error {
  constructor(readonly reason: 'sameEntity' | 'hiddenTarget' | 'sourceHasChildren') {
    super(`merge refused: ${reason}`)
    this.name = 'TaxonomyMergeError'
  }
}

export class PayeeValidationError extends Error {
  readonly field: PayeeRefusal['field']
  readonly index: number | undefined
  constructor(refusal: PayeeRefusal) {
    super(`payee ${refusal.field} refused`)
    this.name = 'PayeeValidationError'
    this.field = refusal.field
    this.index = refusal.index
  }
}

/** Desktop's three answers from is_used: live use, only trashed references, none. */
export type UsageState = 'used' | 'onlyTrashed' | 'unused'

/**
 * What references an entity, per table, counting live transactions only
 * (DELETEDTIME empty) as desktop's is_used does. Budget rows and payee defaults
 * are reported for the merge screen but never make a category used.
 */
export interface TaxonomyUsage {
  transactions: number
  splits: number
  series: number
  seriesSplits: number
  budgetRows: number
  payeeDefaults: number
  descendantUsed: boolean
  trashedTransactionIds: number[]
  orphanLinks: number
  state: UsageState
}

export interface MergeResult {
  changed: number
  byTable: Partial<
    Record<
      'transactions' | 'splits' | 'series' | 'seriesSplits' | 'budgetRows' | 'payeeDefaults',
      number
    >
  >
}

export interface RemoveOptions {
  /** The surface has shown desktop's purge confirmation; trashed references may be hard-deleted. */
  purgeTrashed?: boolean
}

export interface RelocateOptions {
  deleteSource?: boolean
  now?: Date
}

export interface RemoveManyResult {
  removed: number[]
  refused: Array<{ id: number; usage: TaxonomyUsage }>
}

interface CountsRow {
  transactions?: number
  splits?: number
  series?: number
  seriesSplits?: number
  budgetRows?: number
  payeeDefaults?: number
  trashedLinks?: number
  links?: number
}

const LIVE = "COALESCE(DELETEDTIME, '') = ''"
const live = (alias: string): string => `COALESCE(${alias}DELETEDTIME, '') = ''`

const liveUse = (row: CountsRow): boolean =>
  (row.transactions ?? 0) + (row.splits ?? 0) + (row.series ?? 0) + (row.seriesSplits ?? 0) > 0

const buildUsage = (
  row: CountsRow,
  extras: Partial<Pick<TaxonomyUsage, 'descendantUsed' | 'trashedTransactionIds' | 'orphanLinks'>>,
): TaxonomyUsage => {
  const descendantUsed = extras.descendantUsed ?? false
  const trashedTransactionIds = extras.trashedTransactionIds ?? []
  const state: UsageState =
    liveUse(row) || descendantUsed
      ? 'used'
      : trashedTransactionIds.length > 0
        ? 'onlyTrashed'
        : 'unused'
  return {
    transactions: row.transactions ?? 0,
    splits: row.splits ?? 0,
    series: row.series ?? 0,
    seriesSplits: row.seriesSplits ?? 0,
    budgetRows: row.budgetRows ?? 0,
    payeeDefaults: row.payeeDefaults ?? 0,
    descendantUsed,
    trashedTransactionIds,
    orphanLinks: extras.orphanLinks ?? 0,
    state,
  }
}

const repeat = <T>(items: readonly T[], times: number): T[] =>
  Array.from({ length: times }, () => items).flat()

/** Live reference counts of a category or payee id list, one subquery per table. */
const referenceCounts = async (
  column: 'CATEGID' | 'PAYEEID',
  ids: readonly number[],
): Promise<CountsRow> => {
  const list = placeholders(ids.length)
  const columns = [
    `(SELECT COUNT(*) FROM CHECKINGACCOUNT_V1 WHERE ${column} IN (${list}) AND ${LIVE}) AS transactions`,
    `(SELECT COUNT(*) FROM BILLSDEPOSITS_V1 WHERE ${column} IN (${list})) AS series`,
  ]
  if (column === 'CATEGID') {
    columns.push(
      `(SELECT COUNT(*) FROM SPLITTRANSACTIONS_V1 s JOIN CHECKINGACCOUNT_V1 t ON t.TRANSID = s.TRANSID
         WHERE s.CATEGID IN (${list}) AND ${live('t.')}) AS splits`,
      `(SELECT COUNT(*) FROM BUDGETSPLITTRANSACTIONS_V1 WHERE CATEGID IN (${list})) AS seriesSplits`,
      `(SELECT COUNT(*) FROM BUDGETTABLE_V1 WHERE CATEGID IN (${list})) AS budgetRows`,
      `(SELECT COUNT(*) FROM PAYEE_V1 WHERE CATEGID IN (${list})) AS payeeDefaults`,
    )
  }
  const rows = await db.query<CountsRow>(
    `SELECT ${columns.join(', ')}`,
    repeat(ids, columns.length),
  )
  return rows[0] ?? {}
}

/** Trashed transactions referencing the ids directly or through a split line. */
const trashedTransactionIds = async (
  column: 'CATEGID' | 'PAYEEID',
  ids: readonly number[],
): Promise<number[]> => {
  const list = placeholders(ids.length)
  const parts = [
    `SELECT TRANSID AS trashedTransactionId FROM CHECKINGACCOUNT_V1 WHERE ${column} IN (${list}) AND NOT (${LIVE})`,
  ]
  if (column === 'CATEGID') {
    parts.push(
      `SELECT t.TRANSID AS trashedTransactionId FROM SPLITTRANSACTIONS_V1 s JOIN CHECKINGACCOUNT_V1 t ON t.TRANSID = s.TRANSID
         WHERE s.CATEGID IN (${list}) AND NOT (${live('t.')})`,
    )
  }
  const rows = await db.query<{ trashedTransactionId: number }>(
    parts.join(' UNION '),
    repeat(ids, parts.length),
  )
  return rows.map((row) => row.trashedTransactionId)
}

/**
 * Re-points the transactions of one column. Desktop stamps LASTUPDATEDTIME when
 * it saves a live row and leaves a trashed row's stamp alone (Model_Checking::save).
 */
const repointTransactions = (
  column: 'CATEGID' | 'PAYEEID',
  from: number,
  to: number,
  stamp: string,
): SqlStatement[] => [
  {
    sql: `UPDATE CHECKINGACCOUNT_V1 SET ${column} = ?, LASTUPDATEDTIME = ? WHERE ${column} = ? AND ${LIVE}`,
    bind: [to, stamp, from],
  },
  {
    sql: `UPDATE CHECKINGACCOUNT_V1 SET ${column} = ? WHERE ${column} = ? AND NOT (${LIVE})`,
    bind: [to, from],
  },
]

const refuseUnlessDeletable = (
  kind: TaxonomyKind,
  usage: TaxonomyUsage,
  options: RemoveOptions,
): void => {
  if (usage.state === 'used' || (usage.state === 'onlyTrashed' && !options.purgeTrashed)) {
    throw new TaxonomyInUseError(kind, usage)
  }
}

/** Deletes what can be deleted, in one batch, and reports what was refused. */
const removeEach = async (
  ids: readonly number[],
  statementsFor: (id: number) => Promise<SqlStatement[]>,
): Promise<RemoveManyResult> => {
  const result: RemoveManyResult = { removed: [], refused: [] }
  const statements: SqlStatement[] = []
  for (const id of ids) {
    try {
      statements.push(...(await statementsFor(id)))
      result.removed.push(id)
    } catch (error) {
      if (!(error instanceof TaxonomyInUseError)) throw error
      result.refused.push({ id, usage: error.usage })
    }
  }
  if (statements.length > 0) await db.mutate(statements)
  return result
}

export const categoryRepo = {
  async all(): Promise<CategoryRecord[]> {
    return db.query<CategoryRecord>('SELECT * FROM CATEGORY_V1 ORDER BY CATEGNAME')
  },

  async get(categoryId: number): Promise<CategoryRecord | null> {
    const rows = await db.query<CategoryRecord>('SELECT * FROM CATEGORY_V1 WHERE CATEGID = ?', [
      categoryId,
    ])
    return rows[0] ?? null
  },

  /** A new category is visible even under a hidden parent (categdialog.cpp). */
  async addStatement(name: string, parentId: number = CATEGORY_ROOT_ID): Promise<SqlStatement> {
    const refusal = validateCategoryName(name)
    if (refusal) throw new TaxonomyNameError('category', refusal)
    if (hasSiblingNameConflict(await this.all(), name, parentId)) {
      throw new TaxonomyNameError('category', 'duplicate')
    }
    return insertStatement('CATEGORY_V1', { CATEGNAME: name, PARENTID: parentId, ACTIVE: 1 })
  },

  /** A case-only rename passes: the conflict check excludes the category itself. */
  async renameStatement(categoryId: number, name: string): Promise<SqlStatement> {
    const refusal = validateCategoryName(name)
    if (refusal) throw new TaxonomyNameError('category', refusal)
    const categories = await this.all()
    const category = categories.find((row) => row.CATEGID === categoryId)
    if (category && hasSiblingNameConflict(categories, name, category.PARENTID, categoryId)) {
      throw new TaxonomyNameError('category', 'duplicate')
    }
    return updateStatement('CATEGORY_V1', 'CATEGID', categoryId, { CATEGNAME: name })
  },

  /** Rejects a move that would make the category its own ancestor; the top level is a valid target. */
  async reparentStatement(categoryId: number, newParentId: number): Promise<SqlStatement> {
    const categories = await this.all()
    if (wouldCreateCycle(categories, categoryId, newParentId)) {
      throw new Error('A category cannot be moved under itself or one of its descendants')
    }
    const category = categories.find((row) => row.CATEGID === categoryId)
    if (
      category &&
      hasSiblingNameConflict(categories, category.CATEGNAME, newParentId, categoryId)
    ) {
      throw new TaxonomyNameError('category', 'duplicate')
    }
    return updateStatement('CATEGORY_V1', 'CATEGID', categoryId, { PARENTID: newParentId })
  },

  /** Hiding or unhiding applies to the whole subtree (categdialog.cpp). */
  async setHiddenStatements(categoryId: number, hidden: boolean): Promise<SqlStatement[]> {
    const ids = [categoryId, ...categorySubtree(await this.all(), categoryId).map((c) => c.CATEGID)]
    return [
      {
        sql: `UPDATE CATEGORY_V1 SET ACTIVE = ? WHERE CATEGID IN (${placeholders(ids.length)})`,
        bind: [hidden ? 0 : 1, ...ids],
      },
    ]
  },

  /**
   * Desktop's is_used over the category and its descendants: live transactions,
   * their splits, series and series splits. Trashed references are listed so a
   * confirmed deletion can purge them.
   */
  async usage(categoryId: number): Promise<TaxonomyUsage> {
    const subtreeIds = categorySubtree(await this.all(), categoryId).map((c) => c.CATEGID)
    const [own, descendants, trashed] = await Promise.all([
      referenceCounts('CATEGID', [categoryId]),
      subtreeIds.length > 0 ? referenceCounts('CATEGID', subtreeIds) : Promise.resolve({}),
      trashedTransactionIds('CATEGID', [categoryId, ...subtreeIds]),
    ])
    return buildUsage(own, { descendantUsed: liveUse(descendants), trashedTransactionIds: trashed })
  },

  /**
   * Purges the trashed references when confirmed, then removes the subtree, its
   * budget rows and the payee defaults pointing into it (operator decision 2026-10-02).
   */
  async removeStatements(categoryId: number, options: RemoveOptions = {}): Promise<SqlStatement[]> {
    const usage = await this.usage(categoryId)
    refuseUnlessDeletable('category', usage, options)
    const ids = [categoryId, ...categorySubtree(await this.all(), categoryId).map((c) => c.CATEGID)]
    const list = placeholders(ids.length)
    return [
      ...(await ledgerRepo.hardDeleteStatements(usage.trashedTransactionIds)),
      { sql: `DELETE FROM BUDGETTABLE_V1 WHERE CATEGID IN (${list})`, bind: [...ids] },
      {
        sql: `UPDATE PAYEE_V1 SET CATEGID = ? WHERE CATEGID IN (${list})`,
        bind: [NONE_ID, ...ids],
      },
      { sql: `DELETE FROM CATEGORY_V1 WHERE CATEGID IN (${list})`, bind: [...ids] },
    ]
  },

  async remove(categoryId: number, options: RemoveOptions = {}): Promise<void> {
    await db.mutate(await this.removeStatements(categoryId, options))
  },

  async removeMany(ids: readonly number[], options: RemoveOptions = {}): Promise<RemoveManyResult> {
    return removeEach(ids, (id) => this.removeStatements(id, options))
  },

  /**
   * Merges one category into another as relocatecategorydialog.cpp does: every
   * referencing table re-pointed, live transactions stamped, the source's budget
   * rows deleted rather than duplicated, and the source removed on request.
   */
  async relocate(
    fromCategoryId: number,
    toCategoryId: number,
    options: RelocateOptions = {},
  ): Promise<MergeResult> {
    if (fromCategoryId === toCategoryId) throw new TaxonomyMergeError('sameEntity')
    const categories = await this.all()
    const target = categories.find((row) => row.CATEGID === toCategoryId)
    if (!target) throw new Error(`Category ${toCategoryId} does not exist`)
    if (isHidden(target)) throw new TaxonomyMergeError('hiddenTarget')
    if (options.deleteSource && childrenOf(categories, fromCategoryId).length > 0) {
      throw new TaxonomyMergeError('sourceHasChildren')
    }
    const usage = await this.usage(fromCategoryId)
    const stamp = formatUtcTimestamp(options.now ?? new Date())
    const statements: SqlStatement[] = [
      ...repointTransactions('CATEGID', fromCategoryId, toCategoryId, stamp),
      ...['SPLITTRANSACTIONS_V1', 'BILLSDEPOSITS_V1', 'BUDGETSPLITTRANSACTIONS_V1', 'PAYEE_V1'].map(
        (table) => ({
          sql: `UPDATE ${table} SET CATEGID = ? WHERE CATEGID = ?`,
          bind: [toCategoryId, fromCategoryId],
        }),
      ),
      { sql: 'DELETE FROM BUDGETTABLE_V1 WHERE CATEGID IN (?)', bind: [fromCategoryId] },
    ]
    if (options.deleteSource) {
      statements.push({
        sql: 'DELETE FROM CATEGORY_V1 WHERE CATEGID IN (?)',
        bind: [fromCategoryId],
      })
    }
    await db.mutate(statements)
    const byTable = {
      transactions: usage.transactions + usage.trashedTransactionIds.length,
      splits: usage.splits,
      series: usage.series,
      seriesSplits: usage.seriesSplits,
      budgetRows: usage.budgetRows,
      payeeDefaults: usage.payeeDefaults,
    }
    return { changed: Object.values(byTable).reduce((sum, n) => sum + n, 0), byTable }
  },
}

/** What a surface submits for a payee; `patterns` goes through the codec, `hidden` becomes ACTIVE. */
export interface PayeeDraft {
  PAYEENAME: string
  CATEGID?: number | null
  NUMBER?: string | null
  WEBSITE?: string | null
  NOTES?: string | null
  hidden?: boolean
  patterns?: readonly string[]
}

const refusePayee = (draft: Partial<PayeeDraft>): void => {
  if (draft.PAYEENAME !== undefined || draft.WEBSITE !== undefined) {
    const refusal = validatePayee({ PAYEENAME: draft.PAYEENAME ?? 'x', WEBSITE: draft.WEBSITE })
    if (refusal) throw new PayeeValidationError(refusal)
  }
  if (draft.patterns) {
    const refusal = validatePayeePatterns(draft.patterns)
    if (refusal) throw new PayeeValidationError(refusal)
  }
}

export const payeeRepo = {
  async all(): Promise<PayeeRecord[]> {
    return db.query<PayeeRecord>('SELECT * FROM PAYEE_V1 ORDER BY PAYEENAME')
  },

  async get(payeeId: number): Promise<PayeeRecord | null> {
    const rows = await db.query<PayeeRecord>('SELECT * FROM PAYEE_V1 WHERE PAYEEID = ?', [payeeId])
    return rows[0] ?? null
  },

  /** Writes desktop's shape: CATEGID -1 for no default, PATTERN as the object form. */
  async addStatement(draft: PayeeDraft): Promise<SqlStatement> {
    refusePayee(draft)
    const existing = await this.all()
    if (
      hasNameConflict(
        existing,
        draft.PAYEENAME,
        (p) => p.PAYEENAME,
        (p) => p.PAYEEID,
      )
    ) {
      throw new TaxonomyNameError('payee', 'duplicate')
    }
    return insertStatement('PAYEE_V1', {
      PAYEENAME: draft.PAYEENAME,
      CATEGID: draft.CATEGID ?? NONE_ID,
      NUMBER: draft.NUMBER ?? null,
      WEBSITE: draft.WEBSITE ?? null,
      NOTES: draft.NOTES ?? null,
      ACTIVE: draft.hidden ? 0 : 1,
      PATTERN: serializePayeePatterns(draft.patterns ?? []),
    })
  },

  /** Editing other fields leaves PATTERN untouched; it is written only when patterns are given. */
  async updateStatement(payeeId: number, draft: Partial<PayeeDraft>): Promise<SqlStatement> {
    refusePayee(draft)
    const values: Record<string, unknown> = {}
    if (draft.PAYEENAME !== undefined) {
      if (
        hasNameConflict(
          await this.all(),
          draft.PAYEENAME,
          (p) => p.PAYEENAME,
          (p) => p.PAYEEID,
          payeeId,
        )
      ) {
        throw new TaxonomyNameError('payee', 'duplicate')
      }
      values.PAYEENAME = draft.PAYEENAME
    }
    if (draft.CATEGID !== undefined) values.CATEGID = draft.CATEGID ?? NONE_ID
    if (draft.NUMBER !== undefined) values.NUMBER = draft.NUMBER
    if (draft.WEBSITE !== undefined) values.WEBSITE = draft.WEBSITE
    if (draft.NOTES !== undefined) values.NOTES = draft.NOTES
    if (draft.hidden !== undefined) values.ACTIVE = draft.hidden ? 0 : 1
    if (draft.patterns !== undefined) values.PATTERN = serializePayeePatterns(draft.patterns)
    return updateStatement('PAYEE_V1', 'PAYEEID', payeeId, values)
  },

  setHiddenStatements(payeeIds: readonly number[], hidden: boolean): SqlStatement[] {
    return [
      {
        sql: `UPDATE PAYEE_V1 SET ACTIVE = ? WHERE PAYEEID IN (${placeholders(payeeIds.length)})`,
        bind: [hidden ? 0 : 1, ...payeeIds],
      },
    ]
  },

  /** `null` clears the default, which desktop stores as -1. */
  setDefaultCategoryStatements(
    payeeIds: readonly number[],
    categoryId: number | null,
  ): SqlStatement[] {
    return [
      {
        sql: `UPDATE PAYEE_V1 SET CATEGID = ? WHERE PAYEEID IN (${placeholders(payeeIds.length)})`,
        bind: [categoryId ?? NONE_ID, ...payeeIds],
      },
    ]
  },

  /** Desktop's is_used: live transactions and any scheduled series. */
  async usage(payeeId: number): Promise<TaxonomyUsage> {
    const [counts, trashed] = await Promise.all([
      referenceCounts('PAYEEID', [payeeId]),
      trashedTransactionIds('PAYEEID', [payeeId]),
    ])
    return buildUsage(counts, { trashedTransactionIds: trashed })
  },

  async removeStatements(payeeId: number, options: RemoveOptions = {}): Promise<SqlStatement[]> {
    const usage = await this.usage(payeeId)
    refuseUnlessDeletable('payee', usage, options)
    return [
      ...(await ledgerRepo.hardDeleteStatements(usage.trashedTransactionIds)),
      ...extensionCleanupStatements(REFTYPE.payee, [payeeId]),
      { sql: 'DELETE FROM PAYEE_V1 WHERE PAYEEID IN (?)', bind: [payeeId] },
    ]
  },

  async remove(payeeId: number, options: RemoveOptions = {}): Promise<void> {
    await db.mutate(await this.removeStatements(payeeId, options))
  },

  async removeMany(ids: readonly number[], options: RemoveOptions = {}): Promise<RemoveManyResult> {
    return removeEach(ids, (id) => this.removeStatements(id, options))
  },

  /**
   * Merges as relocatepayeedialog.cpp does: transactions and series re-pointed,
   * live rows stamped, attachments left on the source (openspec: record-extensions),
   * the source and its attachment rows removed only on request.
   */
  async relocate(
    fromPayeeId: number,
    toPayeeId: number,
    options: RelocateOptions = {},
  ): Promise<MergeResult> {
    if (fromPayeeId === toPayeeId) throw new TaxonomyMergeError('sameEntity')
    const target = await this.get(toPayeeId)
    if (!target) throw new Error(`Payee ${toPayeeId} does not exist`)
    if (isHidden(target)) throw new TaxonomyMergeError('hiddenTarget')
    const usage = await this.usage(fromPayeeId)
    const stamp = formatUtcTimestamp(options.now ?? new Date())
    const statements: SqlStatement[] = [
      ...repointTransactions('PAYEEID', fromPayeeId, toPayeeId, stamp),
      {
        sql: 'UPDATE BILLSDEPOSITS_V1 SET PAYEEID = ? WHERE PAYEEID = ?',
        bind: [toPayeeId, fromPayeeId],
      },
    ]
    if (options.deleteSource) {
      statements.push(...extensionCleanupStatements(REFTYPE.payee, [fromPayeeId]), {
        sql: 'DELETE FROM PAYEE_V1 WHERE PAYEEID IN (?)',
        bind: [fromPayeeId],
      })
    }
    await db.mutate(statements)
    const byTable = {
      transactions: usage.transactions + usage.trashedTransactionIds.length,
      series: usage.series,
    }
    return { changed: byTable.transactions + byTable.series, byTable }
  },
}

/** The four kinds of record a tag link points at, in the order the usage query binds them. */
const TAGGABLE = [
  REFTYPE.transaction,
  REFTYPE.transactionSplit,
  REFTYPE.recurringTransaction,
  REFTYPE.recurringTransactionSplit,
] as const

export const tagRepo = {
  async all(): Promise<TagRecord[]> {
    return db.query<TagRecord>('SELECT * FROM TAG_V1 ORDER BY TAGNAME')
  },

  async get(tagId: number): Promise<TagRecord | null> {
    const rows = await db.query<TagRecord>('SELECT * FROM TAG_V1 WHERE TAGID = ?', [tagId])
    return rows[0] ?? null
  },

  /** Tags are never hidden (openspec: Visibility via Active Flags): ACTIVE is always 1. */
  async addStatement(name: string): Promise<SqlStatement> {
    const refusal = validateTagName(name)
    if (refusal) throw new TaxonomyNameError('tag', refusal)
    if (
      hasNameConflict(
        await this.all(),
        name,
        (t) => t.TAGNAME,
        (t) => t.TAGID,
      )
    ) {
      throw new TaxonomyNameError('tag', 'duplicate')
    }
    return insertStatement('TAG_V1', { TAGNAME: name, ACTIVE: 1 })
  },

  async renameStatement(tagId: number, name: string): Promise<SqlStatement> {
    const refusal = validateTagName(name)
    if (refusal) throw new TaxonomyNameError('tag', refusal)
    if (
      hasNameConflict(
        await this.all(),
        name,
        (t) => t.TAGNAME,
        (t) => t.TAGID,
        tagId,
      )
    ) {
      throw new TaxonomyNameError('tag', 'duplicate')
    }
    return updateStatement('TAG_V1', 'TAGID', tagId, { TAGNAME: name, ACTIVE: 1 })
  },

  async linksFor(refType: RefType, refId: number): Promise<TagLinkRecord[]> {
    return db.query<TagLinkRecord>(
      'SELECT * FROM TAGLINK_V1 WHERE REFTYPE = ? AND REFID = ? ORDER BY TAGLINKID',
      [refType, refId],
    )
  },

  /** (REFTYPE, REFID, TAGID) is unique, so re-attaching the same tag is a no-op. */
  attachStatement(refType: RefType, refId: number, tagId: number): SqlStatement {
    return {
      sql: 'INSERT OR IGNORE INTO TAGLINK_V1 (REFTYPE, REFID, TAGID) VALUES (?, ?, ?)',
      bind: [refType, refId, tagId],
    }
  },

  detachStatement(refType: RefType, refId: number, tagId: number): SqlStatement {
    return {
      sql: 'DELETE FROM TAGLINK_V1 WHERE REFTYPE = ? AND REFID = ? AND TAGID = ?',
      bind: [refType, refId, tagId],
    }
  },

  /**
   * Model_Tag::is_used: a link to a live transaction or split, or to a series or
   * series split that exists, is use; links only to trashed transactions are the
   * purge case; links to records that no longer exist are orphans and never block.
   */
  async usage(tagId: number): Promise<TaxonomyUsage> {
    const [transaction, split, series, seriesSplit] = TAGGABLE
    const countsSql = `SELECT
      (SELECT COUNT(*) FROM TAGLINK_V1 l JOIN CHECKINGACCOUNT_V1 t ON t.TRANSID = l.REFID
         WHERE l.TAGID = ? AND l.REFTYPE = ? AND ${live('t.')}) AS transactions,
      (SELECT COUNT(*) FROM TAGLINK_V1 l JOIN SPLITTRANSACTIONS_V1 s ON s.SPLITTRANSID = l.REFID
         JOIN CHECKINGACCOUNT_V1 t ON t.TRANSID = s.TRANSID
         WHERE l.TAGID = ? AND l.REFTYPE = ? AND ${live('t.')}) AS splits,
      (SELECT COUNT(*) FROM TAGLINK_V1 l JOIN BILLSDEPOSITS_V1 b ON b.BDID = l.REFID
         WHERE l.TAGID = ? AND l.REFTYPE = ?) AS series,
      (SELECT COUNT(*) FROM TAGLINK_V1 l JOIN BUDGETSPLITTRANSACTIONS_V1 s ON s.SPLITTRANSID = l.REFID
         WHERE l.TAGID = ? AND l.REFTYPE = ?) AS seriesSplits,
      (SELECT COUNT(*) FROM TAGLINK_V1 l JOIN CHECKINGACCOUNT_V1 t ON t.TRANSID = l.REFID
         WHERE l.TAGID = ? AND l.REFTYPE = ? AND NOT (${live('t.')}))
      + (SELECT COUNT(*) FROM TAGLINK_V1 l JOIN SPLITTRANSACTIONS_V1 s ON s.SPLITTRANSID = l.REFID
         JOIN CHECKINGACCOUNT_V1 t ON t.TRANSID = s.TRANSID
         WHERE l.TAGID = ? AND l.REFTYPE = ? AND NOT (${live('t.')})) AS trashedLinks,
      (SELECT COUNT(*) FROM TAGLINK_V1 WHERE TAGID = ?) AS links`
    const trashedSql = `SELECT t.TRANSID AS trashedTransactionId FROM TAGLINK_V1 l
        JOIN CHECKINGACCOUNT_V1 t ON t.TRANSID = l.REFID
        WHERE l.TAGID = ? AND l.REFTYPE = ? AND NOT (${live('t.')})
      UNION SELECT t.TRANSID AS trashedTransactionId FROM TAGLINK_V1 l
        JOIN SPLITTRANSACTIONS_V1 s ON s.SPLITTRANSID = l.REFID
        JOIN CHECKINGACCOUNT_V1 t ON t.TRANSID = s.TRANSID
        WHERE l.TAGID = ? AND l.REFTYPE = ? AND NOT (${live('t.')})`
    const [counts, trashed] = await Promise.all([
      db.query<CountsRow>(countsSql, [
        tagId,
        transaction,
        tagId,
        split,
        tagId,
        series,
        tagId,
        seriesSplit,
        tagId,
        transaction,
        tagId,
        split,
        tagId,
      ]),
      db.query<{ trashedTransactionId: number }>(trashedSql, [tagId, transaction, tagId, split]),
    ])
    const row = counts[0] ?? {}
    const accounted =
      (row.transactions ?? 0) +
      (row.splits ?? 0) +
      (row.series ?? 0) +
      (row.seriesSplits ?? 0) +
      (row.trashedLinks ?? 0)
    return buildUsage(row, {
      trashedTransactionIds: trashed.map((r) => r.trashedTransactionId),
      orphanLinks: Math.max(0, (row.links ?? 0) - accounted),
    })
  },

  /** Purges confirmed trashed references, then the remaining (orphan) links and the tag. */
  async removeStatements(tagId: number, options: RemoveOptions = {}): Promise<SqlStatement[]> {
    const usage = await this.usage(tagId)
    refuseUnlessDeletable('tag', usage, options)
    return [
      ...(await ledgerRepo.hardDeleteStatements(usage.trashedTransactionIds)),
      { sql: 'DELETE FROM TAGLINK_V1 WHERE TAGID = ?', bind: [tagId] },
      { sql: 'DELETE FROM TAG_V1 WHERE TAGID = ?', bind: [tagId] },
    ]
  },

  async remove(tagId: number, options: RemoveOptions = {}): Promise<void> {
    await db.mutate(await this.removeStatements(tagId, options))
  },

  async removeMany(ids: readonly number[], options: RemoveOptions = {}): Promise<RemoveManyResult> {
    return removeEach(ids, (id) => this.removeStatements(id, options))
  },

  /**
   * Re-points the links that do not collide with a link the target already has
   * and drops the ones that would (design D6). Link rows change, transaction rows
   * do not, so nothing is stamped.
   */
  async relocate(
    fromTagId: number,
    toTagId: number,
    options: Pick<RelocateOptions, 'deleteSource'> = {},
  ): Promise<{ moved: number; collapsed: number }> {
    if (fromTagId === toTagId) throw new TaxonomyMergeError('sameEntity')
    if (!(await this.get(toTagId))) throw new Error(`Tag ${toTagId} does not exist`)
    const [links, collisions] = await Promise.all([
      db.query<{ links: number }>('SELECT COUNT(*) AS links FROM TAGLINK_V1 WHERE TAGID = ?', [
        fromTagId,
      ]),
      db.query<{ collapsed: number }>(
        `SELECT COUNT(*) AS collapsed FROM TAGLINK_V1 s
           JOIN TAGLINK_V1 t ON t.REFTYPE = s.REFTYPE AND t.REFID = s.REFID AND t.TAGID = ?
           WHERE s.TAGID = ?`,
        [toTagId, fromTagId],
      ),
    ])
    const statements: SqlStatement[] = [
      {
        sql: 'UPDATE OR IGNORE TAGLINK_V1 SET TAGID = ? WHERE TAGID = ?',
        bind: [toTagId, fromTagId],
      },
      { sql: 'DELETE FROM TAGLINK_V1 WHERE TAGID = ?', bind: [fromTagId] },
    ]
    if (options.deleteSource) {
      statements.push({ sql: 'DELETE FROM TAG_V1 WHERE TAGID = ?', bind: [fromTagId] })
    }
    await db.mutate(statements)
    const collapsed = collisions[0]?.collapsed ?? 0
    return { moved: Math.max(0, (links[0]?.links ?? 0) - collapsed), collapsed }
  },
}
