import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { HomePage } from '../pages/HomePage'
import { SettingsPage } from '../pages/SettingsPage'
import { SELECTORS } from '../helpers/selectors'
import * as fs from 'node:fs'
import * as path from 'node:path'

test.describe('@p1 settings', () => {
  test('modify and save config', async ({ window, testConfigDir, testLibraryPath }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()

    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.goToSettings()

    const settings = new SettingsPage(window)
    await settings.waitForLoaded()
    await settings.fillBaseUrl('https://api.kimi.com/coding/v1')
    await settings.fillModel('kimi-k2.6')
    await settings.fillLibraryPath(testLibraryPath)
    await settings.saveConfig()

    const envPath = path.join(testConfigDir, '.env')
    const envContent = fs.readFileSync(envPath, 'utf-8')
    expect(envContent).toContain('KIMI_BASE_URL=https://api.kimi.com/coding/v1')
    expect(envContent).toContain('KIMI_MODEL=kimi-k2.6')
    expect(envContent).toContain(`STUDY_LIBRARY_PATH=${testLibraryPath}`)
  })

  test('verify connection with real API', async ({ window }) => {
    test.setTimeout(120000)
    if (!process.env.KIMI_API_KEY) {
      test.skip('KIMI_API_KEY not available')
    }

    const cover = new CoverPage(window)
    await cover.enterIfNeeded()

    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.goToSettings()

    const settings = new SettingsPage(window)
    await settings.waitForLoaded()
    await settings.clickVerify()

    await expect(settings.page.locator(SELECTORS.settings.verifyStatus))
      .toContainText('正常', { timeout: 60000 })
  })
})
