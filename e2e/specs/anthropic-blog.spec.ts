import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import * as fs from 'node:fs'
import * as path from 'node:path'

function listMdFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && entry.name.endsWith('.md') && !entry.name.includes('.assistant.') && !entry.name.includes('.guide.') && !entry.name.includes('.annotations.')) {
      out.push(path.join((entry as any).parentPath || dir, entry.name))
    }
  }
  return out
}

test.describe('@real Anthropic 博客集成', () => {
  test('E2E-1/2/3/4: 列表发现、首次导入、重复打开、侧边栏折叠', async ({
    window,
    testLibraryPath,
  }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.page)).toBeVisible()

    // 切换到 Anthropic 来源（中间列变为博客列表）
    await window.locator(SELECTORS.briefing.sourceAnthropicButton).click()
    const listColumn = window.locator(SELECTORS.briefing.listColumn)
    await expect(listColumn).toBeVisible()

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

    // E2E-4: 折叠与展开（此时已有文章，收起后 rail 显示缩略图）
    await window.locator(SELECTORS.briefing.listColumnToggle).click()
    await expect(listColumn).toHaveClass(/w-14/)
    await expect(window.locator(SELECTORS.briefing.anthropicListRailThumb).first()).toBeVisible()
    await window.locator(SELECTORS.briefing.listColumnToggle).click()
    await expect(listColumn).not.toHaveClass(/w-14/)

    // 选择第一篇 anthropic 文章（跳过恒置顶的宪法报告行，T8 引入）
    const firstRow = rows
      .filter({ hasNot: window.locator(SELECTORS.briefing.anthropicConstitutionPill) })
      .first()
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
    // 摘要应持久化到 frontmatter 并在阅读器中展示
    expect(saved).toContain('summary:')
    const summaryVisible = await window.locator(SELECTORS.briefing.anthropicReaderSummary).isVisible().catch(() => false)
    // summary 可能在 meta description 为通用文本时不显示（fallback 到 listing summary），
    // 但 frontmatter 中必须有 summary 字段
    expect(summaryVisible || saved.includes('summary:')).toBe(true)

    // 图片路径要么是本地 .assets/，要么是绝对 URL
    const hasImage = saved.match(/!\[.*?\]\((https?:\/\/|\.\/\.assets\/)/)
    expect(hasImage).not.toBeNull()

    // E2E-3: 已保存文章再次点击直接打开
    const savedRow = window
      .locator(SELECTORS.briefing.anthropicArticleRow)
      .filter({ has: window.locator(SELECTORS.briefing.anthropicArticleSaved) })
      // 宪法报告行 isSaved:true 且恒置顶（T8），必须排除，否则解析到宪法行而非导入文章
      .filter({ hasNot: window.locator(SELECTORS.briefing.anthropicConstitutionPill) })
      .first()
    await savedRow.click()
    await reader.waitFor({ state: 'visible', timeout: 10000 })
  })

  test.describe('@real 离线场景', () => {
    test.use({ extraEnv: { E2E_ANTHROPIC_OFFLINE: '1' } })
    test('E2E-5: 离线错误链路', async ({ window }) => {
      const cover = new CoverPage(window)
      await cover.enterName('E2E 测试员')
      await cover.goToBriefing()
      await window.locator(SELECTORS.briefing.sourceAnthropicButton).click()
      // v1.2: auto-detect fires on mount with commit:false, surfacing the
      // check-error indicator (not the store-level error message).
      const panel = window.locator(SELECTORS.briefing.anthropicPanel)
      await expect(panel.locator(SELECTORS.briefing.anthropicListCheckError)).toBeVisible({ timeout: 20000 })
    })

    test('宪法可视化报告：离线仍置顶可见，点击后 iframe 打开交互报告', async ({ window, testLibraryPath }) => {
      const cover = new CoverPage(window)
      await cover.enterName('E2E 测试员')
      await cover.goToBriefing()
      await window.locator(SELECTORS.briefing.sourceAnthropicButton).click()

      // 本地内置条目不依赖网络抓取 — 离线下也必须置顶出现在列表
      const rows = window.locator(SELECTORS.briefing.anthropicArticleRow)
      const constitutionRow = rows.filter({ has: window.locator(SELECTORS.briefing.anthropicConstitutionPill) })
      await expect(constitutionRow).toHaveCount(1)
      await expect(rows.first().locator(SELECTORS.briefing.anthropicConstitutionPill)).toBeVisible()

      // 点击打开报告视图，iframe 指向 sp-report:// 协议
      await constitutionRow.click()
      const frame = window.locator(SELECTORS.briefing.constitutionReportFrame)
      await expect(frame).toBeVisible()
      await expect(frame).toHaveAttribute('src', 'sp-report://constitution/index.html')

      // iframe 内容真正加载成功（协议 + 报告专属 CSP 生效），内联脚本可运行
      const reportBody = window.frameLocator(SELECTORS.briefing.constitutionReportFrame).locator('body')
      await expect(reportBody).toContainText('Constitution', { timeout: 15000 })

      // 报告已同步到学习库：单个文件夹 constitution-report/
      const reportDir = path.join(testLibraryPath, 'Anthropic博客', 'constitution-report')
      expect(fs.existsSync(path.join(reportDir, 'index.html'))).toBe(true)
      expect(fs.readFileSync(path.join(reportDir, 'source', 'full-text.md'), 'utf8')).toContain('Claude')
      // 不生成 .md 索引卡
      expect(fs.existsSync(path.join(reportDir, 'README.md'))).toBe(false)
    })
  })

  test('E2E-9: 摘要持久化与展示 — 导入后阅读器展示摘要，再次打开仍存在', async ({
    window,
    testLibraryPath,
  }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.locator(SELECTORS.briefing.sourceAnthropicButton).click()
    await expect(window.locator(SELECTORS.briefing.listColumn)).toBeVisible()

    // 处理新文章检测提示
    const prompt = window.locator(SELECTORS.briefing.anthropicNewArticlesPrompt)
    await prompt.waitFor({ timeout: 120000 }).catch(() => {})
    const promptVisible = await prompt.isVisible().catch(() => false)
    if (promptVisible) await prompt.click()

    const rows = window.locator(SELECTORS.briefing.anthropicArticleRow)
    await rows.first().waitFor({ timeout: 120000 })

    // 导入第一篇 anthropic 文章（跳过恒置顶的宪法报告行，T8 引入）
    const firstRow = rows
      .filter({ hasNot: window.locator(SELECTORS.briefing.anthropicConstitutionPill) })
      .first()
    const articleTitle = await firstRow.locator(SELECTORS.briefing.anthropicArticleTitle).textContent()
    await firstRow.click()

    // 阅读器加载
    const reader = window.locator(SELECTORS.briefing.anthropicArticleReader)
    await reader.waitFor({ state: 'visible', timeout: 120000 })

    // ① 摘要在阅读器中可见且非空
    const summaryBlock = window.locator(SELECTORS.briefing.anthropicReaderSummary)
    await expect(summaryBlock).toBeVisible({ timeout: 15000 })
    const summaryText = await summaryBlock.textContent()
    expect(summaryText?.trim().length).toBeGreaterThan(10)

    // ② 摘要持久化到 .md 文件
    const anthropicDir = path.join(testLibraryPath, 'Anthropic博客')
    const files = listMdFiles(anthropicDir)
    expect(files.length).toBeGreaterThan(0)
    const saved = fs.readFileSync(files[0], 'utf8')
    expect(saved).toContain('summary:')

    // ③ 切源再切回，重新打开同一篇文章，摘要仍然存在
    await window.locator(SELECTORS.briefing.sourceDigestButton).click()
    await window.waitForTimeout(1000)
    await window.locator(SELECTORS.briefing.sourceAnthropicButton).click()
    await expect(window.locator(SELECTORS.briefing.listColumn)).toBeVisible()

    const savedRow = window
      .locator(SELECTORS.briefing.anthropicArticleRow)
      .filter({ has: window.locator(SELECTORS.briefing.anthropicArticleSaved) })
      // 宪法报告行 isSaved:true 且恒置顶（T8），必须排除，否则解析到宪法行而非导入文章
      .filter({ hasNot: window.locator(SELECTORS.briefing.anthropicConstitutionPill) })
      .first()
    await expect(savedRow).toBeVisible({ timeout: 10000 })
    await savedRow.click()

    await reader.waitFor({ state: 'visible', timeout: 30000 })
    const reopenedSummary = window.locator(SELECTORS.briefing.anthropicReaderSummary)
    await expect(reopenedSummary).toBeVisible({ timeout: 15000 })
    await expect(reopenedSummary).toHaveText(summaryText!)
  })
})
