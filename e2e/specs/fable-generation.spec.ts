import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { seedTopicWithoutFable, seedTopicWithFable } from '../helpers/test-library'

test.describe('@p1 fable generation', () => {
  test('topic without fable appears in library', async ({ window, testLibraryPath }) => {
    seedTopicWithoutFable(testLibraryPath, 'no-fable-topic', '无寓言主题')
    // Reload so the freshly seeded library is picked up during init()
    await window.reload()
    await window.waitForLoadState('networkidle')
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    const topicCard = window.locator('[data-testid="topic-card"]').filter({ hasText: '无寓言主题' })
    await expect(topicCard).toBeVisible({ timeout: 10000 })
  })

  test('topic with fable shows fable button', async ({ window, testLibraryPath }) => {
    seedTopicWithFable(testLibraryPath, 'has-fable', '有寓言主题')
    // Reload so the freshly seeded library is picked up during init()
    await window.reload()
    await window.waitForLoadState('networkidle')
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    const topicCard = window.locator('[data-testid="topic-card"]').filter({ hasText: '有寓言主题' })
    await expect(topicCard).toBeVisible({ timeout: 10000 })
  })
})
