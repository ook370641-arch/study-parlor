import { test as base, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { PreStudyPage } from '../pages/PreStudyPage'
import {
  createTestConfigDir,
  cleanupTestConfigDir,
  seedWildCardInspiration,
} from '../helpers/test-library'

const test = base.extend({
  testConfigDir: async ({}, use, testInfo) => {
    const dir = createTestConfigDir()
    seedWildCardInspiration(dir, {
      title: '量子烹饪学',
      hook: '当粒子对撞机遇上分子料理',
      topic: '量子烹饪学',
    })
    await use(dir)
    await cleanupTestConfigDir(dir, testInfo.status === 'failed' || testInfo.status === 'timedOut')
  },
})

test.describe('@p1 wild card recommendation', () => {
  test('displays wild card card from seed', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    await expect(home.wildCardCard).toBeVisible()
    await expect(home.wildCardTitle).toContainText('量子烹饪学')
    await expect(home.wildCardHook).toContainText('粒子对撞机')
  })

  test('clicking wild card fills PreStudy topic', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.wildCardCard.click()
    const preStudy = new PreStudyPage(window)
    await preStudy.waitForVisible()
    const value = await preStudy.topicInput.inputValue()
    expect(value).toBe('量子烹饪学')
  })
})
