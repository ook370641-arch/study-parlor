import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { reachableArticleRow } from '../helpers/test-library'

test.describe('右栏统一（导读|对照）', () => {
  test('博客右栏两 tab 渲染 + 切对照 tab 显示空态', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.locator(SELECTORS.briefing.sourceAnthropicButton).click()
    await expect(window.locator(SELECTORS.briefing.listColumn)).toBeVisible()

    // 处理新文章检测提示（触发抓取后列表才有可达文章）
    const prompt = window.locator(SELECTORS.briefing.anthropicNewArticlesPrompt)
    await prompt.waitFor({ timeout: 120000 }).catch(() => {})
    const promptVisible = await prompt.isVisible().catch(() => false)
    if (promptVisible) await prompt.click()

    const rows = window.locator(SELECTORS.briefing.anthropicArticleRow)
    await rows.first().waitFor({ timeout: 120000 })

    // 打开第一篇可达文章（跳过宪法置顶 + Product 源，后者在 E2E 无 VPN 环境不可达）
    const row = reachableArticleRow(window)
    await row.click()

    // 阅读器回填 body 后右栏才挂载 ArticleGuideTabs
    await window.locator(SELECTORS.briefing.anthropicArticleReader).waitFor({ state: 'visible', timeout: 120000 })

    // 两 tab 渲染（导读默认选中）
    await expect(window.locator('[data-testid="article-panel-tab-guide-anthropic"]')).toBeVisible()
    await expect(window.locator('[data-testid="article-panel-tab-companion-anthropic"]')).toBeVisible()

    // 切到对照 tab → 空态（未选择左侧文章时无对照内容）
    await window.locator('[data-testid="article-panel-tab-companion-anthropic"]').click()
    await expect(window.locator('[data-testid="article-companion-empty"]')).toBeVisible()
  })
})
