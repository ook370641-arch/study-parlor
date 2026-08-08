import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { seedBriefing } from '../helpers/test-library'
import { SELECTORS } from '../helpers/selectors'

function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

test.describe('@p2 briefing rail layout', () => {
  test('rail bottom hosts controls; font-size controls are top-right', async ({ window, testLibraryPath }) => {
    seedBriefing(testLibraryPath, localToday())
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.locator(SELECTORS.briefing.receiveDigestButton).click()
    await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 15000 })

    const rail = window.locator(SELECTORS.briefing.sourceSidebar)
    await expect(rail).toBeVisible()

    // 轨道底部：返回封面 + 主题切换（字号控制已迁至阅读面板右上角，不在 rail）
    const controls = window.locator(SELECTORS.briefing.railControls)
    await expect(controls).toBeVisible()
    await expect(controls.locator(SELECTORS.briefing.themeToggle)).toBeVisible()
    await expect(controls.locator('[data-testid="briefing-back-to-cover"]')).toBeVisible()

    // 字号控制在阅读面板右上角
    await expect(window.locator(SELECTORS.briefing.fontSizeDecrease)).toBeVisible()
    await expect(window.locator(SELECTORS.briefing.fontSizeIncrease)).toBeVisible()

    await expect(window.locator(SELECTORS.briefing.generatedAt)).toBeVisible()
  })

  test('job profile entry only shows for job-briefing source', async ({ window, testLibraryPath }) => {
    seedBriefing(testLibraryPath, localToday())
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()

    // digest source: generate digest → no job profile entry
    await window.locator(SELECTORS.briefing.receiveDigestButton).click()
    await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 15000 })
    await expect(window.locator(SELECTORS.briefing.jobProfileEntry)).not.toBeVisible()

    // switch to job briefing + generate → entry appears in job reading pane
    await window.locator(SELECTORS.briefing.sourceJobBriefingButton).click()
    const receiveButton = window.locator(SELECTORS.briefing.receiveJobButton)
    await receiveButton.waitFor({ state: 'visible', timeout: 15000 })
    await receiveButton.click()
    await window.locator(SELECTORS.briefing.jobCard).first().waitFor({ timeout: 30000 })
    await expect(window.locator(SELECTORS.briefing.jobProfileEntry)).toBeVisible()

    // switch back to digest → entry gone
    await window.locator(SELECTORS.briefing.sourceDigestButton).click()
    await expect(window.locator(SELECTORS.briefing.jobProfileEntry)).not.toBeVisible()
  })

  test('academic vs newspaper rail surface differs', async ({ window, testLibraryPath }) => {
    seedBriefing(testLibraryPath, localToday())
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.locator(SELECTORS.briefing.receiveDigestButton).click()
    await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 15000 })

    // 学术：透明毛边圆角边框；报纸：实底浅色
    const rail = window.locator(SELECTORS.briefing.sourceSidebar)
    await expect(rail).toHaveClass(/rounded-xl/)
    await expect(rail).not.toHaveClass(/bg-\[#e8e4de\]/)

    await window.locator(SELECTORS.briefing.themeToggle).click()
    await expect(window.locator(SELECTORS.briefing.newspaperLayout)).toBeVisible({ timeout: 10000 })
    await expect(rail).toHaveClass(/bg-\[#e8e4de\]/)
    await expect(rail).not.toHaveClass(/rounded-xl/)
  })
})
