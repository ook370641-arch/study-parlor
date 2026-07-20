import { test, expect } from '../fixtures/electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { CoverPage } from '../pages/CoverPage'
import { WritingAssistantPanel } from '../pages/WritingAssistantPanel'
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

    return new WritingAssistantPanel(window)
  }

  test('E2E mock 返回流式消息', async ({ window, testLibraryPath }) => {
    const assistant = await setupAssistant(window, testLibraryPath)
    await assistant.open()
    await assistant.send('你好')
    await assistant.waitForStreamingDone(15000)

    const messagesText = await assistant.messages.textContent()
    // E2E mock sends deterministic chunks: '这是一段', 'E2E 测试的', '写作助手回复。'
    expect(messagesText).toContain('E2E 测试')
  })

  test('E2E mock 发送工具事件 → 面板不崩溃', async ({ window, testLibraryPath }) => {
    const assistant = await setupAssistant(window, testLibraryPath)
    await assistant.open()
    await assistant.send('分析')
    await assistant.waitForStreamingDone(15000)

    // Panel should still be visible and responsive after tool events
    await expect(window.locator(SELECTORS.writing.assistantPanel)).toBeVisible()
  })

  test('last-writing-request.json 落盘含关键字段', async ({ window, testLibraryPath, testConfigDir }) => {
    const assistant = await setupAssistant(window, testLibraryPath)
    await assistant.open()
    await assistant.send('测试请求落盘')
    await assistant.waitForStreamingDone(15000)

    const requestPath = path.join(testConfigDir, 'last-writing-request.json')
    expect(fs.existsSync(requestPath)).toBe(true)

    const data = JSON.parse(fs.readFileSync(requestPath, 'utf8'))
    expect(data).toHaveProperty('useSearch')
    expect(data).toHaveProperty('thinkingEffort')
    expect(data).toHaveProperty('messageCount')
    expect(data).toHaveProperty('articlePath')
  })
})
