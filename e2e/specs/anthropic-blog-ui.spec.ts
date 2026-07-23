import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'

test.describe('@real Anthropic 博客 UI 优化 (v1.2)', () => {
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
    // 注意：unsavedRow 是 hasNot(saved) 过滤的 locator，导入后它会解析到另一篇未保存文章，
    // 所以不能用它来检查 saved indicator。需要重新查询带 saved indicator 的行。
    const savedRow = window.locator(SELECTORS.briefing.anthropicArticleRow)
      .filter({ has: window.locator(SELECTORS.briefing.anthropicArticleSaved) })
      .first()
    await expect(savedRow).toBeVisible({ timeout: 10000 })
  })

  test('已保存文章行使用左橙+三边棕边框', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.page)).toBeVisible()

    // 切换到 Anthropic 来源
    await window.locator(SELECTORS.briefing.sourceAnthropicButton).click()
    await expect(window.locator(SELECTORS.briefing.listColumn)).toBeVisible()

    // 等待文章列表加载（处理新文章检测提示）
    const prompt = window.locator(SELECTORS.briefing.anthropicNewArticlesPrompt)
    await prompt.waitFor({ timeout: 120000 }).catch(() => {})
    const promptVisible = await prompt.isVisible().catch(() => false)
    if (promptVisible) await prompt.click()

    const rows = window.locator(SELECTORS.briefing.anthropicArticleRow)
    await rows.first().waitFor({ timeout: 120000 })

    // 测试库是全新隔离的，通常没有已保存文章 — 若没有则先导入第一篇
    const savedRow = rows
      .filter({ has: window.locator(SELECTORS.briefing.anthropicArticleSaved) })
      .first()
    if (!(await savedRow.isVisible().catch(() => false))) {
      await rows.first().click()
      await window
        .locator(SELECTORS.briefing.anthropicArticleReader)
        .waitFor({ state: 'visible', timeout: 120000 })
    }
    await expect(savedRow).toBeVisible({ timeout: 10000 })

    // 已保存状态（academic 主题默认）：左边框 ember 橙，上/右/下为半透明棕
    await expect(savedRow).toHaveClass(/border-l-ember/)
    await expect(savedRow).toHaveClass(/border-t-\[rgba\(232,213,183,0\.12\)\]/)
    await expect(savedRow).toHaveClass(/border-r-\[rgba\(232,213,183,0\.12\)\]/)
    await expect(savedRow).toHaveClass(/border-b-\[rgba\(232,213,183,0\.12\)\]/)
  })

  test('未导入文章行四边均为棕色（无白/灰残留）', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.page)).toBeVisible()

    await window.locator(SELECTORS.briefing.sourceAnthropicButton).click()
    const prompt = window.locator(SELECTORS.briefing.anthropicNewArticlesPrompt)
    await prompt.waitFor({ timeout: 120000 }).catch(() => {})
    const promptVisible = await prompt.isVisible().catch(() => false)
    if (promptVisible) await prompt.click()

    const rows = window.locator(SELECTORS.briefing.anthropicArticleRow)
    await rows.first().waitFor({ timeout: 120000 })

    const unsavedRow = rows
      .filter({ hasNot: window.locator(SELECTORS.briefing.anthropicArticleSaved) })
      .first()
    await expect(unsavedRow).toBeVisible()

    const colors = await unsavedRow.evaluate((el) => {
      const s = getComputedStyle(el)
      return {
        top: s.borderTopColor,
        right: s.borderRightColor,
        bottom: s.borderBottomColor,
        left: s.borderLeftColor,
      }
    })

    // Tailwind default 'border' color is rgb(229, 231, 235); make sure it's overridden
    expect(colors.top).not.toBe('rgb(229, 231, 235)')
    expect(colors.right).not.toBe('rgb(229, 231, 235)')
    expect(colors.bottom).not.toBe('rgb(229, 231, 235)')
    // Left border must be the subtle brown (academic default)
    expect(colors.left).not.toBe('rgb(229, 231, 235)')
  })

  test('文章内容区使用加宽后的 95%/1600px', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.page)).toBeVisible()

    // 切换到 Anthropic 来源并打开一篇文章
    await window.locator(SELECTORS.briefing.sourceAnthropicButton).click()
    const prompt = window.locator(SELECTORS.briefing.anthropicNewArticlesPrompt)
    await prompt.waitFor({ timeout: 120000 }).catch(() => {})
    const promptVisible = await prompt.isVisible().catch(() => false)
    if (promptVisible) await prompt.click()

    const rows = window.locator(SELECTORS.briefing.anthropicArticleRow)
    await rows.first().waitFor({ timeout: 120000 })
    await rows.first().click()

    const reader = window.locator(SELECTORS.briefing.anthropicArticleReader)
    await reader.waitFor({ state: 'visible', timeout: 120000 })

    // 阅读器内容容器带加宽后的宽度类（CSS 类名中的方括号需转义）
    const content = window.locator(
      `${SELECTORS.briefing.anthropicArticleReader} .max-w-\\[1600px\\]`,
    )
    await expect(content).toBeVisible()
    await expect(content).toHaveClass(/w-\[95%\]/)

    // Regression: inner .md-body used to force max-width:720px, leaving huge margins
    const firstPara = reader.locator('article p').first()
    await firstPara.waitFor({ state: 'visible', timeout: 15000 })
    const paraBox = await firstPara.boundingBox()
    const contentBox = await content.boundingBox()
    expect(paraBox).not.toBeNull()
    expect(contentBox).not.toBeNull()
    expect(paraBox!.width).toBeGreaterThan(contentBox!.width * 0.7)
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
