# File Metadata and Settings Fidelity — Tasks

**Change**: `file-metadata-and-settings-fidelity`
**Version**: 1.0.0
**Last Updated**: 2026-10-02

Related artifacts: [proposal.md](./proposal.md), [design.md](./design.md), [specs/file-metadata-and-settings/spec.md](./specs/file-metadata-and-settings/spec.md), [specs/currency-management/spec.md](./specs/currency-management/spec.md). Governed by [AGENTS.md](../../../AGENTS.md). Each task names how it is verified; a box is checked only once that verification has passed.

## 1. Rules layer: keys, masks, language mapping

- [ ] 1.1 Add `LANGUAGE` to `SETTING_KEY` in [src/domain/rules/metadata.ts](../../../src/domain/rules/metadata.ts), and add `LOCALE` to `INFO_KEY` so `storeForKey` places both correctly; verify with a unit test that `storeForKey('LANGUAGE')` is `setting` and `storeForKey('LOCALE')` is `infotable`
- [ ] 1.2 Add the language mapping (`en-US` ↔ `en_US`, `zh-TW` ↔ `zh_TW`) as pure functions in the rules layer, returning null for anything else; verify with unit tests for both directions, an unknown name, and desktop's numeric wxLanguage form being treated as unsupported (design D1)
- [ ] 1.3 Add `DATE_FORMAT_MASKS`, copied verbatim from desktop's `g_date_formats_map` with a comment naming `util.cpp`, and `isDateFormatMask()`; verify with a unit test that the list has 36 entries, contains `%d/%m/%Y` and `%Y-%m-%d`, and rejects `YYYY-MM-DD` (design D3, risk R3)
- [ ] 1.4 Add `renderDateMask(mask, date)` covering desktop's tokens `%d %m %y %Y %Mon %w`; verify with one unit test per token and one for `%d %Mon'%y` (risk R5)
- [ ] 1.5 Change the `USECURRENCYHISTORY` default to `true` in `DEFAULTS` and in `fileFacts.useCurrencyHistory()` in [src/domain/repos/metadata.ts](../../../src/domain/repos/metadata.ts); verify with a unit test that an absent key reads as on and a stored `0` reads as off (design D5)
- [ ] 1.6 Add `RETENTION_DAYS_MAX = 999` and a `parseRetentionDays(input)` that returns null for empty, non-numeric or out-of-range input; verify with unit tests for `''`, `abc`, `-1`, `1000`, `0`, `999` (design D9)

## 2. Repository: the base-currency change

- [ ] 2.1 Add `currencyRepo.changeBase(currencyId)` in [src/domain/repos/currency.ts](../../../src/domain/repos/currency.ts) that emits, in one `db.mutate` batch, the `BASECURRENCYID` upsert, `UPDATE CURRENCYFORMATS_V1 SET BASECONVRATE = 1`, and `DELETE FROM CURRENCYHISTORY_V1`; verify with a repo test that asserts exactly one batch holding all three statements (design D4, risk R2)
- [ ] 2.2 Make `settingsStore.setBaseCurrency()` call `changeBase()` and reload; verify with a store test on a fake file holding a currency at rate `0.9` and two history rows that, after the call, the pointer moved, every rate is `1` and history is empty

## 3. Store: language, repair, and bounded preferences

- [ ] 3.1 Replace the `LOCALE` reads and writes in [src/stores/settings-store.ts](../../../src/stores/settings-store.ts) with `SETTING_V1.LANGUAGE` in canonical form, through the mapping from 1.2; verify with store tests that switching to `zh-TW` writes `zh_TW` under `LANGUAGE` and writes nothing to `INFOTABLE_V1`
- [ ] 3.2 Implement the one-time repair in the readiness sync: when `LANGUAGE` is absent and `LOCALE` is exactly `en-US` or `zh-TW`, apply it, write `LANGUAGE`, set `LOCALE` to `''`; verify with store tests for `zh-TW` (repaired), `de_DE.UTF-8` (untouched), `''` (untouched) and an absent row (untouched) (design D2, risk R1)
- [ ] 3.3 Order the repair before the pending-choice flush in the readiness sync; verify with a store test where a pending choice and a legacy `LOCALE` coexist and the pending choice wins while `LOCALE` is still cleared (risk R6)
- [ ] 3.4 Keep the unsupported-`LANGUAGE` tolerance: a stored `fr_FR` leaves the fallback in effect and the row untouched; verify with a store test
- [ ] 3.5 Load the file's currencies in the store (`currencyRepo.all()`) for the picker and resolve the committed base by `CURRENCYID`; verify with a store test on a fake file whose currencies include a non-seed row and lack a seed row (design D6)
- [ ] 3.6 Make `setRetentionDays()` accept only what `parseRetentionDays` returns and `setDateFormat()` accept only a mask from 1.3, each throwing a typed refusal otherwise; verify with store tests that `''`, `1000` and `YYYY-MM-DD` write nothing
- [ ] 3.7 Read `DATAVERSION` without a default, exposing null when absent; verify with a store test (design D10)
- [ ] 3.8 Remove the dead exports `isLoaded`, the `activeLocale` re-export and `storedLocale` if no caller remains; verify with `npm run lint:check` and `npm run type-check`

## 4. New-file wizard

- [ ] 4.1 Write `USECURRENCYHISTORY = 1` alongside `BASECURRENCYID` in [src/stores/database-store.ts](../../../src/stores/database-store.ts); verify with the database-store test asserting the seeded keys (design D5)

## 5. Settings page

- [ ] 5.1 Build the base-currency picker from the store's currency list, labelled `CURRENCY_SYMBOL — CURRENCYNAME`, in [src/pages/SettingsPage.vue](../../../src/pages/SettingsPage.vue); verify with a page test that a non-seed currency is offered and chosen through the select
- [ ] 5.2 Replace the date-format input with a select over the masks, each labelled with today's date rendered in it, showing a stored out-of-list value as stored; verify with page tests that choosing the `%d/%m/%Y` option writes that mask, and that a stored `YYYY-MM-DD` is shown and not rewritten (design D3)
- [ ] 5.3 Add the page-level error banner and restore each draft from the store after a failed write; verify with page tests that a failing user-name write shows the banner and the field returns to the stored value (design D7)
- [ ] 5.4 Refuse an empty, non-numeric or out-of-range retention entry with a message on the field and restore the draft; verify with page tests for `''` and `1000` that nothing is written and the field shows the stored value (design D9)
- [ ] 5.5 Derive the language field from the active i18n locale so it follows the shell's switcher; verify with a page test that changing `i18n.global.locale` updates the field
- [ ] 5.6 Show `DATAVERSION` as "Not set" when absent; verify with a page test (design D10)
- [ ] 5.7 Reword `BaseCurrencyChangeDialog.vue` to state that rates are reset to 1 and historical rates deleted, in both catalogs; verify with a page test that drives the real select and dialog (not the vm): choosing a currency opens the dialog with that text, declining restores the selection and writes nothing, confirming calls the store once
- [ ] 5.8 Mutation check: with the dialog's confirm and cancel handlers stubbed out, the 5.7 tests fail; verify by running them against the stubbed page and recording the failure count here once done

## 6. Shell and i18n

- [ ] 6.1 Read the language on readiness through the store's new sync in [src/App.vue](../../../src/App.vue) and keep the toolbar switcher calling `setLocale`; verify with the existing shell localization test and a store test that the readiness watcher triggers the repair path
- [ ] 6.2 Replace the hardcoded `'English' : '繁體中文'` label map with one map beside `SUPPORTED_LOCALES` in [src/i18n.ts](../../../src/i18n.ts) used by both the shell and the page; verify with `npm run lint:check` and a page test asserting both labels

## 7. Localization

- [ ] 7.1 Add the new strings to both catalogs: the retention refusal, the date-format labels, the reworded base-currency warning, the write-failure banner title; verify with the shell localization parity test
- [ ] 7.2 Remove catalog keys no code references after this change (`language.*` if replaced); verify with a grep that every `settings.*` key is referenced and the parity test passes

## 8. End-to-end

- [ ] 8.1 Add [e2e/settings.spec.ts](../../../e2e/settings.spec.ts) on Chromium: switch to `zh-TW`, pick a date format, change the base currency and confirm, reload, and assert each is shown; verify by running `CI=true npx playwright test e2e/settings.spec.ts --project=chromium`
- [ ] 8.2 In the same test, read `INFOTABLE_V1` and `SETTING_V1` back through the page's database client and assert `LANGUAGE = zh_TW`, no `LOCALE` write, `DATEFORMAT` equal to the chosen mask, every `BASECONVRATE = 1`; verify by the assertions passing
- [ ] 8.3 Run the same test on WebKit and record the result in this file; if the WebKit environment issue recorded as F31 of the account change still blocks it, say so here rather than checking this box

## 9. Verification

- [ ] 9.1 `openspec validate file-metadata-and-settings-fidelity --strict` passes
- [ ] 9.2 `npm run test:unit` passes with a higher count than before this change (320 passed, 1 skipped before)
- [ ] 9.3 `npm run type-check` passes
- [ ] 9.4 `npm run lint:check` passes
- [ ] 9.5 `npm run format:check` passes
- [ ] 9.6 `npm run build` succeeds
- [ ] 9.7 Spec against implementation: every MODIFIED requirement and scenario in both deltas is traced to code and to a passing test, recorded in the Verification Record below

## 10. Review Gate

- [ ] 10.1 Operator review and approval
- [ ] 10.2 Archive: promote both deltas, raise `file-metadata-and-settings` to 1.2.0 and `currency-management` to 1.2.0, update each Purpose, and confirm every link resolves from the promoted locations; only then record the change in the capability map
