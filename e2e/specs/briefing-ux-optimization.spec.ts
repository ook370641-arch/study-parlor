import { test, expect } from '@playwright/test'
import { ElectronApplication, Page } from 'playwright'
import { startApp, stopApp } from '../helpers/app-lifecycle'
import { createTestLibrary, cleanupTestLibrary, seedBriefing, seedAnthropicArticle, seedStateJson, createTestConfigDir, cleanupTestConfigDir } from '../helpers/test-library'
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
  await expect(window.locator(SELECTORS.briefing.dateColumn)).toBeVisible()
  await expect(window.locator(SELECTORS.briefing.themeToggle)).toBeVisible()
})

test('increases font size and persists @smoke', async () => {
  const today = localToday()
  seedBriefing(testLibraryPath, today)
  const coverPage = new CoverPage(window)
  await coverPage.gotoBriefing()
  // Seed a near-max font size so two clicks hit the ceiling and the increase button disables.
  await window.evaluate(() => {
    ;(window as any).useStore.setState({ briefingFontSize: '5xl' })
  })
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
  await window.locator(SELECTORS.briefing.receiveDigestButton).click()
  await window.locator(SELECTORS.briefing.markdownBody).waitFor({ state: 'visible' })
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
  await window.locator(SELECTORS.briefing.receiveDigestButton).click()
  await window.locator(SELECTORS.briefing.generatedAt).waitFor({ state: 'visible' })
  const metaText = await window.locator(SELECTORS.briefing.generatedAt).innerText()
  expect(metaText).not.toContain('生成于')
  expect(metaText).toContain('08:32')
})

test('date column is visible and clicking a date item loads that briefing @smoke', async () => {
  const today = localToday()
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  seedBriefing(testLibraryPath, today)
  seedBriefing(testLibraryPath, yesterday, '## Yesterday\n\nYesterday briefing.')
  const coverPage = new CoverPage(window)
  await coverPage.gotoBriefing()
  const dateColumn = window.locator(SELECTORS.briefing.dateColumn)
  await expect(dateColumn).toBeVisible()
  await window.locator(SELECTORS.briefing.dateItem(yesterday)).click()
  await window.locator(SELECTORS.briefing.markdownBody).waitFor({ state: 'visible' })
  const pageText = await window.locator(SELECTORS.briefing.markdownBody).innerText()
  expect(pageText).toContain('Yesterday briefing.')
})

test('swap painting button is below header in academic layout @smoke', async () => {
  const today = localToday()
  seedBriefing(testLibraryPath, today)
  const coverPage = new CoverPage(window)
  await coverPage.gotoBriefing()
  await window.locator(SELECTORS.briefing.receiveDigestButton).click()
  await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible()
  const btn = window.locator(SELECTORS.briefing.swapPaintingButton)
  await expect(btn).toBeVisible()
  const headerBox = await window.locator('header').first().boundingBox()
  const btnBox = await btn.boundingBox()
  expect(btnBox!.y).toBeGreaterThan(headerBox!.y + headerBox!.height - 2)
})

test('date column is visible from empty state @smoke', async () => {
  const coverPage = new CoverPage(window)
  await coverPage.gotoBriefing()
  await expect(window.locator(SELECTORS.briefing.dateColumn)).toBeVisible()
})

test('date column is visible from error state @smoke', async () => {
  const today = localToday()
  seedBriefing(testLibraryPath, today, '## Error\n\nBRIEFING_NETWORK_ERROR')
  const coverPage = new CoverPage(window)
  await coverPage.gotoBriefing()
  await window.locator(SELECTORS.briefing.receiveDigestButton).click()
  await window.locator(SELECTORS.briefing.errorDisplay).waitFor({ state: 'visible' })
  await expect(window.locator(SELECTORS.briefing.dateColumn)).toBeVisible()
})

test('blog list column is visible when source is anthropic @smoke', async () => {
  seedStateJson(testConfigDir, { briefingSource: 'anthropic' })
  const coverPage = new CoverPage(window)
  await coverPage.gotoBriefing()
  await expect(window.locator(SELECTORS.briefing.anthropicPanel)).toBeVisible()
  await expect(window.locator(SELECTORS.briefing.listColumn)).toBeVisible()
  // The digest date column must NOT render for the anthropic source.
  await expect(window.locator(SELECTORS.briefing.dateColumn)).toHaveCount(0)
})

test('surface background and swap button are visible in anthropic source @smoke', async () => {
  seedStateJson(testConfigDir, { briefingSource: 'anthropic', briefingTheme: 'academic' })
  const coverPage = new CoverPage(window)
  await coverPage.gotoBriefing()
  await expect(window.locator(SELECTORS.briefing.surfaceBackground)).toBeVisible()
  // 页面级换画按钮已移除；anthropic 源的按钮由 AnthropicBlogPanel（空态）/ Reader（文章打开时）渲染。
  await expect(window.locator(SELECTORS.briefing.anthropicSwapPaintingButton)).toBeVisible()
})

test('anthropic article reader uses translucent academic background @smoke', async () => {
  const articlePath = seedAnthropicArticle(testLibraryPath, 'reader-bg-test', '背景透明度测试')
  seedStateJson(testConfigDir, {
    briefingSource: 'anthropic',
    briefingTheme: 'academic',
  })
  const coverPage = new CoverPage(window)
  await coverPage.gotoBriefing()
  await window.evaluate((path: string) => {
    return (window as any).useStore.getState().openAnthropicReader(path)
  }, articlePath)
  const reader = window.locator(SELECTORS.briefing.anthropicArticleReader)
  await expect(reader).toBeVisible()
  await expect(reader).toHaveClass(/bg-transparent/)
})
