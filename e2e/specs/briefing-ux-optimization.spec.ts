import { test, expect } from '@playwright/test'
import { ElectronApplication, Page } from 'playwright'
import { startApp, stopApp } from '../helpers/app-lifecycle'
import { createTestLibrary, cleanupTestLibrary, seedBriefing, seedStateJson, createTestConfigDir, cleanupTestConfigDir } from '../helpers/test-library'
import { SELECTORS } from '../helpers/selectors'
import { CoverPage } from '../helpers/pages/cover-page'

function localToday(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

let electronApp: ElectronApplication
let window: Page
let testLibraryPath: string
let testConfigDir: string

test.beforeEach(async () => {
  testLibraryPath = createTestLibrary()
  testConfigDir = createTestConfigDir()
  seedStateJson(testConfigDir, { profile: { name: '简报测试员', profile_text: '', preferred_topics: [] } })
  const result = await startApp({ testLibraryPath, testConfigDir })
  electronApp = result.electronApp
  window = result.window
})

test.afterEach(async () => {
  await stopApp(electronApp)
  await cleanupTestLibrary(testLibraryPath, test.info().status !== 'passed')
  await cleanupTestConfigDir(testConfigDir, test.info().status !== 'passed')
})

test('header buttons are visible before generation @smoke', async () => {
  const today = localToday()
  seedBriefing(testLibraryPath, today)
  const coverPage = new CoverPage(window)
  await coverPage.gotoBriefing()
  await expect(window.locator(SELECTORS.briefing.fontSizeDecrease)).toBeVisible()
  await expect(window.locator(SELECTORS.briefing.fontSizeIncrease)).toBeVisible()
  await expect(window.locator(SELECTORS.briefing.historyButton)).toBeVisible()
  await expect(window.locator(SELECTORS.briefing.themeToggle)).toBeVisible()
})

test('increases font size and persists @smoke', async () => {
  const today = localToday()
  seedBriefing(testLibraryPath, today)
  const coverPage = new CoverPage(window)
  await coverPage.gotoBriefing()
  await window.locator(SELECTORS.briefing.fontSizeIncrease).click()
  await window.locator(SELECTORS.briefing.fontSizeIncrease).click()
  await expect(window.locator(SELECTORS.briefing.fontSizeIncrease)).toBeDisabled()
  await stopApp(electronApp)
  const result = await startApp({ testLibraryPath, testConfigDir })
  electronApp = result.electronApp
  window = result.window
  const coverPage2 = new CoverPage(window)
  await coverPage2.gotoBriefing()
  await expect(window.locator(SELECTORS.briefing.fontSizeIncrease)).toBeDisabled()
})

test('no decorative masthead in generated content @smoke', async () => {
  const today = localToday()
  seedBriefing(testLibraryPath, today, `## X / Twitter

### Box CEO Aaron Levie
No digest header here.

## 原始来源
### Box CEO Aaron Levie
- [tweet](https://x.com/levie/status/1)
`)
  const coverPage = new CoverPage(window)
  await coverPage.gotoBriefing()
  const pageText = await window.locator(SELECTORS.briefing.markdownBody).innerText()
  expect(pageText).not.toContain('AI Builders Digest')
  expect(pageText).not.toContain('Vol.')
  expect(pageText).not.toContain('档案编号')
})

test('no AI industry daily subtitle @smoke', async () => {
  const today = localToday()
  seedBriefing(testLibraryPath, today)
  const coverPage = new CoverPage(window)
  await coverPage.gotoBriefing()
  const headerText = await window.locator('header').innerText()
  expect(headerText).not.toContain('AI 行业日报')
})

test('generated time has no "生成于" prefix @smoke', async () => {
  const today = localToday()
  const generatedAt = new Date(`${today}T08:32:00`).toISOString()
  seedBriefing(testLibraryPath, today, undefined, generatedAt)
  const coverPage = new CoverPage(window)
  await coverPage.gotoBriefing()
  const metaText = await window.locator(SELECTORS.briefing.generatedAt).innerText()
  expect(metaText).not.toContain('生成于')
  expect(metaText).toContain('08:32')
})

test('history button is visible before generation and opens drawer @smoke', async () => {
  const today = localToday()
  seedBriefing(testLibraryPath, today)
  const coverPage = new CoverPage(window)
  await coverPage.gotoBriefing()
  const historyButton = window.locator(SELECTORS.briefing.historyButton)
  await expect(historyButton).toBeVisible()
  await historyButton.click()
  await expect(window.locator('[data-testid="briefing-history-drawer"]')).toBeVisible()
})

test('swap painting button is below header in academic layout @smoke', async () => {
  const today = localToday()
  seedBriefing(testLibraryPath, today)
  const coverPage = new CoverPage(window)
  await coverPage.gotoBriefing()
  const btn = window.locator(SELECTORS.briefing.swapPaintingButton)
  await expect(btn).toBeVisible()
  const headerBox = await window.locator('header').boundingBox()
  const btnBox = await btn.boundingBox()
  expect(btnBox!.y).toBeGreaterThan(headerBox!.y + headerBox!.height - 2)
})
