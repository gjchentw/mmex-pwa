import { test, expect, type Page } from '@playwright/test'

// openspec: currency-management-fidelity task 7.1 -- the currency surface against
// real SQLite in OPFS. Unit tests prove what each write contains; this proves the
// surface writes, and that what it wrote comes back after a reload.

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

/** QSelect puts the test id on its inner element; the field is what the user clicks. */
const field = (page: Page, testid: string) =>
  page.locator('.q-field', { has: page.getByTestId(testid) })

const chooseOption = async (page: Page, testid: string, optionText: string | RegExp) => {
  await field(page, testid).click()
  await page.locator('.q-menu .q-item').filter({ hasText: optionText }).first().click()
}

/** A file opened without the wizard has no base currency; set one as a user would. */
const ensureBaseCurrency = async (page: Page, code: string) => {
  await page.goto('/settings')
  await expect(page.getByTestId('settings-file-facts')).toBeVisible({ timeout: 30_000 })
  if ((await field(page, 'settings-base-currency').innerText()).includes(code)) return
  await field(page, 'settings-base-currency').click()
  await page.getByTestId('settings-base-currency').fill(code)
  await page.locator('.q-menu .q-item').filter({ hasText: code }).first().click()
  await page.getByTestId('base-currency-confirm-accept').click()
  await expect(page.getByTestId('base-currency-confirm')).toBeHidden()
}

const openCurrencies = async (page: Page) => {
  await page.goto('/currencies')
  await expect(page.getByTestId('currency-list')).toBeVisible({ timeout: 30_000 })
}

const CODE = 'TGX'
const NAME = 'Test gold'

test('a currency can be added, edited, given a rate, and deleted through the confirmation', async ({
  page,
}) => {
  test.setTimeout(120_000)

  await openDatabase(page)
  await ensureBaseCurrency(page, 'USD')
  await openCurrencies(page)

  // --- Add (Requirement "Editing and Adding Currency Definitions"): desktop's
  // field shape, previewed before saving.
  await page.getByTestId('currency-add').click()
  await expect(page.getByTestId('currency-editor')).toBeVisible()
  await page.getByTestId('currency-name').fill(NAME)
  await page.getByTestId('currency-symbol').fill(CODE)
  await page.getByTestId('currency-sign').fill('g')
  await page.getByTestId('currency-suffix').click()
  await chooseOption(page, 'currency-decimal-places', /^4$/)
  await page.getByTestId('currency-rate').fill('2')
  await expect(page.getByTestId('currency-preview')).toContainText('1,234,567.8900g')
  await page.getByTestId('currency-save').click()

  await expect(page.getByTestId('currency-editor')).toBeHidden()
  await expect(page.getByTestId('currency-list')).toContainText(`${CODE} — ${NAME}`)
  await expect(page.locator(`[data-currency="${CODE}"]`)).toContainText('1,234.5000g')

  // --- Edit: the symbol moves in front, and the list entry follows after a reload.
  await page.locator(`[data-currency="${CODE}"]`).click()
  await expect(page.getByTestId('currency-editor')).toBeVisible()
  await page.getByTestId('currency-prefix').click()
  await page.getByTestId('currency-save').click()
  await expect(page.getByTestId('currency-editor')).toBeHidden()

  await page.reload()
  await expect(page.getByTestId('currency-list')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator(`[data-currency="${CODE}"]`)).toContainText('g1,234.5000')

  // --- Rate history (Requirement "Exchange Rate History Management"): a rate is
  // recorded, shown as the last rate, then removed.
  await expect(page.getByTestId('currency-rate-column')).toHaveText('Last rate')
  await page.locator(`[data-currency="${CODE}"]`).click()
  await page.getByTestId('rate-date').fill('2026-08-09')
  await page.getByTestId('rate-value').fill('1.5')
  await page.getByTestId('rate-add').click()
  await expect(page.getByTestId('rate-list')).toContainText('2026-08-09')
  await expect(page.getByTestId('rate-list')).toContainText('1.5')
  await page.locator('[data-testid="currency-editor"] button:has-text("Cancel")').click()
  await expect(page.getByTestId('currency-editor')).toBeHidden()
  await expect(
    page.locator(`[data-currency="${CODE}"] [data-testid="currency-rate-cell"]`),
  ).toHaveText('1.5')

  await page.locator(`[data-currency="${CODE}"]`).click()
  await page.getByTestId('rate-remove').first().click()
  await expect(page.getByTestId('rate-list')).toBeHidden()

  // --- Deletion (Requirement "Currency Deletion From the Surface"): declined
  // first, then confirmed, and gone after a reload.
  await page.getByTestId('currency-delete').click()
  await expect(page.getByTestId('currency-delete-dialog')).toBeVisible()
  await page.getByTestId('currency-delete-cancel').click()
  await expect(page.getByTestId('currency-delete-dialog')).toBeHidden()
  await expect(page.getByTestId('currency-editor')).toBeVisible()

  await page.getByTestId('currency-delete').click()
  await page.getByTestId('currency-delete-confirm').click()
  await expect(page.getByTestId('currency-editor')).toBeHidden()
  await expect(page.getByTestId('currency-list')).not.toContainText(CODE)

  await page.reload()
  await expect(page.getByTestId('currency-list')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('currency-list')).not.toContainText(CODE)

  // --- The base currency cannot be deleted here (task 7.2).
  await page.locator('[data-currency="USD"]').click()
  await expect(page.getByTestId('currency-delete')).toBeDisabled()
  await expect(page.getByTestId('currency-delete-reason')).toHaveText('This is the base currency')
  await page.locator('[data-testid="currency-editor"] button:has-text("Cancel")').click()

  // --- Negative amounts render as desktop renders them (Requirement "Amount
  // Formatting and Precision"), seen on the account surface.
  await page.goto('/accounts')
  await expect(page.getByTestId('accounts-page')).toBeVisible({ timeout: 30_000 })
  await page.getByTestId('account-add').click()
  await page.getByTestId('account-name').fill('Overdrawn')
  await page.getByTestId('account-initial-balance').fill('-80')
  await page.getByTestId('account-save').click()
  await expect(page.getByTestId('account-editor')).toBeHidden()
  await expect(page.getByTestId('account-list')).toContainText('$-80.00')
})
