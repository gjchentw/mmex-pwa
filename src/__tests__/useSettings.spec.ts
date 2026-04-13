import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockExec } = vi.hoisted(() => ({
  mockExec: vi.fn(),
}))

vi.mock('../workers/db-client', () => ({
  dbClient: {
    exec: mockExec,
  },
}))

// Mock Quasar Dark plugin
vi.mock('quasar', () => ({
  Dark: { set: vi.fn() },
}))

import { useSettings } from '../composables/useSettings'

describe('useSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('refresh', () => {
    it('should load all settings from DB', async () => {
      const rows = [
        [1, 'LANGUAGE', 'en_US'],
        [2, 'THEME_MODE', 'dark'],
      ]
      mockExec.mockResolvedValueOnce(rows)

      const { settings, loading, refresh } = useSettings()
      const p = refresh()
      expect(loading.value).toBe(true)
      await p
      expect(loading.value).toBe(false)

      expect(settings.value.get('LANGUAGE')).toBe('en_US')
      expect(settings.value.get('THEME_MODE')).toBe('dark')
    })
  })

  describe('get', () => {
    it('should return setting value', async () => {
      mockExec.mockResolvedValueOnce([[1, 'LANGUAGE', 'zh_TW']])

      const { get, refresh } = useSettings()
      await refresh()

      expect(get('LANGUAGE')).toBe('zh_TW')
    })

    it('should return default value when key not found', async () => {
      mockExec.mockResolvedValueOnce([])

      const { get, refresh } = useSettings()
      await refresh()

      expect(get('MISSING', 'fallback')).toBe('fallback')
    })
  })

  describe('set', () => {
    it('should persist setting to DB', async () => {
      mockExec
        .mockResolvedValueOnce([]) // refresh
        .mockResolvedValueOnce([]) // INSERT OR REPLACE

      const { set, settings, refresh } = useSettings()
      await refresh()

      await set('LANGUAGE', 'en_US')
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE'),
        expect.arrayContaining(['LANGUAGE', 'en_US']),
      )
      expect(settings.value.get('LANGUAGE')).toBe('en_US')
    })
  })

  describe('remove', () => {
    it('should delete setting from DB', async () => {
      mockExec
        .mockResolvedValueOnce([[1, 'LANGUAGE', 'en_US']]) // refresh
        .mockResolvedValueOnce([]) // DELETE

      const { remove, settings, refresh } = useSettings()
      await refresh()

      await remove('LANGUAGE')
      expect(mockExec).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM SETTING_V1'),
        ['LANGUAGE'],
      )
      expect(settings.value.has('LANGUAGE')).toBe(false)
    })
  })

  describe('convenience getters', () => {
    it('should return language', async () => {
      mockExec.mockResolvedValueOnce([[1, 'LANGUAGE', 'zh_TW']])

      const { language, refresh } = useSettings()
      await refresh()

      expect(language.value).toBe('zh_TW')
    })

    it('should return dateFormat with default', async () => {
      mockExec.mockResolvedValueOnce([])

      const { dateFormat, refresh } = useSettings()
      await refresh()

      expect(dateFormat.value).toBe('%Y-%m-%d')
    })

    it('should return baseCurrencyId', async () => {
      mockExec.mockResolvedValueOnce([[1, 'BASECURRENCYID', '5']])

      const { baseCurrencyId, refresh } = useSettings()
      await refresh()

      expect(baseCurrencyId.value).toBe(5)
    })

    it('should return null for missing baseCurrencyId', async () => {
      mockExec.mockResolvedValueOnce([])

      const { baseCurrencyId, refresh } = useSettings()
      await refresh()

      expect(baseCurrencyId.value).toBeNull()
    })

    it('should return userName', async () => {
      mockExec.mockResolvedValueOnce([[1, 'USERNAME', 'Alice']])

      const { userName, refresh } = useSettings()
      await refresh()

      expect(userName.value).toBe('Alice')
    })

    it('should return themeMode with default auto', async () => {
      mockExec.mockResolvedValueOnce([])

      const { themeMode, refresh } = useSettings()
      await refresh()

      expect(themeMode.value).toBe('auto')
    })
  })
})
