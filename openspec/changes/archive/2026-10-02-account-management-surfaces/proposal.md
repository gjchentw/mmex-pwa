# Account Management Surfaces — Proposal

**Change**: `account-management-surfaces`
**Version**: 1.1.0
**Last Updated**: 2026-10-02

Related artifacts: [design.md](./design.md) (how), [specs/account-management/spec.md](./specs/account-management/spec.md) (capability delta), [tasks.md](./tasks.md) (implementation steps). Governed by [AGENTS.md](../../../AGENTS.md).

## Why

Phase 2 delivered the currency surfaces, but the accounts that use those currencies are still unreachable. The `account-management` capability specifies schema fidelity, account types, status, currency binding, the balance definition, the statement-lock declaration, the credit and loan fields and the deletion cascade, and the domain layer reads, computes and deletes accordingly. Yet no surface can create an account, edit one, or show the list. Phase 3 of the [capability map](../../designs/domain-capability-map.md) makes account records inspectable and editable before the phases that depend on them arrive: Phase 5 (transaction ledger) posts to accounts, and Phase 6 (scheduled transactions) guards execution with each account's minimum balance and credit limit.

Without this change, every later phase that touches accounts would be blocked, and the application would have no way to manage the entity the ledger is built on.

## What Changes

- **An accounts surface at its own route**, reachable from the navigation surface, listing every account grouped by type as desktop's account tree groups them, each with its currency code, a Closed indicator where it applies, a favorite star, and its current balance.
- **Account creation**: accounts of every type the capability defines (Cash, Checking, Credit Card, Loan, Term, Investment, Asset, Shares), starting with desktop's defaults: favorite, the base currency, a zero balance, opened today.
- **Account editing** of every field desktop's account dialog edits: name (trimmed, unique case-insensitively), type, status, currency, initial balance and date, favorite, the credit and loan planning fields, the statement lock, and the free-text fields (account number, held at, website, contact, access info, notes).
- **Desktop's account rules on the surface**: a Shares account keeps its type and no account becomes Investment; the opening date may not be in the future, nor after the account's earliest transaction, stock purchase or scheduled transaction.
- **Planning fields for every type**, as desktop's Credit tab offers them, because the scheduled-transaction guard reads them on any account.
- **Live, read-only balances** on the list and the detail, computed per the capability's balance definition and formatted in the account's currency.
- **Statement lock** set with a date and cleared as desktop stores it, shown in the detail with its read-only effect.
- **Deletion from the detail or the editor**, behind a confirmation listing what the cascade removes with the account: its transactions, its scheduled transactions, and, for an Investment or Shares account, its stock positions.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `account-management`: ADDS the user-facing requirements the baseline deliberately left out: the surface and its route, the grouped list, creation with desktop's defaults, editing, type change, planning fields, the opening-date rule, statement-lock management, deletion from the surface, favorites, and balance formatting. No existing requirement changes; the baseline rules already in force constrain everything the surface does.

## Impact

- **Code**: an accounts page and its route, detail and editor dialogs, a store over the repositories, a navigation entry, rules for desktop's tree order and type-change restrictions, an opening-date query, and additions to both catalogs.
- **Configuration**: none. **Dependencies**: `currency-management` provides the currency list and `file-metadata-and-settings` the base currency. The domain layer needed executing write methods (finding F1) and the opening-date query, both added by this change.
- **Verification**: unit tests for the surface's behavior and the rules it adds, and an end-to-end smoke test against real SQLite in OPFS.
- **Out of scope**:
  - Desktop's Favorites group and its view filters, deferred to a later change (operator decision 2026-10-02).
  - Account reconciliation, which no phase yet carries and which needs its own proposal.
  - Transfers between accounts, which arrive with Phase 5 (`transaction-ledger`).
  - Investment, share and asset records, which arrive with Phases 9 and 10.
