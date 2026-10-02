import { describe, it, expect } from 'vitest'
import type { CurrencyRecord } from '../../domain/records'
import {
  CURRENCY_CODE_MAX_LENGTH,
  DECIMAL_CHARACTERS,
  GROUPING_CHARACTERS,
  currencyPrecision,
  decimalPlacesFromScale,
  draftFromCurrency,
  formatAmount,
  normalizeCurrencyDefinition,
  parseAmount,
  parseRateEntry,
  precisionFromScale,
  resolveDayRate,
  scaleFromDecimalPlaces,
  validateCurrencyDefinition,
  type CurrencyDefinitionDraft,
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

    // Scenario "A negative amount carries its sign after the prefix": desktop's
    // toCurrency prepends the symbol to the already-signed digits (design D7).
    it('groups and signs amounts as desktop does, sign after the prefix', () => {
      expect(formatAmount(1234.5, currency())).toBe('€1,234.50')
      expect(formatAmount(-1234.5, currency())).toBe('€-1,234.50')
      expect(formatAmount(-80, currency({ PFX_SYMBOL: '$' }))).toBe('$-80.00')
      expect(formatAmount(-80, currency({ PFX_SYMBOL: '', SFX_SYMBOL: ' €' }))).toBe('-80.00 €')
      expect(formatAmount(-1234.5, currency(), { withSymbols: false })).toBe('-1,234.50')
    })

    // Scenario "A vanishing negative renders as zero".
    it('renders a magnitude below desktop tolerance as zero, never -0.00', () => {
      expect(formatAmount(-1e-12, currency({ PFX_SYMBOL: '$' }))).toBe('$0.00')
      expect(formatAmount(1e-12, currency({ PFX_SYMBOL: '$' }))).toBe('$0.00')
    })

    // Desktop truncates log10 for a scale that is not a power of ten.
    it('truncates the precision of a scale outside the powers of ten', () => {
      expect(precisionFromScale(50)).toBe(1)
      expect(precisionFromScale(1000)).toBe(3)
      expect(decimalPlacesFromScale(50)).toBe(1)
      expect(decimalPlacesFromScale(0)).toBe(0)
      expect(decimalPlacesFromScale(10_000_000_000)).toBe(9)
      expect(scaleFromDecimalPlaces(2)).toBe(100)
      expect(scaleFromDecimalPlaces(0)).toBe(1)
      expect(scaleFromDecimalPlaces(12)).toBe(1_000_000_000)
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

/** Requirement "Editing and Adding Currency Definitions": desktop's field shape and rules. */
describe('currency definition drafts', () => {
  const valid = (): CurrencyDefinitionDraft => ({
    CURRENCYNAME: 'Gold ounce',
    CURRENCY_SYMBOL: 'XAU',
    symbol: 'oz',
    symbolPlacement: 'suffix',
    DECIMAL_POINT: '.',
    GROUP_SEPARATOR: ',',
    UNIT_NAME: '',
    CENT_NAME: '',
    decimalPlaces: 4,
    CURRENCY_TYPE: 'Fiat',
    BASECONVRATE: '1850.5',
  })

  it('offers the separator sets and the code length desktop offers', () => {
    expect([...DECIMAL_CHARACTERS]).toEqual(['.', ','])
    expect([...GROUPING_CHARACTERS]).toEqual(['', '.', ',', ' '])
    expect(CURRENCY_CODE_MAX_LENGTH).toBe(12)
  })

  // Scenario "A stored scale outside the powers of ten is shown and normalized".
  it('reads a stored record as decimal places and one symbol slot', () => {
    const draft = draftFromCurrency(currency({ SCALE: 50, PFX_SYMBOL: '€', SFX_SYMBOL: 'x' }))
    expect(draft.decimalPlaces).toBe(1)
    expect(draft.symbol).toBe('€')
    expect(draft.symbolPlacement).toBe('prefix')

    const suffix = draftFromCurrency(currency({ PFX_SYMBOL: '', SFX_SYMBOL: ' Kč' }))
    expect(suffix.symbol).toBe(' Kč')
    expect(suffix.symbolPlacement).toBe('suffix')

    expect(draftFromCurrency(null).decimalPlaces).toBe(2)
  })

  it('accepts a valid draft', () => {
    expect(validateCurrencyDefinition(valid())).toEqual({})
  })

  // Scenario "An empty name or code is refused".
  it.each([
    [{ CURRENCYNAME: '  ' }, 'name', 'nameRequired'],
    [{ CURRENCY_SYMBOL: '' }, 'code', 'codeRequired'],
    [{ CURRENCY_SYMBOL: 'ABCDEFGHIJKLM' }, 'code', 'codeTooLong'],
    [{ DECIMAL_POINT: ',', GROUP_SEPARATOR: ',' }, 'grouping', 'separatorsEqual'],
    [{ BASECONVRATE: '' }, 'rate', 'rateInvalid'],
    [{ BASECONVRATE: 0 }, 'rate', 'rateInvalid'],
    [{ BASECONVRATE: -1 }, 'rate', 'rateInvalid'],
    [{ BASECONVRATE: 'abc' }, 'rate', 'rateInvalid'],
  ] as const)('refuses %j on %s as %s', (patch, field, refusal) => {
    const refusals = validateCurrencyDefinition({ ...valid(), ...patch })
    expect(refusals[field]).toBe(refusal)
  })

  // Scenario "Equal separators are refused when there are decimals": with no
  // decimals, desktop does not apply the rule.
  it('allows equal separators when there are no decimal places', () => {
    const draft = { ...valid(), DECIMAL_POINT: ',', GROUP_SEPARATOR: ',', decimalPlaces: 0 }
    expect(validateCurrencyDefinition(draft).grouping).toBeUndefined()
  })

  // Scenario "A currency outside the seeded set can be added".
  it('normalizes a draft into the stored shape', () => {
    const record = normalizeCurrencyDefinition({ ...valid(), CURRENCYNAME: ' Gold ounce ' })
    expect(record.CURRENCYNAME).toBe('Gold ounce')
    expect(record.SCALE).toBe(10_000)
    expect(record.PFX_SYMBOL).toBe('')
    expect(record.SFX_SYMBOL).toBe('oz')
    expect(record.BASECONVRATE).toBe(1850.5)
    expect(record.CURRENCY_TYPE).toBe('Fiat')

    const prefixed = normalizeCurrencyDefinition({ ...valid(), symbolPlacement: 'prefix' })
    expect(prefixed.PFX_SYMBOL).toBe('oz')
    expect(prefixed.SFX_SYMBOL).toBe('')
  })

  // Scenario "An invalid rate entry is refused": desktop allows zero, not negatives.
  it('parses a history rate entry as desktop validates it', () => {
    expect(parseRateEntry('1.25')).toBe(1.25)
    expect(parseRateEntry(0)).toBe(0)
    expect(parseRateEntry('')).toBeNull()
    expect(parseRateEntry('-1')).toBeNull()
    expect(parseRateEntry('abc')).toBeNull()
    expect(parseRateEntry(null)).toBeNull()
  })
})
