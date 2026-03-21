import { ref, computed } from 'vue'
import { Dark } from 'quasar'
import { dbClient } from '@/workers/db-client'

export function useSettings() {
  const settings = ref<Map<string, string | null>>(new Map())
  const loading = ref(false)

  async function refresh(): Promise<void> {
    loading.value = true
    try {
      const rows = (await dbClient.exec(
        'SELECT SETTINGID, SETTINGNAME, SETTINGVALUE FROM SETTING_V1 ORDER BY SETTINGNAME',
      )) as unknown[][]
      const map = new Map<string, string | null>()
      for (const row of rows) {
        map.set(row[1] as string, row[2] as string | null)
      }
      settings.value = map
      applyTheme()
    } finally {
      loading.value = false
    }
  }

  function get(key: string, defaultValue?: string): string | null {
    return settings.value.get(key) ?? defaultValue ?? null
  }

  async function set(key: string, value: string): Promise<void> {
    await dbClient.exec(
      `INSERT OR REPLACE INTO SETTING_V1 (SETTINGNAME, SETTINGVALUE)
       VALUES (?, ?)`,
      [key, value],
    )
    settings.value.set(key, value)
    // Trigger reactivity
    settings.value = new Map(settings.value)
    if (key === 'THEME_MODE') applyTheme()
  }

  async function remove(key: string): Promise<void> {
    await dbClient.exec('DELETE FROM SETTING_V1 WHERE SETTINGNAME = ?', [key])
    settings.value.delete(key)
    settings.value = new Map(settings.value)
  }

  function applyTheme() {
    const mode = get('THEME_MODE', 'auto')
    if (mode === 'dark') {
      Dark.set(true)
    } else if (mode === 'light') {
      Dark.set(false)
    } else {
      Dark.set('auto')
    }
  }

  const language = computed(() => get('LANGUAGE', 'en_US') ?? 'en_US')
  const dateFormat = computed(() => get('DATEFORMAT', '%Y-%m-%d') ?? '%Y-%m-%d')
  const baseCurrencyId = computed(() => {
    const val = get('BASECURRENCYID')
    return val ? parseInt(val, 10) : null
  })
  const userName = computed(() => get('USERNAME', '') ?? '')
  const themeMode = computed(() => (get('THEME_MODE', 'auto') ?? 'auto') as 'light' | 'dark' | 'auto')

  return {
    settings,
    loading,
    refresh,
    get,
    set,
    remove,
    language,
    dateFormat,
    baseCurrencyId,
    userName,
    themeMode,
  }
}
