# Transaction Ledger — Delta: Split Replacement Keeps Tags

**Change**: `transaction-taxonomy-fidelity`
**Capability**: `transaction-ledger`
**Version**: 1.1.0
**Last Updated**: 2026-10-02

Governed by [AGENTS.md](../../../AGENTS.md). Links are written relative to where this file is promoted, `openspec/specs/transaction-ledger/spec.md`.

**Scope**: States what replacing a transaction's split lines does with the split rows' tag links and with the transaction's update stamp. Nothing else in the requirement changes.

## MODIFIED Requirements

### Requirement: Split Transactions

The application SHALL support splitting a transaction into category lines (`SPLITTRANSACTIONS_V1`), whose presence makes the parent's `CATEGID` non-authoritative.

- When one or more split rows exist, aggregation by category SHALL use the split rows and ignore the parent's `CATEGID`.
- Split amounts SHALL sum to the transaction amount.
- Each split line SHALL be able to carry its own notes and tags (`TransactionSplit` reference type).
- Replacing a transaction's split lines SHALL, in one logical operation, remove the tag links of the split rows being removed, write the new split rows, and attach each new row's tags to it; no tag link SHALL be left pointing at a removed split row, and no tag given with a line SHALL be lost by the replacement.
- When the replacement changes the set of split lines — a different count, or any category, amount or note that differs — the transaction's `LASTUPDATEDTIME` SHALL be set to the time of the replacement; an unchanged set SHALL NOT stamp it.

Traceability: [mmex/moneymanagerex/src/model/Model_Splittransaction.h](../../../mmex/moneymanagerex/src/model/Model_Splittransaction.h), [mmex/moneymanagerex/src/model/Model_Splittransaction.cpp](../../../mmex/moneymanagerex/src/model/Model_Splittransaction.cpp) (`update` compares the set and stamps; `remove` deletes the row's tag links), [mmex/moneymanagerex/src/transdialog.cpp](../../../mmex/moneymanagerex/src/transdialog.cpp) (tags re-attached to the new rows), [src/domain/repos/ledger.ts](../../../src/domain/repos/ledger.ts).

#### Scenario: Splits shadow the parent category

- **WHEN** a transaction with parent category `X` carries split rows for categories `Y` and `Z`
- **THEN** category aggregation SHALL count the split amounts under `Y` and `Z` and nothing under `X`

#### Scenario: Split sum is validated

- **WHEN** the user edits split lines so their sum differs from the transaction amount
- **THEN** the application SHALL NOT persist the mismatch

#### Scenario: Split tags survive an edit

- **WHEN** the user edits a transaction whose first split line carries the tag `travel` and saves with that line unchanged
- **THEN** the saved first split line SHALL carry `travel`
- **AND** no tag link SHALL reference a split row that no longer exists

#### Scenario: Unchanged splits do not stamp

- **WHEN** the user saves a transaction whose split lines are identical to the stored ones
- **THEN** the transaction's `LASTUPDATEDTIME` SHALL be unchanged by the split replacement
