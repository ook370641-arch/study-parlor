import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { seedMultiSessionTopic } from '../helpers/test-library'

test.describe('@p2 library drag and delete', () => {
  test('multi-session topic shows all sessions', async ({ window, testLibraryPath }) => {
    seedMultiSessionTopic(testLibraryPath, 'multi-session', 'multi-session', 3)
    // Reload so the freshly seeded library is picked up during init()
    await window.reload()
    await window.waitForLoadState('networkidle')
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    // The topic card should be visible and expandable
    const topicCard = window.locator('[data-testid="topic-card"]').filter({ hasText: 'multi-session' })
    await expect(topicCard).toBeVisible({ timeout: 10000 })
    await topicCard.click()
    // Session entries should appear after expanding
    const sessionEntries = window.locator('[data-testid="session-file-button"]')
    const count = await sessionEntries.count()
    expect(count).toBeGreaterThanOrEqual(3)
  })
})
