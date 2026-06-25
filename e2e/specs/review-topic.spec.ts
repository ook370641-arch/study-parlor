import { test, expect } from '../fixtures/electron'
import { SELECTORS } from '../helpers/selectors'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { PreStudyPage } from '../pages/PreStudyPage'
import { StudyPage } from '../pages/StudyPage'
import { seedReviewableTopic } from '../helpers/test-library'
import * as fs from 'node:fs'
import * as path from 'node:path'

test.describe('@slow', () => {
  test('复习检测', async ({ window, testLibraryPath }) => {
    test.setTimeout(300000)

    seedReviewableTopic(testLibraryPath, 'typescript-decorators', 'TypeScript 装饰器')
    const reportPath = path.join(testLibraryPath, 'typescript-decorators', 's2', '学习报告.md')
    const beforeContent = fs.readFileSync(reportPath, 'utf-8')

    const cover = new CoverPage(window)
    await cover.enterIfNeeded()

    const home = new HomePage(window)
    await home.waitForLoaded()
    expect(await home.getTopicCardCount()).toBe(1)

    await home.expandTopic(0)
    await home.reviewSession(0)

    const preStudy = new PreStudyPage(window)
    await preStudy.waitForVisible()
    await preStudy.clickStart()

    const study = new StudyPage(window)
    await study.waitForLoaded()
    await study.waitForAssistantContent()
    await study.sendMessage('我记得装饰器是一种特殊声明')

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

    await expect(window.locator('[data-testid="home-greeting"]')).toBeVisible({ timeout: 120000 })

    // The review archive creates or appends to a separate 复习报告.md file.
    const reviewReportPath = path.join(testLibraryPath, 'typescript-decorators', 's2', '复习报告.md')
    expect(fs.existsSync(reviewReportPath)).toBe(true)

    const reviewContent = fs.readFileSync(reviewReportPath, 'utf-8')
    expect(reviewContent).toContain('复习摘要')
    expect(reviewContent.length).toBeGreaterThan(0)

    // Original report remains untouched.
    const afterContent = fs.readFileSync(reportPath, 'utf-8')
    expect(afterContent).toBe(beforeContent)
  })
})
