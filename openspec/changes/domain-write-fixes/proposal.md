# Domain Write Fixes — Proposal

**Change**: `domain-write-fixes`
**Version**: 1.0.0
**Last Updated**: 2026-10-02

Related artifacts: [design.md](./design.md) (how), [specs/scheduled-transactions/spec.md](./specs/scheduled-transactions/spec.md) and [specs/investment-tracking/spec.md](./specs/investment-tracking/spec.md) (capability deltas), [tasks.md](./tasks.md) (implementation steps). Governed by [AGENTS.md](../../../AGENTS.md).

## Why

The 2026-10-02 fidelity audit of the Phase 4 domain layer found, incidentally, two write paths elsewhere in the domain layer that produce rows desktop MoneyManagerEx cannot read correctly or that SQLite refuses. Neither has a surface yet, so neither has fired in use, but both sit in code the later phases will call:

- `scheduledRepo.materializeStatements` inserts each converted split line with `TRANSID = last_insert_rowid()`. After the first split is inserted, that function returns the split's own identifier, so the second and later splits attach to the wrong transaction. A series with two or more split lines would materialize a transaction whose splits do not sum to it and strand split rows on unrelated transactions.
- `investmentRepo.recordTrade` writes `PAYEEID = NULL` when no payee is given. `CHECKINGACCOUNT_V1.PAYEEID` is `NOT NULL`; desktop writes `-1` for "no payee". The insert fails on a real file.

The operator directed on 2026-10-02 that both be fixed now rather than with their phases, each with a failing test first.

## What Changes

- **Scheduled materialization**: every converted split line references the transaction created in the same operation, whatever the number of splits. The statements no longer depend on `last_insert_rowid()` after another insert has run.
- **Share trade recording**: the cash transaction carries the given payee, or the upstream `-1` sentinel when none is given, never `NULL`.
- **Tests**: repository-level tests for both paths, which had none, run against real SQLite in memory so the row linkage is observed rather than inferred.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `scheduled-transactions`: MODIFIES Series Advancement on Execute or Skip, stating that each converted split line references the transaction materialized in the same operation, with a scenario for a series carrying two split lines.
- `investment-tracking`: MODIFIES Share Trade Recording, stating the payee the cash transaction carries and the `-1` sentinel when none is given.

## Impact

- **Code**: [src/domain/repos/scheduled.ts](../../../src/domain/repos/scheduled.ts) (`materializeStatements`), [src/domain/repos/investment.ts](../../../src/domain/repos/investment.ts) (`recordTrade`), and two new repository tests.
- **Configuration**: none. **Dependencies**: none; the tests use the SQLite WebAssembly build already in the project.
- **Verification**: a failing test for each defect before its fix; the repository gate.
- **Out of scope**: the Phase 4 taxonomy remediation (`transaction-taxonomy-fidelity`, next); any surface for scheduled transactions or trades.
