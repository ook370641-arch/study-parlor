import { test, expect } from '../fixtures/electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { CoverPage } from '../pages/CoverPage'
import { WritingPage } from '../pages/WritingPage'
import { SELECTORS } from '../helpers/selectors'
import { seedWritingTree } from '../helpers/test-library'

/**
 * Editor tests:
 * - Create, type, autosave, reload persistence
 * - Ctrl+S immediate save
 * - Table insertion via toolbar
 * - Font size A+/A- toggle with persistence
 * - Color tone toggle with persistence
 */
test.describe('@p2 writing-editor', () => {
  async function gotoWriting(window: any, testLibraryPath: string): Promise<WritingPage> {
    seedWritingTree(testLibraryPath)

    const cover = new CoverPage(window)
    await cover.enterIfNeeded()
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.writing.sourceButton).click()

    const writing = new WritingPage(window)
    await expect(writing.listTabArticles).toBeVisible({ timeout: 15000 })
    return writing
  }

  test('新建→输入→等待自动保存→reload→内容仍在', async ({ window, testLibraryPath }) => {
    const writing = await gotoWriting(window, testLibraryPath)

    // Create a new file
    window.once('dialog', async (dialog) => { await dialog.accept('测试文章') })
    await writing.newFileButton.click()
    await window.waitForTimeout(1000)

    // Wait for editor to be visible with the new file loaded
    await expect(writing.editor).toBeVisible({ timeout: 10000 })

    // Type content into the ProseMirror editor
    const proseMirror = writing.editor.locator('.ProseMirror')
    await proseMirror.click()
    // Clear existing content and type new content
    await proseMirror.press('Control+a')
    await proseMirror.fill('# 测试标题\n\n这是测试内容。')

    // Wait for autosave (1.5s debounce + write time)
    await window.waitForTimeout(3000)

    // Verify save status shows "已保存"
    const saveStatus = await writing.getSaveStatus().catch(() => '')
    expect(saveStatus).toContain('已保存')

    // Verify file content on disk
    const filePath = path.join(testLibraryPath, 'writing', '测试文章.md')
    expect(fs.existsSync(filePath)).toBe(true)
    const content = fs.readFileSync(filePath, 'utf8')
    expect(content).toContain('测试标题')

    // Reload and verify content persists
    await window.reload()
    await window.waitForLoadState('domcontentloaded')

    // Navigate back to writing
    await gotoWriting(window, testLibraryPath)

    // Select the file in the tree
    await writing.treeNode('测试文章').click()
    await expect(writing.editor).toBeVisible({ timeout: 10000 })

    // Check editor content
    const editorContent = await writing.getEditorContent().catch(() => '')
    expect(editorContent).toContain('测试内容')
  })

  test('表格插入：工具栏 ▦ 按钮 → 编辑器出现表格', async ({ window, testLibraryPath }) => {
    const writing = await gotoWriting(window, testLibraryPath)

    // Select an existing article to get the editor and toolbar
    await writing.treeNode('七月夜话').click()
    await expect(writing.editor).toBeVisible({ timeout: 10000 })

    // Click the table insert button (▦) in the toolbar
    const tableBtn = window.locator('button[title="插入表格"]')
    await expect(tableBtn).toBeVisible({ timeout: 3000 })
    await tableBtn.click()
    await window.waitForTimeout(500)

    // The ProseMirror editor should now contain a table element
    const table = writing.editor.locator('.ProseMirror table')
    await expect(table).toBeVisible({ timeout: 5000 })
  })

  test('字号 A+/A- 切换 → reload 保持', async ({ window, testLibraryPath, testConfigDir }) => {
    const writing = await gotoWriting(window, testLibraryPath)

    // Select a file to activate the toolbar
    await writing.treeNode('七月夜话').click()
    await expect(writing.editor).toBeVisible({ timeout: 10000 })

    // Click A+ to increase font size
    const increaseBtn = window.locator('button[title="增大字号"]')
    await expect(increaseBtn).toBeVisible({ timeout: 3000 })
    await increaseBtn.click()
    await window.waitForTimeout(500)

    // Verify state.json has the changed font size
    const statePath = path.join(testConfigDir, 'state.json')
    let state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
    expect(state.writingFontSize).not.toBe('base') // Should be 'lg' after clicking A+ once from 'base'

    // Reload
    await window.reload()
    await window.waitForLoadState('domcontentloaded')

    // Verify persistence
    state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
    expect(state.writingFontSize).not.toBe('base')
  })

  test('🎨 配色切换 → reload 保持', async ({ window, testLibraryPath, testConfigDir }) => {
    const writing = await gotoWriting(window, testLibraryPath)

    // Select a file to activate the toolbar
    await writing.treeNode('七月夜话').click()
    await expect(writing.editor).toBeVisible({ timeout: 10000 })

    // Click the tone/theme button
    const toneBtn = window.locator('button[title="配色方案"]')
    await expect(toneBtn).toBeVisible({ timeout: 3000 })
    // Initial tone is 'parchment' (暖米), clicking cycles to 'plain' (素白)
    await toneBtn.click()
    await window.waitForTimeout(500)

    // Verify state.json has the changed tone
    const statePath = path.join(testConfigDir, 'state.json')
    let state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
    expect(state.writingTone).toBe('plain')

    // Reload
    await window.reload()
    await window.waitForLoadState('domcontentloaded')

    // Verify persistence
    state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
    expect(state.writingTone).toBe('plain')
  })
})
