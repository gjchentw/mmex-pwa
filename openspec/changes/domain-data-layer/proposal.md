# Domain Data Layer — Proposal

**Change**: `domain-data-layer`
**Version**: 1.0.0
**Last Updated**: 2026-08-08

Related artifacts: [design.md](./design.md) (how), [specs/domain-data-access/spec.md](./specs/domain-data-access/spec.md) (new capability), [tasks.md](./tasks.md) (implementation steps). Governed by [AGENTS.md](../../AGENTS.md).

## Why

Eleven domain capabilities are now specified and archived, but nothing implements them: the application still contains no typed access to any of the 25 tables it creates, and every financial rule the baseline defines — the account-flow function, day-rate resolution, the moving-average cost book, asset valuation, the budget overlay, the multiplexed repeat encoding — exists only as prose. The baselines were deliberately written data-model-first, so they can be satisfied in full without building a single page; the operator has scoped this change accordingly (2026-08-08): implement the domain layer for all eleven capabilities, no user interface. Doing it now, before any feature change, means the phase-ordered UI changes that follow inherit one typed vocabulary, one set of verified computations, and one place where the conventions (enum strings, sentinels, ISO dates, case-insensitive uniqueness, application-level integrity) are enforced — instead of each feature re-deriving them from the upstream C++ and drifting.

## What Changes

- **New capability `domain-data-access` (governance)**: how domain data is reached — a typed layer as the sole path to domain tables, exactly one implementation of each persisted vocabulary, financial rules as pure functions over loaded records, multi-table operations applied atomically, and derived caches written back inside the same atomic unit.
- **Domain layer (implementation)**: typed record shapes, repositories, and rule functions for all eleven capabilities, mirroring the upstream C++ model semantics — with the vendored `Model_*.h` / `Model_*.cpp` as the authority wherever the DDL comments disagree.
- **Persistence protocol additions (infrastructure, no spec change)**: the worker gains object-row results and an atomic multi-statement message; the existing infrastructure requirement already mandates only that the client and worker communicate through correlated asynchronous messages, so no baseline amendment is required.
- **Tests**: unit coverage for every rule the baselines make verifiable — flow and balance, void/deleted exclusion, split shadowing, statement lock, retention purge, rate resolution and its tie rule, repeat decoding and series advancement, budget annualization and overlay, position recomputation, asset compounding and revaluation, polymorphic cascades.

## Capabilities

### New Capabilities

- `domain-data-access`: Architectural governance for reaching domain data — single typed access path, single vocabulary source, pure rule functions, atomic multi-table operations, and derived-cache write-back discipline.

### Modified Capabilities

- None. The eleven domain capabilities are implemented as specified; their conditional requirements become live without rewording.

## Impact

- **Code**: a new `src/domain/` module tree (conventions and codecs, one module per capability, rule functions), plus small additions to [src/workers/sqlite.worker.ts](../../../src/workers/sqlite.worker.ts) and [src/workers/db-client.ts](../../../src/workers/db-client.ts) for object rows and atomic statement batches. No UI, no route, no store rewiring.
- **Configuration**: none. **Dependencies**: none — the governed stack table is untouched.
- **Verification**: unit tests only; the layer is exercised without a browser because the rule functions are pure and the repositories are injectable.
- **Out of scope**: pages, routes, and stores for any domain (they arrive with the phase-ordered feature changes in [designs/domain-capability-map.md](../../designs/domain-capability-map.md)); online quotes and rates; import/export; reports; attachment binaries (permanently read-only by operator decision).
