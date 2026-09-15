# File Metadata and Settings Surfaces — Proposal

**Change**: `file-metadata-and-settings-surfaces`
**Version**: 1.0.0
**Last Updated**: 2026-08-09

Related artifacts: [design.md](./design.md) (how), [specs/file-metadata-and-settings/spec.md](./specs/file-metadata-and-settings/spec.md) (capability delta), [tasks.md](./tasks.md) (implementation steps). Governed by [AGENTS.md](../../../../AGENTS.md).

## Why

`file-metadata-and-settings` is specified and implemented down to the repository layer, and none of it is reachable. The database records a base currency, a user name, a date format, a rate-history toggle and a trash retention window; the wizard writes two of those once and no surface has ever shown or changed any of them since. The consequences are concrete rather than cosmetic: a base currency chosen by accident at creation is permanent, the rate-history toggle that silently changes every historical conversion cannot be found, and the retention window that governs when trashed transactions are destroyed is invisible. Phase 1 of the [capability map](../../designs/domain-capability-map.md) exists to make the file's own properties inspectable and editable before the phases that depend on them arrive — every later phase reads these facts, and Phase 2 (currencies) reads the base currency first.

It also closes a smaller gap left by Phase 0: the locale switcher in the toolbar forgets the user's choice on every reload, because nothing persists it.

## What Changes

- **A settings surface at its own route**, reachable from the navigation drawer, grouping what the file records about itself separately from what the application records about how it behaves — the store separation the capability already makes normative, made visible.
- **File facts become editable**: base currency, user name, date format, and the currency-history toggle. Each is written by name, leaving every other key in the table untouched.
- **Changing the base currency warns first.** It re-bases every conversion in the database, including historical ones, so the change is presented with that consequence stated and requires explicit confirmation. Upstream allows the change without ceremony; this keeps the capability but not the silence (operator decision 2026-08-09).
- **Application preferences become editable**, starting with the trash retention window that `transaction-ledger` reads when purging.
- **The active locale becomes a file fact**, stored under the upstream `LOCALE` key so a reload restores it and a synchronized device inherits it. Switching before a database is open applies immediately and persists once one is.
- **File information is presented read-only**: schema version and data version, as translated text rather than raw values.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `file-metadata-and-settings`: ADDS the user-facing requirements the baseline deliberately left out — the settings surface and its route, editing file facts, the base-currency change confirmation, editing application preferences, persisting the active locale, and presenting file information. No existing requirement changes; the custody and store-separation rules already in force constrain how the surface behaves.

## Impact

- **Code**: a settings page and its route, small components for the grouped sections, a store or composable over the existing `infoRepo` / `settingRepo` / `fileFacts`, a navigation entry, locale persistence wired into the existing switcher, and additions to both catalogs.
- **Configuration**: none. **Dependencies**: none — the domain layer already provides every read and write this needs.
- **Verification**: unit tests for the surface's behavior and for the guarantee that editing one key leaves unrecognized keys intact.
- **Out of scope**: settings belonging to capabilities not yet implemented — budget options, share precision, asset compounding, financial-year and budget-offset keys — each arrives with its own phase; theme or dark-mode selection, which touches the single-palette rule `infrastructure-baseline` owns and deserves its own change; and the full upstream options dialog, whose remaining pages have no counterpart here yet.
