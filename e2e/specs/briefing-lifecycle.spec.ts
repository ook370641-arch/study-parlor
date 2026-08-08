import { test, expect } from '../fixtures/electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedBriefing } from '../helpers/test-library'

function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

test.describe('@p1 digest 缓存命中', () => {
  test('第二次进入走缓存，不再触发生成（mock 计数=1）', async ({ window, testLibraryPath, testConfigDir }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.briefing.receiveDigestButton).click()
    await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 15000 })
    await window.reload()
    const cover2 = new CoverPage(window)
    // 不能用 enterIfNeeded：它会点「点亮灯火/进入夜话」跳去 home，
    // 而 goToBriefing 需要留在 cover 上点「夜航简报」。enterName 只填名字不导航。
    await cover2.enterName('E2E 测试员')
    await cover2.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.briefing.receiveDigestButton).click()
    await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 15000 })
    const counter = JSON.parse(fs.readFileSync(path.join(testConfigDir, 'briefing-mock-count.json'), 'utf8'))
    expect(counter.count).toBe(1)
  })
})

test.describe('@p1 digest 错误重试', () => {
  test('NETWORK_ERROR → 点重试 → mock 生成成功', async ({ window, testLibraryPath }) => {
    seedBriefing(testLibraryPath, localToday(), '## Error\n\nBRIEFING_NETWORK_ERROR')
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.briefing.receiveDigestButton).click()
    await expect(window.locator(SELECTORS.briefing.errorDisplay)).toBeVisible({ timeout: 15000 })
    await expect(window.locator(SELECTORS.briefing.errorDisplay)).toContainText('信号塔暂时失联')
    await window.locator(SELECTORS.briefing.retryButton).click()
    await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 15000 })
    await expect(window.locator(SELECTORS.briefing.errorDisplay)).toHaveCount(0)
  })
})
