import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { PreStudyPage } from '../pages/PreStudyPage'
import { StudyPage } from '../pages/StudyPage'
import { SELECTORS } from '../helpers/selectors'
import * as fs from 'node:fs'
import * as path from 'node:path'

test.describe('@p1 study', () => {
  async function startNewTopic(window, topic: string) {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.startNewTopic()
    const preStudy = new PreStudyPage(window)
    await preStudy.waitForVisible()
    await preStudy.fillTopic(topic)
    await preStudy.clickStart()
    const study = new StudyPage(window)
    await study.waitForLoaded()
    return study
  }

  test('dismiss archive pending and continue', async ({ window }) => {
    test.setTimeout(300000)
    const study = await startNewTopic(window, '可-dismiss 归档测试')
    await study.waitForAssistantContent()
    await study.sendMessage('请问我可以暂时不封存吗')
    await study.waitForHistoryLength(2)
    await study.forceArchivePending()
    await study.dismissArchive()
    await expect(study.archivePendingBanner).not.toBeVisible()
  })

  test('return home without archive creates unsaved session', async ({ window, testConfigDir }) => {
    test.setTimeout(300000)
    const study = await startNewTopic(window, '空对话返回测试')
    await study.waitForAssistantContent()
    await study.goBack()

    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.assertUnsavedSessionVisible('空对话返回测试')
  })

  test('return home saves unsaved session', async ({ window, testConfigDir }) => {
    test.setTimeout(300000)
    const study = await startNewTopic(window, '保存未归档会话')
    await study.waitForAssistantContent()
    await study.sendMessage('我需要保留这次谈话')
    await study.waitForHistoryLength(2)
    await study.goBack()

    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.assertUnsavedSessionVisible('保存未归档会话')
  })
})
