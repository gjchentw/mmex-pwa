# transaction-taxonomy Specification

**Capability**: `transaction-taxonomy`
**Version**: 1.1.0
**Last Updated**: 2026-10-02

## Purpose

The classification vocabulary for ledger data: the category tree (`CATEGORY_V1`), payees (`PAYEE_V1`), tags (`TAG_V1`), and polymorphic tag links (`TAGLINK_V1`), including visibility, usage-guarded deletion, and relocate/merge semantics. Non-scope: how transactions consume these references (`transaction-ledger`, `scheduled-transactions`, `budget-management`); executing payee match patterns at import time (future import capability). All rules inherit `domain-data-conventions`.

## Requirements
### Requirement: Schema Fidelity for Taxonomy Tables

The application SHALL persist `CATEGORY_V1`, `PAYEE_V1`, `TAG_V1`, and `TAGLINK_V1` in conformance with `domain-data-conventions`.

- `TAGLINK_V1` rows SHALL be unique per `(REFTYPE, REFID, TAGID)`; its `TAGID` reference is the schema's only declared foreign key and SHALL remain the only one.

```mermaid
classDiagram
    class CATEGORY_V1 {
        +Integer CATEGID
        +String CATEGNAME
        +Integer PARENTID
        +Integer ACTIVE
    }
    class PAYEE_V1 {
        +Integer PAYEEID
        +String PAYEENAME
        +Integer CATEGID
        +String PATTERN
        +Integer ACTIVE
    }
    class TAG_V1 {
        +Integer TAGID
        +String TAGNAME
        +Integer ACTIVE
    }
    class TAGLINK_V1 {
        +String REFTYPE
        +Integer REFID
        +Integer TAGID
    }
    CATEGORY_V1 --> CATEGORY_V1 : PARENTID (root = -1)
    PAYEE_V1 --> CATEGORY_V1 : default CATEGID
    TAGLINK_V1 --> TAG_V1 : TAGID (declared FK)
```
*Caption: Taxonomy entities — a self-referencing category tree, payees with a default category, and tags attached polymorphically.*

Traceability: [mmex/database/tables.sql](../../../mmex/database/tables.sql).

#### Scenario: Taxonomy rows round-trip

- **WHEN** a desktop-created database with nested categories, payees with patterns, and tag links is opened and persisted
- **THEN** all taxonomy rows the user did not edit SHALL be unchanged

### Requirement: Category Tree Structure

The application SHALL maintain categories as a self-referencing tree: `PARENTID` points at the parent category, `-1` denotes a root, and names SHALL be unique case-insensitively among siblings of the same parent.

- A category name SHALL be non-empty after trimming and SHALL NOT contain `:`; the refusal SHALL state that the colon separates categories from subcategories.
- A rename that changes only the letter case of a name SHALL be accepted (operator decision 2026-10-02; desktop refuses it as a duplicate of itself, an accident of its check, not a rule).
- A category SHALL NOT be its own ancestor; reparenting that would create a cycle SHALL be rejected. Moving a category to the top level (`PARENTID` `-1`) SHALL be accepted.
- The same name under different parents SHALL be accepted.
- A category created under a hidden parent SHALL be visible (`ACTIVE` `1`).
- The full name of a category SHALL join the names from the root down with the delimiter stored in `INFOTABLE.CATEG_DELIMITER`, `:` when the key is absent.

Traceability: [mmex/moneymanagerex/src/model/Model_Category.h](../../../mmex/moneymanagerex/src/model/Model_Category.h), [mmex/moneymanagerex/src/model/Model_Category.cpp](../../../mmex/moneymanagerex/src/model/Model_Category.cpp) (`full_name`, the delimiter), [mmex/moneymanagerex/src/categdialog.cpp](../../../mmex/moneymanagerex/src/categdialog.cpp) (the colon check, the child under a hidden parent), [mmex/database/incremental_upgrade/database_version_17.sql](../../../mmex/database/incremental_upgrade/database_version_17.sql) (unified tree migration), [src/domain/rules/taxonomy.ts](../../../src/domain/rules/taxonomy.ts), [src/domain/repos/taxonomy.ts](../../../src/domain/repos/taxonomy.ts).

#### Scenario: Sibling duplicate is rejected

- **WHEN** the user creates a category named `Food` under a parent that already has a child named `FOOD`
- **THEN** the creation SHALL be rejected as a duplicate

#### Scenario: Cycle is rejected

- **WHEN** the user attempts to move a category under one of its own descendants
- **THEN** the move SHALL be rejected

#### Scenario: Colon in a name is refused

- **WHEN** the user names a category `Food:Snacks`
- **THEN** the application SHALL refuse the name, stating that the colon separates categories from subcategories

#### Scenario: Case-only rename is accepted

- **WHEN** the user renames the category `food` to `Food`
- **THEN** the rename SHALL be accepted

#### Scenario: Move to the top level

- **WHEN** the user moves the subcategory `Snacks` out from under `Food` to the top level
- **THEN** its `PARENTID` SHALL be `-1` and its full name SHALL be `Snacks`

#### Scenario: Path uses the file's delimiter

- **WHEN** the file stores `CATEG_DELIMITER` as ` / ` and the user views the subcategory `Snacks` of `Food`
- **THEN** its full name SHALL be `Food / Snacks`

### Requirement: Payee Records

The application SHALL manage payees with a case-insensitively unique name, an optional default category, and the auxiliary fields (`NUMBER`, `WEBSITE`, `NOTES`).

- A payee name SHALL be non-empty after trimming.
- `WEBSITE` SHALL be empty or a well-formed URL: an optional `http://` or `https://` scheme, a host of at least two dot-separated labels, and at least one further character of path, query or fragment, compared after trimming and lowercasing (desktop's `isValidURI` pattern); any other value SHALL be refused naming the field.
- `NUMBER` is the payee's reference and SHALL be stored verbatim.
- `PAYEE_V1.CATEGID` SHALL be `-1` when the payee has no default category, never `NULL`. When a feature uses a payee's default category, it SHALL read `CATEGID` and treat `-1` as none.
- The default-category mode SHALL be read from `SETTING_V1.TRANSACTION_CATEGORY_NONE` as desktop's integer: `0` None, `1` Last used, `2` Unused, `3` Default; an absent or unrecognized value SHALL read as `1`. When a feature pre-fills a category from a payee, it SHALL honor the mode: None pre-fills nothing; Last used pre-fills the stored default and, when the transaction is saved, writes its category back to the payee as the new default; Unused pre-fills the root category named `Unknown`, creating it when absent; Default pre-fills the stored default and never writes back.

Traceability: [mmex/moneymanagerex/src/model/Model_Payee.h](../../../mmex/moneymanagerex/src/model/Model_Payee.h), [mmex/moneymanagerex/src/payeedialog.cpp](../../../mmex/moneymanagerex/src/payeedialog.cpp) (validation and fields), [mmex/moneymanagerex/src/primitive.cpp](../../../mmex/moneymanagerex/src/primitive.cpp) (`isValidURI`), [mmex/moneymanagerex/src/option.h](../../../mmex/moneymanagerex/src/option.h) (`USAGE_TYPE`), [mmex/moneymanagerex/src/option.cpp](../../../mmex/moneymanagerex/src/option.cpp) (`TRANSACTION_CATEGORY_NONE`, default Last used), [mmex/moneymanagerex/src/transdialog.cpp](../../../mmex/moneymanagerex/src/transdialog.cpp) (`Unknown`), [src/domain/rules/taxonomy.ts](../../../src/domain/rules/taxonomy.ts), [src/domain/repos/taxonomy.ts](../../../src/domain/repos/taxonomy.ts), [src/domain/repos/metadata.ts](../../../src/domain/repos/metadata.ts).

#### Scenario: Payee default category is honored

- **WHEN** a transaction entry feature pre-fills a category from a payee whose default category is set and the mode is Last used or Default
- **THEN** the pre-filled category SHALL be the payee's stored default

#### Scenario: Invalid website is refused

- **WHEN** the user saves a payee whose website is `not a url`
- **THEN** the save SHALL be refused naming the website field

#### Scenario: Mode is read with desktop's default

- **WHEN** the file has no `TRANSACTION_CATEGORY_NONE` setting
- **THEN** the default-category mode SHALL read as Last used

#### Scenario: No default is stored as the sentinel

- **WHEN** the user saves a payee without a default category
- **THEN** the stored `CATEGID` SHALL be `-1`

### Requirement: Payee Pattern Custody

The application SHALL preserve and allow editing of the payee `PATTERN` field — the match patterns desktop's import auto-matching uses — without executing them.

- The stored form SHALL be desktop's: a JSON object whose keys are consecutive decimal strings from `"0"` and whose values are the patterns, pretty-printed.
- Reading SHALL accept that object form and the legacy JSON array form, yielding the patterns in key order; a value that parses as neither SHALL read as no patterns and SHALL be preserved verbatim until the user edits the patterns.
- Writing SHALL drop blank patterns and renumber from `0`. A pattern beginning with `regex:` SHALL be refused when the remainder is not a valid regular expression under the application's engine, compiled case-insensitively; dialect differences from desktop's engine are recorded in the change design.
- Editing any other payee field SHALL leave `PATTERN` byte-for-byte unchanged.
- Pattern matching execution is owned by a future import capability.

Traceability: [mmex/moneymanagerex/src/payeedialog.cpp](../../../mmex/moneymanagerex/src/payeedialog.cpp) (the object writer and the `regex:` check), [mmex/moneymanagerex/src/model/Model_Payee.h](../../../mmex/moneymanagerex/src/model/Model_Payee.h), [mmex/database/incremental_upgrade/database_version_18.sql](../../../mmex/database/incremental_upgrade/database_version_18.sql), [src/domain/rules/taxonomy.ts](../../../src/domain/rules/taxonomy.ts).

#### Scenario: Patterns survive editing other fields

- **WHEN** the user renames a payee that carries match patterns
- **THEN** the `PATTERN` value SHALL be preserved verbatim

#### Scenario: A desktop pattern set round-trips

- **WHEN** the application reads a payee whose `PATTERN` is `{"0": "AMAZON*", "1": "regex:^AMZN"}` and the user saves the patterns without a change
- **THEN** the stored value SHALL again be a JSON object with keys `"0"` and `"1"` and the same two patterns in the same order

#### Scenario: Invalid regular expression is refused

- **WHEN** the user enters the pattern `regex:(unclosed`
- **THEN** the save SHALL be refused naming the pattern

### Requirement: Tags and Polymorphic Tag Links

The application SHALL manage tags with case-insensitively unique names, attached to records via `TAGLINK_V1` using the `domain-data-conventions` reference vocabulary.

- A tag name SHALL be non-empty after trimming, SHALL NOT contain a space, and SHALL NOT be exactly `&` or `|`; the refusal SHALL state the reason (the space is desktop's tag delimiter; `&` and `|` are its filter operators).
- Tags SHALL be attachable to transactions (`Transaction`), scheduled transactions (`RecurringTransaction`), and individual split lines (`TransactionSplit`, `RecurringTransactionSplit`).
- Attaching the same tag twice to the same record SHALL be a no-op or rejection, never a duplicate row.
- A record's tags SHALL be presented ordered by tag name.
- Removing a split row SHALL remove its tag links in the same operation; the owners of the split tables state when rows are removed.

Traceability: [mmex/moneymanagerex/src/model/Model_Taglink.h](../../../mmex/moneymanagerex/src/model/Model_Taglink.h), [mmex/moneymanagerex/src/tagdialog.cpp](../../../mmex/moneymanagerex/src/tagdialog.cpp) (name checks), [mmex/database/incremental_upgrade/database_version_19.sql](../../../mmex/database/incremental_upgrade/database_version_19.sql), [src/domain/rules/taxonomy.ts](../../../src/domain/rules/taxonomy.ts), [src/domain/repos/taxonomy.ts](../../../src/domain/repos/taxonomy.ts).

#### Scenario: Split lines are independently taggable

- **WHEN** the user tags one split line of a transaction
- **THEN** the persisted link SHALL carry `REFTYPE` `TransactionSplit` and the split row's identifier
- **AND** the parent transaction's tags SHALL be unaffected

#### Scenario: Reserved tag name is refused

- **WHEN** the user names a tag `&`, or `summer trip`
- **THEN** the application SHALL refuse the name, stating that the characters are reserved

#### Scenario: Tags are listed by name

- **WHEN** a transaction carries the tags `travel` and `business`, attached in that order
- **THEN** the application SHALL present them as `business`, `travel`

### Requirement: Visibility via Active Flags

The application SHALL treat `ACTIVE` = `0` on a category or payee as hidden, not deleted: hidden entities remain valid references and continue to appear on existing records.

- Tags SHALL NOT be hideable: the application SHALL write `ACTIVE` `1` for every tag and SHALL read a stored `0` as visible.
- Hiding or unhiding a category SHALL apply the same state to every category in its subtree.
- Hidden categories and payees SHALL NOT be offered when a new record is entered; a record being edited SHALL keep its current category or payee, hidden or not; a hidden payee or category SHALL be reachable for a new record by entering its exact name.
- Each manager SHALL offer a show-hidden toggle whose state is the Show-Hidden Preferences requirement's stored value.

Traceability: [mmex/moneymanagerex/src/categdialog.cpp](../../../mmex/moneymanagerex/src/categdialog.cpp) (hide and unhide over the subtree), [mmex/moneymanagerex/src/model/Model_Payee.h](../../../mmex/moneymanagerex/src/model/Model_Payee.h), [mmex/moneymanagerex/src/model/Model_Tag.h](../../../mmex/moneymanagerex/src/model/Model_Tag.h) (no hidden state), [src/domain/rules/taxonomy.ts](../../../src/domain/rules/taxonomy.ts), [src/domain/repos/taxonomy.ts](../../../src/domain/repos/taxonomy.ts).

#### Scenario: Hiding does not orphan references

- **WHEN** the user hides a category referenced by existing transactions
- **THEN** those transactions SHALL continue to display and aggregate under that category

#### Scenario: Hiding a parent hides its subtree

- **WHEN** the user hides the category `Food`, which has the subcategories `Groceries` and `Snacks`
- **THEN** `Food`, `Groceries` and `Snacks` SHALL all carry `ACTIVE` `0`

#### Scenario: Hidden is not offered for a new record

- **WHEN** a transaction entry feature lists payees for a new transaction while the payee `Old Shop` is hidden
- **THEN** `Old Shop` SHALL NOT be in the list
- **AND** typing `Old Shop` exactly SHALL select it

#### Scenario: A stored inactive tag reads as visible

- **WHEN** the application opens a file whose tag `legacy` carries `ACTIVE` `0`
- **THEN** the tag SHALL be presented as visible

### Requirement: Usage-Guarded Deletion

The application SHALL refuse to delete a category, payee, or tag that is used, SHALL offer to purge references that are only in the trash, and SHALL delete unused ones cleanly.

- An entity is used when a live transaction (`DELETEDTIME` empty) references it directly or through a split line, or when a scheduled series or one of its split lines references it. For a category, use of any descendant counts as use of the category; budget rows and payee defaults do not count.
- A tag link whose record no longer exists SHALL NOT count as use.
- When an entity is referenced only by trashed transactions, deletion SHALL require a confirmation stating that those transactions will be purged, then SHALL hard-delete them with their split rows, tag links, attachment rows and custom field data before deleting the entity, in one logical operation.
- Deleting a category SHALL delete its subtree with it, SHALL set the default category of every payee pointing at the category or its subtree to `-1`, and SHALL delete the `BUDGETTABLE_V1` rows of the category and its subtree (operator decision 2026-10-02; desktop leaves those budget rows orphaned).
- Deleting a tag SHALL delete its remaining tag links in the same operation. Deleting a payee SHALL delete its attachment rows and custom field data in the same operation.
- Every deletion SHALL be confirmed by the user before it runs; for a category the confirmation SHALL list the subcategories that go with it (operator decision 2026-10-02; desktop confirms only the purge case).

```mermaid
flowchart TD
    A[Delete requested] --> B{Live references?}
    B -- yes --> C[Refuse, naming the reason]
    B -- no --> D{Trashed references?}
    D -- yes --> E[Confirm purge] --> F[Hard-delete those transactions and their rows]
    D -- no --> G[Confirm deletion]
    F --> H[Delete entity, subtree, budget rows; clear payee defaults]
    G --> H
```
*Caption: Deletion refuses live use, purges trash on confirmation, and deletes cleanly otherwise.*

Traceability: [mmex/moneymanagerex/src/model/Model_Category.cpp](../../../mmex/moneymanagerex/src/model/Model_Category.cpp) (`is_used`), [mmex/moneymanagerex/src/model/Model_Payee.cpp](../../../mmex/moneymanagerex/src/model/Model_Payee.cpp) (`is_used`), [mmex/moneymanagerex/src/model/Model_Tag.cpp](../../../mmex/moneymanagerex/src/model/Model_Tag.cpp) (`is_used`, the three states), [mmex/moneymanagerex/src/categdialog.cpp](../../../mmex/moneymanagerex/src/categdialog.cpp) (purge and subtree removal), [mmex/moneymanagerex/src/tagdialog.cpp](../../../mmex/moneymanagerex/src/tagdialog.cpp) (purge), [src/domain/repos/taxonomy.ts](../../../src/domain/repos/taxonomy.ts).

#### Scenario: Used category cannot be deleted

- **WHEN** the user attempts to delete a category whose subcategory is referenced by a live transaction
- **THEN** the deletion SHALL be refused with the reason

#### Scenario: Only trashed references are purged on confirm

- **WHEN** the user deletes a payee referenced only by two trashed transactions and confirms the purge
- **THEN** both transactions SHALL be hard-deleted with their split rows, tag links, attachment rows and custom field data
- **AND** the payee SHALL be deleted in the same operation

#### Scenario: Unused subtree goes with the parent

- **WHEN** the user deletes the unused category `Food`, whose subcategory `Snacks` is the default of the payee `Kiosk` and has a budget row
- **THEN** `Food` and `Snacks` SHALL be deleted, `Kiosk` SHALL have default category `-1`, and the budget row SHALL be deleted

#### Scenario: Budget entry does not block

- **WHEN** the user attempts to delete a category referenced only by a budget entry
- **THEN** the deletion SHALL proceed after confirmation

### Requirement: Relocate and Merge

When the application relocates (merges) one category, payee, or tag into another, it SHALL reassign every reference from the source to the target in one logical operation and report how many records changed.

- The source and target SHALL differ, and the target SHALL NOT be hidden; either condition SHALL be refused before anything is written.
- Before the merge the application SHALL report the number of referencing rows per table — transactions, split lines, scheduled series, series split lines, and for categories also budget rows and payee defaults; after the merge it SHALL report the total number of rows changed.
- Relocation SHALL cover every referencing table, including split lines and scheduled series. Every re-pointed live transaction SHALL have `LASTUPDATEDTIME` set to the time of the merge; trashed transactions SHALL be re-pointed without a stamp.
- A category merge SHALL delete the source's `BUDGETTABLE_V1` rows rather than re-point them, counting them as changed.
- The user SHALL be able to request deletion of the source after the merge, off by default; the option SHALL be unavailable for a category that has children. For a payee, that deletion SHALL remove the source's attachment rows; the merge itself SHALL leave attachment rows on the source.
- A tag merge SHALL re-point every link that would not duplicate an existing link on the target and SHALL delete the links that would; the report SHALL state both counts (operator decision 2026-10-02; desktop has no defined outcome for the collision).
- After relocation the source SHALL be unreferenced and therefore deletable.

Traceability: [mmex/moneymanagerex/src/relocatecategorydialog.cpp](../../../mmex/moneymanagerex/src/relocatecategorydialog.cpp), [mmex/moneymanagerex/src/relocatepayeedialog.cpp](../../../mmex/moneymanagerex/src/relocatepayeedialog.cpp), [mmex/moneymanagerex/src/relocatetagdialog.cpp](../../../mmex/moneymanagerex/src/relocatetagdialog.cpp), [mmex/moneymanagerex/src/model/Model_Checking.cpp](../../../mmex/moneymanagerex/src/model/Model_Checking.cpp) (the stamp on save of a live row), [src/domain/repos/taxonomy.ts](../../../src/domain/repos/taxonomy.ts).

#### Scenario: Payee merge reassigns everything

- **WHEN** the user merges payee `A` into payee `B` while `A` is referenced by transactions and scheduled transactions
- **THEN** every such reference SHALL point at `B` afterwards
- **AND** the operation SHALL report the number of records updated

#### Scenario: Merge into itself is refused

- **WHEN** the user attempts to merge tag `travel` into tag `travel`
- **THEN** the merge SHALL be refused and no link SHALL change

#### Scenario: Budget rows of the merged category are deleted

- **WHEN** the user merges category `Snacks`, which has a budget row for 2026, into `Food`, which also has one
- **THEN** the `Snacks` budget row SHALL be deleted and the `Food` budget row SHALL be unchanged

#### Scenario: Tag merge collapses duplicates

- **WHEN** the user merges tag `trip` into tag `travel` while one transaction carries both
- **THEN** that transaction SHALL carry `travel` once
- **AND** the report SHALL state one link collapsed

#### Scenario: Live transactions are stamped

- **WHEN** the user merges payee `A` into `B` while `A` is referenced by one live and one trashed transaction
- **THEN** the live transaction's `LASTUPDATEDTIME` SHALL be the time of the merge
- **AND** the trashed transaction SHALL point at `B` with its `LASTUPDATEDTIME` unchanged

### Requirement: Show-Hidden Preferences

The application SHALL store the show-hidden choice of the category manager under `SETTING_V1.SHOW_HIDDEN_CATEGS` and of the payee manager under `SETTING_V1.SHOW_HIDDEN_PAYEES`, as desktop's boolean strings; an absent key SHALL read as on.

- The key SHALL be written when the user changes the toggle, never on read.

Traceability: [mmex/moneymanagerex/src/categdialog.cpp](../../../mmex/moneymanagerex/src/categdialog.cpp) (`SHOW_HIDDEN_CATEGS`, default `true`), [mmex/moneymanagerex/src/payeedialog.cpp](../../../mmex/moneymanagerex/src/payeedialog.cpp) (`SHOW_HIDDEN_PAYEES`), [src/domain/rules/metadata.ts](../../../src/domain/rules/metadata.ts), [src/domain/repos/metadata.ts](../../../src/domain/repos/metadata.ts).

#### Scenario: Absent preference shows hidden entries

- **WHEN** the file has no `SHOW_HIDDEN_CATEGS` setting
- **THEN** the category manager SHALL show hidden categories

#### Scenario: Toggle is persisted

- **WHEN** the user turns the payee manager's show-hidden toggle off
- **THEN** `SHOW_HIDDEN_PAYEES` SHALL be stored as desktop's false value
