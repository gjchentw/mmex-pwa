# App Shell and Navigation — Tasks

**Change**: `app-shell-navigation`
**Version**: 1.0.0
**Last Updated**: 2026-08-09

## 1. Routing

- [x] 1.1 Home route at `/` and a catch-all not-found route in [src/router/index.ts](../../../src/router/index.ts); the development probe stays conditionally spread and is absent from production bundles (verified against `dist/`)
- [x] 1.2 Guard exemptions expressed as route metadata (`meta.public`) so a future capability declares one without editing the guard
- [x] 1.3 Navigation metadata (label key, icon, order) carried on routes, plus `meta.capability` recording which specification declares each route; `navigationEntries()` derives the drawer from it
- [x] 1.4 **Added during implementation** — the intended destination is preserved across initialization (`?redirect=`) and resumed once ready, with `safeRedirectTarget` refusing anything that is not an in-application path. Without it a cold-loaded deep link was silently swallowed, which would have broken the operator's deep-linkability decision for every later phase

## 2. Pages

- [x] 2.1 [src/pages/HomePage.vue](../../../src/pages/HomePage.vue) renders registered summary cards, with the first-run empty state naming the database state and the next action
- [x] 2.2 [src/components/home/summary-cards.ts](../../../src/components/home/summary-cards.ts) — a registry so a later phase contributes a card without editing the home
- [x] 2.3 [src/pages/NotFoundPage.vue](../../../src/pages/NotFoundPage.vue) offering navigation back to the home surface
- [x] 2.4 **Added during implementation** — [src/pages/DatabaseInitPage.vue](../../../src/pages/DatabaseInitPage.vue) now leaves for the resumed destination whenever readiness is reached, not only after the wizard. A returning user was stuck there: opening `/` redirected to setup, the probe reported ready, and nothing navigated away

## 3. Shell

- [x] 3.1 Drawer entries in [src/App.vue](../../../src/App.vue) derived from route metadata with the active destination indicated; the broken about entry removed
- [x] 3.2 Toolbar title and database status line localized (both were hardcoded English); the shell keeps Quasar's responsive layout
- [x] 3.3 Raw `PRAGMA user_version` dump replaced by a translated schema-version entry sourced from the store, retiring the ad-hoc query and its `mounted` hook

## 4. Localization

- [x] 4.1 Both catalogs gained navigation, database lifecycle states, schema version, home empty state and not-found strings
- [x] 4.2 The retired about entry removed from both catalogs; key parity between catalogs is asserted by a test

## 5. Tests

- [x] 5.1 Guard: defers a guarded route, exempts the authentication terminal and the initialization surface, serves once ready, sends a ready database away from the initialization surface, preserves and resumes the intended destination, refuses an off-site destination
- [x] 5.2 Route table: the home path resolves, an unknown path resolves to not-found, every route declares a capability, every navigation entry resolves to a served route, the development probe is gated on the DEV flag
- [x] 5.3 Home: the empty state renders with no card; a registered card renders, cards order by declaration, and re-registering an identity replaces it
- [x] 5.4 Shell: catalog key parity, every lifecycle state translated in both locales, shell surfaces translated, interpolation of the status line and schema version, no retired about label

## 6. Verification

- [x] 6.1 `openspec validate app-shell-navigation` passes
- [x] 6.2 Unit suite 182 passed / 1 skipped (up from 155); `vue-tsc`, ESLint (`--max-warnings=0`) and Prettier clean; production build succeeds
- [x] 6.3 Ran the production preview and drove it end to end: cross-origin isolated, database opens, the app leaves the initialization surface for the home surface, the empty state renders, an unknown path shows the not-found surface, and its link returns home. Playwright regression suite still passes. One limitation: the two end-to-end scenarios added for this were reverted after the runner timed out driving the Quasar wizard, so this path is covered by unit tests plus a one-off scripted run rather than a committed end-to-end test
- [x] 6.4 Capability map updated: Phase 0 delivered, `app-shell-navigation` and `domain-data-access` added to the roster

## 7. Review Gate

- [ ] 7.1 Operator reviews the change
- [ ] 7.2 Archive once approved
