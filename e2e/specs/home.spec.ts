import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { StudyPage } from '../pages/StudyPage'
import { SELECTORS } from '../helpers/selectors'
import { seedStateJson, seedNewTopic, seedUnsavedSession, seedGroupState } from '../helpers/test-library'
import * as fs from 'node:fs'
import * as path from 'node:path'

async function waitForSessionsCleared(sessionsDir: string, timeoutMs: number = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const files = fs.readdirSync(sessionsDir).filter(name => name.endsWith('.json'))
    if (files.length === 0) return
    await new Promise(r => setTimeout(r, 50))
  }
  throw new Error(`Timed out waiting for ${sessionsDir} to be cleared`)
}

test.describe('@p1 home', () => {
  test('recover unsaved session', async ({ window, testConfigDir, testLibraryPath }) => {
    seedUnsavedSession(testConfigDir, {
      id: 'test-unsaved-1',
      topic: '未保存的谈话',
      mode: 'progress',
      difficulty: 'mid',
      temperature: 0.7,
      history: [
        { role: 'user', content: '你好' },
        { role: 'assistant', content: '欢迎回来。' },
      ],
    })

    // Reload so the freshly seeded session is picked up during init().
    await window.reload()
    await window.waitForLoadState('domcontentloaded')

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
    seedUnsavedSession(testConfigDir, {
      id: 'test-unsaved-2',
      topic: '要焚毁的谈话',
      mode: 'progress',
      difficulty: 'mid',
      temperature: 0.7,
      history: [{ role: 'user', content: 'hello' }],
    })

    // Reload so the freshly seeded session is picked up during init().
    await window.reload()
    await window.waitForLoadState('domcontentloaded')

    const cover = new CoverPage(window)
    await cover.enterIfNeeded()

    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.burnUnsavedSession()
    await expect(home.continueUnsavedButton).not.toBeVisible()

    const sessionsDir = path.join(testConfigDir, 'sessions')
    await waitForSessionsCleared(sessionsDir)
    const files = fs.readdirSync(sessionsDir).filter(name => name.endsWith('.json'))
    expect(files).toHaveLength(0)
  })

  test('switch inspiration strategy', async ({ window, testConfigDir }) => {
    seedStateJson(testConfigDir, { inspirationStrategy: 'v1' })
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()

    const home = new HomePage(window)
    await home.waitForLoaded()

    const statePath = path.join(testConfigDir, 'state.json')
    const before = JSON.parse(fs.readFileSync(statePath, 'utf-8'))
    const current = before.inspirationStrategy ?? 'v2'
    // StrategyToggle cycles v1 -> v2 -> v3 -> v1 on each click.
    const order: Array<'v1' | 'v2' | 'v3'> = ['v1', 'v2', 'v3']
    const clicks = (order.indexOf('v2') - order.indexOf(current) + 3) % 3
    for (let i = 0; i < clicks; i++) {
      await home.switchInspirationStrategy()
    }

    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'))
    expect(state.inspirationStrategy).toBe('v2')
  })

  test('group rec card appears and is clickable', async ({ window, testLibraryPath, testConfigDir }) => {
    seedGroupState(testLibraryPath, [{ id: 'g1', name: '前端', color: '#d97757' }], {
      'typescript-decorators': 'g1',
    })
    seedNewTopic(testLibraryPath, 'typescript-decorators', 'TypeScript 装饰器')
    seedStateJson(testConfigDir, {
      groupInspirations: {
        g1: {
          generatedAt: new Date().toISOString(),
          topic: '从装饰器看 TypeScript 元编程',
          hook: '用一个小例子把 @decorator 的运作机制讲清楚',
        },
      },
    })

    // Reload so the seeded library and groups are picked up during init().
    await window.reload()
    await window.waitForLoadState('domcontentloaded')

    const cover = new CoverPage(window)
    await cover.enterIfNeeded()

    const home = new HomePage(window)
    await home.waitForLoaded()
    await expect(window.locator(SELECTORS.home.groupRecCard).first()).toBeVisible({ timeout: 60000 })
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

    await window.locator(SELECTORS.settings.backButton).click()
    await home.waitForLoaded()

    await home.goToProfile()
    await expect(window.locator(SELECTORS.profile.page)).toBeVisible()

    await window.locator(SELECTORS.profile.exitButton).click()
    await home.waitForLoaded()

    await home.goToExtension()
    await expect(window.locator('[data-testid="extension-page"]')).toBeVisible()
  })
})
