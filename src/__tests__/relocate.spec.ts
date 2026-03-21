import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockExec, mockExecTransaction } = vi.hoisted(() => ({
  mockExec: vi.fn(),
  mockExecTransaction: vi.fn(),
}))

vi.mock('../workers/db-client', () => ({
  dbClient: {
    exec: mockExec,
    execTransaction: mockExecTransaction,
  },
}))

import { useCategories } from '../composables/useCategories'
import { usePayees } from '../composables/usePayees'
import { useTags } from '../composables/useTags'

describe('Relocation Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Category relocation', () => {
    it('should generate UPDATE statements for 6 tables', async () => {
      mockExec.mockResolvedValueOnce([
        [1, 'Food', 1, -1],
        [2, 'Meals', 1, -1],
      ]) // refresh
      mockExecTransaction.mockResolvedValueOnce({ executed: 6 })
      mockExec.mockResolvedValueOnce([]) // re-refresh

      const { relocate, refresh } = useCategories()
      await refresh()

      await relocate(1, 2, false)
      expect(mockExecTransaction).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ sql: expect.stringContaining('CHECKINGACCOUNT_V1') }),
          expect.objectContaining({ sql: expect.stringContaining('SPLITTRANSACTIONS_V1') }),
          expect.objectContaining({ sql: expect.stringContaining('BILLSDEPOSITS_V1') }),
          expect.objectContaining({ sql: expect.stringContaining('BUDGETTABLE_V1') }),
          expect.objectContaining({ sql: expect.stringContaining('BUDGETSPLITTRANSACTIONS_V1') }),
          expect.objectContaining({ sql: expect.stringContaining('PAYEE_V1') }),
        ]),
      )
    })

    it('should include DELETE when deleteSource is true', async () => {
      mockExec.mockResolvedValueOnce([
        [1, 'Food', 1, -1],
        [2, 'Meals', 1, -1],
      ])
      mockExecTransaction.mockResolvedValueOnce({ executed: 7 })
      mockExec.mockResolvedValueOnce([])

      const { relocate, refresh } = useCategories()
      await refresh()

      await relocate(1, 2, true)
      const stmts = mockExecTransaction.mock.calls[0]![0]
      expect(stmts).toHaveLength(7)
      expect(stmts[6]).toEqual(
        expect.objectContaining({ sql: expect.stringContaining('DELETE FROM CATEGORY_V1') }),
      )
    })

    it('should reject self-merge', async () => {
      mockExec.mockResolvedValueOnce([[1, 'Food', 1, -1]])

      const { relocate, refresh } = useCategories()
      await refresh()

      await expect(relocate(1, 1, false)).rejects.toThrow('Cannot merge category into itself')
    })

    it('should return relocation stats', async () => {
      mockExec
        .mockResolvedValueOnce([[1, 'Food', 1, -1]]) // refresh
        .mockResolvedValueOnce([[3, 1, 2, 0, 0, 1]]) // stats query

      const { getRelocationStats, refresh } = useCategories()
      await refresh()

      const stats = await getRelocationStats(1)
      expect(stats).toEqual({
        transactions: 3,
        splitTransactions: 1,
        recurringTransactions: 2,
        budgets: 0,
        budgetSplits: 0,
        payeeDefaults: 1,
      })
    })
  })

  describe('Payee relocation', () => {
    it('should generate UPDATE statements for 2 tables', async () => {
      mockExec.mockResolvedValueOnce([
        [1, 'Shop A', null, '', '', '', 1, ''],
        [2, 'Shop B', null, '', '', '', 1, ''],
      ])
      mockExecTransaction.mockResolvedValueOnce({ executed: 2 })
      mockExec.mockResolvedValueOnce([])

      const { relocate, refresh } = usePayees()
      await refresh()

      await relocate(1, 2, false)
      expect(mockExecTransaction).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ sql: expect.stringContaining('CHECKINGACCOUNT_V1') }),
          expect.objectContaining({ sql: expect.stringContaining('BILLSDEPOSITS_V1') }),
        ]),
      )
    })

    it('should reject self-merge', async () => {
      mockExec.mockResolvedValueOnce([[1, 'Shop', null, '', '', '', 1, '']])

      const { relocate, refresh } = usePayees()
      await refresh()

      await expect(relocate(1, 1, false)).rejects.toThrow('Cannot merge payee into itself')
    })

    it('should return relocation stats', async () => {
      mockExec
        .mockResolvedValueOnce([[1, 'Shop', null, '', '', '', 1, '']]) // refresh
        .mockResolvedValueOnce([[5, 2]]) // stats query

      const { getRelocationStats, refresh } = usePayees()
      await refresh()

      const stats = await getRelocationStats(1)
      expect(stats).toEqual({
        transactions: 5,
        splitTransactions: 0,
        recurringTransactions: 2,
        budgets: 0,
        budgetSplits: 0,
        payeeDefaults: 0,
      })
    })
  })

  describe('Tag relocation', () => {
    it('should handle duplicate link detection', async () => {
      mockExec.mockResolvedValueOnce([
        [1, 'TagA', 1],
        [2, 'TagB', 1],
      ])
      mockExecTransaction.mockResolvedValueOnce({ executed: 2 })
      mockExec.mockResolvedValueOnce([])

      const { relocate, refresh } = useTags()
      await refresh()

      await relocate(1, 2, false)
      const stmts = mockExecTransaction.mock.calls[0]![0]
      expect(stmts).toHaveLength(2)
      // First statement should UPDATE non-duplicate links
      expect(stmts[0].sql).toContain('UPDATE TAGLINK_V1')
      // Second statement should DELETE remaining source links
      expect(stmts[1].sql).toContain('DELETE FROM TAGLINK_V1')
    })

    it('should reject self-merge', async () => {
      mockExec.mockResolvedValueOnce([[1, 'TagA', 1]])

      const { relocate, refresh } = useTags()
      await refresh()

      await expect(relocate(1, 1, false)).rejects.toThrow('Cannot merge tag into itself')
    })

    it('should include DELETE source tag when deleteSource is true', async () => {
      mockExec.mockResolvedValueOnce([
        [1, 'TagA', 1],
        [2, 'TagB', 1],
      ])
      mockExecTransaction.mockResolvedValueOnce({ executed: 3 })
      mockExec.mockResolvedValueOnce([])

      const { relocate, refresh } = useTags()
      await refresh()

      await relocate(1, 2, true)
      const stmts = mockExecTransaction.mock.calls[0]![0]
      expect(stmts).toHaveLength(3)
      expect(stmts[2]).toEqual(
        expect.objectContaining({ sql: expect.stringContaining('DELETE FROM TAG_V1') }),
      )
    })
  })
})
