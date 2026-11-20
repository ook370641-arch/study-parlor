import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { PreStudyPage } from '../pages/PreStudyPage'
import { StudyPage } from '../pages/StudyPage'

async function startStubbedStudy(window: any, topic: string) {
  const cover = new CoverPage(window)
  await cover.enterIfNeeded()
  const home = new HomePage(window)
  await home.waitForLoaded()
  await home.startNewTopic()
  const preStudy = new PreStudyPage(window)
  await preStudy.waitForVisible()
  await preStudy.fillTopic(topic)
  await window.evaluate(() => { (window as any).api.llmStart = async () => {} })
  await preStudy.clickStart()
  const study = new StudyPage(window)
  await study.waitForLoaded()
  return study
}

test.describe('@p1 study background navigation', () => {
  test('continues the same live session after visiting another source', async ({ window }) => {
    const study = await startStubbedStudy(window, '后台学习')
    const firstChunk = '第一段回答'
    const finalChunk = '，最后一段回答'

    await window.evaluate((text) => (window as any).useStore.getState().appendChunk(text), firstChunk)
    await expect(study.messageList).toContainText(firstChunk)
    await window.getByTestId('briefing-source-anthropic').click()
    await expect(window.getByTestId('briefing-page')).toBeVisible()

    await window.evaluate((text) => {
      const store = (window as any).useStore.getState()
      store.appendChunk(text)
      store.finishStreaming()
    }, finalChunk)
    await window.getByTestId('briefing-source-study').click()
    await window.getByTestId('continue-unsaved-button').click()
    await expect(study.messageList).toContainText(firstChunk)
    await expect(study.messageList).toContainText(finalChunk)
  })

  test('stays in study with history and toast when snapshot saving fails', async ({ window }) => {
    const study = await startStubbedStudy(window, '保存失败学习')
    await window.evaluate(() => {
      ;(window as any).useStore.getState().appendChunk('不能丢失的回答')
      ;(window as any).api.saveSession = async () => { throw new Error('磁盘写入失败') }
    })
    await expect(study.messageList).toContainText('不能丢失的回答')

    await window.getByTestId('briefing-source-anthropic').click()
    await expect(study.pageElement).toBeVisible()
    await expect(study.messageList).toContainText('不能丢失的回答')
    await expect(window.getByTestId('toast')).toContainText('保存会话失败')
  })
})
