# Fix New Database Seeding — Design

**Change**: `fix-new-database-seeding`
**Version**: 1.0.0
**Last Updated**: 2026-08-08

## Context

The vendored `tables.sql` is the schema source of truth (infrastructure-baseline, Vendored Source Provenance) and seeds `INSERT INTO INFOTABLE_V1 VALUES(1, 'DATAVERSION', '3')`. Desktop MoneyManagerEx never executes this file directly: `util/sqlite2cpp.py` generates the shipped SQL, removing every `_tr_` translation marker with a plain `line.replace('_tr_', '')` (line 1099). The PWA worker executes the raw file, and the store's `initNewDb()` was left half-finished in the infrastructure phase. This change makes the PWA's created files indistinguishable from desktop-created ones at the seeding level, as the archived `domain-model-baseline` requires.

## Goals / Non-Goals

**Goals**: a newly created database carries stripped seed strings, an intact `DATAVERSION` row, the wizard's `BASECURRENCYID`, and (when provided) `USERNAME`.

**Non-Goals**: repairing previously created databases; seeding facts the baseline does not require; touching migration mechanics or sync.

## Decisions

### D1: Strip `_tr_` globally in the worker, at creation time

Mirror the upstream generator exactly: a global `replace('_tr_', '')` on the DDL text before `db.exec`. Verified safe — all 229 occurrences in `tables.sql` sit inside seed string literals or SQL comments; none appear in schema identifiers. Doing it in the worker (not a build step) keeps the vendored submodule byte-identical as provenance requires. *Alternative considered*: a build-time transform generating a second SQL asset — rejected as a new artifact pipeline for a one-line runtime transform.

### D2: Key INFOTABLE writes by `INFONAME`, never `INFOID`

`INFONAME` is declared `UNIQUE COLLATE NOCASE`, so `INSERT ... ON CONFLICT(INFONAME) DO UPDATE` is the correct upsert. The previous hardcoded `INFOID = 1` collided with the seeded `DATAVERSION` row — the root cause of the clobbering bug.

### D3: Delete the placeholder currency insert outright

The vendored DDL seeds all 168 currencies at schema creation; the store-level insert was dead code that would error if ever exercised (`json_each` exposes `key`/`value`/`type` columns, not `CURRENCYID`).

### D4: No repair path for already-created databases

Databases created before this fix (development stage only) may carry `_tr_` seed names or a replaced `DATAVERSION` row. A repair-on-open migration would mutate files at open (the baseline's purge-cadence decision deliberately avoids open-time writes) for a population of throwaway dev files that the existing destroy-and-recreate flow already handles. Recorded as a known limitation; the operator can commission a repair change if real files ever need it.

## Risk Assessment

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Global `_tr_` replace corrupts a future upstream DDL that uses the marker outside string literals | Low | Medium | Mirrors the upstream generator's own global replace, so any such DDL would break desktop's generator first; submodule bumps go through the governed stack table review |
| R2 | Upsert semantics differ under `COLLATE NOCASE` (for example a legacy lowercase `basecurrencyid` key) | Low | Low | `ON CONFLICT(INFONAME)` honors the column's NOCASE collation, updating the existing row regardless of case |
| R3 | Tests assert on seeded content and become brittle across upstream schema bumps | Low | Low | Assertions target invariants (no `_tr_` substring, `DATAVERSION` = `3`, chosen id), not specific seed rows |

## Open Questions

- None.
