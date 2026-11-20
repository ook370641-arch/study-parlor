import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { PreStudyPage } from '../pages/PreStudyPage'
import { StudyPage } from '../pages/StudyPage'
import { seedNewTopic } from '../helpers/test-library'

test.describe('@p1 study source layout', () => {
  test('keeps independent column collapse state on topic and study pages', async ({ window, testLibraryPath }) => {
    seedNewTopic(testLibraryPath, 'layout-topic', '布局主题')
    await window.reload()
    await window.evaluate(() => { (window as any).api.llmStart = async () => {} })

    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()

    const sources = window.locator('button[data-testid^="briefing-source-"]')
    await expect(sources.first()).toHaveAttribute('data-testid', 'briefing-source-study')
    const sourceColumn = window.getByTestId('briefing-source-sidebar')
    const studyColumn = window.getByTestId('briefing-list-column')

    await window.getByTestId('briefing-sidebar-toggle').click()
    await expect(sourceColumn).toHaveClass(/w-14/)
    await expect(studyColumn).not.toHaveClass(/w-14/)
    await window.getByTestId('briefing-list-column-toggle').click()
    await expect(studyColumn).toHaveClass(/w-14/)

    await window.getByTestId('topic-card').first().click()
    await expect(window.getByTestId('study-topic-board')).toBeVisible()
    await expect(sourceColumn).toHaveClass(/w-14/)
    await expect(studyColumn).toHaveClass(/w-14/)

    await window.getByTestId('topic-continue-button').click()
    const preStudy = new PreStudyPage(window)
    await preStudy.waitForVisible()
    await preStudy.clickStart()
    const study = new StudyPage(window)
    await study.waitForLoaded()
    await expect(sourceColumn).toHaveClass(/w-14/)
    await expect(studyColumn).toHaveClass(/w-14/)

    await window.setViewportSize({ width: 640, height: 720 })
    const box = await study.pageElement.boundingBox()
    expect(box?.width).toBeGreaterThanOrEqual(420)
  })

  test('keeps themes, notepad and toast available above the study wall', async ({ window }) => {
    await window.setViewportSize({ width: 1280, height: 720 })
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()

    await window.getByTestId('study-controls-theme-toggle').click()
    await expect(window.getByTestId('study-wall')).toHaveClass(/bg-\[#f5f2ed\]/)
    await window.getByTestId('study-controls-theme-toggle').click()
    await expect(window.getByTestId('study-wall')).not.toHaveClass(/bg-\[#f5f2ed\]/)

    await window.getByTestId('notepad-fab-button').click()
    await expect(window.getByTestId('notepad-panel')).toBeVisible()
    await window.evaluate(() => (window as any).useStore.getState().showToast('布局提示'))
    await expect(window.getByTestId('toast')).toBeVisible()
    await expect(window.getByTestId('notepad-panel')).toBeVisible()
  })
})
