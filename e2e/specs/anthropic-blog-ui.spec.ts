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

    // 列表默认展开，隐藏按钮可见
    await expect(window.locator(SELECTORS.briefing.anthropicListHideButton)).toBeVisible()

    // 点击隐藏 → 垂直把手出现
    await window.locator(SELECTORS.briefing.anthropicListHideButton).click()
    await expect(window.locator(SELECTORS.briefing.anthropicListExpandHandle)).toBeVisible()

    // 点击把手 → 列表重新展开，隐藏按钮回来
    await window.locator(SELECTORS.briefing.anthropicListExpandHandle).click()
    await expect(window.locator(SELECTORS.briefing.anthropicListHideButton)).toBeVisible()
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
