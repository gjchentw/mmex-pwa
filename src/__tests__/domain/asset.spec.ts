import { describe, it, expect } from 'vitest'
import type { AssetRecord } from '../../domain/records'
import {
  ASSET_STATUSES,
  applyChangeRate,
  assetStatusCodec,
  assetTypeCodec,
  assetValueWriteBack,
  valueAtDate,
  type LinkedAssetTransaction,
} from '../../domain/rules/asset'

const asset = (overrides: Partial<AssetRecord> = {}): AssetRecord => ({
  ASSETID: 1,
  STARTDATE: '2026-01-01T00:00:00',
  ASSETNAME: 'Car',
  ASSETSTATUS: 'Open',
  CURRENCYID: -1,
  VALUECHANGEMODE: 'Percentage',
  VALUE: 10_000,
  VALUECHANGE: 'None',
  NOTES: null,
  VALUECHANGERATE: 0,
  ASSETTYPE: 'Automobile',
  ...overrides,
})

const link = (
  date: string,
  values: Partial<LinkedAssetTransaction['transaction']> = {},
  dayRate = 1,
): LinkedAssetTransaction => ({
  transaction: {
    ACCOUNTID: 10,
    TOACCOUNTID: null,
    TRANSCODE: 'Withdrawal',
    TRANSAMOUNT: 1000,
    TOTRANSAMOUNT: null,
    STATUS: '',
    DELETEDTIME: null,
    TRANSDATE: `${date}T00:00:00`,
    ...values,
  },
  dayRate,
})

// Spec: asset-tracking.
describe('asset rules', () => {
  // Requirement "Asset Classification" -- the status ordinals are reversed
  // relative to accounts, which is why the order is pinned here.
  it('orders asset statuses Closed then Open', () => {
    expect(ASSET_STATUSES).toEqual(['Closed', 'Open'])
    expect(assetStatusCodec.ordinal('Closed')).toBe(0)
    expect(assetStatusCodec.ordinal('Open')).toBe(1)
    expect(assetTypeCodec.decode('Household Object')).toBe('Household Object')
    expect(assetTypeCodec.decode('Spaceship')).toBe('Other')
  })

  // Requirement "Appreciation and Depreciation", scenario "Depreciation shrinks
  // value over elapsed days".
  describe('change rate', () => {
    it('compounds continuously per day', () => {
      const depreciating = asset({ VALUECHANGE: 'Depreciates', VALUECHANGERATE: 10 })
      expect(applyChangeRate(10_000, depreciating, 365)).toBeCloseTo(
        10_000 * Math.exp((-10 / 36_500) * 365),
        6,
      )
      const appreciating = asset({ VALUECHANGE: 'Appreciates', VALUECHANGERATE: 10 })
      expect(applyChangeRate(10_000, appreciating, 365)).toBeCloseTo(
        10_000 * Math.exp((10 / 36_500) * 365),
        6,
      )
    })

    it('leaves the value alone when there is no change configured', () => {
      expect(applyChangeRate(10_000, asset(), 3650)).toBe(10_000)
    })
  })

  // Requirement "Asset Valuation".
  describe('valuation', () => {
    // Scenario "Value before start date is zero".
    it('values an asset at nothing before its start date', () => {
      expect(valueAtDate(asset(), [], new Date(2025, 11, 31))).toEqual({ cost: 0, market: 0 })
    })

    it('compounds the recorded value when there are no linked transactions', () => {
      const depreciating = asset({ VALUECHANGE: 'Depreciates', VALUECHANGERATE: 10 })
      const result = valueAtDate(depreciating, [], new Date(2027, 0, 1))
      expect(result.cost).toBe(10_000)
      expect(result.market).toBeCloseTo(10_000 * Math.exp((-10 / 36_500) * 365), 6)
    })

    it('replays linked transactions into the value', () => {
      const result = valueAtDate(
        asset({ VALUE: 0 }),
        [link('2026-01-01'), link('2026-02-01', { TRANSAMOUNT: 500 })],
        new Date(2026, 5, 1),
      )
      // A withdrawal from the paying account adds value to the asset.
      expect(result.market).toBe(1500)
      expect(result.cost).toBe(1500)
    })

    // Scenario "Self-transfer revalues outright".
    it('lets a self-transfer set the market value outright', () => {
      const result = valueAtDate(
        asset({ VALUE: 0 }),
        [
          link('2026-01-01', { TRANSAMOUNT: 1000 }),
          link('2026-03-01', {
            TRANSCODE: 'Transfer',
            ACCOUNTID: 10,
            TOACCOUNTID: 10,
            TOTRANSAMOUNT: 50_000,
          }),
        ],
        new Date(2026, 5, 1),
      )
      expect(result.market).toBe(50_000)
    })

    it('converts each linked transaction at its own day rate', () => {
      const result = valueAtDate(
        asset({ VALUE: 0 }),
        [link('2026-01-01', { TRANSAMOUNT: 1000 }, 2)],
        new Date(2026, 5, 1),
      )
      expect(result.market).toBe(2000)
    })

    it('ignores soft-deleted and void linked rows', () => {
      const result = valueAtDate(
        asset({ VALUE: 0 }),
        [
          link('2026-01-01', { TRANSAMOUNT: 1000 }),
          link('2026-02-01', { TRANSAMOUNT: 9999, DELETEDTIME: '2026-02-02T00:00:00' }),
          link('2026-03-01', { TRANSAMOUNT: 9999, STATUS: 'V' }),
        ],
        new Date(2026, 5, 1),
      )
      expect(result.market).toBe(1000)
    })
  })

  // Requirement "Asset Value Cache Write-Back", scenario "Restoring a linked
  // transaction refreshes the cache".
  describe('value write-back', () => {
    it('sums the live linked transactions at their day rates', () => {
      expect(
        assetValueWriteBack([
          link('2026-01-01', { TRANSAMOUNT: 1000 }),
          link('2026-02-01', { TRANSCODE: 'Deposit', TRANSAMOUNT: 400 }),
        ]),
      ).toBe(600)
    })

    it('excludes rows that carry no monetary effect', () => {
      expect(
        assetValueWriteBack([
          link('2026-01-01', { TRANSAMOUNT: 1000 }),
          link('2026-02-01', { TRANSAMOUNT: 500, STATUS: 'V' }),
          link('2026-03-01', { TRANSAMOUNT: 500, DELETEDTIME: '2026-03-02T00:00:00' }),
        ]),
      ).toBe(1000)
    })
  })
})
