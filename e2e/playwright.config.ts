import 'dotenv/config'
import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import os from 'node:os'

// 并行执行 spec 文件。每测试已完全隔离（独立 E2E_CONFIG_DIR / userData / 库目录，
// 清理函数按「项目根 + 该测试 config dir」双过滤），worker 互不干扰。20 核取 4，
// 避免过多 Electron 实例造成 IO/内存争抢。可用 `--workers=N` 临时覆盖。
const workers = Math.min(4, Math.max(2, os.cpus().length - 4))

export default defineConfig({
  testDir: path.join(__dirname, 'specs'),
  outputDir: path.join(__dirname, '..', 'e2e-results'),
  fullyParallel: false,
  workers,
  retries: 1,
  timeout: 180000,
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
