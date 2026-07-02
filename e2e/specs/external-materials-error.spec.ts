import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { PreStudyPage } from '../pages/PreStudyPage'
import { SELECTORS } from '../helpers/selectors'

test.describe('@p2 external materials error paths', () => {
  test('toggle clickable without API key configured', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.startNewTopic()
    const preStudy = new PreStudyPage(window)
    await preStudy.waitForVisible()
    // Toggle external materials on
    await preStudy.toggleExternalMaterials()
    // Click start - should show a toast about missing API key
    await preStudy.clickStart()
    // Either the study page loads with an error or a toast appears
    const toast = window.locator(SELECTORS.toast)
    const studyPage = window.locator(SELECTORS.study.page)
    await expect(toast.or(studyPage)).toBeVisible({ timeout: 15000 })
  })
})
