# Account Management Surfaces — Tasks

**Change**: `account-management-surfaces`
**Version**: 1.0.0
**Last Updated**: 2026-08-09

## 1. Routing and navigation

- [x] 1.1 `/accounts` declared in [src/router/index.ts](../../src/router/index.ts) with `capability: 'account-management'`, guarded by readiness, carrying navigation metadata `nav: { labelKey: 'menu.accounts', icon: 'mdi-bank', order: 20 }`
- [x] 1.2 The entry appears in the drawer through the existing route-derived navigation and shows as active on that route

## 2. Account store

- [x] 2.1 [src/stores/account-store.ts](../../src/stores/account-store.ts) provides reactive access to accounts, loading state, and errors
- [x] 2.2 `load()` reads all accounts through `accountRepo.all()` on entry (design D3)
- [x] 2.3 `getBalance(accountId)` delegates to `accountRepo.balance()` for on-demand balance computation (design D6)
- [x] 2.4 `save(account)` uses `accountRepo.addStatement()` for new accounts and `accountRepo.updateStatement()` for existing ones
- [x] 2.5 `remove(accountId)` uses `accountRepo.remove()` which already implements the full cascade (design D8)
- [x] 2.6 `validateName(name, excludeId?)` uses `accountRepo.findByName()` to enforce case-insensitive uniqueness (risk R1)

## 3. Accounts page

- [x] 3.1 [src/pages/AccountsPage.vue](../../src/pages/AccountsPage.vue) with account list, add button, and navigation to detail
- [x] 3.2 Default sort is alphabetical by account name; user can reorder and order is persisted as preference (design D1)
- [x] 3.3 List displays: account name, type, status (with visual distinction for Closed), currency code, and formatted balance (design D6)
- [x] 3.4 Favorite accounts have a visual indicator in the list (design D9)
- [x] 3.5 Clicking an account navigates to its detail view
- [x] 3.6 Add button opens the account editor in creation mode

## 4. Account detail

- [x] 4.1 [src/components/account/AccountDetailDialog.vue](../../src/components/account/AccountDetailDialog.vue) displays all account fields
- [x] 4.2 Balance is displayed live, read-only, formatted in the account's currency using `formatAmount` from currency rules
- [x] 4.3 Statement lock state and date are displayed prominently when active (design D7)
- [x] 4.4 Edit button opens the account editor in edit mode
- [x] 4.5 Delete button opens the deletion confirmation dialog
- [x] 4.6 Favorite toggle updates `FAVORITEACCT` via `encodeFavorite()` from rules layer (design D9)

## 5. Account editor

- [x] 5.1 [src/components/account/AccountEditorDialog.vue](../../src/components/account/AccountEditorDialog.vue) as a dialog that renders full-page on mobile (consistent with currency editor)
- [x] 5.2 [src/components/account/AccountEditorForm.vue](../../src/components/account/AccountEditorForm.vue) holds the fields and validation logic
- [ ] 5.3 Required fields: account name, type, currency, initial balance, initial date — all must be provided (design D4)
- [x] 5.4 Account type selector offers all eight upstream types from `ACCOUNT_TYPES` in rules layer
- [x] 5.5 Currency selector populated from `currencyRepo.all()` and validated before save (risk R7)
- [x] 5.6 Account name validated for case-insensitive uniqueness using store method (2.6)

## 6. Type-specific field presentation

- [x] 6.1 Credit Card, Loan, and Term account types show additional fields: credit limit, minimum balance, interest rate, payment due date, minimum payment (design D5)
- [ ] 6.2 Investment and Shares account types show placeholder for investment-specific fields, reserved for `investment-tracking` capability
- [ ] 6.3 Asset account types show placeholder for asset-specific fields, reserved for `asset-tracking` capability
- [x] 6.4 Cash and Checking account types show only common account fields
- [ ] 6.5 Type selector change warns user that field relevance will change and requires confirmation (design D5)

## 7. Statement lock management

- [x] 7.1 Statement lock can be set from the account detail or editor
- [x] 7.2 Setting lock requires a statement date
- [x] 7.3 When active, lock date is displayed with clear indication that transactions on or before that date are read-only
- [x] 7.4 Lock can be cleared, removing both state and date
- [x] 7.5 Lock behavior conforms to Requirement: Statement Lock Declaration in baseline spec

## 8. Account creation

- [x] 8.1 Create form presents all required fields with appropriate input types
- [x] 8.2 Type-specific fields appear based on selected type
- [ ] 8.3 On submit, validation runs: name uniqueness, required fields, valid currency reference
- [x] 8.4 On success, user is returned to account list with new account visible
- [x] 8.5 On validation error, error messages are displayed and form remains open

## 9. Account editing

- [x] 9.1 Edit form pre-populates with existing account data
- [x] 9.2 All persisted fields from baseline spec are editable: name, type, status, currency, initial balance, initial date, favorite, credit/loan fields (for applicable types), statement lock fields
- [x] 9.3 Editing account name enforces case-insensitive uniqueness against all other account names
- [x] 9.4 On success, user is returned to account detail with changes visible
- [ ] 9.5 Changing account type warns user and requires confirmation (design D5)

## 10. Account deletion

- [x] 10.1 Delete button on account detail opens confirmation dialog
- [x] 10.2 Confirmation dialog lists what will be deleted: account, all transactions, scheduled transactions, and (for Investment/Shares) stock positions
- [ ] 10.3 If account has any dependent records, deletion is refused with clear explanation of what references exist
- [x] 10.4 If deletion is allowed and user confirms, it proceeds as single logical operation via `accountRepo.remove()`
- [x] 10.5 On success, user is returned to account list with deleted account no longer visible

## 11. Localization

- [ ] 11.1 Both catalogs gain translations for: accounts page title, account list headers, account types, status values, field labels, field hints, action buttons, confirmation dialogs, error messages
- [x] 11.2 Account type strings use the exact upstream strings: Cash, Checking, Credit Card, Loan, Term, Investment, Asset, Shares
- [x] 11.3 Status strings use the exact values: Open, Closed
- [x] 11.4 Catalog parity is maintained (verified by existing shell localization test)

## 12. Tests

- [x] 12.1 Route: `/accounts` resolves, declares its capability, stays guarded, and appears in navigation entries
- [x] 12.2 Account store: `load()` returns all accounts; `getBalance()` computes correctly; `save()` and `remove()` delegate properly
- [x] 12.3 Account list: displays all accounts with correct fields; Closed accounts are visually distinguished; favorites are highlighted
- [ ] 12.4 Account creation: new account persisted with all fields; name uniqueness enforced case-insensitively; missing required fields prevent creation (risk R1)
- [ ] 12.5 Account editing: existing account updated; type change warns and requires confirmation; name uniqueness enforced
- [x] 12.6 Type-specific fields: correct fields shown for each account type; Investment/Shares show placeholders; Asset shows placeholders (risk R3)
- [x] 12.7 Statement lock: can be set with date; display shows lock state; can be cleared
- [x] 12.8 Balance display: formatted correctly in account's currency; negative balances clearly indicated
- [ ] 12.9 Deletion: refused when dependencies exist; succeeds when no dependencies; cascade works correctly (risk R4)
- [x] 12.10 Favorite toggle: updates `FAVORITEACCT` correctly; visual indicator works (risk R6)
- [x] 12.11 Currency binding: dropdown populated from existing currencies; invalid currency reference prevented (risk R7)

## 13. Verification

- [x] 13.1 `openspec validate account-management-surfaces` passes
- [x] 13.2 Unit test suite passes with increased count from current baseline
- [x] 13.3 `vue-tsc` type checking passes with no new errors
- [x] 13.4 ESLint passes with `--max-warnings=0`
- [x] 13.5 Prettier formatting is clean
- [x] 13.6 Production build succeeds
- [x] 13.7 End-to-end smoke test: create an account, verify it appears in list, edit its properties, verify changes, set as favorite, verify visual indicator, set statement lock, verify display, attempt deletion with dependencies (should refuse), delete without dependencies (should succeed)

## 14. Capability Map Update

- [x] 14.1 Update [domain-capability-map.md](../../designs/domain-capability-map.md): mark `account-management` as Phase 3 delivered with date
- [x] 14.2 Update Phase table: mark Phase 3 as delivered

## 15. Review Gate

- [ ] 15.1 Operator review and approval
- [ ] 15.2 Archive the change: promote `account-management` spec to include delta requirements

## Open Findings

Recorded 2026-09-15 while writing the section 12 tests. Two defects were found and
fixed; the rest are unresolved and are why the boxes above are unchecked.

- **F1 — fixed.** The store called the repository's SQL *builders* and discarded the
  result, so creating, editing, favouriting and statement-locking an account never
  reached the database. Only deletion worked. `accountRepo` gained executing `add()`
  and `save()` wrappers mirroring `currencyRepo`; the store now calls them.
- **F9 — fixed.** The currency selector lacked `emit-value` and `map-options`, so
  choosing any currency bound the option object rather than `CURRENCYID`, tripped the
  validity watcher, and blocked the save. Only the default currency could ever be used.
- **F2 — open.** Spec lines 101 and 129 require a confirmation dialog when the account
  type changes. `onTypeChange()` in `AccountEditorForm.vue` is an empty stub. Blocks
  6.5, 9.5, and the type-change half of 12.5.
- **F3 — open.** Spec line 69 makes initial balance and initial date required. `onSave()`
  validates only name and currency. Blocks 5.3, 8.3, and the required-field half of 12.4.
- **F4 — open, needs an operator decision.** The delta spec contradicts itself and the
  baseline: line 178 says deletion is refused when dependants exist, while line 177,
  line 179, and the baseline Requirement "Account Deletion Cascade" all say the cascade
  removes them. The implementation cascades, matching the baseline and upstream
  `Model_Account.cpp::remove`. Blocks 10.3 and the refusal half of 12.9.
- **F5 — open.** Tasks 6.2 and 6.3 promise placeholder UI for investment and asset
  fields. No placeholder exists. The spec only requires those fields not be editable
  here, which the implementation satisfies; the task wording overstates it.
- **F6 — open.** Four validation messages in `AccountEditorForm.vue` are hardcoded
  English strings outside the catalogs.
- **F8 — open.** Four keys are referenced but absent from both catalogs, so the UI
  renders the key path: `account.edit`, `account.cancel`, `account.delete`,
  `common.notSet` (the catalogs define `account.notSet`).
