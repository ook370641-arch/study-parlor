import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { PreStudyPage } from '../pages/PreStudyPage'
import { StudyPage } from '../pages/StudyPage'
import { seedNewTopic } from '../helpers/test-library'
import { SELECTORS } from '../helpers/selectors'
import * as fs from 'node:fs'
import * as path from 'node:path'

test.describe('@p1 pre-study', () => {
  test('select existing topic with sub-topic', async ({ window, testLibraryPath }) => {
    seedNewTopic(testLibraryPath, 'typescript-decorators', 'TypeScript 装饰器')

    // Reload so the freshly seeded library is picked up during init().
    await window.reload()
    await window.waitForLoadState('domcontentloaded')

    const cover = new CoverPage(window)
    await cover.enterIfNeeded()

    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.startNewTopic()

    const preStudy = new PreStudyPage(window)
    await preStudy.waitForVisible()
    await preStudy.selectExistingTopicSource()
    // Existing topic options render the dirName as the topic title.
    await preStudy.selectExistingTopic('typescript-decorators')
    await preStudy.fillCustomTopic('在 NestJS 中的应用')
    await preStudy.clickStart()

    const study = new StudyPage(window)
    await study.waitForLoaded()
    await expect(window.locator(SELECTORS.study.page)).toContainText('typescript-decorators')
    await expect(window.locator(SELECTORS.study.page)).toContainText('在 NestJS 中的应用')
  })

  test('set difficulty and temperature', async ({ window, testConfigDir }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()

    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.startNewTopic()

    const preStudy = new PreStudyPage(window)
    await preStudy.waitForVisible()
    await preStudy.setDifficulty('low')
    await preStudy.setTemperature('creative')
    await preStudy.fillTopic('测试参数保存')
    await preStudy.clickStart()

    const statePath = path.join(testConfigDir, 'state.json')
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'))
    expect(state.lastUsed.difficulty).toBe('low')
    expect(state.lastUsed.temperature).toBe(1.0)
  })

  test('cancel closes modal', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()

    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.startNewTopic()

    const preStudy = new PreStudyPage(window)
    await preStudy.waitForVisible()
    await preStudy.close()
    await expect(preStudy.modal).not.toBeVisible()
  })
})
