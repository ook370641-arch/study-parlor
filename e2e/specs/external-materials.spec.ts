import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { PreStudyPage } from '../pages/PreStudyPage'
import { StudyPage } from '../pages/StudyPage'
import { SettingsPage } from '../pages/SettingsPage'
import * as fs from 'node:fs'
import * as path from 'node:path'

test.describe('@p1 external materials', () => {
  test('toggle visible and clickable', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.startNewTopic()
    const preStudy = new PreStudyPage(window)
    await preStudy.waitForVisible()
    await expect(window.locator('[data-testid="external-materials-toggle"]')).toBeVisible()
    await preStudy.toggleExternalMaterials()
    // Toggle should be checked after clicking
    const toggle = window.locator('[data-testid="external-materials-toggle"]')
    await expect(toggle).toBeChecked()
  })

  test('saves Tavily API key in settings', async ({ window, testConfigDir }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.goToSettings()
    const settings = new SettingsPage(window)
    await settings.waitForLoaded()
    await settings.saveSearchApiKey('tvly-test-key')
    const envPath = path.join(testConfigDir, '.env')
    const envContent = fs.readFileSync(envPath, 'utf8')
    expect(envContent).toContain('TAVILY_API_KEY=tvly-test-key')
  })
})
