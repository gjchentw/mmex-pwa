import { ref } from 'vue'
import { dbClient } from '@/workers/db-client'
import type { DateRangeSpec, ResolvedDateRange } from '@/types/entities'

const DATE_RANGES_KEY = 'DATE_RANGES'

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

export function useDateRanges() {
  const ranges = ref<DateRangeSpec[]>([])
  const loading = ref(false)

  async function refresh(): Promise<void> {
    loading.value = true
    try {
      const rows = (await dbClient.exec(
        'SELECT SETTINGID, SETTINGNAME, SETTINGVALUE FROM SETTING_V1 WHERE SETTINGNAME = ?',
        [DATE_RANGES_KEY],
      )) as unknown[][]
      if (rows.length > 0 && rows[0]) {
        try {
          ranges.value = JSON.parse(rows[0][2] as string) as DateRangeSpec[]
        } catch {
          ranges.value = []
        }
      } else {
        ranges.value = []
      }
    } finally {
      loading.value = false
    }
  }

  async function save(): Promise<void> {
    await dbClient.exec(
      `INSERT OR REPLACE INTO SETTING_V1 (SETTINGNAME, SETTINGVALUE) VALUES (?, ?)`,
      [DATE_RANGES_KEY, JSON.stringify(ranges.value)],
    )
  }

  async function create(spec: Omit<DateRangeSpec, 'sortOrder'>): Promise<void> {
    ranges.value.push({
      ...spec,
      sortOrder: ranges.value.length,
    })
    await save()
  }

  async function update(index: number, partial: Partial<DateRangeSpec>): Promise<void> {
    if (index < 0 || index >= ranges.value.length) return
    ranges.value[index] = { ...ranges.value[index]!, ...partial }
    await save()
  }

  async function remove(index: number): Promise<void> {
    ranges.value.splice(index, 1)
    // Re-number sortOrder
    ranges.value.forEach((r, i) => (r.sortOrder = i))
    await save()
  }

  async function reorder(fromIndex: number, toIndex: number): Promise<void> {
    const item = ranges.value.splice(fromIndex, 1)[0]!
    ranges.value.splice(toIndex, 0, item)
    ranges.value.forEach((r, i) => (r.sortOrder = i))
    await save()
  }

  async function setDefault(index: number): Promise<void> {
    ranges.value.forEach((r, i) => (r.isDefault = i === index))
    await save()
  }

  function resolve(spec: string, referenceDate?: Date): ResolvedDateRange {
    const ref = referenceDate ?? new Date()
    const year = ref.getFullYear()
    const month = ref.getMonth()

    const match = spec.match(/^([MQY])(?:([+-])(\d+))?$/)
    if (!match) {
      return { start: ref, end: ref }
    }

    const period = match[1]!
    const sign = match[2] === '-' ? -1 : match[2] === '+' ? 1 : 0
    const offset = match[3] ? parseInt(match[3], 10) * sign : 0

    if (period === 'M') {
      const targetMonth = month + offset
      const targetDate = new Date(year, targetMonth, 1)
      const y = targetDate.getFullYear()
      const m = targetDate.getMonth()
      return {
        start: new Date(y, m, 1),
        end: new Date(y, m, lastDayOfMonth(y, m)),
      }
    }

    if (period === 'Q') {
      const currentQuarter = Math.floor(month / 3)
      const targetQuarter = currentQuarter + offset
      const targetDate = new Date(year, targetQuarter * 3, 1)
      const y = targetDate.getFullYear()
      const qStartMonth = targetDate.getMonth()
      const qEndMonth = qStartMonth + 2
      return {
        start: new Date(y, qStartMonth, 1),
        end: new Date(y, qEndMonth, lastDayOfMonth(y, qEndMonth)),
      }
    }

    if (period === 'Y') {
      const targetYear = year + offset
      return {
        start: new Date(targetYear, 0, 1),
        end: new Date(targetYear, 11, 31),
      }
    }

    return { start: ref, end: ref }
  }

  return {
    ranges,
    loading,
    refresh,
    create,
    update,
    remove,
    reorder,
    setDefault,
    resolve,
  }
}
