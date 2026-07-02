import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { seedNewTopic } from '../helpers/test-library'
import { SELECTORS } from '../helpers/selectors'

test.describe('@p1 library pagination', () => {
  test('paginates when many topics present', async ({ window, testLibraryPath }) => {
    // Seed 12 topics to trigger pagination (>10)
    for (let i = 0; i < 12; i++) {
      seedNewTopic(testLibraryPath, `topic-${i}`, `主题 ${i}`)
    }
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    // Pagination dots should appear
    const paginationDot = window.locator(SELECTORS.library.paginationDot(0))
    await expect(paginationDot).toBeVisible({ timeout: 10000 })
  })
})
