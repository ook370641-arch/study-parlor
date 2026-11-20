import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { SELECTORS } from '../helpers/selectors'
import { seedStateJson } from '../helpers/test-library'
import * as fs from 'node:fs'
import * as path from 'node:path'

test.describe('@p0 cover', () => {
  test('first-time user enters name and lands on briefing', async ({ window, testLibraryPath }) => {
    const cover = new CoverPage(window)
    await cover.enterApp('夜话旅人')

    await expect(window.locator('[data-testid="briefing-page"]')).toBeVisible()

    const home = new HomePage(window)
    await home.waitForLoaded()
    await expect(home.greeting).toContainText('夜话旅人')

    // profile 已迁入学习库（.profile.json），state.json 不再保存
    const savedProfile = JSON.parse(fs.readFileSync(path.join(testLibraryPath, '.profile.json'), 'utf-8'))
    expect(savedProfile.name).toBe('夜话旅人')
  })
})

test.describe('@p1 cover', () => {
  test('returning user sees disabled light button and enters through briefing', async ({ window, testConfigDir }) => {
    seedStateJson(testConfigDir, {
      profile: { name: '归来者', profile_text: '', preferred_topics: [] },
    })

    await window.reload()

    const cover = new CoverPage(window)
    await cover.lightButton.waitFor({ state: 'visible' })
    await expect(cover.lightButton).toHaveAttribute('aria-disabled', 'true')
    await cover.lightButton.click()
    await cover.lightButton.focus()
    await window.keyboard.press('Enter')
    await window.keyboard.press('Space')
    await expect(window.locator('[data-testid="briefing-page"]')).toHaveCount(0)
    await cover.goToBriefing()

    const home = new HomePage(window)
    await home.waitForLoaded()
    await expect(home.greeting).toContainText('归来者')
  })

  test('briefing button is disabled before entering name', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.nameInput.waitFor({ state: 'visible' })
    await cover.expectBriefingButtonDisabled()
  })

  test('briefing button is enabled after entering name', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterName('夜话旅人')
    await cover.expectBriefingButtonEnabled()
  })

  test('briefing button navigates to briefing', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.nameInput.waitFor({ state: 'visible' })
    await cover.enterName('夜话旅人')
    await cover.goToBriefing()

    await expect(window.locator('[data-testid="briefing-page"]')).toBeVisible({ timeout: 10000 })
  })

  for (const { source, testId } of [
    { source: 'writing', testId: 'writing-wall-writing' },
    { source: 'anthropic', testId: 'anthropic-blog-panel' },
    { source: 'book', testId: 'book-panel' },
    { source: 'study', testId: 'study-wall' },
  ] as const) {
    test(`briefing restores ${source} source`, async ({ window, testConfigDir }) => {
      seedStateJson(testConfigDir, {
        profile: { name: '来源恢复', profile_text: '', preferred_topics: [] },
        briefingSource: source,
      })
      await window.reload()

      const cover = new CoverPage(window)
      await cover.goToBriefing()
      await expect(window.getByTestId(testId)).toBeVisible()
    })
  }

  test('cover quote shows text and meta', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.nameInput.or(cover.lightButton).waitFor({ state: 'visible' })

    await expect(window.locator(SELECTORS.quote.text)).toBeVisible()
    await expect(window.locator(SELECTORS.quote.meta)).toContainText('—')
  })

  test('crop button hidden outside dev (e2e/packaged)', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.nameInput.or(cover.lightButton).waitFor({ state: 'visible' })

    // e2e 环境 E2E_CONFIG_DIR 置位 → canEdit=false → 入口不渲染（打包版同理走 isPackaged）
    await expect(window.locator(SELECTORS.cover.cropButton)).toHaveCount(0)

    // IPC 暴露探测：打包/未打包构建的 preload 都必须挂上（ipc-state §1）
    const hasApi = await window.evaluate(() => typeof (window as unknown as { api: Record<string, unknown> }).api.paintingsCanEdit === 'function')
    expect(hasApi).toBe(true)
  })
})
