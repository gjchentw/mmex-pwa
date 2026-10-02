# File Metadata and Settings Fidelity — Proposal

**Change**: `file-metadata-and-settings-fidelity`
**Version**: 1.0.0
**Last Updated**: 2026-10-02

Related artifacts: [design.md](./design.md) (how), [specs/file-metadata-and-settings/spec.md](./specs/file-metadata-and-settings/spec.md) (capability delta), [tasks.md](./tasks.md) (implementation steps). Governed by [AGENTS.md](../../../../AGENTS.md).

## Why

The settings surface delivered by `file-metadata-and-settings-surfaces` on 2026-08-09 writes values into the `.mmb` file that desktop MoneyManagerEx cannot use. A five-axis review on 2026-10-02 (recorded in the archived change's successor, this one) found five such defects, each verified against the desktop source:

- The display language is written to `INFOTABLE_V1.LOCALE`, which desktop uses as the `std::locale` name for amount formatting, not as the UI language. A value such as `zh-TW` makes desktop's Options dialog refuse to save ("Bad locale name") on macOS and Linux. Desktop keeps the UI language in `SETTING_V1.LANGUAGE`.
- The date format is free text, and its own hint suggests `YYYY-MM-DD`; desktop accepts only its fixed list of `%`-masks, so a stored literal renders every date as that literal and parses none.
- Changing the base currency writes only the pointer. Desktop warns, resets every currency's `BASECONVRATE` to 1 and deletes all rate history, because the stored rates are denominated in the old base. After the PWA's change every conversion is wrong.
- When `USECURRENCYHISTORY` is absent, desktop treats it as on and the PWA as off, so the same file converts differently in the two applications. Every file the PWA creates lacks the key.
- The base-currency picker is built from a static JSON file instead of the file's `CURRENCYFORMATS_V1`, so a currency added through the currency surface cannot be chosen and a deleted one still can, which writes a dangling `BASECURRENCYID`.

The capability's standing constraint is full bidirectional `.mmb` compatibility. Phases 4 and 5 will build transactions on the base currency and the date format, so these must be right first. The operator decided on 2026-10-02 to match desktop on every point.

## What Changes

- **Language persistence moves to `SETTING_V1.LANGUAGE`**, written in desktop's canonical form (`en_US`, `zh_TW`) and read back into the PWA's locale tags. `INFOTABLE_V1.LOCALE` is never written again; an existing value is preserved. **BREAKING** for files the PWA already wrote: a `LOCALE` of exactly `en-US` or `zh-TW` left by the earlier surface is read once as the language, written under `LANGUAGE`, and then cleared to the empty string, which desktop reads as "derive the format from the currency settings" (operator decision 2026-10-02). Any other `LOCALE` value is never touched.
- **Date format becomes a choice** from desktop's mask list, shown with today's date as a sample. A stored value outside the list is shown as stored and left untouched until the user picks one.
- **Base-currency change does what desktop does**: after a confirmation that says historical rates will be deleted, the pointer is set, every `BASECONVRATE` becomes 1 and `CURRENCYHISTORY_V1` is emptied, in one logical operation.
- **Exchange-rate history defaults to on** when the key is absent, and the new-file wizard writes the key explicitly.
- **The base-currency picker reads the file's currencies**, labelled by code and name.
- **Retention is bounded** to 0 through 999 days, as desktop's control is; an empty or non-numeric entry is refused and the field restored rather than written as 0.
- **Write failures are shown** on the surface and the field is restored from the stored value, as the account surface already does.
- **The language field follows the shell**: choosing a language from the toolbar updates the settings page's field too.
- **File information shows only what is stored**: a missing `DATAVERSION` is shown as not set rather than as the default `3` (operator decision 2026-10-02).

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `file-metadata-and-settings`: MODIFIES Active Locale Persistence (store and key), Editing File Facts (date-format domain, failure handling), Base Currency Change Confirmation (the stated consequence and what confirming does), Settings Surface (picker source, failure display), Well-Known File Facts (`USECURRENCYHISTORY` default and seeding), Editing Application Preferences (retention bounds and refusal), and File Information Presentation (absent values shown as not set). The Store Separation, Unknown Key Preservation and custody requirements are unchanged and constrain everything here.
- `currency-management`: MODIFIES Base Currency, adding what a base-currency change does to the tables this capability owns: every `BASECONVRATE` becomes 1 and `CURRENCYHISTORY_V1` is emptied, in the same logical operation as the pointer change, as desktop does. The settings surface invokes this rule; the capability owns it.

## Impact

- **Code**: [src/stores/settings-store.ts](../../../../src/stores/settings-store.ts), [src/pages/SettingsPage.vue](../../../../src/pages/SettingsPage.vue), [src/components/settings/BaseCurrencyChangeDialog.vue](../../../../src/components/settings/BaseCurrencyChangeDialog.vue), [src/domain/repos/metadata.ts](../../../../src/domain/repos/metadata.ts), [src/domain/rules/metadata.ts](../../../../src/domain/rules/metadata.ts), [src/domain/repos/currency.ts](../../../../src/domain/repos/currency.ts) (the base-change batch), [src/stores/database-store.ts](../../../../src/stores/database-store.ts) (wizard seeding), [src/i18n.ts](../../../../src/i18n.ts) and [src/App.vue](../../../../src/App.vue) (language key), both catalogs, the settings tests, and a new end-to-end test for the surface.
- **Configuration**: none. **Dependencies**: `currency-management` provides the currency list and owns the rate tables the base change resets; its Requirement "Base Currency" gains the reset rule in this change, and the settings surface performs it through that capability's repository.
- **Verification**: unit tests for each rule, a mutation check that the confirmation tests fail when the handlers are removed, and an end-to-end run that reads `INFOTABLE_V1` and `SETTING_V1` back to prove what was written.
- **Out of scope**: the currency surface's own defects, which the next change `currency-management-fidelity` carries; desktop's batched OK/Cancel options dialog: the surface keeps its per-field save, the web convention for a settings page, with the base-currency change already behind a confirmation (operator decision 2026-10-02, recorded in design D8); any other file fact desktop's Options expose but the surface does not yet present.
