import { test, expect } from '../fixtures/electron'
import type { Page } from '@playwright/test'
import { CoverPage } from '../pages/CoverPage'
import { ArticleAssistantPage } from '../pages/ArticleAssistantPage'
import { SELECTORS } from '../helpers/selectors'
import { seedBlogArticleWithCache } from '../helpers/test-library'

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
})
