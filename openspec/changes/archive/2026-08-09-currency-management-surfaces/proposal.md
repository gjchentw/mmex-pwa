# Currency Management Surfaces — Proposal

**Change**: `currency-management-surfaces`
**Version**: 1.0.0
**Last Updated**: 2026-08-09

Related artifacts: [design.md](./design.md) (how), [specs/currency-management/spec.md](./specs/currency-management/spec.md) (capability delta), [tasks.md](./tasks.md) (implementation steps). Governed by [AGENTS.md](../../../../AGENTS.md).

## Why

Phase 1 shipped a switch with nothing behind it. The settings surface now offers "use exchange-rate history", and turning it on changes nothing at all, because no surface can put a rate into the history table — the resolver simply falls back to each currency's fixed rate. The same gap sits under the fixed rate itself: every currency arrives from the seed data at whatever conversion rate upstream recorded, and nothing in the application can correct it. Any figure the later phases convert would be measured against numbers no one chose.

Phase 2 of the [capability map](../../designs/domain-capability-map.md) closes that before conversion starts mattering. Phase 3 gives accounts a currency, Phase 5 converts transactions across them; both inherit whatever this phase establishes. The domain layer is already complete here — definitions, precision, formatting, the day-rate resolver with its earlier-row tie rule — so this change is entirely about reaching it.

## What Changes

- **A currency surface at its own route**, listing by default only the currencies this file actually uses — the ones an account or an asset references, plus the base currency — with a way to browse all of the seeded set and search it. A flat list of 168 would bury the handful that matter (operator decision 2026-08-09).
- **Currency definitions become editable**: prefix and suffix symbols, decimal and grouping separators, unit and cent names, scale, type, and the fixed conversion rate. A new currency can be added for holdings the seeded set does not cover, under the case-insensitive uniqueness the capability already requires.
- **A live format preview**, so the effect of scale and separators is visible while editing rather than discovered later in a report.
- **Exchange-rate history becomes manageable**: rates can be recorded for a date and removed, which is what makes the Phase 1 toggle mean something. Rates entered here are marked as manually recorded, distinct from anything a future online source would write.
- **The base currency is marked but not changed here.** Settings remains the single place it can change, so the warning and confirmation shipped in Phase 1 stay the only path (operator decision 2026-08-09).
- **Deleting a currency is offered where it is allowed** — refused with the reason when an account or asset still references it, and taking that currency's rate history with it when it is not.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `currency-management`: ADDS the user-facing requirements the baseline left out — the currency surface and its route, editing and adding definitions, the format preview, rate-history management, base-currency indication, and deletion from the surface. No existing requirement changes; the definition, precision, resolution and deletion rules already in force constrain everything the surface does.

## Impact

- **Code**: a currency page and its route, an editor for one currency, a rate-history section, a store over the existing `currencyRepo` / `currencyHistoryRepo`, a navigation entry, and additions to both catalogs.
- **Configuration**: none. **Dependencies**: none — the domain layer already provides every read, write and computation this needs.
- **Verification**: unit tests for the surface's behavior, and for the rules it depends on that are already covered at the domain layer.
- **Out of scope**: fetching rates from an online source, which the capability map holds as long-lived non-scope; changing the base currency, which stays in settings; and per-account currency assignment, which arrives with Phase 3.
