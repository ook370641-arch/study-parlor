import { test, expect } from '../fixtures/electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { CoverPage } from '../pages/CoverPage'
import { ArticleAssistantPage } from '../pages/ArticleAssistantPage'
import { SELECTORS } from '../helpers/selectors'
import { seedBriefing } from '../helpers/test-library'
import type { Page } from '@playwright/test'

function localToday(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Seed a cached briefing digest, navigate cover → briefing → load the cached
 * digest, and wait until the article-assistant tab has mounted. Reuses the
 * existing seedBriefing helper (the on-disk digest format) rather than
 * inventing a new one.
 */
async function openDigestArticle(window: Page, libPath: string): Promise<ArticleAssistantPage> {
  const today = localToday()
  seedBriefing(libPath, today)

  const cover = new CoverPage(window)
  await cover.enterName('E2E 测试员')
  await cover.goToBriefing()

  // The briefing page starts empty; click the receive-digest button to load the
  // seeded cache (deterministic, no LLM).
  await window.locator(SELECTORS.briefing.receiveDigestButton).click()
  await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 15000 })

  const assistant = new ArticleAssistantPage(window)
  await assistant.waitForMounted()
  return assistant
}

function assistantSessionPath(libPath: string): string {
  const today = localToday()
  return path.join(libPath, '夜航简报', `夜航简报-${today}.assistant.md`)
}

async function waitForFile(filePath: string, timeoutMs = 15000): Promise<string> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (fs.existsSync(filePath)) return fs.readFileSync(filePath, 'utf8')
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`Timed out waiting for file: ${filePath}`)
}

test.describe('@p1 article assistant', () => {
  test('opens a briefing digest and toggles the chat window', async ({ window, testLibraryPath }) => {
    const assistant = await openDigestArticle(window, testLibraryPath)
    await expect(assistant.tab).toBeVisible()
    await assistant.openChat()
    await expect(assistant.chatWindow).toBeVisible()
  })

  test('renders the guide sidebar with background and term content', async ({ window, testLibraryPath }) => {
    await openDigestArticle(window, testLibraryPath)
    // GuideSidebar has no stable data-testid; assert on the deterministic mock
    // guide content (term is fixed by the E2E mock, so the text is stable).
    await expect(window.getByText('背景', { exact: false }).first()).toBeVisible({ timeout: 15000 })
    await expect(window.getByText('Constitutional AI').first()).toBeVisible()
  })

  test('sends a question and receives a streamed reply', async ({ window, testLibraryPath }) => {
    const assistant = await openDigestArticle(window, testLibraryPath)
    await assistant.openChat()
    await assistant.typeQuestion('What is Constitutional AI?')
    await assistant.send()
    await assistant.waitForAssistantReply()
    await expect(assistant.chatWindow).toContainText('E2E 测试的')
  })

  test('persists the session file with article-assistant frontmatter', async ({ window, testLibraryPath }) => {
    const assistant = await openDigestArticle(window, testLibraryPath)
    await assistant.openChat()
    await assistant.typeQuestion('Explain the article briefly.')
    await assistant.send()
    await assistant.waitForAssistantReply()

    const raw = await waitForFile(assistantSessionPath(testLibraryPath))
    expect(raw).toContain('type: article-assistant')
    expect(raw).toContain('parent_type: briefing')
  })

  // Real text selection via mouse drag over article prose is non-deterministic
  // across layouts/fonts in headless Electron; the selection → quote path is
  // covered by the component test instead.
  test.skip('selected text appears as a quote in the chat window', async () => {})

  // The resize handles use pointer-capture + window pointermove listeners which
  // Playwright's synthetic drag does not drive reliably; skipped to avoid flake.
  test.skip('resizing from the southeast corner changes window size', async () => {})
})
