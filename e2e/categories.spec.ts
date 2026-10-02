import { test, expect, type Page } from '@playwright/test'
import { chooseOption, lastByTestId, openDatabase, query, seed } from './taxonomy-helpers'

// openspec: transaction-taxonomy-surfaces task 7.2 -- the category manager against
// real SQLite in OPFS: search over full paths, the persisted show-hidden choice,
// desktop's name rules, Move to…, deletion refused for live use and purging the
// trash on confirmation, and a merge that stamps and deletes budget rows.

const SEED = `
INSERT INTO CATEGORY_V1 (CATEGNAME, ACTIVE, PARENTID) VALUES ('E2E Food', 1, -1);
INSERT INTO CATEGORY_V1 (CATEGNAME, ACTIVE, PARENTID) VALUES ('E2E Snacks', 1, (SELECT CATEGID FROM CATEGORY_V1 WHERE CATEGNAME = 'E2E Food'));
INSERT INTO CATEGORY_V1 (CATEGNAME, ACTIVE, PARENTID) VALUES ('E2E Drinks', 0, (SELECT CATEGID FROM CATEGORY_V1 WHERE CATEGNAME = 'E2E Food'));
INSERT INTO CATEGORY_V1 (CATEGNAME, ACTIVE, PARENTID) VALUES ('E2E Bills', 1, -1);
INSERT INTO CATEGORY_V1 (CATEGNAME, ACTIVE, PARENTID) VALUES ('E2E Target', 1, -1);
INSERT INTO PAYEE_V1 (PAYEENAME, CATEGID, ACTIVE, PATTERN) VALUES ('E2E Kiosk', (SELECT CATEGID FROM CATEGORY_V1 WHERE CATEGNAME = 'E2E Snacks'), 1, '{}');
INSERT INTO CHECKINGACCOUNT_V1 (ACCOUNTID, PAYEEID, TRANSCODE, TRANSAMOUNT, STATUS, NOTES, CATEGID, TRANSDATE) VALUES (1, (SELECT PAYEEID FROM PAYEE_V1 WHERE PAYEENAME = 'E2E Kiosk'), 'Withdrawal', 10, '', 'e2e-live', (SELECT CATEGID FROM CATEGORY_V1 WHERE CATEGNAME = 'E2E Snacks'), '2026-08-09');
INSERT INTO CHECKINGACCOUNT_V1 (ACCOUNTID, PAYEEID, TRANSCODE, TRANSAMOUNT, STATUS, NOTES, CATEGID, TRANSDATE, DELETEDTIME) VALUES (1, (SELECT PAYEEID FROM PAYEE_V1 WHERE PAYEENAME = 'E2E Kiosk'), 'Withdrawal', 5, '', 'e2e-trashed', (SELECT CATEGID FROM CATEGORY_V1 WHERE CATEGNAME = 'E2E Bills'), '2026-08-09', '2026-09-01T00:00:00');
INSERT INTO BUDGETYEAR_V1 (BUDGETYEARNAME) VALUES ('E2E 2026');
INSERT INTO BUDGETTABLE_V1 (BUDGETYEARID, CATEGID, PERIOD, AMOUNT, ACTIVE) VALUES ((SELECT BUDGETYEARID FROM BUDGETYEAR_V1 WHERE BUDGETYEARNAME = 'E2E 2026'), (SELECT CATEGID FROM CATEGORY_V1 WHERE CATEGNAME = 'E2E Bills'), 'Monthly', 100, 1);
INSERT INTO BUDGETTABLE_V1 (BUDGETYEARID, CATEGID, PERIOD, AMOUNT, ACTIVE) VALUES ((SELECT BUDGETYEARID FROM BUDGETYEAR_V1 WHERE BUDGETYEARNAME = 'E2E 2026'), (SELECT CATEGID FROM CATEGORY_V1 WHERE CATEGNAME = 'E2E Snacks'), 'Monthly', 50, 1);
`

const node = (page: Page, name: string) =>
  page.locator('[data-testid^="category-node-"]', { hasText: name })

const openCategories = async (page: Page) => {
  await page.goto('/categories')
  await expect(page.getByTestId('category-tree')).toBeVisible({ timeout: 30_000 })
}

test('the category manager searches, hides, names, moves, deletes with purge, and merges', async ({
  page,
}) => {
  test.setTimeout(180_000)

  await openDatabase(page)
  await seed(page, SEED)
  await openCategories(page)

  // --- Search matches the full path, keeping the ancestor (Category Manager Display).
  await page.getByTestId('category-search').fill('e2e snack')
  await expect(node(page, 'E2E Snacks')).toBeVisible()
  await expect(node(page, 'E2E Food')).toBeVisible()
  await expect(node(page, 'E2E Bills')).toBeHidden()
  await page.getByTestId('category-search').fill('')

  // --- The show-hidden choice is written as desktop reads it and survives a reload.
  await expect(node(page, 'E2E Drinks')).toBeVisible()
  await page.getByTestId('category-show-hidden').click()
  await expect(node(page, 'E2E Drinks')).toBeHidden()
  await page.reload()
  await expect(page.getByTestId('category-tree')).toBeVisible({ timeout: 30_000 })
  await expect(node(page, 'E2E Drinks')).toBeHidden()
  expect(
    await query(
      page,
      "SELECT SETTINGVALUE FROM SETTING_V1 WHERE SETTINGNAME = 'SHOW_HIDDEN_CATEGS'",
    ),
  ).toEqual([{ SETTINGVALUE: 'FALSE' }])
  await openCategories(page)
  await page.getByTestId('category-show-hidden').click()
  await expect(node(page, 'E2E Drinks')).toBeVisible()

  // --- Live use is refused on the surface: Food's subcategory carries a live transaction.
  await node(page, 'E2E Food').click()
  await page.getByTestId('category-delete').click()
  await expect(page.getByTestId('category-action-error')).toContainText('Subcategory in use.')
  await expect(page.getByTestId('category-action-error')).toContainText('merge command')

  // --- A duplicate sibling is refused at the entry.
  await page.getByTestId('category-new').click()
  await lastByTestId(page, 'category-name').fill('e2e snacks')
  await lastByTestId(page, 'category-name-save').click()
  await expect(page.getByText('already exists for the parent')).toBeVisible()
  await lastByTestId(page, 'category-name-cancel').click()

  // --- A case-only rename is accepted.
  await node(page, 'E2E Food').click()
  await page.getByTestId('category-edit').click()
  await lastByTestId(page, 'category-name').fill('E2E FOOD')
  await lastByTestId(page, 'category-name-save').click()
  await expect(node(page, /E2E FOOD/)).toBeVisible()

  // --- Move to the top level through the picker and the confirmation.
  await node(page, 'E2E Snacks').click()
  await page.getByTestId('category-move').click()
  await chooseOption(page, 'category-picker', 'Top level')
  await expect(page.getByTestId('category-move-text')).toContainText('E2E Snacks')
  await page.getByTestId('category-move-confirm').click()
  await expect(page.getByTestId('category-move-dialog')).toBeHidden()
  expect(
    await query(page, "SELECT PARENTID FROM CATEGORY_V1 WHERE CATEGNAME = 'E2E Snacks'"),
  ).toEqual([{ PARENTID: -1 }])

  // --- Only trashed references: the confirmation carries the purge sentence, and
  // confirming removes the transaction, the budget row and the category.
  await openCategories(page)
  await node(page, 'E2E Bills').click()
  await page.getByTestId('category-delete').click()
  await expect(lastByTestId(page, 'taxonomy-delete-purge')).toContainText('automatically purge')
  await lastByTestId(page, 'taxonomy-delete-confirm').click()
  await expect(node(page, 'E2E Bills')).toBeHidden()
  expect(
    await query(page, "SELECT COUNT(*) AS n FROM CHECKINGACCOUNT_V1 WHERE NOTES = 'e2e-trashed'"),
  ).toEqual([{ n: 0 }])
  expect(
    await query(page, "SELECT COUNT(*) AS n FROM CATEGORY_V1 WHERE CATEGNAME = 'E2E Bills'"),
  ).toEqual([{ n: 0 }])
  expect(
    await query(
      page,
      "SELECT COUNT(*) AS n FROM BUDGETTABLE_V1 WHERE BUDGETYEARID = (SELECT BUDGETYEARID FROM BUDGETYEAR_V1 WHERE BUDGETYEARNAME = 'E2E 2026')",
    ),
  ).toEqual([{ n: 1 }])

  // --- Merge Snacks into Target: counts before, the live transaction re-pointed and
  // stamped, the source's budget row deleted, the count reported after.
  await openCategories(page)
  await page.getByTestId('category-merge-open').click()
  await chooseOption(page, 'merge-source', 'E2E Snacks')
  await expect(page.getByTestId('merge-counts')).toContainText('Records found in transactions: 1')
  await expect(page.getByTestId('merge-counts')).toContainText('Records found in budget: 1')
  await chooseOption(page, 'merge-target', 'E2E Target')
  await page.getByTestId('merge-confirm').click()
  await expect(page.getByTestId('merge-confirmation')).toContainText(
    'From E2E Snacks to E2E Target',
  )
  await page.getByTestId('merge-confirm-accept').click()
  await expect(page.getByTestId('merge-result')).toContainText('records changed')
  const [moved] = await query<{ CATEGNAME: string; LASTUPDATEDTIME: string | null }>(
    page,
    "SELECT c.CATEGNAME, t.LASTUPDATEDTIME FROM CHECKINGACCOUNT_V1 t JOIN CATEGORY_V1 c ON c.CATEGID = t.CATEGID WHERE t.NOTES = 'e2e-live'",
  )
  expect(moved?.CATEGNAME).toBe('E2E Target')
  expect(moved?.LASTUPDATEDTIME).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  expect(
    await query(
      page,
      "SELECT COUNT(*) AS n FROM BUDGETTABLE_V1 WHERE BUDGETYEARID = (SELECT BUDGETYEARID FROM BUDGETYEAR_V1 WHERE BUDGETYEARNAME = 'E2E 2026')",
    ),
  ).toEqual([{ n: 0 }])
})
