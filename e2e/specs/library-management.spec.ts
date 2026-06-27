import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { LibraryPage } from '../pages/LibraryPage'
import { seedTopicWithFable, seedTopicWithDiagram } from '../helpers/test-library'
import { SELECTORS } from '../helpers/selectors'

test.describe('@p1 library management', () => {
  test('create and rename group', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()

    const library = new LibraryPage(window)
    await library.createGroup()
    const newGroupTab = window.locator(SELECTORS.library.groupTab('group-1'))
    await expect(newGroupTab).toBeVisible()

    await library.renameGroup('group-1', '重构后的分组')
    await expect(window.locator(SELECTORS.library.groupTab('group-1'))).toContainText('重构后的分组')
  })

  test('view fable from seeded topic', async ({ window, testLibraryPath }) => {
    seedTopicWithFable(testLibraryPath, 'fable-topic', '寓言测试主题')

    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()

    const library = new LibraryPage(window)
    await expect(window.locator(SELECTORS.home.topicCard).first()).toContainText('寓言测试主题')
    await library.openFable(0, 0)

    await expect(window.locator(SELECTORS.library.sessionViewer)).toBeVisible()
    const title = await library.getSessionViewerTitle()
    expect(title).toContain('寓言')
  })

  test('view diagram from seeded topic', async ({ window, testLibraryPath }) => {
    seedTopicWithDiagram(testLibraryPath, 'diagram-topic', '图表测试主题')

    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()

    const library = new LibraryPage(window)
    await expect(window.locator(SELECTORS.home.topicCard).first()).toContainText('图表测试主题')
    await library.openDiagram(0, 0)

    await expect(window.locator(SELECTORS.library.sessionViewer)).toBeVisible()
  })
})
