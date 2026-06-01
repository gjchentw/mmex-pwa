import { test, expect } from '@playwright/test'

test('visits the app root url and gets redirected to /init', async ({ page }) => {
  await page.goto('/')
  // Without a pre-existing DB, the route guard redirects to /init
  await expect(page).toHaveURL(/\/init/)
  // Should show the probing/initialization screen
  await expect(page.locator('text=Database Error').or(page.locator('text=Initializing'))).toBeVisible()
})
