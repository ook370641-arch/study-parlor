import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedBriefing } from '../helpers/test-library'

function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

test.describe('@p1 lighting layer', () => {
  test('candlelight on by default, toggle persists across reload', async ({ window, testLibraryPath }) => {
    seedBriefing(testLibraryPath, localToday())
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.locator(SELECTORS.briefing.receiveDigestButton).click()
    await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 15000 })

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
    seedBriefing(testLibraryPath, localToday())
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.locator(SELECTORS.briefing.receiveDigestButton).click()
    await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 15000 })

    await expect(window.locator('[data-testid="painting-plate"]')).toHaveCount(0)
    await window.locator('[data-testid="painting-plate-toggle"]').click()
    await expect(window.locator('[data-testid="painting-plate"]')).toBeVisible()
  })

  test('focus breathing: hovering date rail dims article zone', async ({ window, testLibraryPath }) => {
    seedBriefing(testLibraryPath, localToday())
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.locator(SELECTORS.briefing.receiveDigestButton).click()
    await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 15000 })

    const root = window.locator('[data-testid="briefing-page"]')
    await expect(root).toHaveAttribute('data-focus-zone', 'none')
    await window.locator('[data-zone="rail-list"]').first().hover()
    await expect(root).toHaveAttribute('data-focus-zone', 'rail-list')
  })

  test('newspaper theme: candlelight absent and toggle greyed', async ({ window, testLibraryPath }) => {
    seedBriefing(testLibraryPath, localToday())
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.locator(SELECTORS.briefing.receiveDigestButton).click()
    await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 15000 })

    await window.locator('[data-testid="briefing-theme-toggle"]').click()
    await expect(window.locator('[data-testid="briefing-candlelight"]')).toHaveCount(0)
    await expect(window.locator('[data-testid="briefing-candlelight-toggle"]')).toBeDisabled()
  })
})
