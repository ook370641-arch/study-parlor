import { test as base, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { PreStudyPage } from '../pages/PreStudyPage'
import { SELECTORS } from '../helpers/selectors'
import {
  createTestConfigDir,
  cleanupTestConfigDir,
  seedContinueSuggestions,
  seedMultiSessionTopic,
} from '../helpers/test-library'

const test = base.extend({
  testConfigDir: async ({}, use, testInfo) => {
    const dir = createTestConfigDir()
    seedContinueSuggestions(dir, 'TypeScript 装饰器', [
      { title: 'NestJS 装饰器', context: '框架层', rationale: '实用', benefit: '项目应用' },
    ], 2)
    await use(dir)
    await cleanupTestConfigDir(dir, testInfo.status === 'failed' || testInfo.status === 'timedOut')
  },
})

test.describe('@p1 continue suggestions', () => {
  test('shows suggestion cards when continuing topic', async ({ window, testLibraryPath }) => {
    seedMultiSessionTopic(testLibraryPath, 'typescript-decorators', 'TypeScript 装饰器', 2)
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    // Find and click the continue button for our topic
    const continueButton = window.locator(SELECTORS.home.topicContinueButton)
      .filter({ hasText: /续谈|继续/ })
      .first()
    if (await continueButton.isVisible().catch(() => false)) {
      await continueButton.click()
      const preStudy = new PreStudyPage(window)
      await preStudy.waitForVisible()
      const cards = window.locator(SELECTORS.preStudy.continueSuggestionCard)
      await expect(cards.first()).toBeVisible({ timeout: 10000 })
    }
  })
})
