# App Shell and Navigation — Proposal

**Change**: `app-shell-navigation`
**Version**: 1.0.0
**Last Updated**: 2026-08-09

Related artifacts: [design.md](./design.md) (how), [specs/app-shell-navigation/spec.md](./specs/app-shell-navigation/spec.md) (new capability), [tasks.md](./tasks.md) (implementation steps). Governed by [AGENTS.md](../../AGENTS.md).

## Why

The application has no home. The router declares only `/init`, `/auth/callback` and a development probe, so once the database is ready the readiness guard passes `/` straight through to an unmatched route and the user is left staring at an empty page container — while the navigation drawer offers links to `/` and `/about` that resolve to nothing. Fourteen capability specifications now govern the data underneath, and a typed domain layer implements all of it, but nothing governs the surface that would let anyone reach it. This is Phase 0 of the [capability map](../../designs/domain-capability-map.md): until routing is governed, each of the ten domain phases that follow would invent its own navigation conventions, and the operator's URL-routed decision (2026-08-08) would have no normative home.

## What Changes

- **New capability `app-shell-navigation`**: the route registry rule (every route belongs to a declaring capability), the database-readiness guard and its exemptions, the persistent shell, navigation that reflects the current location, unmatched-route handling, and localization of shell text.
- **A home route**: `/` resolves to a summary surface built from cards. Phase 0 delivers the frame and its first-run empty state; each later phase contributes its own card, per the operator's progressive summary-card decision (2026-08-08). No domain data is surfaced here yet — account balances arrive with `account-management` in Phase 3.
- **Deep-linkable navigation**: the drawer highlights the active destination and is driven by the URL rather than by internal state, so every destination can be linked, bookmarked and restored — the shape the operator chose for register scopes.
- **Unmatched routes stop being silent**: an unknown path resolves to a not-found surface offering a way back, instead of rendering nothing.
- **Shell text becomes translatable**: the toolbar title and the database status line are hardcoded English today (`'Title'`, `'Probing...'`, `'Needs Setup'`) even though the status is passed through a translation call. Both catalogs gain the missing entries.
- **Developer scaffolding retires**: the raw `PRAGMA user_version` dump in the database drawer is replaced by a localized status entry.

## Capabilities

### New Capabilities

- `app-shell-navigation`: Application shell, route registry governance, database-readiness guard, home summary surface, location-reflecting navigation, unmatched-route handling, and localized shell text.

### Modified Capabilities

- None. `infrastructure-baseline` continues to own the router and i18n *mechanics*; this capability governs what the application does with them. No domain capability's requirements change.

## Impact

- **Code**: [src/router/index.ts](../../../src/router/index.ts) (home route, not-found route, guard), [src/App.vue](../../../src/App.vue) (navigation list, localized title and status, retired debug dump), a new home page and not-found page under [src/pages/](../../../src/pages/), summary-card scaffolding under [src/components/](../../../src/components/), and additions to both catalogs in [src/locales/](../../../src/locales/).
- **Configuration**: none. **Dependencies**: none — the governed stack table is untouched.
- **Verification**: unit tests for the guard, the route table and the shell; the existing end-to-end tests already exercise database readiness and will now land on a real home.
- **Out of scope**: any domain page or register (each arrives with its phase), the dashboard widget set deferred in the capability map's long-lived non-scope, and an about page — nothing in Phase 0 needs one, so the broken link is removed rather than backfilled.
