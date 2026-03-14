import { test, expect } from '@playwright/test'

// See here how to get started:
// https://playwright.dev/docs/intro
test('visits the app root url', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('app-root')).toBeVisible()
  await expect(page.getByTestId('sqlite-status')).toBeVisible({ timeout: 10_000 })
})
