import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedWritingTree } from '../helpers/test-library'

test.describe('@p1 lighting layer', () => {
  test('briefing settings entry opens settings and returns', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.page)).toBeVisible()

    await window.locator('[data-testid="briefing-settings-button"]').click()
    await expect(window.locator(SELECTORS.settings.page)).toBeVisible()
    await window.locator(SELECTORS.settings.backButton).click()
    await expect(window.locator(SELECTORS.briefing.page)).toBeVisible()
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

  test('newspaper theme: settings entry remains available', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.page)).toBeVisible()

    await window.locator('[data-testid="briefing-theme-toggle"]').click()
    await expect(window.locator(SELECTORS.briefing.page)).toHaveClass(/bg-white/, { timeout: 10000 })
    await expect(window.locator('[data-testid="briefing-settings-button"]')).toBeVisible()
  })
})
