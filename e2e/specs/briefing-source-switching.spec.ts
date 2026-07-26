import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'

test.describe('@p1 briefing source switching', () => {
  test('cycles through all four sources without crash', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()

    // Start on digest — date column should be visible
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible()
    await expect(window.locator(SELECTORS.briefing.dateColumn)).toBeVisible()

    // Switch to writing
    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SELECTORS.writing.boardEmpty)).toBeVisible({ timeout: 5000 })

    // Switch to anthropic
    await window.locator(SELECTORS.briefing.sourceAnthropicButton).click()
    await expect(window.locator(SELECTORS.briefing.anthropicPanel)).toBeVisible({ timeout: 10000 })

    // Switch to job-briefing
    await window.locator(SELECTORS.briefing.sourceJobBriefingButton).click()
    await expect(window.locator(SELECTORS.briefing.receiveJobButton)).toBeVisible({ timeout: 5000 })

    // Switch back to digest
    await window.locator(SELECTORS.briefing.sourceDigestButton).click()
    await expect(window.locator(SELECTORS.briefing.dateColumn)).toBeVisible({ timeout: 5000 })

    // Full cycle again to verify no cumulative state corruption
    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SELECTORS.writing.boardEmpty)).toBeVisible({ timeout: 5000 })
    await window.locator(SELECTORS.briefing.sourceAnthropicButton).click()
    await expect(window.locator(SELECTORS.briefing.anthropicPanel)).toBeVisible({ timeout: 10000 })

    // No error boundary should appear at any point
    await expect(window.locator('[data-testid="app-error-fallback"]')).toHaveCount(0)
  })

  test('source sidebar shows correct active state for each source', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()

    const sources = [
      { selector: SELECTORS.writing.sourceButton, name: 'writing' },
      { selector: SELECTORS.briefing.sourceDigestButton, name: 'digest' },
      { selector: SELECTORS.briefing.sourceAnthropicButton, name: 'anthropic' },
      { selector: SELECTORS.briefing.sourceJobBriefingButton, name: 'job-briefing' },
    ]

    for (const { selector } of sources) {
      await window.locator(selector).click()
      await window.waitForTimeout(300)
      // Active button should have border-l class (active indicator)
      await expect(window.locator(selector)).toHaveClass(/border-l/)
    }
  })
})
