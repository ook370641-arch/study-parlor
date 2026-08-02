import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedStateJson } from '../helpers/test-library'

// Deterministic E2E for the fifth briefing source: 拾贝（Scout）.
// Uses the E2E mock branch in electron/ipc/scout.ts — no network required.

test.describe('拾贝来源', () => {
  test('sidebar 出现拾贝入口，点击进入 ScoutPanel', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()

    await expect(window.locator(SELECTORS.briefing.page)).toBeVisible()
    await expect(window.locator(SELECTORS.scout.sourceButton)).toBeVisible()
    await window.locator(SELECTORS.scout.sourceButton).click()

    // Scout panel mounts with chat tab active by default
    await expect(window.locator(SELECTORS.scout.panel)).toBeVisible()
    await expect(window.locator(SELECTORS.scout.tabChat)).toBeVisible()
    await expect(window.locator(SELECTORS.scout.tabArticles)).toBeVisible()
    await expect(window.locator(SELECTORS.scout.chatEmpty)).toBeVisible()
  })

  test('新建对话 → 发消息 → 候选卡片 → 确认抓取 → 文章入列', async ({
    window,
    testConfigDir,
  }) => {
    seedStateJson(testConfigDir, {
      profile: { name: 'E2E 测试员', profile_text: '', preferred_topics: [] },
      briefingSource: 'scout',
    })

    const cover = new CoverPage(window)
    await cover.goToBriefing()

    // Pre-seeded 'scout' source should show ScoutPanel directly
    await expect(window.locator(SELECTORS.scout.panel)).toBeVisible()
    await expect(window.locator(SELECTORS.scout.chatEmpty)).toBeVisible()

    // Create a new conversation
    await window.locator(SELECTORS.scout.newConversation).click()
    await expect(window.locator(SELECTORS.scout.chatView)).toBeVisible()

    // Send a message — mock returns two fetchable candidates
    await window.locator(SELECTORS.scout.chatInput).fill('帮我找 AI agent 的一手长文')
    await window.locator(SELECTORS.scout.chatSend).click()

    // Wait for mock candidates to appear (scout:tool event with candidates)
    await expect(window.locator(SELECTORS.scout.candidateCards)).toBeVisible({ timeout: 10000 })
    await expect(window.locator(SELECTORS.scout.candidate(0))).toBeVisible()
    await expect(window.locator(SELECTORS.scout.candidate(1))).toBeVisible()

    // Confirm all candidates — sends "抓取" message which triggers mock save
    await window.locator(SELECTORS.scout.confirmAllCandidates).click()

    // Wait for the fetch + save to complete, then switch to articles tab
    await window.waitForTimeout(500)
    await window.locator(SELECTORS.scout.tabArticles).click()

    // Two mock articles should be in the list
    await expect(window.getByText('ReAct 原文')).toBeVisible({ timeout: 10000 })
    await expect(window.getByText('The Second Half')).toBeVisible()
  })

  test('打开文章 → reader + 旁注助手出现', async ({ window, testConfigDir }) => {
    seedStateJson(testConfigDir, {
      profile: { name: 'E2E 测试员', profile_text: '', preferred_topics: [] },
      briefingSource: 'scout',
    })

    const cover = new CoverPage(window)
    await cover.goToBriefing()

    await expect(window.locator(SELECTORS.scout.panel)).toBeVisible()

    // Create conversation and run the full mock pipeline
    await window.locator(SELECTORS.scout.newConversation).click()
    await window.locator(SELECTORS.scout.chatInput).fill('找文章')
    await window.locator(SELECTORS.scout.chatSend).click()
    await expect(window.locator(SELECTORS.scout.candidateCards)).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.scout.confirmAllCandidates).click()

    // Switch to articles and open the first one
    await window.waitForTimeout(500)
    await window.locator(SELECTORS.scout.tabArticles).click()
    await expect(window.getByText('ReAct 原文')).toBeVisible({ timeout: 10000 })

    // Click article row to open reader
    await window.locator(SELECTORS.scout.articleRow).first().click()

    // Reader should be visible once the AnthropicArticleReader finishes loading
    await expect(
      window.locator('[data-testid="anthropic-article-reader"]'),
    ).toBeVisible({ timeout: 15000 })

    // ArticleAssistantPanel tab appears after reader content is loaded into store
    await expect(window.locator(SELECTORS.articleAssistant.tab)).toBeVisible({ timeout: 15000 })
  })
})
