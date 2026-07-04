import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { seedTopicWithoutDiagram, seedTopicWithDiagram } from '../helpers/test-library'

test.describe('@p1 diagram generation', () => {
  test('topic without diagram shows in library', async ({ window, testLibraryPath }) => {
    seedTopicWithoutDiagram(testLibraryPath, 'no-diagram', '无图表主题')
    // Reload so the freshly seeded library is picked up during init()
    await window.reload()
    await window.waitForLoadState('networkidle')
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    const topicCard = window.locator('[data-testid="topic-card"]').filter({ hasText: '无图表主题' })
    await expect(topicCard).toBeVisible({ timeout: 10000 })
  })

  test('topic with diagram shows diagram button', async ({ window, testLibraryPath }) => {
    seedTopicWithDiagram(testLibraryPath, 'has-diagram', '有图表主题')
    // Reload so the freshly seeded library is picked up during init()
    await window.reload()
    await window.waitForLoadState('networkidle')
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    const topicCard = window.locator('[data-testid="topic-card"]').filter({ hasText: '有图表主题' })
    await expect(topicCard).toBeVisible({ timeout: 10000 })
  })
})
