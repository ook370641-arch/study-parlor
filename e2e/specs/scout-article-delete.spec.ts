import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedStateJson } from '../helpers/test-library'

// E2E coverage for Scout article delete.
// Uses the deterministic E2E mock branch in electron/ipc/scout.ts — no network required.

test.describe('拾贝文章删除', () => {
  test('从文章Tab删除文章 → 文章行消失 + reader 关闭', async ({
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

    // Full mock pipeline: create conversation → send message → confirm fetch
    await window.locator(SELECTORS.scout.newConversation).click()
    await expect(window.locator(SELECTORS.scout.chatView)).toBeVisible()

    await window.locator(SELECTORS.scout.chatInput).fill('找文章')
    await window.locator(SELECTORS.scout.chatSend).click()

    // Wait for mock candidates to appear, then confirm all
    await expect(window.locator(SELECTORS.scout.candidateCards)).toBeVisible({
      timeout: 10000,
    })
    await window.locator(SELECTORS.scout.confirmAllCandidates).click()

    // Wait for articles to be saved, then switch to articles tab
    await expect(
      window.locator(SELECTORS.scout.articleRowByUrl('https://example.com/article-0')),
    ).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.scout.tabArticles).click()
    await expect(
      window.locator(SELECTORS.scout.articleRowByUrl('https://example.com/article-0')),
    ).toBeVisible({ timeout: 10000 })

    // Open reader for the first article
    await window
      .locator(SELECTORS.scout.articleRowByUrl('https://example.com/article-0'))
      .click()
    await expect(
      window.locator('[data-testid="anthropic-article-reader"]'),
    ).toBeVisible({ timeout: 15000 })

    // Hover article row to reveal delete button (opacity-0 → group-hover:opacity-100)
    const articleRow = window.locator(
      SELECTORS.scout.articleRowByUrl('https://example.com/article-0'),
    )
    await articleRow.hover()

    // Click delete button within the article row
    const deleteBtn = articleRow.locator(SELECTORS.scout.articleDelete)
    await expect(deleteBtn).toBeVisible()
    await deleteBtn.click()

    // Confirm dialog should appear
    await expect(window.locator(SELECTORS.confirmDialog.dialog)).toBeVisible()
    await window.locator(SELECTORS.confirmDialog.confirmButton).click()

    // Wait for dialog to close
    await expect(window.locator(SELECTORS.confirmDialog.dialog)).not.toBeVisible({
      timeout: 5000,
    })

    // Assert article row disappears from the list
    await expect(
      window.locator(SELECTORS.scout.articleRowByUrl('https://example.com/article-0')),
    ).not.toBeVisible({ timeout: 5000 })

    // Assert reader closes since the open article was deleted
    await expect(
      window.locator('[data-testid="anthropic-article-reader"]'),
    ).not.toBeVisible({ timeout: 5000 })
  })
})
