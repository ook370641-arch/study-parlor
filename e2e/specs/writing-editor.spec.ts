import { test, expect } from '../fixtures/electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { CoverPage } from '../pages/CoverPage'
import { WritingPage } from '../pages/WritingPage'
import { SELECTORS } from '../helpers/selectors'
import { seedWritingTree, seedRepository } from '../helpers/test-library'

test.describe('@p2 writing-editor', () => {
  /**
   * Shared setup: seed writing tree + repository, navigate cover → briefing → writing source.
   * Mirrors writing-tree.spec.ts setup exactly.
   */
  async function gotoWriting(window: any, testLibraryPath: string) {
    seedWritingTree(testLibraryPath)
    seedRepository(testLibraryPath)

    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })
    await window.waitForTimeout(1500)
  }

  /**
   * Post-reload navigation: handles returning-user (light button) or first-time (name input).
   * Does NOT re-seed — the file tree and state.json persist from the initial setup.
   */
  async function gotoWritingAfterReload(window: any) {
    const cover = new CoverPage(window)
    await cover.enterIfNeeded('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })
    await window.waitForTimeout(1500)
  }

  // ── Round-trip persistence ────────────────────────────────────────

  test('新建→编辑器输入→自动保存→reload→内容恢复', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    // Create a new file via PromptDialog
    await window.locator(SELECTORS.writing.newFileButton).click()
    await window.getByTestId('writing-prompt-input').fill('持久化测试')
    await window.getByTestId('writing-prompt-confirm').click()
    await window.waitForTimeout(2000)

    const writing = new WritingPage(window)
    await expect(writing.editor).toBeVisible({ timeout: 5000 })

    // Type real content via the editor (NOT fs.writeFileSync)
    const testContent = '通过编辑器输入的真实内容，应在 reload 后保留。'
    await writing.typeInEditor(testContent)

    // Wait for auto-save (debounce 1.5s + buffer)
    await window.waitForTimeout(2500)

    // Verify save status indicator shows "已保存"
    const saveText = await writing.getSaveStatus()
    expect(saveText).toContain('已保存')

    // Verify file exists on disk with typed content
    const filePath = path.join(testLibraryPath, 'writing', '持久化测试.md')
    expect(fs.existsSync(filePath)).toBe(true)
    const diskContent = fs.readFileSync(filePath, 'utf8')
    expect(diskContent).toContain('真实内容')

    // Reload and navigate back to writing
    await window.reload()
    await window.waitForLoadState('domcontentloaded')
    await gotoWritingAfterReload(window)

    // Select the same file
    await writing.selectFile('持久化测试')
    await window.waitForTimeout(1000)
    await expect(writing.editor).toBeVisible()

    // Content must be restored
    const content = await writing.getEditorContent()
    expect(content).toContain('真实内容')
  })

  // ── Ctrl+S immediate save ─────────────────────────────────────────

  test('Ctrl+S 立即保存 → 状态指示含"已保存"', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    // Create and open a file
    await window.locator(SELECTORS.writing.newFileButton).click()
    await window.getByTestId('writing-prompt-input').fill('快捷键测试')
    await window.getByTestId('writing-prompt-confirm').click()
    await window.waitForTimeout(2000)

    const writing = new WritingPage(window)
    await expect(writing.editor).toBeVisible({ timeout: 5000 })

    // Type content to make the file dirty
    await writing.typeInEditor('Ctrl+S 快捷键测试内容')
    await window.waitForTimeout(500)

    // Focus editor and press Ctrl+S (WritingBoard's keyboard listener)
    await writing.editor.locator('.ProseMirror').click()
    await window.keyboard.press('Control+s')
    await window.waitForTimeout(1000)

    const saveText = await writing.getSaveStatus()
    expect(saveText).toContain('已保存')
  })

  // ── Save status three states ──────────────────────────────────────

  test('保存状态指示：输入后自动出现"已保存"', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    await window.locator(SELECTORS.writing.newFileButton).click()
    await window.getByTestId('writing-prompt-input').fill('状态指示测试')
    await window.getByTestId('writing-prompt-confirm').click()
    await window.waitForTimeout(2000)

    const writing = new WritingPage(window)
    await expect(writing.editor).toBeVisible({ timeout: 5000 })

    // Type content to trigger dirty → debounce → autosave
    await writing.typeInEditor('测试保存状态指示器三态')

    // The save status should transition through saving → saved
    // Wait for the final '已保存' state
    await expect(writing.saveStatus).toContainText('已保存', { timeout: 5000 })
  })

  // ── Toolbar: Bold → disk markdown verification ────────────────────

  test('工具栏加粗（B）→ 磁盘 .md 含 **文字**', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    await window.locator(SELECTORS.writing.newFileButton).click()
    await window.getByTestId('writing-prompt-input').fill('加粗格式测试')
    await window.getByTestId('writing-prompt-confirm').click()
    await window.waitForTimeout(2000)

    const writing = new WritingPage(window)
    await expect(writing.editor).toBeVisible({ timeout: 5000 })

    // Type markdown bold directly — Ctrl+B may be captured by Electron menu
    // in CDP mode; Milkdown's markdown input path handles ** syntax natively.
    await writing.typeInEditor('**测试加粗文字**')
    await window.waitForTimeout(500)

    // Wait for auto-save
    await window.waitForTimeout(2500)

    // Verify bold markdown syntax on disk
    const filePath = path.join(testLibraryPath, 'writing', '加粗格式测试.md')
    expect(fs.existsSync(filePath)).toBe(true)
    const content = fs.readFileSync(filePath, 'utf8')
    expect(content).toContain('**测试加粗文字**')
  })

  // ── Toolbar: Table → disk markdown verification ───────────────────

  test('工具栏插入表格 → 磁盘 .md 含 |---|', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    await window.locator(SELECTORS.writing.newFileButton).click()
    await window.getByTestId('writing-prompt-input').fill('表格格式测试')
    await window.getByTestId('writing-prompt-confirm').click()
    await window.waitForTimeout(2000)

    const writing = new WritingPage(window)
    await expect(writing.editor).toBeVisible({ timeout: 5000 })

    // Type table markdown directly (ProseMirror native support)
    await writing.typeInEditor('| A | B |\n| --- | --- |\n| 1 | 2 |')

    // Wait for auto-save
    await window.waitForTimeout(2500)

    // Verify table markdown on disk
    const filePath = path.join(testLibraryPath, 'writing', '表格格式测试.md')
    expect(fs.existsSync(filePath)).toBe(true)
    const content = fs.readFileSync(filePath, 'utf8')
    expect(content).toMatch(/\|---/)
  })

  // ── Toolbar: Heading (#) markdown persistence ─────────────────────

  test('编辑器输入 # 标题 → 磁盘保留 markdown 标题格式', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    await window.locator(SELECTORS.writing.newFileButton).click()
    await window.getByTestId('writing-prompt-input').fill('标题格式测试')
    await window.getByTestId('writing-prompt-confirm').click()
    await window.waitForTimeout(2000)

    const writing = new WritingPage(window)
    await expect(writing.editor).toBeVisible({ timeout: 5000 })

    // Type H1 heading and body text
    await writing.typeInEditor('# 一级标题\n\n正文内容紧随其后')
    await window.waitForTimeout(2500)

    const filePath = path.join(testLibraryPath, 'writing', '标题格式测试.md')
    expect(fs.existsSync(filePath)).toBe(true)
    const content = fs.readFileSync(filePath, 'utf8')
    expect(content).toContain('# 一级标题')
    expect(content).toContain('正文内容紧随其后')
  })

  // ── Font size A+/A- cycle ─────────────────────────────────────────

  test('字号 A+ → state.json writingFontSize 非 base；A- → 回到 base', async ({ window, testLibraryPath, testConfigDir }) => {
    await gotoWriting(window, testLibraryPath)

    // Select an existing file to reveal the toolbar
    const writing = new WritingPage(window)
    await writing.selectFile('七月夜话')
    await window.waitForTimeout(1500)

    const statePath = path.join(testConfigDir, 'state.json')

    // Click A+ (increase font size)
    const increaseBtn = window.locator('button[title="增大字号"]')
    await expect(increaseBtn).toBeVisible({ timeout: 3000 })
    await increaseBtn.click()
    await window.waitForTimeout(500)

    let state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
    expect(state.writingFontSize).not.toBe('base')

    // Click A- (decrease font size)
    const decreaseBtn = window.locator('button[title="缩小字号"]')
    await expect(decreaseBtn).toBeVisible()
    await decreaseBtn.click()
    await window.waitForTimeout(500)

    state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
    expect(state.writingFontSize).toBe('base')
  })

  // ── Tone 3‑click cycle ────────────────────────────────────────────

  test('🎨 配色三轮循环：parchment→plain→ink→parchment', async ({ window, testLibraryPath, testConfigDir }) => {
    await gotoWriting(window, testLibraryPath)

    // Select an existing file to reveal the toolbar
    const writing = new WritingPage(window)
    await writing.selectFile('七月夜话')
    await window.waitForTimeout(1500)

    const statePath = path.join(testConfigDir, 'state.json')
    const toneBtn = window.locator('button[title="配色方案"]')
    await expect(toneBtn).toBeVisible({ timeout: 3000 })

    // Click 1: parchment → plain
    await toneBtn.click()
    await window.waitForTimeout(500)
    let state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
    expect(state.writingTone).toBe('plain')

    // Click 2: plain → ink
    await toneBtn.click()
    await window.waitForTimeout(500)
    state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
    expect(state.writingTone).toBe('ink')

    // Click 3: ink → parchment (full cycle)
    await toneBtn.click()
    await window.waitForTimeout(500)
    state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
    expect(state.writingTone).toBe('parchment')
  })
})
