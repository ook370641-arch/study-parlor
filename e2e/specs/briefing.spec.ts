import { test, expect } from '@playwright/test'
import { ElectronApplication, Page } from 'playwright'
import { startApp, stopApp } from '../helpers/app-lifecycle'
import { createTestLibrary, cleanupTestLibrary, seedBriefing, seedStateJson, createTestConfigDir, cleanupTestConfigDir } from '../helpers/test-library'
import { SELECTORS } from '../helpers/selectors'
import { CoverPage } from '../helpers/pages/cover-page'

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
  const today = new Date().toISOString().slice(0, 10)
  seedBriefing(testLibraryPath, today)
  const coverPage = new CoverPage(window)
  await coverPage.gotoBriefing()
  await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible()
  await expect(window.locator(SELECTORS.briefing.academicLayout)).toContainText('Box CEO Aaron Levie')
})

test('shows generated timestamp for cached briefing @smoke', async ({ window, testLibraryPath }) => {
  const today = new Date().toISOString().slice(0, 10)
  seedBriefing(testLibraryPath, today, undefined, '2026-06-27T08:32:00.000Z')
  const coverPage = new CoverPage(window)
  await coverPage.gotoBriefing()
  await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible()
  await expect(window.locator(SELECTORS.briefing.generatedAt)).toContainText('生成于 08:32')
})

test('toggles between academic and newspaper layout @smoke', async () => {
  const today = new Date().toISOString().slice(0, 10)
  seedBriefing(testLibraryPath, today)
  const coverPage = new CoverPage(window)
  await coverPage.gotoBriefing()
  await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible()
  await window.locator(SELECTORS.briefing.themeToggle).click()
  await expect(window.locator(SELECTORS.briefing.newspaperLayout)).toBeVisible()
  await expect(window.locator(SELECTORS.briefing.academicLayout)).toHaveCount(0)
  await window.locator(SELECTORS.briefing.themeToggle).click()
  await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible()
  await expect(window.locator(SELECTORS.briefing.newspaperLayout)).toHaveCount(0)
})

test('shows FEED_EMPTY error with no retry button @smoke', async () => {
  const today = new Date().toISOString().slice(0, 10)
  seedBriefing(testLibraryPath, today, '')
  const coverPage = new CoverPage(window)
  await coverPage.gotoBriefing()
  await expect(window.locator(SELECTORS.briefing.errorDisplay)).toBeVisible()
  await expect(window.locator(SELECTORS.briefing.retryButton)).toHaveCount(0)
})

test('shows network error with retry button and correct message @smoke', async () => {
  const today = new Date().toISOString().slice(0, 10)
  seedBriefing(testLibraryPath, today, '## Error\n\nBRIEFING_NETWORK_ERROR')
  const coverPage = new CoverPage(window)
  await coverPage.gotoBriefing()
  await expect(window.locator(SELECTORS.briefing.errorDisplay)).toBeVisible()
  await expect(window.locator(SELECTORS.briefing.retryButton)).toBeVisible()
  await expect(window.getByText('信号塔暂时失联')).toBeVisible()
})

test('shows LLM error with retry button and correct message @smoke', async () => {
  const today = new Date().toISOString().slice(0, 10)
  seedBriefing(testLibraryPath, today, '## Error\n\nBRIEFING_LLM_ERROR')
  const coverPage = new CoverPage(window)
  await coverPage.gotoBriefing()
  await expect(window.locator(SELECTORS.briefing.errorDisplay)).toBeVisible()
  await expect(window.locator(SELECTORS.briefing.retryButton)).toBeVisible()
  await expect(window.getByText('信号塔暂时失联')).toBeVisible()
})

test('navigates to history from briefing page @smoke', async () => {
  const today = new Date().toISOString().slice(0, 10)
  seedBriefing(testLibraryPath, today)
  const coverPage = new CoverPage(window)
  await coverPage.gotoBriefing()
  await expect(window.locator(SELECTORS.briefing.historyButton)).toBeVisible()
  await window.locator(SELECTORS.briefing.historyButton).click()
  await expect(window.locator(SELECTORS.briefing.page)).toHaveCount(0)
})
