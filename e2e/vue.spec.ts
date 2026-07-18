import { test, expect } from '@playwright/test'

// Regression coverage for openspec:fix-wasm-path-resolution (requirement:
// Production Binary Asset Resolution). On CI this runs against a preview of the
// production build, which is the only environment class where WASM/worker asset
// resolution has ever broken -- dev resolves from node_modules and cannot fail
// the same way.
test('boots cross-origin isolated and opens a database', async ({ page }) => {
  // If any runtime-fetched asset regresses to a path the SPA fallback answers,
  // the response is HTML; record such asset requests to fail with a pointed
  // message instead of a generic timeout.
  const htmlAnsweredAssets: string[] = []
  page.on('response', (res) => {
    const path = new URL(res.url()).pathname
    if (path.startsWith('/assets/') && (res.headers()['content-type'] ?? '').includes('text/html')) {
      htmlAnsweredAssets.push(path)
    }
  })

  await page.goto('/')

  // Hard precondition for the persistence layer (openspec: Cross-Origin
  // Isolation): without these headers nothing below can work.
  expect(await page.evaluate(() => window.crossOriginIsolated)).toBe(true)

  // The database actually opened: the app leaves its loading state. "Ready"
  // (schema applied) or "Needs Setup" (fresh database awaiting the wizard) both
  // prove WASM compiled, the OPFS proxy worker started, and OPFS mounted.
  await expect(page.getByTestId('db-status')).toHaveText(/Ready|Needs Setup/, { timeout: 20_000 })

  expect(htmlAnsweredAssets, 'asset requests answered by the SPA fallback').toEqual([])
})
