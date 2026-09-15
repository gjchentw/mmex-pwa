# Fix New Database Seeding — Proposal

**Change**: `fix-new-database-seeding`
**Version**: 1.0.0
**Last Updated**: 2026-08-08

Related artifacts: [design.md](./design.md) (how), [specs/domain-data-conventions/spec.md](./specs/domain-data-conventions/spec.md) (baseline delta), [tasks.md](./tasks.md) (implementation steps). Governed by [AGENTS.md](../../../../AGENTS.md).

## Why

Verification of the `domain-model-baseline` change (its tasks 4.1) found that the new-database path — placeholder code from the infrastructure phase — violates the freshly archived baseline in four ways, all confirmed by reading the sources. First, `initNewDb()` receives the wizard's chosen currency but never writes `BASECURRENCYID` to `INFOTABLE_V1`, so the user's base-currency choice is silently discarded. Second, the same function runs a currency `INSERT ... SELECT CURRENCYID ... FROM json_each(...)` fed an empty `{"currencies":[]}` payload, referencing columns `json_each` does not produce — dead placeholder code, redundant anyway because the vendored DDL seeds all 168 currencies. Third, and worst, the `USERNAME` write hardcodes `INFOID = 1` with `INSERT OR REPLACE` — but the vendored DDL seeds `DATAVERSION` at `INFOID` 1, so providing a user name **replaces the `DATAVERSION` row**, breaking the file's version marker. Fourth, the worker executes the vendored `tables.sql` verbatim, so PWA-created databases keep the DDL's `_tr_` translation markers in seed rows (category `_tr_Bills` instead of `Bills`); desktop MoneyManagerEx strips these at build time via `util/sqlite2cpp.py`. These break the baseline scenarios "New database matches upstream seeding" (`domain-data-conventions`) and "New database seeds the well-known facts" (`file-metadata-and-settings`). The desktop implements all four correctly; only newly created PWA databases are affected. The operator directed (2026-08-08): archive the baseline first, then fix in this follow-up change.

## What Changes

- **Seed normalization (worker)**: strip the `_tr_` translation markers from the DDL text before executing it at database creation, mirroring the upstream generator's plain `replace('_tr_', '')`. The markers occur only in seed string literals and comments (verified: zero occurrences in schema identifiers).
- **File-fact seeding (`initNewDb`)**: write `BASECURRENCYID` from the wizard's chosen currency; write `USERNAME` only when provided; both keyed by `INFONAME` (which is `UNIQUE COLLATE NOCASE`), never by a hardcoded `INFOID`, leaving the seeded `DATAVERSION` row untouched. Remove the dead placeholder currency insert.
- **Baseline delta**: `domain-data-conventions`'s MMB Round-Trip Fidelity requirement gains an explicit seed-normalization clause, closing the ambiguity the bug hid behind.
- **Tests**: unit coverage for the three externally observable outcomes — `DATAVERSION` survives a username, `BASECURRENCYID` is written, seed rows carry no `_tr_` markers.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `domain-data-conventions`: MODIFIES `Requirement: MMB Round-Trip Fidelity` — adds the seed-normalization clause (translation markers stripped at creation) and sharpens the "New database matches upstream seeding" scenario accordingly. No other requirement changes.

## Impact

- **Code**: [src/workers/sqlite.worker.ts](../../../src/workers/sqlite.worker.ts) (strip markers before executing the DDL), [src/stores/database-store.ts](../../../src/stores/database-store.ts) (`initNewDb` rewrite), new/extended unit tests under [src/__tests__/](../../../src/__tests__/).
- **Configuration**: none. **Dependencies**: none.
- **Out of scope**: repairing databases already created with `_tr_` seed names or a clobbered `DATAVERSION` — development-stage data with an existing destroy-and-recreate flow (rationale in [design.md](./design.md)); any other seeding parity (for example `CREATEDATE`, `MMEXVERSION`) not required by the baseline.
