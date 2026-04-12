import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { dbClient } from '@/workers/db-client'
import type { Payee, RelocationStats } from '@/types/entities'

function rowToPayee(row: unknown[]): Payee {
  return {
    PAYEEID: row[0] as number,
    PAYEENAME: row[1] as string,
    CATEGID: row[2] as number | null,
    NUMBER: row[3] as string,
    WEBSITE: row[4] as string,
    NOTES: row[5] as string,
    ACTIVE: row[6] as number,
    PATTERN: row[7] as string,
  }
}

export function usePayees() {
  const payees = ref<Payee[]>([])
  const loading = ref(false)

  async function refresh(): Promise<void> {
    loading.value = true
    try {
      const rows = (await dbClient.exec(
        'SELECT PAYEEID, PAYEENAME, CATEGID, NUMBER, WEBSITE, NOTES, ACTIVE, PATTERN FROM PAYEE_V1 ORDER BY PAYEENAME',
      )) as unknown[][]
      payees.value = rows.map(rowToPayee)
    } finally {
      loading.value = false
    }
  }

  async function create(name: string): Promise<number> {
    const trimmed = name.trim()
    const { t } = useI18n()
    if (!trimmed) throw new Error(t('VALIDATION_PAYEE_NAME_EMPTY'))

    const dup = (await dbClient.exec(
      'SELECT COUNT(*) FROM PAYEE_V1 WHERE PAYEENAME = ? COLLATE NOCASE',
      [trimmed],
    )) as unknown[][]
    if (dup[0] && (dup[0][0] as number) > 0) {
      const { t } = useI18n()
      throw new Error(t('VALIDATION_PAYEE_DUPLICATE_NAME'))
    }

    await dbClient.exec(
      'INSERT INTO PAYEE_V1 (PAYEENAME, ACTIVE) VALUES (?, 1)',
      [trimmed],
    )
    const result = (await dbClient.exec('SELECT last_insert_rowid()')) as unknown[][]
    const newId = result[0]![0] as number
    await refresh()
    return newId
  }

  async function update(payee: Partial<Payee> & { PAYEEID: number }): Promise<void> {
    const fields: string[] = []
    const values: unknown[] = []

    if (payee.PAYEENAME !== undefined) {
      fields.push('PAYEENAME = ?')
      values.push(payee.PAYEENAME.trim())
    }
    if (payee.CATEGID !== undefined) {
      fields.push('CATEGID = ?')
      values.push(payee.CATEGID)
    }
    if (payee.NUMBER !== undefined) {
      fields.push('NUMBER = ?')
      values.push(payee.NUMBER)
    }
    if (payee.WEBSITE !== undefined) {
      fields.push('WEBSITE = ?')
      values.push(payee.WEBSITE)
    }
    if (payee.NOTES !== undefined) {
      fields.push('NOTES = ?')
      values.push(payee.NOTES)
    }
    if (payee.PATTERN !== undefined) {
      fields.push('PATTERN = ?')
      values.push(payee.PATTERN)
    }
    if (payee.ACTIVE !== undefined) {
      fields.push('ACTIVE = ?')
      values.push(payee.ACTIVE)
    }

    if (fields.length === 0) return

    values.push(payee.PAYEEID)
    await dbClient.exec(
      `UPDATE PAYEE_V1 SET ${fields.join(', ')} WHERE PAYEEID = ?`,
      values,
    )
    await refresh()
  }

  async function remove(payeeId: number): Promise<void> {
    if (await isUsed(payeeId)) {
      const { t } = useI18n()
      throw new Error(t('VALIDATION_PAYEE_IN_USE'))
    }
    await dbClient.exec('DELETE FROM PAYEE_V1 WHERE PAYEEID = ?', [payeeId])
    await refresh()
  }

  async function toggleActive(payeeId: number): Promise<void> {
    const payee = payees.value.find((p) => p.PAYEEID === payeeId)
    if (!payee) throw new Error('Payee not found')
    const newActive = payee.ACTIVE === 1 ? 0 : 1
    await dbClient.exec('UPDATE PAYEE_V1 SET ACTIVE = ? WHERE PAYEEID = ?', [newActive, payeeId])
    await refresh()
  }

  async function isUsed(payeeId: number): Promise<boolean> {
    const result = (await dbClient.exec(
      `SELECT
        (SELECT COUNT(*) FROM CHECKINGACCOUNT_V1 WHERE PAYEEID = ?) +
        (SELECT COUNT(*) FROM BILLSDEPOSITS_V1 WHERE PAYEEID = ?)`,
      [payeeId, payeeId],
    )) as unknown[][]
    return (result[0]![0] as number) > 0
  }

  async function getRelocationStats(
    sourceId: number,
  ): Promise<RelocationStats> {
    const result = (await dbClient.exec(
      `SELECT
        (SELECT COUNT(*) FROM CHECKINGACCOUNT_V1 WHERE PAYEEID = ?),
        (SELECT COUNT(*) FROM BILLSDEPOSITS_V1 WHERE PAYEEID = ?)`,
      [sourceId, sourceId],
    )) as unknown[][]
    const r = result[0]!
    return {
      transactions: r[0] as number,
      splitTransactions: 0,
      recurringTransactions: r[1] as number,
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
    if (sourceId === targetId) throw new Error('Cannot merge payee into itself')

    const statements: Array<{ sql: string; bind?: unknown[] }> = [
      { sql: 'UPDATE CHECKINGACCOUNT_V1 SET PAYEEID = ? WHERE PAYEEID = ?', bind: [targetId, sourceId] },
      { sql: 'UPDATE BILLSDEPOSITS_V1 SET PAYEEID = ? WHERE PAYEEID = ?', bind: [targetId, sourceId] },
    ]

    if (deleteSource) {
      statements.push({
        sql: 'DELETE FROM PAYEE_V1 WHERE PAYEEID = ?',
        bind: [sourceId],
      })
    }

    await dbClient.execTransaction(statements)
    await refresh()
  }

  return {
    payees,
    loading,
    refresh,
    create,
    update,
    remove,
    toggleActive,
    isUsed,
    getRelocationStats,
    relocate,
  }
}
