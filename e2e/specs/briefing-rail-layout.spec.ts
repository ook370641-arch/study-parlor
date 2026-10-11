import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'

test.describe('@p2 briefing rail layout', () => {
  test('rail bottom hosts controls; font-size controls are top-right', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.page)).toBeVisible()

    const rail = window.locator(SELECTORS.briefing.sourceSidebar)
    await expect(rail).toBeVisible()

    // 轨道底部：返回封面 + 主题切换
    const controls = window.locator(SELECTORS.briefing.railControls)
    await expect(controls).toBeVisible()
    await expect(controls.locator(SELECTORS.briefing.themeToggle)).toBeVisible()
    await expect(controls.locator('[data-testid="briefing-back-to-cover"]')).toBeVisible()

    // 字号控制在博客来源阅读区右上角（空态也渲染——全局 Chrome 不依赖内容状态）
    await window.locator(SELECTORS.briefing.sourceAnthropicButton).click()
    await expect(window.locator(SELECTORS.briefing.fontSizeDecrease)).toBeVisible()
    await expect(window.locator(SELECTORS.briefing.fontSizeIncrease)).toBeVisible()
  })

  test('academic vs newspaper rail surface differs', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.page)).toBeVisible()

    // 学术：透明毛边圆角边框；报纸：实底浅色
    const rail = window.locator(SELECTORS.briefing.sourceSidebar)
    await expect(rail).toHaveClass(/rounded-xl/)
    await expect(rail).not.toHaveClass(/bg-\[#e8e4de\]/)

    await window.locator(SELECTORS.briefing.themeToggle).click()
    await expect(window.locator(SELECTORS.briefing.page)).toHaveClass(/bg-white/, { timeout: 10000 })
    await expect(rail).toHaveClass(/bg-\[#e8e4de\]/)
    await expect(rail).not.toHaveClass(/rounded-xl/)
  })
})
