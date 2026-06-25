import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { PreStudyPage } from '../pages/PreStudyPage'
import { StudyPage } from '../pages/StudyPage'
import * as fs from 'node:fs'
import * as path from 'node:path'

test.describe('@slow', () => {
  test('新主题探索并归档', async ({ window, testLibraryPath }) => {
    test.setTimeout(300000)

    const cover = new CoverPage(window)
    await cover.enterIfNeeded()

    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.startNewTopic()

    const preStudy = new PreStudyPage(window)
    await preStudy.waitForVisible()
    await preStudy.fillTopic('TypeScript 装饰器')
    await preStudy.clickStart()

    const study = new StudyPage(window)
    await study.waitForLoaded()
    await study.waitForAssistantContent()
    await study.sendMessage('请用一句话解释装饰器的作用')

    // LLM wording is non-deterministic, so deterministically surface the archive banner
    // after at least one exchange has occurred and streaming has finished.
    await window.waitForFunction(() => {
      const session = (window as any).useStore?.getState()?.session
      return session?.history.length >= 2 && !session?.streaming
    }, { timeout: 120000 })

    await window.evaluate(() => {
      const store = (window as any).useStore
      const session = store.getState().session
      if (session) {
        store.setState({ session: { ...session, archivePending: true } })
      }
    })

    await study.archive()
    await study.closeArchiveReport()

    // Wait for archive to finish and return to home.
    await expect(window.locator('[data-testid="home-greeting"]')).toBeVisible({ timeout: 120000 })

    // Assert a new topic directory was created in the test library.
    const entries = fs.readdirSync(testLibraryPath)
    expect(entries.length).toBeGreaterThan(0)

    const topicDir = path.join(testLibraryPath, entries[0])
    const sessions = fs.readdirSync(topicDir)
    expect(sessions).toContain('s1')

    const reportPath = path.join(topicDir, 's1', '学习报告.md')
    expect(fs.existsSync(reportPath)).toBe(true)

    const content = fs.readFileSync(reportPath, 'utf-8')
    expect(content).toContain('TypeScript 装饰器')
  })
})
