# Domain Model Baseline — Tasks

**Change**: `domain-model-baseline`
**Version**: 1.0.0
**Last Updated**: 2026-08-08

## 1. Analysis (prerequisite, completed before authoring)

- [x] 1.1 Map all 25 tables of the vendored DDL (`mmex/database/tables.sql`, schema version 21) into domains with their implicit foreign keys, unique constraints, and conventions
- [x] 1.2 Extract behavioral invariants from the C++ model layer (`mmex/moneymanagerex/src/model/`), including flow rules, REPEATS encoding, position/asset cache recomputation, rate resolution, and budget overlay
- [x] 1.3 Survey the current PWA implementation and existing capability boundaries (`infrastructure-baseline`, `cloud-file-sync`) to prevent overlap

## 2. Authoring

- [x] 2.1 Write [proposal.md](./proposal.md) (why, what changes, 11 new capabilities, impact)
- [x] 2.2 Write [design.md](./design.md) (decomposition decisions D1–D8, dependency graph, phase order, risk table R1–R8, open UX questions)
- [x] 2.3 Write delta spec `domain-data-conventions` (round-trip fidelity, custody, vocabularies, integrity duties)
- [x] 2.4 Write delta spec `file-metadata-and-settings`
- [x] 2.5 Write delta spec `currency-management`
- [x] 2.6 Write delta spec `account-management`
- [x] 2.7 Write delta spec `transaction-taxonomy`
- [x] 2.8 Write delta spec `transaction-ledger`
- [x] 2.9 Write delta spec `scheduled-transactions`
- [x] 2.10 Write delta spec `budget-management`
- [x] 2.11 Write delta spec `investment-tracking` (spot-checked `Model_Stock.cpp` position math)
- [x] 2.12 Write delta spec `asset-tracking` (spot-checked `Model_Asset.cpp` `valueAtDate`: continuous daily compounding applies regardless of `VALUECHANGEMODE`; the mode column is custody)
- [x] 2.13 Write delta spec `record-extensions`
- [x] 2.14 Publish the living roadmap [designs/domain-capability-map.md](../../designs/domain-capability-map.md)

## 3. Compliance Validation

- [x] 3.1 `openspec validate domain-model-baseline` passes (CLI 1.7.0: "Change 'domain-model-baseline' is valid")
- [x] 3.2 Sweep: every requirement has at least one `#### Scenario:` (four hashtags) with **WHEN**/**THEN** bullets and SHALL language (79 requirements, 93 scenarios, zero three-hashtag scenarios, zero requirements without a scenario)
- [x] 3.3 Sweep: English-only content (zero CJK matches), kebab-case file and capability names, every mermaid diagram carries an italic caption (13 diagrams, 13 captions)
- [x] 3.4 Sweep: enum and value lists verified against the C++ headers — 8 account types, 5 status keys (`""`/R/V/F/D), 17 repeat types, 9 budget periods, 8 custom-field types, 8 REFTYPE strings, 7 asset types. Found and fixed one drift during the sweep: budget `PERIOD` persisted strings are `Fortnightly` and `Every 2 Months` (per `Model_Budget.cpp` `PERIOD_CHOICES`), not the DDL comment's `Bi-Weekly`/`Bi-Monthly`
- [x] 3.5 Boundary check: no requirement duplicates `infrastructure-baseline` (persistence/migration mechanics, i18n, styling, testing, CI) or `cloud-file-sync` ownership; boundaries stated in each Scope

## 4. Verification (AGENTS.md Verification Duty)

- [x] 4.1 Read-only audit of the new-database path. `DATAVERSION` = `3` is seeded via the raw execution of the vendored `tables.sql` — satisfied. **Three gaps reported to the operator (not fixed here)**: (a) `initNewDb()` in [src/stores/database-store.ts](../../../src/stores/database-store.ts) never writes `BASECURRENCYID` — the wizard's chosen currency is discarded; (b) the same function's currency `INSERT ... FROM json_each(...)` is fed an empty `{ currencies: [] }` payload and references columns `json_each` does not produce — placeholder code; (c) the worker executes `tables.sql` raw, so PWA-created databases keep the `_tr_` translation prefixes in seed rows (for example category `_tr_Bills`) that desktop strips at build time — a fidelity divergence for newly created files. These block the "New database matches upstream seeding" and "New database seeds the well-known facts" scenarios until fixed by a follow-up change
- [x] 4.2 Custody requirements hold today: the implementation creates the vendored schema unmodified, applies only vendored migrations, and does not interpret or rewrite domain tables
- [x] 4.3 No behavioral requirement asserts the existence of an unimplemented feature (all conditional-phrased); the only mismatches are the seeding gaps in 4.1
- [x] 4.4 Existing test suite passes untouched: 38 passed, 1 skipped (spec-only change)

## 5. Review Gate

- [x] 5.1 Operator resolved all seven UX open questions (2026-08-08); resolutions recorded inline in design.md and reflected in the three spec spots that had deferred to them (ledger purge cadence, scheduled processing cadence and prompt style, record-extensions attachment stance and UDFC custody) plus proposal.md and the capability map
- [x] 5.2 Operator approved the eleven capability specs and directed archiving (2026-08-08)
- [x] 5.3 Archive the change (moves delta specs into `openspec/specs/`) — executed via `openspec archive` on 2026-08-08
