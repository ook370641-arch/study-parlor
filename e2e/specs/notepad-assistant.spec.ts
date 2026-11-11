import { test, expect } from '../fixtures/electron'
import type { Page } from '@playwright/test'
import { CoverPage } from '../pages/CoverPage'
import { ArticleAssistantPage } from '../pages/ArticleAssistantPage'
import { SELECTORS } from '../helpers/selectors'
import { seedBlogArticleWithCache, seedStateJson } from '../helpers/test-library'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ARTICLE_SLUG = 'e2e-notepad-assistant-article'
const ARTICLE_TITLE = 'E2E Notepad Assistant Article'
const ARTICLE_BODY = '## Coexistence\n\n记事板与旁注聊天应可同时使用，点击正文外部仍关闭记事板。'

async function openAssistantArticle(window: Page, libPath: string, configDir: string): Promise<ArticleAssistantPage> {
  seedBlogArticleWithCache(libPath, configDir, { slug: ARTICLE_SLUG, title: ARTICLE_TITLE, body: ARTICLE_BODY })

  const cover = new CoverPage(window)
  await cover.goToBriefing()
  await expect(window.locator(SELECTORS.briefing.anthropicPanel)).toBeVisible({ timeout: 10000 })
  await window.locator(`${SELECTORS.briefing.anthropicArticleRow}:has-text("${ARTICLE_TITLE}")`).click()
  await expect(window.locator(SELECTORS.briefing.anthropicArticleReader)).toBeVisible({ timeout: 15000 })

  const assistant = new ArticleAssistantPage(window)
  await assistant.waitForMounted()
  return assistant
}

test.describe('@p1 notepad with article assistant', () => {
  test('keeps notepad available beside the assistant and closes on other outside clicks', async ({ window, testLibraryPath, testConfigDir }) => {
    const assistant = await openAssistantArticle(window, testLibraryPath, testConfigDir)
    const fab = window.getByTestId('notepad-fab-button')
    const notepad = window.getByTestId('notepad-panel')

    await fab.click()
    await expect(notepad).toBeVisible()

    await assistant.openChat()
    await expect(assistant.chatWindow).toBeVisible()
    await expect(notepad).toBeVisible()
    await expect(fab).toHaveClass(/left-5/)
    await expect(notepad).toHaveClass(/left-5/)

    await assistant.input.fill('在旁注输入不会关闭记事板')
    await expect(notepad).toBeVisible()

    await window.locator(SELECTORS.briefing.anthropicReaderTitle).click()
    await expect(notepad).not.toBeVisible()
  })

  test('shows an agent claim written to the test config after reopening the panel', async ({ window, testConfigDir }) => {
    const itemId = 'e2e-notepad-claim'
    seedStateJson(testConfigDir, {
      notepadItems: [{ id: itemId, text: '验证 Agent 认领刷新', category: 'feature', createdAt: '2026-11-11T00:00:00Z' }],
      notepadLog: [],
    })

    const fab = window.getByTestId('notepad-fab-button')
    const notepad = window.getByTestId('notepad-panel')
    const claim = window.getByTestId(`notepad-claim-${itemId}`)

    await fab.click()
    await expect(notepad).toBeVisible()
    await expect(claim).toHaveCount(0)

    fs.writeFileSync(path.join(testConfigDir, 'notepad-claims.json'), JSON.stringify({
      [itemId]: { claimedBy: 'codex/e2e-claim', claimedAt: '2026-11-11T01:00:00Z' },
    }))

    await fab.click()
    await expect(notepad).not.toBeVisible()
    await fab.click()
    await expect(claim).toHaveText('处理中 · codex/e2e-claim')
  })

  test('highlights only log entries resolved today', async ({ window, testConfigDir }) => {
    const today = new Date()
    today.setHours(12, 0, 0, 0)
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    seedStateJson(testConfigDir, {
      notepadItems: [],
      notepadLog: [
        { id: 'e2e-log-today', title: '今天完成的需求', text: '今天完成的需求', category: 'feature', createdAt: today.toISOString(), resolvedAt: today.toISOString(), source: 'agent' },
        { id: 'e2e-log-yesterday', title: '昨天完成的需求', text: '昨天完成的需求', category: 'feature', createdAt: yesterday.toISOString(), resolvedAt: yesterday.toISOString(), source: 'agent' },
      ],
    })

    await window.getByTestId('notepad-fab-button').click()
    await window.getByTestId('notepad-tab-done').click()

    const todayEntries = window.getByTestId('notepad-log-today')
    await expect(todayEntries).toHaveCount(1)
    await expect(todayEntries).toContainText('今天完成的需求')
    await expect(todayEntries).toContainText('今日完成 · 待测试')

    const yesterdayEntry = window.getByTestId('notepad-log-entry').filter({ hasText: '昨天完成的需求' })
    await expect(yesterdayEntry).toBeVisible()
    await expect(yesterdayEntry).not.toContainText('今日完成 · 待测试')
    await expect(yesterdayEntry).not.toHaveClass(/border-ember\/35/)
    await expect(yesterdayEntry).not.toHaveClass(/bg-ember\/10/)
  })
})
