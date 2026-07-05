import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { PreStudyPage } from '../pages/PreStudyPage'
import { StudyPage } from '../pages/StudyPage'
import * as fs from 'node:fs'
import * as path from 'node:path'

test.describe('@p2 archive edge', () => {
  test('multiple archives create unique filenames', async ({ window, testLibraryPath }) => {
    test.setTimeout(300000)

    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.startNewTopic()

    const preStudy = new PreStudyPage(window)
    await preStudy.waitForVisible()
    await preStudy.fillTopic('重名归档测试')
    await preStudy.clickStart()

    const study = new StudyPage(window)
    await study.waitForLoaded()
    await study.waitForAssistantContent()
    await study.sendMessage('第一次归档')
    await study.waitForHistoryLength(2)
    await study.forceArchivePending()
    await study.archive()
    await study.closeArchiveReport()

    await home.waitForLoaded()
    await home.startNewTopic()
    await preStudy.waitForVisible()
    await preStudy.fillTopic('重名归档测试')
    await preStudy.clickStart()

    await study.waitForLoaded()
    await study.waitForAssistantContent()
    await study.sendMessage('第二次归档')
    await study.waitForHistoryLength(2)
    await study.forceArchivePending()
    await study.archive()
    await study.closeArchiveReport()

    const topics = fs.readdirSync(testLibraryPath).filter(name =>
      fs.statSync(path.join(testLibraryPath, name)).isDirectory()
    )
    expect(topics.length).toBeGreaterThan(0)
    const topicDir = path.join(testLibraryPath, topics[0])
    const sessions = fs.readdirSync(topicDir).filter(name =>
      fs.statSync(path.join(topicDir, name)).isDirectory()
    )
    expect(sessions.length).toBeGreaterThanOrEqual(2)
    expect(new Set(sessions).size).toBe(sessions.length)
  })
})
