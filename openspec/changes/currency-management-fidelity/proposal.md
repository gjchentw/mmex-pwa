# Currency Management Fidelity — Proposal

**Change**: `currency-management-fidelity`
**Version**: 1.0.0
**Last Updated**: 2026-10-02

Related artifacts: [design.md](./design.md) (how), [specs/currency-management/spec.md](./specs/currency-management/spec.md) (capability delta), [tasks.md](./tasks.md) (implementation steps). Governed by [AGENTS.md](../../../AGENTS.md).

## Why

The currency surface delivered by `currency-management-surfaces` on 2026-08-09 lets the user store definitions desktop MoneyManagerEx cannot use, and diverges from desktop in ways that were never put to the operator. A five-axis review on 2026-10-02 found, each verified against the desktop source:

- The definition editor validates nothing. An empty name or code, a `SCALE` of `0`, `5`, `-100`, `2.5` or the empty string, a grouping separator equal to the decimal point, and a negative conversion rate are all stored. Desktop refuses every one of them; on `SCALE` it computes `log10`, so `0` or `''` is undefined behavior for every amount in that currency.
- A rate cleared from the keyboard is stored as the empty string, which desktop reads as `0`, collapsing every conversion near that date; negative rates are accepted where desktop rejects them.
- Deletion is offered for every currency, including the base and ones in use, with no confirmation; the refusal names no reason and is hardcoded English. The design claimed a confirmation that does not exist.
- A symbol conflict is reported as a name conflict, and a test locks the wrong message in.
- Negative amounts render as `-$80.00`; desktop renders `$-80.00`, and a test locks the divergence in. This affects the account surface's balances too.
- The list defaults to the currencies in use and forgets the toggle; desktop defaults to all and persists the choice in the file under `SHOW_HIDDEN_CURRENCIES`. The archived design said the default matched upstream; it did not.
- The rate column always shows the fixed rate; desktop shows the latest historical rate when history is on, and prefills the editor with it.

The operator decided on 2026-10-02 to match desktop on each point, with one deliberate exception: a currency counts as in use when any account references it, closed accounts included, because desktop's rule (open accounts only) lets a currency be deleted while a closed account still points at it.

## What Changes

- **The definition editor takes desktop's shape**: a decimal-places field (0 through 9, stored as `10^n`) in place of the raw scale; one symbol field with a prefix-or-suffix choice; decimal and grouping separators chosen from desktop's fixed sets; a code of at most 12 characters.
- **The editor validates as desktop does**: name and code required and trimmed; the code unique; grouping separator not equal to the decimal point when there are decimals; rate positive; a cleared optional number stored as nothing, never as text. Every refusal names its field, and a conflict names whether the name or the code collides.
- **Deletion follows desktop**: the control is disabled with the reason when the currency is the base or is referenced by an account or an asset; otherwise a confirmation states that the rate history goes with it. A failed deletion is shown on the surface.
- **The list follows desktop**: all currencies by default, with the show-all choice read from and written to `SHOW_HIDDEN_CURRENCIES`; the rate column shows the latest historical rate when history is on, the fixed rate when off, and is titled accordingly.
- **Rate history follows desktop**: the editor prefills the rate from the latest history point when history is on; the history panel is hidden when history is off; a negative or empty rate is refused; a failed history write is shown.
- **Negative amounts render as desktop renders them**, sign after the prefix symbol (`$-80.00`), and a negative value smaller than desktop's tolerance renders as zero. **BREAKING** for anything that compared the old form: the account surface's balances change appearance; no stored value changes.
- **Currency types are translated for display**; the stored values stay `Fiat` and `Crypto`.
- **Error messages come from the catalogs**: the repository reports typed refusals that the surface translates.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `currency-management`: MODIFIES Amount Formatting and Precision (sign placement, tolerance, truncated precision), Currency Management Surface (default scope and its persistence, the rate column), Editing and Adding Currency Definitions (field shape, validity rules, typed refusals, type labels), Format Preview (follows the decimal-places field), Exchange Rate History Management (prefill, hidden panel, refusals, failure shown), and Currency Deletion From the Surface (disabled control with reason, confirmation, failure shown). Currency Definition, Base Currency, Day-Rate Resolution, Rate History Toggle Retroactivity, Currency Deletion Constraints and Base Currency Indication are unchanged; the deletion constraint's "in use" set is kept deliberately stricter than desktop's.

## Impact

- **Code**: [src/components/currency/CurrencyEditorForm.vue](../../../src/components/currency/CurrencyEditorForm.vue) (largely rewritten), [src/pages/CurrenciesPage.vue](../../../src/pages/CurrenciesPage.vue), [src/stores/currency-store.ts](../../../src/stores/currency-store.ts), [src/domain/repos/currency.ts](../../../src/domain/repos/currency.ts), [src/domain/rules/currency.ts](../../../src/domain/rules/currency.ts), [src/domain/rules/metadata.ts](../../../src/domain/rules/metadata.ts) (the `SHOW_HIDDEN_CURRENCIES` key), both catalogs, the currency tests, and a new end-to-end test for the surface.
- **Configuration**: none. **Dependencies**: `file-metadata-and-settings` owns `INFOTABLE_V1`, where `SHOW_HIDDEN_CURRENCIES` lives; it is a file fact desktop already writes, so no spec change is needed there. `account-management` displays balances through `formatAmount` and inherits the sign placement; its tests assert only that a minus sign is present and need no change.
- **Verification**: unit tests that drive the real inputs and assert what each write contains; a mutation check on the deletion confirmation; an end-to-end run on Chromium that edits a definition, records and removes a rate, and deletes a currency.
- **Out of scope**: desktop's offer to purge orphaned history rows when history is turned off; the history grid's source column (`*`/`M`) and six-decimal display; fetching rates online, which the capability map holds as long-lived non-scope; changing the base currency, which `file-metadata-and-settings` owns.
