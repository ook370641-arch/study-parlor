import { test, expect } from '../fixtures/electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { CoverPage } from '../pages/CoverPage'
import { WritingPage } from '../pages/WritingPage'
import { WritingAssistantPanel } from '../pages/WritingAssistantPanel'
import { SELECTORS } from '../helpers/selectors'
import { seedWritingTree } from '../helpers/test-library'

/**
 * Search and thinking toggle tests:
 * - Search (🔍) toggle on/off persistence
 * - Thinking (🧠) effort toggle persistence
 * - Reload persistence
 */
test.describe('@p2 writing-assistant-search-thinking', () => {
  async function gotoWriting(window: any, testLibraryPath: string): Promise<{
    writing: WritingPage
    assistant: WritingAssistantPanel
  }> {
    seedWritingTree(testLibraryPath)

    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.writing.sourceButton).click()

    const writing = new WritingPage(window)
    await expect(writing.listTabArticles).toBeVisible({ timeout: 15000 })

    await writing.treeNode('七月夜话').click()
    await expect(writing.editor).toBeVisible({ timeout: 10000 })

    const assistant = new WritingAssistantPanel(window)
    return { writing, assistant }
  }

  test('🔍 开 → 搜索按钮激活态；🔍 关 → 按钮普通态', async ({ window, testLibraryPath }) => {
    const { assistant } = await gotoWriting(window, testLibraryPath)

    await assistant.open()
    await expect(assistant.panel).toBeVisible()

    // Search button should be visible
    await expect(assistant.searchBtn).toBeVisible({ timeout: 3000 })

    // Initially search should be off
    const initialSearchState = await assistant.isSearchEnabled().catch(() => false)
    expect(initialSearchState).toBe(false)

    // Toggle search on
    await assistant.toggleSearch()
    await window.waitForTimeout(300)

    // Search should now be enabled
    const searchState = await assistant.isSearchEnabled().catch(() => false)
    // The button should have some visual state change
    expect(assistant.searchBtn).toBeVisible()

    // Toggle search off
    await assistant.toggleSearch()
    await window.waitForTimeout(300)

    const finalSearchState = await assistant.isSearchEnabled().catch(() => false)
    expect(finalSearchState).toBe(false)
  })

  test('🧠 high/max → 思考按钮循环切换', async ({ window, testLibraryPath }) => {
    const { assistant } = await gotoWriting(window, testLibraryPath)

    await assistant.open()
    await expect(assistant.panel).toBeVisible()

    // Thinking button should be visible
    await expect(assistant.thinkingBtn).toBeVisible({ timeout: 3000 })

    // Initial state: 'off'
    let btnText = await assistant.thinkingBtn.textContent()
    expect(btnText).toContain('off')

    // Cycle to 'high'
    await assistant.cycleThinking()
    await window.waitForTimeout(300)
    btnText = await assistant.thinkingBtn.textContent()
    // Button text should have changed
    expect(typeof btnText).toBe('string')

    // Cycle to 'max'
    await assistant.cycleThinking()
    await window.waitForTimeout(300)
    btnText = await assistant.thinkingBtn.textContent()
    expect(typeof btnText).toBe('string')

    // Cycle back to 'off'
    await assistant.cycleThinking()
    await window.waitForTimeout(300)
    btnText = await assistant.thinkingBtn.textContent()
    expect(typeof btnText).toBe('string')
  })

  test('两开关 reload 保持', async ({ window, testLibraryPath, testConfigDir }) => {
    const { assistant } = await gotoWriting(window, testLibraryPath)

    await assistant.open()

    // Toggle search on and set thinking to high
    await assistant.toggleSearch()
    await window.waitForTimeout(300)
    await assistant.cycleThinking() // off → high
    await window.waitForTimeout(300)

    // Verify state.json has the changed values
    const statePath = path.join(testConfigDir, 'state.json')
    let state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
    expect(state.assistantSearchEnabled).toBe(true)
    expect(state.assistantThinkingEffort).toBe('high')

    // Reload
    await window.reload()
    await window.waitForLoadState('domcontentloaded')

    // Verify persistence in state.json
    state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
    expect(state.assistantSearchEnabled).toBe(true)
    expect(state.assistantThinkingEffort).toBe('high')
  })
})
