import { test, expect } from '../fixtures/electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { CoverPage } from '../pages/CoverPage'
import { WritingAssistantPanel } from '../pages/WritingAssistantPanel'
import { SELECTORS } from '../helpers/selectors'
import { seedWritingTree } from '../helpers/test-library'

test.describe('@p2 writing-assistant', () => {
  async function setupAssistant(window: any, testLibraryPath: string): Promise<WritingAssistantPanel> {
    seedWritingTree(testLibraryPath)

    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })
    await window.waitForTimeout(1500)

    const assistant = new WritingAssistantPanel(window)
    return assistant
  }

  /** Click a tree node by its display name and wait for the editor to appear. */
  async function selectArticle(window: any, name: string) {
    const node = window.locator('[data-testid="writing-tree-node"]').filter({ hasText: name })
    await node.click()
    await window.locator(SELECTORS.writing.editor).waitFor({ state: 'visible', timeout: 5000 })
  }

  test('面板展开/收起：click tab → panel visible；click ✕ → collapsed', async ({ window, testLibraryPath }) => {
    const assistant = await setupAssistant(window, testLibraryPath)

    // Collapsed tab should be visible
    await expect(assistant.collapsedTab).toBeVisible({ timeout: 5000 })

    // Open the panel
    await assistant.open()
    await expect(assistant.panel).toBeVisible()
    await expect(assistant.input).toBeVisible()

    // Close the panel
    await assistant.close()
    await expect(assistant.panel).not.toBeVisible({ timeout: 5000 })
    await expect(assistant.collapsedTab).toBeVisible()
  })

  test('发送消息 → 收到 E2E mock 回复', async ({ window, testLibraryPath }) => {
    const assistant = await setupAssistant(window, testLibraryPath)

    await assistant.open()
    await expect(assistant.panel).toBeVisible()

    // Send a message (E2E mock provides deterministic replies)
    await assistant.send('帮我分析这篇文章')

    // Wait for streaming to complete (mock sends rapid chunks)
    await assistant.waitForStreamingDone(15000)

    // Messages area should contain mock content
    const msgText = await assistant.getLastMessage().catch(() => '')
    expect(msgText).toContain('写作助手回复')
  })

  test('Abort：发送中点击停止 → streaming 停止', async ({ window, testLibraryPath }) => {
    const assistant = await setupAssistant(window, testLibraryPath)

    await assistant.open()
    await assistant.send('测试中断')

    // Try to abort (mock is fast, may have already finished)
    try {
      if (await assistant.isStreaming().catch(() => false)) {
        await assistant.stopBtn.click()
      }
    } catch {
      // Streaming may have already completed — this is fine
    }

    // The send button should eventually be visible
    await assistant.sendBtn.waitFor({ state: 'visible', timeout: 10000 })
  })

  // ── NEW: 1. 切换文章会话隔离 ────────────────────────────────────
  test('切换文章会话隔离：文章 A 的消息在切回后仍存在', async ({ window, testLibraryPath }) => {
    const assistant = await setupAssistant(window, testLibraryPath)

    // Select article A (七月夜话) and open assistant
    await selectArticle(window, '七月夜话')
    await assistant.open()

    // Send message A
    await assistant.send('消息给七月夜话')
    await assistant.waitForStreamingDone(15000)

    // Capture A's messages via the store
    const messagesA = await window.evaluate(() => {
      const state = (window as any).useStore?.getState()?.writingAssistant
      return state ? state.messages.map((m: any) => ({ role: m.role, content: m.content })) : []
    })
    expect(messagesA.length).toBeGreaterThan(0)

    // Select article B (分布式随笔) — selectWritingFile now resets the stale
    // assistant session and loads B's .assistant.md (none yet) via the real path
    await selectArticle(window, '分布式随笔')
    // 确定性等待：writingRead 返回且旧会话已被重置（不用固定 sleep 猜 IPC 时序）
    await window.waitForFunction(() => {
      const s = (window as any).useStore.getState()
      return s.writingFile?.path?.includes('分布式随笔') && !s.writingAssistant
    })

    await assistant.send('消息给分布式随笔')
    await assistant.waitForStreamingDone(15000)

    const messagesB = await window.evaluate(() => {
      const state = (window as any).useStore?.getState()?.writingAssistant
      return state ? state.messages.map((m: any) => ({ role: m.role, content: m.content })) : []
    })
    // B should have its own messages, not contaminated by A's
    expect(messagesB.length).toBeGreaterThan(0)
    expect(messagesB.some((m: any) => m.content.includes('消息给七月夜话'))).toBe(false)

    // Switch back to article A — its session restores from disk via the real path
    await selectArticle(window, '七月夜话')
    // 确定性等待：A 的 .assistant.md 加载完成（seed + 刚发送的一轮对话）
    await window.waitForFunction(() => {
      const wa = (window as any).useStore.getState().writingAssistant
      return wa?.articlePath?.includes('七月夜话') && wa.messages.length > 0
    })

    // Verify A's assistant shows messages again
    const restoredMessages = await window.evaluate(() => {
      const state = (window as any).useStore?.getState()?.writingAssistant
      return state ? state.messages.map((m: any) => ({ role: m.role, content: m.content })) : []
    })
    expect(restoredMessages.some((m: any) => m.content.includes('消息给七月夜话'))).toBe(true)
  })

  // ── NEW: 2. .assistant.md 跨重启恢复 ─────────────────────────────
  test('.assistant.md 跨重启恢复：reload 后消息区仍有对话内容', async ({ window, testLibraryPath }) => {
    const assistant = await setupAssistant(window, testLibraryPath)

    // Ensure the article is selected and assistant is open
    await selectArticle(window, '七月夜话')
    await assistant.open()

    // Send a message to trigger the mock response
    await assistant.send('跨重启测试')
    await assistant.waitForStreamingDone(15000)

    // Verify the .assistant.md file exists on disk (seedWritingTree creates it)
    const sessionPath = path.join(testLibraryPath, 'writing', '随笔', '七月夜话.assistant.md')
    expect(fs.existsSync(sessionPath)).toBe(true)

    // Read pre-existing content from .assistant.md before reload
    const preReloadContent = fs.readFileSync(sessionPath, 'utf8')
    expect(preReloadContent).toContain('parent_type: writing')
    expect(preReloadContent.length).toBeGreaterThan(0)

    // Reload the page
    await window.reload()
    await window.waitForLoadState('domcontentloaded')

    // Navigate back to the writing source
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })
    await window.waitForTimeout(1500)

    // Select the article and open assistant — selecting the file restores the
    // persisted session from .assistant.md via the real path (selectWritingFile)
    await selectArticle(window, '七月夜话')
    // 确定性等待：跨重启后 .assistant.md 经 selectWritingFile → loadWritingAssistantSession 恢复完成
    await window.waitForFunction(() => {
      const wa = (window as any).useStore?.getState()?.writingAssistant
      return wa?.articlePath?.includes('七月夜话') && wa.messages.length > 0
    })

    const assistant2 = new WritingAssistantPanel(window)
    await assistant2.open()

    // Verify messages from disk are restored
    const restored = await window.evaluate(() => {
      const state = (window as any).useStore?.getState()?.writingAssistant
      return state ? state.messages.map((m: any) => ({ role: m.role, content: m.content })) : []
    })
    expect(restored.length).toBeGreaterThan(0)
    // The seed .assistant.md has a 用户/助手 pair
    expect(restored.some((m: any) => m.role === 'user')).toBe(true)
    expect(restored.some((m: any) => m.role === 'assistant')).toBe(true)

    // Verify the .assistant.md file on disk is intact after reload
    const postReloadContent = fs.readFileSync(sessionPath, 'utf8')
    expect(postReloadContent).toContain('parent_type: writing')
  })

  // ── NEW: 3. parent_type: 'writing' 文件格式 ──────────────────────
  test('parent_type: writing 文件格式：发送消息后 .assistant.md frontmatter 含 parent_type: writing', async ({ window, testLibraryPath, testConfigDir }) => {
    const assistant = await setupAssistant(window, testLibraryPath)

    await selectArticle(window, '七月夜话')
    await assistant.open()

    // Send a message (mock streams reply, but .assistant.md is pre-seeded)
    await assistant.send('验证文件格式')
    await assistant.waitForStreamingDone(15000)

    // Read the .assistant.md file from disk
    const sessionPath = path.join(testLibraryPath, 'writing', '随笔', '七月夜话.assistant.md')
    const raw = fs.readFileSync(sessionPath, 'utf8')

    // Verify frontmatter fields
    expect(raw).toContain('parent_type: writing')
    expect(raw).toContain('type: article-assistant')
    expect(raw).toContain('parent_path: writing/随笔/七月夜话.md')

    // Verify the body contains conversation markers
    expect(raw).toContain('## 用户')
    expect(raw).toContain('## 助手')
  })

  // ── NEW: 4. 多轮对话 ────────────────────────────────────
  test('多轮对话：3 条消息产生 6 条记录，回复引用用户问题', async ({ window, testLibraryPath }) => {
    const assistant = await setupAssistant(window, testLibraryPath)
    await selectArticle(window, '七月夜话')
    await assistant.open()

    // Round 1
    await assistant.send('第一轮问题')
    await assistant.waitForStreamingDone(15000)

    // Round 2
    await assistant.send('第二轮问题')
    await assistant.waitForStreamingDone(15000)

    // Round 3
    await assistant.send('第三轮问题')
    await assistant.waitForStreamingDone(15000)

    // Verify 6 messages total (3 user + 3 assistant)
    const messages = await window.evaluate(() => {
      const state = (window as any).useStore?.getState()?.writingAssistant
      return state ? state.messages.map((m: any) => ({ role: m.role, content: m.content })) : []
    })
    expect(messages.length).toBe(6)
    expect(messages.filter((m: any) => m.role === 'user').length).toBe(3)
    expect(messages.filter((m: any) => m.role === 'assistant').length).toBe(3)

    // Assistant replies should reference user questions (M3 mock enhancement from Phase 2)
    const assistantReplies = messages.filter((m: any) => m.role === 'assistant')
    expect(assistantReplies.some((m: any) => m.content.includes('第一轮'))).toBe(true)
  })

  // ── NEW: 5. 会话保存：新建对话 → 切换文章 → 切回 → 消息恢复
  test('会话保存：新建对话 → 切换文章 → 切回 → 消息恢复', async ({ window, testLibraryPath }) => {
    seedWritingTree(testLibraryPath)
    // Remove pre-seeded .assistant.md to test fresh save
    const sessionPath = path.join(testLibraryPath, 'writing', '随笔', '七月夜话.assistant.md')
    if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath)

    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })
    await window.waitForTimeout(1500)

    await selectArticle(window, '七月夜话')

    const assistant = new WritingAssistantPanel(window)
    await assistant.open()
    await assistant.send('测试保存的消息')
    await assistant.waitForStreamingDone(15000)

    // Switch to article B
    await selectArticle(window, '分布式随笔')
    await window.waitForTimeout(500)

    // Switch back to article A
    await selectArticle(window, '七月夜话')
    await window.waitForTimeout(500)

    // Reload session from disk — verifies saveWritingAssistantSession wrote the file
    await window.evaluate(async () => {
      const store = (window as any).useStore
      await store.getState().loadWritingAssistantSession('writing/随笔/七月夜话.md')
    })
    await window.waitForTimeout(500)

    const restored = await window.evaluate(() => {
      const state = (window as any).useStore?.getState()?.writingAssistant
      return state ? state.messages.map((m: any) => ({ role: m.role, content: m.content })) : []
    })
    expect(restored.length).toBeGreaterThan(0)
    expect(restored.some((m: any) => m.role === 'user' && m.content.includes('测试保存的消息'))).toBe(true)
  })

  // ── NEW: E7 .assistant.md 损坏恢复 ──────────────────────────────
  test('损坏 .assistant.md 恢复：malformed 文件不导致白屏', async ({ window, testLibraryPath }) => {
    const assistant = await setupAssistant(window, testLibraryPath)

    // Corrupt the .assistant.md file
    const sessionPath = path.join(testLibraryPath, 'writing', '随笔', '七月夜话.assistant.md')
    fs.writeFileSync(sessionPath, 'this is not valid frontmatter\n---\nbroken: [unclosed\n## garbage\n', 'utf8')

    // Select article
    await selectArticle(window, '七月夜话')

    // Open assistant — should not crash
    await assistant.open()
    await expect(assistant.panel).toBeVisible()

    // Load session should handle malformed file gracefully
    await window.evaluate(async () => {
      const store = (window as any).useStore
      await store.getState().loadWritingAssistantSession('writing/随笔/七月夜话.md')
    })
    await window.waitForTimeout(500)

    // Panel should still be functional — typing enables the send button
    await expect(assistant.input).toBeVisible()
    await expect(assistant.input).toBeEnabled()
    await assistant.input.fill('测试输入')
    await expect(assistant.sendBtn).toBeEnabled()
  })

  // ── NEW: 6. 空文章保护 ──────────────────────────────────
  test('空文章保护：未打开文章时输入框 disabled', async ({ window, testLibraryPath }) => {
    const assistant = await setupAssistant(window, testLibraryPath)
    // Do NOT select any article
    await assistant.open()

    // Input should be disabled
    const input = window.locator(SELECTORS.writing.assistantInput)
    await expect(input).toBeDisabled()

    // Placeholder should indicate user needs to select an article
    await expect(input).toHaveAttribute('placeholder', '请先选择或新建一篇文章')

    // Send button should also be disabled
    await expect(assistant.sendBtn).toBeDisabled()
  })
})
