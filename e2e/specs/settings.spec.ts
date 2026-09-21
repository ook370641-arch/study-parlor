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

    // AI 字段写 state.json 的 llmConfigs（不再写 .env）
    await settings.fillModel('kimi-k2.6')
    await settings.saveAiConfig()
    const statePath = path.join(testConfigDir, 'state.json')
    await expect.poll(() => {
      const s = JSON.parse(fs.readFileSync(statePath, 'utf-8'))
      return s.llmConfigs?.[0]?.model
    }).toBe('kimi-k2.6')

    // 学习库路径仍写 .env（IPC 异步落盘，轮询避免与 click 竞态）
    await settings.fillLibraryPath(testLibraryPath)
    await settings.saveLibraryPath()
    await expect.poll(() => {
      const envContent = fs.readFileSync(path.join(testConfigDir, '.env'), 'utf-8')
      return envContent.includes(`STUDY_LIBRARY_PATH=${testLibraryPath}`)
    }).toBe(true)
  })

  test('新增第二配置并启用，reload 后保持激活', async ({ window, testConfigDir }) => {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    const home = new HomePage(window)
    await home.waitForLoaded()
    await home.goToSettings()
    const settings = new SettingsPage(window)
    await settings.waitForLoaded()

    await settings.addLlmConfig()
    await expect(settings.draft()).toBeVisible()
    // 草稿区出现时原配置摘要可见（数据未丢）
    await expect(window.locator(SELECTORS.settings.llmCurrentSummary)).toContainText('使用中')

    await settings.draft().locator(SELECTORS.settings.apiKeyInput).fill('sk-second')
    await settings.draft().locator(SELECTORS.settings.baseUrlInput).fill('https://api.deepseek.com/v1')
    await settings.draft().locator(SELECTORS.settings.modelInput).fill('deepseek-v4-pro')
    await settings.saveDraft()

    await expect(settings.chips()).toHaveCount(2)
    await settings.chips().nth(1).click()
    await settings.activateEditing()

    // state.json 记录激活项
    const statePath = path.join(testConfigDir, 'state.json')
    await expect.poll(() => {
      const s = JSON.parse(fs.readFileSync(statePath, 'utf-8'))
      return s.llmConfigs?.find((c: any) => c.id === s.activeLlmConfigId)?.model
    }).toBe('deepseek-v4-pro')

    // reload 后激活态保持（state.json 持久化 + boot 归一不回弹）。
    // 注意：currentPage 不持久化，reload 后回到封面，需重新导航进设置。
    await window.reload()
    const cover2 = new CoverPage(window)
    await cover2.enterIfNeeded()
    const home2 = new HomePage(window)
    await home2.waitForLoaded()
    await home2.goToSettings()
    const settings2 = new SettingsPage(window)
    await settings2.waitForLoaded()
    await expect(settings2.chips().nth(1)).toContainText('使用中')
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
