import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  // Run serially — tests share a single test user account
  workers: 1,
  use: {
    baseURL: 'http://localhost:5173',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
    {
      name: 'mobile-safari',
      use: {
        ...devices['iPhone 14'],
        baseURL: 'http://localhost:5173',
        hasTouch: true,
      },
    },
  ],
})
