import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { StudyPage } from '../pages/StudyPage'
import { SELECTORS } from '../helpers/selectors'
import { seedStateJson, seedNewTopic } from '../helpers/test-library'
import * as fs from 'node:fs'
import * as path from 'node:path'

test.describe('@p1 home', () => {
  test('recover unsaved session', async ({ window, testConfigDir, testLibraryPath }) => {
    seedStateJson(testConfigDir, {
      unsavedSessions: [{
        id: 'test-unsaved-1',
        topic: '未保存的谈话',
        mode: 'progress',
        history: [
          { role: 'user', content: '你好' },
          { role: 'assistant', content: '欢迎回来。' },
        ],
        difficulty: 'mid',
        temperature: 'balanced',
        updatedAt: new Date().toISOString(),
      }],
    })

    const cover = new CoverPage(window)
    await cover.enterIfNeeded()

    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.assertUnsavedSessionVisible('未保存的谈话')
    await home.continueUnsavedSession()

    const study = new StudyPage(window)
    await study.waitForLoaded()
    await expect(study.messageList.locator(SELECTORS.study.userMessage)).toContainText('你好')
  })

  test('burn unsaved session', async ({ window, testConfigDir }) => {
    seedStateJson(testConfigDir, {
      unsavedSessions: [{
        id: 'test-unsaved-2',
        topic: '要焚毁的谈话',
        mode: 'progress',
        history: [{ role: 'user', content: 'hello' }],
        difficulty: 'mid',
        temperature: 'balanced',
        updatedAt: new Date().toISOString(),
      }],
    })

    const cover = new CoverPage(window)
    await cover.enterIfNeeded()

    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.burnUnsavedSession()
    await expect(home.continueUnsavedButton).not.toBeVisible()

    const statePath = path.join(testConfigDir, 'state.json')
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'))
    expect(state.unsavedSessions).toHaveLength(0)
  })

  test('switch inspiration strategy', async ({ window, testConfigDir }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()

    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.switchInspirationStrategy('v2')

    const statePath = path.join(testConfigDir, 'state.json')
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'))
    expect(state.lastUsed.inspirationStrategy).toBe('v2')
  })

  test('group rec card appears and is clickable', async ({ window, testLibraryPath }) => {
    seedNewTopic(testLibraryPath, 'typescript-decorators', 'TypeScript 装饰器')

    const cover = new CoverPage(window)
    await cover.enterIfNeeded()

    const home = new HomePage(window)
    await home.waitForLoaded()
    await expect(window.locator(SELECTORS.home.groupRecCard).first()).toBeVisible({ timeout: 30000 })
    await home.clickGroupRecTopic(0)

    await expect(window.locator(SELECTORS.preStudy.modal)).toBeVisible()
  })

  test('navigate to settings, profile, extension', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()

    const home = new HomePage(window)
    await home.waitForLoaded()

    await home.goToSettings()
    await expect(window.locator(SELECTORS.settings.page)).toBeVisible()

    await home.goToProfile()
    await expect(window.locator(SELECTORS.profile.page)).toBeVisible()

    await home.goToExtension()
    await expect(window.locator('[data-testid="extension-page"]')).toBeVisible()
  })
})
