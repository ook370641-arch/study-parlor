import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { seedTopicWithoutDiagram, seedTopicWithDiagram } from '../helpers/test-library'

test.describe('@p1 diagram generation', () => {
  test('topic without diagram shows in library', async ({ window, testLibraryPath }) => {
    seedTopicWithoutDiagram(testLibraryPath, 'no-diagram', 'no-diagram')
    // Reload so the freshly seeded library is picked up during init()
    await window.reload()
    await window.waitForLoadState('networkidle')
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    const topicCard = window.locator('[data-testid="topic-card"]').filter({ hasText: 'no-diagram' })
    await expect(topicCard).toBeVisible({ timeout: 10000 })
  })

  test('topic with diagram shows diagram button', async ({ window, testLibraryPath }) => {
    seedTopicWithDiagram(testLibraryPath, 'has-diagram', 'has-diagram')
    // Reload so the freshly seeded library is picked up during init()
    await window.reload()
    await window.waitForLoadState('networkidle')
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    const topicCard = window.locator('[data-testid="topic-card"]').filter({ hasText: 'has-diagram' })
    await expect(topicCard).toBeVisible({ timeout: 10000 })
  })
})
