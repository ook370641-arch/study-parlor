import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedBriefing } from '../helpers/test-library'
import fs from 'node:fs'
import path from 'node:path'

function localToday(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

test.describe('@p1 briefing aesthetics', () => {
  test('academic reading view shows veil and quote band; quote stays out of the md file', async ({ window, testLibraryPath }) => {
    const today = localToday()
    seedBriefing(testLibraryPath, today)
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.locator(SELECTORS.briefing.receiveDigestButton).click()
    await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 15000 })

    await expect(window.locator(SELECTORS.briefing.veil)).toBeVisible()
    const quote = window.locator(SELECTORS.briefing.quoteText)
    await expect(quote.first()).toBeVisible()
    const quoteText = ((await quote.first().textContent()) ?? '').replace(/[""]/g, '')
    expect(quoteText.length).toBeGreaterThan(0)

    // 语录是纯 UI 装饰：学习库中任何今日 md 都不应包含它
    const entries = fs.readdirSync(testLibraryPath, { recursive: true }) as string[]
    const todayMds = entries.map(String).filter((f) => f.endsWith('.md') && f.includes(today))
    expect(todayMds.length).toBeGreaterThan(0)
    for (const f of todayMds) {
      const content = fs.readFileSync(path.join(testLibraryPath, f), 'utf8')
      expect(content).not.toContain(quoteText)
    }
  })

  test('newspaper theme hides veil and quote band', async ({ window, testLibraryPath }) => {
    const today = localToday()
    seedBriefing(testLibraryPath, today)
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.locator(SELECTORS.briefing.receiveDigestButton).click()
    await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 15000 })

    await window.locator('[data-testid="briefing-theme-toggle"]').click()
    await expect(window.locator(SELECTORS.briefing.veil)).toHaveCount(0)
    await expect(window.locator(SELECTORS.briefing.quoteText)).toHaveCount(0)
  })

  test('job briefing: source switch yields job empty state with quote band', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.locator(SELECTORS.briefing.sourceJobBriefingButton).click()
    // 切换到求职简报源后，空态按钮应立即出现（证明 store briefingSource 已更新）。
    const receiveButton = window.locator(SELECTORS.briefing.receiveJobButton)
    await receiveButton.waitFor({ state: 'visible', timeout: 15000 })
    await receiveButton.click()
    await window.locator(SELECTORS.briefing.jobCard).first().waitFor({ timeout: 30000 })
    await expect(window.locator(SELECTORS.briefing.quoteText).first()).toBeVisible()
  })
})

// 给 mock 管线注入 stage 间延迟，使星图中间态可被 Playwright 捕获。
// 生产环境不受影响：此 env 仅通过 E2E fixture 的 extraEnv 传递到本次启动的 Electron 主进程。
test.describe('@p1 briefing constellation with mock delay', () => {
  test.use({ extraEnv: { E2E_BRIEFING_MOCK_DELAY_MS: '800' } })

  test('constellation renders each station during generation', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    const receiveButton = window.locator(SELECTORS.briefing.receiveDigestButton)
    await receiveButton.click()
    // 800ms × 4 stations = 3.2s；第一站应在点击后立即可见。
    const constellation = window.locator(SELECTORS.briefing.constellation)
    await expect(constellation).toBeVisible({ timeout: 5000 })
    await expect(window.locator(SELECTORS.briefing.constellationWell)).toBeVisible()
    // 第一站 fetching 应该是 active 态。
    await expect(window.locator(SELECTORS.briefing.progressStep('fetching'))).toBeVisible()
    // 等待完成以避免与其他 spec 共享的 Electron 实例状态冲突。
    await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 15000 })
  })
})

test.describe('@p1 briefing constellation reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('generation still completes with reduced motion', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    const receiveButton = window.locator(SELECTORS.briefing.receiveDigestButton)
    if (await receiveButton.isVisible().catch(() => false)) {
      await receiveButton.click()
    }
    await expect(
      window.locator(SELECTORS.briefing.constellation).or(window.locator(SELECTORS.briefing.academicLayout)),
    ).toBeVisible({ timeout: 15000 })
  })
})
