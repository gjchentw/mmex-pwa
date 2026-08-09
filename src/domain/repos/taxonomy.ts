import { REFTYPE, type RefType } from '../conventions'
import { db, insertStatement, updateStatement, type SqlStatement } from '../db'
import type { CategoryRecord, PayeeRecord, TagLinkRecord, TagRecord } from '../records'
import {
  CATEGORY_ROOT_ID,
  categorySubtree,
  hasNameConflict,
  hasSiblingNameConflict,
  wouldCreateCycle,
} from '../rules/taxonomy'
import { attachmentsRepo, extensionCleanupStatements } from './extensions'

/** Categories, payees and tags (openspec: transaction-taxonomy). */

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

  async addStatement(
    name: string,
    parentId: number = CATEGORY_ROOT_ID,
    active = 1,
  ): Promise<SqlStatement> {
    if (hasSiblingNameConflict(await this.all(), name, parentId)) {
      throw new Error(`A category named "${name}" already exists under this parent`)
    }
    return insertStatement('CATEGORY_V1', {
      CATEGNAME: name,
      PARENTID: parentId,
      ACTIVE: active,
    })
  },

  /** Rejects a move that would make the category its own ancestor. */
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
      throw new Error(
        `A category named "${category.CATEGNAME}" already exists under the new parent`,
      )
    }
    return updateStatement('CATEGORY_V1', 'CATEGID', categoryId, { PARENTID: newParentId })
  },

  /**
   * A category is used by transactions, splits, scheduled series and their
   * splits, budget entries, payee defaults, or its own children.
   */
  async usageCount(categoryId: number): Promise<number> {
    const [rows, children] = await Promise.all([
      db.query<{ count: number }>(
        `SELECT
           (SELECT COUNT(*) FROM CHECKINGACCOUNT_V1 WHERE CATEGID = ?)
         + (SELECT COUNT(*) FROM SPLITTRANSACTIONS_V1 WHERE CATEGID = ?)
         + (SELECT COUNT(*) FROM BILLSDEPOSITS_V1 WHERE CATEGID = ?)
         + (SELECT COUNT(*) FROM BUDGETSPLITTRANSACTIONS_V1 WHERE CATEGID = ?)
         + (SELECT COUNT(*) FROM BUDGETTABLE_V1 WHERE CATEGID = ?)
         + (SELECT COUNT(*) FROM PAYEE_V1 WHERE CATEGID = ?) AS count`,
        Array(6).fill(categoryId),
      ),
      this.all(),
    ])
    return (rows[0]?.count ?? 0) + categorySubtree(children, categoryId).length
  },

  async remove(categoryId: number): Promise<void> {
    if ((await this.usageCount(categoryId)) > 0) {
      throw new Error('Category is in use and cannot be deleted')
    }
    await db.mutate([{ sql: 'DELETE FROM CATEGORY_V1 WHERE CATEGID = ?', bind: [categoryId] }])
  },

  /** Reassigns every reference from one category to another, then reports the count. */
  async relocate(fromCategoryId: number, toCategoryId: number): Promise<number> {
    const affected = await this.usageCount(fromCategoryId)
    await db.mutate([
      {
        sql: 'UPDATE CHECKINGACCOUNT_V1 SET CATEGID = ? WHERE CATEGID = ?',
        bind: [toCategoryId, fromCategoryId],
      },
      {
        sql: 'UPDATE SPLITTRANSACTIONS_V1 SET CATEGID = ? WHERE CATEGID = ?',
        bind: [toCategoryId, fromCategoryId],
      },
      {
        sql: 'UPDATE BILLSDEPOSITS_V1 SET CATEGID = ? WHERE CATEGID = ?',
        bind: [toCategoryId, fromCategoryId],
      },
      {
        sql: 'UPDATE BUDGETSPLITTRANSACTIONS_V1 SET CATEGID = ? WHERE CATEGID = ?',
        bind: [toCategoryId, fromCategoryId],
      },
      {
        sql: 'UPDATE BUDGETTABLE_V1 SET CATEGID = ? WHERE CATEGID = ?',
        bind: [toCategoryId, fromCategoryId],
      },
      {
        sql: 'UPDATE PAYEE_V1 SET CATEGID = ? WHERE CATEGID = ?',
        bind: [toCategoryId, fromCategoryId],
      },
    ])
    return affected
  },
}

export const payeeRepo = {
  async all(): Promise<PayeeRecord[]> {
    return db.query<PayeeRecord>('SELECT * FROM PAYEE_V1 ORDER BY PAYEENAME')
  },

  async get(payeeId: number): Promise<PayeeRecord | null> {
    const rows = await db.query<PayeeRecord>('SELECT * FROM PAYEE_V1 WHERE PAYEEID = ?', [payeeId])
    return rows[0] ?? null
  },

  async addStatement(values: Omit<PayeeRecord, 'PAYEEID'>): Promise<SqlStatement> {
    const existing = await this.all()
    if (
      hasNameConflict(
        existing,
        values.PAYEENAME,
        (p) => p.PAYEENAME,
        (p) => p.PAYEEID,
      )
    ) {
      throw new Error(`A payee named "${values.PAYEENAME}" already exists`)
    }
    return insertStatement('PAYEE_V1', { ...values })
  },

  /** Editing other fields must leave the match patterns untouched. */
  updateStatement(payeeId: number, values: Partial<Omit<PayeeRecord, 'PAYEEID'>>) {
    return updateStatement('PAYEE_V1', 'PAYEEID', payeeId, values)
  },

  async usageCount(payeeId: number): Promise<number> {
    const rows = await db.query<{ count: number }>(
      `SELECT (SELECT COUNT(*) FROM CHECKINGACCOUNT_V1 WHERE PAYEEID = ?)
            + (SELECT COUNT(*) FROM BILLSDEPOSITS_V1 WHERE PAYEEID = ?) AS count`,
      [payeeId, payeeId],
    )
    return rows[0]?.count ?? 0
  },

  async remove(payeeId: number): Promise<void> {
    if ((await this.usageCount(payeeId)) > 0) {
      throw new Error('Payee is in use and cannot be deleted')
    }
    await db.mutate([
      ...extensionCleanupStatements(REFTYPE.payee, [payeeId]),
      { sql: 'DELETE FROM PAYEE_V1 WHERE PAYEEID = ?', bind: [payeeId] },
    ])
  },

  /** Merging carries transactions, scheduled series and attachments across. */
  async relocate(fromPayeeId: number, toPayeeId: number): Promise<number> {
    const affected = await this.usageCount(fromPayeeId)
    await db.mutate([
      {
        sql: 'UPDATE CHECKINGACCOUNT_V1 SET PAYEEID = ? WHERE PAYEEID = ?',
        bind: [toPayeeId, fromPayeeId],
      },
      {
        sql: 'UPDATE BILLSDEPOSITS_V1 SET PAYEEID = ? WHERE PAYEEID = ?',
        bind: [toPayeeId, fromPayeeId],
      },
      attachmentsRepo.relocateStatement(REFTYPE.payee, fromPayeeId, toPayeeId),
    ])
    return affected
  },
}

export const tagRepo = {
  async all(): Promise<TagRecord[]> {
    return db.query<TagRecord>('SELECT * FROM TAG_V1 ORDER BY TAGNAME')
  },

  async addStatement(name: string, active = 1): Promise<SqlStatement> {
    if (
      hasNameConflict(
        await this.all(),
        name,
        (t) => t.TAGNAME,
        (t) => t.TAGID,
      )
    ) {
      throw new Error(`A tag named "${name}" already exists`)
    }
    return insertStatement('TAG_V1', { TAGNAME: name, ACTIVE: active })
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

  async usageCount(tagId: number): Promise<number> {
    const rows = await db.query<{ count: number }>(
      'SELECT COUNT(*) AS count FROM TAGLINK_V1 WHERE TAGID = ?',
      [tagId],
    )
    return rows[0]?.count ?? 0
  },

  /** Deleting a tag removes its links in the same operation. */
  async remove(tagId: number): Promise<void> {
    await db.mutate([
      { sql: 'DELETE FROM TAGLINK_V1 WHERE TAGID = ?', bind: [tagId] },
      { sql: 'DELETE FROM TAG_V1 WHERE TAGID = ?', bind: [tagId] },
    ])
  },

  async relocate(fromTagId: number, toTagId: number): Promise<number> {
    const affected = await this.usageCount(fromTagId)
    await db.mutate([
      // Re-point the links that would not collide, then drop what remains.
      {
        sql: `UPDATE OR IGNORE TAGLINK_V1 SET TAGID = ? WHERE TAGID = ?`,
        bind: [toTagId, fromTagId],
      },
      { sql: 'DELETE FROM TAGLINK_V1 WHERE TAGID = ?', bind: [fromTagId] },
    ])
    return affected
  },
}
