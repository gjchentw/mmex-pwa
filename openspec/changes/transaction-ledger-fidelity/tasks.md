# Transaction Ledger Fidelity — Tasks

**Change**: `transaction-ledger-fidelity`
**Version**: 1.0.0
**Last Updated**: 2026-10-05

Related artifacts: [proposal.md](./proposal.md), [design.md](./design.md), [specs/transaction-ledger/spec.md](./specs/transaction-ledger/spec.md). Governed by [AGENTS.md](../../../AGENTS.md). Each task names how it is verified; a box is checked only once that verification has passed and its result is written next to the box. Every test is written to fail on the current code before the fix, and the red result is recorded. New files are named in code spans until they exist, then linked.

## 1. Status, linkage and retention rules

- [ ] 1.1 In [src/domain/rules/account.ts](../../../src/domain/rules/account.ts), make `reconciledBalance` count through `reconciledFlow` (design D12); verify in [src/__tests__/domain/ledger.spec.ts](../../../src/__tests__/domain/ledger.spec.ts) with a deposit of `50` stored with status `Reconciled`: red (not counted), then green
- [ ] 1.2 In [src/domain/rules/ledger.ts](../../../src/domain/rules/ledger.ts), add `isForeignAsTransfer` (`TOACCOUNTID` `32702`, or equal to `ACCOUNTID`, on a linked row) and correct the `FOREIGN_SENTINEL` comment; leave `accountFlow` unchanged (design D10); verify with tests: a `32702` row has a non-zero `accountFlow` and is foreign-as-transfer, a `32701` row is not, an ordinary withdrawal is not
- [ ] 1.3 In [src/domain/rules/ledger.ts](../../../src/domain/rules/ledger.ts), make `isPurgeable` compare `DELETEDTIME` with the UTC timestamp `now − retentionDays` using at-or-before (design D9); verify red then green at the boundary: trashed exactly thirty days ago to the second is purgeable, one second later is not, retention `0` is always purgeable
- [ ] 1.4 Correct the requirement name cited in [src/__tests__/domain/ledger.spec.ts](../../../src/__tests__/domain/ledger.spec.ts) from "Transfers and Cross-Currency Amounts" to "Account Flow and Balance Contribution"; verify by `grep` that every requirement name cited in the ledger test files exists in the specification

## 2. Draft rules

- [ ] 2.1 In [src/domain/rules/ledger.ts](../../../src/domain/rules/ledger.ts), add `TransactionDraft`, `SaveContext` and `validateTransaction` returning typed refusals in desktop's order (design D1; spec Transaction Entry Validation); verify with one test per refusal — negative amount, negative second amount, missing account, date before the opening date (and accepted on it), missing category with no splits for each type, missing payee on a non-transfer, missing or same destination account, date before the destination's opening date, splits on a transfer, a split line without a category, a negative split total — and a zero amount accepted
- [ ] 2.2 Add `normalizeTransaction` (design D1; spec Transaction Types, Split Transactions, Schema Fidelity); verify with tests: a withdrawal stores `TOACCOUNTID -1` and `TOTRANSAMOUNT` equal to the amount; a stored linked row keeps its `TOACCOUNTID`; a transfer stores `PAYEEID -1` and the second amount or the amount; two split lines give `CATEGID -1` and the total; one split line collapses; `COLOR` `0`, `8` and `-5` become `-1` and `3` stays; `TRANSDATE` ends `T00:00:00` unless date-time is on; the status is its key; `DELETEDTIME` is `''`; no field is `null`
- [ ] 2.3 Add `confirmationsFor` (design D2; spec Transaction Entry Confirmations) using `breachesFloor` from [src/domain/rules/account.ts](../../../src/domain/rules/account.ts); verify with tests: locked period on a new row and on a moved date, not on an unlocked account; account limit on a new withdrawal and a new transfer, not on a deposit, a void row or an edit; different currencies only without a second amount
- [ ] 2.4 Add `transactionChanged(stored, next)` and extend `splitSetChanged` to compare each line's tag set, moving it into the rules module (design D4, D6); verify with a column-by-column test (each `TransactionRecord` field alone changes the result; `LASTUPDATEDTIME` alone does not; `NULL` versus `''` on a text column does not) and split cases (a changed tag set is a change; reordered identical lines are not)

## 3. Entry-default file facts

- [ ] 3.1 In [src/domain/rules/metadata.ts](../../../src/domain/rules/metadata.ts), add the five `SETTING_KEY` entries and their `DEFAULTS` (design D11; spec Transaction Entry Defaults); verify in [src/__tests__/domain/metadata.spec.ts](../../../src/__tests__/domain/metadata.spec.ts) that each key string is desktop's and `storeForKey` places each in the settings store
- [ ] 3.2 In [src/domain/repos/metadata.ts](../../../src/domain/repos/metadata.ts), add `fileFacts.transactionDateDefault`, `transactionStatusDefault`, `transactionPayeeDefault`, `transactionTransferCategoryDefault`, `transactionUseDateTime`; verify with fake-database tests for the absent key (`0`, `0`, `0`, `1`, false) and for stored `1`, `4`, `2`, `0`, `TRUE`, and an unrecognized status index falling back to `0`
- [ ] 3.3 In [src/domain/rules/ledger.ts](../../../src/domain/rules/ledger.ts), add `defaultTransactionDate(mode, accountTransactions, now)` and `defaultStatusKey(index)`; verify with tests: mode `0` gives today; mode `1` gives the latest live date not after now, ignoring trashed and future rows, and today when none qualifies; index `1` gives `R`, `9` gives `''`

## 4. The save operation

- [ ] 4.1 In [src/domain/repos/ledger.ts](../../../src/domain/repos/ledger.ts), add `LedgerValidationError`, `LedgerLockedError`, `LedgerConfirmationRequired` and `saveTransaction(draft, { acknowledged, now })` for a new transaction (design D1–D3; spec Transaction Save Operation); write the tests first in [src/__tests__/domain/ledger-repo.spec.ts](../../../src/__tests__/domain/ledger-repo.spec.ts): a refusal writes nothing; an unacknowledged condition writes nothing and reports every condition; the batch for a withdrawal with two split lines, a tag on the first, and two transaction tags is the insert, each split insert keyed by `MAX(TRANSID)` followed by its tag link keyed by `MAX(SPLITTRANSID)`, then the transaction's tag links, with `LASTUPDATEDTIME` bound to the save time; verify red then green
- [ ] 4.2 Extend `saveTransaction` to an existing transaction: refuse a locked stored row with `LedgerLockedError`; write `LASTUPDATEDTIME` only when the record, the split set or the tag set changed; replace the transaction's tag links as a set (design D4–D6; spec Ledger Extension Hooks, Statement Lock Enforcement); verify with tests: an unchanged save emits no `LASTUPDATEDTIME`; changed notes, a changed split amount, an added tag and an added split tag each stamp; a locked stored row is refused with the statement date and no batch; a transfer whose destination account is locked is accepted; a stored trashed row is not stamped
- [ ] 4.3 Add the payee default write-back under the Last used mode (spec Transaction Save Operation; `transaction-taxonomy` Payee Records): one `UPDATE PAYEE_V1 SET CATEGID` in the same batch for a withdrawal or deposit, `-1` for a split transaction, skipped for a hidden category, a transfer, or any other mode; verify with tests for each case
- [ ] 4.4 Move the callers to the corrected write path and remove `saveStatement`, `addStatement` and `restoreStatement`: the materialization in [src/domain/repos/scheduled.ts](../../../src/domain/repos/scheduled.ts) and the trade recording in [src/domain/repos/investment.ts](../../../src/domain/repos/investment.ts) build their rows through `normalizeTransaction` and the shared insert and split builders, so they write `DELETEDTIME ''` and desktop's sentinels (design D3, D8); verify [scheduled-repo.spec.ts](../../../src/__tests__/domain/scheduled-repo.spec.ts) and [investment-repo.spec.ts](../../../src/__tests__/domain/investment-repo.spec.ts) pass with added assertions on `DELETEDTIME ''` and `TOTRANSAMOUNT`, and record that `grep -rn "saveStatement\|addStatement\|restoreStatement" src` finds only the remaining definitions the other repositories own (design R5)

## 5. Status changes and the trash lifecycle

- [ ] 5.1 Add `ledgerRepo.setStatus(ids, status, { now })` returning `{ changed, skippedLocked }` (design D5; spec Transaction Status Lifecycle): locked rows skipped, rows already at the status untouched, changed live rows stamped, all-locked throws `LedgerLockedError`; verify red (no such operation) then green with a three-row fixture — one changed, one already reconciled, one locked
- [ ] 5.2 Give `stockRepo.recomputeStatements` in [src/domain/repos/investment.ts](../../../src/domain/repos/investment.ts) and `assetRepo.recomputeStatements` in [src/domain/repos/asset.ts](../../../src/domain/repos/asset.ts) an `overrides` option mapping a transaction id to its post-operation state — trashed, live, or absent (design D7); verify with tests reusing the existing position fixtures: trashing the only buy gives zero shares, restoring it gives the original position, an absent row equals a trashed one, and no override reproduces today's result
- [ ] 5.3 Replace `ledgerRepo.remove` with `remove(ids, { now })` returning `{ removed, skippedLocked }` (design D5, D7; spec Soft Delete, Trash, and Retention): locked rows skipped, soft delete or hard delete by the retention setting, a row already in the trash hard-deleted, the linked position updates folded into the same batch; verify with tests: the soft-delete batch carries the `DELETEDTIME` update and the `STOCK_V1` update together and no extension cleanup; retention `0` carries the hard-delete cascade and the position update; a locked row is reported and untouched; all-locked throws
- [ ] 5.4 Add `ledgerRepo.restore(ids)` (spec Soft Delete, Trash, and Retention; Schema Fidelity): `DELETEDTIME = ''`, no lock check, the linked position update in the same batch, no `LASTUPDATEDTIME`; verify red (the current statement binds `NULL` and recomputes nothing) then green
- [ ] 5.5 Add `ledgerRepo.purge(ids)` for a permanent deletion from the trash (locked rows skipped) and make `purgeExpired` use the 1.3 cutoff, ignore the lock, and fold the position updates (design D5, D7, D9); verify with tests: a trashed locked row is skipped by `purge` and removed by `purgeExpired`; the cutoff second; the cascade includes `SHAREINFO_V1` and `TRANSLINK_V1`

## 6. The purge runner

- [ ] 6.1 Create `src/stores/maintenance-store.ts` with `maybePurge(now)` (design D9): runs only when the database is ready and the sync status is `unbound` or `idle`, at most once per calendar day per device, records the day only after success, and calls the sync store's `notifyLocalWrite()` when rows were purged; write `src/__tests__/maintenance-store.spec.ts` first: not ready → no purge; `syncing` → no purge; first call of the day purges and notifies; a second call the same day does nothing; a failed purge does not record the day; the next day purges again; verify red then green
- [ ] 6.2 Call `maybePurge` from [src/App.vue](../../../src/App.vue) on readiness and on the sync status settling; verify in [src/__tests__/App.spec.ts](../../../src/__tests__/App.spec.ts) that the store is called when the database becomes ready with no sync binding, and again when the status goes from `syncing` to `idle`

## 7. Risk coverage

- [ ] 7.1 R1: the 4.1 test asserts each child statement directly follows its parent insert and carries the `MAX()` key expression; verify it passes
- [ ] 7.2 R2: the 2.4 column-by-column test iterates over every key of a `TransactionRecord` fixture, so a column added later fails the test until it is considered; verify it passes
- [ ] 7.3 R3: the 5.2–5.5 tests assert the position values bound in the `STOCK_V1` update for delete, restore, permanent delete and purge; verify they pass
- [ ] 7.4 R4 and R5: the 6.1 test covers the unsettled sync status; `npm run type-check` passes over the three calling repositories and the `grep` of 4.4 is recorded here
- [ ] 7.5 R6, R7 and R8: record here that real-SQLite coverage is owed by the surfaces change (design D13); a test asserts a transaction whose tagged split lines are unchanged is not stamped (D6); a rule test shows `normalizeTransaction` turns a stored row with `NULL` in `PAYEEID`, `TOACCOUNTID` and `TOTRANSAMOUNT` into desktop's values on its next save

## 8. Verification

- [ ] 8.1 `openspec validate transaction-ledger-fidelity --strict` passes
- [ ] 8.2 `npm run test:unit` passes with a higher count than before this change (595 passed, 1 skipped before)
- [ ] 8.3 `npm run type-check` passes
- [ ] 8.4 `npm run lint:check` passes
- [ ] 8.5 `npm run format:check` passes
- [ ] 8.6 `npm run build` succeeds
- [ ] 8.7 The existing Chromium specs still pass (`npx playwright test --project=chromium`), since the account surface reads balances through the changed rules
- [ ] 8.8 Spec against implementation: every MODIFIED and ADDED requirement and scenario of the delta is traced to code and to a passing test in a Verification Record in this file, with the red-first results of groups 1 to 6; a requirement without a passing test is reported to the operator, not checked

## 9. Review Gate

- [ ] 9.1 Operator review and approval
- [ ] 9.2 Archive: promote the delta (`transaction-ledger` 1.2.0), note the change on the capability map's ledger roster row and Phase 5 row (not delivered — the surfaces follow), add standing items for the budget-actuals finding (Phase 7) and for the surface decisions S1 to S12 recorded in this change's design, confirm every link resolves from the promoted location, and rewrite the archived proposal, design and tasks links for the archive depth
