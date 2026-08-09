import { describe, it, expect } from 'vitest'
import {
  NONE_ID,
  REFTYPE,
  daysBetween,
  enumCodec,
  formatIsoDate,
  formatIsoTimestamp,
  formatUtcTimestamp,
  isNone,
  isoDatePart,
  namesEqual,
  parseIsoDateTime,
} from '../../domain/conventions'

// Spec: domain-data-conventions.
describe('domain conventions', () => {
  // Requirement "Polymorphic Reference Vocabulary", scenario "Link rows carry
  // the exact upstream strings". The DDL comments are stale here, so the values
  // are pinned to what Model.cpp actually persists.
  it('pins the reference-type vocabulary to the upstream strings', () => {
    expect(Object.values(REFTYPE)).toEqual([
      'Transaction',
      'Stock',
      'Asset',
      'BankAccount',
      'RecurringTransaction',
      'Payee',
      'TransactionSplit',
      'RecurringTransactionSplit',
    ])
  })

  // Requirement "Identifier and Sentinel Conventions", scenario "Sentinel is not
  // an integrity error".
  it('treats -1 and absent values as the none sentinel', () => {
    expect(isNone(NONE_ID)).toBe(true)
    expect(isNone(null)).toBe(true)
    expect(isNone(undefined)).toBe(true)
    expect(isNone(0)).toBe(false)
    expect(isNone(7)).toBe(false)
  })

  // Requirement "Date and Timestamp Encoding", scenario "New timestamps use the
  // combined form".
  it('writes timestamps in the combined form', () => {
    const date = new Date(2026, 7, 9, 14, 5, 3)
    expect(formatIsoDate(date)).toBe('2026-08-09')
    expect(formatIsoTimestamp(date)).toBe('2026-08-09T14:05:03')
    expect(formatIsoTimestamp(date)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)
  })

  it('stamps audit timestamps in UTC, as upstream does', () => {
    const date = new Date(Date.UTC(2026, 7, 9, 6, 30, 0))
    expect(formatUtcTimestamp(date)).toBe('2026-08-09T06:30:00')
  })

  // Requirement "Date and Timestamp Encoding", scenario "Legacy date-only values
  // are readable".
  it('parses both the date-only and combined forms', () => {
    const dateOnly = parseIsoDateTime('2019-05-04')
    expect(dateOnly).not.toBeNull()
    expect(dateOnly!.getFullYear()).toBe(2019)
    expect(dateOnly!.getMonth()).toBe(4)
    expect(dateOnly!.getDate()).toBe(4)
    expect(dateOnly!.getHours()).toBe(0)

    const combined = parseIsoDateTime('2019-05-04T13:45:07')
    expect(combined!.getHours()).toBe(13)
    expect(combined!.getMinutes()).toBe(45)
    expect(combined!.getSeconds()).toBe(7)

    expect(parseIsoDateTime('')).toBeNull()
    expect(parseIsoDateTime(null)).toBeNull()
    expect(parseIsoDateTime('not a date')).toBeNull()
  })

  it('extracts the date part of either stored form for comparison', () => {
    expect(isoDatePart('2026-08-09T00:00:00')).toBe('2026-08-09')
    expect(isoDatePart('2026-08-09')).toBe('2026-08-09')
    expect(isoDatePart(null)).toBe('')
  })

  it('counts whole days between dates regardless of time of day', () => {
    expect(daysBetween(new Date(2026, 0, 1, 23, 59), new Date(2026, 0, 2, 0, 1))).toBe(1)
    expect(daysBetween(new Date(2026, 0, 1), new Date(2026, 0, 1))).toBe(0)
    expect(daysBetween(new Date(2026, 0, 10), new Date(2026, 0, 1))).toBe(-9)
  })

  // Requirement "Case-Insensitive Name Uniqueness", scenario "Same name with
  // different case is a duplicate".
  it('compares names case-insensitively', () => {
    expect(namesEqual('Grocery', 'GROCERY')).toBe(true)
    expect(namesEqual('Grocery', 'grocery')).toBe(true)
    expect(namesEqual('Grocery', 'Groceries')).toBe(false)
    expect(namesEqual(null, '')).toBe(true)
  })

  // Requirement "Persisted Enumeration Discipline", scenario "Locale switch
  // never rewrites persisted values".
  describe('enum codec', () => {
    const codec = enumCodec(['Open', 'Closed'] as const, 'Closed')

    it('round-trips known values and falls back on unknown ones', () => {
      expect(codec.decode('Open')).toBe('Open')
      expect(codec.decode('open')).toBe('Open')
      expect(codec.decode('Eröffnet')).toBe('Closed')
      expect(codec.decode(null)).toBe('Closed')
    })

    it('encodes to the upstream English string, never a localized label', () => {
      expect(codec.encode('Open')).toBe('Open')
      expect(codec.ordinal('Open')).toBe(0)
      expect(codec.fromOrdinal(1)).toBe('Closed')
    })
  })
})
