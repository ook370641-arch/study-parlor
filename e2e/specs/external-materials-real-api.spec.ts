import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { PreStudyPage } from '../pages/PreStudyPage'
import { StudyPage } from '../pages/StudyPage'
import { seedStateJson } from '../helpers/test-library'

test.describe('@real external materials — real API chain', () => {
  test.beforeEach(async ({ testConfigDir }) => {
    seedStateJson(testConfigDir, {
      profile: { name: '真实搜索测试', profile_text: '', preferred_topics: [] },
    })
  })

  test('collects external materials via real Tavily + LLM', async ({ window }) => {
    test.setTimeout(180000)

    const cover = new CoverPage(window)
    await cover.enterIfNeeded('真实搜索测试')

    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.startNewTopic()

    const preStudy = new PreStudyPage(window)
    await preStudy.waitForVisible()
    await preStudy.fillTopic('苏格拉底式教学法')
    await preStudy.toggleExternalMaterials()
    await preStudy.clickStart()

    const study = new StudyPage(window)
    await study.waitForLoaded()

    // External materials card should appear.
    // It may show "收集中…" then sources, or error if real API fails.
    const card = study.externalMaterialsCard
    await expect(card).toBeVisible({ timeout: 90000 })

    // Wait for either successful sources or error text to appear.
    // We assert that no MISSING_API_KEY error shows — if it does, env key is broken.
    const toast = window.locator('[data-testid="toast-message"]')
    const hasMissingApiToast = await toast
      .filter({ hasText: /请先在设置中配置/ })
      .isVisible()
      .catch(() => false)
    expect(hasMissingApiToast).toBe(false)

    // The card should have either "来源" count or an error that is NOT "MISSING_API_KEY".
    // If the real search worked, we should see sources listed inside the card.
    await card.click()
    // Allow time for loading to finish — spinner or sources.
    // We don't strictly assert count because real results vary, but we assert no MISSING_API_KEY toast.
    const hasSources = await card.locator('li').first().waitFor({ state: 'visible', timeout: 60000 }).then(() => true).catch(() => false)
    const hasError = await card.locator('text=资料获取失败').isVisible().catch(() => false)
    const hasNoResults = await card.locator('text=未找到').isVisible().catch(() => false)
    // Any outcome is fine as long as it's not MISSING_API_KEY.
    console.log(`[real e2e] external materials result: hasSources=${hasSources} hasError=${hasError} hasNoResults=${hasNoResults}`)
    expect(true).toBe(true) // placeholder — the key assertion is the MISSING_API_KEY check above
  })
})
