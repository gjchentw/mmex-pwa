import { isoDatePart } from '../conventions'
import type {
  ShareInfoRecord,
  StockHistoryRecord,
  StockRecord,
  TransactionRecord,
} from '../records'
import { isDeleted, isVoid } from './ledger'

/**
 * Pure investment rules (openspec: investment-tracking). Position summary fields
 * are derived caches over the linked ledger transactions: desktop reads the
 * stored columns, so a recomputation must always be written back.
 */

/** Share quantities render at their own precision, independent of currency scale. */
export const DEFAULT_SHARE_PRECISION = 4

export interface LinkedTrade {
  transaction: Pick<TransactionRecord, 'TRANSID' | 'TRANSDATE' | 'STATUS' | 'DELETEDTIME'>
  share: Pick<ShareInfoRecord, 'SHARENUMBER' | 'SHAREPRICE' | 'SHARECOMMISSION'>
}

export interface PositionTotals {
  numShares: number
  averagePrice: number
  bookCost: number
  commission: number
  earliestDate: string | null
}

/**
 * Recomputes a position from its linked trades.
 *
 * Mirrors Model_Stock::UpdatePosition: void and soft-deleted rows are skipped,
 * trades are walked in date order, buys add shares x price plus commission to
 * the book, and sells relieve shares at the running average cost. Both the share
 * total and the book cost are floored at zero, and the average only moves while
 * shares are held.
 */
export const computePosition = (trades: readonly LinkedTrade[], today: Date): PositionTotals => {
  const live = trades.filter(({ transaction }) => !isDeleted(transaction) && !isVoid(transaction))
  const ordered = [...live].sort((a, b) =>
    isoDatePart(a.transaction.TRANSDATE).localeCompare(isoDatePart(b.transaction.TRANSDATE)),
  )

  let totalShares = 0
  let bookCost = 0
  let commission = 0
  let averagePrice = 0
  let earliest = isoDatePart(today.toISOString())

  for (const { transaction, share } of ordered) {
    const shares = share.SHARENUMBER ?? 0
    const price = share.SHAREPRICE ?? 0
    const fee = share.SHARECOMMISSION ?? 0

    totalShares += shares
    if (totalShares < 0) totalShares = 0

    // A sell carries a negative share count and is relieved at average cost.
    bookCost += shares > 0 ? shares * price + fee : shares * averagePrice
    if (bookCost < 0) bookCost = 0
    if (totalShares > 0) averagePrice = bookCost / totalShares

    commission += fee

    const date = isoDatePart(transaction.TRANSDATE)
    if (date && date < earliest) earliest = date
  }

  return {
    numShares: totalShares,
    averagePrice,
    bookCost,
    commission,
    earliestDate: ordered.length > 0 ? earliest : null,
  }
}

/**
 * The values to persist on the position row. A position with no linked trades is
 * a legacy or manually entered row: its share count and value stand, and the
 * purchase price mirrors the current price.
 */
export const positionWriteBack = (
  stock: Pick<StockRecord, 'NUMSHARES' | 'VALUE' | 'CURRENTPRICE' | 'COMMISSION' | 'PURCHASEDATE'>,
  trades: readonly LinkedTrade[],
  today: Date,
): Pick<StockRecord, 'NUMSHARES' | 'PURCHASEPRICE' | 'VALUE' | 'COMMISSION' | 'PURCHASEDATE'> => {
  if (trades.length === 0) {
    return {
      NUMSHARES: stock.NUMSHARES ?? 0,
      PURCHASEPRICE: stock.CURRENTPRICE ?? 0,
      VALUE: stock.VALUE ?? 0,
      COMMISSION: stock.COMMISSION ?? 0,
      PURCHASEDATE: stock.PURCHASEDATE ?? null,
    }
  }
  const totals = computePosition(trades, today)
  return {
    NUMSHARES: totals.numShares,
    PURCHASEPRICE: totals.averagePrice,
    VALUE: totals.bookCost,
    COMMISSION: totals.commission,
    PURCHASEDATE: totals.earliestDate,
  }
}

/** Market value of a holding at its current price. */
export const currentValue = (stock: Pick<StockRecord, 'NUMSHARES' | 'CURRENTPRICE'>): number =>
  (stock.NUMSHARES ?? 0) * (stock.CURRENTPRICE ?? 0)

/** Book cost of a holding -- what the cost-book walk arrived at. */
export const investedValue = (stock: Pick<StockRecord, 'VALUE'>): number => stock.VALUE ?? 0

export const unrealizedGain = (
  stock: Pick<StockRecord, 'NUMSHARES' | 'CURRENTPRICE' | 'VALUE'>,
): number => currentValue(stock) - investedValue(stock)

/**
 * Realized gain accumulated over the sells in a trade history: each sell yields
 * shares x (sale price - average cost) less commission, with the average cost
 * taken from the book as it stood before that sell.
 */
export const realizedGain = (trades: readonly LinkedTrade[], today: Date): number => {
  const ordered = [...trades]
    .filter(({ transaction }) => !isDeleted(transaction) && !isVoid(transaction))
    .sort((a, b) =>
      isoDatePart(a.transaction.TRANSDATE).localeCompare(isoDatePart(b.transaction.TRANSDATE)),
    )

  let gain = 0
  for (let index = 0; index < ordered.length; index += 1) {
    const trade = ordered[index]!
    const shares = trade.share.SHARENUMBER ?? 0
    if (shares >= 0) continue
    const priorTotals = computePosition(ordered.slice(0, index), today)
    const soldShares = -shares
    gain +=
      soldShares * ((trade.share.SHAREPRICE ?? 0) - priorTotals.averagePrice) -
      (trade.share.SHARECOMMISSION ?? 0)
  }
  return gain
}

/**
 * The price to use for a symbol on a date: an exact history point, else the
 * nearest earlier one, else null so the caller can fall back.
 */
export const priceAtDate = (
  history: readonly Pick<StockHistoryRecord, 'DATE' | 'VALUE'>[],
  isoDate: string,
): number | null => {
  const target = isoDatePart(isoDate)
  const exact = history.find((row) => isoDatePart(row.DATE) === target)
  if (exact) return exact.VALUE
  const earlier = history
    .filter((row) => isoDatePart(row.DATE) < target)
    .sort((a, b) => isoDatePart(a.DATE).localeCompare(isoDatePart(b.DATE)))
  const nearest = earlier[earlier.length - 1]
  return nearest ? nearest.VALUE : null
}

/** Shares held on a date, summing the linked trades up to and including it. */
export const sharesAtDate = (trades: readonly LinkedTrade[], isoDate: string): number => {
  const target = isoDatePart(isoDate)
  return trades
    .filter(({ transaction }) => !isDeleted(transaction) && !isVoid(transaction))
    .filter(({ transaction }) => isoDatePart(transaction.TRANSDATE) <= target)
    .reduce((sum, { share }) => sum + (share.SHARENUMBER ?? 0), 0)
}

/** Money amount of a trade: shares x price, with commission added on a buy. */
export const tradeCashAmount = (shares: number, price: number, commission: number): number => {
  const gross = Math.abs(shares) * price
  return shares >= 0 ? gross + commission : gross - commission
}
