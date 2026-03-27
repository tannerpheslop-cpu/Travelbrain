import { type Page } from '@playwright/test'

/**
 * Simulate a touch swipe using Playwright's mouse API with drag.
 * When hasTouch is enabled, Playwright converts mouse events to touch events.
 * This is the most reliable cross-browser approach.
 */
export async function swipeUp(page: Page, selector: string, distance = 200) {
  const box = await page.locator(selector).boundingBox()
  if (!box) throw new Error(`Element not found: ${selector}`)
  const x = box.x + box.width / 2
  const startY = box.y + box.height / 2

  await page.mouse.move(x, startY)
  await page.mouse.down()
  const steps = 10
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(x, startY - (distance * i) / steps, { steps: 1 })
    await page.waitForTimeout(16)
  }
  await page.mouse.up()
}

export async function swipeDown(page: Page, selector: string, distance = 200) {
  const box = await page.locator(selector).boundingBox()
  if (!box) throw new Error(`Element not found: ${selector}`)
  const x = box.x + box.width / 2
  const startY = box.y + box.height / 2

  await page.mouse.move(x, startY)
  await page.mouse.down()
  const steps = 10
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(x, startY + (distance * i) / steps, { steps: 1 })
    await page.waitForTimeout(16)
  }
  await page.mouse.up()
}

/**
 * Tap using Playwright's locator.tap() which handles touch correctly
 * when hasTouch is enabled in the browser context.
 */
export async function touchTap(page: Page, selector: string) {
  await page.locator(selector).tap()
}
