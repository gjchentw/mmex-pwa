# Transaction Taxonomy Surfaces — Proposal

**Change**: `transaction-taxonomy-surfaces`
**Version**: 1.0.0
**Last Updated**: 2026-10-02

Related artifacts: [design.md](./design.md) (how), [specs/transaction-taxonomy/spec.md](./specs/transaction-taxonomy/spec.md) (capability delta), [tasks.md](./tasks.md) (implementation steps). Governed by [AGENTS.md](../../../../AGENTS.md).

## Why

Phase 4 of the capability map delivers the category, payee and tag managers — desktop MoneyManagerEx's Category Manager, Payee Manager, Tag Manager and the three Merge dialogs under Tools → Merge. The domain beneath them reached desktop fidelity in `transaction-taxonomy-fidelity` (archived 2026-10-02), which typed every refusal, made "used" mean what desktop means, specified deletion with trash purge, merge with counts and stamps, and the show-hidden preferences. No surface exists yet, so none of that is reachable by a user, and the capability map still lists the categories, payees and tags phase as not delivered. Every UX question the surfaces raise was put to the operator on 2026-10-02 and decided (recorded in `transaction-taxonomy-fidelity` design.md): always confirm a deletion and list the subcategories that go with it (3), the merge screen's counts before and after (8), a "Move to…" picker rather than drag-and-drop (17), bulk actions over a selection (24), and the manager searches (16). This change builds the surfaces on those decisions and exercises the archived domain batches against real SQLite in Chromium, which the capability map records as owed.

## What Changes

- **Three routes and navigation entries**: `/categories`, `/payees`, `/tags`, declared by this capability per `app-shell-navigation`'s route registry rule, subject to the readiness guard; editors, pickers and merge screens are presented over them without routes of their own, as the account and currency surfaces do.
- **Category manager**: the tree with expand and collapse all, a search over full paths, hidden categories shown or not per `SHOW_HIDDEN_CATEGS` with the toggle writing the preference, hidden rows marked; New (as child of the selection or at the top level), Edit (rename), Delete, Merge, Hide and Unhide on the selection; "Move to…" with a parent picker and a confirmation; the refusals of the domain translated (colon, duplicate, in use with the reason).
- **Payee manager**: desktop's columns — Name, Hidden, Default Category or Last Used Category per the mode, Reference, Website, Notes, Match Pattern, Used (live transactions plus scheduled series) — with search, the show-hidden toggle writing `SHOW_HIDDEN_PAYEES`, an editor with desktop's fields and a match-pattern list, and the selection actions Hide, Show, Remove, Define Category and Remove Category over one or many payees.
- **Tag manager**: the list with search and a usage count per tag, Add, Edit (rename), Delete over a selection, Merge; a tag is never hidden and the manager has no hide action.
- **Deletion from the surfaces**: always confirmed; the confirmation names what goes — for a category its subcategories, budget rows and cleared payee defaults; when only trashed transactions reference the entity, the confirmation carries desktop's purge sentence and the deletion purges them; a refusal names the reason (live use, with the counts); a multi-selection deletes what it can and reports what it could not.
- **Merge screens** for the three kinds: source (used entities only), target (visible entities, not the source), desktop's per-table counts for the source before the merge, the delete-source option (off by default; unavailable for a category with children), a confirmation "From … to …", and the total changed afterwards — for tags also the collapsed count.
- **End-to-end verification in Chromium** against real SQLite: a category deletion with purge removes the trashed transaction and its rows; a merge stamps the live transaction and deletes the source's budget rows; a tag merge collapses a duplicate link — closing the taxonomy part of the standing capability-map item left by `transaction-taxonomy-fidelity`. The split-tags check stays open for the Phase 5 ledger surface, which is the first surface that replaces split lines. Seeding transactions for these checks needs a development-only route that runs SQL through the domain layer, excluded from production builds as `app-shell-navigation` requires of development routes.
- **Domain additions limited to reads**: one query per repository returning the live-use count of every entity, so the lists do not issue one usage query per row.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `transaction-taxonomy`: ADDED requirements for the surfaces — Taxonomy Surface Routes; Category Manager Display; Category Creation, Renaming and Moving; Category Visibility Actions; Category Deletion from the Surface; Payee Manager Display; Payee Editing; Payee Selection Actions; Payee Deletion from the Surface; Tag Manager Display; Tag Creation and Renaming; Tag Deletion from the Surface; Merge Screens; Refusal Presentation. The existing requirements are unchanged; Show-Hidden Preferences (1.1.0) gains its first writer.

## Impact

- New pages under [src/pages/](../../../../src/pages/) (categories, payees, tags), stores under [src/stores/](../../../../src/stores/), dialog and picker components under [src/components/](../../../../src/components/), routes and navigation entries in [src/router/index.ts](../../../../src/router/index.ts) and the shell, catalog keys in [src/locales/](../../../../src/locales/), end-to-end specs under [e2e/](../../../../e2e/).
- Domain: read-only additions in [src/domain/repos/taxonomy.ts](../../../../src/domain/repos/taxonomy.ts) (bulk live-use counts); no behavior of the archived change is altered.
- No schema change; no stored data repaired. The surfaces write only through the repository builders the archived change specified.

## Out of Scope

- The transaction-entry behaviors that consume the default-category mode, select hidden payees by exact name, or enter tags as chips (operator decisions 25 to 27) — the Phase 5 and 6 surface changes.
- Seed-category localization — its own change, after this one.
- The attachment manager reachable from desktop's payee menu — Phase 8 (`record-extensions`), under the read-only stance.
- The `&`/`|` tag filter language, "Append tags", per-payee reports, pattern execution, editing `CATEG_DELIMITER` — unchanged non-scope.
- Drag-and-drop reparenting — the operator chose a picker (decision 17).
