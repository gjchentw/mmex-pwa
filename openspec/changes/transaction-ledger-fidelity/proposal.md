# Transaction Ledger Fidelity — Proposal

**Change**: `transaction-ledger-fidelity`
**Version**: 1.0.0
**Last Updated**: 2026-10-05

Related artifacts: [design.md](./design.md) (how), [specs/transaction-ledger/spec.md](./specs/transaction-ledger/spec.md) (capability delta), [tasks.md](./tasks.md) (implementation steps). Governed by [AGENTS.md](../../../AGENTS.md).

## Why

Phase 5 of the capability map is the transaction register. Before any surface is proposed, the operator asked on 2026-10-03 to verify that the `transaction-ledger` specification (1.1.0) and the domain beneath it match desktop MoneyManagerEx, as the Phase 4 audit did for the taxonomy. Three read-only surveys — the specification and domain code, desktop's ledger model and entry dialog, desktop's register panel — were compared line by line, and every claim below was re-read in the desktop source by hand.

The shape is right: the three types, the status keys, the flow function, soft delete with retention, the split representation and the linkage sentinels are what desktop stores. The behavior is not, and the ledger feeds every balance:

- **One rule contradicts desktop.** The specification says the `TOACCOUNTID` sentinel `32702` is "honored in flow computation" and that such a row is "excluded from account flow". Desktop's `account_flow` does not look at the sentinel; the row moves its account's balance like any other. What `32702` (and a linked row pointing at its own account) excludes is income and expense aggregation — category statistics, the home page, the reports.
- **Rules the specification states have no implementation.** The retention purge is never run by anything. The statement lock is not enforced on deletion, restore, or status change, and there is no status-change operation at all. Deleting or restoring a transaction linked to a stock or asset does not recompute the position. `LASTUPDATEDTIME` is stamped on every save where the specification — and desktop — stamp only a real change.
- **Rules desktop applies are not specified at all.** What a transaction must carry before it is saved (amount not negative, a category unless split, a payee unless a transfer, a different destination account, dates not before either account's opening date); what is stored in the unused columns (`TOACCOUNTID` `-1` and `TOTRANSAMOUNT` equal to the amount for a non-transfer, `PAYEEID` `-1` for a transfer, `CATEGID` `-1` when split); what desktop asks the user to confirm rather than refuses (a date inside a locked statement period, an account limit, differing currencies without a second amount); what a new transaction defaults to; that changing a transaction's tags stamps it; that a split transaction's amount is its split total and that a transfer carries no splits.
- **Smaller divergences that corrupt round-trips or counts.** A restored or newly written row stores `DELETEDTIME` as `NULL` where desktop stores the empty string; the purge cutoff is one day late; the reconciled balance reads the status differently from the reconciled flow.

The register and its entry dialog would be built directly on these paths. This change corrects the specification and the domain first, with no surface, so that the Phase 5 surfaces — to be proposed next, in two changes as the operator decided on 2026-10-03 — start from rules that are desktop's.

## What Changes

- **Linkage sentinels mean what desktop means**: account flow ignores them; a linked row marked "as transfer" or pointing at its own account is excluded from income and expense aggregation, through one predicate every aggregation uses.
- **What a saved transaction carries is specified and enforced**: desktop's validation with its refusals typed for the surfaces to translate; desktop's stored sentinels for the columns a type does not use; the time part of `TRANSDATE`; `COLOR` `1`–`7` or `-1`; `DELETEDTIME` written as the empty string for a live row.
- **Confirmations are distinguished from refusals**: a date on or before a locked account's statement date, a withdrawal or transfer that would take the account past its minimum balance or credit limit, and a transfer between currencies without a second amount each require an explicit acknowledgement and then proceed, as desktop's prompts do.
- **One save operation**: a transaction, its split lines with their tags, its own tags and — under the "last used" default-category mode — the payee's default category are written in one batch; `LASTUPDATEDTIME` is stamped on insert and on a real change of the record, its split set or its tag set, never otherwise.
- **The statement lock is enforced where desktop enforces it**: editing, changing the status of, deleting, or permanently deleting a stored transaction dated on or before the lock date is refused, and in a multi-row operation the locked rows are skipped and reported; restoring and the retention purge are not checked, as in desktop; only the owning account's lock applies.
- **Deleting, restoring and purging recompute linked positions** in the same operation, and purging runs: after the database is ready and synchronization has settled, at most once a day (operator decision 2026-08-08), removing rows deleted at least the retention period ago.
- **Entry defaults are readable file facts**: desktop's keys for the default date, default status, default payee and default transfer category, and the date-time switch, with desktop's defaults; the rules that compute a new transaction's date and status from them.
- **The status is read one way everywhere**, including the reconciled balance.
- **BREAKING** for callers of the ledger repository: `saveStatement` and `addStatement` give way to a validated save that takes a draft; `remove` reports skipped rows; `restoreStatement` gives way to `restore`. The callers are the scheduled, investment and account repositories and tests; no surface calls the ledger yet.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `transaction-ledger`: Schema Fidelity for Ledger Tables (empty-string `DELETEDTIME`, time part, colour range); Transaction Types (per-type stored sentinels, trade labels); Transaction Status Lifecycle (the status-change operation, uniform reading); Split Transactions (parent category sentinel, amount equals the total, no splits on transfers, single split collapses); Foreign Transaction Linkage Representation (sentinels and income/expense aggregation, not flow); Soft Delete, Trash, and Retention (recomputation on delete and purge, cutoff, permanent deletion from the trash, locked rows); Statement Lock Enforcement (per operation; new and moved dates are confirmed, not refused); Ledger Extension Hooks (tag-set changes stamp; soft delete keeps extension rows). ADDED Transaction Entry Validation; Transaction Entry Confirmations; Transaction Save Operation; Transaction Entry Defaults.

## Impact

- Domain: [src/domain/rules/ledger.ts](../../../src/domain/rules/ledger.ts), [src/domain/repos/ledger.ts](../../../src/domain/repos/ledger.ts), [src/domain/rules/account.ts](../../../src/domain/rules/account.ts) (`reconciledBalance`), [src/domain/rules/metadata.ts](../../../src/domain/rules/metadata.ts) and [src/domain/repos/metadata.ts](../../../src/domain/repos/metadata.ts) (five keys), [src/domain/repos/scheduled.ts](../../../src/domain/repos/scheduled.ts) and [src/domain/repos/investment.ts](../../../src/domain/repos/investment.ts) (new rows through the corrected write path), [src/domain/repos/asset.ts](../../../src/domain/repos/asset.ts) (recomputation over a post-state).
- Application wiring, no visible surface: a maintenance store that runs the daily purge, started from [src/App.vue](../../../src/App.vue).
- Tests: rule tests and fake-database statement tests under [src/__tests__/domain/](../../../src/__tests__/domain/), red first.
- No schema change. Stored data: nothing is rewritten in bulk; a row this application wrote with `DELETEDTIME` `NULL` stays readable by both applications and becomes the empty string the next time it is saved, as desktop itself does to rows older than its own soft-delete migration.

## Out of Scope

- Every surface — the register, the entry dialog, the trash view — is the next two changes, `transaction-ledger-surfaces` (register at `/accounts/:id` and `/transactions`, entry dialog, trash at `/trash`) and a follow-up for duplicate, move to another account and multi-selection actions (operator decision 2026-10-03). The operator's decisions for them, collected on 2026-10-03 and 2026-10-05, are recorded in [design.md](./design.md) so they are not lost.
- Duplicate, move, paste, the auto-number and frequent-notes helpers — specified with the surfaces that offer them.
- Scheduled projections in the register — Phase 6 (operator decision 2026-10-03).
- The advanced filter, bulk edit, reports, import and export — long-lived non-scope in the capability map.
- Editing rules for transactions linked to stocks and assets — `investment-tracking` and `asset-tracking`, Phases 9 and 10.
- Budget actuals: the audit found [src/domain/repos/budget.ts](../../../src/domain/repos/budget.ts) `actualsByCategory` counting void rows and transfers and not excluding linked rows marked as transfers. It belongs to `budget-management` (Phase 7) and is recorded in the capability map at archive for that phase's audit; this change supplies the predicate it will need.
