import { type Page } from '@playwright/test'

/**
 * Log in as the test user via the /dev-login route.
 * The dev server must have VITE_DEV_LOGIN_EMAIL and VITE_DEV_LOGIN_PASSWORD set.
 */
export async function loginAsTestUser(page: Page) {
  await page.goto('/dev-login')
  await page.waitForURL('**/inbox', { timeout: 15_000 })
}
