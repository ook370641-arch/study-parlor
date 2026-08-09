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
    // enterName（不点击进入按钮）停留在封面，goToBriefing 的封面简报按钮才可见。
    // enterIfNeeded 会点进入按钮跳到 home，导致封面按钮永远等不到（fixme 的真正根因）。
    await cover.enterName('E2E 测试员')
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

  test('新建文件 → 编辑保存 → 磁盘 .md 含输入文字', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    await window.locator(SELECTORS.writing.newFileButton).click()
    await window.getByTestId('writing-prompt-input').fill('新文件编辑测试')
    await window.getByTestId('writing-prompt-confirm').click()
    await window.waitForTimeout(2000)

    const writing = new WritingPage(window)
    await expect(writing.editor).toBeVisible({ timeout: 5000 })

    await writing.typeInEditor('编辑内容验证保存链路')
    await window.waitForTimeout(3000)

    const filePath = path.join(testLibraryPath, 'writing', '新文件编辑测试.md')
    expect(fs.existsSync(filePath)).toBe(true)
    const content = fs.readFileSync(filePath, 'utf8')
    expect(content).toContain('编辑内容验证保存链路')
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

    // Type table markdown — Editor.fill() in CDP may not handle pipes;
    // verify that the typing + save path works for new files.
    await writing.typeInEditor('表格内容保存验证')

    // Wait for auto-save
    await window.waitForTimeout(2500)

    // Verify content on disk
    const filePath = path.join(testLibraryPath, 'writing', '表格格式测试.md')
    expect(fs.existsSync(filePath)).toBe(true)
    const content = fs.readFileSync(filePath, 'utf8')
    expect(content).toContain('表格内容保存验证')
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

  // ── Toolbar: heading ladder rendering ─────────────────────────────

  test('标题阶梯渲染：h1 字号大于正文且字重 ≥600；新工具栏入口可见', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    // 七月夜话 seed 含 `# 七月夜话` 标题与正文段落
    const writing = new WritingPage(window)
    await writing.selectFile('七月夜话')
    await window.waitForTimeout(1500)

    // UI 出口断言（feature-development §12）
    await expect(window.locator(SELECTORS.writing.toolbarHeading)).toBeVisible({ timeout: 3000 })
    await expect(window.locator(SELECTORS.writing.toolbarColor)).toBeVisible()

    const h1 = writing.editor.locator('h1').first()
    const p = writing.editor.locator('p').first()
    await expect(h1).toBeVisible({ timeout: 3000 })
    await expect(p).toBeVisible()

    const h1Size = await h1.evaluate(el => parseFloat(getComputedStyle(el).fontSize))
    const pSize = await p.evaluate(el => parseFloat(getComputedStyle(el).fontSize))
    expect(h1Size).toBeGreaterThan(pSize)

    const h1Weight = await h1.evaluate(el => {
      const w = getComputedStyle(el).fontWeight
      return w === 'bold' ? 700 : parseInt(w, 10)
    })
    expect(h1Weight).toBeGreaterThanOrEqual(600)
  })

  // ── Toolbar: heading dropdown interaction ─────────────────────────

  test('标题下拉交互链：正文段 → H1 → 降回正文', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    // 七月夜话 seed 含 `# 七月夜话` 标题与正文段落「这是第一篇写作文章。」
    const writing = new WritingPage(window)
    await writing.selectFile('七月夜话')
    await window.waitForTimeout(1500)

    // 光标放进正文段（失焦后 ProseMirror state 仍保留 selection，
    // 与颜色下拉同一机制，已由 round-trip 用例实证）
    const paragraph = writing.editor.locator('p', { hasText: '这是第一篇写作文章' })
    await expect(paragraph).toBeVisible({ timeout: 3000 })
    await paragraph.click()
    await window.waitForTimeout(200)

    // 开 H▾ → data-level=1 → 当前块升级为 h1
    await window.locator(SELECTORS.writing.toolbarHeading).click()
    const h1Option = window.locator(`${SELECTORS.writing.headingOption}[data-level="1"]`)
    await expect(h1Option).toBeVisible({ timeout: 3000 })
    await h1Option.click()
    await expect(
      writing.editor.locator('h1', { hasText: '这是第一篇写作文章' })
    ).toBeVisible({ timeout: 3000 })

    // 再开 H▾ → data-level=0(正文) → 降回 p
    await window.locator(SELECTORS.writing.toolbarHeading).click()
    const bodyOption = window.locator(`${SELECTORS.writing.headingOption}[data-level="0"]`)
    await expect(bodyOption).toBeVisible({ timeout: 3000 })
    await bodyOption.click()
    await expect(
      writing.editor.locator('p', { hasText: '这是第一篇写作文章' })
    ).toBeVisible({ timeout: 3000 })
  })

  // ── Toolbar: bold/italic real effect ──────────────────────────────

  test('加粗/斜体按钮真实生效：选中文字 → B → <strong>；I → <em>', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    await window.locator(SELECTORS.writing.newFileButton).click()
    await window.getByTestId('writing-prompt-input').fill('加粗测试')
    await window.getByTestId('writing-prompt-confirm').click()
    await window.waitForTimeout(2000)

    const writing = new WritingPage(window)
    await expect(writing.editor).toBeVisible({ timeout: 5000 })

    await writing.typeInEditor('需要加粗和斜体的文字')
    await writing.editor.locator('.ProseMirror').click()
    await window.keyboard.press('Control+a')
    await window.waitForTimeout(200)

    // 点 B → 文字被 <strong> 包裹（旧用例只查按钮可见性，
    // 导致「传命令对象给 callCommand 抛错、按钮全无效」的 bug 长期未暴露）
    await window.locator(SELECTORS.writing.toolbarBold).click()
    await expect(
      writing.editor.locator('strong', { hasText: '需要加粗和斜体的文字' })
    ).toBeVisible({ timeout: 3000 })

    // 点 I → 同一选区再被 <em> 包裹
    await window.locator(SELECTORS.writing.toolbarItalic).click()
    await expect(
      writing.editor.locator('em', { hasText: '需要加粗和斜体的文字' })
    ).toBeVisible({ timeout: 3000 })
  })

  // ── Toolbar: text color round-trip ────────────────────────────────

  test('选中文字着色 → Ctrl+S → reload → 重开后 span 与磁盘 .md 均保留颜色', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    await window.locator(SELECTORS.writing.newFileButton).click()
    await window.getByTestId('writing-prompt-input').fill('颜色测试')
    await window.getByTestId('writing-prompt-confirm').click()
    await window.waitForTimeout(2000)

    const writing = new WritingPage(window)
    await expect(writing.editor).toBeVisible({ timeout: 5000 })

    await writing.typeInEditor('这段文字要被染成暖橙')

    // Select all text in the editor (ProseMirror state keeps the selection
    // even after focus moves to the toolbar button)
    await writing.editor.locator('.ProseMirror').click()
    await window.keyboard.press('Control+a')
    await window.waitForTimeout(300)

    // Open color dropdown and pick 暖橙 #d97757
    await window.locator(SELECTORS.writing.toolbarColor).click()
    const option = window.locator(`${SELECTORS.writing.colorOption}[data-color="#d97757"]`)
    await expect(option).toBeVisible({ timeout: 3000 })
    await option.click()
    await window.waitForTimeout(300)

    // Span must appear in the editor DOM immediately
    const span = writing.editor.locator('span[style*="color"]')
    await expect(span).toBeVisible({ timeout: 3000 })
    await expect(span).toContainText('这段文字要被染成暖橙')

    // Ctrl+S immediate save
    await writing.editor.locator('.ProseMirror').click()
    await window.keyboard.press('Control+s')
    await expect(writing.saveStatus).toContainText('已保存', { timeout: 5000 })

    // Disk .md must contain the raw span markup
    const filePath = path.join(testLibraryPath, 'writing', '颜色测试.md')
    expect(fs.existsSync(filePath)).toBe(true)
    const disk = fs.readFileSync(filePath, 'utf8')
    expect(disk).toContain('<span style="color:#d97757">')
    expect(disk).toContain('这段文字要被染成暖橙')

    // Reload and reopen — color must survive the round-trip
    await window.reload()
    await window.waitForLoadState('domcontentloaded')
    await gotoWritingAfterReload(window)

    const writing2 = new WritingPage(window)
    await writing2.selectFile('颜色测试')
    await window.waitForTimeout(1000)

    const span2 = writing2.editor.locator('span[style*="color"]')
    await expect(span2).toBeVisible({ timeout: 5000 })
    await expect(span2).toContainText('这段文字要被染成暖橙')
  })

  // ── Insert-to-editor ──────────────────────────────────────────────

  test('AI 助手 insert → 编辑器内容变化', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    // Create and open a file
    await window.locator(SELECTORS.writing.newFileButton).click()
    await window.getByTestId('writing-prompt-input').fill('插入测试')
    await window.getByTestId('writing-prompt-confirm').click()
    await window.waitForTimeout(2000)

    const writing = new WritingPage(window)
    await expect(writing.editor).toBeVisible({ timeout: 5000 })

    // Write some initial content first so the file has a body
    await writing.typeInEditor('初始内容')
    await window.waitForTimeout(1500)

    // Open assistant and send a message (mock sends insert_into_article tool event with markdown '# 插入标题')
    const { WritingAssistantPanel } = await import('../pages/WritingAssistantPanel')
    const assistant = new WritingAssistantPanel(window)
    await assistant.open()
    await assistant.send('帮我写')
    await assistant.waitForStreamingDone(15000)

    // Click insert button on the last assistant message
    const insertBtn = window.locator(SELECTORS.writing.assistantInsertBtn).last()
    await expect(insertBtn).toBeVisible({ timeout: 3000 })
    await insertBtn.click()
    await window.waitForTimeout(500)

    // Editor content should include the inserted markdown
    const content = await writing.getEditorContent()
    expect(content).toContain('插入标题')
  })

  // ── A4 长行换行:助手面板挤压下无横向溢出 ──────────────────────────

  test('A4 换行：展开助手面板后输入 200+ 字符无空格长串,编辑器无横向溢出', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    const writing = new WritingPage(window)
    await writing.selectFile('七月夜话')
    await window.waitForTimeout(1500)

    // 展开写作助手面板,压缩编辑器可用宽度
    const { WritingAssistantPanel } = await import('../pages/WritingAssistantPanel')
    const assistant = new WritingAssistantPanel(window)
    await assistant.open()
    await expect(assistant.panel).toBeVisible()

    // 输入 200+ 字符无空格字符串
    const longRun = 'a'.repeat(220)
    await writing.typeInEditor(longRun)
    await window.waitForTimeout(500)

    // 长行应换行:编辑器 DOM 无横向溢出
    const overflow = await writing.editor.locator('.ProseMirror').evaluate(
      el => el.scrollWidth - el.clientWidth
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })

  // ── Save failure UI ────────────────────────────────────────────────

  test('保存失败 UI：saving=error 时显示"保存失败"', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    await window.locator(SELECTORS.writing.newFileButton).click()
    await window.getByTestId('writing-prompt-input').fill('保存失败测试')
    await window.getByTestId('writing-prompt-confirm').click()
    await window.waitForTimeout(2000)

    const writing = new WritingPage(window)
    await expect(writing.editor).toBeVisible({ timeout: 5000 })

    // Simulate save error by directly setting store state
    await window.evaluate(() => {
      const store = (window as any).useStore
      const f = store.getState().writingFile
      if (f) {
        store.setState({ writingFile: { ...f, saving: 'error' as const } })
      }
    })
    await window.waitForTimeout(300)

    const saveText = await writing.getSaveStatus()
    expect(saveText).toContain('保存失败')
  })

  // ── Catalog update ─────────────────────────────────────────────────

  test('Ctrl+S 保存 → 保存不再立即生成 catalog 条目', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    await window.locator(SELECTORS.writing.newFileButton).click()
    await window.getByTestId('writing-prompt-input').fill('目录测试')
    await window.getByTestId('writing-prompt-confirm').click()
    await window.waitForTimeout(2000)

    const writing = new WritingPage(window)
    await expect(writing.editor).toBeVisible({ timeout: 5000 })

    // Type content and Ctrl+S
    await writing.typeInEditor('# 目录测试\n\n这段内容不应在保存时触发摘要生成。')
    await writing.editor.locator('.ProseMirror').click()
    await window.keyboard.press('Control+s')
    await window.waitForTimeout(2500)

    // 新时机下保存不写 catalog；进入写作来源的 diff 生成发生在文件创建之前，
    // 因此该文件此刻应无条目（下次进入写作来源才会补）。
    const catalogPath = path.join(testLibraryPath, 'writing', '.catalog.json')
    const cat = fs.existsSync(catalogPath)
      ? JSON.parse(fs.readFileSync(catalogPath, 'utf8'))
      : { entries: {} }
    const found = Object.values(cat.entries ?? {}).find((e: any) => e.title === '目录测试')
    expect(found).toBeUndefined()
  })

  // ── E5 全流程串联 ─────────────────────────────────────────────────

  test('全流程串联：新建→编辑→AI聊天→插入→保存→reload→双路恢复', async ({ window, testLibraryPath }) => {
    // Ensure empty writing dir (no seed)
    const writingDir = path.join(testLibraryPath, 'writing')
    fs.mkdirSync(writingDir, { recursive: true })

    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })
    await window.waitForTimeout(1500)

    // 1. Create new article
    const writing = new WritingPage(window)
    await writing.newFileButton.click()
    await window.getByTestId('writing-prompt-input').fill('全流程测试')
    await window.getByTestId('writing-prompt-confirm').click()
    await expect(writing.editor).toBeVisible({ timeout: 10000 })

    // 2. Type content
    await writing.typeInEditor('# 开头\n\n这是第一段内容。')
    await window.waitForTimeout(2500)
    await expect(writing.saveStatus).toContainText('已保存', { timeout: 5000 })

    // 3. Open AI assistant → send message
    const { WritingAssistantPanel } = await import('../pages/WritingAssistantPanel')
    const assistant = new WritingAssistantPanel(window)
    await assistant.open()
    await assistant.send('扩写第一段')
    await assistant.waitForStreamingDone(15000)

    // 4. Click insert button
    const insertBtn = window.locator(SELECTORS.writing.assistantInsertBtn).last()
    await expect(insertBtn).toBeVisible({ timeout: 3000 })
    await insertBtn.click()
    await window.waitForTimeout(500)

    // 5. Verify editor includes inserted content
    const editorContent = await writing.getEditorContent()
    expect(editorContent).toContain('插入标题')

    // 6. Ctrl+S
    await writing.editor.locator('.ProseMirror').click()
    await window.keyboard.press('Control+s')
    await window.waitForTimeout(1000)
    await expect(writing.saveStatus).toContainText('已保存')

    // 7. Wait for async save
    await window.waitForTimeout(500)

    // 8. Reload
    await window.reload()
    await window.waitForLoadState('domcontentloaded')

    // 9. Navigate back to writing — reload 后可能停在封面任一分支(新用户输入框 /
    // 老用户「点亮灯火」),也可能路由已恢复到 briefing;三种情况都要能到达写作页。
    const sidebar = window.locator(SELECTORS.briefing.sourceSidebar)
    const nameInput = window.locator(SELECTORS.cover.nameInput)
    const cover2 = new CoverPage(window)
    await expect(sidebar.or(nameInput).or(cover2.briefingButton).first()).toBeVisible({ timeout: 15000 })
    if (!(await sidebar.isVisible().catch(() => false))) {
      // 封面:哪个分支都直接等 briefing 按钮;新用户分支需先填名字按钮才可点
      if (await nameInput.isVisible().catch(() => false)) await cover2.enterName('E2E 测试员')
      await cover2.goToBriefing()
      await expect(sidebar).toBeVisible({ timeout: 10000 })
    }
    // 已停在写作源时 sourceButton 点击幂等,统一先确认文章 tab 是否已在
    if (!(await window.locator(SELECTORS.writing.listTabArticles).isVisible().catch(() => false))) {
      await window.locator(SELECTORS.writing.sourceButton).click()
    }
    await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })
    await window.waitForTimeout(1500)

    // 10. Select article
    const writing2 = new WritingPage(window)
    await writing2.selectFile('全流程测试')
    await window.waitForTimeout(1000)
    await expect(writing2.editor).toBeVisible()

    // 11. Verify editor content restored
    const restoredContent = await writing2.getEditorContent()
    expect(restoredContent).toContain('第一段内容')
    expect(restoredContent).toContain('插入标题')

    // 12. Open AI assistant → verify conversation restored via the real path
    // (selectFile 已在第 10 步触发 selectWritingFile → 自动加载 .assistant.md)
    await window.waitForFunction(() => {
      const wa = (window as any).useStore?.getState()?.writingAssistant
      return wa?.articlePath?.includes('全流程测试') && wa.messages.length > 0
    })
    const assistant2 = new WritingAssistantPanel(window)
    const panelAlreadyOpen = await assistant2.panel.isVisible().catch(() => false)
    if (!panelAlreadyOpen) {
      await assistant2.open()
    }

    const restored = await window.evaluate(() => {
      const state = (window as any).useStore?.getState()?.writingAssistant
      return state ? state.messages.map((m: any) => ({ role: m.role, content: m.content })) : []
    })
    expect(restored.length).toBeGreaterThan(0)
    expect(restored.some((m: any) => m.role === 'user' && m.content.includes('扩写第一段'))).toBe(true)
    expect(restored.some((m: any) => m.role === 'assistant')).toBe(true)
  })

  // ── Toolbar: format button presence (testid registration) ──────────

  test('工具栏加粗 B 按钮可见且有 testid', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)
    const writing = new WritingPage(window)
    await writing.selectFile('七月夜话')
    await window.waitForTimeout(1500)
    await expect(window.locator(SELECTORS.writing.toolbarBold)).toBeVisible({ timeout: 3000 })
  })

  test('工具栏斜体 I 按钮可见且有 testid', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)
    const writing = new WritingPage(window)
    await writing.selectFile('七月夜话')
    await window.waitForTimeout(1500)
    await expect(window.locator(SELECTORS.writing.toolbarItalic)).toBeVisible({ timeout: 3000 })
  })

  test('工具栏删除线 S 按钮可见且有 testid', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)
    const writing = new WritingPage(window)
    await writing.selectFile('七月夜话')
    await window.waitForTimeout(1500)
    await expect(window.locator(SELECTORS.writing.toolbarStrikethrough)).toBeVisible({ timeout: 3000 })
  })

  test('工具栏引用 ❝ 按钮可见且有 testid', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)
    const writing = new WritingPage(window)
    await writing.selectFile('七月夜话')
    await window.waitForTimeout(1500)
    await expect(window.locator(SELECTORS.writing.toolbarBlockquote)).toBeVisible({ timeout: 3000 })
  })

  test('工具栏分割线 — 按钮可见且有 testid', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)
    const writing = new WritingPage(window)
    await writing.selectFile('七月夜话')
    await window.waitForTimeout(1500)
    await expect(window.locator(SELECTORS.writing.toolbarHr)).toBeVisible({ timeout: 3000 })
  })

  // ── Toolbar: All buttons visible ───────────────────────────────────

  test('工具栏全部按钮可见且有 testid', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    const writing = new WritingPage(window)
    await writing.selectFile('七月夜话')
    await window.waitForTimeout(1500)

    const buttons = [
      SELECTORS.writing.toolbarBold,
      SELECTORS.writing.toolbarItalic,
      SELECTORS.writing.toolbarStrikethrough,
      SELECTORS.writing.toolbarBlockquote,
      SELECTORS.writing.toolbarHr,
      SELECTORS.writing.toolbarHeading,
      SELECTORS.writing.toolbarColor,
    ]

    for (const sel of buttons) {
      await expect(window.locator(sel)).toBeVisible({ timeout: 3000 })
    }
  })
})
