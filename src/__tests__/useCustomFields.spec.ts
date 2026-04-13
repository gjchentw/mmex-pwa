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

import { useCustomFields } from '../composables/useCustomFields'

describe('useCustomFields', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('refresh', () => {
    it('should load all field definitions from DB', async () => {
      const rows = [
        [1, 'Transaction', 'Invoice #', 'String', '{"regex":"^INV"}'],
        [2, 'Transaction', 'Priority', 'SingleChoice', '{"choices":["High","Low"]}'],
      ]
      mockExec.mockResolvedValueOnce(rows)

      const { fields, loading, refresh } = useCustomFields()
      const p = refresh()
      expect(loading.value).toBe(true)
      await p
      expect(loading.value).toBe(false)

      expect(fields.value).toHaveLength(2)
      expect(fields.value[0]).toEqual({
        FIELDID: 1,
        REFTYPE: 'Transaction',
        DESCRIPTION: 'Invoice #',
        TYPE: 'String',
        PROPERTIES: '{"regex":"^INV"}',
      })
    })
  })

  describe('create', () => {
    it('should insert a new field and return FIELDID', async () => {
      mockExec
        .mockResolvedValueOnce([]) // refresh
        .mockResolvedValueOnce([]) // INSERT
        .mockResolvedValueOnce([[3]]) // last_insert_rowid
        .mockResolvedValueOnce([]) // re-refresh

      const { create, refresh } = useCustomFields()
      await refresh()

      const id = await create({
        REFTYPE: 'Transaction',
        DESCRIPTION: 'Notes',
        TYPE: 'String',
        PROPERTIES: '{}',
      })
      expect(id).toBe(3)
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO CUSTOMFIELD_V1'),
        expect.arrayContaining(['Transaction', 'Notes', 'String', '{}']),
      )
    })
  })

  describe('update', () => {
    it('should update field definition', async () => {
      mockExec
        .mockResolvedValueOnce([[1, 'Transaction', 'Old', 'String', '{}']]) // refresh
        .mockResolvedValueOnce([]) // UPDATE
        .mockResolvedValueOnce([[1, 'Transaction', 'New', 'String', '{}']]) // re-refresh

      const { update, refresh } = useCustomFields()
      await refresh()

      await update({ FIELDID: 1, DESCRIPTION: 'New' })
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE CUSTOMFIELD_V1'),
        expect.any(Array),
      )
    })
  })

  describe('remove', () => {
    it('should delete field and cascade data', async () => {
      mockExec
        .mockResolvedValueOnce([[1, 'Transaction', 'Test', 'String', '{}']]) // refresh
      mockExecTransaction.mockResolvedValueOnce({ executed: 2 }) // DELETE cascade
      mockExec.mockResolvedValueOnce([]) // re-refresh

      const { remove, refresh } = useCustomFields()
      await refresh()

      await remove(1)
      expect(mockExecTransaction).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ sql: expect.stringContaining('DELETE FROM CUSTOMFIELDDATA_V1') }),
          expect.objectContaining({ sql: expect.stringContaining('DELETE FROM CUSTOMFIELD_V1') }),
        ]),
      )
    })
  })

  describe('getByRefType', () => {
    it('should filter fields by refType', async () => {
      mockExec.mockResolvedValueOnce([
        [1, 'Transaction', 'F1', 'String', '{}'],
        [2, 'Payee', 'F2', 'String', '{}'],
        [3, 'Transaction', 'F3', 'Integer', '{}'],
      ])

      const { getByRefType, refresh } = useCustomFields()
      await refresh()

      const result = getByRefType('Transaction')
      expect(result).toHaveLength(2)
      expect(result[0]!.DESCRIPTION).toBe('F1')
    })
  })

  describe('parseProperties', () => {
    it('should parse JSON properties string', () => {
      const { parseProperties } = useCustomFields()

      const result = parseProperties('{"regex":"^INV","choices":["A","B"]}')
      expect(result.regex).toBe('^INV')
      expect(result.choices).toEqual(['A', 'B'])
    })

    it('should return empty object for invalid JSON', () => {
      const { parseProperties } = useCustomFields()

      const result = parseProperties('invalid')
      expect(result).toEqual({})
    })
  })

  describe('getData', () => {
    it('should return field data for a record', async () => {
      mockExec
        .mockResolvedValueOnce([]) // refresh
        .mockResolvedValueOnce([
          [1, 10, 100, 'hello'],
          [2, 20, 100, null],
        ])

      const { getData, refresh } = useCustomFields()
      await refresh()

      const data = await getData('Transaction', 100)
      expect(data).toHaveLength(2)
      expect(data[0]).toEqual({
        FIELDATADID: 1,
        FIELDID: 10,
        REFID: 100,
        CONTENT: 'hello',
      })
    })
  })

  describe('saveData', () => {
    it('should upsert field data', async () => {
      mockExec
        .mockResolvedValueOnce([]) // refresh
        .mockResolvedValueOnce([]) // INSERT OR REPLACE

      const { saveData, refresh } = useCustomFields()
      await refresh()

      await saveData(10, 100, 'value')
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE'),
        expect.arrayContaining([10, 100, 'value']),
      )
    })
  })

  describe('deleteData', () => {
    it('should delete all field data for a record', async () => {
      mockExec
        .mockResolvedValueOnce([]) // refresh
        .mockResolvedValueOnce([]) // DELETE

      const { deleteData, refresh } = useCustomFields()
      await refresh()

      await deleteData('Transaction', 100)
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM CUSTOMFIELDDATA_V1'),
        expect.any(Array),
      )
    })
  })
})
