# Currency Management Surfaces — Tasks

**Change**: `currency-management-surfaces`
**Version**: 1.0.0
**Last Updated**: 2026-08-09

## 1. Routing and navigation

- [x] 1.1 `/currencies` declared in [src/router/index.ts](../../../src/router/index.ts) with `capability: 'currency-management'`, guarded by readiness, carrying navigation metadata
- [x] 1.2 The entry appears in the drawer through the existing route-derived navigation

## 2. Currency list

- [x] 2.1 [src/pages/CurrenciesPage.vue](../../../src/pages/CurrenciesPage.vue), reading through the repositories on entry (design D6)
- [x] 2.2 Defaults to the used set with a toggle for every defined currency and a search over name and symbol
- [x] 2.3 The base currency is badged in the list and its rate shown as `1`; no control changes which one it is
- [x] 2.4 [src/stores/currency-store.ts](../../../src/stores/currency-store.ts) resolves the used set, the base currency and the rate-history setting
- [x] 2.5 **Added during implementation** — `currencyRepo.usedCurrencyIds()` resolves the used set in one query. Asking `isInUse` per currency would have issued over five hundred queries against a seeded file
- [x] 2.6 **Added during implementation** — the empty list distinguishes "nothing is in use yet" from "your search matched nothing", with a shortcut to show all. Before accounts exist nothing references a currency, so the normal state was being reported as a search miss

## 3. Definition editor

- [x] 3.1 [CurrencyEditorForm.vue](../../../src/components/currency/CurrencyEditorForm.vue) holds the fields and logic; [CurrencyEditorDialog.vue](../../../src/components/currency/CurrencyEditorDialog.vue) is a thin dialog around it, presenting full-page on mobile (design D3)
- [x] 3.2 Adding a currency through the same form; a name or symbol another currency holds is refused case-insensitively by `currencyRepo.add` / `.save`
- [x] 3.3 The base currency's rate is pinned to one, marked read-only, and saved as one whatever was typed
- [x] 3.4 Format preview driven by the existing `formatAmount` rule, updating as fields change

## 4. Rate history

- [x] 4.1 A currency's recorded rates listed newest first
- [x] 4.2 Recording a rate for a date, marked manual; a repeated date replaces rather than duplicates
- [x] 4.3 Removing a recorded rate (`currencyHistoryRepo.remove`, added for this)
- [x] 4.4 No history for the base currency, and a badge stating recorded rates are inactive while the file's setting is off (risk R1)

## 5. Deletion

- [x] 5.1 Deletion offered from the editor; the capability's refusal — referenced by an account or asset, or serving as the base currency — is surfaced as the error message
- [x] 5.2 Deleting removes the currency and its recorded rates in one operation, as the capability already required

## 6. Localization

- [x] 6.1 Both catalogs gained the list, editor, preview, history and empty-state strings
- [x] 6.2 Catalog parity holds at 124 keys

## 7. Tests

- [x] 7.1 Default list contains only used currencies and the base currency; the toggle widens it; search matches name and symbol; the used set is resolved in one query
- [x] 7.2 A conflicting name or symbol is refused case-insensitively; a non-conflicting edit succeeds
- [x] 7.3 The base currency's rate is pinned to one, read-only, and saved as one regardless of input
- [x] 7.4 The preview follows scale and separators, including a scale of one rendering no decimals
- [x] 7.5 Rate history: recorded with the manual marker, a repeated date replaces, removal works, ordering is newest first, and the base currency has none
- [x] 7.6 Deletion refused while referenced or while base; an unused currency goes with its history
- [x] 7.7 Route resolves, declares its capability, stays guarded, and appears in the navigation entries
- [x] 7.8 **Added during implementation** — the empty state distinguishes its two causes, and one test asserts the form actually rendered. The first version of the editor tests ran against a dialog, whose portal renders nothing under test: absence assertions passed for the wrong reason. Splitting the form out of the dialog is what made these assertions mean anything

## 8. Verification

- [x] 8.1 `openspec validate currency-management-surfaces` passes
- [x] 8.2 Unit suite 235 passed / 1 skipped (up from 203); `vue-tsc`, ESLint (`--max-warnings=0`) and Prettier clean; production build succeeds
- [x] 8.3 Drove the production preview: the default list, the show-all toggle revealing all 168 seeded currencies, search narrowing to one, the editor with a live preview rendering real formatting, recording a rate, and **that rate surviving a reload**. The new empty state and its shortcut render as intended. **One assertion was not reached in the browser**: the base-currency badge, because the verification profile's database carried no `BASECURRENCYID` and four attempts to set one through UI automation ran aground on Quasar select and dialog interaction details rather than on product behavior. It is covered directly by unit tests over the same store code, and Phase 1 verified in the browser that database creation writes that fact
- [x] 8.4 Capability map updated: Phase 2 delivered

## 9. Review Gate

- [x] 9.1 Operator reviewed and approved the change (2026-08-09)
- [x] 9.2 Archived — `currency-management` promoted to 13 requirements at 1.1.0
