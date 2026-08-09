# Account Management Surfaces — Proposal

**Change**: `account-management-surfaces`
**Version**: 1.0.0
**Last Updated**: 2026-08-09

Related artifacts: [design.md](./design.md) (how), [specs/account-management/spec.md](./specs/account-management/spec.md) (capability delta), [tasks.md](./tasks.md) (implementation steps). Governed by [AGENTS.md](../../AGENTS.md).

## Why

Phase 2 delivered currency management surfaces, but accounts that use those currencies are still unreachable. The domain layer for `account-management` is complete — schema fidelity, account types, status, currency binding, balance definition, statement lock declaration, credit/loan fields, and deletion cascades are all specified and implemented — yet no surface can create an account, edit its properties, or show the list. Phase 3 of the [capability map](../../designs/domain-capability-map.md) exists to make account records inspectable and editable before the phases that depend on them arrive. Phase 4 (transaction taxonomy) reads account references when categorizing; Phase 5 (transaction ledger) posts to accounts; both inherit the account set this phase establishes.

Without this change, every later phase that touches accounts would be blocked, and the application would have no way to manage the fundamental entity that drives the ledger.

## What Changes

- **An accounts surface at its own route**, reachable from the navigation drawer, listing all accounts in the file with their type, status, currency, and current balance. A flat list allows users to see and manage their account portfolio at a glance.
- **Account creation becomes available**: users can add accounts of every type the capability defines — Cash, Checking, Credit Card, Loan, Term, Investment, Asset, Shares — with required fields (name, type, currency, initial balance and date) and optional fields per type (credit limit, interest rate, statement lock, etc.).
- **Account definitions become editable**: account name (unique case-insensitively), type, status (Open/Closed), currency binding, initial balance and date, favorite flag, and type-specific fields (credit/loan planning fields for credit card, loan, term accounts).
- **Balance display is live and read-only** on the list and detail views, computed as initial balance plus transaction flows per the capability's balance definition, formatted in the account's currency.
- **A type-specific editor surface** adapts fields shown based on the account type selected — credit/loan fields appear only for Credit Card, Loan, and Term accounts; statement lock controls appear for all types; investment and asset fields are reserved for their respective capabilities.
- **Deleting an account is offered where it is allowed** — refused with the reason when transactions, scheduled transactions, or stock positions still reference it, consistent with the deletion cascade rule defined in the baseline.
- **Statement lock can be set and cleared** from the account detail, with clear indication of the lock date and its effect (read-only transactions on or before that date).

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `account-management`: ADDS the user-facing requirements the baseline deliberately left out — the accounts surface and its route, account list display with balances, account creation with all required fields, account editing for all persisted fields, type-specific field presentation, balance display per the capability definition, statement lock management, and deletion from the surface with cascade guard. No existing requirement changes; the schema fidelity, type semantics, balance definition, currency binding, and deletion cascade rules already in force constrain everything the surface does.

## Impact

- **Code**: an accounts page and its route, a creation form, an editor for account properties, type-specific field components, a store over the existing `accountRepo`, a navigation entry, and additions to both catalogs.
- **Configuration**: none. **Dependencies**: none — the domain layer already provides every read, write and computation this needs; `currency-management` provides the currency list for the binding field; `transaction-ledger` computes balances.
- **Verification**: unit tests for the surface's behavior, and for the rules it depends on that are already covered at the domain layer.
- **Out of scope**: account reconciliation workflows, which the capability map holds as long-lived non-scope; transfer transaction creation between accounts, which arrives with Phase 5; and investment-specific account behaviors, which arrive with Phase 9.
