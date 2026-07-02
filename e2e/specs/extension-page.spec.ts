import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { ExtensionPage } from '../pages/ExtensionPage'

test.describe('@p1 extension page', () => {
  test('shows tabs including library info', async ({ window, testLibraryPath }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    const extension = new ExtensionPage(window)
    await extension.goto()
    await expect(extension.terminologyPanel).toBeVisible()
    await expect(extension.libraryDirectoryCard).toBeVisible()
    await expect(extension.localAgentCard).toBeVisible()
    await expect(extension.customPicturesCard).toBeVisible()
  })
})
