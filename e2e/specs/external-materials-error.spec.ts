import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { PreStudyPage } from '../pages/PreStudyPage'
import { SELECTORS } from '../helpers/selectors'

test.describe('@p2 external materials error paths', () => {
  test('toggle toggleable without API key configured', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.startNewTopic()
    const preStudy = new PreStudyPage(window)
    await preStudy.waitForVisible()
    // External materials toggle should be visible and interactable
    const toggle = window.locator(SELECTORS.preStudy.externalMaterialsToggle)
    await expect(toggle).toBeVisible()
    await preStudy.toggleExternalMaterials()
    // Just verify toggle completed without crashing
    await expect(toggle).toBeVisible()
  })
})
