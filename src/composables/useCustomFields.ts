import { ref } from 'vue'
import { dbClient } from '@/workers/db-client'
import type { CustomField, CustomFieldData, CustomFieldProperties, CustomFieldType } from '@/types/entities'

function rowToField(row: unknown[]): CustomField {
  return {
    FIELDID: row[0] as number,
    REFTYPE: row[1] as string,
    DESCRIPTION: row[2] as string,
    TYPE: row[3] as CustomFieldType,
    PROPERTIES: row[4] as string,
  }
}

function rowToFieldData(row: unknown[]): CustomFieldData {
  return {
    FIELDATADID: row[0] as number,
    FIELDID: row[1] as number,
    REFID: row[2] as number,
    CONTENT: row[3] as string | null,
  }
}

export function useCustomFields() {
  const fields = ref<CustomField[]>([])
  const loading = ref(false)

  async function refresh(): Promise<void> {
    loading.value = true
    try {
      const rows = (await dbClient.exec(
        'SELECT FIELDID, REFTYPE, DESCRIPTION, TYPE, PROPERTIES FROM CUSTOMFIELD_V1 ORDER BY REFTYPE, DESCRIPTION',
      )) as unknown[][]
      fields.value = rows.map(rowToField)
    } finally {
      loading.value = false
    }
  }

  async function create(field: Omit<CustomField, 'FIELDID'>): Promise<number> {
    if (!field.DESCRIPTION?.trim()) throw new Error('Description cannot be empty')

    await dbClient.exec(
      'INSERT INTO CUSTOMFIELD_V1 (REFTYPE, DESCRIPTION, TYPE, PROPERTIES) VALUES (?, ?, ?, ?)',
      [field.REFTYPE, field.DESCRIPTION.trim(), field.TYPE, field.PROPERTIES],
    )
    const result = (await dbClient.exec('SELECT last_insert_rowid()')) as unknown[][]
    const newId = result[0]![0] as number
    await refresh()
    return newId
  }

  async function update(field: Partial<CustomField> & { FIELDID: number }): Promise<void> {
    const parts: string[] = []
    const values: unknown[] = []

    if (field.DESCRIPTION !== undefined) {
      parts.push('DESCRIPTION = ?')
      values.push(field.DESCRIPTION.trim())
    }
    if (field.TYPE !== undefined) {
      parts.push('TYPE = ?')
      values.push(field.TYPE)
    }
    if (field.REFTYPE !== undefined) {
      parts.push('REFTYPE = ?')
      values.push(field.REFTYPE)
    }
    if (field.PROPERTIES !== undefined) {
      parts.push('PROPERTIES = ?')
      values.push(field.PROPERTIES)
    }

    if (parts.length === 0) return

    values.push(field.FIELDID)
    await dbClient.exec(
      `UPDATE CUSTOMFIELD_V1 SET ${parts.join(', ')} WHERE FIELDID = ?`,
      values,
    )
    await refresh()
  }

  async function remove(fieldId: number): Promise<void> {
    await dbClient.execTransaction([
      { sql: 'DELETE FROM CUSTOMFIELDDATA_V1 WHERE FIELDID = ?', bind: [fieldId] },
      { sql: 'DELETE FROM CUSTOMFIELD_V1 WHERE FIELDID = ?', bind: [fieldId] },
    ])
    await refresh()
  }

  function getByRefType(refType: string): CustomField[] {
    return fields.value.filter((f) => f.REFTYPE === refType)
  }

  function parseProperties(properties: string): CustomFieldProperties {
    try {
      return JSON.parse(properties) as CustomFieldProperties
    } catch {
      return {}
    }
  }

  async function getData(refType: string, refId: number): Promise<CustomFieldData[]> {
    const rows = (await dbClient.exec(
      `SELECT d.FIELDATADID, d.FIELDID, d.REFID, d.CONTENT
       FROM CUSTOMFIELDDATA_V1 d
       INNER JOIN CUSTOMFIELD_V1 f ON d.FIELDID = f.FIELDID
       WHERE f.REFTYPE = ? AND d.REFID = ?`,
      [refType, refId],
    )) as unknown[][]
    return rows.map(rowToFieldData)
  }

  async function saveData(fieldId: number, refId: number, content: string | null): Promise<void> {
    await dbClient.exec(
      'INSERT OR REPLACE INTO CUSTOMFIELDDATA_V1 (FIELDID, REFID, CONTENT) VALUES (?, ?, ?)',
      [fieldId, refId, content],
    )
  }

  async function deleteData(refType: string, refId: number): Promise<void> {
    await dbClient.exec(
      `DELETE FROM CUSTOMFIELDDATA_V1 WHERE REFID = ? AND FIELDID IN (
        SELECT FIELDID FROM CUSTOMFIELD_V1 WHERE REFTYPE = ?
      )`,
      [refId, refType],
    )
  }

  return {
    fields,
    loading,
    refresh,
    create,
    update,
    remove,
    getByRefType,
    parseProperties,
    getData,
    saveData,
    deleteData,
  }
}
