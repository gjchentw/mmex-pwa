import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick } from 'vue'

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

describe('useCategories', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('refresh', () => {
    it('should load all categories from DB', async () => {
      const rows = [
        [1, 'Food', 1, -1],
        [2, 'Income', 1, -1],
        [3, 'Groceries', 1, 1],
      ]
      mockExec.mockResolvedValueOnce(rows)

      const { categories, loading, refresh } = useCategories()
      const p = refresh()
      expect(loading.value).toBe(true)
      await p
      expect(loading.value).toBe(false)

      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
      )
      expect(categories.value).toHaveLength(3)
      expect(categories.value[0]).toEqual({
        CATEGID: 1,
        CATEGNAME: 'Food',
        ACTIVE: 1,
        PARENTID: -1,
      })
    })
  })

  describe('tree', () => {
    it('should build tree from flat list', async () => {
      mockExec.mockResolvedValueOnce([
        [1, 'Food', 1, -1],
        [2, 'Groceries', 1, 1],
        [3, 'Dining', 1, 1],
        [4, 'Income', 1, -1],
      ])

      const { tree, refresh } = useCategories()
      await refresh()
      await nextTick()

      // Root nodes
      expect(tree.value).toHaveLength(2)
      expect(tree.value[0]!.label).toBe('Food')
      expect(tree.value[0]!.children).toHaveLength(2)
      expect(tree.value[0]!.children[0]!.label).toBe('Groceries')
      expect(tree.value[1]!.label).toBe('Income')
      expect(tree.value[1]!.children).toHaveLength(0)
    })
  })

  describe('create', () => {
    it('should insert a new category and return CATEGID', async () => {
      mockExec
        .mockResolvedValueOnce([]) // refresh
        .mockResolvedValueOnce([]) // duplicate check
        .mockResolvedValueOnce([]) // INSERT
        .mockResolvedValueOnce([[42]]) // last_insert_rowid
        .mockResolvedValueOnce([]) // re-refresh

      const { create, refresh } = useCategories()
      await refresh()

      const id = await create('Food', -1)
      expect(id).toBe(42)
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO CATEGORY_V1'),
        expect.arrayContaining(['Food', -1]),
      )
    })

    it('should reject duplicate name under same parent', async () => {
      mockExec
        .mockResolvedValueOnce([[1, 'Food', 1, -1]]) // refresh
        .mockResolvedValueOnce([[1]]) // duplicate check returns existing

      const { create, refresh } = useCategories()
      await refresh()

      await expect(create('Food', -1)).rejects.toThrow()
    })
  })

  describe('rename', () => {
    it('should update category name', async () => {
      mockExec
        .mockResolvedValueOnce([[1, 'Food', 1, -1]]) // refresh
        .mockResolvedValueOnce([]) // duplicate check
        .mockResolvedValueOnce([]) // UPDATE
        .mockResolvedValueOnce([[1, 'Meals', 1, -1]]) // re-refresh

      const { rename, refresh } = useCategories()
      await refresh()

      await rename(1, 'Meals')
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE CATEGORY_V1'),
        expect.arrayContaining(['Meals', 1]),
      )
    })
  })

  describe('remove', () => {
    it('should delete unused category without children', async () => {
      mockExec
        .mockResolvedValueOnce([[1, 'Food', 1, -1]]) // refresh
        .mockResolvedValueOnce([[0]]) // isUsed check (0 = not used)
        .mockResolvedValueOnce([]) // DELETE
        .mockResolvedValueOnce([]) // re-refresh

      const { remove, refresh } = useCategories()
      await refresh()

      await remove(1)
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM CATEGORY_V1'),
        [1],
      )
    })

    it('should reject deletion of category with children', async () => {
      mockExec.mockResolvedValueOnce([
        [1, 'Food', 1, -1],
        [2, 'Groceries', 1, 1],
      ]) // refresh

      const { remove, refresh } = useCategories()
      await refresh()

      await expect(remove(1)).rejects.toThrow()
    })

    it('should reject deletion of category in use', async () => {
      mockExec
        .mockResolvedValueOnce([[1, 'Food', 1, -1]]) // refresh
        .mockResolvedValueOnce([[5]]) // isUsed returns count > 0

      const { remove, refresh } = useCategories()
      await refresh()

      await expect(remove(1)).rejects.toThrow()
    })
  })

  describe('toggleActive', () => {
    it('should toggle active to hidden', async () => {
      mockExec
        .mockResolvedValueOnce([[1, 'Food', 1, -1]]) // refresh
        .mockResolvedValueOnce([]) // UPDATE
        .mockResolvedValueOnce([[1, 'Food', 0, -1]]) // re-refresh

      const { toggleActive, refresh } = useCategories()
      await refresh()

      await toggleActive(1)
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE CATEGORY_V1 SET ACTIVE'),
        expect.arrayContaining([1]),
      )
    })
  })

  describe('isUsed', () => {
    it('should return true when category is referenced', async () => {
      mockExec
        .mockResolvedValueOnce([[1, 'Food', 1, -1]]) // refresh
        .mockResolvedValueOnce([[3]]) // usage count

      const { isUsed, refresh } = useCategories()
      await refresh()

      expect(await isUsed(1)).toBe(true)
    })

    it('should return false when category is not referenced', async () => {
      mockExec
        .mockResolvedValueOnce([[1, 'Food', 1, -1]]) // refresh
        .mockResolvedValueOnce([[0]]) // usage count

      const { isUsed, refresh } = useCategories()
      await refresh()

      expect(await isUsed(1)).toBe(false)
    })
  })

  describe('hasChildren', () => {
    it('should return true for parent category', async () => {
      mockExec.mockResolvedValueOnce([
        [1, 'Food', 1, -1],
        [2, 'Groceries', 1, 1],
      ])

      const { hasChildren, refresh } = useCategories()
      await refresh()

      expect(hasChildren(1)).toBe(true)
    })

    it('should return false for leaf category', async () => {
      mockExec.mockResolvedValueOnce([
        [1, 'Food', 1, -1],
        [2, 'Groceries', 1, 1],
      ])

      const { hasChildren, refresh } = useCategories()
      await refresh()

      expect(hasChildren(2)).toBe(false)
    })
  })

  describe('fullName', () => {
    it('should return colon-separated path', async () => {
      mockExec.mockResolvedValueOnce([
        [1, 'Food', 1, -1],
        [2, 'Groceries', 1, 1],
        [3, 'Organic', 1, 2],
      ])

      const { fullName, refresh } = useCategories()
      await refresh()

      expect(fullName(3)).toBe('Food:Groceries:Organic')
      expect(fullName(1)).toBe('Food')
    })

    it('should return empty string for unknown ID', async () => {
      mockExec.mockResolvedValueOnce([])

      const { fullName, refresh } = useCategories()
      await refresh()

      expect(fullName(999)).toBe('')
    })
  })
})
