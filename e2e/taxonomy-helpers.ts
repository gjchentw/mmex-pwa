import { expect, type Page } from '@playwright/test'

/**
 * Shared steps for the taxonomy end-to-end specs (transaction-taxonomy-surfaces,
 * design D10, D13). The database is reached through the UI as the other specs do;
 * rows are seeded and read back through the development-only /dev-seed route,
 * which exists on the dev server and never in a production bundle.
 */

/** Reach a ready database, completing the new-file wizard when one is needed. */
export const openDatabase = async (page: Page) => {
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

/** Runs statements (one per line, each ending in `;`) through the domain layer's batch. */
export const seed = async (page: Page, sql: string) => {
  await page.goto('/dev-seed')
  await expect(page.getByTestId('dev-seed-statements')).toBeVisible({ timeout: 30_000 })
  await page.getByTestId('dev-seed-statements').fill(sql)
  await page.getByTestId('dev-seed-run').click()
  await expect(page.getByTestId('dev-seed-status')).toBeVisible()
  await expect(page.getByTestId('dev-seed-error')).toBeHidden()
}

/** Reads rows back as the domain layer returns them. */
export const query = async <T = Record<string, unknown>>(page: Page, sql: string): Promise<T[]> => {
  if (!page.url().endsWith('/dev-seed')) {
    await page.goto('/dev-seed')
    await expect(page.getByTestId('dev-seed-query')).toBeVisible({ timeout: 30_000 })
  }
  await page.getByTestId('dev-seed-query').fill(sql)
  await page.getByTestId('dev-seed-select').click()
  await expect(page.getByTestId('dev-seed-rows')).toBeVisible()
  await expect(page.getByTestId('dev-seed-error')).toBeHidden()
  return JSON.parse((await page.getByTestId('dev-seed-rows').textContent()) ?? '[]') as T[]
}

/** QSelect puts the test id on its inner element; the field is what the user clicks. */
export const field = (page: Page, testid: string) =>
  page.locator('.q-field', { has: page.getByTestId(testid) })

export const chooseOption = async (page: Page, testid: string, optionText: string | RegExp) => {
  await field(page, testid).click()
  await page.locator('.q-menu .q-item').filter({ hasText: optionText }).first().click()
}

/** The last element with a test id: dialog content lingers through its closing transition. */
export const lastByTestId = (page: Page, testid: string) => page.getByTestId(testid).last()
