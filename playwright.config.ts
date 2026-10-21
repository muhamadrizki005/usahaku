import { defineConfig } from '@playwright/test'

// Failure snapshots could contain a just-created staff password. Never capture them.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1'

export default defineConfig({
  testDir: './tests/browser',
  timeout: 240000,
  expect: { timeout: 15000 },
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    actionTimeout: 10000,
    navigationTimeout: 20000,
    baseURL: process.env.TEST_BASE_URL || 'http://localhost:3100',
    channel: 'msedge',
    headless: true,
    screenshot: 'off',
    trace: 'off',
    video: 'off',
  },
})
