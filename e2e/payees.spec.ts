import { test, expect, type Page } from '@playwright/test'
import { chooseOption, lastByTestId, openDatabase, query, seed } from './taxonomy-helpers'

// openspec: transaction-taxonomy-surfaces task 7.3 -- the payee manager against real
// SQLite in OPFS: the Used column, the mode-dependent column title, the editor's
// refusals and pattern lines, Define Category and Hide over a selection, a mixed
// deletion, and a merge that stamps the live transaction and leaves attachments.

const SEED = `
INSERT INTO CATEGORY_V1 (CATEGNAME, ACTIVE, PARENTID) VALUES ('E2E Food', 1, -1);
INSERT INTO PAYEE_V1 (PAYEENAME, CATEGID, ACTIVE, PATTERN) VALUES ('E2E Shop', -1, 1, '{}');
INSERT INTO PAYEE_V1 (PAYEENAME, CATEGID, ACTIVE, PATTERN) VALUES ('E2E Old', -1, 0, '{}');
INSERT INTO PAYEE_V1 (PAYEENAME, CATEGID, ACTIVE, PATTERN) VALUES ('E2E New', -1, 1, '{}');
INSERT INTO CHECKINGACCOUNT_V1 (ACCOUNTID, PAYEEID, TRANSCODE, TRANSAMOUNT, STATUS, NOTES, CATEGID, TRANSDATE) VALUES (1, (SELECT PAYEEID FROM PAYEE_V1 WHERE PAYEENAME = 'E2E Shop'), 'Withdrawal', 10, '', 'e2e-live', -1, '2026-08-09');
INSERT INTO CHECKINGACCOUNT_V1 (ACCOUNTID, PAYEEID, TRANSCODE, TRANSAMOUNT, STATUS, NOTES, CATEGID, TRANSDATE, DELETEDTIME) VALUES (1, (SELECT PAYEEID FROM PAYEE_V1 WHERE PAYEENAME = 'E2E Shop'), 'Withdrawal', 5, '', 'e2e-trashed', -1, '2026-08-09', '2026-09-01T00:00:00');
INSERT INTO BILLSDEPOSITS_V1 (ACCOUNTID, PAYEEID, TRANSCODE, TRANSAMOUNT, STATUS, CATEGID, TRANSDATE, REPEATS, NEXTOCCURRENCEDATE, NUMOCCURRENCES) VALUES (1, (SELECT PAYEEID FROM PAYEE_V1 WHERE PAYEENAME = 'E2E Shop'), 'Withdrawal', 20, '', -1, '2026-08-09', 1, '2026-09-09', -1);
INSERT INTO ATTACHMENT_V1 (REFTYPE, REFID, DESCRIPTION, FILENAME) VALUES ('Payee', (SELECT PAYEEID FROM PAYEE_V1 WHERE PAYEENAME = 'E2E Shop'), 'e2e', 'e2e.pdf');
`

const row = (page: Page, name: string) => page.locator('[data-payee-id]', { hasText: name })
const select = (page: Page, name: string) => row(page, name).locator('.q-checkbox').click()

const openPayees = async (page: Page) => {
  await page.goto('/payees')
  await expect(page.getByTestId('payee-table')).toBeVisible({ timeout: 30_000 })
}

test('the payee manager lists, edits, acts on a selection, deletes, and merges as desktop does', async ({
  page,
}) => {
  test.setTimeout(180_000)

  await openDatabase(page)
  await seed(page, SEED)
  await openPayees(page)

  // --- Used = live transactions + series; the column title follows the mode.
  await expect(row(page, 'E2E Shop').getByTestId('payee-used')).toHaveText('2')
  await expect(page.getByTestId('payee-table')).toContainText('Last Used Category')
  await seed(
    page,
    "INSERT INTO SETTING_V1 (SETTINGNAME, SETTINGVALUE) VALUES ('TRANSACTION_CATEGORY_NONE', '3');",
  )
  await openPayees(page)
  await expect(page.getByTestId('payee-table')).toContainText('Default Category')

  // --- The editor refuses an invalid website at its field, then stores pattern lines
  // as desktop's object.
  await row(page, 'E2E New').getByText('E2E New').click()
  await expect(lastByTestId(page, 'payee-editor')).toBeVisible()
  await lastByTestId(page, 'payee-website').fill('not a url')
  await lastByTestId(page, 'payee-save').click()
  await expect(lastByTestId(page, 'payee-editor')).toContainText('Please enter a valid URL')
  await lastByTestId(page, 'payee-website').fill('')
  await lastByTestId(page, 'payee-patterns').fill('AMAZON*\nregex:^AMZN')
  await lastByTestId(page, 'payee-save').click()
  await expect(lastByTestId(page, 'payee-editor')).toBeHidden()
  expect(await query(page, "SELECT PATTERN FROM PAYEE_V1 WHERE PAYEENAME = 'E2E New'")).toEqual([
    { PATTERN: '{\n    "0": "AMAZON*",\n    "1": "regex:^AMZN"\n}' },
  ])

  // --- Define Category over two selected payees.
  await openPayees(page)
  await select(page, 'E2E New')
  await select(page, 'E2E Shop')
  await page.getByTestId('payee-define-category').click()
  await chooseOption(page, 'category-picker', 'E2E Food')
  await lastByTestId(page, 'payee-define-category-confirm').click()
  await expect(page.getByTestId('payee-define-category-dialog')).toBeHidden()
  expect(
    await query(
      page,
      "SELECT COUNT(*) AS n FROM PAYEE_V1 WHERE CATEGID = (SELECT CATEGID FROM CATEGORY_V1 WHERE CATEGNAME = 'E2E Food') AND PAYEENAME IN ('E2E New', 'E2E Shop')",
    ),
  ).toEqual([{ n: 2 }])

  // --- Hide Selected, then the toggle off hides the row and stores desktop's FALSE.
  await openPayees(page)
  await select(page, 'E2E New')
  await page.getByTestId('payee-hide').click()
  await expect(row(page, 'E2E New').getByTestId('payee-hidden-mark')).toBeVisible()
  await page.getByTestId('payee-show-hidden').click()
  await expect(row(page, 'E2E New')).toBeHidden()
  await expect(row(page, 'E2E Old')).toBeHidden()
  expect(
    await query(
      page,
      "SELECT SETTINGVALUE FROM SETTING_V1 WHERE SETTINGNAME = 'SHOW_HIDDEN_PAYEES'",
    ),
  ).toEqual([{ SETTINGVALUE: 'FALSE' }])
  await openPayees(page)
  await page.getByTestId('payee-show-hidden').click()
  await expect(row(page, 'E2E Old')).toBeVisible()

  // --- Show Selected makes New visible again; a hidden payee is never a merge target.
  await select(page, 'E2E New')
  await page.getByTestId('payee-show').click()
  await expect(row(page, 'E2E New').getByTestId('payee-hidden-mark')).toBeHidden()

  // --- A mixed selection: the used payee is kept and named, the unused one deleted.
  await select(page, 'E2E Shop')
  await select(page, 'E2E Old')
  await page.getByTestId('payee-remove').click()
  await expect(lastByTestId(page, 'taxonomy-delete-names')).toContainText('E2E Old')
  await lastByTestId(page, 'taxonomy-delete-confirm').click()
  await expect(page.getByTestId('payee-kept')).toContainText('E2E Shop')
  await expect(row(page, 'E2E Old')).toBeHidden()
  await expect(row(page, 'E2E Shop')).toBeVisible()

  // --- Merge Shop into New: counts before, the live transaction stamped, the
  // attachment row left on the source (record-extensions).
  await select(page, 'E2E Shop')
  await page.getByTestId('payee-merge').click()
  await expect(page.getByTestId('merge-counts')).toContainText('Records found in transactions: 1')
  await expect(page.getByTestId('merge-counts')).toContainText(
    'Records found in scheduled transactions: 1',
  )
  await chooseOption(page, 'merge-target', 'E2E New')
  await page.getByTestId('merge-confirm').click()
  await page.getByTestId('merge-confirm-accept').click()
  await expect(page.getByTestId('merge-result')).toContainText('records changed')
  const [live] = await query<{ PAYEENAME: string; LASTUPDATEDTIME: string | null }>(
    page,
    "SELECT p.PAYEENAME, t.LASTUPDATEDTIME FROM CHECKINGACCOUNT_V1 t JOIN PAYEE_V1 p ON p.PAYEEID = t.PAYEEID WHERE t.NOTES = 'e2e-live'",
  )
  expect(live?.PAYEENAME).toBe('E2E New')
  expect(live?.LASTUPDATEDTIME).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  expect(
    await query(
      page,
      "SELECT COUNT(*) AS n FROM ATTACHMENT_V1 WHERE REFTYPE = 'Payee' AND REFID = (SELECT PAYEEID FROM PAYEE_V1 WHERE PAYEENAME = 'E2E Shop')",
    ),
  ).toEqual([{ n: 1 }])
})
