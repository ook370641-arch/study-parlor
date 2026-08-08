import { test, expect } from '@playwright/test'
import { ElectronApplication, Page } from 'playwright'
import { startApp, stopApp } from '../helpers/app-lifecycle'
import { createTestLibrary, cleanupTestLibrary, seedBriefing, seedStateJson, createTestConfigDir, cleanupTestConfigDir, localDateString } from '../helpers/test-library'
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

test('shows cached briefing in academic layout @smoke', async () => {
  const today = localToday()
  seedBriefing(testLibraryPath, today)
  const coverPage = new CoverPage(window)
  await coverPage.gotoBriefing()
  await window.locator(SELECTORS.briefing.receiveDigestButton).click()
  await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible()
  await expect(window.locator(SELECTORS.briefing.academicLayout)).toContainText('Box CEO Aaron Levie')
})

test('shows generated timestamp for cached briefing @smoke', async () => {
  const today = localToday()
  const generatedAt = new Date(`${today}T08:32:00`).toISOString()
  seedBriefing(testLibraryPath, today, undefined, generatedAt)
  const coverPage = new CoverPage(window)
  await coverPage.gotoBriefing()
  await window.locator(SELECTORS.briefing.receiveDigestButton).click()
  await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible()
  await expect(window.locator(SELECTORS.briefing.generatedAt)).toContainText('08:32')
})

test('toggles between academic and newspaper layout @smoke', async () => {
  const today = localToday()
  seedBriefing(testLibraryPath, today)
  const coverPage = new CoverPage(window)
  await coverPage.gotoBriefing()
  await window.locator(SELECTORS.briefing.receiveDigestButton).click()
  await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible()
  await window.locator(SELECTORS.briefing.themeToggle).click()
  await expect(window.locator(SELECTORS.briefing.newspaperLayout)).toBeVisible()
  await expect(window.locator(SELECTORS.briefing.academicLayout)).toHaveCount(0)
  await window.locator(SELECTORS.briefing.themeToggle).click()
  await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible()
  await expect(window.locator(SELECTORS.briefing.newspaperLayout)).toHaveCount(0)
})

test('swap painting button is visible in academic layout and hidden in newspaper layout @smoke', async () => {
  test.setTimeout(240000)
  const today = localToday()
  seedBriefing(testLibraryPath, today)
  const coverPage = new CoverPage(window)
  await coverPage.gotoBriefing()
  await window.locator(SELECTORS.briefing.receiveDigestButton).click()
  await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible()
  await expect(window.locator(SELECTORS.briefing.swapPaintingButton)).toBeVisible()
  await expect(window.locator(SELECTORS.briefing.surfaceBackground)).toBeVisible()

  await window.locator(SELECTORS.briefing.themeToggle).click()
  await expect(window.locator(SELECTORS.briefing.newspaperLayout)).toBeVisible()
  await expect(window.locator(SELECTORS.briefing.swapPaintingButton)).toHaveCount(0)
  await expect(window.locator(SELECTORS.briefing.surfaceBackground)).toHaveCount(0)
})

test('shows FEED_EMPTY error with no retry button @smoke', async () => {
  const today = localToday()
  seedBriefing(testLibraryPath, today, '## Error\n\nBRIEFING_FEED_EMPTY')
  const coverPage = new CoverPage(window)
  await coverPage.gotoBriefing()
  await window.locator(SELECTORS.briefing.receiveDigestButton).click()
  await expect(window.locator(SELECTORS.briefing.errorDisplay)).toBeVisible()
  await expect(window.locator(SELECTORS.briefing.retryButton)).toHaveCount(0)
})

test('shows network error with retry button and correct message @smoke', async () => {
  const today = localToday()
  seedBriefing(testLibraryPath, today, '## Error\n\nBRIEFING_NETWORK_ERROR')
  const coverPage = new CoverPage(window)
  await coverPage.gotoBriefing()
  await window.locator(SELECTORS.briefing.receiveDigestButton).click()
  await expect(window.locator(SELECTORS.briefing.errorDisplay)).toBeVisible()
  await expect(window.locator(SELECTORS.briefing.retryButton)).toBeVisible()
  await expect(window.getByText('信号塔暂时失联')).toBeVisible()
})

test('shows LLM error with retry button and correct message @smoke', async () => {
  const today = localToday()
  seedBriefing(testLibraryPath, today, '## Error\n\nBRIEFING_LLM_ERROR')
  const coverPage = new CoverPage(window)
  await coverPage.gotoBriefing()
  await window.locator(SELECTORS.briefing.receiveDigestButton).click()
  await expect(window.locator(SELECTORS.briefing.errorDisplay)).toBeVisible()
  await expect(window.locator(SELECTORS.briefing.retryButton)).toBeVisible()
  await expect(window.getByText('简报员暂时无法整理思路')).toBeVisible()
})

test('date column lists past briefings and switches date @smoke', async () => {
  const today = localToday()
  const yesterday = localDateString(new Date(Date.now() - 86400000))
  seedBriefing(testLibraryPath, today)
  seedBriefing(testLibraryPath, yesterday, '## Yesterday\n\nYesterday briefing.')
  const coverPage = new CoverPage(window)
  await coverPage.gotoBriefing()
  await expect(window.locator(SELECTORS.briefing.dateColumn)).toBeVisible()
  await window.locator(SELECTORS.briefing.dateItem(yesterday)).click()
  await window.locator(SELECTORS.briefing.markdownBody).waitFor({ state: 'visible' })
  await expect(window.locator(SELECTORS.briefing.markdownBody)).toContainText('Yesterday briefing.')
})
