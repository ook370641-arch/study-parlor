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
    // @real：应用从根目录 .env 复制密钥（见 createTestConfigDir），
    // 密钥缺失/占位符时 verify 失败即测试失败——不许用 skip 掩盖。
    test.setTimeout(120000)

    const cover = new CoverPage(window)
    await cover.enterIfNeeded()

    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.goToSettings()

    const settings = new SettingsPage(window)
    await settings.waitForLoaded()
    await settings.clickVerify()

    await expect(window.locator(SELECTORS.settings.verifyStatus))
      .toContainText('正常', { timeout: 60000 })
  })
})
