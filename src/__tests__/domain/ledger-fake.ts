import type { DomainDb, SqlStatement } from '../../domain/db'
import type { AccountRecord, SplitRecord, TransactionRecord } from '../../domain/records'

/**
 * A fake file for the ledger repository tests (transaction-ledger-fidelity,
 * design D13). The SQLite WebAssembly build cannot run under Node, so the tests
 * assert the statement batches; this fake answers the repository's reads from
 * fixtures and records every batch it is asked to run.
 */

export const transactionRow = (extra: Partial<TransactionRecord> = {}): TransactionRecord => ({
  TRANSID: 1,
  ACCOUNTID: 10,
  TOACCOUNTID: -1,
  PAYEEID: 5,
  TRANSCODE: 'Withdrawal',
  TRANSAMOUNT: 80,
  STATUS: '',
  TRANSACTIONNUMBER: '',
  NOTES: '',
  CATEGID: 3,
  TRANSDATE: '2026-08-09T00:00:00',
  LASTUPDATEDTIME: '2026-08-09T01:00:00',
  DELETEDTIME: '',
  FOLLOWUPID: -1,
  TOTRANSAMOUNT: 80,
  COLOR: -1,
  ...extra,
})

export const accountRow = (id: number, extra: Partial<AccountRecord> = {}): AccountRecord => ({
  ACCOUNTID: id,
  ACCOUNTNAME: `Account ${id}`,
  ACCOUNTTYPE: 'Checking',
  ACCOUNTNUM: null,
  STATUS: 'Open',
  NOTES: null,
  HELDAT: null,
  WEBSITE: null,
  CONTACTINFO: null,
  ACCESSINFO: null,
  INITIALBAL: 0,
  INITIALDATE: '2026-01-01',
  FAVORITEACCT: 'FALSE',
  CURRENCYID: 1,
  STATEMENTLOCKED: 0,
  STATEMENTDATE: null,
  MINIMUMBALANCE: 0,
  CREDITLIMIT: 0,
  INTERESTRATE: 0,
  PAYMENTDUEDATE: null,
  MINIMUMPAYMENT: 0,
  ...extra,
})

/** A linked trade as `stockRepo.linkedTrades` reads it: the ledger row joined to its share detail. */
export interface LinkedTradeRow {
  LINKTYPE: string
  LINKRECORDID: number
  row: Record<string, unknown>
}

export const makeLedgerFake = () => {
  const fixture = {
    transactions: [] as TransactionRecord[],
    accounts: [accountRow(10), accountRow(20), accountRow(30, { CURRENCYID: 2 })],
    splits: [] as SplitRecord[],
    tagLinks: [] as Array<{ REFTYPE: string; REFID: number; TAGID: number }>,
    categories: [
      { CATEGID: 3, ACTIVE: 1 },
      { CATEGID: 4, ACTIVE: 1 },
      { CATEGID: 9, ACTIVE: 0 },
    ],
    payees: [{ PAYEEID: 5 }],
    settings: new Map<string, string>(),
    translinks: [] as Array<{ CHECKINGACCOUNTID: number; LINKTYPE: string; LINKRECORDID: number }>,
    linked: [] as LinkedTradeRow[],
    stocks: [] as Array<Record<string, unknown>>,
    assets: [] as Array<Record<string, unknown>>,
  }
  const batches: SqlStatement[][] = []

  const isLive = (row: TransactionRecord) => (row.DELETEDTIME ?? '') === ''

  const db: DomainDb = {
    async query<T>(sql: string, bind: readonly unknown[] = []): Promise<T[]> {
      const flat = sql.replace(/\s+/g, ' ')
      const numbers = bind.filter((value): value is number => typeof value === 'number')

      if (flat.includes('FROM TRANSLINK_V1 l')) {
        return fixture.linked
          .filter((link) => link.LINKTYPE === bind[0] && link.LINKRECORDID === bind[1])
          .map((link) => link.row) as T[]
      }
      if (flat.includes('FROM TRANSLINK_V1')) {
        return fixture.translinks.filter((link) => numbers.includes(link.CHECKINGACCOUNTID)) as T[]
      }
      if (flat.includes('FROM STOCK_V1 WHERE STOCKID')) {
        return fixture.stocks.filter((stock) => stock.STOCKID === bind[0]) as T[]
      }
      if (flat.includes('FROM ASSETS_V1 WHERE ASSETID')) {
        return fixture.assets.filter((asset) => asset.ASSETID === bind[0]) as T[]
      }
      if (flat.includes('FROM CHECKINGACCOUNT_V1 WHERE TRANSID = ?')) {
        return fixture.transactions.filter((row) => row.TRANSID === bind[0]) as T[]
      }
      if (flat.includes('FROM CHECKINGACCOUNT_V1 WHERE TRANSID IN')) {
        return fixture.transactions.filter((row) => numbers.includes(row.TRANSID)) as T[]
      }
      if (flat.startsWith('SELECT * FROM CHECKINGACCOUNT_V1')) {
        let rows = fixture.transactions
        if (flat.includes('(ACCOUNTID = ? OR TOACCOUNTID = ?)')) {
          rows = rows.filter((row) => row.ACCOUNTID === bind[0] || row.TOACCOUNTID === bind[0])
        }
        if (flat.includes('NOT (COALESCE(DELETEDTIME')) return rows.filter((r) => !isLive(r)) as T[]
        if (flat.includes('COALESCE(DELETEDTIME')) return rows.filter(isLive) as T[]
        return rows as T[]
      }
      if (flat.includes('FROM ACCOUNTLIST_V1')) {
        return fixture.accounts.filter((account) => numbers.includes(account.ACCOUNTID)) as T[]
      }
      if (flat.startsWith('SELECT * FROM SPLITTRANSACTIONS_V1 WHERE TRANSID = ?')) {
        return fixture.splits.filter((split) => split.TRANSID === bind[0]) as T[]
      }
      if (flat.startsWith('SELECT SPLITTRANSID FROM SPLITTRANSACTIONS_V1')) {
        return fixture.splits.filter((split) => numbers.includes(split.TRANSID)) as T[]
      }
      if (flat.startsWith('SELECT REFID, TAGID FROM TAGLINK_V1')) {
        return fixture.tagLinks.filter(
          (link) => link.REFTYPE === bind[0] && numbers.includes(link.REFID),
        ) as T[]
      }
      if (flat.startsWith('SELECT TAGID FROM TAGLINK_V1')) {
        return fixture.tagLinks.filter(
          (link) => link.REFTYPE === bind[0] && link.REFID === bind[1],
        ) as T[]
      }
      if (flat.includes('FROM CATEGORY_V1 WHERE CATEGID IN')) {
        return fixture.categories.filter((category) => numbers.includes(category.CATEGID)) as T[]
      }
      if (flat.includes('FROM PAYEE_V1 WHERE PAYEEID IN')) {
        return fixture.payees.filter((payee) => numbers.includes(payee.PAYEEID)) as T[]
      }
      if (flat.includes('FROM SETTING_V1')) {
        const value = fixture.settings.get(String(bind[0]))
        return (value === undefined ? [] : [{ SETTINGVALUE: value }]) as T[]
      }
      return [] as T[]
    },
    async mutate(statements: SqlStatement[]): Promise<void> {
      batches.push(statements)
    },
  }

  const flat = (statement: SqlStatement): string => statement.sql.replace(/\s+/g, ' ')
  const all = (): SqlStatement[] => batches.flat()
  const sqlList = (): string[] => all().map(flat)
  /** The value bound to a column of an `INSERT … (columns) VALUES` or `UPDATE … SET a = ?, …` statement. */
  const bound = (statement: SqlStatement, column: string): unknown => {
    const insert = /\(([^)]*)\) VALUES/.exec(statement.sql)
    if (insert) return statement.bind![insert[1]!.split(', ').indexOf(column)]
    const set = /SET (.*) WHERE/.exec(flat(statement))
    const columns = set ? set[1]!.split(', ').map((part) => part.split(' = ')[0]!) : []
    return columns.includes(column) ? statement.bind![columns.indexOf(column)] : undefined
  }

  return { fixture, batches, db, flat, all, sqlList, bound }
}

export type LedgerFake = ReturnType<typeof makeLedgerFake>
