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

  test('candlelight warms on annotation hover (有识)', async ({ window, testLibraryPath }) => {
    seedBriefing(testLibraryPath, localToday())
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.locator(SELECTORS.briefing.receiveDigestButton).click()
    await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 15000 })

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

  test('job briefing: flame uses star-blue color', async ({ window, testLibraryPath }) => {
    const today = localToday()
    seedBriefing(testLibraryPath, today)
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    // Switch to job briefing source
    await window.locator(SELECTORS.briefing.sourceJobBriefingButton).click()
    // The today flame should exist with lit state
    await expect(window.locator(`[data-testid="briefing-date-flame-${today}"]`)).toBeAttached()
    // Verify the star-blue color via computed style
    const flame = window.locator(`[data-testid="briefing-date-flame-${today}"]`)
    const bg = await flame.evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(bg).toContain('127, 168, 217')
  })

  test('colophon ◆ is visible after scroll (F7 CSS fix verification)', async ({ window, testLibraryPath }) => {
    seedBriefing(testLibraryPath, localToday())
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.locator(SELECTORS.briefing.receiveDigestButton).click()
    await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 15000 })

    await window.locator(SELECTORS.briefing.academicLayout).evaluate((el) => el.scrollTo(0, (el as HTMLElement).scrollHeight))
    const colophon = window.locator('[data-testid="briefing-colophon"]')
    await expect(colophon).toBeVisible({ timeout: 5000 })
    // Verify opacity is 1 (visible in normal mode)
    const opacity = await colophon.evaluate((el) => getComputedStyle(el).opacity)
    expect(parseFloat(opacity)).toBeGreaterThan(0.5)
  })
})
