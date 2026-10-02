# Currency Management Fidelity — Tasks

**Change**: `currency-management-fidelity`
**Version**: 1.0.0
**Last Updated**: 2026-10-02

Related artifacts: [proposal.md](./proposal.md), [design.md](./design.md), [specs/currency-management/spec.md](./specs/currency-management/spec.md). Governed by [AGENTS.md](../../../AGENTS.md). Each task names how it is verified; a box is checked only once that verification has passed.

## 1. Rules layer: formatting, precision, validation

- [x] 1.1 In [src/domain/rules/currency.ts](../../../src/domain/rules/currency.ts), place the sign after the prefix in `formatAmount` and render a magnitude below `1e-10` as zero; verify with unit tests for `$-80.00`, `-80.00 €` (suffix), and `-1e-12` rendering `$0.00`, and by updating the existing `-€1,234.50` assertion (design D7)
- [x] 1.2 Make `precisionFromScale` truncate `log10` as desktop does; verify with unit tests that `50` gives 1 and `100` gives 2
- [x] 1.3 Add `decimalPlacesFromScale(scale)` and `scaleFromDecimalPlaces(n)` (0 through 9); verify with unit tests both ways and for `50`, `0` and `''` (design D3)
- [x] 1.4 Add `DECIMAL_CHARACTERS` (`.`, `,`) and `GROUPING_CHARACTERS` (`''`, `.`, `,`, space) and `CURRENCY_CODE_MAX_LENGTH = 12`, copied from `currencydialog.cpp` with a comment naming the source; verify with a unit test of the sets' contents
- [x] 1.5 Add `validateCurrencyDefinition(definition)` returning refusals keyed by field for: empty name, empty code, code over 12 characters, grouping equal to decimal when decimal places > 0, and a rate that is empty, non-numeric, zero or negative; verify with one unit test per refusal and one for a valid definition (design D10)
- [x] 1.6 Add `normalizeCurrencyDefinition(draft)` that trims name and code, stores the symbol in exactly one of `PFX_SYMBOL`/`SFX_SYMBOL`, converts decimal places to `SCALE` and `''` to null for optional numbers; verify with unit tests including a draft holding both symbols and a draft with `''` rate
- [x] 1.7 Add `parseRateEntry(input)` returning a number of zero or more, or null for empty, non-numeric or negative input; verify with unit tests (design D11)
- [x] 1.8 Add `showHiddenCurrencies: 'SHOW_HIDDEN_CURRENCIES'` to `INFO_KEY` in [src/domain/rules/metadata.ts](../../../src/domain/rules/metadata.ts) and `DEFAULTS.showHiddenCurrencies = true`; verify with a unit test that `storeForKey` places it in the info table (design D4)

## 2. Repository: typed refusals and the latest rates

- [x] 2.1 In [src/domain/repos/currency.ts](../../../src/domain/repos/currency.ts), replace the English conflict strings with `CurrencyConflictError` carrying `field: 'name' | 'symbol'` and the colliding currency; verify with repo tests that a symbol-only collision reports `symbol` and a name-only collision reports `name` (design D9)
- [x] 2.2 Replace the deletion refusal string with `CurrencyInUseError` carrying `reason: 'base' | 'accounts' | 'assets'`; verify with repo tests for each reason
- [x] 2.3 Add `latestRatesByCurrency()` returning each currency's most recent `CURRVALUE` in one query; verify with a repo test on two currencies with two dates each (design D5, risk R3)
- [x] 2.4 Add `fileFacts.showHiddenCurrencies()` reading the key with desktop's default of true; verify with a unit test for absent, `1`, `0`
- [x] 2.5 Remove the uncalled `currencyHistoryRepo.clearAll` if nothing references it after this change; verify with `npm run lint:check` and `npm run type-check`

## 3. Store

- [x] 3.1 In [src/stores/currency-store.ts](../../../src/stores/currency-store.ts), load `showAll` from `fileFacts.showHiddenCurrencies()` and write `SHOW_HIDDEN_CURRENCIES` through `infoRepo` when it changes; verify with store tests that an absent key shows all, a stored `0` shows used only, and toggling writes the key (design D4)
- [x] 3.2 Load `latestRates` with the list when history is on and expose `displayedRate(currency)`; verify with store tests for history on (latest), history off (fixed), no history (fixed), and the base (`1`) (design D5)
- [x] 3.3 Expose `deletionBlocker(currency)` returning `'base' | 'accounts' | 'assets' | null` from the loaded sets, so the editor can disable Delete with the reason; verify with store tests for each case (design D1)
- [x] 3.4 Move `history` clearing into `loadHistory`/`clearHistory` so the page no longer assigns `store.history`; verify with `npm run lint:check` and the existing history tests
- [x] 3.5 Make the store tests assert what `save` and `add` write (columns and values, no `CURRENCYID` in an insert), replacing the resolves-only assertions; verify by the tests passing against the fake file

## 4. Editor

- [x] 4.1 Rebuild the definition fields in [src/components/currency/CurrencyEditorForm.vue](../../../src/components/currency/CurrencyEditorForm.vue) to desktop's shape: name, code (max 12), one symbol with a prefix/suffix choice, decimal and grouping selects, unit and cent names, decimal places 0 through 9, type (translated labels), fixed rate; verify with form tests that each field exists and that a stored `SCALE` `50` shows 1 decimal place and both-symbols shows the prefix (design D3, D8)
- [x] 4.2 Offer a stored out-of-set separator as the current choice until another is picked; verify with a form test on a stored `;` decimal character
- [x] 4.3 Validate at save time with `normalizeCurrencyDefinition` and `validateCurrencyDefinition`, showing each refusal on its field, keeping Save enabled; verify with form tests driving the inputs with `setValue` for empty name, empty code, equal separators, `''` rate and `-1` rate, each asserting no `save` emit and the message text (design D10)
- [x] 4.4 Emit a normalized definition: trimmed name and code, `SCALE` = `10^n`, one symbol slot; verify with a form test that a save of 2 decimal places and a prefix emits `SCALE` 100, `PFX_SYMBOL` set and `SFX_SYMBOL` `''`
- [x] 4.5 Map `CurrencyConflictError` to `currency.nameConflict` / `currency.codeConflict` with the colliding currency's name and code; verify with a form or page test showing the translated message for each field
- [x] 4.6 Prefill the fixed rate from the latest recorded rate when history is on and one exists; verify with a form test (design D5)
- [x] 4.7 Hide the history panel when history is off and show the one-line explanation; verify with form tests for on and off (design D6)
- [x] 4.8 Refuse an empty, non-numeric or negative rate entry on the field through `parseRateEntry`, allow `0`, and clear the entry fields only after the parent confirms the write; verify with form tests driving `rate-value` with `setValue('')` and `'-1'` (design D11)
- [x] 4.9 Disable Delete with the translated reason when `deletionBlocker` is set; verify with form tests for base, accounts, assets, and an unused currency (enabled) (design D1)
- [x] 4.10 Replace `defineExpose` and the tests that set `vm.draft` directly with input-driven tests; verify that no test reaches into the component's internals

## 5. Page

- [x] 5.1 In [src/pages/CurrenciesPage.vue](../../../src/pages/CurrenciesPage.vue), open a confirmation stating that the rate history goes with the currency before deleting, reusing the account page's dialog pattern; verify with page tests through the real dialog: declining writes nothing, confirming removes the currency and its history and closes the editor (design D1)
- [x] 5.2 Mutation check: with the confirmation's confirm and cancel handlers stubbed, the 5.1 tests fail; verified 2026-10-02 by stubbing `confirmDelete` and the cancel handler: 3 of the 5 deletion tests fail (confirm, decline, and the failed-deletion case; the two disabled-control tests do not go through a handler); restored and compared byte for byte, all 5 pass
- [x] 5.3 Catch history read and write failures and show them in the editor's error area; verify with page tests whose fake file fails `mutate`
- [x] 5.4 Show a failed deletion on the page and keep the currency listed; verify with a page test
- [x] 5.5 Title the rate column "Last rate" or "Fixed rate" and show `displayedRate`; verify with page tests for both settings (design D5)
- [x] 5.6 Show the type by its translated label in the list and the editor; verify with a page test in zh-TW (design D8)
- [x] 5.7 Drive `showAll` through the store so the toggle persists; verify with a page test that toggling writes `SHOW_HIDDEN_CURRENCIES` (design D4)

## 6. Localization

- [x] 6.1 Add to both catalogs: the field refusals, the conflict messages with `{name}` and `{code}`, the deletion reasons, the deletion confirmation text, the history-off explanation, the prefix/suffix and separator option labels, the type labels, and the two rate-column titles; verify with the catalog parity test
- [x] 6.2 Remove any `currency.*` key no code references after this change (`currency.historyInactive`, `currency.scale`, `currency.scaleHint`, `currency.prefix`, `currency.suffix` are candidates); verified 2026-10-02: the five candidates were removed; a literal grep reports `currency.types.*`, the five refusal keys and `currency.inUse.*` as unreferenced because they are reached through computed keys (`currency-labels.ts`, the refusal map in the editor, the deletion reason), and each is exercised by a test; the parity test passes

## 7. End-to-end

- [x] 7.1 Add [e2e/currencies.spec.ts](../../../e2e/currencies.spec.ts) on Chromium: add a currency with two decimal places and a prefix, see its preview and its list entry; edit it to a suffix and see the list entry change; record a rate and see it listed; remove the rate; delete the currency through the confirmation and see it gone after a reload; verify by running `CI=true npx playwright test e2e/currencies.spec.ts --project=chromium`
- [x] 7.2 In the same test, open the base currency and assert Delete is disabled with the base-currency reason, and that the account surface shows a balance with the sign after the prefix; verify by the assertions passing
- [ ] 7.3 Run the same test on WebKit and record the result here; if F31 of the account change still blocks it, say so rather than checking this box. Result 2026-10-02: not run to completion; the database never reaches Ready on Playwright's WebKit (F31), before any currency code runs

## 8. Verification

- [x] 8.1 `openspec validate currency-management-fidelity --strict` passes
- [x] 8.2 `npm run test:unit` passes with a higher count than before this change: 433 passed and 1 skipped, against 365 and 1 before
- [x] 8.3 `npm run type-check` passes
- [x] 8.4 `npm run lint:check` passes
- [x] 8.5 `npm run format:check` passes
- [x] 8.6 `npm run build` succeeds
- [x] 8.7 Spec against implementation, recorded 2026-10-02: every MODIFIED requirement and scenario is traced to code and to a passing test, recorded in a Verification Record in this file

## Findings

Recorded 2026-10-02 during implementation.

- **F1 — test strengthened.** The page test "deletes nothing when the confirmation is
  declined" first asserted only that the currency survived, which a stubbed cancel
  handler also satisfies; the mutation check (5.2) exposed it. It now asserts the
  dialog's model closed, and fails under the stub.
- **F2 — not a defect of this change.** The earlier editor could store a `SCALE` that is
  not a power of ten, both symbols at once, and separators outside desktop's sets.
  Such records are shown as desktop shows them and normalized only when the user saves
  (design D3); nothing is rewritten on open.

## Verification Record

**2026-10-02**, over the implementation:

| Gate | Result |
|------|--------|
| `openspec validate currency-management-fidelity --strict` | valid |
| `npm run lint:check` | pass |
| `npm run type-check` | pass |
| `npm run test:unit` | pass, 433 passed and 1 skipped (365 and 1 before) |
| `npm run format:check` | pass |
| `npm run build` | pass |
| `npx playwright test --project=chromium` (currencies, settings, accounts, shell) | pass, 5 of 5 |
| `npx playwright test e2e/currencies.spec.ts --project=webkit` | fail: database never opens (F31, outside this change) |
| Mutation check on the deletion confirmation (5.2) | 3 of 5 fail with the handlers stubbed; all 5 pass restored |

Spec against implementation, requirement by requirement:

| Delta requirement | Code | Test |
|---|---|---|
| Amount Formatting and Precision: sign after prefix, tolerance, truncated precision | `rules/currency.ts` `formatAmount`, `precisionFromScale` | `domain/currency.spec.ts` "signs amounts as desktop does", "vanishing negative", "truncates the precision"; `e2e/currencies.spec.ts` `$-80.00` |
| Currency Management Surface: default scope, `SHOW_HIDDEN_CURRENCIES`, rate column | `currency-store.ts`, `CurrenciesPage.vue`, `repos/metadata.ts` | `currency-store.spec.ts` "list scoping", "the rate column"; `CurrenciesPage.spec.ts` list; `domain/currency-repo.spec.ts` |
| Editing and Adding Currency Definitions: field shape, validity, typed refusals, type labels | `rules/currency.ts` drafts, `CurrencyEditorForm.vue`, `repos/currency.ts`, `currency-labels.ts` | `domain/currency.spec.ts` "definition drafts"; `CurrencyEditorForm.spec.ts` shape, validation; `currency-store.spec.ts` editing; `CurrenciesPage.spec.ts` conflicts |
| Format Preview: follows decimals, separators, placement | `CurrencyEditorForm.vue` | `CurrencyEditorForm.spec.ts` "format preview" |
| Exchange Rate History Management: prefill, hidden panel, refusals, failure shown | `CurrencyEditorForm.vue`, `CurrenciesPage.vue`, `currency-store.ts` | `CurrencyEditorForm.spec.ts` "rate history"; `CurrenciesPage.spec.ts` "failed rate write"; `currency-store.spec.ts` "rate history" |
| Currency Deletion From the Surface: disabled with reason, confirmation, failure shown | `CurrencyEditorForm.vue`, `CurrenciesPage.vue`, `repos/currency.ts` | `CurrencyEditorForm.spec.ts` "deletion control"; `CurrenciesPage.spec.ts` "deletion"; `domain/currency-repo.spec.ts` "deletion refusals"; `e2e/currencies.spec.ts` |

Every requirement and scenario in the delta is traced above. The one open item is 7.3,
WebKit, blocked by the machine, not by this change.

## 9. Review Gate

- [ ] 9.1 Operator review and approval
- [ ] 9.2 Archive: promote the delta, raise `currency-management` to 1.3.0, update its Purpose, confirm every link resolves from the promoted location and rewrite the archived proposal, design and tasks links for the archive depth; only then record the change in the capability map
