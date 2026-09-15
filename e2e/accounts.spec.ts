import { test, expect, type Page } from '@playwright/test'

// openspec: account-management-surfaces task 13.7 -- the end-to-end smoke test
// over the accounts surface. Unit tests cover the store and the components
// against a fake database; this is the only place the whole chain runs against
// real SQLite in OPFS, so a write that never reaches the file shows up here.

const ACCOUNT = 'E2E Smoke Account'
const RENAMED = 'E2E Renamed Account'

/** Reach a ready database, completing the new-file wizard when one is needed. */
const openDatabase = async (page: Page) => {
  await page.goto('/')
  await expect(page.getByTestId('db-status')).toHaveText(/Ready|Setup needed/, { timeout: 30_000 })

  if ((await page.getByTestId('db-status').textContent())?.includes('Setup needed')) {
    await page.getByText('Create New Database').waitFor({ timeout: 30_000 })
    await page.getByLabel('Base Currency').click()
    await page.getByLabel('Base Currency').fill('USD')
    await page.locator('.q-menu .q-item').first().click()
    await page.getByRole('button', { name: 'Create' }).click()
    await expect(page.getByTestId('db-status')).toHaveText(/Ready/, { timeout: 30_000 })
  }
}

const openDetail = async (page: Page, name: string) => {
  await page.getByTestId('account-list').getByText(name, { exact: false }).first().click()
  await expect(page.getByTestId('account-detail')).toBeVisible()
}

/** The detail dialog is persistent, so Escape will not dismiss it. */
const closeDialog = async (page: Page) => {
  await page.locator('[data-testid="account-detail"] button:has(i.mdi-close)').click()
  await expect(page.getByTestId('account-detail')).toBeHidden()
}

test('an account can be created, edited, favourited, locked and deleted', async ({ page }) => {
  test.setTimeout(120_000)

  await openDatabase(page)
  await page.goto('/accounts')
  await expect(page.getByTestId('accounts-page')).toBeVisible({ timeout: 30_000 })

  // --- Creation: the account is written to the file, not just to the screen.
  await page.getByTestId('account-add').click()
  await expect(page.getByTestId('account-editor')).toBeVisible()
  await page.getByTestId('account-name').fill(ACCOUNT)
  await page.getByTestId('account-initial-balance').fill('1000')
  await page.getByTestId('account-initial-date').fill('2026-01-01')
  await page.getByTestId('account-save').click()

  await expect(page.getByTestId('account-editor')).toBeHidden()
  await expect(page.getByTestId('account-list')).toContainText(ACCOUNT)

  // It survives a reload, which a screen-only write would not.
  await page.reload()
  await expect(page.getByTestId('account-list')).toContainText(ACCOUNT, { timeout: 30_000 })

  // --- Editing.
  await openDetail(page, ACCOUNT)
  await page.getByTestId('account-detail-edit').click()
  await expect(page.getByTestId('account-editor')).toBeVisible()
  await page.getByTestId('account-name').fill(RENAMED)
  await page.getByTestId('account-save').click()
  await expect(page.getByTestId('account-editor')).toBeHidden()
  await closeDialog(page)

  await page.reload()
  await expect(page.getByTestId('account-list')).toContainText(RENAMED, { timeout: 30_000 })
  await expect(page.getByTestId('account-list')).not.toContainText(ACCOUNT)

  // --- Favourite: the flag is persisted and the list shows its indicator.
  await openDetail(page, RENAMED)
  await page.getByTestId('account-detail-favorite').click()
  await closeDialog(page)

  await page.reload()
  await expect(page.getByTestId('account-favorite-badge')).toBeVisible({ timeout: 30_000 })

  // --- Statement lock: set with its date, then shown as locked.
  await openDetail(page, RENAMED)
  await page.getByTestId('account-detail-edit').click()
  await page.getByTestId('account-statement-lock-toggle').click()
  await page.getByTestId('account-statement-date').fill('2026-08-31')
  await page.getByTestId('account-save').click()
  await expect(page.getByTestId('account-editor')).toBeHidden()
  await closeDialog(page)

  await page.reload()
  await openDetail(page, RENAMED)
  await expect(page.getByTestId('account-detail-locked')).toBeVisible()

  // --- Deletion: an account with no dependants goes, and stays gone.
  await page.getByTestId('account-detail-delete').click()
  await expect(page.getByTestId('account-delete-dialog')).toBeVisible()
  await page.getByTestId('account-delete-confirm').click()

  await expect(page.getByTestId('account-list')).not.toContainText(RENAMED)
  await page.reload()
  await expect(page.getByTestId('accounts-page')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('account-list')).not.toContainText(RENAMED)
})
