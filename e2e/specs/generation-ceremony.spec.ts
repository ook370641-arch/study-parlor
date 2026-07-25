import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedBriefing } from '../helpers/test-library'

function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

test.describe('@p1 generation ceremony', () => {
  test('fresh generation passes constellation into fresh arrival; history revisit does not replay', async ({ window, testLibraryPath }) => {
    const today = localToday()
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()

    await window.locator(SELECTORS.briefing.receiveDigestButton).click()
    await expect(window.locator('[data-testid="briefing-reading-pane"]')).toHaveAttribute('data-arrival', 'fresh', { timeout: 20000 })

    // 切到历史日期（seed 一篇昨天）→ revisit
    const yesterday = new Date(Date.now() - 86400000)
    const yDate = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`
    seedBriefing(testLibraryPath, yDate)
    await window.reload()
    const cover2 = new CoverPage(window)
    await cover2.enterName('E2E 测试员')
    await cover2.goToBriefing()
    await window.locator(`[data-testid="briefing-date-item-${yDate}"]`).click()
    await expect(window.locator('[data-testid="briefing-reading-pane"]')).toHaveAttribute('data-arrival', 'revisit')
  })
})
