import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedStateJson } from '../helpers/test-library'

// E2E for Scout persistence: conversations and articles survive page reload.
// Uses the deterministic mock in electron/ipc/scout.ts.

test.describe('拾贝持久化', () => {
  test('跨重载持久化 —— 对话和文章在页面刷新后仍然存在', async ({ window, testConfigDir }) => {
    seedStateJson(testConfigDir, {
      profile: { name: 'E2E 测试员', profile_text: '', preferred_topics: [] },
      briefingSource: 'scout',
    })

    const cover = new CoverPage(window)
    await cover.goToBriefing()

    await expect(window.locator(SELECTORS.scout.panel)).toBeVisible()

    // Create conversation and run the full mock pipeline
    await window.locator(SELECTORS.scout.newConversation).click()
    await expect(window.locator(SELECTORS.scout.chatView)).toBeVisible()
    await window.locator(SELECTORS.scout.chatInput).fill('找文章')
    await window.locator(SELECTORS.scout.chatSend).click()

    // Wait for candidates and confirm all
    await expect(window.locator(SELECTORS.scout.candidateCards)).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.scout.confirmAllCandidates).click()

    // Wait for articles to be saved
    await expect(
      window.locator(SELECTORS.scout.articleRowByUrl('https://example.com/article-0')),
    ).toBeVisible({ timeout: 10000 })
    await expect(
      window.locator(SELECTORS.scout.articleRowByUrl('https://example.com/article-1')),
    ).toBeVisible()

    // Note the conversation ID from the data-testid attribute
    const convLocator = window.locator('[data-testid^="scout-conversation-"]').first()
    const testid = await convLocator.getAttribute('data-testid')
    const convId = testid!.replace('scout-conversation-', '')
    expect(convId).toBeTruthy()

    // Reload the page
    await window.reload()
    await window.waitForLoadState('domcontentloaded')

    // Navigate back to Scout
    const cover2 = new CoverPage(window)
    await cover2.goToBriefing()
    await expect(window.locator(SELECTORS.scout.panel)).toBeVisible({ timeout: 10000 })

    // Assert the conversation still exists in the list
    await expect(
      window.locator(SELECTORS.scout.conversation(convId)),
    ).toBeVisible({ timeout: 5000 })

    // Switch to articles tab and assert articles survived
    await window.locator(SELECTORS.scout.tabArticles).click()
    await expect(
      window.locator(SELECTORS.scout.articleRowByUrl('https://example.com/article-0')),
    ).toBeVisible({ timeout: 10000 })
    await expect(
      window.locator(SELECTORS.scout.articleRowByUrl('https://example.com/article-1')),
    ).toBeVisible()
  })
})
