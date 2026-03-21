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

import { useTags } from '../composables/useTags'

describe('useTags', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('refresh', () => {
    it('should load all tags from DB', async () => {
      const rows = [
        [1, 'Travel', 1],
        [2, 'Food', 1],
      ]
      mockExec.mockResolvedValueOnce(rows)

      const { tags, loading, refresh } = useTags()
      const p = refresh()
      expect(loading.value).toBe(true)
      await p
      expect(loading.value).toBe(false)

      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('SELECT'))
      expect(tags.value).toHaveLength(2)
      expect(tags.value[0]).toEqual({
        TAGID: 1,
        TAGNAME: 'Travel',
        ACTIVE: 1,
      })
    })
  })

  describe('create', () => {
    it('should insert a new tag and return TAGID', async () => {
      mockExec
        .mockResolvedValueOnce([]) // refresh
        .mockResolvedValueOnce([]) // duplicate check
        .mockResolvedValueOnce([]) // INSERT
        .mockResolvedValueOnce([[5]]) // last_insert_rowid
        .mockResolvedValueOnce([]) // re-refresh

      const { create, refresh } = useTags()
      await refresh()

      const id = await create('NewTag')
      expect(id).toBe(5)
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO TAG_V1'),
        expect.arrayContaining(['NewTag']),
      )
    })

    it('should reject duplicate tag name', async () => {
      mockExec
        .mockResolvedValueOnce([[1, 'Travel', 1]]) // refresh
        .mockResolvedValueOnce([[1]]) // duplicate check

      const { create, refresh } = useTags()
      await refresh()

      await expect(create('Travel')).rejects.toThrow()
    })
  })

  describe('rename', () => {
    it('should update tag name', async () => {
      mockExec
        .mockResolvedValueOnce([[1, 'Travel', 1]]) // refresh
        .mockResolvedValueOnce([]) // duplicate check
        .mockResolvedValueOnce([]) // UPDATE
        .mockResolvedValueOnce([[1, 'Trip', 1]]) // re-refresh

      const { rename, refresh } = useTags()
      await refresh()

      await rename(1, 'Trip')
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE TAG_V1'),
        expect.arrayContaining(['Trip', 1]),
      )
    })
  })

  describe('remove', () => {
    it('should delete unused tag', async () => {
      mockExec
        .mockResolvedValueOnce([[1, 'Travel', 1]]) // refresh
        .mockResolvedValueOnce([[0]]) // isUsed check
        .mockResolvedValueOnce([]) // DELETE
        .mockResolvedValueOnce([]) // re-refresh

      const { remove, refresh } = useTags()
      await refresh()

      await remove(1)
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM TAG_V1'),
        [1],
      )
    })

    it('should reject deletion of tag in use', async () => {
      mockExec
        .mockResolvedValueOnce([[1, 'Travel', 1]]) // refresh
        .mockResolvedValueOnce([[3]]) // isUsed returns count > 0

      const { remove, refresh } = useTags()
      await refresh()

      await expect(remove(1)).rejects.toThrow()
    })
  })

  describe('toggleActive', () => {
    it('should toggle active to hidden', async () => {
      mockExec
        .mockResolvedValueOnce([[1, 'Travel', 1]]) // refresh
        .mockResolvedValueOnce([]) // UPDATE
        .mockResolvedValueOnce([[1, 'Travel', 0]]) // re-refresh

      const { toggleActive, refresh } = useTags()
      await refresh()

      await toggleActive(1)
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE TAG_V1 SET ACTIVE'),
        expect.arrayContaining([1]),
      )
    })
  })

  describe('isUsed', () => {
    it('should return true when tag is referenced', async () => {
      mockExec
        .mockResolvedValueOnce([[1, 'Travel', 1]]) // refresh
        .mockResolvedValueOnce([[2]]) // usage count

      const { isUsed, refresh } = useTags()
      await refresh()

      expect(await isUsed(1)).toBe(true)
    })

    it('should return false when tag is not referenced', async () => {
      mockExec
        .mockResolvedValueOnce([[1, 'Travel', 1]]) // refresh
        .mockResolvedValueOnce([[0]]) // usage count

      const { isUsed, refresh } = useTags()
      await refresh()

      expect(await isUsed(1)).toBe(false)
    })
  })

  describe('getUsageCount', () => {
    it('should return count of taglinks', async () => {
      mockExec
        .mockResolvedValueOnce([[1, 'Travel', 1]]) // refresh
        .mockResolvedValueOnce([[7]]) // count

      const { getUsageCount, refresh } = useTags()
      await refresh()

      expect(await getUsageCount(1)).toBe(7)
    })
  })

  describe('getRelocationStats', () => {
    it('should return unified RelocationStats with taglink count in transactions', async () => {
      mockExec
        .mockResolvedValueOnce([[1, 'Travel', 1]]) // refresh
        .mockResolvedValueOnce([[3]]) // getUsageCount

      const { getRelocationStats, refresh } = useTags()
      await refresh()

      const stats = await getRelocationStats(1)
      expect(stats).toEqual({
        transactions: 3,
        splitTransactions: 0,
        recurringTransactions: 0,
        budgets: 0,
        budgetSplits: 0,
        payeeDefaults: 0,
      })
    })
  })
})
