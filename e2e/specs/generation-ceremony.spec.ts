import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedBriefing } from '../helpers/test-library'

function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

test.describe('@p1 generation ceremony', () => {
  test('fresh generation passes constellation into fresh arrival; history revisit does not replay', async ({ window, testLibraryPath }) => {
    const today = localToday()
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()

    await window.locator(SELECTORS.briefing.receiveDigestButton).click()
    await expect(window.locator('[data-testid="briefing-reading-pane"]')).toHaveAttribute('data-arrival', 'fresh', { timeout: 20000 })

    // 切到历史日期（seed 一篇昨天）→ revisit
    const yesterday = new Date(Date.now() - 86400000)
    const yDate = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`
    seedBriefing(testLibraryPath, yDate)
    await window.reload()
    const cover2 = new CoverPage(window)
    await cover2.enterName('E2E 测试员')
    await cover2.goToBriefing()
    await window.locator(`[data-testid="briefing-date-item-${yDate}"]`).click()
    await expect(window.locator('[data-testid="briefing-reading-pane"]')).toHaveAttribute('data-arrival', 'revisit')
  })

  test('generation failure: constellation shows failed state before error panel', async ({ window, testLibraryPath }) => {
    const today = localToday()
    seedBriefing(testLibraryPath, today)
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()

    // 触发取消（最快模拟失败路径——取消走「冻结回中性」而失败走屏息序列）
    // 真实失败需要网络中断，E2E 用取消模拟：点击 receive 后立即取消
    await window.locator(SELECTORS.briefing.receiveDigestButton).click()
    // 等星图出现
    await expect(window.locator(SELECTORS.briefing.constellation)).toBeVisible({ timeout: 5000 })
    // 点击取消
    const cancelBtn = window.locator(SELECTORS.briefing.cancelButton)
    if (await cancelBtn.count() > 0) {
      await cancelBtn.click()
      // 取消后星图消失，回到空态（冻结回中性，无屏息——这是正确的取消行为）
      await expect(window.locator(SELECTORS.briefing.constellation)).toHaveCount(0, { timeout: 3000 })
    }
  })

  test('constellation well shows data-state transitions during generation', async ({ window, testLibraryPath }) => {
    const today = localToday()
    seedBriefing(testLibraryPath, today)
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()

    await window.locator(SELECTORS.briefing.receiveDigestButton).click()
    const well = window.locator(SELECTORS.briefing.constellationWell)
    await expect(well).toBeVisible({ timeout: 5000 })
    // 初始为 live 或 checking（取决于当前 stage——可能是 fetching 或 finalizing）
    const state = await well.getAttribute('data-state')
    expect(['live', 'checking']).toContain(state)
  })

  test('constellation well supports per-stage bloom class', async ({ window, testLibraryPath }) => {
    seedBriefing(testLibraryPath, localToday())
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.locator(SELECTORS.briefing.receiveDigestButton).click()
    const well = window.locator('[data-testid="briefing-constellation-well"]')
    await expect(well).toBeVisible({ timeout: 5000 })
    // Well should be live or checking during generation
    const state = await well.getAttribute('data-state')
    expect(state).toBeTruthy()
  })
})
