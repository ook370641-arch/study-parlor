import { test, expect } from '../fixtures/electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedJobBriefing } from '../helpers/test-library'

function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function gotoJobBriefing(window: any) {
  const cover = new CoverPage(window)
  await cover.enterName('E2E 测试员')
  await cover.goToBriefing()
  await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
  await window.locator(SELECTORS.briefing.sourceJobBriefingButton).click()
}

test.describe('@p1 job-briefing 失败路径', () => {
  test('缓存错误 → 错误 UI + 重试按钮 + 正确文案', async ({ window, testLibraryPath }) => {
    seedJobBriefing(testLibraryPath, localToday(), `## Error\nJOB_NETWORK_ERROR`)
    await gotoJobBriefing(window)

    await window.locator(SELECTORS.briefing.receiveJobButton).click()
    await expect(window.locator(SELECTORS.briefing.errorDisplay)).toBeVisible({ timeout: 15000 })
    await expect(window.locator(SELECTORS.briefing.errorDisplay)).toContainText('网络异常')
    await expect(window.locator(SELECTORS.briefing.retryButton)).toBeVisible()
  })

  test('MISSING_SEARCH_KEY → 无重试按钮', async ({ window, testLibraryPath }) => {
    seedJobBriefing(testLibraryPath, localToday(), `## Error\nJOB_MISSING_SEARCH_KEY`)
    await gotoJobBriefing(window)

    await window.locator(SELECTORS.briefing.receiveJobButton).click()
    await expect(window.locator(SELECTORS.briefing.errorDisplay)).toBeVisible({ timeout: 15000 })
    await expect(window.locator(SELECTORS.briefing.errorDisplay)).toContainText('Tavily')
    await expect(window.locator(SELECTORS.briefing.retryButton)).toHaveCount(0)
  })

  // ── 全部 9 个错误码覆盖 ──
  const ERROR_CODE_FIXTURES: { code: string; text: string; hasRetry: boolean }[] = [
    { code: 'JOB_TAVILY_ERROR', text: '搜索服务暂时不可用', hasRetry: true },
    { code: 'JOB_LLM_ERROR', text: 'AI 服务暂时不可用', hasRetry: true },
    { code: 'JOB_OFFICIAL_PAGE_FAILED', text: '部分官方招聘页获取失败', hasRetry: true },
    { code: 'JOB_EXTRACTION_ERROR', text: '岗位信息提取失败', hasRetry: true },
    { code: 'JOB_EMPTY_RESULTS', text: '今日暂无岗位信息', hasRetry: true },
    { code: 'JOB_CACHE_WRITE_FAILED', text: '缓存写入失败', hasRetry: false },
    { code: 'JOB_TIMEOUT', text: '生成超时', hasRetry: true },
  ]

  for (const { code, text, hasRetry } of ERROR_CODE_FIXTURES) {
    test(`${code} → "${text}" + retry=${hasRetry}`, async ({ window, testLibraryPath }) => {
      seedJobBriefing(testLibraryPath, localToday(), `## Error\n${code}`)
      await gotoJobBriefing(window)

      await window.locator(SELECTORS.briefing.receiveJobButton).click()
      await expect(window.locator(SELECTORS.briefing.errorDisplay)).toBeVisible({ timeout: 15000 })
      await expect(window.locator(SELECTORS.briefing.errorDisplay)).toContainText(text)
      if (hasRetry) {
        await expect(window.locator(SELECTORS.briefing.retryButton)).toBeVisible()
      } else {
        await expect(window.locator(SELECTORS.briefing.retryButton)).toHaveCount(0)
      }
    })
  }

  test('错误态点重试 → force 绕过错误缓存 → mock 成功', async ({ window, testLibraryPath }) => {
    seedJobBriefing(testLibraryPath, localToday(), `## Error\nJOB_NETWORK_ERROR`)
    await gotoJobBriefing(window)

    await window.locator(SELECTORS.briefing.receiveJobButton).click()
    await expect(window.locator(SELECTORS.briefing.errorDisplay)).toBeVisible({ timeout: 15000 })

    await window.locator(SELECTORS.briefing.retryButton).click()
    await expect(window.getByRole('heading', { name: '今日新动态' })).toBeVisible({ timeout: 30000 })
    await expect(window.locator(SELECTORS.briefing.errorDisplay)).toHaveCount(0)
  })

  test('失败后离开再回来 → 显示错误 UI，不卡骨架屏', async ({ window, testLibraryPath }) => {
    seedJobBriefing(testLibraryPath, localToday(), `## Error\nJOB_NETWORK_ERROR`)
    await gotoJobBriefing(window)

    await window.locator(SELECTORS.briefing.receiveJobButton).click()
    await expect(window.locator(SELECTORS.briefing.errorDisplay)).toBeVisible({ timeout: 15000 })

    await window.locator(SELECTORS.briefing.sourceDigestButton).click()
    await window.locator(SELECTORS.briefing.sourceJobBriefingButton).click()

    await expect(window.locator(SELECTORS.briefing.errorDisplay)).toBeVisible({ timeout: 15000 })
    await expect(window.locator(SELECTORS.briefing.skeleton)).toHaveCount(0)
  })
})

test.describe('@p1 job-briefing 档案入口', () => {
  test('求职档案面板可通过页面内触发按钮打开', async ({ window, testLibraryPath }) => {
    // 需要有简报结果才会渲染 trigger（trigger 在简报 meta 行内）
    seedJobBriefing(testLibraryPath, localToday(), `## 今日新动态\n\n- 测试条目`)
    await gotoJobBriefing(window)
    await window.locator(SELECTORS.briefing.receiveJobButton).click()
    await expect(window.getByRole('heading', { name: '今日新动态' })).toBeVisible({ timeout: 15000 })

    await expect(window.locator('[data-testid="job-profile-panel-trigger"]')).toBeVisible()
  })
})

test.describe('@p1 简报删除', () => {
  test('选择删除模式 → 勾选 → 确认 → 文件与列表条目消失', async ({ window, testLibraryPath }) => {
    const content = `## 今日新动态\n\n- 测试条目`
    seedJobBriefing(testLibraryPath, '2026-07-19', content)
    seedJobBriefing(testLibraryPath, '2026-07-20', content)
    await gotoJobBriefing(window)

    await expect(window.locator(SELECTORS.briefing.dateItem('2026-07-20'))).toBeVisible({ timeout: 10000 })
    await expect(window.locator(SELECTORS.briefing.dateItem('2026-07-19'))).toBeVisible()

    await window.locator(SELECTORS.briefing.dateItem('2026-07-19')).click({ button: 'right' })
    await window.locator(SELECTORS.briefing.dateDelete).click()

    await expect(window.locator(SELECTORS.briefing.confirmDialog)).toBeVisible()
    await window.locator(SELECTORS.briefing.confirmDialogConfirm).click()

    await expect(window.locator(SELECTORS.briefing.dateItem('2026-07-19'))).toHaveCount(0, { timeout: 10000 })
    await expect(window.locator(SELECTORS.briefing.dateItem('2026-07-20'))).toBeVisible()
    expect(fs.existsSync(path.join(testLibraryPath, '求职简报', '求职简报-2026-07-19.md'))).toBe(false)
    expect(fs.existsSync(path.join(testLibraryPath, '求职简报', '求职简报-2026-07-20.md'))).toBe(true)
  })
})
