import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const { MockWorker } = vi.hoisted(() => {
  class MockWorker {
    postMessage = vi.fn()
    addEventListener = vi.fn()
    removeEventListener = vi.fn()
    terminate = vi.fn()
  }
  return { MockWorker }
})

vi.mock('../../workers/sqlite.worker?worker', () => ({ default: MockWorker }))

import { setDomainDb, type DomainDb, type SqlStatement } from '../../domain/db'
import { stockRepo } from '../../domain/repos/investment'
import type { StockRecord } from '../../domain/records'

/**
 * Spec: investment-tracking, Requirement "Share Trade Recording", scenario "A
 * trade without a payee stores the sentinel". CHECKINGACCOUNT_V1.PAYEEID is NOT
 * NULL in the vendored schema; desktop writes -1 for "no payee".
 */

const stock: StockRecord = {
  STOCKID: 7,
  HELDAT: 10,
  STOCKNAME: 'Example',
  SYMBOL: 'EXM',
  NUMSHARES: 0,
  PURCHASEDATE: '2026-01-01',
  PURCHASEPRICE: 0,
  CURRENTPRICE: 0,
  VALUE: 0,
  COMMISSION: 0,
  NOTES: null,
}

const makeFakeDb = () => {
  const batches: SqlStatement[][] = []
  const db: DomainDb = {
    async query<T>(sql: string): Promise<T[]> {
      if (sql.includes('FROM STOCK_V1 WHERE STOCKID')) return [stock] as T[]
      return [] as T[]
    },
    async mutate(statements: SqlStatement[]): Promise<void> {
      batches.push(statements)
    },
  }
  return { db, batches }
}

let fake: ReturnType<typeof makeFakeDb>

beforeEach(() => {
  fake = makeFakeDb()
  setDomainDb(fake.db)
})
afterEach(() => setDomainDb())

/** The PAYEEID bound by the ledger insert, which is the first statement of the trade. */
const payeeBound = (): unknown => {
  const insert = fake.batches[0]![0]!
  const columns = /\(([^)]*)\) VALUES/.exec(insert.sql)![1]!.split(', ')
  return insert.bind![columns.indexOf('PAYEEID')]
}

describe('recording a share trade', () => {
  it('stores -1 as the payee when none is given, never NULL', async () => {
    await stockRepo.recordTrade({
      stockId: 7,
      accountId: 10,
      shares: 5,
      price: 20,
      commission: 1,
      date: '2026-08-09',
    })

    expect(payeeBound()).toBe(-1)
  })

  it('stores the given payee', async () => {
    await stockRepo.recordTrade({
      stockId: 7,
      accountId: 10,
      shares: 5,
      price: 20,
      commission: 1,
      date: '2026-08-09',
      payeeId: 42,
    })

    expect(payeeBound()).toBe(42)
  })
})
