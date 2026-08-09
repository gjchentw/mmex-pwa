import { describe, it, expect } from 'vitest'
import {
  computePosition,
  currentValue,
  positionWriteBack,
  realizedGain,
  sharesAtDate,
  tradeCashAmount,
  unrealizedGain,
} from '../../domain/rules/investment'
import type { LinkedTrade } from '../../domain/rules/investment'

const trade = (
  date: string,
  shares: number,
  price: number,
  commission = 0,
  overrides: { STATUS?: string; DELETEDTIME?: string | null } = {},
): LinkedTrade => ({
  transaction: {
    TRANSID: Math.floor(Math.random() * 1),
    TRANSDATE: `${date}T00:00:00`,
    STATUS: overrides.STATUS ?? '',
    DELETEDTIME: overrides.DELETEDTIME ?? null,
  },
  share: { SHARENUMBER: shares, SHAREPRICE: price, SHARECOMMISSION: commission },
})

const today = new Date(2026, 7, 9)

// Spec: investment-tracking.
describe('investment rules', () => {
  // Requirement "Share Trade Recording", scenario "Sell stores negative shares".
  it('adds commission on a buy and subtracts it on a sell', () => {
    expect(tradeCashAmount(10, 50, 5)).toBe(505)
    expect(tradeCashAmount(-10, 50, 5)).toBe(495)
  })

  // Requirement "Position Fields Are Derived Caches".
  describe('cost book', () => {
    it('accumulates buys with their commission', () => {
      const totals = computePosition([trade('2026-01-01', 10, 5, 2)], today)
      expect(totals.numShares).toBe(10)
      expect(totals.bookCost).toBe(52)
      expect(totals.averagePrice).toBeCloseTo(5.2, 10)
      expect(totals.commission).toBe(2)
      expect(totals.earliestDate).toBe('2026-01-01')
    })

    // Scenario "Sells relieve at average cost": 20 shares at an average of 5,
    // selling 10 at 8 must reduce the book by 50, not by the proceeds.
    it('relieves a sell at the running average cost', () => {
      const totals = computePosition(
        [trade('2026-01-01', 20, 5), trade('2026-02-01', -10, 8)],
        today,
      )
      expect(totals.numShares).toBe(10)
      expect(totals.bookCost).toBe(50)
      expect(totals.averagePrice).toBe(5)
    })

    it('walks trades in date order regardless of input order', () => {
      const ordered = computePosition(
        [trade('2026-01-01', 10, 4), trade('2026-06-01', 10, 6)],
        today,
      )
      const shuffled = computePosition(
        [trade('2026-06-01', 10, 6), trade('2026-01-01', 10, 4)],
        today,
      )
      expect(shuffled).toEqual(ordered)
      expect(ordered.averagePrice).toBe(5)
    })

    it('skips void and soft-deleted trades', () => {
      const totals = computePosition(
        [
          trade('2026-01-01', 10, 5),
          trade('2026-02-01', 100, 99, 0, { STATUS: 'V' }),
          trade('2026-03-01', 100, 99, 0, { DELETEDTIME: '2026-03-02T00:00:00' }),
        ],
        today,
      )
      expect(totals.numShares).toBe(10)
      expect(totals.bookCost).toBe(50)
    })

    it('floors the share total at zero when sells exceed holdings', () => {
      const totals = computePosition(
        [trade('2026-01-01', 5, 10), trade('2026-02-01', -20, 12)],
        today,
      )
      expect(totals.numShares).toBe(0)
      expect(totals.bookCost).toBe(0)
    })
  })

  // Scenario "Editing a linked trade refreshes the cache" -- the values a
  // recomputation must persist.
  describe('write-back', () => {
    it('returns the recomputed fields for a linked position', () => {
      const values = positionWriteBack(
        { NUMSHARES: 0, VALUE: 0, CURRENTPRICE: 12, COMMISSION: 0, PURCHASEDATE: null },
        [trade('2026-01-01', 10, 5, 1)],
        today,
      )
      expect(values.NUMSHARES).toBe(10)
      expect(values.VALUE).toBe(51)
      expect(values.PURCHASEPRICE).toBeCloseTo(5.1, 10)
      expect(values.COMMISSION).toBe(1)
      expect(values.PURCHASEDATE).toBe('2026-01-01')
    })

    // Requirement "Positions Without Linked Transactions", scenario "Legacy
    // position is not zeroed".
    it('leaves a legacy position untouched but mirrors the current price', () => {
      const values = positionWriteBack(
        { NUMSHARES: 42, VALUE: 500, CURRENTPRICE: 12, COMMISSION: 3, PURCHASEDATE: '2020-01-01' },
        [],
        today,
      )
      expect(values.NUMSHARES).toBe(42)
      expect(values.VALUE).toBe(500)
      expect(values.PURCHASEPRICE).toBe(12)
      expect(values.PURCHASEDATE).toBe('2020-01-01')
    })
  })

  // Requirement "Valuation and Gain Definitions", scenario "Unrealized gain is
  // market minus book".
  describe('valuation', () => {
    it('reports market value, book cost and their difference', () => {
      const stock = { NUMSHARES: 100, CURRENTPRICE: 12, VALUE: 1000 }
      expect(currentValue(stock)).toBe(1200)
      expect(unrealizedGain(stock)).toBe(200)
    })

    it('accumulates realized gain over sells at the cost then in force', () => {
      const gain = realizedGain([trade('2026-01-01', 20, 5), trade('2026-02-01', -10, 8, 1)], today)
      // 10 shares sold at 8 against an average cost of 5, less 1 commission.
      expect(gain).toBeCloseTo(29, 10)
    })

    it('counts shares held on a date', () => {
      const trades = [trade('2026-01-01', 10, 5), trade('2026-06-01', 5, 6)]
      expect(sharesAtDate(trades, '2026-03-01')).toBe(10)
      expect(sharesAtDate(trades, '2026-06-01')).toBe(15)
    })
  })
})
