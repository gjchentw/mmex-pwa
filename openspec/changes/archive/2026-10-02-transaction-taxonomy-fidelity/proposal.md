# Transaction Taxonomy Fidelity — Proposal

**Change**: `transaction-taxonomy-fidelity`
**Version**: 1.0.0
**Last Updated**: 2026-10-02

Related artifacts: [design.md](./design.md) (how), [specs/transaction-taxonomy/spec.md](./specs/transaction-taxonomy/spec.md), [specs/record-extensions/spec.md](./specs/record-extensions/spec.md), [specs/domain-data-conventions/spec.md](./specs/domain-data-conventions/spec.md), [specs/transaction-ledger/spec.md](./specs/transaction-ledger/spec.md), [specs/scheduled-transactions/spec.md](./specs/scheduled-transactions/spec.md) (capability deltas), [tasks.md](./tasks.md) (implementation steps). Governed by [AGENTS.md](../../../../AGENTS.md).

## Why

Before Phase 4 surfaces are proposed, the operator asked on 2026-10-02 whether the Phase 4 planning — the `transaction-taxonomy` baseline specification (1.0.0) and the domain layer in [src/domain/repos/taxonomy.ts](../../../../src/domain/repos/taxonomy.ts) and [src/domain/rules/taxonomy.ts](../../../../src/domain/rules/taxonomy.ts) — matches desktop MoneyManagerEx. Three independent read-only audits of categories, payees and tags, each high-impact claim re-verified against the desktop source, found that the shape matches (tree, root sentinel, sibling uniqueness, cycle rejection, reference-type strings, taggable kinds, merge tables) and the behavior does not. The domain code also carries defects that would corrupt or destroy data the first time a surface calls it:

- Merging one category into another rewrites `BUDGETTABLE_V1.CATEGID`, producing two budget rows for the same year and category; desktop deletes the source's budget rows.
- Merging a tag into itself deletes every link the tag has.
- Deleting a tag has no usage guard and strips the tag from live transactions; desktop refuses while live transactions carry it.
- Replacing a transaction's or a series' split lines leaves the removed split rows' tag links dangling and attaches no tags to the new rows, so split tags vanish on every edit.
- Payee match patterns are parsed as a JSON array; desktop stores a JSON object (`{"0": "…"}`), so every desktop pattern set reads as empty.
- Every usage count includes trashed transactions, so an entity referenced only by rows in the trash can never be deleted, where desktop offers to purge them.
- No relocation stamps `LASTUPDATEDTIME`, so a desktop synchronization peer never sees the re-pointed transactions as changed.
- Merging a payee relocates its attachment rows; desktop leaves them on the source.

Beyond the defects, the specification diverges from desktop on names (no rule against `:` in a category or spaces, `&`, `|` in a tag), on visibility (tags are not hideable in desktop; hiding a category cascades to its subtree; hidden entities are not offered for new records), on deletion (budget rows and payee defaults do not block in desktop; descendants' use does), and on what a merge reports and stamps. Each divergence was put to the operator on 2026-10-02 and decided; the decisions are recorded, dated, in [design.md](./design.md). The small data-write fixes outside this capability were taken first in `domain-write-fixes` (archived 2026-10-02); this change brings the taxonomy domain and its specification to desktop fidelity before any surface is built on them.

## What Changes

- **Names follow desktop's rules**: a category name is not empty and contains no `:`; a tag name is not empty, contains no space and is not exactly `&` or `|`; a payee name is not empty and its website, when given, is a well-formed URL. Refusals are typed in the repository for the surfaces to translate.
- **Case folding matches `COLLATE NOCASE`**: duplicate detection folds ASCII letters only, so names that differ only in non-ASCII case are distinct, as they are in desktop. This affects accounts, currencies, categories, payees and tags alike.
- **Visibility follows desktop**: only categories and payees are hideable; tags are never hidden and a stored `ACTIVE 0` tag reads as visible; hiding or unhiding a category cascades to its subtree; a child created under a hidden parent is visible; hidden entities are not offered for new records but an edited record keeps its current one, and a hidden payee or category is still reachable for a new record by its exact name. The show-hidden choices are stored in the file under desktop's names `SHOW_HIDDEN_CATEGS` and `SHOW_HIDDEN_PAYEES`, absent meaning on.
- **"Used" means what desktop means**: live transactions (`DELETEDTIME` empty), their split lines, scheduled series and their split lines. Budget rows and payee defaults do not block a category; a descendant's use does. An entity referenced only by trashed transactions is deletable after confirmation, which purges those transactions with their split rows, tag links, attachments and custom field data. Deleting a category takes its unused subtree with it, clears payee defaults in the subtree to `-1`, and deletes the subtree's budget rows (stricter than desktop, which orphans them — operator decision 2026-10-02).
- **Merge follows desktop**: source and target must differ; a hidden target is refused; the operation reports per-table counts before and the total after; re-pointed live transactions are stamped with `LASTUPDATEDTIME`; a category merge deletes the source's budget rows; the source may be deleted after the merge unless it is a category with children; a payee merge leaves attachment rows on the source, and deleting the source removes them; a tag merge collapses links that would duplicate and reports moved and collapsed counts.
- **Payee match patterns use desktop's format**: read tolerates the object form and the legacy array form; write produces the object form, renumbered from `0`, blanks dropped, pretty-printed; a `regex:` pattern is validated as a regular expression before it is stored; patterns are still never executed here.
- **Payee default-category mode is specified**: desktop's four modes (None, Last used, Unused, Default) stored in `SETTING_V1.TRANSACTION_CATEGORY_NONE`, absent meaning Last used; the entry behaviors that use the mode are specified now and implemented by the transaction-entry surfaces (Phase 5).
- **Category paths use the file's delimiter**: `INFOTABLE.CATEG_DELIMITER`, absent meaning `:`.
- **Split replacement keeps tags and leaves no orphans**: replacing a transaction's or a series' split lines removes the old split rows' tag links, writes the new rows with their tags in the same operation, and stamps the transaction when the split set changed. Every place that deletes series split rows also removes their tag links.
- **Bulk statement builders** for the Phase 4 surfaces: hide, unhide, delete, set default category and clear default category over many payees; delete over many categories and tags. Statements only — no surface in this change.
- **BREAKING** for callers of the current repository functions: `usageCount` becomes a structured usage report, `remove` and `relocate` take options and throw typed errors, and `parsePayeePatterns` accepts the object form. No surface calls these functions today.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `transaction-taxonomy`: Category Tree Structure (name rule, case-only rename, move to root, child under hidden parent, file delimiter); Payee Records (validation, `-1` default, default-category mode); Payee Pattern Custody (object format, write rules, regex validation); Tags and Polymorphic Tag Links (name rule, ordering); Visibility via Active Flags (categories and payees only, cascade, not offered for new records); Usage-Guarded Deletion (desktop's "used", trashed purge, subtree and budget handling); Relocate and Merge (guards, counts, stamping, budget rows, delete-source, attachments, collapse). ADDED Show-Hidden Preferences.
- `record-extensions`: Attachment Cascade is REMOVED and restated as Attachment Rows on Removal and Merge — the removal cascade unchanged, a merge leaving attachment rows on the source, deleting the source afterwards removing them. Restated rather than modified because its only scenario, "Merge relocates attachments", names the behavior being reversed and a MODIFIED block must keep every existing scenario.
- `domain-data-conventions`: Case-Insensitive Name Uniqueness — folding is ASCII-only, as `COLLATE NOCASE` folds.
- `transaction-ledger`: Split Transactions — replacing split lines cascades the removed rows' tag links, re-attaches the given tags in the same operation, and stamps the transaction when the set changed.
- `scheduled-transactions`: ADDED Series Split Line Replacement — the same cascade and re-attachment for a series' split lines.

## Impact

- Domain code: [src/domain/conventions.ts](../../../../src/domain/conventions.ts) (`namesEqual`), [src/domain/rules/taxonomy.ts](../../../../src/domain/rules/taxonomy.ts), [src/domain/repos/taxonomy.ts](../../../../src/domain/repos/taxonomy.ts), [src/domain/rules/metadata.ts](../../../../src/domain/rules/metadata.ts) and [src/domain/repos/metadata.ts](../../../../src/domain/repos/metadata.ts) (four new keys), [src/domain/repos/ledger.ts](../../../../src/domain/repos/ledger.ts) and [src/domain/repos/scheduled.ts](../../../../src/domain/repos/scheduled.ts) (split replacement), [src/domain/repos/account.ts](../../../../src/domain/repos/account.ts) (series split cleanup).
- Tests: new repository tests under [src/__tests__/domain/](../../../../src/__tests__/domain/) for every taxonomy function (none exist today) and for the split replacement; rule tests extended.
- No schema change, no stored data repaired: no surface has written through these paths yet. The `namesEqual` change can make two existing names that fold equal under full Unicode folding but not under ASCII folding both valid, which is exactly desktop's view of the file.
- Surfaces: none in this change. The settings surface is not extended for the new keys (they are read and written by the Phase 4 surfaces that own the toggles).

## Out of Scope

- Any user interface for categories, payees or tags, including the merge screens and bulk actions — the Phase 4 surfaces change that follows this one.
- Implementation of the transaction-entry behaviors that read the default-category mode, select hidden payees by exact name, or enter tags as chips — the Phase 5 and 6 surface changes; they are specified or recorded here so they are not lost.
- Localizing the seed category names written at file creation, as desktop does — its own change, noted in the capability map.
- The `&`/`|` tag filter language, "Append tags", and per-payee reports — long-lived non-scope of the capability.
- Executing payee match patterns — the future import capability.
- Editing `CATEG_DELIMITER` — deferred (operator decision 2026-10-02).
