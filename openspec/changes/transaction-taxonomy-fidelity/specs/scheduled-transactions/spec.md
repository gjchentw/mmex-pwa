# Scheduled Transactions — Delta: Series Split Line Replacement

**Change**: `transaction-taxonomy-fidelity`
**Capability**: `scheduled-transactions`
**Version**: 1.2.0
**Last Updated**: 2026-10-02

Governed by [AGENTS.md](../../../AGENTS.md). Links are written relative to where this file is promoted, `openspec/specs/scheduled-transactions/spec.md`.

**Scope**: Adds what replacing or deleting a series' split lines does with the split rows' tag links. No existing requirement changes.

## ADDED Requirements

### Requirement: Series Split Line Replacement

Replacing a series' split lines (`BUDGETSPLITTRANSACTIONS_V1`) SHALL, in one logical operation, remove the tag links (`RecurringTransactionSplit`) of the rows being removed, write the new rows, and attach each new row's tags to it; no tag link SHALL be left pointing at a removed row, and no tag given with a line SHALL be lost by the replacement.

- Whenever series split rows are deleted — with their series, with their account, or by replacement — their tag links SHALL be deleted in the same operation.
- `BILLSDEPOSITS_V1` carries no update stamp, so a replacement SHALL write nothing to the series row.

Traceability: [mmex/moneymanagerex/src/model/Model_Budgetsplittransaction.cpp](../../../mmex/moneymanagerex/src/model/Model_Budgetsplittransaction.cpp) (`update` replaces the rows; `remove` deletes the row's tag links), [mmex/moneymanagerex/src/billsdepositsdialog.cpp](../../../mmex/moneymanagerex/src/billsdepositsdialog.cpp) (tags re-attached to the new rows), [src/domain/repos/scheduled.ts](../../../src/domain/repos/scheduled.ts), [src/domain/repos/account.ts](../../../src/domain/repos/account.ts).

#### Scenario: Series split tags survive an edit

- **WHEN** the user edits a series whose first split line carries the tag `rent` and saves with that line unchanged
- **THEN** the saved first split line SHALL carry `rent`
- **AND** no tag link SHALL reference a series split row that no longer exists

#### Scenario: Deleting a series removes its split tag links

- **WHEN** the user deletes a series whose split lines carry tags
- **THEN** the series, its split rows and their tag links SHALL be removed in the same operation
