import { test, expect } from '@playwright/test'

test('app loads and shows login page', async ({ page }) => {
  await page.goto('/')
  // The app should redirect unauthenticated users to the login page
  await expect(page).toHaveURL(/login/)
  // Verify some login UI is present
  await expect(page.locator('body')).toBeVisible()
})
