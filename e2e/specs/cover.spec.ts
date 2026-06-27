import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { SELECTORS } from '../helpers/selectors'
import * as fs from 'node:fs'
import * as path from 'node:path'

test.describe('@p0 cover', () => {
  test('first-time user enters name and lands on home', async ({ window, testConfigDir }) => {
    const cover = new CoverPage(window)
    await cover.enterApp('夜话旅人')

    const home = new HomePage(window)
    await home.waitForLoaded()
    await expect(home.greeting).toContainText('夜话旅人')

    const statePath = path.join(testConfigDir, 'state.json')
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'))
    expect(state.profile.name).toBe('夜话旅人')
  })
})

test.describe('@p1 cover', () => {
  test('returning user sees light button', async ({ window, testConfigDir }) => {
    const statePath = path.join(testConfigDir, 'state.json')
    fs.writeFileSync(statePath, JSON.stringify({
      profile: { name: '归来者', profile_text: '', preferred_topics: [] },
      lastUsed: { difficulty: 'mid', temperature: 'balanced' },
      session_count: 0,
      groups: [],
      activeGroupId: null,
      groupInspirations: {},
      topicContinueSuggestions: {},
      unsavedSessions: [],
      pendingArchives: [],
      archiveResult: null,
      terminology: {},
    }))

    await window.reload()

    const cover = new CoverPage(window)
    await cover.lightButton.waitFor({ state: 'visible' })
    await cover.lightButton.click()

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
    await cover.enterIfNeeded()
    await cover.goToBriefing()

    await expect(window.locator('[data-testid="briefing-page"]')).toBeVisible({ timeout: 10000 })
  })

  test('cover quote shows text and meta', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.nameInput.or(cover.lightButton).waitFor({ state: 'visible' })

    await expect(window.locator(SELECTORS.quote.text)).toBeVisible()
    await expect(window.locator(SELECTORS.quote.meta)).toContainText('—')
  })
})
