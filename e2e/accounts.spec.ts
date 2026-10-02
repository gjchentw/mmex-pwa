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

/**
 * New accounts start in the file's base currency (Requirement "Account
 * Creation"), and a file opened without the wizard has none yet, so set it the
 * way a user would.
 */
const ensureBaseCurrency = async (page: Page) => {
  await page.goto('/settings')
  // QSelect puts the test id on its input; the chosen value shows in the field.
  const field = page.locator('.q-field', { has: page.getByTestId('settings-base-currency') })
  await expect(field).toBeVisible({ timeout: 30_000 })
  if ((await field.innerText()).includes('USD')) return
  await page.getByLabel('Base Currency').fill('USD')
  await page.locator('.q-menu .q-item').first().click()
  await page.getByTestId('base-currency-confirm-accept').click()
  await expect(field).toContainText('USD')
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
  await ensureBaseCurrency(page)
  await page.goto('/accounts')
  await expect(page.getByTestId('accounts-page')).toBeVisible({ timeout: 30_000 })

  // --- Creation: the account is written to the file, not just to the screen. A
  // new account starts as desktop's does: a favorite, in the base currency.
  await page.getByTestId('account-add').click()
  await expect(page.getByTestId('account-editor')).toBeVisible()
  await page.getByTestId('account-name').fill(ACCOUNT)
  await page.getByTestId('account-initial-balance').fill('1000')
  await page.getByTestId('account-initial-date').fill('2026-01-01')
  await page.getByTestId('account-save').click()

  await expect(page.getByTestId('account-editor')).toBeHidden()
  await expect(page.getByTestId('account-list')).toContainText(ACCOUNT)
  await expect(page.getByTestId('account-list')).toContainText('USD')
  await expect(page.getByTestId('account-favorite-badge')).toBeVisible()

  // It survives a reload, which a screen-only write would not.
  await page.reload()
  await expect(page.getByTestId('account-list')).toContainText(ACCOUNT, { timeout: 30_000 })

  // --- Editing: the detail that stayed open shows the change before any reload.
  await openDetail(page, ACCOUNT)
  await page.getByTestId('account-detail-edit').click()
  await expect(page.getByTestId('account-editor')).toBeVisible()
  await page.getByTestId('account-name').fill(RENAMED)
  await page.getByTestId('account-save').click()
  await expect(page.getByTestId('account-editor')).toBeHidden()
  await expect(page.getByTestId('account-detail-name')).toHaveText(RENAMED)
  await closeDialog(page)

  await page.reload()
  await expect(page.getByTestId('account-list')).toContainText(RENAMED, { timeout: 30_000 })
  await expect(page.getByTestId('account-list')).not.toContainText(ACCOUNT)

  // --- Favorite: the toggle shows at once in the detail, and is persisted.
  await openDetail(page, RENAMED)
  await page.getByTestId('account-detail-favorite').click()
  await expect(page.getByTestId('account-detail-favorite')).toHaveAttribute('aria-pressed', 'false')
  await closeDialog(page)

  await page.reload()
  await expect(page.getByTestId('account-list')).toContainText(RENAMED, { timeout: 30_000 })
  await expect(page.getByTestId('account-favorite-badge')).toHaveCount(0)

  // --- Statement lock: set with its date, shown at once, and persisted.
  await openDetail(page, RENAMED)
  await page.getByTestId('account-detail-edit').click()
  await page.getByTestId('account-statement-lock-toggle').click()
  await page.getByTestId('account-statement-date').fill('2026-08-31')
  await page.getByTestId('account-save').click()
  await expect(page.getByTestId('account-editor')).toBeHidden()
  await expect(page.getByTestId('account-detail-locked')).toBeVisible()
  await closeDialog(page)

  await page.reload()
  await openDetail(page, RENAMED)
  await expect(page.getByTestId('account-detail-locked')).toBeVisible()

  // --- Deletion: the detail closes onto the list, and the account stays gone.
  await page.getByTestId('account-detail-delete').click()
  await expect(page.getByTestId('account-delete-dialog')).toBeVisible()
  await page.getByTestId('account-delete-confirm').click()

  await expect(page.getByTestId('account-detail')).toBeHidden()
  await expect(page.getByTestId('account-list')).not.toContainText(RENAMED)
  await page.reload()
  await expect(page.getByTestId('accounts-page')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('account-list')).not.toContainText(RENAMED)
})
