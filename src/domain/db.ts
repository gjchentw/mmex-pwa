import { dbClient, type SqlStatement } from '../workers/db-client'

export type { SqlStatement }

/**
 * The persistence surface the domain layer needs: object-row reads and atomic
 * statement lists (openspec: domain-data-access). Repositories depend on this
 * interface rather than the client so tests can supply a fake.
 */
export interface DomainDb {
  query<T>(sql: string, bind?: unknown[]): Promise<T[]>
  mutate(statements: SqlStatement[]): Promise<void>
}

let active: DomainDb = dbClient

/** Swap the persistence surface (tests only); pass nothing to restore the client. */
export const setDomainDb = (impl?: DomainDb): void => {
  active = impl ?? dbClient
}

export const db: DomainDb = {
  query: (sql, bind) => active.query(sql, bind),
  mutate: (statements) => active.mutate(statements),
}

/** `IN (?, ?, ?)` placeholder list for a set-based statement. */
export const placeholders = (count: number): string => Array(count).fill('?').join(', ')

/**
 * Statement inserting a row and letting SQLite assign the rowid-alias key
 * (openspec: domain-data-conventions, Identifier and Sentinel Conventions --
 * identifiers are never hand-assigned).
 */
export const insertStatement = (table: string, values: Record<string, unknown>): SqlStatement => {
  const columns = Object.keys(values)
  return {
    sql: `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders(columns.length)})`,
    bind: columns.map((column) => values[column]),
  }
}

/** Statement updating one row by its primary key. */
export const updateStatement = (
  table: string,
  keyColumn: string,
  keyValue: unknown,
  values: Record<string, unknown>,
): SqlStatement => {
  const columns = Object.keys(values)
  return {
    sql: `UPDATE ${table} SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE ${keyColumn} = ?`,
    bind: [...columns.map((column) => values[column]), keyValue],
  }
}

/** Statement deleting rows whose key is in the given list. */
export const deleteStatement = (
  table: string,
  keyColumn: string,
  keyValues: readonly unknown[],
): SqlStatement => ({
  sql: `DELETE FROM ${table} WHERE ${keyColumn} IN (${placeholders(keyValues.length)})`,
  bind: [...keyValues],
})
