import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { LibraryPage } from '../pages/LibraryPage'
import { FableStyleDialog } from '../pages/FableStyleDialog'
import { seedTopicWithoutFable } from '../helpers/test-library'
import * as fs from 'node:fs'
import * as path from 'node:path'

test.describe('@p1 fable generation', () => {
  test('shows generate button when report exists without fable', async ({ window, testLibraryPath }) => {
    seedTopicWithoutFable(testLibraryPath, 'typescript-decorators', 'TypeScript 装饰器')
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    // Open the session viewer for s1
    const generateBtn = window.locator('[data-testid="generate-fable-button"]')
    // The LibraryPage may need to open the session first
    const topicCard = window.locator('[data-testid="topic-card"]').filter({ hasText: 'TypeScript 装饰器' })
    await topicCard.click()
    await expect(generateBtn).toBeVisible()
  })
})
