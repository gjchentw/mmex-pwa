# Domain Data Conventions — Delta: ASCII Case Folding

**Change**: `transaction-taxonomy-fidelity`
**Capability**: `domain-data-conventions`
**Version**: 1.2.0
**Last Updated**: 2026-10-02

Governed by [AGENTS.md](../../../AGENTS.md). Links are written relative to where this file is promoted, `openspec/specs/domain-data-conventions/spec.md`.

**Scope**: Makes precise which letters case-insensitive name comparison folds. The baseline said "matching `COLLATE NOCASE`"; the implementation folded every Unicode letter, which `NOCASE` does not. Nothing else in the requirement changes.

## MODIFIED Requirements

### Requirement: Case-Insensitive Name Uniqueness

The application SHALL enforce uniqueness of user-facing names case-insensitively, matching the upstream `COLLATE NOCASE` declarations.

- Applies to account, category (per parent), payee, tag, currency, setting, info-key, and report names.
- Name comparisons for lookup and duplicate detection SHALL fold the 26 ASCII letters only, as `COLLATE NOCASE` folds; every other character SHALL compare by code point, so two names that differ only in the case of a non-ASCII letter are distinct names (operator decision 2026-10-02).

Traceability: [mmex/database/tables.sql](../../../mmex/database/tables.sql) (`COLLATE NOCASE` declarations), [src/domain/conventions.ts](../../../src/domain/conventions.ts) (`namesEqual`).

#### Scenario: Same name with different case is a duplicate

- **WHEN** the application is asked to create a payee named `Grocery` while a payee named `GROCERY` exists
- **THEN** the creation SHALL be rejected as a duplicate

#### Scenario: Non-ASCII case is not folded

- **WHEN** the application is asked to create a payee named `époque` while a payee named `Époque` exists
- **THEN** the creation SHALL be accepted as a distinct name
