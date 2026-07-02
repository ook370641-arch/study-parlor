import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { PreStudyPage } from '../pages/PreStudyPage'
import { SELECTORS } from '../helpers/selectors'

test.describe('@p1 external materials', () => {
  test('toggle visible on PreStudy modal', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.startNewTopic()
    const preStudy = new PreStudyPage(window)
    await preStudy.waitForVisible()
    const toggle = window.locator(SELECTORS.preStudy.externalMaterialsToggle)
    await expect(toggle).toBeVisible()
  })

  test('search API key input exists in settings', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.goToSettings()
    const searchInput = window.locator(SELECTORS.settings.searchApiKeyInput)
    await expect(searchInput).toBeVisible()
  })
})
