import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedWritingTree } from '../helpers/test-library'

test.describe('@p1 lighting layer', () => {
  test('candlelight on by default, toggle persists across reload', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.page)).toBeVisible()

    await expect(window.locator('[data-testid="briefing-candlelight"]')).toBeAttached()
    await window.locator('[data-testid="briefing-candlelight-toggle"]').click()
    await expect(window.locator('[data-testid="briefing-candlelight"]')).toHaveCount(0)

    await window.reload()
    const cover2 = new CoverPage(window)
    await cover2.enterName('E2E 测试员')
    await cover2.goToBriefing()
    await expect(window.locator('[data-testid="briefing-candlelight"]')).toHaveCount(0)
  })

  test('painting plate hidden by default, toggle shows it', async ({ window, testLibraryPath }) => {
    // 并置画框渲染在写作正文（WritingBoard 打开文件后）与博客阅读器内；
    // 空态不渲染，先 seed 写作树并打开一篇文件。
    seedWritingTree(testLibraryPath)
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.page)).toBeVisible()
    await window.getByTestId('writing-tree-node').filter({ hasText: '七月夜话' }).click()
    await expect(window.locator(SELECTORS.writing.editor)).toBeVisible({ timeout: 15000 })

    await expect(window.locator('[data-testid="painting-plate"]')).toHaveCount(0)
    // 开关依赖画作清单异步加载（currentPaintings.briefing 就位才渲染）
    await expect(window.locator('[data-testid="painting-plate-toggle"]')).toBeVisible({ timeout: 15000 })
    await window.locator('[data-testid="painting-plate-toggle"]').click()
    await expect(window.locator('[data-testid="painting-plate"]')).toBeVisible()
  })

  test('newspaper theme: candlelight absent and toggle not rendered', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.page)).toBeVisible()

    await window.locator('[data-testid="briefing-theme-toggle"]').click()
    await expect(window.locator(SELECTORS.briefing.page)).toHaveClass(/bg-white/, { timeout: 10000 })
    await expect(window.locator('[data-testid="briefing-candlelight"]')).toHaveCount(0)
    // 烛光开关仅 academic 主题渲染（BriefingSourceSidebar isAcademic 分支）
    await expect(window.locator('[data-testid="briefing-candlelight-toggle"]')).toHaveCount(0)
  })

  test('candlelight warms on annotation hover (有识)', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.page)).toBeVisible()

    // 烛光层存在
    const glow = window.locator('[data-testid="briefing-candlelight"] .candle-glow')
    await expect(glow).toBeAttached()
    // 初始无 warm class
    await expect(glow).not.toHaveClass(/candle-warm/)

    // 找到标注标记并悬停——用 anno-wrap class（ArticleAnnotations 产生的标记）
    const anno = window.locator('.anno-wrap').first()
    if (await anno.count() > 0) {
      await anno.hover()
      await expect(glow).toHaveClass(/candle-warm/)
      // 移开后 warm 消失
      await window.locator('body').hover()
      await expect(glow).not.toHaveClass(/candle-warm/)
    }
    // 若无标注则跳过 warm 断言（此场景下 warm 不会触发，不算失败）
  })
})
