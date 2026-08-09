# Domain Data Layer — Tasks

**Change**: `domain-data-layer`
**Version**: 1.0.0
**Last Updated**: 2026-08-09

## 1. Persistence Primitives

- [x] 1.1 Worker: optional `rowMode` on `exec` (default unchanged, so existing callers keep positional arrays) and a new `exec-tx` message applying an ordered statement list inside `db.transaction()` ([src/workers/sqlite.worker.ts](../../../src/workers/sqlite.worker.ts))
- [x] 1.2 Client: `query` (object rows) and `mutate` (atomic statement list) methods, the latter firing the existing sync mutation listener ([src/workers/db-client.ts](../../../src/workers/db-client.ts))

## 2. Foundation

- [x] 2.1 [src/domain/conventions.ts](../../../src/domain/conventions.ts) — reference-type vocabulary, `-1` sentinel helpers, ISO date codec (write combined, parse both; audit stamps in UTC as upstream does), case-insensitive name comparison, enum codec factory
- [x] 2.2 [src/domain/db.ts](../../../src/domain/db.ts) — typed query/mutate surface with an injection point for tests, plus insert/update/delete statement builders; [src/domain/records.ts](../../../src/domain/records.ts) types all 25 tables with their column names verbatim

## 3. Capability Modules (mirroring upstream `Model_*`)

- [x] 3.1 `rules/metadata.ts` + `repos/metadata.ts` — store separation, well-known keys with upstream defaults, unknown-key preservation, report/usage custody
- [x] 3.2 `rules/currency.ts` + `repos/currency.ts` — precision from scale, formatting and parsing, day-rate resolution with the earlier-row tie rule, in-use deletion guard cascading history
- [x] 3.3 `rules/account.ts` + `repos/account.ts` — eight types and status with upstream fallbacks, balance definition, favorite text encoding, deletion cascade over transactions, series and positions
- [x] 3.4 `rules/taxonomy.ts` + `repos/taxonomy.ts` — category tree with cycle rejection and sibling uniqueness, payee pattern custody, polymorphic tag links, usage-guarded deletion, relocate/merge
- [x] 3.5 `rules/ledger.ts` + `repos/ledger.ts` — status keys, account flow, split shadowing and sum validation, foreign-transaction sentinels, soft delete with retention purge, statement-lock enforcement
- [x] 3.6 `rules/scheduled.ts` + `repos/scheduled.ts` — multiplexed repeats, seventeen next-date rules, occurrence counting, non-idempotent advancement, execution guard, bounded projection, due processing
- [x] 3.7 `rules/budget.ts` + `repos/budget.ts` — period naming, nine annualization factors, the yearly/monthly overlay under both options, actuals join, period copying
- [x] 3.8 `rules/investment.ts` + `repos/investment.ts` — trade triple, moving-average cost book with persisted write-back, symbol-keyed history, valuation and gains
- [x] 3.9 `rules/asset.ts` + `repos/asset.ts` — classification, continuous daily compounding, linked replay with self-transfer revaluation, value cache write-back
- [x] 3.10 `rules/extensions.ts` + `repos/extensions.ts` — attachment metadata custody, custom field definitions/values with validation, shared polymorphic cleanup used by every cascade

## 4. Tests

- [x] 4.1 Foundation — date codec both forms, UTC audit stamps, sentinels, case-insensitive comparison, pinned reference-type strings, enum fallback
- [x] 4.2 Currency — precision from scale, formatting/parsing, rate resolution across exact/nearest/tie/ends/disabled/no-history
- [x] 4.3 Ledger — flow signs, void and deleted and self-transfer exclusion, cross-currency transfer, split shadowing and sum validation, statement lock, retention purge
- [x] 4.4 Scheduled — repeat encode/decode, every next-date rule including last day and last business day, advancement, exhaustion, in-X conversion to once, bounded projection
- [x] 4.5 Budget — persisted period strings (the stale DDL spellings are absent), annualization factors, overlay under all four option combinations
- [x] 4.6 Investment — cost book across buys and sells, average-cost relief, order independence, void/deleted skipping, write-back values, legacy position, gains
- [x] 4.7 Asset — reversed status ordinals, continuous compounding, replay, self-transfer revaluation, day-rate conversion, pre-start-date zero, write-back
- [x] 4.8 Taxonomy and extensions — path rendering, subtree, cycle and sibling rejection, pattern custody, tag link scoping and dedupe, property preservation, field validation
- [x] 4.9 Repositories — cleanup emits no schema constraints, cascade arrives as one batch with the parent last, trash versus immediate delete, split-sum refusal, statement-lock refusal, cache write-back statements

## 5. Verification

- [x] 5.1 `openspec validate domain-data-layer` passes
- [x] 5.2 Unit suite 155 passed / 1 skipped (up from 42); `vue-tsc`, ESLint (`--max-warnings=0`) and Prettier all clean
- [x] 5.3 No domain SQL outside `src/domain/`. The sweep found one violation — the new-database seeding written into [src/stores/database-store.ts](../../../src/stores/database-store.ts) by the previous change — now routed through `infoRepo.setMany`, which also makes the two writes atomic. The only remaining match is the worker's legacy schema-version probe, which the spec exempts as lifecycle mechanics governed by `infrastructure-baseline`

## 6. Review Gate

- [x] 6.1 Operator reviewed and approved the change (2026-08-09)
- [x] 6.2 Archived — `domain-data-access` promoted to `openspec/specs/`
