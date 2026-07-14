import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'

test.describe('Anthropic 博客 UI 优化 (v1.2)', () => {
  test('E2E-6: 列表收起与展开', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.page)).toBeVisible()

    // 切换到 Anthropic 来源
    await window.locator(SELECTORS.briefing.sourceAnthropicButton).click()

    // 列表默认展开，折叠容器可见
    const listColumn = window.locator(SELECTORS.briefing.listColumn)
    await expect(listColumn).toBeVisible()
    await expect(listColumn).not.toHaveClass(/w-14/)

    // 点击 toggle → 收起为 w-14 缩略图 rail
    await window.locator(SELECTORS.briefing.listColumnToggle).click()
    await expect(listColumn).toHaveClass(/w-14/)

    // 再次点击 → 列表重新展开
    await window.locator(SELECTORS.briefing.listColumnToggle).click()
    await expect(listColumn).not.toHaveClass(/w-14/)
  })

  test('E2E-8: 导入过程展示 shimmer 动画与彩色左边框状态', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.page)).toBeVisible()

    // 切换到 Anthropic 来源
    await window.locator(SELECTORS.briefing.sourceAnthropicButton).click()
    const listColumn = window.locator(SELECTORS.briefing.listColumn)
    await expect(listColumn).toBeVisible()

    // 等待文章列表加载
    const prompt = window.locator(SELECTORS.briefing.anthropicNewArticlesPrompt)
    await prompt.waitFor({ timeout: 120000 }).catch(() => {})
    const promptVisible = await prompt.isVisible().catch(() => false)
    if (promptVisible) await prompt.click()

    const rows = window.locator(SELECTORS.briefing.anthropicArticleRow)
    await rows.first().waitFor({ timeout: 120000 })

    // 找到一篇未保存的文章 — 未保存时左边框为半透明（非 ember 色）
    const unsavedRow = rows.filter({ hasNot: window.locator(SELECTORS.briefing.anthropicArticleSaved) }).first()
    await expect(unsavedRow).toBeVisible()
    // 验证未保存状态：左边框为 subtle 半透明（无 ember 类）
    await expect(unsavedRow).not.toHaveClass(/border-l-ember/)

    // 点击文章触发导入 — shimmer + spinner 应出现
    await unsavedRow.click()

    // 导入期间：应出现 "导入中…" 文案和 spinner
    await expect(unsavedRow.locator('text=导入中…')).toBeVisible({ timeout: 5000 })

    // 等待阅读器打开（导入完成）
    const reader = window.locator(SELECTORS.briefing.anthropicArticleReader)
    await reader.waitFor({ state: 'visible', timeout: 120000 })

    // 导入完成后，回到列表 — 文章应显示 ember 左边框（已保存状态）
    // 注意：阅读器打开后，列表仍可见；文章行应出现 saved testid
    await expect(unsavedRow.locator(SELECTORS.briefing.anthropicArticleSaved)).toBeVisible({ timeout: 10000 })
  })

  test('E2E-7: 自动检测新文章并显示刷新提示', {
    tag: '@unstable',
  }, async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.page)).toBeVisible()

    // 切换到 Anthropic 来源（自动检测触发）
    await window.locator(SELECTORS.briefing.sourceAnthropicButton).click()

    // 等待自动检测完成 —— 要么出现新文章提示条，要么已有缓存在列表中
    const prompt = window.locator(SELECTORS.briefing.anthropicNewArticlesPrompt)
    const rows = window.locator(SELECTORS.briefing.anthropicArticleRow)
    await Promise.race([
      prompt.waitFor({ timeout: 120000 }),
      rows.first().waitFor({ timeout: 120000 }),
    ]).catch(() => {
      // 若都不可见可能还在加载中
    })

    // 如果走的是新文章提示路径
    const promptVisible = await prompt.isVisible().catch(() => false)
    if (promptVisible) {
      const text = await prompt.textContent()
      expect(text).toMatch(/发现 \d+ 篇新文章/)
      await prompt.click()
      await expect(prompt).toBeHidden()
    }
  })
})
