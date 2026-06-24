import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'

export default defineConfig({
  testDir: path.join(__dirname, 'specs'),
  outputDir: path.join(__dirname, '..', 'e2e-results'),
  fullyParallel: false,
  workers: 1,
  retries: 1,
  timeout: 120000,
  expect: {
    timeout: 10000,
  },
  reporter: [['line'], ['html', { outputFolder: path.join(__dirname, '..', 'playwright-report') }]],
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'electron',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
