import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { seedMultiSessionTopic } from '../helpers/test-library'
import * as fs from 'node:fs'
import * as path from 'node:path'

test.describe('@p2 library drag and delete', () => {
  test('multi-session topic shows all sessions', async ({ window, testLibraryPath }) => {
    seedMultiSessionTopic(testLibraryPath, 'multi-session', '多会话主题', 3)
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    // The topic card should be visible and expandable
    const topicCard = window.locator('[data-testid="topic-card"]').filter({ hasText: '多会话主题' })
    await expect(topicCard).toBeVisible({ timeout: 10000 })
    await topicCard.click()
    // Session entries should appear after expanding
    const sessionEntries = window.locator('[data-testid="session-file-button"]')
    const count = await sessionEntries.count()
    expect(count).toBeGreaterThanOrEqual(3)
  })
})
