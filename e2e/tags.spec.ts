import { test, expect, type Page } from '@playwright/test'
import { chooseOption, lastByTestId, openDatabase, query, seed } from './taxonomy-helpers'

// openspec: transaction-taxonomy-surfaces task 7.4 -- the tag manager against real
// SQLite in OPFS: counts, desktop's name rule at the entry, deletion refused by name
// for a used tag and performed for an unused one, and a merge that collapses a
// duplicate link and reports it.

const SEED = `
INSERT INTO TAG_V1 (TAGNAME, ACTIVE) VALUES ('e2etravel', 1);
INSERT INTO TAG_V1 (TAGNAME, ACTIVE) VALUES ('e2etrip', 1);
INSERT INTO TAG_V1 (TAGNAME, ACTIVE) VALUES ('e2eold', 1);
INSERT INTO CHECKINGACCOUNT_V1 (ACCOUNTID, PAYEEID, TRANSCODE, TRANSAMOUNT, STATUS, NOTES, CATEGID, TRANSDATE) VALUES (1, -1, 'Withdrawal', 10, '', 'e2e-tag-1', -1, '2026-08-09');
INSERT INTO CHECKINGACCOUNT_V1 (ACCOUNTID, PAYEEID, TRANSCODE, TRANSAMOUNT, STATUS, NOTES, CATEGID, TRANSDATE) VALUES (1, -1, 'Withdrawal', 20, '', 'e2e-tag-2', -1, '2026-08-09');
INSERT INTO TAGLINK_V1 (REFTYPE, REFID, TAGID) VALUES ('Transaction', (SELECT TRANSID FROM CHECKINGACCOUNT_V1 WHERE NOTES = 'e2e-tag-1'), (SELECT TAGID FROM TAG_V1 WHERE TAGNAME = 'e2etravel'));
INSERT INTO TAGLINK_V1 (REFTYPE, REFID, TAGID) VALUES ('Transaction', (SELECT TRANSID FROM CHECKINGACCOUNT_V1 WHERE NOTES = 'e2e-tag-1'), (SELECT TAGID FROM TAG_V1 WHERE TAGNAME = 'e2etrip'));
INSERT INTO TAGLINK_V1 (REFTYPE, REFID, TAGID) VALUES ('Transaction', (SELECT TRANSID FROM CHECKINGACCOUNT_V1 WHERE NOTES = 'e2e-tag-2'), (SELECT TAGID FROM TAG_V1 WHERE TAGNAME = 'e2etravel'));
`

const row = (page: Page, name: string) => page.locator('[data-tag-id]', { hasText: name })
const select = (page: Page, name: string) => row(page, name).getByTestId('tag-select').click()

const openTags = async (page: Page) => {
  await page.goto('/tags')
  await expect(page.getByTestId('tag-list')).toBeVisible({ timeout: 30_000 })
}

test('the tag manager counts, refuses reserved names and used deletions, deletes, and merges', async ({
  page,
}) => {
  test.setTimeout(150_000)

  await openDatabase(page)
  await seed(page, SEED)
  await openTags(page)

  // --- Counts of live use (Tag Manager Display).
  await expect(row(page, 'e2etravel').getByTestId('tag-used')).toHaveText('2')
  await expect(row(page, 'e2etrip').getByTestId('tag-used')).toHaveText('1')
  await expect(row(page, 'e2eold').getByTestId('tag-used')).toHaveText('0')

  // --- A reserved name is refused at the entry (Tag Creation and Renaming).
  await page.getByTestId('tag-add').click()
  await lastByTestId(page, 'tag-name').fill('summer trip')
  await lastByTestId(page, 'tag-name-save').click()
  await expect(page.getByText("space (' ') character")).toBeVisible()
  await lastByTestId(page, 'tag-name-cancel').click()

  // --- A used tag is refused by name; an unused one is deleted after confirming.
  await select(page, 'e2etravel')
  await page.getByTestId('tag-delete').click()
  await expect(page.getByTestId('tag-action-error')).toContainText("Tag 'e2etravel' in use")
  await select(page, 'e2etravel')
  await select(page, 'e2eold')
  await page.getByTestId('tag-delete').click()
  await expect(lastByTestId(page, 'taxonomy-delete-names')).toContainText('e2eold')
  await lastByTestId(page, 'taxonomy-delete-confirm').click()
  await expect(row(page, 'e2eold')).toBeHidden()

  // --- Merge trip into travel: the duplicate link on the first transaction collapses.
  await select(page, 'e2etrip')
  await page.getByTestId('tag-merge').click()
  await expect(page.getByTestId('merge-counts')).toContainText('Records found in transactions: 1')
  await chooseOption(page, 'merge-target', 'e2etravel')
  await page.getByTestId('merge-confirm').click()
  await page.getByTestId('merge-confirm-accept').click()
  await expect(page.getByTestId('merge-result')).toContainText('1 duplicate links collapsed')
  expect(
    await query(
      page,
      "SELECT COUNT(*) AS n FROM TAGLINK_V1 WHERE TAGID = (SELECT TAGID FROM TAG_V1 WHERE TAGNAME = 'e2etrip')",
    ),
  ).toEqual([{ n: 0 }])
  expect(
    await query(
      page,
      "SELECT COUNT(*) AS n FROM TAGLINK_V1 WHERE TAGID = (SELECT TAGID FROM TAG_V1 WHERE TAGNAME = 'e2etravel')",
    ),
  ).toEqual([{ n: 2 }])
})
