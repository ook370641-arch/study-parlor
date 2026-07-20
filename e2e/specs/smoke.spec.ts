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

  test('cover shows greeting after entry', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    // Home page greeting and library should be visible
    await expect(home.greeting).toBeVisible()
    await expect(home.librarySection).toBeVisible()
  })

  test('writing API methods are exposed on window.api', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()

    // Verify writing-related IPC methods are available
    const methods = await window.evaluate(() => {
      const api = (window as any).api
      const writingMethods = [
        'writingScanTree',
        'writingCreateFile',
        'writingCreateFolder',
        'writingRename',
        'writingMove',
        'writingDelete',
        'writingRead',
        'writingWrite',
        'writingImportFiles',
        'writingAssistantSendMessage',
        'writingAssistantAbort',
      ]
      return writingMethods.map(m => ({ method: m, exists: typeof api?.[m] === 'function' }))
    })

    for (const { method, exists } of methods) {
      expect(exists, `${method} should be a function`).toBe(true)
    }
  })
})
