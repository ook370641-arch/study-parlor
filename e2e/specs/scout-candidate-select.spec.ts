import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedStateJson } from '../helpers/test-library'

// E2E for Scout candidate selection: partial select and abort during streaming.
// Uses the deterministic mock in electron/ipc/scout.ts.

test.describe('拾贝候选选择', () => {
  test('部分选择候选 → 仅确认第一篇文章入库', async ({ window, testConfigDir }) => {
    seedStateJson(testConfigDir, {
      profile: { name: 'E2E 测试员', profile_text: '', preferred_topics: [] },
      briefingSource: 'scout',
    })

    const cover = new CoverPage(window)
    await cover.goToBriefing()

    // Pre-seeded 'scout' source should show ScoutPanel directly
    await expect(window.locator(SELECTORS.scout.panel)).toBeVisible()

    // Create a new conversation
    await window.locator(SELECTORS.scout.newConversation).click()
    await expect(window.locator(SELECTORS.scout.chatView)).toBeVisible()

    // Send a message — mock returns two fetchable candidates
    await window.locator(SELECTORS.scout.chatInput).fill('找 AI agent 相关的文章')
    await window.locator(SELECTORS.scout.chatSend).click()

    // Wait for mock candidates to appear
    await expect(window.locator(SELECTORS.scout.candidateCards)).toBeVisible({ timeout: 10000 })
    await expect(window.locator(SELECTORS.scout.candidate(0))).toBeVisible()
    await expect(window.locator(SELECTORS.scout.candidate(1))).toBeVisible()

    // Click only the first candidate card — should toggle selection on
    await window.locator(SELECTORS.scout.candidate(0)).click()
    // Assert the ✓ selection indicator is shown inside the first candidate
    await expect(window.locator(SELECTORS.scout.candidate(0))).toContainText('✓')

    // Partial confirm — only the selected candidate should be fetched
    await window.locator(SELECTORS.scout.confirmCandidates).click()

    // Wait for the first article to appear (saved by mock)
    await expect(
      window.locator(SELECTORS.scout.articleRowByUrl('https://example.com/article-0')),
    ).toBeVisible({ timeout: 10000 })

    // Switch to articles tab
    await window.locator(SELECTORS.scout.tabArticles).click()

    // Only the first article should be visible — the second was not selected
    await expect(
      window.locator(SELECTORS.scout.articleRowByUrl('https://example.com/article-0')),
    ).toBeVisible()
    await expect(
      window.locator(SELECTORS.scout.articleRowByUrl('https://example.com/article-1')),
    ).not.toBeVisible()
  })

  test('流式生成中终止 → 发送按钮恢复，候选卡片不出现', async ({ window, testConfigDir }) => {
    seedStateJson(testConfigDir, {
      profile: { name: 'E2E 测试员', profile_text: '', preferred_topics: [] },
      briefingSource: 'scout',
    })

    const cover = new CoverPage(window)
    await cover.goToBriefing()

    await expect(window.locator(SELECTORS.scout.panel)).toBeVisible()

    // Create a new conversation
    await window.locator(SELECTORS.scout.newConversation).click()
    await expect(window.locator(SELECTORS.scout.chatView)).toBeVisible()

    // Send a message
    await window.locator(SELECTORS.scout.chatInput).fill('找 AI agent 相关的文章')
    await window.locator(SELECTORS.scout.chatSend).click()

    // Abort button should appear while streaming (mock has a 300ms delay)
    await expect(window.locator(SELECTORS.scout.chatAbort)).toBeVisible({ timeout: 5000 })

    // Click abort before the mock sends candidate cards
    await window.locator(SELECTORS.scout.chatAbort).click()

    // Send button should re-appear after abort
    await expect(window.locator(SELECTORS.scout.chatSend)).toBeVisible({ timeout: 5000 })

    // Candidate cards should never have appeared
    await expect(window.locator(SELECTORS.scout.candidateCards)).not.toBeVisible()
  })
})
