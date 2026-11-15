import { test, expect } from '../fixtures/electron'
import type { Page } from '@playwright/test'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedBlogArticleWithCache } from '../helpers/test-library'
import { createMockServer } from '../helpers/mock-server'

async function openArticle(window: Page, libraryPath: string, configDir: string): Promise<void> {
  seedBlogArticleWithCache(libraryPath, configDir, {
    slug: 'e2e-right-rail-browser',
    title: 'E2E Right Rail Browser',
    body: '## 浏览器测试\n\n用于打开阅读右栏。',
  })
  const cover = new CoverPage(window)
  await cover.goToBriefing()
  await expect(window.locator(SELECTORS.briefing.anthropicPanel)).toBeVisible({ timeout: 10000 })
  await window.locator(`${SELECTORS.briefing.anthropicArticleRow}:has-text("E2E Right Rail Browser")`).click()
  await expect(window.locator(SELECTORS.briefing.anthropicArticleReader)).toBeVisible({ timeout: 15000 })
}

test.describe('@p1 阅读右栏浏览器', () => {
  test('本地网页导航、滚动、前进后退与刷新', async ({ window, testLibraryPath, testConfigDir }) => {
    const server = await createMockServer([
      { path: '/first', handler: (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end('<html><body><input aria-label="draft"><a href="/second">第二页</a></body></html>')
      } },
      { path: '/second', handler: (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end('<html><body><h1>第二页</h1><div style="height:1500px"></div><p id="bottom">底部</p></body></html>')
      } },
    ])
    try {
      await openArticle(window, testLibraryPath, testConfigDir)
      await window.locator('[data-testid="article-panel-tab-browser-anthropic"]').click()
      await window.locator('[data-testid="browser-address"]').fill(`${server.url}/first`)
      await window.locator('[data-testid="browser-address"]').press('Enter')
      await expect.poll(() => window.context().pages().some((page) => page.url() === `${server.url}/first`)).toBe(true)
      const browserPage = window.context().pages().find((page) => page.url() === `${server.url}/first`)!
      await browserPage.getByLabel('draft').fill('保留我')
      await browserPage.getByRole('link', { name: '第二页' }).click()
      await expect(browserPage.getByRole('heading', { name: '第二页' })).toBeVisible()
      await browserPage.locator('#bottom').scrollIntoViewIfNeeded()
      await expect(browserPage.locator('#bottom')).toBeVisible()
      await window.locator('[data-testid="browser-back"]').click()
      await expect.poll(() => browserPage.url()).toBe(`${server.url}/first`)
      await expect(browserPage.getByLabel('draft')).toHaveValue('保留我')
      await window.locator('[data-testid="browser-forward"]').click()
      await expect.poll(() => browserPage.url()).toBe(`${server.url}/second`)
      await window.locator('[data-testid="browser-reload"]').click()
      await expect(browserPage.getByRole('heading', { name: '第二页' })).toBeVisible()
    } finally {
      await server.close()
    }
  })
})
