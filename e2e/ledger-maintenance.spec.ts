import { test, expect } from '@playwright/test'
import { openDatabase, query, seed } from './taxonomy-helpers'

// openspec: transaction-ledger-fidelity task 6.2 -- the retention purge against
// real SQLite in OPFS, through the application's own start-up wiring: a trashed
// transaction older than the retention is removed with its split row and that
// row's tag link once the database is ready, and a recently trashed one stays.
// Seeds through the development-only /dev-seed route (ignored under CI).

const SEED = `
INSERT INTO TAG_V1 (TAGNAME, ACTIVE) VALUES ('e2epurge', 1);
INSERT INTO CHECKINGACCOUNT_V1 (ACCOUNTID, TOACCOUNTID, PAYEEID, TRANSCODE, TRANSAMOUNT, STATUS, NOTES, CATEGID, TRANSDATE, DELETEDTIME, TOTRANSAMOUNT) VALUES (1, -1, -1, 'Withdrawal', 10, '', 'e2e-expired', -1, '2020-01-01T00:00:00', '2020-01-02T00:00:00', 10);
INSERT INTO SPLITTRANSACTIONS_V1 (TRANSID, CATEGID, SPLITTRANSAMOUNT, NOTES) VALUES ((SELECT TRANSID FROM CHECKINGACCOUNT_V1 WHERE NOTES = 'e2e-expired'), -1, 10, 'e2e-expired-split');
INSERT INTO TAGLINK_V1 (REFTYPE, REFID, TAGID) VALUES ('TransactionSplit', (SELECT SPLITTRANSID FROM SPLITTRANSACTIONS_V1 WHERE NOTES = 'e2e-expired-split'), (SELECT TAGID FROM TAG_V1 WHERE TAGNAME = 'e2epurge'));
INSERT INTO CHECKINGACCOUNT_V1 (ACCOUNTID, TOACCOUNTID, PAYEEID, TRANSCODE, TRANSAMOUNT, STATUS, NOTES, CATEGID, TRANSDATE, DELETEDTIME, TOTRANSAMOUNT) VALUES (1, -1, -1, 'Withdrawal', 5, '', 'e2e-recent', -1, '2020-01-01T00:00:00', strftime('%Y-%m-%dT%H:%M:%S', 'now'), 5);
`

const count = async (page: Parameters<typeof query>[0], sql: string) =>
  (await query<{ n: number }>(page, sql))[0]?.n

test('the retention purge removes expired trash when the application starts', async ({ page }) => {
  test.setTimeout(120_000)

  await openDatabase(page)
  await seed(page, SEED)
  expect(
    await count(page, "SELECT COUNT(*) AS n FROM CHECKINGACCOUNT_V1 WHERE NOTES LIKE 'e2e-%'"),
  ).toBe(2)

  // The purge already ran today when the database first became ready, before the
  // rows existed; forget that day so the next start runs it again.
  await page.evaluate(() => localStorage.removeItem('mmex.maintenance.lastPurgeDay'))
  await page.reload()

  await expect
    .poll(
      () => count(page, "SELECT COUNT(*) AS n FROM CHECKINGACCOUNT_V1 WHERE NOTES = 'e2e-expired'"),
      {
        timeout: 30_000,
      },
    )
    .toBe(0)
  expect(
    await count(page, "SELECT COUNT(*) AS n FROM CHECKINGACCOUNT_V1 WHERE NOTES = 'e2e-recent'"),
  ).toBe(1)
  expect(
    await count(
      page,
      "SELECT COUNT(*) AS n FROM SPLITTRANSACTIONS_V1 WHERE NOTES = 'e2e-expired-split'",
    ),
  ).toBe(0)
  expect(
    await count(
      page,
      "SELECT COUNT(*) AS n FROM TAGLINK_V1 WHERE TAGID = (SELECT TAGID FROM TAG_V1 WHERE TAGNAME = 'e2epurge')",
    ),
  ).toBe(0)
  expect(await page.evaluate(() => localStorage.getItem('mmex.maintenance.lastPurgeDay'))).toMatch(
    /^\d{4}-\d{2}-\d{2}$/,
  )
})
