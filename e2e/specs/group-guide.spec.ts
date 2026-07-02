import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { SELECTORS } from '../helpers/selectors'

test.describe('@p1 group guide', () => {
  test('opens and closes guide popover', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    const guideButton = window.locator(SELECTORS.library.groupGuideButton)
    await guideButton.click()
    const popover = window.locator(SELECTORS.library.groupGuidePopover)
    await expect(popover).toBeVisible()
    // Click outside to dismiss
    await window.locator('body').click({ position: { x: 0, y: 0 } })
    await expect(popover).toBeHidden()
  })
})
