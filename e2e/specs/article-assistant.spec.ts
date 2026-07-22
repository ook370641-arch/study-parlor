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

  test('搜索按钮为持久开关，点击不发送消息', async ({ window, testLibraryPath }) => {
    const assistant = await openDigestArticle(window, testLibraryPath)
    await assistant.openChat()

    // 初始：关闭态（灰色，aria-pressed=false）
    await expect(assistant.searchBtn).toBeVisible()
    await expect(assistant.searchBtn).toHaveAttribute('aria-pressed', 'false')
    await expect(assistant.searchBtn).toHaveCSS('color', 'rgba(232, 213, 183, 0.4)')
    expect(await assistant.messageCount()).toBe(0)

    // 点击 → 开启态（蓝色）；开关本身不应发送任何消息
    await assistant.clickSearch()
    await expect(assistant.searchBtn).toHaveAttribute('aria-pressed', 'true')
    await expect(assistant.searchBtn).toHaveCSS('color', 'rgb(56, 189, 248)')
    expect(await assistant.messageCount()).toBe(0)

    // 再次点击 → 回到关闭态
    await assistant.clickSearch()
    await expect(assistant.searchBtn).toHaveAttribute('aria-pressed', 'false')
    await expect(assistant.searchBtn).toHaveCSS('color', 'rgba(232, 213, 183, 0.4)')
    expect(await assistant.messageCount()).toBe(0)
  })

  test('导读折叠箭头可点击（真实点击，pointer-capture 回归）', async ({ window, testLibraryPath }) => {
    const assistant = await openDigestArticle(window, testLibraryPath)
    await expect(assistant.divider).toBeVisible()

    const toggle = assistant.dividerToggle
    await expect(toggle).toBeVisible()
    // 初始：展开态（glyph ▶，导读栏有宽度）
    await expect(toggle).toHaveText('▶')
    expect(await assistant.guideSidebarWidth()).toBeGreaterThan(0)

    // 真实点击（非 dispatchEvent）——回归：divider 的 setPointerCapture 曾吞掉按钮 click
    await toggle.click()
    await expect(toggle).toHaveText('◀')
    await expect.poll(() => assistant.guideSidebarWidth()).toBe(0)

    // 再次点击 → 重新展开
    await toggle.click()
    await expect(toggle).toHaveText('▶')
    await expect.poll(() => assistant.guideSidebarWidth()).toBeGreaterThan(100)
  })

  test('聊天 Markdown 渲染：mock 回复正常渲染为 DOM', async ({ window, testLibraryPath }) => {
    const assistant = await openDigestArticle(window, testLibraryPath)
    await assistant.openChat()
    await assistant.typeQuestion('测试 markdown')
    await assistant.send()
    await assistant.waitForAssistantReply()

    // The mock returns '这是一段' + 'E2E 测试的' + '旁注回复。'
    // Verify the message appears (rendered via markdown component)
    await expect(assistant.chatWindow).toContainText('E2E 测试的')
    await expect(assistant.chatWindow).toContainText('旁注回复')

    // Chat window should be visible (no crash or render error)
    await expect(assistant.chatWindow).toBeVisible()

    // Sanity: message text is not empty and was actually streamed
    const messagesText = await assistant.chatMessages.last().textContent()
    expect(messagesText).toBeTruthy()
    expect(messagesText!.length).toBeGreaterThan(10)
  })

  test('文章上下文注入：last-assistant-request.json 含文章正文', async ({ window, testLibraryPath, testConfigDir }) => {
    const assistant = await openDigestArticle(window, testLibraryPath)
    await assistant.openChat()
    await assistant.typeQuestion('这篇文章讲了什么')
    await assistant.send()
    await assistant.waitForAssistantReply()

    const requestPath = path.join(testConfigDir, 'last-assistant-request.json')
    expect(fs.existsSync(requestPath)).toBe(true)
    const req = JSON.parse(fs.readFileSync(requestPath, 'utf8'))

    // The user message (messages[1]) should contain the article body
    const userContent = req.messages[1]?.content ?? ''
    expect(userContent).toContain('文章全文')
    expect(userContent.length).toBeGreaterThan(200) // article body is substantial
  })

})
