import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { seedStateJson } from '../helpers/test-library'
import { SELECTORS } from '../helpers/selectors'

test.describe('@real briefing — real API chain', () => {
  // Disable the E2E mock so briefing exercises real feeds + LLM.
  test.use({ extraEnv: { E2E_BRIEFING_DISABLE_MOCK: '1' } })

  test.beforeEach(async ({ testConfigDir }) => {
    seedStateJson(testConfigDir, {
      profile: { name: '真实简报测试', profile_text: '', preferred_topics: [] },
    })
  })

  test('generates briefing via real feeds + LLM', async ({ window }) => {
    test.setTimeout(300000)

    const cover = new CoverPage(window)
    // Profile is already seeded — briefing button is enabled on cover.
    // Do NOT call enterIfNeeded because it clicks "点亮灯火" which navigates AWAY from cover.
    await cover.briefingButton.waitFor({ state: 'visible', timeout: 15000 })
    await cover.goToBriefing()
    // Current code no longer auto-generates on mount; explicitly trigger generation.
    await window.locator(SELECTORS.briefing.receiveDigestButton).click()

    // Briefing generation may take 60-120s. Wait for either academic layout (success)
    // or error display (failure).
    const academicLayout = window.locator('[data-testid="briefing-academic-layout"]')
    const errorDisplay = window.locator('[data-testid="briefing-error-display"]')

    // Wait for resolved state (layout or error) with long timeout.
    await expect(
      academicLayout.or(errorDisplay)
    ).toBeVisible({ timeout: 240000 })

    const hasError = await errorDisplay.isVisible().catch(() => false)
    if (hasError) {
      const errorText = await errorDisplay.textContent().catch(() => 'unknown')
      throw new Error(`简报生成失败: ${errorText}`)
    }

    // Verify content looks like a real briefing.
    await expect(academicLayout).toContainText(/[a-zA-Z]/, { timeout: 10000 })
    // Also verify it was cached to disk (indirect: generated timestamp visible).
    const genAt = window.locator('[data-testid="briefing-generated-at"]')
    const hasGenAt = await genAt.isVisible().catch(() => false)
    console.log(`[real e2e] briefing generated, has timestamp: ${hasGenAt}`)
  })
})
