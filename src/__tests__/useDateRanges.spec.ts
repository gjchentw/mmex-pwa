import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockExec } = vi.hoisted(() => ({
  mockExec: vi.fn(),
}))

vi.mock('../workers/db-client', () => ({
  dbClient: {
    exec: mockExec,
  },
}))

vi.mock('quasar', () => ({
  Dark: { set: vi.fn() },
}))

import { useDateRanges } from '../composables/useDateRanges'

describe('useDateRanges', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('resolve', () => {
    const referenceDate = new Date(2026, 2, 19) // 2026-03-19

    it('should resolve M to current month', () => {
      const { resolve } = useDateRanges()
      const result = resolve('M', referenceDate)
      expect(result.start).toEqual(new Date(2026, 2, 1))
      expect(result.end).toEqual(new Date(2026, 2, 31))
    })

    it('should resolve M-1 to previous month', () => {
      const { resolve } = useDateRanges()
      const result = resolve('M-1', referenceDate)
      expect(result.start).toEqual(new Date(2026, 1, 1))
      expect(result.end).toEqual(new Date(2026, 1, 28))
    })

    it('should resolve Q to current quarter', () => {
      const { resolve } = useDateRanges()
      const result = resolve('Q', referenceDate)
      expect(result.start).toEqual(new Date(2026, 0, 1))
      expect(result.end).toEqual(new Date(2026, 2, 31))
    })

    it('should resolve Q-1 to previous quarter', () => {
      const { resolve } = useDateRanges()
      const result = resolve('Q-1', referenceDate)
      // Previous quarter from Q1 2026 is Q4 2025
      expect(result.start).toEqual(new Date(2025, 9, 1))
      expect(result.end).toEqual(new Date(2025, 11, 31))
    })

    it('should resolve Y to current year', () => {
      const { resolve } = useDateRanges()
      const result = resolve('Y', referenceDate)
      expect(result.start).toEqual(new Date(2026, 0, 1))
      expect(result.end).toEqual(new Date(2026, 11, 31))
    })

    it('should resolve Y-1 to previous year', () => {
      const { resolve } = useDateRanges()
      const result = resolve('Y-1', referenceDate)
      expect(result.start).toEqual(new Date(2025, 0, 1))
      expect(result.end).toEqual(new Date(2025, 11, 31))
    })

    it('should handle year boundary for M-1 in January', () => {
      const { resolve } = useDateRanges()
      const jan = new Date(2026, 0, 15) // January
      const result = resolve('M-1', jan)
      expect(result.start).toEqual(new Date(2025, 11, 1))
      expect(result.end).toEqual(new Date(2025, 11, 31))
    })
  })

  describe('CRUD operations', () => {
    it('should load ranges from settings', async () => {
      mockExec.mockResolvedValueOnce([
        [1, 'DATE_RANGES', JSON.stringify([
          { label: 'This Month', spec: 'M', isDefault: true, sortOrder: 0 },
        ])],
      ])

      const { ranges, refresh } = useDateRanges()
      await refresh()

      expect(ranges.value).toHaveLength(1)
      expect(ranges.value[0]!.label).toBe('This Month')
    })

    it('should create a new range', async () => {
      mockExec
        .mockResolvedValueOnce([]) // refresh (no settings)
        .mockResolvedValueOnce([]) // save

      const { ranges, create, refresh } = useDateRanges()
      await refresh()

      await create({ label: 'Last Month', spec: 'M-1', isDefault: false })
      expect(ranges.value).toHaveLength(1)
      expect(ranges.value[0]!.label).toBe('Last Month')
    })

    it('should remove a range', async () => {
      mockExec
        .mockResolvedValueOnce([
          [1, 'DATE_RANGES', JSON.stringify([
            { label: 'A', spec: 'M', isDefault: false, sortOrder: 0 },
            { label: 'B', spec: 'Y', isDefault: false, sortOrder: 1 },
          ])],
        ])
        .mockResolvedValueOnce([]) // save

      const { ranges, remove, refresh } = useDateRanges()
      await refresh()

      await remove(0)
      expect(ranges.value).toHaveLength(1)
      expect(ranges.value[0]!.label).toBe('B')
    })

    it('should reorder ranges', async () => {
      mockExec
        .mockResolvedValueOnce([
          [1, 'DATE_RANGES', JSON.stringify([
            { label: 'A', spec: 'M', isDefault: false, sortOrder: 0 },
            { label: 'B', spec: 'Y', isDefault: false, sortOrder: 1 },
            { label: 'C', spec: 'Q', isDefault: false, sortOrder: 2 },
          ])],
        ])
        .mockResolvedValueOnce([]) // save

      const { ranges, reorder, refresh } = useDateRanges()
      await refresh()

      await reorder(2, 0) // Move C to position 0
      expect(ranges.value[0]!.label).toBe('C')
      expect(ranges.value[1]!.label).toBe('A')
      expect(ranges.value[2]!.label).toBe('B')
    })

    it('should set default', async () => {
      mockExec
        .mockResolvedValueOnce([
          [1, 'DATE_RANGES', JSON.stringify([
            { label: 'A', spec: 'M', isDefault: true, sortOrder: 0 },
            { label: 'B', spec: 'Y', isDefault: false, sortOrder: 1 },
          ])],
        ])
        .mockResolvedValueOnce([]) // save

      const { ranges, setDefault, refresh } = useDateRanges()
      await refresh()

      await setDefault(1)
      expect(ranges.value[0]!.isDefault).toBe(false)
      expect(ranges.value[1]!.isDefault).toBe(true)
    })
  })
})
