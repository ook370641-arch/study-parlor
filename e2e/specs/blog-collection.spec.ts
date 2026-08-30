import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'

test.describe('博客收藏夹与推荐', () => {
  test.use({ extraEnv: { E2E_ANTHROPIC_RECOMMEND: '1' } })

  test('收藏夹区渲染、推荐 mock 产出、理由展开、移除→空态', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.locator(SELECTORS.briefing.sourceAnthropicButton).click()

    // UI 出口：收藏夹区与推荐按钮
    await expect(window.locator('[data-testid="blog-collection-section"]')).toBeVisible()
    await expect(window.locator('[data-testid="blog-recommend-button"]')).toBeVisible()
    await expect(window.locator('[data-testid="blog-collection-empty"]')).toBeVisible()

    // 触发推荐（E2E mock 分支：不触网，确定性产出 1 条）
    await window.locator('[data-testid="blog-recommend-button"]').click()
    await expect(window.locator('[data-testid^="blog-collection-open-"]').first()).toBeVisible({ timeout: 15000 })

    // 查看推荐理由
    await window.locator('[data-testid^="blog-collection-reason-"]').first().click()
    await expect(window.getByText('E2E 推荐理由')).toBeVisible()

    // 移除推荐条目 → 空态
    await window.locator('[data-testid^="blog-collection-remove-"]').first().click()
    await expect(window.locator('[data-testid="blog-collection-empty"]')).toBeVisible()
  })

  test('历史卡片展示核心方向与逐篇挂钩，打开后自动进已读夹', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.locator(SELECTORS.briefing.sourceAnthropicButton).click()

    // 触发推荐 mock
    await window.locator('[data-testid="blog-recommend-button"]').click()
    await expect(window.locator('[data-testid^="blog-collection-open-"]').first()).toBeVisible({ timeout: 15000 })

    // 历史卡片：核心方向 + 逐篇条目
    await window.locator('[data-testid="blog-recommend-history"]').click()
    await expect(window.getByText('E2E 核心方向')).toBeVisible()
    const pick = window.locator('[data-testid^="blog-history-pick-"]').first()
    await expect(pick).toBeVisible()
    await expect(window.getByText(/E2E 推荐理由/)).toBeVisible()

    // 打开逐篇条目 → 自动已读
    await pick.click()
    await expect(window.locator('[data-testid="blog-read-toggle"]')).toBeVisible({ timeout: 5000 })
    await expect(window.locator('[data-testid="blog-read-toggle"]')).toContainText('已读（1）')

    // 展开已读夹 → 移出
    await window.locator('[data-testid="blog-read-toggle"]').click()
    await expect(window.locator('[data-testid^="blog-read-open-"]').first()).toBeVisible()
    await window.locator('[data-testid^="blog-read-remove-"]').first().click()
    await expect(window.locator('[data-testid="blog-read-toggle"]')).toHaveCount(0)
  })
})
