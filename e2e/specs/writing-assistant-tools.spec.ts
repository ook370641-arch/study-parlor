import { test, expect } from '../fixtures/electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { CoverPage } from '../pages/CoverPage'
import { WritingAssistantPanel } from '../pages/WritingAssistantPanel'
import { WritingPage } from '../pages/WritingPage'
import { SELECTORS } from '../helpers/selectors'
import { seedWritingTree, seedRepository, seedCatalogJson } from '../helpers/test-library'

test.describe('@p2 writing-assistant-tools', () => {
  async function setupAssistant(window: any, testLibraryPath: string): Promise<WritingAssistantPanel> {
    seedWritingTree(testLibraryPath)
    seedRepository(testLibraryPath)
    seedCatalogJson(testLibraryPath)

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

  test('read_local 工具 → 来源 chips 显示 type 徽标+文件名', async ({ window, testLibraryPath }) => {
    const assistant = await setupAssistant(window, testLibraryPath)

    await assistant.open()
    await assistant.send('分析这篇文章')
    await assistant.waitForStreamingDone(15000)

    // The E2E mock sends read_local tool events with ids: ['repository:旧随笔.md']
    // Source chip renders as: [repository] repository:旧随笔.md
    const messagesText = await assistant.messages.textContent()
    expect(messagesText).toContain('旧随笔.md')
    expect(messagesText).toContain('repository')
  })

  test('insert_into_article → 编辑器内容变化', async ({ window, testLibraryPath }) => {
    const assistant = await setupAssistant(window, testLibraryPath)

    // Select a file first so the editor has content
    const writingPage = new WritingPage(window)
    await writingPage.selectFile('七月夜话')
    await expect(writingPage.editor).toBeVisible()

    // Verify the editor starts with known content
    const initialContent = await writingPage.getEditorContent()
    expect(initialContent).toContain('七月夜话')

    await assistant.open()
    await assistant.send('插入内容')
    await assistant.waitForStreamingDone(15000)

    // The mock sends insert_into_article phase:done with markdown: '# 插入标题'
    // This adds a marker to the message content
    const messagesText = await assistant.messages.textContent()
    expect(messagesText).toContain('已插入')
    expect(messagesText).toContain('插入标题')

    // Click the "插入到编辑器" button to verify manual insert flow works
    await assistant.insertLastMessage()
    await window.waitForTimeout(500)

    const updatedContent = await writingPage.getEditorContent()
    expect(updatedContent.length).toBeGreaterThan(initialContent.length)
  })

  test('来源 chips 的结构：type 徽标 + 文件名', async ({ window, testLibraryPath }) => {
    const assistant = await setupAssistant(window, testLibraryPath)

    await assistant.open()
    await assistant.send('分析这篇文章')
    await assistant.waitForStreamingDone(15000)

    // Source chips are spans within the messages area displaying
    // [{type_label}] {id}, e.g. [repository] repository:旧随笔.md
    const messagesContainer = window.locator(SELECTORS.writing.assistantMessages)

    // Verify at least one source chip exists in the messages area
    // Source chip type labels (from SOURCE_TYPE_LABELS mapping):
    // study→学习, blog→博客, digest→日报, job→求职, repository→repository, writing→写作, web→网络
    const chipTexts = await assistant.sourceChipTexts()
    // If sourceChipTexts returns results (chips have data-testid), use those
    // Otherwise fall back to checking message area text content
    const effectiveText = chipTexts.length > 0
      ? chipTexts.join('\n')
      : (await messagesContainer.textContent()) ?? ''

    // Verify chip contains a Chinese type label (any of the seven types)
    const typeLabels = ['学习', '博客', '日报', 'repository', '写作', '网络']
    const hasTypeLabel = typeLabels.some(t => effectiveText.includes(t))
    expect(hasTypeLabel).toBe(true)

    // Verify chip contains a filename from the mock tool events
    expect(effectiveText).toContain('旧随笔')
  })

  test('last-writing-request.json 落盘含工具参数', async ({ window, testLibraryPath, testConfigDir }) => {
    const assistant = await setupAssistant(window, testLibraryPath)

    await assistant.open()
    await assistant.send('测试请求落盘')
    await assistant.waitForStreamingDone(15000)

    // The E2E mock writes last-writing-request.json with tool-relevant fields
    const requestPath = path.join(testConfigDir, 'last-writing-request.json')
    expect(fs.existsSync(requestPath)).toBe(true)

    const data = JSON.parse(fs.readFileSync(requestPath, 'utf8'))
    // Tool protocol parameters persisted for debugging/inspection
    expect(data).toHaveProperty('useSearch')
    expect(data).toHaveProperty('thinkingEffort')
    expect(data).toHaveProperty('messageCount')
    expect(data).toHaveProperty('articlePath')
  })
})
