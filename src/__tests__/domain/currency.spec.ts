import { describe, it, expect } from 'vitest'
import type { CurrencyRecord } from '../../domain/records'
import {
  currencyPrecision,
  formatAmount,
  parseAmount,
  precisionFromScale,
  resolveDayRate,
} from '../../domain/rules/currency'

const currency = (overrides: Partial<CurrencyRecord> = {}): CurrencyRecord => ({
  CURRENCYID: 2,
  CURRENCYNAME: 'Euro',
  PFX_SYMBOL: '€',
  SFX_SYMBOL: '',
  DECIMAL_POINT: '.',
  GROUP_SEPARATOR: ',',
  UNIT_NAME: 'Euro',
  CENT_NAME: 'Cent',
  SCALE: 100,
  BASECONVRATE: 1.1,
  CURRENCY_SYMBOL: 'EUR',
  CURRENCY_TYPE: 'Fiat',
  ...overrides,
})

// Spec: currency-management.
describe('currency rules', () => {
  // Requirement "Amount Formatting and Precision", scenario "Zero-decimal
  // currency renders without decimals".
  describe('precision', () => {
    it('derives decimals from the scale', () => {
      expect(precisionFromScale(100)).toBe(2)
      expect(precisionFromScale(1)).toBe(0)
      expect(precisionFromScale(10)).toBe(1)
      expect(precisionFromScale(100_000_000)).toBe(8)
      expect(precisionFromScale(null)).toBe(0)
    })

    it('renders a zero-decimal currency without a decimal part', () => {
      const yen = currency({ SCALE: 1, PFX_SYMBOL: '¥', GROUP_SEPARATOR: ',' })
      expect(currencyPrecision(yen)).toBe(0)
      expect(formatAmount(1234, yen)).toBe('¥1,234')
    })

    it('groups and signs amounts using the currency fields', () => {
      expect(formatAmount(1234.5, currency())).toBe('€1,234.50')
      expect(formatAmount(-1234.5, currency())).toBe('-€1,234.50')
      expect(formatAmount(1234.5, currency(), { withSymbols: false })).toBe('1,234.50')
    })

    it('parses formatted text back to a plain number', () => {
      expect(parseAmount('€1,234.50', currency())).toBe(1234.5)
      expect(parseAmount('1.234,50', currency({ GROUP_SEPARATOR: '.', DECIMAL_POINT: ',' }))).toBe(
        1234.5,
      )
      expect(parseAmount('nonsense', currency())).toBe(0)
    })
  })

  // Requirement "Day-Rate Resolution".
  describe('day-rate resolution', () => {
    const history = [
      { CURRDATE: '2026-08-01', CURRVALUE: 1.0 },
      { CURRDATE: '2026-08-06', CURRVALUE: 2.0 },
      { CURRDATE: '2026-08-12', CURRVALUE: 3.0 },
    ]
    const context = { baseCurrencyId: 1, useCurrencyHistory: true }

    it('uses an exact-date row when one exists', () => {
      expect(resolveDayRate(currency(), history, '2026-08-06', context)).toBe(2.0)
    })

    // Scenario "Nearest rate with tie favoring the earlier row".
    it('breaks a tie in favour of the earlier row', () => {
      // 2026-08-09 sits exactly three days from both 08-06 and 08-12.
      expect(resolveDayRate(currency(), history, '2026-08-09', context)).toBe(2.0)
    })

    it('takes the nearer row when the gaps differ', () => {
      expect(resolveDayRate(currency(), history, '2026-08-11', context)).toBe(3.0)
      expect(resolveDayRate(currency(), history, '2026-08-02', context)).toBe(1.0)
    })

    it('uses the only side available at the ends of the series', () => {
      expect(resolveDayRate(currency(), history, '2026-07-01', context)).toBe(1.0)
      expect(resolveDayRate(currency(), history, '2027-01-01', context)).toBe(3.0)
    })

    // Requirement "Base Currency", scenario "Base currency rate is unity".
    it('always reports 1 for the base currency', () => {
      expect(resolveDayRate(currency({ CURRENCYID: 1 }), history, '2026-08-09', context)).toBe(1)
      expect(resolveDayRate(currency({ CURRENCYID: -1 }), history, '2026-08-09', context)).toBe(1)
    })

    // Scenario "History disabled uses the flat rate", and requirement "Rate
    // History Toggle Retroactivity", scenario "Toggling changes historical
    // valuations" -- the same past date resolves differently once toggled.
    it('falls back to the flat rate when history is disabled', () => {
      const disabled = { baseCurrencyId: 1, useCurrencyHistory: false }
      expect(resolveDayRate(currency(), history, '2026-08-06', disabled)).toBe(1.1)
      expect(resolveDayRate(currency(), history, '2026-08-06', context)).toBe(2.0)
    })

    it('falls back to the flat rate when the currency has no history', () => {
      expect(resolveDayRate(currency(), [], '2026-08-09', context)).toBe(1.1)
    })
  })
})
