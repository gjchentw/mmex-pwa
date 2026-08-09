import type { RefType } from '../conventions'
import {
  db,
  deleteStatement,
  insertStatement,
  placeholders,
  updateStatement,
  type SqlStatement,
} from '../db'
import type { AttachmentRecord, CustomFieldDataRecord, CustomFieldRecord } from '../records'
import { validateFieldValue } from '../rules/extensions'

/**
 * Attachments and custom fields (openspec: record-extensions), plus the shared
 * cleanup used by every capability that removes a record carrying polymorphic
 * decorations (openspec: domain-data-conventions, Application-Level Referential
 * Integrity).
 */

export const attachmentsRepo = {
  async listFor(refType: RefType, refId: number): Promise<AttachmentRecord[]> {
    return db.query<AttachmentRecord>(
      'SELECT * FROM ATTACHMENT_V1 WHERE REFTYPE = ? AND REFID = ? ORDER BY ATTACHMENTID',
      [refType, refId],
    )
  },

  /** Metadata only: the application never reads or writes attachment binaries. */
  addStatement(row: Omit<AttachmentRecord, 'ATTACHMENTID'>): SqlStatement {
    return insertStatement('ATTACHMENT_V1', {
      REFTYPE: row.REFTYPE,
      REFID: row.REFID,
      DESCRIPTION: row.DESCRIPTION,
      FILENAME: row.FILENAME,
    })
  },

  removeStatement(attachmentIds: readonly number[]): SqlStatement {
    return deleteStatement('ATTACHMENT_V1', 'ATTACHMENTID', attachmentIds)
  },

  /** Merging one record into another carries its attachments across. */
  relocateStatement(refType: RefType, fromRefId: number, toRefId: number): SqlStatement {
    return {
      sql: 'UPDATE ATTACHMENT_V1 SET REFID = ? WHERE REFTYPE = ? AND REFID = ?',
      bind: [toRefId, refType, fromRefId],
    }
  },
}

export const customFieldsRepo = {
  async listDefinitions(refType: RefType): Promise<CustomFieldRecord[]> {
    return db.query<CustomFieldRecord>(
      'SELECT * FROM CUSTOMFIELD_V1 WHERE REFTYPE = ? ORDER BY FIELDID',
      [refType],
    )
  },

  async listValues(fieldIds: readonly number[], refId: number): Promise<CustomFieldDataRecord[]> {
    if (fieldIds.length === 0) return []
    return db.query<CustomFieldDataRecord>(
      `SELECT * FROM CUSTOMFIELDDATA_V1 WHERE REFID = ? AND FIELDID IN (${placeholders(fieldIds.length)})`,
      [refId, ...fieldIds],
    )
  },

  /**
   * One value per (FIELDID, REFID): an edit replaces, never duplicates. The
   * content is validated against its definition first.
   */
  setValueStatement(field: CustomFieldRecord, refId: number, content: string): SqlStatement {
    const validation = validateFieldValue(field, content)
    if (!validation.valid) {
      throw new Error(
        `Custom field "${field.DESCRIPTION ?? field.FIELDID}" rejected: ${validation.reason}`,
      )
    }
    return {
      sql: `INSERT INTO CUSTOMFIELDDATA_V1 (FIELDID, REFID, CONTENT) VALUES (?, ?, ?)
            ON CONFLICT(FIELDID, REFID) DO UPDATE SET CONTENT = excluded.CONTENT`,
      bind: [field.FIELDID, refId, content],
    }
  },

  /** Deleting a definition removes every value recorded against it. */
  removeDefinitionStatements(fieldId: number): SqlStatement[] {
    return [
      { sql: 'DELETE FROM CUSTOMFIELDDATA_V1 WHERE FIELDID = ?', bind: [fieldId] },
      { sql: 'DELETE FROM CUSTOMFIELD_V1 WHERE FIELDID = ?', bind: [fieldId] },
    ]
  },

  async removeDefinition(fieldId: number): Promise<void> {
    await db.mutate(this.removeDefinitionStatements(fieldId))
  },
}

/**
 * Statements removing every polymorphic decoration attached to the given
 * records: tag links, attachments, and custom field values. Callers fold these
 * into the same atomic operation as the delete that triggered them.
 */
export const extensionCleanupStatements = (
  refType: RefType,
  refIds: readonly number[],
): SqlStatement[] => {
  if (refIds.length === 0) return []
  const list = placeholders(refIds.length)
  const bind = [refType, ...refIds]
  return [
    { sql: `DELETE FROM TAGLINK_V1 WHERE REFTYPE = ? AND REFID IN (${list})`, bind: [...bind] },
    { sql: `DELETE FROM ATTACHMENT_V1 WHERE REFTYPE = ? AND REFID IN (${list})`, bind: [...bind] },
    {
      sql: `DELETE FROM CUSTOMFIELDDATA_V1 WHERE REFID IN (${list})
            AND FIELDID IN (SELECT FIELDID FROM CUSTOMFIELD_V1 WHERE REFTYPE = ?)`,
      bind: [...refIds, refType],
    },
  ]
}

export const updateCustomFieldDefinition = (
  fieldId: number,
  values: Partial<Omit<CustomFieldRecord, 'FIELDID'>>,
): SqlStatement => updateStatement('CUSTOMFIELD_V1', 'FIELDID', fieldId, values)
