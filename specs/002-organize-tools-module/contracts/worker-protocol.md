# Worker Message Protocol Extension

**Feature**: 002-organize-tools-module  
**Date**: 2026-03-19

## New Message Type: `exec-transaction`

Extends the existing worker message protocol to support atomic multi-statement execution within a single SQLite transaction.

### Request

```typescript
interface ExecTransactionRequest {
  type: 'exec-transaction'
  id: string          // crypto.randomUUID()
  payload: {
    statements: Array<{
      sql: string
      bind?: unknown[]
    }>
  }
}
```

### Response

```typescript
interface ExecTransactionResponse {
  type: 'exec-transaction'
  id: string
  status: 'success' | 'error'
  result?: {
    /** Number of statements successfully executed */
    executed: number
  }
  error?: string
}
```

### Behavior

1. Worker receives `exec-transaction` message
2. Calls `db.transaction(() => { ... })` wrapper
3. Executes each statement in `payload.statements` sequentially
4. If ALL succeed: commits and responds with `status: 'success'`
5. If ANY fails: entire transaction rolls back; responds with `status: 'error'` and the error message

### DbClient Extension

```typescript
class DbClient {
  /** Execute multiple SQL statements within a single atomic transaction. */
  async execTransaction(statements: Array<{ sql: string; bind?: unknown[] }>): Promise<{ executed: number }>
}
```

## Existing Message Types (unchanged)

| Type | Direction | Purpose |
|------|-----------|---------|
| `init` | Client → Worker | Initialize database (create if needed + migrate) |
| `open` | Client → Worker | Open existing database + migrate |
| `close` | Client → Worker | Close database connection |
| `exec` | Client → Worker | Execute single SQL statement |
| `import` | Client → Worker | Import database from ArrayBuffer |
| `export` | Client → Worker | Export database as ArrayBuffer |
