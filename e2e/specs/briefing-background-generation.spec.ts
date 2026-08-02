import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedBriefing, seedJobBriefing } from '../helpers/test-library'

// 用例溯源：docs/superpowers/specs/2026-08-01-briefing-background-generation-design.md
// 验收清单 #1-#5。mock delay 拉长生成窗口，使切换动作落在生成中。

function localDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

test.describe('@p1 briefing background generation (digest)', () => {
  test.use({ extraEnv: { E2E_BRIEFING_MOCK_DELAY_MS: '1500' } })

  test('generating today: switch to past date and back, completion arrives fresh (#1 #2)', async ({ window, testLibraryPath }) => {
    const today = localDate()
    const yesterday = localDate(-1)
    seedBriefing(testLibraryPath, yesterday)
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()

    // 点今日开始生成 → 星图出现
    await window.locator(SELECTORS.briefing.receiveDigestButton).click()
    await expect(window.locator(SELECTORS.briefing.constellation)).toBeVisible({ timeout: 5000 })

    // 生成中点击历史日期 → 历史内容可见（revisit，无仪式），后台生成继续
    await window.locator(SELECTORS.briefing.dateItem(yesterday)).click()
    const pane = window.locator(SELECTORS.briefing.readingPane)
    await expect(pane).toBeVisible({ timeout: 5000 })
    await expect(pane).toHaveAttribute('data-arrival', 'revisit')
    await expect(pane).toContainText('Aaron Levie')

    // 点回今日 → 星图进度重新可见（不重演收束仪式）
    await window.locator(SELECTORS.briefing.dateItem(today)).click()
    await expect(window.locator(SELECTORS.briefing.constellation)).toBeVisible({ timeout: 5000 })

    // 完成时正在观看 → fresh 抵达
    await expect(pane).toHaveAttribute('data-arrival', 'fresh', { timeout: 20000 })
  })

  test('generating today: switching sources does not disturb progress (#3)', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()

    await window.locator(SELECTORS.briefing.receiveDigestButton).click()
    await expect(window.locator(SELECTORS.briefing.constellation)).toBeVisible({ timeout: 5000 })

    // 切到求职源 → 求职空态；切回前沿 → 星图仍在
    await window.locator(SELECTORS.briefing.sourceJobBriefingButton).click()
    await expect(window.locator(SELECTORS.briefing.receiveJobButton)).toBeVisible({ timeout: 5000 })
    await window.locator(SELECTORS.briefing.sourceDigestButton).click()
    await expect(window.locator(SELECTORS.briefing.constellation)).toBeVisible({ timeout: 5000 })

    // 等完成，避免影响共享 Electron 实例的后续用例
    await expect(window.locator(SELECTORS.briefing.readingPane)).toBeVisible({ timeout: 20000 })
  })

  test('completion while viewing past date: no takeover, flame lit, today loads as revisit (#4)', async ({ window, testLibraryPath }) => {
    const today = localDate()
    const yesterday = localDate(-1)
    seedBriefing(testLibraryPath, yesterday)
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()

    await window.locator(SELECTORS.briefing.receiveDigestButton).click()
    await expect(window.locator(SELECTORS.briefing.constellation)).toBeVisible({ timeout: 5000 })

    // 切去看历史日期，在生成完成时停留在那里
    await window.locator(SELECTORS.briefing.dateItem(yesterday)).click()
    const pane = window.locator(SELECTORS.briefing.readingPane)
    await expect(pane).toContainText('Aaron Levie', { timeout: 5000 })

    // 完成 → 今日火焰点亮，视图不被抢占（仍是昨天内容）
    await expect(window.locator(SELECTORS.briefing.dateFlame(today))).toHaveAttribute('data-state', 'lit', { timeout: 20000 })
    await expect(pane).toContainText('Aaron Levie')

    // 点击今日 → 缓存读取，revisit 展示
    await window.locator(SELECTORS.briefing.dateItem(today)).click()
    await expect(pane).toHaveAttribute('data-arrival', 'revisit', { timeout: 5000 })
    await expect(pane).toContainText('中文测试内容')
  })
})

test.describe('@p1 briefing background generation (job)', () => {
  test.use({ extraEnv: { E2E_JOB_BRIEFING_MOCK_DELAY_MS: '1500' } })

  test('generating today: switch to past date and back, completion arrives fresh (#5)', async ({ window, testLibraryPath }) => {
    const today = localDate()
    const yesterday = localDate(-1)
    seedJobBriefing(testLibraryPath, yesterday, '## 今日新动态\n\n- **[秋招开启] 测试公司** · 2026-07-31 — 昨日动态。\n  [原文链接](https://example.com/e)')
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.locator(SELECTORS.briefing.sourceJobBriefingButton).click()

    // 点今日开始生成 → 星图出现
    await window.locator(SELECTORS.briefing.receiveJobButton).click()
    await expect(window.locator(SELECTORS.briefing.constellation)).toBeVisible({ timeout: 5000 })

    // 生成中点击历史日期 → 历史内容可见，后台生成继续
    await window.locator(SELECTORS.briefing.dateItem(yesterday)).click()
    const pane = window.locator(SELECTORS.briefing.jobReadingPane)
    await expect(pane).toBeVisible({ timeout: 5000 })
    await expect(pane).toContainText('测试公司')

    // 点回今日 → 星图重新可见；完成 → fresh 抵达
    await window.locator(SELECTORS.briefing.dateItem(today)).click()
    await expect(window.locator(SELECTORS.briefing.constellation)).toBeVisible({ timeout: 5000 })
    await expect(pane).toHaveAttribute('data-arrival', 'fresh', { timeout: 20000 })
  })
})
