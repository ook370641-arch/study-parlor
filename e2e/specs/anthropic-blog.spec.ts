import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import * as fs from 'node:fs'
import * as path from 'node:path'

function listMdFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(path.join((entry as any).parentPath || dir, entry.name))
    }
  }
  return out
}

test.describe('Anthropic 博客集成', () => {
  test('E2E-1/2/3/4: 列表发现、首次导入、重复打开、侧边栏折叠', async ({
    window,
    testLibraryPath,
  }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.page)).toBeVisible()

    // E2E-4: 折叠与展开
    const sidebar = window.locator(SELECTORS.briefing.sourceSidebar)
    await expect(sidebar).toBeVisible()
    await window.locator(SELECTORS.briefing.sourceSidebarToggle).click()
    await expect(sidebar).toHaveClass(/w-14/)
    await window.locator(SELECTORS.briefing.sourceAnthropicButton).click()
    await expect(sidebar).not.toHaveClass(/w-14/)

    // E2E-1: 列表发现（v1.2 UI：自动检测 + 新文章提示条）
    // 点击自动检测发现的新文章提示条
    const prompt = window.locator(SELECTORS.briefing.anthropicNewArticlesPrompt)
    await prompt.waitFor({ timeout: 120000 }).catch(() => {
      // If no new articles detected (all cached), use existing articles
    })
    const promptVisible = await prompt.isVisible().catch(() => false)
    if (promptVisible) {
      await prompt.click()
    }
    const rows = window.locator(SELECTORS.briefing.anthropicArticleRow)
    await rows.first().waitFor({ timeout: 120000 })
    expect(await rows.count()).toBeGreaterThan(0)

    // 选择第一篇未保存文章
    const firstRow = rows.first()
    const title = await firstRow.locator(SELECTORS.briefing.anthropicArticleTitle).textContent()
    expect(title).toBeTruthy()
    await firstRow.click()

    // E2E-2: 首次导入后自动打开阅读器
    const reader = window.locator(SELECTORS.briefing.anthropicArticleReader)
    await reader.waitFor({ state: 'visible', timeout: 120000 })
    const readerTitle = await window.locator(SELECTORS.briefing.anthropicReaderTitle).textContent()
    expect(readerTitle).toBeTruthy()

    // 检查本地归档
    const anthropicDir = path.join(testLibraryPath, 'Anthropic博客')
    await expect.poll(() => fs.existsSync(anthropicDir)).toBe(true)
    const files = listMdFiles(anthropicDir)
    expect(files.length).toBeGreaterThan(0)
    const saved = fs.readFileSync(files[0], 'utf8')
    expect(saved).toContain('source_url:')
    expect(saved).toContain('published_at:')

    // 图片路径要么是本地 .assets/，要么是绝对 URL
    const hasImage = saved.match(/!\[.*?\]\((https?:\/\/|\.\/\.assets\/)/)
    expect(hasImage).not.toBeNull()

    // 关闭阅读器
    await window.locator(SELECTORS.briefing.anthropicReaderClose).click()
    await expect(reader).toBeHidden()

    // E2E-3: 已保存文章再次点击直接打开
    const savedRow = window
      .locator(SELECTORS.briefing.anthropicArticleRow)
      .filter({ has: window.locator(SELECTORS.briefing.anthropicArticleSaved) })
      .first()
    await savedRow.click()
    await reader.waitFor({ state: 'visible', timeout: 10000 })
    await window.locator(SELECTORS.briefing.anthropicReaderClose).click()
  })

  test.describe('离线场景', () => {
    test.use({ extraEnv: { E2E_ANTHROPIC_OFFLINE: '1' } })
    test('E2E-5: 离线错误链路', async ({ window }) => {
      const cover = new CoverPage(window)
      await cover.enterName('E2E 测试员')
      await cover.goToBriefing()
      await window.locator(SELECTORS.briefing.sourceAnthropicButton).click()
      // v1.2: auto-detect fires on mount, error should appear in panel
      const panel = window.locator(SELECTORS.briefing.anthropicPanel)
      await expect(panel.locator(SELECTORS.briefing.anthropicErrorMessage)).toBeVisible({ timeout: 20000 })
    })
  })
})
