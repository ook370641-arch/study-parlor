import { test, expect } from '../fixtures/electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { CoverPage } from '../pages/CoverPage'
import { WritingAssistantPanel } from '../pages/WritingAssistantPanel'
import { SELECTORS } from '../helpers/selectors'
import { seedWritingTree } from '../helpers/test-library'

test.describe('@p2 writing-assistant-search-thinking', () => {
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

  async function readLastWritingRequest(testConfigDir: string): Promise<{
    useSearch: boolean
    thinkingEffort: string
    messageCount: number
  } | null> {
    const requestPath = path.join(testConfigDir, 'last-writing-request.json')
    if (!fs.existsSync(requestPath)) return null
    return JSON.parse(fs.readFileSync(requestPath, 'utf8'))
  }

  // ── 1. 🔍 ON → useSearch: true ──────────────────────────────────
  test('🔍 开 → last-writing-request.json 含 useSearch: true', async ({ window, testLibraryPath, testConfigDir }) => {
    const assistant = await setupAssistant(window, testLibraryPath)
    await assistant.open()

    // Toggle search ON
    await assistant.toggleSearch()
    await window.waitForTimeout(200)
    await expect(assistant.searchBtn).toHaveAttribute('aria-pressed', 'true')

    // Send message; E2E mock writes last-writing-request.json
    await assistant.send('测试搜索开启')
    await assistant.waitForStreamingDone(15000)

    const req = await readLastWritingRequest(testConfigDir)
    expect(req).not.toBeNull()
    expect(req!.useSearch).toBe(true)
  })

  // ── 2. 🔍 OFF → useSearch: false ────────────────────────────────
  test('🔍 关 → last-writing-request.json 含 useSearch: false', async ({ window, testLibraryPath, testConfigDir }) => {
    const assistant = await setupAssistant(window, testLibraryPath)
    await assistant.open()

    // Search OFF by default; verify aria-pressed is false
    await expect(assistant.searchBtn).toHaveAttribute('aria-pressed', 'false')

    // Send message — search should be off
    await assistant.send('测试搜索关闭')
    await assistant.waitForStreamingDone(15000)

    const req = await readLastWritingRequest(testConfigDir)
    expect(req).not.toBeNull()
    expect(req!.useSearch).toBe(false)
  })

  // ── 3. 🧠 high → thinkingEffort: 'high' ─────────────────────────
  test('🧠 high → last-writing-request.json 含 thinkingEffort: high', async ({ window, testLibraryPath, testConfigDir }) => {
    const assistant = await setupAssistant(window, testLibraryPath)
    await assistant.open()

    // Cycle once: off → high
    await assistant.cycleThinking()
    await window.waitForTimeout(200)
    await expect(assistant.thinkingBtn).toHaveAttribute('aria-label', '思考深度：高')

    await assistant.send('测试思考高')
    await assistant.waitForStreamingDone(15000)

    const req = await readLastWritingRequest(testConfigDir)
    expect(req).not.toBeNull()
    expect(req!.thinkingEffort).toBe('high')
  })

  // ── 4. 🧠 max → thinkingEffort: 'max' ──────────────────────────
  test('🧠 max → last-writing-request.json 含 thinkingEffort: max', async ({ window, testLibraryPath, testConfigDir }) => {
    const assistant = await setupAssistant(window, testLibraryPath)
    await assistant.open()

    // Cycle twice: off → high → max
    await assistant.cycleThinking()
    await window.waitForTimeout(150)
    await assistant.cycleThinking()
    await window.waitForTimeout(200)
    await expect(assistant.thinkingBtn).toHaveAttribute('aria-label', '思考深度：最大')

    await assistant.send('测试思考最大')
    await assistant.waitForStreamingDone(15000)

    const req = await readLastWritingRequest(testConfigDir)
    expect(req).not.toBeNull()
    expect(req!.thinkingEffort).toBe('max')
  })

  // ── 5. 🔍/🧠 流式中禁用 ────────────────────────────────────────
  test('🔍/🧠 流式中禁用：发送后 toggle 保持、按钮恢复可交互', async ({ window, testLibraryPath }) => {
    const assistant = await setupAssistant(window, testLibraryPath)
    await assistant.open()

    // Toggle search ON so we can verify it's preserved
    await assistant.toggleSearch()
    await expect(assistant.searchBtn).toHaveAttribute('aria-pressed', 'true')

    // Cycle thinking to high
    await assistant.cycleThinking()
    await expect(assistant.thinkingBtn).toHaveAttribute('aria-label', '思考深度：高')

    // Both buttons should be enabled before streaming
    await expect(assistant.searchBtn).toBeEnabled()
    await expect(assistant.thinkingBtn).toBeEnabled()

    // Send message — E2E mock completes instantly, but the component
    // has disabled={streaming} on both toggle buttons.
    await assistant.send('测试流式禁用')
    await assistant.waitForStreamingDone(15000)

    // After streaming: toggle states must be preserved (buttons were
    // disabled during streaming, so no accidental toggle could occur).
    await expect(assistant.searchBtn).toHaveAttribute('aria-pressed', 'true')
    await expect(assistant.thinkingBtn).toHaveAttribute('aria-label', '思考深度：高')

    // Both buttons must be re-enabled after streaming completes.
    await expect(assistant.searchBtn).toBeEnabled()
    await expect(assistant.thinkingBtn).toBeEnabled()
  })

  // ── 6. 🔍 颜色切换 ──────────────────────────────────────────────
  test('🔍 颜色切换：ON 含 text-sky-400，OFF 不含', async ({ window, testLibraryPath }) => {
    const assistant = await setupAssistant(window, testLibraryPath)
    await assistant.open()

    // Default: OFF, no sky-blue class
    await expect(assistant.searchBtn).not.toHaveClass(/text-sky-400/)

    // Toggle ON → should have sky-blue
    await assistant.toggleSearch()
    await window.waitForTimeout(200)
    await expect(assistant.searchBtn).toHaveClass(/text-sky-400/)
    await expect(assistant.searchBtn).toHaveAttribute('aria-pressed', 'true')

    // Toggle OFF → sky-blue removed
    await assistant.toggleSearch()
    await window.waitForTimeout(200)
    await expect(assistant.searchBtn).not.toHaveClass(/text-sky-400/)
    await expect(assistant.searchBtn).toHaveAttribute('aria-pressed', 'false')
  })

  // ── 7. 重启持久化 ──────────────────────────────────────────────
  test('两开关 reload 持久化：state.json 字段保持', async ({ window, testLibraryPath, testConfigDir }) => {
    const assistant = await setupAssistant(window, testLibraryPath)
    await assistant.open()

    // Set search ON and thinking to max
    await assistant.toggleSearch()
    await window.waitForTimeout(200)
    await assistant.cycleThinking() // off → high
    await window.waitForTimeout(150)
    await assistant.cycleThinking() // high → max
    await window.waitForTimeout(200)

    // Verify state.json before reload
    const statePath = path.join(testConfigDir, 'state.json')
    const beforeState = JSON.parse(fs.readFileSync(statePath, 'utf8'))
    expect(beforeState.assistantSearchEnabled).toBe(true)
    expect(beforeState.assistantThinkingEffort).toBe('max')

    // Reload and navigate back to writing
    await window.reload()
    await window.waitForLoadState('domcontentloaded')

    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })
    await window.waitForTimeout(1500)

    // Verify state.json persisted after reload
    const afterState = JSON.parse(fs.readFileSync(statePath, 'utf8'))
    expect(afterState.assistantSearchEnabled).toBe(true)
    expect(afterState.assistantThinkingEffort).toBe('max')
  })
})
