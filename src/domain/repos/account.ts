import { REFTYPE } from '../conventions'
import { db, insertStatement, placeholders, updateStatement, type SqlStatement } from '../db'
import type { AccountRecord, StockRecord, TransactionRecord } from '../records'
import { accountBalance, reconciledBalance } from '../rules/account'
import { extensionCleanupStatements } from './extensions'
import { ledgerRepo } from './ledger'

/** Accounts (openspec: account-management). */

export const accountRepo = {
  async all(includeClosed = true): Promise<AccountRecord[]> {
    const clause = includeClosed ? '' : "WHERE STATUS = 'Open'"
    return db.query<AccountRecord>(`SELECT * FROM ACCOUNTLIST_V1 ${clause} ORDER BY ACCOUNTNAME`)
  },

  async get(accountId: number): Promise<AccountRecord | null> {
    const rows = await db.query<AccountRecord>('SELECT * FROM ACCOUNTLIST_V1 WHERE ACCOUNTID = ?', [
      accountId,
    ])
    return rows[0] ?? null
  },

  /** Account names are unique case-insensitively. */
  async findByName(name: string, excludeAccountId?: number): Promise<AccountRecord | null> {
    const rows = await db.query<AccountRecord>(
      'SELECT * FROM ACCOUNTLIST_V1 WHERE ACCOUNTNAME = ? COLLATE NOCASE AND ACCOUNTID <> ?',
      [name, excludeAccountId ?? -1],
    )
    return rows[0] ?? null
  },

  addStatement(values: Omit<AccountRecord, 'ACCOUNTID'>): SqlStatement {
    return insertStatement('ACCOUNTLIST_V1', { ...values })
  },

  updateStatement(accountId: number, values: Partial<Omit<AccountRecord, 'ACCOUNTID'>>) {
    return updateStatement('ACCOUNTLIST_V1', 'ACCOUNTID', accountId, values)
  },

  /** Applies an edit after refusing a name another account holds, in any letter case. */
  async save(accountId: number, values: Partial<Omit<AccountRecord, 'ACCOUNTID'>>): Promise<void> {
    if (values.ACCOUNTNAME !== undefined) {
      const conflict = await this.findByName(values.ACCOUNTNAME, accountId)
      if (conflict) {
        throw new Error(`An account named "${conflict.ACCOUNTNAME}" already exists`)
      }
    }
    await db.mutate([this.updateStatement(accountId, values)])
  },

  async add(values: Omit<AccountRecord, 'ACCOUNTID'>): Promise<void> {
    const conflict = await this.findByName(values.ACCOUNTNAME)
    if (conflict) {
      throw new Error(`An account named "${conflict.ACCOUNTNAME}" already exists`)
    }
    await db.mutate([this.addStatement(values)])
  },

  /** Balance is the initial balance plus every transaction's flow for this account. */
  async balance(accountId: number): Promise<number> {
    const account = await this.get(accountId)
    if (!account) return 0
    const transactions = await ledgerRepo.list({ accountId })
    return accountBalance(account, transactions)
  },

  async reconciledBalance(accountId: number): Promise<number> {
    const account = await this.get(accountId)
    if (!account) return 0
    const transactions = await ledgerRepo.list({ accountId })
    return reconciledBalance(account, transactions)
  },

  /**
   * Deleting an account takes its transactions (with their splits, links and
   * decorations), its scheduled series, and the stock positions held there.
   */
  async removeStatements(accountId: number): Promise<SqlStatement[]> {
    const [transactions, scheduled, stocks] = await Promise.all([
      db.query<Pick<TransactionRecord, 'TRANSID'>>(
        'SELECT TRANSID FROM CHECKINGACCOUNT_V1 WHERE ACCOUNTID = ? OR TOACCOUNTID = ?',
        [accountId, accountId],
      ),
      db.query<{ BDID: number }>(
        'SELECT BDID FROM BILLSDEPOSITS_V1 WHERE ACCOUNTID = ? OR TOACCOUNTID = ?',
        [accountId, accountId],
      ),
      db.query<Pick<StockRecord, 'STOCKID'>>('SELECT STOCKID FROM STOCK_V1 WHERE HELDAT = ?', [
        accountId,
      ]),
    ])

    const statements: SqlStatement[] = []
    statements.push(...(await ledgerRepo.hardDeleteStatements(transactions.map((t) => t.TRANSID))))

    const scheduledIds = scheduled.map((row) => row.BDID)
    if (scheduledIds.length > 0) {
      const list = placeholders(scheduledIds.length)
      statements.push(
        ...extensionCleanupStatements(REFTYPE.recurringTransaction, scheduledIds),
        {
          sql: `DELETE FROM BUDGETSPLITTRANSACTIONS_V1 WHERE TRANSID IN (${list})`,
          bind: [...scheduledIds],
        },
        { sql: `DELETE FROM BILLSDEPOSITS_V1 WHERE BDID IN (${list})`, bind: [...scheduledIds] },
      )
    }

    const stockIds = stocks.map((row) => row.STOCKID)
    if (stockIds.length > 0) {
      const list = placeholders(stockIds.length)
      statements.push(
        ...extensionCleanupStatements(REFTYPE.stock, stockIds),
        {
          sql: `DELETE FROM TRANSLINK_V1 WHERE LINKTYPE = 'Stock' AND LINKRECORDID IN (${list})`,
          bind: [...stockIds],
        },
        { sql: `DELETE FROM STOCK_V1 WHERE STOCKID IN (${list})`, bind: [...stockIds] },
      )
    }

    statements.push(...extensionCleanupStatements(REFTYPE.bankAccount, [accountId]), {
      sql: 'DELETE FROM ACCOUNTLIST_V1 WHERE ACCOUNTID = ?',
      bind: [accountId],
    })
    return statements
  },

  async remove(accountId: number): Promise<void> {
    await db.mutate(await this.removeStatements(accountId))
  },
}
