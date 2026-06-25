import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'

test.describe('@smoke', () => {
  test('应用启动并渲染首页', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()

    const home = new HomePage(window)
    await home.waitForLoaded()
    await expect(home.greeting).toContainText('晚安')
    await expect(home.newTopicButton).toBeVisible()
    await expect(home.librarySection).toBeVisible()
  })
})
