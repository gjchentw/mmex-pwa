# Fix New Database Seeding — Tasks

**Change**: `fix-new-database-seeding`
**Version**: 1.0.0
**Last Updated**: 2026-08-08

## 1. Implementation

- [x] 1.1 Worker: strip `_tr_` markers from the DDL text before executing it ([src/workers/sqlite.worker.ts](../../../src/workers/sqlite.worker.ts)) — module-level `seedSql = tablesSql.replace(/_tr_/g, '')` used by **both** creation paths (fresh-create in `openOrCreate` and the empty-file branch of `migrateDb`); a global regex, not `replaceAll`, because the worker's compile target predates es2021
- [x] 1.2 Store: rewrote `initNewDb` ([src/stores/database-store.ts](../../../src/stores/database-store.ts)) — placeholder currency insert removed; `BASECURRENCYID` (always) and `USERNAME` (only when provided) upserted via `ON CONFLICT(INFONAME) DO UPDATE`, never addressing rows by `INFOID`

## 2. Tests

- [x] 2.1 Worker test asserts the executed DDL contains stripped seed values (`'Bills'`) and no `_tr_` substring ([src/__tests__/sqlite.worker.spec.ts](../../../src/__tests__/sqlite.worker.spec.ts); the mocked DDL now carries a marker so the assertion is non-vacuous). The first run caught that only one of the two creation paths was stripped — fixed by the shared constant
- [x] 2.2 Store test asserts the `initNewDb` statements never touch `INFOID`/`DATAVERSION` and write `USERNAME` keyed by `INFONAME` ([src/__tests__/database-store.spec.ts](../../../src/__tests__/database-store.spec.ts))
- [x] 2.3 Store test asserts `BASECURRENCYID` is written with the chosen currency id as its value

## 3. Verification

- [x] 3.1 `openspec validate fix-new-database-seeding` passes (CLI 1.7.0)
- [x] 3.2 Unit suite 42 passed / 1 skipped (up from 38); `vue-tsc` clean; ESLint clean; Prettier clean
- [x] 3.3 Delta spec complies with AGENTS.md (English, four-hashtag scenarios, SHALL language, mermaid caption present)

## 4. Review Gate

- [x] 4.1 Operator reviewed and approved the change (2026-08-08)
- [x] 4.2 Archived (bumps `domain-data-conventions` to 1.1.0 in `openspec/specs/`)
