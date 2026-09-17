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

    // 查看推荐理由（右栏推荐页也含“E2E 推荐理由（挂上：…）”，需用左栏展开态的完整前缀区分）
    await window.locator('[data-testid^="blog-collection-reason-"]').first().click()
    await expect(window.getByText('为什么推荐：E2E 推荐理由')).toBeVisible()

    // 移除推荐条目 → 空态
    await window.locator('[data-testid^="blog-collection-remove-"]').first().click()
    await expect(window.locator('[data-testid="blog-collection-empty"]')).toBeVisible()
  })

  test('推荐完成右栏自动出推荐页（核心方向/导读），手动已读入夹，批次可删除', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.locator(SELECTORS.briefing.sourceAnthropicButton).click()

    // 触发推荐 mock → 右栏自动切到推荐页
    await window.locator('[data-testid="blog-recommend-button"]').click()
    await expect(window.locator('[data-testid="blog-rec-view"]')).toBeVisible({ timeout: 15000 })
    await expect(window.getByText('E2E 核心方向')).toBeVisible()
    await expect(window.getByText('E2E 导读摘要')).toBeVisible()
    await expect(window.getByText(/E2E 推荐理由/)).toBeVisible()

    // 推荐页卡片手动标已读 → 已读夹出现
    await window.locator('[data-testid^="blog-rec-read-"]').first().click()
    await expect(window.locator('[data-testid="blog-read-toggle"]')).toBeVisible({ timeout: 5000 })
    await expect(window.locator('[data-testid="blog-read-toggle"]')).toContainText('已读（1）')

    // 删除本批 → 推荐页回空态，已读夹不受影响
    await window.locator('[data-testid="blog-rec-delete-batch"]').click()
    await expect(window.locator('[data-testid="blog-rec-empty"]')).toBeVisible()
    await expect(window.locator('[data-testid="blog-read-toggle"]')).toContainText('已读（1）')
  })

  test('推荐记录固定入口 + 已读/收藏互斥搬家', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.locator(SELECTORS.briefing.sourceAnthropicButton).click()

    // 博客图标实体色（源标识）
    await expect(
      window.locator('[data-testid="briefing-source-icon-anthropic"] path').first()
    ).toHaveAttribute('fill', '#d97757')

    // 推荐 mock → 右栏自动出推荐页；关闭后可通过固定入口回来
    await window.locator('[data-testid="blog-recommend-button"]').click()
    await expect(window.locator('[data-testid="blog-rec-view"]')).toBeVisible({ timeout: 15000 })
    await window.locator('[data-testid="blog-rec-close"]').click()
    await expect(window.locator('[data-testid="blog-rec-view"]')).toBeHidden()
    await window.locator('[data-testid="blog-rec-history"]').click()
    await expect(window.locator('[data-testid="blog-rec-view"]')).toBeVisible()

    // 互斥：pick 初始在收藏夹（推荐自动入夹）；标已读 → 出收藏夹、入已读
    await window.locator('[data-testid^="blog-rec-read-"]').first().click()
    await window.locator('[data-testid="blog-rec-close"]').click()
    await expect(window.locator('[data-testid="blog-read-toggle"]')).toContainText('已读（1）')
    await expect(window.locator('[data-testid="blog-collection-empty"]')).toBeVisible()
  })

  test('阅读器顶部 ★/✓ 标记当前文章并互斥', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.locator(SELECTORS.briefing.sourceAnthropicButton).click()

    await window.locator('[data-testid="blog-recommend-button"]').click()
    await expect(window.locator('[data-testid="blog-rec-view"]')).toBeVisible({ timeout: 15000 })

    // 从推荐页打开文章 → 阅读器出现 ★/✓；推荐已自动入夹 → ★ 激活
    await window.locator('[data-testid^="blog-rec-pick-"]').first().click()
    await expect(window.locator('[data-testid="anthropic-article-reader"]')).toBeVisible()
    await expect(window.locator('[data-testid="blog-reader-fav"]')).toHaveAttribute('aria-pressed', 'true')
    await expect(window.locator('[data-testid="blog-reader-read"]')).toHaveAttribute('aria-pressed', 'false')

    // 点 ✓ → 搬家：✓ 激活、★ 退激活
    await window.locator('[data-testid="blog-reader-read"]').click()
    await expect(window.locator('[data-testid="blog-reader-read"]')).toHaveAttribute('aria-pressed', 'true')
    await expect(window.locator('[data-testid="blog-reader-fav"]')).toHaveAttribute('aria-pressed', 'false')

    // 再点 ✓ 取消已读（不自动回收藏夹）
    await window.locator('[data-testid="blog-reader-read"]').click()
    await expect(window.locator('[data-testid="blog-reader-read"]')).toHaveAttribute('aria-pressed', 'false')
    await expect(window.locator('[data-testid="blog-reader-fav"]')).toHaveAttribute('aria-pressed', 'false')
  })
})
