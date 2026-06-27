import { test, expect } from '../fixtures/electron'
import { SetupWizardPage } from '../pages/SetupWizardPage'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { PreStudyPage } from '../pages/PreStudyPage'
import { StudyPage } from '../pages/StudyPage'
import * as fs from 'node:fs'
import * as path from 'node:path'

test.describe('@p1 onboarding journey', () => {
  test('complete setup wizard and first study session', async ({ window, testConfigDir }) => {
    test.setTimeout(300000)

    const wizard = new SetupWizardPage(window)
    await wizard.start()

    await wizard.fillApiKey(process.env.KIMI_API_KEY ?? '')
    await wizard.fillBaseUrl('https://api.kimi.com/coding/v1')
    await wizard.fillModel('kimi-k2.6')
    await wizard.verifyAndContinue()

    await wizard.fillLibraryPath(testConfigDir)
    await wizard.confirmLibraryPath()

    await wizard.fillName('新旅人')
    await wizard.fillProfileText('热爱学习')
    await wizard.fillPreferredTopics('编程，设计')
    await wizard.complete()

    const cover = new CoverPage(window)
    await cover.enterApp('新旅人')

    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.startNewTopic()

    const preStudy = new PreStudyPage(window)
    await preStudy.waitForVisible()
    await preStudy.fillTopic('第一次学习')
    await preStudy.clickStart()

    const study = new StudyPage(window)
    await study.waitForLoaded()
    await study.waitForAssistantContent()
    await study.sendMessage('请帮我总结刚才的内容')
    await study.waitForHistoryLength(2)
    await study.forceArchivePending()
    await study.archive()
    await study.closeArchiveReport()

    await home.waitForLoaded()
    const entries = fs.readdirSync(testConfigDir)
    expect(entries.length).toBeGreaterThan(0)
  })
})
