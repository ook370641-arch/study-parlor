import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { seedNewTopic } from '../helpers/test-library'
import { SELECTORS } from '../helpers/selectors'

test.describe('@p1 study wall', () => {
  test('shows every topic without pagination', async ({ window, testLibraryPath }) => {
    for (let i = 0; i < 12; i++) {
      seedNewTopic(testLibraryPath, `topic-${i}`, `主题 ${i}`)
    }
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    await expect(window.locator(SELECTORS.home.topicCard)).toHaveCount(12)
    await expect(window.locator('[data-testid^="pagination-"]')).toHaveCount(0)
    await window.getByTestId('study-topic-search').fill('topic-11')
    await expect(window.locator(SELECTORS.home.topicCard)).toHaveCount(1)
    await window.locator(SELECTORS.home.topicCard).click()
    await expect(window.getByTestId('study-topic-board')).toContainText('topic-11')
  })
})
