import { describe, it, expect } from 'vitest'
import type { ScheduledRecord } from '../../domain/records'
import {
  AUTO_EXECUTE,
  REPEAT_TYPE,
  advanceSeries,
  decodeRepeats,
  effectiveAutoExecute,
  encodeRepeats,
  isLegacyInactive,
  nextOccurrenceDate,
  projectOccurrences,
} from '../../domain/rules/scheduled'

const series = (overrides: Partial<ScheduledRecord> = {}): ScheduledRecord => ({
  BDID: 1,
  ACCOUNTID: 10,
  TOACCOUNTID: null,
  PAYEEID: 5,
  TRANSCODE: 'Withdrawal',
  TRANSAMOUNT: 100,
  STATUS: '',
  TRANSACTIONNUMBER: null,
  NOTES: null,
  CATEGID: 3,
  TRANSDATE: '2026-08-09T00:00:00',
  FOLLOWUPID: null,
  TOTRANSAMOUNT: null,
  REPEATS: REPEAT_TYPE.monthly,
  NEXTOCCURRENCEDATE: '2026-08-09T00:00:00',
  NUMOCCURRENCES: -1,
  COLOR: -1,
  ...overrides,
})

// Spec: scheduled-transactions.
describe('scheduled rules', () => {
  // Requirement "Repeat Encoding", scenario "Encoding round-trips".
  describe('repeat encoding', () => {
    it('multiplexes the auto-execute mode above the repeat type', () => {
      expect(
        encodeRepeats({ repeatType: REPEAT_TYPE.monthly, autoExecute: AUTO_EXECUTE.silent }),
      ).toBe(203)
      expect(decodeRepeats(203)).toEqual({ repeatType: 3, autoExecute: 2 })
      expect(decodeRepeats(0)).toEqual({ repeatType: 0, autoExecute: 0 })
      expect(decodeRepeats(null)).toEqual({ repeatType: 0, autoExecute: 0 })
      expect(decodeRepeats(116)).toEqual({ repeatType: 16, autoExecute: 1 })
    })
  })

  // Requirement "Repeat Types".
  describe('next occurrence date', () => {
    const from = new Date(2026, 7, 9) // Sunday 2026-08-09

    it('advances by the period of each simple type', () => {
      expect(nextOccurrenceDate(REPEAT_TYPE.daily, 0, from)).toEqual(new Date(2026, 7, 10))
      expect(nextOccurrenceDate(REPEAT_TYPE.weekly, 0, from)).toEqual(new Date(2026, 7, 16))
      expect(nextOccurrenceDate(REPEAT_TYPE.fortnightly, 0, from)).toEqual(new Date(2026, 7, 23))
      expect(nextOccurrenceDate(REPEAT_TYPE.fourWeeks, 0, from)).toEqual(new Date(2026, 8, 6))
      expect(nextOccurrenceDate(REPEAT_TYPE.monthly, 0, from)).toEqual(new Date(2026, 8, 9))
      expect(nextOccurrenceDate(REPEAT_TYPE.quarterly, 0, from)).toEqual(new Date(2026, 10, 9))
      expect(nextOccurrenceDate(REPEAT_TYPE.fourMonths, 0, from)).toEqual(new Date(2026, 11, 9))
      expect(nextOccurrenceDate(REPEAT_TYPE.halfYearly, 0, from)).toEqual(new Date(2027, 1, 9))
      expect(nextOccurrenceDate(REPEAT_TYPE.yearly, 0, from)).toEqual(new Date(2027, 7, 9))
    })

    it('does not advance a once series', () => {
      expect(nextOccurrenceDate(REPEAT_TYPE.once, 0, from)).toEqual(from)
    })

    it('reads the (n) parameter for the in-x and every-x types', () => {
      expect(nextOccurrenceDate(REPEAT_TYPE.inXDays, 5, from)).toEqual(new Date(2026, 7, 14))
      expect(nextOccurrenceDate(REPEAT_TYPE.everyXDays, 3, from)).toEqual(new Date(2026, 7, 12))
      expect(nextOccurrenceDate(REPEAT_TYPE.inXMonths, 2, from)).toEqual(new Date(2026, 9, 9))
      expect(nextOccurrenceDate(REPEAT_TYPE.everyXMonths, 4, from)).toEqual(new Date(2026, 11, 9))
    })

    it('snaps the last-day type to the end of the following month', () => {
      const january = new Date(2026, 0, 15)
      expect(nextOccurrenceDate(REPEAT_TYPE.monthlyLastDay, 0, january)).toEqual(
        new Date(2026, 1, 28),
      )
    })

    // Scenario "Last business day snaps off the weekend": 2026-02-28 is a
    // Saturday, so the business-day variant steps back to Friday the 27th.
    it('steps the last-business-day type back off a weekend', () => {
      const january = new Date(2026, 0, 15)
      const result = nextOccurrenceDate(REPEAT_TYPE.monthlyLastBusinessDay, 0, january)
      expect(result).toEqual(new Date(2026, 1, 27))
      expect(result.getDay()).toBe(5)
    })
  })

  // Requirement "Occurrence Count Semantics", scenario "Legacy inactive series
  // is quarantined".
  describe('occurrence counting', () => {
    it('quarantines in-x series whose count is not positive', () => {
      const legacy = series({ REPEATS: REPEAT_TYPE.inXDays, NUMOCCURRENCES: 0 })
      expect(isLegacyInactive(legacy)).toBe(true)
      expect(
        effectiveAutoExecute(series({ REPEATS: 200 + REPEAT_TYPE.inXDays, NUMOCCURRENCES: 0 })),
      ).toBe(AUTO_EXECUTE.none)
    })

    it('leaves an ordinary infinite series active', () => {
      expect(isLegacyInactive(series({ NUMOCCURRENCES: -1 }))).toBe(false)
    })
  })

  // Requirement "Series Advancement on Execute or Skip".
  describe('advancement', () => {
    it('advances both dates and decrements a countable series', () => {
      const { series: advanced, exhausted } = advanceSeries(
        series({
          NUMOCCURRENCES: 3,
          TRANSDATE: '2026-08-09T00:00:00',
          NEXTOCCURRENCEDATE: '2026-08-09T00:00:00',
        }),
      )
      expect(exhausted).toBe(false)
      expect(advanced!.NEXTOCCURRENCEDATE).toBe('2026-09-09T00:00:00')
      expect(advanced!.TRANSDATE).toBe('2026-09-09T00:00:00')
      expect(advanced!.NUMOCCURRENCES).toBe(2)
    })

    it('leaves an infinite series' + ' count untouched', () => {
      const { series: advanced } = advanceSeries(series({ NUMOCCURRENCES: -1 }))
      expect(advanced!.NUMOCCURRENCES).toBe(-1)
    })

    // Scenario "Countdown reaches zero".
    it('exhausts a countable series on its last payment', () => {
      expect(advanceSeries(series({ NUMOCCURRENCES: 1 }))).toEqual({
        series: null,
        exhausted: true,
      })
    })

    it('exhausts a once series', () => {
      expect(advanceSeries(series({ REPEATS: REPEAT_TYPE.once }))).toEqual({
        series: null,
        exhausted: true,
      })
    })

    it('converts an in-x series to once while keeping its auto-execute mode', () => {
      const { series: advanced } = advanceSeries(
        series({ REPEATS: 200 + REPEAT_TYPE.inXDays, NUMOCCURRENCES: 5 }),
      )
      expect(decodeRepeats(advanced!.REPEATS)).toEqual({
        repeatType: REPEAT_TYPE.once,
        autoExecute: AUTO_EXECUTE.silent,
      })
      expect(advanced!.NUMOCCURRENCES).toBe(-1)
    })
  })

  // Requirement "Future Occurrence Projection", scenario "Infinite series
  // projects within the horizon only".
  describe('projection', () => {
    it('bounds an infinite series by the horizon', () => {
      const projected = projectOccurrences(series({ NUMOCCURRENCES: -1 }), {
        untilDate: '2026-12-31',
      })
      expect(projected).toHaveLength(5)
      expect(projected[0]!.repeatNumber).toBe(1)
      expect(projected[0]!.date.slice(0, 10)).toBe('2026-08-09')
      expect(projected.at(-1)!.date.slice(0, 10)).toBe('2026-12-09')
    })

    it('honours an explicit occurrence cap', () => {
      const projected = projectOccurrences(series({ NUMOCCURRENCES: -1 }), {
        untilDate: '2030-12-31',
        maxOccurrences: 3,
      })
      expect(projected).toHaveLength(3)
    })

    it('stops after the remaining payments of a countable series', () => {
      const projected = projectOccurrences(series({ NUMOCCURRENCES: 2 }), {
        untilDate: '2027-12-31',
      })
      expect(projected).toHaveLength(2)
    })

    it('projects a once series exactly once', () => {
      const projected = projectOccurrences(series({ REPEATS: REPEAT_TYPE.once }), {
        untilDate: '2027-12-31',
      })
      expect(projected).toHaveLength(1)
    })
  })
})
