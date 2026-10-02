# Transaction Taxonomy Fidelity — Tasks

**Change**: `transaction-taxonomy-fidelity`
**Version**: 1.0.0
**Last Updated**: 2026-10-02

Related artifacts: [proposal.md](./proposal.md), [design.md](./design.md), [specs/transaction-taxonomy/spec.md](./specs/transaction-taxonomy/spec.md), [specs/record-extensions/spec.md](./specs/record-extensions/spec.md), [specs/domain-data-conventions/spec.md](./specs/domain-data-conventions/spec.md), [specs/transaction-ledger/spec.md](./specs/transaction-ledger/spec.md), [specs/scheduled-transactions/spec.md](./specs/scheduled-transactions/spec.md). Governed by [AGENTS.md](../../../AGENTS.md). Each task names how it is verified; a box is checked only once that verification has passed and its result is written next to the box. Every test is written to fail on the current code before the fix; the red result is recorded.

## 1. Conventions and rules

- [ ] 1.1 In [src/domain/conventions.ts](../../../src/domain/conventions.ts), make `namesEqual` fold the 26 ASCII letters only (spec `domain-data-conventions`, decision 9, design R5); verify with a failing-then-passing test in [src/__tests__/domain/conventions.spec.ts](../../../src/__tests__/domain/conventions.spec.ts): `Grocery`/`GROCERY` equal, `Époque`/`époque` distinct
- [ ] 1.2 In [src/domain/rules/taxonomy.ts](../../../src/domain/rules/taxonomy.ts), add `validateCategoryName` (empty, `:`) and `validateTagName` (empty, space, exactly `&` or `|`) returning a typed reason (design D1); verify with rule tests covering each refusal and an accepted name
- [ ] 1.3 In [src/domain/rules/taxonomy.ts](../../../src/domain/rules/taxonomy.ts), add `isValidWebsite` porting desktop's `isValidURI` (design D10) and `validatePayee` (empty name, website); verify with tests on desktop-accepted (`example.com/x`, `https://shop.example.com/?a=1`) and refused (`not a url`, `example`) values
- [ ] 1.4 In [src/domain/rules/taxonomy.ts](../../../src/domain/rules/taxonomy.ts), make `parsePayeePatterns` accept desktop's object form and the legacy array, add `serializePayeePatterns` (blanks dropped, renumbered, four-space pretty print) and `validatePayeePatterns` (`regex:` compiled with `RegExp(…, 'i')`) (design D9); verify with tests: `{"0": "AMAZON*", "1": "regex:^AMZN"}` round-trips byte for byte, an array reads, `regex:(unclosed` is refused with its index
- [ ] 1.5 In [src/domain/rules/taxonomy.ts](../../../src/domain/rules/taxonomy.ts), add `DEFAULT_CATEGORY_MODE` and `parseDefaultCategoryMode` (absent or unknown → `lastUsed`) (design D11); document `isHidden` as categories-and-payees only; sort `tagsFor` by name (decision 16); verify with tests for the codec, and that `tagsFor` returns `business` before `travel` regardless of link order

## 2. File facts

- [ ] 2.1 In [src/domain/rules/metadata.ts](../../../src/domain/rules/metadata.ts), add `SETTING_KEY.showHiddenCategories` (`SHOW_HIDDEN_CATEGS`), `SETTING_KEY.showHiddenPayees` (`SHOW_HIDDEN_PAYEES`), `SETTING_KEY.transactionCategoryNone` (`TRANSACTION_CATEGORY_NONE`), `INFO_KEY.categoryDelimiter` (`CATEG_DELIMITER`) and their `DEFAULTS` (true, true, `lastUsed`, `:`) (design D7, D11); verify with [src/__tests__/domain/metadata.spec.ts](../../../src/__tests__/domain/metadata.spec.ts) asserting the key strings and that `keyTable` routes `CATEG_DELIMITER` to `INFOTABLE` and the three others to `SETTING_V1`
- [ ] 2.2 In [src/domain/repos/metadata.ts](../../../src/domain/repos/metadata.ts), add `fileFacts.showHiddenCategories`, `showHiddenPayees`, `defaultCategoryMode`, `categoryDelimiter` with the defaults for an absent key; verify with fake-`DomainDb` tests for the absent key and for a stored `FALSE`, `2`, ` / `

## 3. Category repository

- [ ] 3.1 In [src/domain/repos/taxonomy.ts](../../../src/domain/repos/taxonomy.ts), add the error classes of design D1 and `categoryRepo.usage(id)` returning the `TaxonomyUsage` report of D2 (live predicate on `DELETEDTIME`, trashed ids, descendant recursion, budget rows and payee defaults reported but not blocking); write the test first in a new file `src/__tests__/domain/taxonomy-repo.spec.ts` (linked here once it exists) against a fixture with one live, one trashed and one split reference, a budget row, a payee default and a used descendant; verify red on `usageCount`, green on `usage`
- [ ] 3.2 Replace `categoryRepo.remove` with `remove(id, { purgeTrashed })` per design D3: `used` → `TaxonomyInUseError`; `onlyTrashed` without the flag → refusal; with it, the ledger hard-delete statements of D4 for the trashed ids, then `BUDGETTABLE_V1` delete, `PAYEE_V1` default clearing, `CATEGORY_V1` delete over subtree and self; verify with tests asserting refusal, the purge statements, and the cascade order and bound ids
- [ ] 3.3 Replace `categoryRepo.relocate` with `relocate(from, to, { deleteSource })` per design D5: refuse same or hidden target or (with `deleteSource`) a source with children; two updates for `CHECKINGACCOUNT_V1` (live with `LASTUPDATEDTIME`, trashed without), updates for splits, series, series splits, payee defaults; `BUDGETTABLE_V1` rows of the source deleted; counts returned; verify with tests asserting each statement's predicate, the stamp bound only on the live update, no `UPDATE BUDGETTABLE_V1`, and the refusals
- [ ] 3.4 Add `categoryRepo.setHiddenStatements(id, hidden)` cascading to the subtree, make `addStatement` write `ACTIVE 1` under a hidden parent, allow `reparentStatement` to `-1`, and add `renameStatement` accepting a case-only rename and refusing `:` or a sibling duplicate (design D7, decisions 12, 17, 18); verify with tests for each
- [ ] 3.5 Add `categoryRepo.removeMany(ids, { purgeTrashed })` returning removed and refused ids (design D3, D12); verify with a test mixing a used and an unused category

## 4. Payee repository

- [ ] 4.1 Add `payeeRepo.usage(id)` (live transactions, trashed ids, series) per design D2; verify red on `usageCount` with a trashed-only fixture (`usageCount` reports 1, `usage().state()` must be `onlyTrashed`), green after
- [ ] 4.2 Make `payeeRepo.addStatement` and `updateStatement` validate the name and website (design D10), write `CATEGID -1` for no default, write `PATTERN` through the codec only when patterns are given, and force `ACTIVE` from the hidden flag; verify with tests: empty name refused, `not a url` refused naming `website`, `CATEGID` bound as `-1`, `PATTERN` absent from an update that changes only the name
- [ ] 4.3 Replace `payeeRepo.remove` with `remove(id, { purgeTrashed })` per design D3 (purge, then attachment and custom-field cleanup, then the row); verify with tests for refusal, purge statements, and cascade
- [ ] 4.4 Replace `payeeRepo.relocate` with `relocate(from, to, { deleteSource })` per design D5: no `ATTACHMENT_V1` statement in the merge; live and trashed updates for `CHECKINGACCOUNT_V1`; `BILLSDEPOSITS_V1` update; `deleteSource` appends the D3 cascade including attachment rows; verify with tests asserting the absence of any `ATTACHMENT_V1` update, the presence of the attachment delete only with `deleteSource`, and the counts
- [ ] 4.5 Add `payeeRepo.setHiddenStatements(ids, hidden)`, `setDefaultCategoryStatements(ids, categoryId | -1)` and `removeMany` (design D12); verify with tests asserting one statement per gesture over the given ids

## 5. Tag repository

- [ ] 5.1 Add `tagRepo.usage(id)` with the `used | onlyTrashed | unused` state per design D2 (series and series-split links always used; links to missing records counted as orphans); verify red on `usageCount` (an orphan link counts as 1), green after, with fixtures for each state
- [ ] 5.2 Replace `tagRepo.remove` with the guarded `remove(id, { purgeTrashed })` of design D3 (refuse `used`; purge `onlyTrashed` on the flag; delete remaining links then the row) and add `removeMany`; verify red (current `remove` deletes a used tag's links), green after
- [ ] 5.3 Replace `tagRepo.relocate` per design D6: refuse same entity and hidden target (always visible, so only same entity applies), compute collapsed count, `UPDATE OR IGNORE` then delete, return moved and collapsed; verify red (`relocate(x, x)` emits a delete of every link of `x`), green after, and a collision fixture reporting one collapsed
- [ ] 5.4 Make `tagRepo.addStatement` and a new `renameStatement` validate the name (design D1) and always write `ACTIVE 1` (design D7); verify with tests for `&`, `|`, `summer trip`, an empty name, and the bound `ACTIVE`

## 6. Split replacement and series split cleanup

- [ ] 6.1 In [src/domain/repos/ledger.ts](../../../src/domain/repos/ledger.ts), make `replaceSplitsStatements` asynchronous and per design D8: lines carry optional `tagIds`; emit the `TransactionSplit` link delete by subquery, the row delete, each insert followed by its `INSERT OR IGNORE INTO TAGLINK_V1` keyed by `(SELECT MAX(SPLITTRANSID) FROM SPLITTRANSACTIONS_V1)`, and the `LASTUPDATEDTIME` update only when the set changed; verify red in a new file `src/__tests__/domain/ledger-repo.spec.ts` (linked here once it exists; current builder emits no `TAGLINK_V1` statement), green after, including an unchanged-set case with no stamp
- [ ] 6.2 In [src/domain/repos/scheduled.ts](../../../src/domain/repos/scheduled.ts), do the same for `replaceSplitsStatements` over `BUDGETSPLITTRANSACTIONS_V1` with `RecurringTransactionSplit` and no stamp; verify in [src/__tests__/domain/scheduled-repo.spec.ts](../../../src/__tests__/domain/scheduled-repo.spec.ts) red then green
- [ ] 6.3 Add `RecurringTransactionSplit` cleanup where series split rows are deleted: series removal and `removeMany` in [src/domain/repos/scheduled.ts](../../../src/domain/repos/scheduled.ts), account removal in [src/domain/repos/account.ts](../../../src/domain/repos/account.ts) (design D8, C4); verify with tests asserting a `TAGLINK_V1` delete with `REFTYPE` `RecurringTransactionSplit` and the split ids in each batch
- [ ] 6.4 Expose the ledger's hard-delete statement builder for a list of transaction ids (design D4) if it is inline today, with no change in the statements it emits; verify the existing ledger tests still pass and the taxonomy purge tests use it

## 7. Risk coverage tests

- [ ] 7.1 R1: a rule test lists `regex:` patterns accepted and refused by JavaScript, with a comment on the wx-extended difference for each refused one; verify the test passes and the list is cited in design R1
- [ ] 7.2 R2: a rule test shows `münchen.example/x` is refused and `example.com/x` accepted, as recorded; verify it passes
- [ ] 7.3 R3: the 6.1 and 6.2 tests assert that every `TAGLINK_V1` insert immediately follows its split insert and carries the `MAX(SPLITTRANSID)` expression; verify they pass
- [ ] 7.4 R4 and R6: the 5.3 test asserts the collapsed-count query precedes the batch and the batch uses `OR IGNORE`; every repository test asserts the `DELETEDTIME` live predicate by text where the design requires it; verify they pass
- [ ] 7.5 R5: the 1.1 test covers both folding cases; R7: `grep -rn "usageCount\|relocate(\|\.remove(" src --include=*.ts --include=*.vue` outside the domain and its tests finds no caller, recorded here; R8: the 3.2, 4.3 and 5.2 tests assert that `onlyTrashed` without `purgeTrashed` emits no statement; verify

## 8. Verification

- [ ] 8.1 `openspec validate transaction-taxonomy-fidelity --strict` passes
- [ ] 8.2 `npm run test:unit` passes with a higher count than before this change (438 passed, 1 skipped before)
- [ ] 8.3 `npm run type-check` passes
- [ ] 8.4 `npm run lint:check` passes
- [ ] 8.5 `npm run format:check` passes
- [ ] 8.6 `npm run build` succeeds
- [ ] 8.7 Spec against implementation: every MODIFIED and ADDED requirement across the five deltas is traced to code and to a passing test in a Verification Record in this file, with the red-first results of groups 1 to 6 recorded; any requirement without a passing test is reported to the operator, not checked

## 9. Review Gate

- [ ] 9.1 Operator review and approval
- [ ] 9.2 Archive: promote the five deltas, set `transaction-taxonomy` 1.1.0, `record-extensions` 1.1.0, `domain-data-conventions` 1.2.0, `transaction-ledger` 1.1.0, `scheduled-transactions` 1.2.0, update each Purpose if needed, raise the capability map to 1.9.0 with the Phase 4 row noting this change, confirm every link resolves from the promoted locations, and rewrite the archived proposal, design and tasks links for the archive depth
