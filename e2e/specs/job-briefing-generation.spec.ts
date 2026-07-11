import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import fs from 'node:fs'
import path from 'node:path'

function localToday(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

test.describe('@p1 job briefing generation', () => {
  test('generates job briefing via mock and writes cache', async ({ window, testLibraryPath }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()

    // Switch the briefing source to 求职简报.
    await window.locator(SELECTORS.briefing.sourceJobBriefingButton).click()

    // Empty state: trigger generation.
    const receiveButton = window.locator(SELECTORS.briefing.receiveJobButton)
    await receiveButton.waitFor({ state: 'visible', timeout: 15000 })
    await receiveButton.click()

    // Mock pipeline returns one job card, two skill rows, and a trends section.
    await window.locator(SELECTORS.briefing.jobCard).first().waitFor({ timeout: 30000 })
    await expect(window.locator(SELECTORS.briefing.jobCard)).toHaveCount(1)
    await expect(window.locator(SELECTORS.briefing.jobSkillRow)).toHaveCount(2)
    await expect(window.getByText('趋势解读')).toBeVisible()

    // Cache file is written under {library}/求职简报/.
    const today = localToday()
    const file = path.join(testLibraryPath, '求职简报', `求职简报-${today}.md`)
    expect(fs.existsSync(file)).toBe(true)
  })
})
