import { ref, computed } from 'vue'
import { dbClient } from '@/workers/db-client'
import type { Category, CategoryNode, RelocationStats } from '@/types/entities'

function rowToCategory(row: unknown[]): Category {
  return {
    CATEGID: row[0] as number,
    CATEGNAME: row[1] as string,
    ACTIVE: row[2] as number,
    PARENTID: row[3] as number,
  }
}

function buildTree(categories: Category[]): CategoryNode[] {
  const map = new Map<number, CategoryNode>()
  const roots: CategoryNode[] = []

  for (const c of categories) {
    map.set(c.CATEGID, {
      id: c.CATEGID,
      label: c.CATEGNAME,
      active: c.ACTIVE === 1,
      parentId: c.PARENTID,
      children: [],
    })
  }

  for (const node of map.values()) {
    if (node.parentId === -1) {
      roots.push(node)
    } else {
      const parent = map.get(node.parentId)
      if (parent) {
        parent.children.push(node)
      } else {
        roots.push(node)
      }
    }
  }

  return roots
}

export function useCategories() {
  const categories = ref<Category[]>([])
  const loading = ref(false)

  const tree = computed<CategoryNode[]>(() => buildTree(categories.value))

  async function refresh(): Promise<void> {
    loading.value = true
    try {
      const rows = (await dbClient.exec(
        'SELECT CATEGID, CATEGNAME, ACTIVE, PARENTID FROM CATEGORY_V1 ORDER BY CATEGNAME',
      )) as unknown[][]
      categories.value = rows.map(rowToCategory)
    } finally {
      loading.value = false
    }
  }

  async function create(name: string, parentId: number): Promise<number> {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('Category name cannot be empty')

    const dup = (await dbClient.exec(
      'SELECT COUNT(*) FROM CATEGORY_V1 WHERE CATEGNAME = ? COLLATE NOCASE AND PARENTID = ?',
      [trimmed, parentId],
    )) as unknown[][]
    if (dup[0] && (dup[0][0] as number) > 0) {
      throw new Error('Duplicate category name under the same parent')
    }

    await dbClient.exec(
      'INSERT INTO CATEGORY_V1 (CATEGNAME, ACTIVE, PARENTID) VALUES (?, 1, ?)',
      [trimmed, parentId],
    )
    const result = (await dbClient.exec('SELECT last_insert_rowid()')) as unknown[][]
    const newId = result[0]![0] as number
    await refresh()
    return newId
  }

  async function rename(categId: number, newName: string): Promise<void> {
    const trimmed = newName.trim()
    if (!trimmed) throw new Error('Category name cannot be empty')

    const cat = categories.value.find((c) => c.CATEGID === categId)
    if (!cat) throw new Error('Category not found')

    const dup = (await dbClient.exec(
      'SELECT COUNT(*) FROM CATEGORY_V1 WHERE CATEGNAME = ? COLLATE NOCASE AND PARENTID = ? AND CATEGID != ?',
      [trimmed, cat.PARENTID, categId],
    )) as unknown[][]
    if (dup[0] && (dup[0][0] as number) > 0) {
      throw new Error('Duplicate category name under the same parent')
    }

    await dbClient.exec('UPDATE CATEGORY_V1 SET CATEGNAME = ? WHERE CATEGID = ?', [
      trimmed,
      categId,
    ])
    await refresh()
  }

  async function remove(categId: number): Promise<void> {
    if (hasChildren(categId)) {
      throw new Error('Cannot delete category with children')
    }

    if (await isUsed(categId)) {
      throw new Error('Cannot delete category in use')
    }

    await dbClient.exec('DELETE FROM CATEGORY_V1 WHERE CATEGID = ?', [categId])
    await refresh()
  }

  async function toggleActive(categId: number): Promise<void> {
    const cat = categories.value.find((c) => c.CATEGID === categId)
    if (!cat) throw new Error('Category not found')
    const newActive = cat.ACTIVE === 1 ? 0 : 1
    await dbClient.exec('UPDATE CATEGORY_V1 SET ACTIVE = ? WHERE CATEGID = ?', [
      newActive,
      categId,
    ])
    await refresh()
  }

  async function isUsed(categId: number): Promise<boolean> {
    const result = (await dbClient.exec(
      `SELECT
        (SELECT COUNT(*) FROM CHECKINGACCOUNT_V1 WHERE CATEGID = ?) +
        (SELECT COUNT(*) FROM SPLITTRANSACTIONS_V1 WHERE CATEGID = ?) +
        (SELECT COUNT(*) FROM BILLSDEPOSITS_V1 WHERE CATEGID = ?) +
        (SELECT COUNT(*) FROM BUDGETTABLE_V1 WHERE CATEGID = ?) +
        (SELECT COUNT(*) FROM BUDGETSPLITTRANSACTIONS_V1 WHERE CATEGID = ?) +
        (SELECT COUNT(*) FROM PAYEE_V1 WHERE CATEGID = ?)`,
      [categId, categId, categId, categId, categId, categId],
    )) as unknown[][]
    return (result[0]![0] as number) > 0
  }

  function hasChildren(categId: number): boolean {
    return categories.value.some((c) => c.PARENTID === categId)
  }

  function fullName(categId: number): string {
    const parts: string[] = []
    let current = categories.value.find((c) => c.CATEGID === categId)
    while (current) {
      parts.unshift(current.CATEGNAME)
      if (current.PARENTID === -1) break
      current = categories.value.find((c) => c.CATEGID === current!.PARENTID)
    }
    return parts.join(':')
  }

  async function getRelocationStats(sourceId: number): Promise<RelocationStats> {
    const result = (await dbClient.exec(
      `SELECT
        (SELECT COUNT(*) FROM CHECKINGACCOUNT_V1 WHERE CATEGID = ?),
        (SELECT COUNT(*) FROM SPLITTRANSACTIONS_V1 WHERE CATEGID = ?),
        (SELECT COUNT(*) FROM BILLSDEPOSITS_V1 WHERE CATEGID = ?),
        (SELECT COUNT(*) FROM BUDGETTABLE_V1 WHERE CATEGID = ?),
        (SELECT COUNT(*) FROM BUDGETSPLITTRANSACTIONS_V1 WHERE CATEGID = ?),
        (SELECT COUNT(*) FROM PAYEE_V1 WHERE CATEGID = ?)`,
      [sourceId, sourceId, sourceId, sourceId, sourceId, sourceId],
    )) as unknown[][]
    const r = result[0]!
    return {
      transactions: r[0] as number,
      splitTransactions: r[1] as number,
      recurringTransactions: r[2] as number,
      budgets: r[3] as number,
      budgetSplits: r[4] as number,
      payeeDefaults: r[5] as number,
    }
  }

  async function relocate(
    sourceId: number,
    targetId: number,
    deleteSource: boolean,
  ): Promise<void> {
    if (sourceId === targetId) throw new Error('Cannot merge category into itself')

    const statements: Array<{ sql: string; bind?: unknown[] }> = [
      { sql: 'UPDATE CHECKINGACCOUNT_V1 SET CATEGID = ? WHERE CATEGID = ?', bind: [targetId, sourceId] },
      { sql: 'UPDATE SPLITTRANSACTIONS_V1 SET CATEGID = ? WHERE CATEGID = ?', bind: [targetId, sourceId] },
      { sql: 'UPDATE BILLSDEPOSITS_V1 SET CATEGID = ? WHERE CATEGID = ?', bind: [targetId, sourceId] },
      { sql: 'UPDATE BUDGETTABLE_V1 SET CATEGID = ? WHERE CATEGID = ?', bind: [targetId, sourceId] },
      { sql: 'UPDATE BUDGETSPLITTRANSACTIONS_V1 SET CATEGID = ? WHERE CATEGID = ?', bind: [targetId, sourceId] },
      { sql: 'UPDATE PAYEE_V1 SET CATEGID = ? WHERE CATEGID = ?', bind: [targetId, sourceId] },
    ]

    if (deleteSource) {
      statements.push({
        sql: 'DELETE FROM CATEGORY_V1 WHERE CATEGID = ?',
        bind: [sourceId],
      })
    }

    await dbClient.execTransaction(statements)
    await refresh()
  }

  return {
    categories,
    tree,
    loading,
    refresh,
    create,
    rename,
    remove,
    toggleActive,
    isUsed,
    hasChildren,
    fullName,
    getRelocationStats,
    relocate,
  }
}
