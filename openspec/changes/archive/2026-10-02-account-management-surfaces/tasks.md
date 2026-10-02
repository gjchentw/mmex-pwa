# Account Management Surfaces — Tasks

**Change**: `account-management-surfaces`
**Version**: 1.1.0
**Last Updated**: 2026-10-02

Related artifacts: [proposal.md](./proposal.md), [design.md](./design.md), [specs/account-management/spec.md](./specs/account-management/spec.md). Governed by [AGENTS.md](../../../../AGENTS.md). A task marked "reworded 2026-10-02" was restated to match the operator's decisions of that date; the Findings section records why.

## 1. Routing and navigation

- [x] 1.1 `/accounts` declared in [src/router/index.ts](../../../../src/router/index.ts) with `capability: 'account-management'`, guarded by readiness, carrying navigation metadata `nav: { labelKey: 'menu.accounts', icon: 'mdi-bank', order: 20 }`
- [x] 1.2 The entry appears in the drawer through the existing route-derived navigation and shows as active on that route

## 2. Account store

- [x] 2.1 [src/stores/account-store.ts](../../../../src/stores/account-store.ts) provides reactive access to accounts, loading state and errors
- [x] 2.2 `load()` reads accounts, currencies and the base currency through the repositories on entry (design D3; reworded 2026-10-02)
- [x] 2.3 `getBalance(accountId)` caches `accountRepo.balance()`, and every save and removal refreshes the cache (design D6; reworded 2026-10-02, F27)
- [x] 2.4 `save(account)` calls [src/domain/repos/account.ts](../../../../src/domain/repos/account.ts) `add()` for a new account, leaving the key to SQLite, and `save()` for an existing one (F1; reworded 2026-10-02)
- [x] 2.5 `remove(accountId)` uses `accountRepo.remove()`, which implements the full cascade (design D8)
- [x] 2.6 `validateName(name, excludeId?)` uses `accountRepo.findByName()` to enforce case-insensitive uniqueness (risk R1)
- [x] 2.7 `openingDateConflict()` reports the first transaction, stock purchase or scheduled transaction dated before a proposed opening date (design D12)
- [x] 2.8 `groupedAccounts` groups by type with `groupByType()` from [src/domain/rules/account.ts](../../../../src/domain/rules/account.ts), keeping the repository's name order (design D1)

## 3. Accounts page

- [x] 3.1 [src/pages/AccountsPage.vue](../../../../src/pages/AccountsPage.vue) with the account list, add button, and navigation to the detail
- [x] 3.2 The list is grouped by type in desktop's tree order, by name within each group; no user reordering is offered (design D1; reworded 2026-10-02, F13, F28)
- [x] 3.3 Each entry shows the account name, the currency code, a Closed indicator where it applies, and the formatted balance (reworded 2026-10-02, F18)
- [x] 3.4 Favorite accounts carry a star with an accessible name (design D9; F19)
- [x] 3.5 Clicking an account opens its detail
- [x] 3.6 The add button opens the account editor in creation mode
- [x] 3.7 A failed favorite toggle or deletion is shown on the page (F23)
- [x] 3.8 Group headings, types and statuses are named in the user's language (design D14)

## 4. Account detail

- [x] 4.1 [src/components/account/AccountDetailDialog.vue](../../../../src/components/account/AccountDetailDialog.vue) displays every editable field, the planning fields and the six free-text fields included, for every type (reworded 2026-10-02, F28)
- [x] 4.2 The balance is displayed live and read-only from the store's cache, formatted with `formatAmount` from the currency rules
- [x] 4.3 Statement lock state and date are displayed when active, with the read-only hint (design D7)
- [x] 4.4 The edit button opens the account editor in edit mode
- [x] 4.5 The delete button opens the deletion confirmation
- [x] 4.6 The favorite toggle writes `FAVORITEACCT` through `encodeFavorite()`, and the detail shows the new state at once (design D9; F15)
- [x] 4.7 The detail reads its account from the store by ID, so it shows what a save or toggle has just written (F15)

## 5. Account editor

- [x] 5.1 [src/components/account/AccountEditorDialog.vue](../../../../src/components/account/AccountEditorDialog.vue) as a dialog that renders full-page on mobile, consistent with the currency editor
- [x] 5.2 [src/components/account/AccountEditorForm.vue](../../../../src/components/account/AccountEditorForm.vue) holds the fields and validation logic
- [x] 5.3 Name, type, currency, initial balance and initial date are required, checked at save time with a message naming the missing field (design D4; reworded 2026-10-02, F17)
- [x] 5.4 A new account is offered all eight upstream types; an existing account the types `typeChangeOptions()` allows (design D11; reworded 2026-10-02)
- [x] 5.5 The currency selector is populated from `currencyRepo.all()`, and the reference is checked against it at save time with no fallback ID (risk R7; reworded 2026-10-02, F20)
- [x] 5.6 The name is trimmed, then checked for case-insensitive uniqueness at save time as well as on blur (F21)
- [x] 5.7 A new account starts with desktop's defaults (favorite, base currency, `0`, today), and takes the base currency if it arrives after the editor opened (design D4; F20, F30)
- [x] 5.8 An optional number or date cleared from the keyboard is written as NULL (F22)
- [x] 5.9 The six free-text fields `ACCOUNTNUM`, `HELDAT`, `WEBSITE`, `CONTACTINFO`, `ACCESSINFO` and `NOTES` are editable (design D13)

## 6. Planning fields and type change

- [x] 6.1 The planning fields (credit limit, minimum balance, interest rate, payment due date, minimum payment) are shown for every type (design D5; reworded 2026-10-02, F28)
- [x] 6.2 No investment or share record is edited here: the editor writes only `ACCOUNTLIST_V1`, and `investment-tracking` owns its tables (reworded 2026-10-02, F5)
- [x] 6.3 No asset record is edited here: `asset-tracking` owns its table (reworded 2026-10-02, F5)
- [x] 6.4 Every type shows the same field set; no type hides a field (design D5; reworded 2026-10-02, F28)
- [x] 6.5 A type change takes effect without confirmation; a Shares account keeps its type and no account becomes Investment (design D11; reworded 2026-10-02, replacing the F2 warning)

## 7. Statement lock management

- [x] 7.1 The lock is shown in the detail, and set and cleared in the editor reached from it (reworded 2026-10-02)
- [x] 7.2 Setting the lock requires a statement date (F14)
- [x] 7.3 When active, the lock date is displayed with the indication that transactions on or before it are read-only
- [x] 7.4 Clearing the lock stores `STATEMENTLOCKED` as `0` and keeps `STATEMENTDATE` (design D7; reworded 2026-10-02, F28)
- [x] 7.5 The lock conforms to Requirement "Statement Lock Declaration"

## 8. Account creation

- [x] 8.1 The creation form presents every field with an appropriate input type
- [x] 8.2 The planning fields are offered whatever the type chosen (design D5; reworded 2026-10-02)
- [x] 8.3 On save, the required fields, the currency reference, the trimmed name's uniqueness and the opening date are checked (reworded 2026-10-02)
- [x] 8.4 On success, the user is returned to the account list with the new account visible
- [x] 8.5 A refused save shows its message on the field concerned and the form stays open (F17)

## 9. Account editing

- [x] 9.1 The edit form pre-populates with the existing account's data
- [x] 9.2 Every field Requirement "Account Editing" lists is editable (reworded 2026-10-02)
- [x] 9.3 Editing the name enforces case-insensitive uniqueness against all other account names
- [x] 9.4 On success, the user is returned to the account detail with the changes visible (F15)
- [x] 9.5 The initial date respects the opening-date rule against the account's transactions, stock purchases and scheduled transactions (design D12; reworded 2026-10-02, the type-change warning it described being withdrawn by D11)

## 10. Account deletion

- [x] 10.1 The delete action on the detail and in the editor opens the confirmation (reworded 2026-10-02)
- [x] 10.2 The confirmation lists what will be deleted: the account, its transactions, its scheduled transactions, and, for Investment or Shares, its stock positions
- [x] 10.3 Dependent records do not refuse the deletion; once confirmed, they are removed with the account per Requirement "Account Deletion Cascade" (F4)
- [x] 10.4 A confirmed deletion runs as one logical operation through `accountRepo.remove()` (reworded 2026-10-02)
- [x] 10.5 On success, the detail and the editor close and the user is back on the list without the deleted account (F16)
- [x] 10.6 A failed deletion is shown on the page and the account stays listed (F23)

## 11. Localization

- [x] 11.1 Both catalogs carry the page title, type and status names, field labels, hints, action buttons, confirmations and error messages (reworded 2026-10-02, F24)
- [x] 11.2 Stored type strings are the exact upstream strings: Cash, Checking, Credit Card, Loan, Term, Investment, Asset, Shares
- [x] 11.3 Stored status strings are exactly Open and Closed
- [x] 11.4 Catalog parity is maintained, verified by the shell localization test
- [x] 11.5 The zh-TW type and field names are desktop's own, from `mmex/moneymanagerex/po/zh_TW.po` (design D14)

## 12. Tests

Each item names the risk from design.md it covers.

- [x] 12.1 Route: `/accounts` resolves, declares its capability, stays guarded, and appears in navigation entries ([src/__tests__/router.spec.ts](../../../../src/__tests__/router.spec.ts))
- [x] 12.2 Store: load with base currency, balance cache and refresh, add and save delegation, opening-date conflicts ([src/__tests__/account-store.spec.ts](../../../../src/__tests__/account-store.spec.ts))
- [x] 12.3 List: grouping in desktop order, currency code, Closed indicator, labelled favorite star (risks R6, R8) ([src/__tests__/AccountsPage.spec.ts](../../../../src/__tests__/AccountsPage.spec.ts))
- [x] 12.4 Creation: desktop defaults, required-field messages, trimmed and unique name, zero balance (risks R1, R8) ([src/__tests__/AccountEditorForm.spec.ts](../../../../src/__tests__/AccountEditorForm.spec.ts))
- [x] 12.5 Editing: the detail shows saved values, type options, opening-date rule (risks R3, R8)
- [x] 12.6 Planning fields shown for every type (risk R3)
- [x] 12.7 Statement lock through the editor: refused without a date, set with one, cleared to `0` with the date kept (risk R8)
- [x] 12.8 Balance display: formatted in the account's currency; negative balances carry a minus sign
- [x] 12.9 Deletion: one batch removing transactions, scheduled rows and stock rows; the detail and editor close; a failure is shown (risk R4)
- [x] 12.10 Favorite toggle: stored as `TRUE` or `FALSE` and shown at once in the detail (risk R6)
- [x] 12.11 Currency binding: options from the file, the chosen ID stored, an unknown reference refused (risk R7)
- [x] 12.12 The list renders before balances finish computing (risk R2, accepted)
- [x] 12.13 Lock enforcement belongs to `transaction-ledger` and is covered by its test "refuses to edit a row frozen by its account statement" in [src/__tests__/domain/repos.spec.ts](../../../../src/__tests__/domain/repos.spec.ts) (risk R5)

## 13. Verification

- [x] 13.1 `openspec validate account-management-surfaces --strict` passes
- [x] 13.2 `npm run test:unit` passes, with a higher count than before this change
- [x] 13.3 `npm run type-check` passes
- [x] 13.4 `npm run lint:check` passes (reworded 2026-10-02: the script is plain `eslint .`)
- [x] 13.5 `npm run format:check` passes
- [x] 13.6 `npm run build` succeeds
- [x] 13.7 End-to-end smoke test on Chromium, [e2e/accounts.spec.ts](../../../../e2e/accounts.spec.ts): create with desktop defaults, edit and see the change in the open detail, toggle favorite and see it at once, set the statement lock and see it, delete and land on the list; each persisted across a reload. Dependants cannot be created from the surface before Phase 5, so the cascade over them is covered by 12.9 (reworded 2026-10-02, F4, F15, F16)
- [ ] 13.8 The same smoke test on WebKit, the second engine the infrastructure baseline governs. Blocked: Playwright's WebKit 26.0 on the verifying machine has no working OPFS (`navigator.storage.getDirectory()` throws), so every WebKit test fails to open the database, including the two that predate this change (F31)

## 14. Capability map update

- [x] 14.1 At archive, mark `account-management` as Phase 3 delivered in [domain-capability-map.md](../../../designs/domain-capability-map.md), with the archive date (reworded 2026-10-02, F29)
- [x] 14.2 At archive, mark Phase 3 delivered in the phase table, with the same date (reworded 2026-10-02, F29)

## Findings

Recorded 2026-09-15 while writing the section 12 tests, and extended 2026-10-02 by
the verification passes and the five-axis review below. Task numbers are those in force
when each finding was written. F7 was never assigned.

- **F1 — fixed.** The store called the repository's SQL *builders* and discarded the
  result, so creating, editing, favouriting and statement-locking an account never
  reached the database. Only deletion worked. `accountRepo` gained executing `add()`
  and `save()` wrappers mirroring `currencyRepo`; the store now calls them.
- **F9 — fixed.** The currency selector lacked `emit-value` and `map-options`, so
  choosing any currency bound the option object rather than `CURRENCYID`, tripped the
  validity watcher, and blocked the save. Only the default currency could ever be used.
- **F2 — fixed, later withdrawn.** The delta then required a confirmation dialog when the
  account type changes (Requirement "Account Editing"); `onTypeChange()` was an empty stub. The editor now holds the change until
  the user confirms, and restores the previous type when declined. Scoped to accounts that
  already exist: on a new account nothing is being changed away from, so nothing is asked.
  Both normative clauses sat under Requirement "Account Editing", which is that scope.
  Withdrawn on 2026-10-02 by design D11: with the planning fields offered for every type,
  a type change hides no field, and desktop asks no confirmation.
- **F3 — fixed.** Requirement "Account Creation" makes initial balance and initial date
  required; `onSave()`
  validated only name and currency. All four are checked now, testing emptiness rather
  than falsiness so that a zero opening balance is still accepted.
- **F4 — resolved by the operator, 2026-10-02: cascade.** The delta spec contradicted
  itself and the baseline: one clause refused deletion when dependants exist, while the
  clauses around it and the baseline Requirement "Account Deletion Cascade" removed them.
  Desktop `mmGUIFrame::OnDeleteAccount` confirms and then calls `Model_Account::remove`,
  with no refusal path. The refusal clause and its scenario were replaced by a cascade
  scenario; the proposal, design D8, and tasks 10.3, 12.9 and 13.7 were reworded to
  match. No code changed: the implementation already cascaded. The store's cascade test
  now also asserts that the account's transactions are deleted.
- **F5 — resolved by the operator, 2026-10-02: reword the tasks.** Tasks 6.2, 6.3 and
  12.6 promised placeholder UI for investment and asset fields, which the spec does not
  ask for; it requires only that those fields not be editable here. The tasks now say
  what the spec says, and the existing test verifies it. No code changed.
- **F6 — fixed.** Four validation messages in `AccountEditorForm.vue` were hardcoded
  English. They are catalogued as `account.nameRequired`, `account.nameNotUnique`,
  `account.currencyRequired` and `account.currencyInvalid`, in both locales.
- **F8 — fixed.** Four referenced keys were absent from both catalogs, so the UI rendered
  the key path. `account.edit`, `account.cancel` and `account.delete` now resolve to the
  existing `common.edit`, `common.cancel` and `common.delete`; `common.notSet` was added
  and the never-referenced `account.notSet` removed.
- **F10 — resolved, a checkbox defect.** Two boxes were checked for more than was done.
  12.6 promises tests that Investment, Shares and Asset show placeholders; the test
  asserts those types offer no reserved fields, because no placeholder exists (F5).
  13.7 promises a refused deletion of an account with dependants; `e2e/accounts.spec.ts`
  never attempts one, because refusal is not implemented (F4). Both boxes were unchecked
  on 2026-10-02. 12.6 was re-checked once F5 reworded it and its test passed; 13.7,
  reworded by F4, waits on the WebKit run in the Verification Record.
- **F11 — fixed.** The account detail showed an initial balance of zero as "Not set",
  testing falsiness where F3 established emptiness. Zero is a required field's real
  value. `AccountDetailDialog.vue` now tests for absence, and `AccountsPage.spec.ts`
  covers it. Process note: F11 was fixed before it was reported to the operator. Under
  the charter's Verification duty it should have been reported and the fix awaited; it
  is disclosed here instead of being left silent.
- **F12 — fixed, traceability.** The design's "New Files" and "Existing Files Modified"
  tables name `AccountList.vue`, `AccountDetail.vue`, `src/locales/*/account.json` and
  `src/locales/*/menu.json`. None exists. The list lives in `AccountsPage.vue`, the
  detail in `AccountDetailDialog.vue`, the form in `AccountEditorForm.vue`, and every
  string in the single `src/locales/<locale>.json` catalog. With the operator's
  approval the tables were corrected on 2026-10-02.
- **F13 — resolved by the operator, 2026-10-02: drop the clause; a checkbox defect.**
  Requirement "Account List Display" said the list SHALL support user-initiated
  reordering persisted as a preference, and 3.2 was checked. Only the alphabetical
  default existed: the store's `customOrder` and `useCustomOrder` were never set, the
  page offered no reorder control, and nothing persisted an order. Desktop builds its
  account tree with `Model_Account::all(COL_ACCOUNTNAME)` (`mmframe.cpp`) and offers no
  account reordering, so the clause was also an unescalated UX divergence. The clause
  was replaced by alphabetical order, and the dead ordering state was removed from the
  store. The traceability note written then, "as desktop orders its account tree", was
  incomplete: desktop also groups by type (F28).
- **F14 — fixed, 2026-10-02, at the operator's direction; a checkbox defect.**
  Requirement "Statement Lock Management" says setting a lock SHALL require a statement
  date, and 7.2 was checked. The editor saved `STATEMENTLOCKED = 1` with `STATEMENTDATE`
  empty. It now refuses that save and shows `account.statementDateRequired` on the date
  field as soon as the lock is set. `AccountEditorForm.spec.ts` covers the refusal, the
  set, and the clear.

- **F15 — fixed.** The detail held the account object it was opened with, so after an
  edit, a favorite toggle or a lock change it went on showing the old values. A user who
  saw the star unchanged clicked again and reverted the toggle. The page now keeps the
  account's ID and reads the record from the store. 9.4 had been checked.
- **F16 — fixed.** A confirmed deletion left the persistent detail open as an empty card,
  and a deletion started from the editor left the editor open on the deleted account,
  where Save then "succeeded" with an UPDATE matching no row. Both now close. 10.5 had
  been checked.
- **F17 — fixed.** Save was disabled until the required fields were filled, and the
  required-field messages were set only inside the save handler, so they could never
  show; the scenario requires a message naming the missing field. Save is now always
  enabled and every check reports on its field. The earlier "refuses" tests had clicked
  a disabled button and passed vacuously. 8.5 had been checked.
- **F18 — fixed.** The list showed the currency name ("US dollar") where the requirement
  asks for the code, which `CURRENCYFORMATS_V1` holds in `CURRENCY_SYMBOL`. Two tests had
  asserted the name. 3.3 had been checked.
- **F19 — fixed.** The favorite badge passed `icon` to `QBadge`, which has no such prop,
  with a colour Quasar does not define, so it rendered as an empty pill with no
  accessible name. It is now a labelled amber star icon.
- **F20 — resolved by the operator, 2026-10-02.** A new account defaulted to the
  alphabetically first currency (Afghan afghani in a fresh file), or to ID 1 when none
  was loaded. It now starts with desktop's defaults (design D4).
- **F21 — fixed.** Names were saved untrimmed, so "Foo" and "Foo " could both exist and
  a later desktop edit, which trims, would collide. The name is trimmed before it is
  checked and stored.
- **F22 — fixed.** A number cleared from the keyboard wrote `''` into a NUMERIC column,
  which desktop never stores. Optional numbers and dates are written as NULL when empty.
- **F23 — fixed.** A failed deletion or favorite toggle started from the detail was
  invisible: the message went to the closed editor, or nowhere. The page now shows it.
- **F24 — a checkbox defect, fixed.** Besides F15 to F18, boxes 6.4, 11.1, 12.3, 12.4,
  12.6, 12.7 and 12.11 were checked for work not done or not verified: no type or status
  names were translated, 12.7's tests drove a store method no screen used, and 12.11 had
  no test of an invalid reference. Each was reworded where needed, implemented, and
  re-checked only once a test verified it. 2.4 and 10.4 carried leftover wording.
- **F25 — fixed.** The delta contradicted itself and was not testable in places: the
  Cash scenario said "only" the core fields show while other requirements made status
  and the lock editable; it used "may", "e.g.", "typically" and "per currency
  convention"; it named an authentication guard that does not exist; "different ordering"
  survived F13. The delta was rewritten on 2026-10-02.
- **F26 — fixed.** Links in design.md and tasks.md used `../../src/...`, which resolves
  to `openspec/src`. They now use `../../../`. The delta now follows the earlier surface
  deltas: links written relative to its promoted location, and a Traceability line on
  every requirement.
- **F27 — fixed.** The Verification Record was stale and contradicted the Findings, and
  design.md no longer matched the code: D6 said balances were not cached, D9 offered a
  list toggle that does not exist, and the diagrams carried a reordering leftover and
  edges that bypassed the store. design.md was rewritten on 2026-10-02.
- **F28 — resolved by the operator, 2026-10-02.** The surface diverged from desktop in
  ways never put to the operator. Eight were decided: the type change keeps desktop's
  restrictions with no warning (D11); the planning fields show for every type (D5); the
  list groups by type in desktop's tree order (D1); clearing the lock writes `0` and keeps
  the date (D7); a new account takes desktop's defaults (D4); desktop's opening-date rule
  applies (D12); all six free-text fields are editable (D13); the detail stays a dialog
  without a route (D2).
- **F29 — fixed.** The capability map declared Phase 3 delivered on 2026-08-09, before the
  operator accepted the work and while no account write reached the database (F1). Both
  rows were restored; 14.1 and 14.2 now happen at archive.
- **F30 — fixed.** Found by the strengthened end-to-end test. A file opened without the
  wizard has no base currency, so nothing is preselected and the user must choose one,
  as on desktop. Separately, the editor could open before the page had read the
  currencies, and the default was then lost. It is now applied when the currencies
  arrive. The end-to-end test sets a base currency in Settings first, as a user would.
- **F31 — deferred by the operator, 2026-10-02.** WebKit end-to-end cannot run on the
  verifying machine.
  - Node 26 hangs extracting Playwright's WebKit archive, so the browser was unpacked
    with `ditto`. That is a non-standard install and may be a factor.
  - The browser itself has no working OPFS: `navigator.storage.getDirectory()` throws
    `UnknownError` before any application code runs.
  - All three WebKit tests fail with `SQLITE_CANTOPEN`, including two that predate this
    change. This change touches no database-opening code.
  - Real Safari is the signal that matters for iOS, and a manual check there is pending.
  - The operator approved archiving with Chromium end-to-end only ("ok, commit and
    /opsx:archive", in answer to this finding). 13.8 stays unchecked because the run was
    not done; the WebKit environment is to be resolved outside this change.

## Verification Record

**2026-10-02, first pass**, over the working tree carrying the F2, F3, F6, F8 and F11
fixes: every gate passed (289 unit tests, then 290 with F11's) and Chromium end-to-end
passed. Spec against implementation: no perfect match; F4, F5, F10 and F12 were put to
the operator.

**2026-10-02, second pass**, after the decisions on F4, F5 and F12 and the F13 and F14
fixes: every gate passed with 293 unit tests. A five-axis review that followed, by two
independent reviewers with each finding re-checked against the code, found F15 to F29.
This pass's claim of readiness was premature.

**2026-10-02, final pass**, after the review findings were fixed and the operator's eight
decisions (F28) were implemented:

| Gate | Result |
|------|--------|
| `openspec validate account-management-surfaces --strict` | valid |
| `npm run lint:check` | pass |
| `npm run type-check` | pass |
| `npm run test:unit` | pass, 320 passed and 1 skipped |
| `npm run format:check` | pass |
| `npm run build` | pass |
| `npx playwright test --project=chromium` | pass, 3 of 3 |
| `npx playwright test --project=webkit` | fail, 3 of 3, `SQLITE_CANTOPEN` (F31) |

Mutation check: reintroducing the detail snapshot (F15) and the open dialogs after
deletion (F16) makes four page tests fail; with the fixes restored all pass.

Spec against implementation: each requirement and scenario in the delta was traced to the
code and to a passing test. The one gap is WebKit (F31). Remaining before archive: F31,
operator review (15.1), then 14.1, 14.2 and 15.2 at archive.

**2026-10-02, operator review**: approved, with F31 deferred as recorded in Findings.

## 15. Review Gate

- [x] 15.1 Operator review and approval (2026-10-02)
- [x] 15.2 Archive the change: promote `account-management` with the delta requirements, raise the main spec to 1.1.0, and confirm the delta's links resolve from `openspec/specs/account-management/spec.md`
