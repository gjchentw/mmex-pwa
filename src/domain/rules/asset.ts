import { daysBetween, enumCodec, isoDatePart, parseIsoDateTime } from '../conventions'
import type { AssetRecord, TransactionRecord } from '../records'
import { accountFlow, isDeleted, isSelfTransfer, isVoid } from './ledger'

/**
 * Pure asset rules (openspec: asset-tracking). Asset values are expressed in the
 * base currency, and ASSETS_V1.VALUE is a derived cache that must be written
 * back whenever a linked transaction changes.
 */

export const ASSET_TYPES = [
  'Property',
  'Automobile',
  'Household Object',
  'Art',
  'Jewellery',
  'Cash',
  'Other',
] as const
export type AssetType = (typeof ASSET_TYPES)[number]
export const assetTypeCodec = enumCodec(ASSET_TYPES, 'Other')

/** Ordinals are reversed relative to accounts: Closed is 0, Open is 1. */
export const ASSET_STATUSES = ['Closed', 'Open'] as const
export type AssetStatus = (typeof ASSET_STATUSES)[number]
export const assetStatusCodec = enumCodec(ASSET_STATUSES, 'Open')

export const ASSET_CHANGES = ['None', 'Appreciates', 'Depreciates'] as const
export type AssetChange = (typeof ASSET_CHANGES)[number]
export const assetChangeCodec = enumCodec(ASSET_CHANGES, 'None')

/**
 * Persisted verbatim. Upstream valuation does not branch on this column -- the
 * rate always compounds daily -- so this build must not invent divergent
 * semantics for it either.
 */
export const ASSET_CHANGE_MODES = ['Percentage', 'Linear'] as const
export type AssetChangeMode = (typeof ASSET_CHANGE_MODES)[number]
export const assetChangeModeCodec = enumCodec(ASSET_CHANGE_MODES, 'Percentage')

/** The annual percentage rate is applied continuously per day. */
const dailyRate = (annualPercent: number | null | undefined): number =>
  (annualPercent ?? 0) / 36_500

/**
 * Applies appreciation or depreciation across a number of days:
 * `value * exp(±rate/36500 × days)`, matching Model_Asset::valueAtDate.
 */
export const applyChangeRate = (
  value: number,
  asset: Pick<AssetRecord, 'VALUECHANGE' | 'VALUECHANGERATE'>,
  days: number,
): number => {
  const change = assetChangeCodec.decode(asset.VALUECHANGE)
  if (change === 'None' || days === 0) return value
  const rate = dailyRate(asset.VALUECHANGERATE)
  return value * Math.exp((change === 'Appreciates' ? rate : -rate) * days)
}

export interface AssetValue {
  /** Cost basis accumulated from linked transactions. */
  cost: number
  /** Market value after appreciation, depreciation and explicit revaluations. */
  market: number
}

export interface LinkedAssetTransaction {
  transaction: Pick<
    TransactionRecord,
    | 'ACCOUNTID'
    | 'TOACCOUNTID'
    | 'TRANSCODE'
    | 'TRANSAMOUNT'
    | 'TOTRANSAMOUNT'
    | 'STATUS'
    | 'DELETEDTIME'
    | 'TRANSDATE'
  >
  /** Rate converting this transaction's account currency to the base currency. */
  dayRate: number
}

/**
 * Values an asset on a date.
 *
 * Mirrors Model_Asset::valueAtDate: dates before the start date are worth
 * nothing; without linked transactions the recorded value simply compounds from
 * the start date; with them, the history is replayed in date order, compounding
 * across each gap, and a self-transfer sets the market value outright as an
 * explicit revaluation.
 */
export const valueAtDate = (
  asset: Pick<AssetRecord, 'STARTDATE' | 'VALUE' | 'VALUECHANGE' | 'VALUECHANGERATE'>,
  links: readonly LinkedAssetTransaction[],
  onDate: Date,
): AssetValue => {
  const startDate = parseIsoDateTime(asset.STARTDATE)
  if (!startDate || onDate.getTime() < startDate.getTime()) return { cost: 0, market: 0 }

  const live = links.filter(({ transaction }) => !isDeleted(transaction) && !isVoid(transaction))

  if (live.length === 0) {
    const base = asset.VALUE ?? 0
    return {
      cost: base,
      market: applyChangeRate(base, asset, daysBetween(startDate, onDate)),
    }
  }

  const ordered = [...live].sort((a, b) =>
    isoDatePart(a.transaction.TRANSDATE).localeCompare(isoDatePart(b.transaction.TRANSDATE)),
  )

  const balance: AssetValue = { cost: 0, market: 0 }
  let last: Date | null = null

  for (const { transaction, dayRate } of ordered) {
    const transactionDate = parseIsoDateTime(transaction.TRANSDATE)
    if (!transactionDate) continue
    if (transactionDate.getTime() > onDate.getTime()) break

    if (last && last.getTime() < transactionDate.getTime()) {
      balance.market = applyChangeRate(balance.market, asset, daysBetween(last, transactionDate))
    }
    last = transactionDate

    if (isSelfTransfer(transaction)) {
      // An explicit revaluation replaces the market value outright.
      balance.market = transaction.TOTRANSAMOUNT ?? 0
      continue
    }

    // A withdrawal from the paying account adds value to the asset.
    const amount = -accountFlow(transaction, transaction.ACCOUNTID) * dayRate
    balance.market += amount
    if (amount > 0) {
      balance.cost += amount
    } else {
      // A negative flow reduces the cost basis only down to the unrealized gain.
      const unrealized = balance.market - balance.cost
      balance.cost += Math.min(0, amount + Math.max(0, unrealized))
      if (balance.cost < 0) balance.cost = 0
    }
  }

  if (last && last.getTime() < onDate.getTime()) {
    balance.market = applyChangeRate(balance.market, asset, daysBetween(last, onDate))
  }

  return balance
}

/**
 * The value to persist on the asset row: the signed sum of linked live
 * transactions converted at each one's day rate (Model_Translink::UpdateAssetValue).
 */
export const assetValueWriteBack = (links: readonly LinkedAssetTransaction[]): number =>
  links
    .filter(({ transaction }) => !isDeleted(transaction) && !isVoid(transaction))
    .reduce(
      (sum, { transaction, dayRate }) =>
        sum + -accountFlow(transaction, transaction.ACCOUNTID) * dayRate,
      0,
    )
