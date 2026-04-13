import { ref } from 'vue'
import { dbClient } from '@/workers/db-client'
import i18n from '@/i18n'
import type { Tag, RelocationStats } from '@/types/entities'

function rowToTag(row: unknown[]): Tag {
  return {
    TAGID: row[0] as number,
    TAGNAME: row[1] as string,
    ACTIVE: row[2] as number,
  }
}

export function useTags() {
  const tags = ref<Tag[]>([])
  const loading = ref(false)
  const t = i18n.global.t

  async function refresh(): Promise<void> {
    loading.value = true
    try {
      const rows = (await dbClient.exec(
        'SELECT TAGID, TAGNAME, ACTIVE FROM TAG_V1 ORDER BY TAGNAME',
      )) as unknown[][]
      tags.value = rows.map(rowToTag)
    } finally {
      loading.value = false
    }
  }

  async function create(name: string): Promise<number> {
    const trimmed = name.trim()
    if (!trimmed) throw new Error(t('common.VALIDATION_TAG_NAME_EMPTY'))

    const dup = (await dbClient.exec(
      'SELECT COUNT(*) FROM TAG_V1 WHERE TAGNAME = ? COLLATE NOCASE',
      [trimmed],
    )) as unknown[][]
    if (dup[0] && (dup[0][0] as number) > 0) {
      throw new Error(t('common.VALIDATION_TAG_DUPLICATE_NAME'))
    }

    await dbClient.exec('INSERT INTO TAG_V1 (TAGNAME, ACTIVE) VALUES (?, 1)', [trimmed])
    const result = (await dbClient.exec('SELECT last_insert_rowid()')) as unknown[][]
    const newId = result[0]![0] as number
    await refresh()
    return newId
  }

  async function rename(tagId: number, newName: string): Promise<void> {
    const trimmed = newName.trim()
    if (!trimmed) throw new Error(t('common.VALIDATION_TAG_NAME_EMPTY'))

    const dup = (await dbClient.exec(
      'SELECT COUNT(*) FROM TAG_V1 WHERE TAGNAME = ? COLLATE NOCASE AND TAGID != ?',
      [trimmed, tagId],
    )) as unknown[][]
    if (dup[0] && (dup[0][0] as number) > 0) {
      throw new Error(t('common.VALIDATION_TAG_DUPLICATE_NAME'))
    }

    await dbClient.exec('UPDATE TAG_V1 SET TAGNAME = ? WHERE TAGID = ?', [trimmed, tagId])
    await refresh()
  }

  async function remove(tagId: number): Promise<void> {
    if (await isUsed(tagId)) {
      throw new Error(t('common.VALIDATION_TAG_IN_USE'))
    }
    await dbClient.exec('DELETE FROM TAG_V1 WHERE TAGID = ?', [tagId])
    await refresh()
  }

  async function toggleActive(tagId: number): Promise<void> {
    const tag = tags.value.find((t) => t.TAGID === tagId)
    if (!tag) throw new Error('Tag not found')
    const newActive = tag.ACTIVE === 1 ? 0 : 1
    await dbClient.exec('UPDATE TAG_V1 SET ACTIVE = ? WHERE TAGID = ?', [newActive, tagId])
    await refresh()
  }

  async function isUsed(tagId: number): Promise<boolean> {
    const result = (await dbClient.exec(
      'SELECT COUNT(*) FROM TAGLINK_V1 WHERE TAGID = ?',
      [tagId],
    )) as unknown[][]
    return (result[0]![0] as number) > 0
  }

  async function getUsageCount(tagId: number): Promise<number> {
    const result = (await dbClient.exec(
      'SELECT COUNT(*) FROM TAGLINK_V1 WHERE TAGID = ?',
      [tagId],
    )) as unknown[][]
    return result[0]![0] as number
  }

  async function getRelocationStats(sourceId: number): Promise<RelocationStats> {
    const count = await getUsageCount(sourceId)
    return {
      transactions: count,
      splitTransactions: 0,
      recurringTransactions: 0,
      budgets: 0,
      budgetSplits: 0,
      payeeDefaults: 0,
    }
  }

  async function relocate(
    sourceId: number,
    targetId: number,
    deleteSource: boolean,
  ): Promise<void> {
    if (sourceId === targetId) throw new Error(t('relocation.selfMergeError'))

    const statements: Array<{ sql: string; bind?: unknown[] }> = [
      // Update taglinks that won't cause duplicates
      {
        sql: `UPDATE TAGLINK_V1 SET TAGID = ? WHERE TAGID = ? AND TAGLINKID NOT IN (
          SELECT tl1.TAGLINKID FROM TAGLINK_V1 tl1
          INNER JOIN TAGLINK_V1 tl2 ON tl1.REFTYPE = tl2.REFTYPE AND tl1.REFID = tl2.REFID
          WHERE tl1.TAGID = ? AND tl2.TAGID = ?
        )`,
        bind: [targetId, sourceId, sourceId, targetId],
      },
      // Delete remaining source links (duplicates)
      {
        sql: 'DELETE FROM TAGLINK_V1 WHERE TAGID = ?',
        bind: [sourceId],
      },
    ]

    if (deleteSource) {
      statements.push({
        sql: 'DELETE FROM TAG_V1 WHERE TAGID = ?',
        bind: [sourceId],
      })
    }

    await dbClient.execTransaction(statements)
    await refresh()
  }

  return {
    tags,
    loading,
    refresh,
    create,
    rename,
    remove,
    toggleActive,
    isUsed,
    getUsageCount,
    getRelocationStats,
    relocate,
  }
}
