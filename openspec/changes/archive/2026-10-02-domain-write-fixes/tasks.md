# Domain Write Fixes — Tasks

**Change**: `domain-write-fixes`
**Version**: 1.1.0
**Last Updated**: 2026-10-02

Archived 2026-10-02 as `2026-10-02-domain-write-fixes`; both deltas promoted, `scheduled-transactions` and `investment-tracking` at 1.1.0, capability map 1.8.0.

Related artifacts: [proposal.md](./proposal.md), [design.md](./design.md), [specs/scheduled-transactions/spec.md](./specs/scheduled-transactions/spec.md), [specs/investment-tracking/spec.md](./specs/investment-tracking/spec.md). Governed by [AGENTS.md](../../../../AGENTS.md). Each task names how it is verified; a box is checked only once that verification has passed.

## 1. Scheduled materialization

- [x] 1.1 Write a failing repository test in [src/__tests__/domain/scheduled-repo.spec.ts](../../../../src/__tests__/domain/scheduled-repo.spec.ts): a series with two split lines materializes one transaction insert and two split inserts, none of which uses `last_insert_rowid()` and each of which references the transaction through the same key expression; verify the tests fail on the current code. Reworded from "run against SQLite in memory" because the WebAssembly build cannot load under Node (design D3, risk R1 materialized). Verified: before the fix, 2 of 3 tests failed (`never links a split through last_insert_rowid()`, `links every split … same key expression`); the shape test passed, as expected
- [x] 1.2 In [src/domain/repos/scheduled.ts](../../../../src/domain/repos/scheduled.ts), make every split insert reference the new transaction through `(SELECT MAX(TRANSID) FROM CHECKINGACCOUNT_V1)` within the same batch, with a comment naming the SQLite key-assignment rule it relies on (design D1); verify the 1.1 test passes. Verified: 3 of 3 pass after the change

## 2. Share trade recording

- [x] 2.1 Write a failing repository test in [src/__tests__/domain/investment-repo.spec.ts](../../../../src/__tests__/domain/investment-repo.spec.ts): a trade without a payee produces a ledger insert whose bound `PAYEEID` is `-1`, and a trade with payee 42 binds 42. Reworded from "executed against SQLite in memory" for the reason in 1.1 (design D3). Verified: before the fix, `stores -1 as the payee when none is given, never NULL` failed with `expected null to be -1`; the first run of this file failed instead on a wrong import (`investmentRepo`; the export is `stockRepo`), corrected before the red run that counts
- [x] 2.2 In [src/domain/repos/investment.ts](../../../../src/domain/repos/investment.ts), write `input.payeeId ?? -1` (design D2); verify the 2.1 test passes and a trade with a payee still carries it. Verified: 2 of 2 pass after the change

## 3. Verification

- [x] 3.1 `openspec validate domain-write-fixes --strict` passes — "Change 'domain-write-fixes' is valid"
- [x] 3.2 `npm run test:unit` passes with a higher count than before this change (433 passed, 1 skipped before) — 438 passed, 1 skipped (5 new)
- [x] 3.3 `npm run type-check` passes — exit 0
- [x] 3.4 `npm run lint:check` passes — exit 0
- [x] 3.5 `npm run format:check` passes — exit 0
- [x] 3.6 `npm run build` succeeds — exit 0
- [x] 3.7 Spec against implementation: both MODIFIED requirements and their new scenarios are traced to code and to a passing test, recorded in the Verification Record below

## Verification Record (2026-10-02)

| Spec scenario | Implementation | Test | Result |
|---|---|---|---|
| scheduled-transactions, "Every split line lands on the new transaction" | [src/domain/repos/scheduled.ts](../../../../src/domain/repos/scheduled.ts) `materializeStatements`, split inserts reference `(SELECT MAX(TRANSID) FROM CHECKINGACCOUNT_V1)` | [scheduled-repo.spec.ts](../../../../src/__tests__/domain/scheduled-repo.spec.ts), 3 tests | red 2/3 before, green 3/3 after |
| investment-tracking, "A trade without a payee stores the sentinel" | [src/domain/repos/investment.ts](../../../../src/domain/repos/investment.ts) `recordTrade`, `PAYEEID: input.payeeId ?? -1` | [investment-repo.spec.ts](../../../../src/__tests__/domain/investment-repo.spec.ts), 2 tests | red 1/2 before, green 2/2 after |

Gate: `lint:check`, `type-check`, `test:unit` (438 passed, 1 skipped), `format:check`, `build` all exit 0; `openspec validate domain-write-fixes --strict` valid.

Divergence from the design as proposed: D3 called for tests against real SQLite; that was not achievable under Node (R1 materialized) and D3 was revised to statement-shape assertions before any box was checked. No row-level observation of the fix exists yet; it becomes possible in Chromium once a surface materializes a series.

**2026-10-02, operator review**: approved ("ok, commit and /opsx:archive" after the implementation report, which disclosed the D3 revision, F1 and F2).

## Findings

- F1 — The investment test was first written importing `investmentRepo`, which does not exist (`stockRepo` does); its first run failed with a `TypeError`, not the intended assertion. Corrected; the red run recorded in 2.1 is the one after the correction.
- F2 — R1 was rated Low likelihood and materialized at once; the design now records it as Materialized rather than re-rating it after the fact.

## 4. Review Gate

- [x] 4.1 Operator review and approval (2026-10-02, "ok, commit and /opsx:archive" after the implementation report; the D3 revision to statement-shape tests was disclosed and accepted)
- [x] 4.2 Archive (2026-10-02): promote both deltas, raise `scheduled-transactions` and `investment-tracking` to 1.1.0, update each Purpose if needed, note in the capability map's standing items that row-level observation of the split linkage awaits a Chromium e2e once a surface materializes a series (design D3), confirm every link resolves from the promoted locations and rewrite the archived proposal, design and tasks links for the archive depth
