import { test, expect } from '../fixtures/electron'
import type { Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedBlogArticleWithCache, seedBook } from '../helpers/test-library'
import { createMockServer } from '../helpers/mock-server'
import { startApp, stopApp } from '../helpers/app-lifecycle'

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

  test('网页内查找、匹配导航与快捷键', async ({ window, testLibraryPath, testConfigDir }) => {
    const server = await createMockServer([
      { path: '/first', handler: (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end('<html><body><p>苏格拉底 一</p><p>苏格拉底 二</p><p>苏格拉底 三</p></body></html>')
      } },
    ])
    try {
      await openArticle(window, testLibraryPath, testConfigDir)
      await window.getByTestId('article-panel-tab-browser-anthropic').click()
      await window.getByTestId('browser-address').fill(`${server.url}/first`)
      await window.getByTestId('browser-address').press('Enter')
      await expect.poll(() => window.context().pages().some((page) => page.url() === `${server.url}/first`)).toBe(true)
      const browserPage = window.context().pages().find((page) => page.url() === `${server.url}/first`)!
      await expect(browserPage.getByText('苏格拉底 一')).toBeVisible()
      await window.getByTestId('browser-find-open').click()
      await window.getByTestId('browser-find-input').fill('苏格拉底')
      await expect(window.getByTestId('browser-find-count')).toHaveText('1 / 3')
      await window.getByTestId('browser-find-input').press('Enter')
      await expect(window.getByTestId('browser-find-count')).toHaveText('2 / 3')
      await window.getByTestId('browser-find-input').press('Shift+Enter')
      await expect(window.getByTestId('browser-find-count')).toHaveText('1 / 3')
      await window.getByTestId('browser-find-input').press('Escape')
      await expect(window.getByTestId('browser-find-input')).toHaveCount(0)
      await expect(window.getByTestId('browser-find-count')).toHaveCount(0)
      await window.getByTestId('browser-address').click()
      await window.keyboard.press('Control+F')
      await expect(window.getByTestId('browser-find-input')).toBeVisible()
      await window.getByTestId('browser-find-input').press('Escape')
      await expect(window.getByTestId('browser-find-input')).toHaveCount(0)
    } finally {
      await server.close()
    }
  })

  test('跨页签、来源与界面重载保持网页，启动只恢复地址', async ({ window, testLibraryPath, testConfigDir }) => {
    seedBook(testLibraryPath, { title: 'E2E Browser Book', chapters: [{ title: '第一章', body: '正文。' }] })
    const server = await createMockServer([
      { path: '/first', handler: (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end('<html><body><input aria-label="draft"></body></html>')
      } },
    ])
    try {
      await openArticle(window, testLibraryPath, testConfigDir)
      await window.getByTestId('article-panel-tab-browser-anthropic').click()
      await window.getByTestId('browser-address').fill(`${server.url}/first`)
      await window.getByTestId('browser-address').press('Enter')
      await expect.poll(() => window.context().pages().some((page) => page.url() === `${server.url}/first`)).toBe(true)
      const browserPage = window.context().pages().find((page) => page.url() === `${server.url}/first`)!
      await browserPage.getByLabel('draft').fill('保留我')

      await window.getByTestId('article-panel-tab-guide-anthropic').click()
      await window.getByTestId('article-panel-tab-browser-anthropic').click()
      await expect(browserPage.getByLabel('draft')).toHaveValue('保留我')
      await window.getByTestId('article-assistant-divider-toggle').click()
      await window.getByTestId('article-assistant-divider-toggle').click()
      await window.getByTestId('article-panel-tab-browser-anthropic').click()
      await expect(browserPage.getByLabel('draft')).toHaveValue('保留我')

      await window.getByTestId('briefing-source-book').click()
      await window.getByTestId('book-card-0').click()
      await window.getByTestId('chapter-row-0').click()
      await expect(window.getByTestId('book-chapter-body')).toContainText('正文。')
      await window.getByTestId('article-panel-tab-browser-book').click()
      await expect(browserPage.getByLabel('draft')).toHaveValue('保留我')
      await window.getByTestId('briefing-source-anthropic').click()
      await window.getByTestId('article-panel-tab-browser-anthropic').click()
      await expect(browserPage.getByLabel('draft')).toHaveValue('保留我')
      expect(browserPage.url()).toBe(`${server.url}/first`)

      await expect.poll(() => {
        const state = JSON.parse(fs.readFileSync(path.join(testConfigDir, 'state.json'), 'utf8'))
        return state.browserLastUrl
      }).toBe(`${server.url}/first`)
      server.clearRequests()
      await window.reload()
      const cover = new CoverPage(window)
      await cover.nameInput.or(cover.briefingButton).waitFor({ state: 'visible' })
      if (await cover.nameInput.isVisible()) await cover.enterName('E2E 测试员')
      await cover.goToBriefing()
      await window.getByTestId('briefing-source-anthropic').click()
      await expect(window.getByTestId('browser-view-placeholder')).toHaveCount(0)
      expect(server.requests).toHaveLength(0)
      await window.getByTestId('article-panel-tab-browser-anthropic').click()
      await expect(browserPage.getByLabel('draft')).toHaveValue('保留我')
    } finally {
      await server.close()
    }
  })

  test('完整应用重启后按需恢复最后地址与 Cookie', async ({ testLibraryPath, testConfigDir }) => {
    let restoredCookie = ''
    const server = await createMockServer([
      { path: '/first', handler: (req, res) => {
        restoredCookie = req.headers.cookie ?? ''
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Set-Cookie': 'browser_session=kept; Max-Age=86400; Path=/; HttpOnly' })
        res.end('<html><body><p>恢复页</p></body></html>')
      } },
    ])
    let electronApp: Awaited<ReturnType<typeof startApp>>['electronApp'] | undefined
    try {
      const first = await startApp({ testLibraryPath, testConfigDir })
      electronApp = first.electronApp
      await openArticle(first.window, testLibraryPath, testConfigDir)
      await first.window.getByTestId('article-panel-tab-browser-anthropic').click()
      await first.window.getByTestId('browser-address').fill(`${server.url}/first`)
      await first.window.getByTestId('browser-address').press('Enter')
      await expect.poll(() => first.window.context().pages().some((page) => page.url() === `${server.url}/first`)).toBe(true)
      const firstBrowserPage = first.window.context().pages().find((page) => page.url() === `${server.url}/first`)!
      await expect(firstBrowserPage.getByText('恢复页')).toBeVisible()
      await firstBrowserPage.reload()
      await expect.poll(() => restoredCookie).toContain('browser_session=kept')
      await stopApp(electronApp)
      electronApp = undefined

      server.clearRequests()
      restoredCookie = ''
      const second = await startApp({ testLibraryPath, testConfigDir })
      electronApp = second.electronApp
      const window = second.window
      const cover = new CoverPage(window)
      await cover.goToBriefing()
      await expect(window.getByTestId('article-panel-tab-browser-anthropic')).toBeVisible()
      await expect(window.getByTestId('browser-view-placeholder')).toHaveCount(0)
      expect(server.requests).toHaveLength(0)
      await window.getByTestId('article-panel-tab-browser-anthropic').click()
      await expect.poll(() => window.context().pages().some((page) => page.url() === `${server.url}/first`)).toBe(true)
      await expect(window.getByTestId('browser-address')).toHaveValue(`${server.url}/first`)
      expect(restoredCookie).toContain('browser_session=kept')
    } finally {
      await stopApp(electronApp)
      await server.close()
    }
  })
})
