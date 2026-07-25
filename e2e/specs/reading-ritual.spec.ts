import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedBriefing } from '../helpers/test-library'

function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

test.describe('@p1 reading ritual (燃熄 + 阖卷 + 脊柱)', () => {
  test('flame lit → scroll to end → colophon + spent; persists across reload; spine visible', async ({ window, testLibraryPath }) => {
    const today = localToday()
    seedBriefing(testLibraryPath, today)
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.locator(SELECTORS.briefing.receiveDigestButton).click()
    await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 15000 })

    // 今日烛火：已生成未读 = lit
    await expect(window.locator(`[data-testid="briefing-date-flame-${today}"]`)).toHaveAttribute('data-state', 'lit')

    // 滚到卷尾：阖卷 ◆ 静驻
    await window.locator(SELECTORS.briefing.academicLayout).evaluate((el) => el.scrollTo(0, (el as HTMLElement).scrollHeight))
    await expect(window.locator('[data-testid="briefing-colophon"]')).toBeVisible({ timeout: 5000 })
    // 燃熄：读过 = spent
    await expect(window.locator(`[data-testid="briefing-date-flame-${today}"]`)).toHaveAttribute('data-state', 'spent', { timeout: 5000 })

    // 跨重启持久化
    await window.reload()
    const cover2 = new CoverPage(window)
    await cover2.enterName('E2E 测试员')
    await cover2.goToBriefing()
    await expect(window.locator(`[data-testid="briefing-date-flame-${today}"]`)).toHaveAttribute('data-state', 'spent')

    // 脊柱存在
    await expect(window.locator('[data-testid="internalization-spine"]')).toBeAttached()
  })
})
