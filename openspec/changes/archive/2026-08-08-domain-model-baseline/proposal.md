# Domain Model Baseline — Proposal

**Change**: `domain-model-baseline`
**Version**: 1.0.0
**Last Updated**: 2026-08-08

Related artifacts: [design.md](./design.md) (how), [specs/](./specs/) (eleven new capabilities), [tasks.md](./tasks.md) (authoring and verification steps). Governed by [AGENTS.md](../../AGENTS.md).

## Why

The application is a browser-native remake of MoneyManagerEx, yet no specification governs any of its financial domains. `infrastructure-baseline` explicitly reserves "application or business logic (accounts, transactions, reports, financial rules, or database schema semantics)" for future capability specifications, and `cloud-file-sync` disclaims schema and financial logic entirely. Meanwhile the implementation already creates the full upstream schema (25 tables, `PRAGMA user_version` 21) from the vendored DDL — data whose meaning no specification records. Every future feature change would otherwise have to invent domain vocabulary ad hoc, and the upstream sources are treacherous to re-derive from: the DDL's enum comments are stale in places (the C++ model headers are authoritative), `BUDGETSPLITTRANSACTIONS_V1` belongs to scheduled transactions despite its name, and referential integrity exists almost nowhere at SQL level. The operator has decided (2026-08-08) to establish the complete domain baseline now, in one change, ahead of feature implementation, with **full bidirectional `.mmb` compatibility** as a hard constraint: the same file must round-trip between desktop MMEX and this application without loss.

## What Changes

- **Eleven new capability specifications** are added, partitioning the 25-table schema and its business rules into domains: `domain-data-conventions` (cross-cutting rules and the round-trip fidelity doctrine), `file-metadata-and-settings`, `currency-management`, `account-management`, `transaction-taxonomy`, `transaction-ledger`, `scheduled-transactions`, `budget-management`, `investment-tracking`, `asset-tracking`, and `record-extensions`.
- **Specification-only**: this change alters no code, configuration, or dependencies. Baseline requirements are written data-model-first — custody and fidelity obligations that the current implementation already satisfies, plus behavioral rules phrased as conditional definitions ("WHEN the application computes … THEN it SHALL …") that bind each future feature the moment it exists. User-facing feature obligations (registers, editors, routes) are deliberately absent; later implementation changes ADD them to these capabilities.
- **A living capability map** ([designs/domain-capability-map.md](../../designs/domain-capability-map.md)) records the capability roster, dependency graph, and recommended implementation phase order for future changes to cite.
- **UX divergence protocol**: where a desktop behavioral rule is entangled with desktop UX (for example purge-on-open timing or startup auto-execution prompts), the baseline states the rule UX-neutrally and the open UX decision is recorded in [design.md](./design.md) for the operator to resolve before the affected feature is implemented.

## Capabilities

### New Capabilities

- `domain-data-conventions`: `.mmb` round-trip fidelity doctrine, polymorphic reference vocabulary, sentinel values, date and identifier conventions, enum persistence rules, and application-level referential integrity duties shared by every domain capability.
- `file-metadata-and-settings`: semantics and custody of the two key-value stores (`INFOTABLE_V1` per-file facts vs `SETTING_V1` user preferences) and custody-only handling of `REPORT_V1` and `USAGE_V1`.
- `currency-management`: currency definitions, formatting and precision, base currency, exchange-rate history, and date-based rate resolution.
- `account-management`: account records, the eight account types, status, initial balance, statement-lock and credit fields, and the account balance definition.
- `transaction-taxonomy`: the category tree, payees, tags, polymorphic tag links, and relocate/merge semantics.
- `transaction-ledger`: the core transaction ledger and split lines — types, statuses, flow and balance contribution, transfers, foreign-transaction linkage representation, soft delete and retention, statement-lock enforcement.
- `scheduled-transactions`: recurring transaction series, the multiplexed repeat encoding, occurrence lifecycle, and projection of future occurrences.
- `budget-management`: budget periods, per-category budget entries, and the yearly/monthly overlay computation.
- `investment-tracking`: stock positions as derived caches over linked ledger transactions, share detail rows, symbol-keyed price history, and position recomputation duties.
- `asset-tracking`: asset records, appreciation/depreciation valuation, linked-transaction replay, and the asset value cache.
- `record-extensions`: polymorphic attachments (metadata custody) and user-defined custom fields.

### Modified Capabilities

- None. `infrastructure-baseline` and `cloud-file-sync` are untouched; boundary statements live in the new capabilities' Scope sections.

## Impact

- **Code**: none in this change. The current implementation already satisfies every custody requirement (it creates the vendored schema unmodified and does not interpret domain tables); behavioral requirements are conditionally phrased and bind future features.
- **Configuration**: none.
- **External dependencies**: none. Authority for persisted vocabularies is the vendored upstream source ([mmex/database/tables.sql](../../../mmex/database/tables.sql) and `mmex/moneymanagerex/src/model/Model_*.h`), already governed by `infrastructure-baseline`'s Vendored Source Provenance requirement.
- **Follow-on work**: each domain is implemented by its own future change that ADDs feature requirements to the capability established here, in the phase order recorded in the capability map. Attachment binaries are permanently out of scope by operator decision (read-only metadata stance, 2026-08-08); any report execution engine remains a gated open question, not a commitment.
- **Out of scope**: reports engine and `REPORT_V1` execution (no Lua runtime in the browser), import/export (QIF/CSV/XML/OFX/JSON), the transaction filter language, homepage dashboard widgets, bulk edit, online quote/rate fetching, telemetry writing, desktop webapp-sync parity, and any UI mandate beyond what the conventions require of persisted data.
