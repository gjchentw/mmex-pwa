# File Metadata and Settings Surfaces — Tasks

**Change**: `file-metadata-and-settings-surfaces`
**Version**: 1.0.0
**Last Updated**: 2026-08-09

## 1. Routing and navigation

- [x] 1.1 `/settings` declared in [src/router/index.ts](../../../src/router/index.ts) with `capability: 'file-metadata-and-settings'`, guarded by readiness, carrying navigation metadata
- [x] 1.2 The entry appears in the drawer through the existing route-derived navigation and shows as active on that route

## 2. Settings surface

- [x] 2.1 [src/pages/SettingsPage.vue](../../../src/pages/SettingsPage.vue) with three groups: this file, this application, and read-only file information
- [x] 2.2 [src/stores/settings-store.ts](../../../src/stores/settings-store.ts) reads every presented value through the repositories on entry (design D3)
- [x] 2.3 File facts: base currency picker over the shared currency data, user name, date format, currency-history toggle — each written by key name
- [x] 2.4 Trash retention window, with its meaning stated and zero explained as immediate deletion; negative input is clamped to zero
- [x] 2.5 File information: schema version from the database store, data version from the file, read-only and translated

## 3. Base currency confirmation

- [x] 3.1 [BaseCurrencyChangeDialog.vue](../../../src/components/settings/BaseCurrencyChangeDialog.vue) states the consequence in the user's terms — converted figures change throughout the file, entered amounts are not rewritten — following the existing dialog conventions
- [x] 3.2 Picking a currency only stages it; the write happens on confirmation and declining restores the previous selection

## 4. Locale persistence

- [x] 4.1 The active locale is written under the upstream `LOCALE` file fact from either the shell switcher or the settings surface. The i18n instance moved into [src/i18n.ts](../../../src/i18n.ts) so the store can drive it; `main.ts` consumes the same instance
- [x] 4.2 The stored locale is restored when the database opens; an unsupported value falls back for display and is left in place (design D6)
- [x] 4.3 A choice made before the database is open applies to the session and is flushed on readiness, driven by a watcher in [src/App.vue](../../../src/App.vue) (design D5)

## 5. Localization

- [x] 5.1 Both catalogs gained the settings groups, labels, hints, retention explanation, base-currency warning and file information labels
- [x] 5.2 Catalog parity holds at 92 keys, asserted by the existing shell localization test

## 6. Tests

- [x] 6.1 Editing one fact leaves every other row intact, including `MMEXVERSION` and an invented `SOME_FUTURE_KEY` this build does not recognize (risk R1)
- [x] 6.2 A preference write targets `SETTING_V1` and creates no row in `INFOTABLE_V1`; fact writes address `INFONAME` and never `INFOID`
- [x] 6.3 Base currency: staging writes nothing, confirming writes, declining leaves the stored value untouched
- [x] 6.4 Locale: stored on change, restored on open, a pending session choice wins over the stored value, and an unsupported stored locale falls back without being overwritten
- [x] 6.5 Route: `/settings` resolves, declares its capability, stays guarded, and appears in the navigation entries

## 7. Verification

- [x] 7.1 `openspec validate file-metadata-and-settings-surfaces` passes
- [x] 7.2 Unit suite 203 passed / 1 skipped (up from 182); `vue-tsc`, ESLint (`--max-warnings=0`) and Prettier clean; production build succeeds
- [x] 7.3 Drove the production preview end to end: reached settings through the drawer, read schema version 21 and data version 3, wrote a user name and a retention window, reloaded and saw both persist, then switched language and confirmed the choice survived a reload. Two selector faults in the verification script were mine, not the product's — Quasar sets `role="listitem"` on navigation anchors, and forwards attributes onto the native input rather than the field wrapper
- [x] 7.4 Capability map updated: Phase 1 delivered

## 8. Review Gate

- [x] 8.1 Operator reviewed and approved the change (2026-08-09)
- [ ] 8.2 Archive once approved
