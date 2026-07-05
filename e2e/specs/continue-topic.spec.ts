import { test, expect } from '../fixtures/electron'
import { SELECTORS } from '../helpers/selectors'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { PreStudyPage } from '../pages/PreStudyPage'
import { StudyPage } from '../pages/StudyPage'
import { seedNewTopic } from '../helpers/test-library'

test.describe('@slow', () => {
  test('继续已有主题', async ({ window, testLibraryPath }) => {
    test.setTimeout(300000)

    seedNewTopic(testLibraryPath, 'typescript-decorators', 'TypeScript 装饰器')

    const cover = new CoverPage(window)
    await cover.enterIfNeeded()

    const home = new HomePage(window)
    await home.waitForLoaded()
    expect(await home.getTopicCardCount()).toBe(1)

    await home.continueTopic(0)

    const preStudy = new PreStudyPage(window)
    await preStudy.waitForVisible()
    await preStudy.clickStart()

    const study = new StudyPage(window)
    await study.waitForLoaded()
    await study.waitForAssistantContent()
    await study.sendMessage('我准备好了，请继续')

    // Wait for the assistant response to complete and assert no crash.
    await window.waitForFunction(() => {
      const session = (window as any).useStore?.getState()?.session
      return session?.history.length >= 2 && !session?.streaming
    }, { timeout: 120000 })

    await expect(study.messageList.locator(SELECTORS.study.assistantMessage).filter({ hasText: /\S/ }).first()).toBeVisible()
  })
})
