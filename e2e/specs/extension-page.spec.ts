import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { ExtensionPage } from '../pages/ExtensionPage'

test.describe('@p1 extension page', () => {
  test('shows extension page with terminology panel by default', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    const extension = new ExtensionPage(window)
    await extension.goto()
    // Terminology panel is visible by default (first tab)
    await expect(extension.terminologyPanel).toBeVisible()
  })
})
