import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { seedTopicWithoutFable, seedTopicWithFable } from '../helpers/test-library'

test.describe('@p1 fable generation', () => {
  test('topic without fable appears in library', async ({ window, testLibraryPath }) => {
    seedTopicWithoutFable(testLibraryPath, 'no-fable-topic', 'no-fable-topic')
    // Reload so the freshly seeded library is picked up during init()
    await window.reload()
    await window.waitForLoadState('networkidle')
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    const topicCard = window.locator('[data-testid="topic-card"]').filter({ hasText: 'no-fable-topic' })
    await expect(topicCard).toBeVisible({ timeout: 10000 })
  })

  test('topic with fable shows fable button', async ({ window, testLibraryPath }) => {
    seedTopicWithFable(testLibraryPath, 'has-fable', 'has-fable')
    // Reload so the freshly seeded library is picked up during init()
    await window.reload()
    await window.waitForLoadState('networkidle')
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    const topicCard = window.locator('[data-testid="topic-card"]').filter({ hasText: 'has-fable' })
    await expect(topicCard).toBeVisible({ timeout: 10000 })
  })
})
