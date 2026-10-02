import { test, expect, type Page } from '@playwright/test'

// openspec: file-metadata-and-settings-fidelity task 8.1 -- the settings surface
// against real SQLite in OPFS. Unit tests prove what each write contains; this
// proves the surface writes, and that what it wrote comes back after a reload.
// Nothing on the page exposes the tables themselves, so each fact is checked
// through what the surface shows for it.

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

/** QSelect puts the test id on its inner element; the field is what the user sees and clicks. */
const field = (page: Page, testid: string) =>
  page.locator('.q-field', { has: page.getByTestId(testid) })

const chooseOption = async (page: Page, testid: string, optionText: string | RegExp) => {
  await field(page, testid).click()
  await page.locator('.q-menu .q-item').filter({ hasText: optionText }).first().click()
}

/** The page title, as distinct from the navigation entry carrying the same text. */
const pageTitle = (page: Page) => page.locator('.q-page .text-h5')

/** Picks a base currency through the real select and the real confirmation. */
const pickBaseCurrency = async (page: Page, code: string) => {
  await field(page, 'settings-base-currency').click()
  await page.getByTestId('settings-base-currency').fill(code)
  await page.locator('.q-menu .q-item').filter({ hasText: code }).first().click()
  await expect(page.getByTestId('base-currency-confirm')).toBeVisible()
}

/**
 * A file opened without the wizard has no base currency yet (its field is
 * empty), so one is set first, the way a user would.
 */
const ensureBaseCurrency = async (page: Page, code: string) => {
  if ((await field(page, 'settings-base-currency').innerText()).includes(code)) return
  await pickBaseCurrency(page, code)
  await page.getByTestId('base-currency-confirm-accept').click()
  await expect(page.getByTestId('base-currency-confirm')).toBeHidden()
}

const openSettings = async (page: Page) => {
  await page.goto('/settings')
  await expect(page.getByTestId('settings-file-facts')).toBeVisible({ timeout: 30_000 })
}

test('language, date format and base currency are written and survive a reload', async ({
  page,
}) => {
  test.setTimeout(120_000)

  await openDatabase(page)
  await openSettings(page)

  // --- Language (Requirement "Active Locale Persistence"): the page relabels at
  // once, and starts in the chosen language after a reload.
  await chooseOption(page, 'settings-language', '繁體中文')
  await expect(pageTitle(page)).toHaveText('設定')
  await expect(field(page, 'settings-language')).toContainText('繁體中文')

  await page.reload()
  await expect(page.getByTestId('settings-file-facts')).toBeVisible({ timeout: 30_000 })
  await expect(pageTitle(page)).toHaveText('設定')
  await expect(page.getByTestId('shell-language')).toContainText('繁體中文')

  // --- Date format (Requirement "Editing File Facts"): a desktop mask, chosen by
  // its sample, shown again after a reload.
  await chooseOption(page, 'settings-date-format', /\(%d\/%m\/%Y\)/)
  await expect(field(page, 'settings-date-format')).toContainText('(%d/%m/%Y)')

  await page.reload()
  await expect(page.getByTestId('settings-file-facts')).toBeVisible({ timeout: 30_000 })
  await expect(field(page, 'settings-date-format')).toContainText('(%d/%m/%Y)')

  // --- Base currency (Requirement "Base Currency Change Confirmation"): the
  // confirmation states the reset; declining restores USD; confirming moves to EUR.
  await ensureBaseCurrency(page, 'USD')
  await expect(field(page, 'settings-base-currency')).toContainText('USD')

  await pickBaseCurrency(page, 'EUR')
  await expect(page.getByTestId('base-currency-confirm')).toContainText('1')
  await page.getByTestId('base-currency-confirm-cancel').click()
  await expect(page.getByTestId('base-currency-confirm')).toBeHidden()
  await expect(field(page, 'settings-base-currency')).toContainText('USD')

  await pickBaseCurrency(page, 'EUR')
  await page.getByTestId('base-currency-confirm-accept').click()
  await expect(page.getByTestId('base-currency-confirm')).toBeHidden()
  await expect(field(page, 'settings-base-currency')).toContainText('EUR')

  await page.reload()
  await expect(page.getByTestId('settings-file-facts')).toBeVisible({ timeout: 30_000 })
  await expect(field(page, 'settings-base-currency')).toContainText('EUR')

  // --- The new base reaches the rest of the application: a new account starts
  // in it (account-management, Account Creation).
  await page.goto('/accounts')
  await page.getByTestId('account-add').click()
  await expect(field(page, 'account-currency')).toContainText('EUR')

  // Leave the file in English for whoever opens it next.
  await openSettings(page)
  await chooseOption(page, 'settings-language', 'English')
  await expect(pageTitle(page)).toHaveText('Settings')
})
