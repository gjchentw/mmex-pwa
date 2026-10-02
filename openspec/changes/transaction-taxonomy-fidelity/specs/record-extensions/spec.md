# Record Extensions — Delta: Attachments Stay on a Merged Source

**Change**: `transaction-taxonomy-fidelity`
**Capability**: `record-extensions`
**Version**: 1.1.0
**Last Updated**: 2026-10-02

Governed by [AGENTS.md](../../../AGENTS.md). Links are written relative to where this file is promoted, `openspec/specs/record-extensions/spec.md`.

**Scope**: Corrects what a merge does with attachment rows. The baseline requirement "Attachment Cascade" said a merge relocates them, and its only scenario was named for that claim; desktop leaves them on the source and removes them only when the source is deleted. Because a MODIFIED block must keep every existing scenario, the requirement is removed and restated under a name that matches its content. The removal cascade on host deletion is unchanged in substance.

## REMOVED Requirements

### Requirement: Attachment Cascade

**Reason**: Its merge clause and the scenario "Merge relocates attachments" contradict desktop, which never rewrites `ATTACHMENT_V1.REFID` on a merge (`relocatepayeedialog.cpp`, 162–182). The deletion cascade it also stated is carried forward unchanged by the requirement added below.

**Migration**: None for stored data; no merge has run through this application yet. Implementations reference "Attachment Rows on Removal and Merge" instead.

## ADDED Requirements

### Requirement: Attachment Rows on Removal and Merge

When a host record is removed (including ledger purge), its attachment rows SHALL be removed with it, per the host capability's cascade rules. When a host record is merged into another, its attachment rows SHALL stay on the source; when the source is deleted after the merge, they SHALL be removed with it.

- No merge SHALL rewrite `ATTACHMENT_V1.REFID`.
- The attachment binaries are never touched: the read-only stance (operator decision 2026-08-08) holds, so a removed row leaves its desktop-side file where it is.

Traceability: [mmex/moneymanagerex/src/relocatepayeedialog.cpp](../../../mmex/moneymanagerex/src/relocatepayeedialog.cpp) (no relocation of attachments; `DeleteAllAttachments` only when the source is deleted), [mmex/moneymanagerex/src/attachmentdialog.h](../../../mmex/moneymanagerex/src/attachmentdialog.h) (`DeleteAllAttachments`), [src/domain/repos/taxonomy.ts](../../../src/domain/repos/taxonomy.ts), [src/domain/repos/extensions.ts](../../../src/domain/repos/extensions.ts).

#### Scenario: Host removal removes attachment rows

- **WHEN** a payee that carries attachment rows is deleted
- **THEN** its attachment rows SHALL be removed in the same operation

#### Scenario: Merge leaves attachments on the source

- **WHEN** the user merges payee `A`, which carries attachments, into payee `B` without deleting `A`
- **THEN** the attachment rows SHALL still reference `A` afterwards

#### Scenario: Deleting the merged source removes its attachment rows

- **WHEN** the user merges payee `A`, which carries attachments, into payee `B` and asks for `A` to be deleted after the merge
- **THEN** `A` and its attachment rows SHALL be removed in the same operation
- **AND** no attachment row SHALL reference `B` because of the merge
