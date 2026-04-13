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

import { usePayees } from '../composables/usePayees'

describe('usePayees', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('refresh', () => {
    it('should load all payees from DB', async () => {
      const rows = [
        [1, 'Supermarket', null, '', '', '', 1, ''],
        [2, 'Employer', null, '', '', '', 1, ''],
      ]
      mockExec.mockResolvedValueOnce(rows)

      const { payees, loading, refresh } = usePayees()
      const p = refresh()
      expect(loading.value).toBe(true)
      await p
      expect(loading.value).toBe(false)

      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('SELECT'))
      expect(payees.value).toHaveLength(2)
      expect(payees.value[0]).toEqual({
        PAYEEID: 1,
        PAYEENAME: 'Supermarket',
        CATEGID: null,
        NUMBER: '',
        WEBSITE: '',
        NOTES: '',
        ACTIVE: 1,
        PATTERN: '',
      })
    })
  })

  describe('create', () => {
    it('should insert a new payee and return PAYEEID', async () => {
      mockExec
        .mockResolvedValueOnce([]) // refresh
        .mockResolvedValueOnce([]) // duplicate check
        .mockResolvedValueOnce([]) // INSERT
        .mockResolvedValueOnce([[10]]) // last_insert_rowid
        .mockResolvedValueOnce([]) // re-refresh

      const { create, refresh } = usePayees()
      await refresh()

      const id = await create('NewPayee')
      expect(id).toBe(10)
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO PAYEE_V1'),
        expect.arrayContaining(['NewPayee']),
      )
    })

    it('should reject duplicate payee name', async () => {
      mockExec
        .mockResolvedValueOnce([[1, 'Supermarket', null, '', '', '', 1, '']]) // refresh
        .mockResolvedValueOnce([[1]]) // duplicate check returns existing

      const { create, refresh } = usePayees()
      await refresh()

      await expect(create('Supermarket')).rejects.toThrow()
    })
  })

  describe('update', () => {
    it('should update payee fields', async () => {
      mockExec
        .mockResolvedValueOnce([[1, 'Supermarket', null, '', '', '', 1, '']]) // refresh
        .mockResolvedValueOnce([]) // UPDATE
        .mockResolvedValueOnce([[1, 'Market', 5, '', '', '', 1, '']]) // re-refresh

      const { update, refresh } = usePayees()
      await refresh()

      await update({ PAYEEID: 1, PAYEENAME: 'Market', CATEGID: 5 })
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE PAYEE_V1'),
        expect.any(Array),
      )
    })
  })

  describe('remove', () => {
    it('should delete unused payee', async () => {
      mockExec
        .mockResolvedValueOnce([[1, 'Supermarket', null, '', '', '', 1, '']]) // refresh
        .mockResolvedValueOnce([[0]]) // isUsed check
        .mockResolvedValueOnce([]) // DELETE
        .mockResolvedValueOnce([]) // re-refresh

      const { remove, refresh } = usePayees()
      await refresh()

      await remove(1)
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM PAYEE_V1'),
        [1],
      )
    })

    it('should reject deletion of payee in use', async () => {
      mockExec
        .mockResolvedValueOnce([[1, 'Supermarket', null, '', '', '', 1, '']]) // refresh
        .mockResolvedValueOnce([[3]]) // isUsed returns count > 0

      const { remove, refresh } = usePayees()
      await refresh()

      await expect(remove(1)).rejects.toThrow()
    })
  })

  describe('toggleActive', () => {
    it('should toggle active to hidden', async () => {
      mockExec
        .mockResolvedValueOnce([[1, 'Supermarket', null, '', '', '', 1, '']]) // refresh
        .mockResolvedValueOnce([]) // UPDATE
        .mockResolvedValueOnce([[1, 'Supermarket', null, '', '', '', 0, '']]) // re-refresh

      const { toggleActive, refresh } = usePayees()
      await refresh()

      await toggleActive(1)
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE PAYEE_V1 SET ACTIVE'),
        expect.arrayContaining([1]),
      )
    })
  })

  describe('isUsed', () => {
    it('should return true when payee is referenced', async () => {
      mockExec
        .mockResolvedValueOnce([[1, 'Supermarket', null, '', '', '', 1, '']]) // refresh
        .mockResolvedValueOnce([[5]]) // usage count

      const { isUsed, refresh } = usePayees()
      await refresh()

      expect(await isUsed(1)).toBe(true)
    })

    it('should return false when payee is not referenced', async () => {
      mockExec
        .mockResolvedValueOnce([[1, 'Supermarket', null, '', '', '', 1, '']]) // refresh
        .mockResolvedValueOnce([[0]]) // usage count

      const { isUsed, refresh } = usePayees()
      await refresh()

      expect(await isUsed(1)).toBe(false)
    })
  })

  describe('pattern management', () => {
    it('should store pattern field on update', async () => {
      const patterns = 'SUPERMARKET.*\nSUPER\\s+MARKET'
      mockExec
        .mockResolvedValueOnce([[1, 'Supermarket', null, '', '', '', 1, '']]) // refresh
        .mockResolvedValueOnce([]) // UPDATE
        .mockResolvedValueOnce([[1, 'Supermarket', null, '', '', '', 1, patterns]]) // re-refresh

      const { update, refresh, payees } = usePayees()
      await refresh()

      await update({ PAYEEID: 1, PATTERN: patterns })
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('PATTERN'),
        expect.arrayContaining([patterns]),
      )
      expect(payees.value[0]!.PATTERN).toBe(patterns)
    })
  })
})
