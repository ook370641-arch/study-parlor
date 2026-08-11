import { test, expect } from '../fixtures/electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { CoverPage } from '../pages/CoverPage'
import { WritingPage } from '../pages/WritingPage'
import { SELECTORS } from '../helpers/selectors'
import { seedWritingTree, seedRepository } from '../helpers/test-library'

/**
 * 写作粘贴清洗 + 悬浮格式栏 + 智能 Enter + 分隔线 + 渲染格调
 * (设计 2026-08-11-writing-paste-and-formatting-design.md)
 *
 * 覆盖:
 * 1. 外部粘贴 markdown 源 → 加粗生效、行内代码/颜色被剥离;Ctrl+S → reload 无字面量
 * 2. 内部复制粘贴 → 颜色/加粗完整保留(data-pm-slice 放行)
 * 3. 悬浮栏生命周期:选中出现、点加粗保持、点外消失
 * 4. 智能 Enter:段中回车=硬换行(无空行);段尾回车=新段落
 * 5. 分隔线:工具栏插入后光标落到下一行;行首 Backspace 删除
 * 6. 渲染格调:蜡烛引用 / 轨道分隔线 / 列表序号 / 标题烛首;报纸主题 --writing-tone-color
 */

test.describe('@p2 writing-paste-format', () => {
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

  async function gotoWritingAfterReload(window: any) {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })
    await window.waitForTimeout(1500)
  }

  /** 新建文件并等编辑器可见 */
  async function newFile(window: any, name: string) {
    await window.locator(SELECTORS.writing.newFileButton).click()
    await window.getByTestId('writing-inline-new').fill(name)
    await window.getByTestId('writing-inline-new').press('Enter')
    await window.waitForTimeout(2000)
    const writing = new WritingPage(window)
    await expect(writing.editor).toBeVisible({ timeout: 5000 })
    return writing
  }

  /** 授权剪贴板读写(Chromium 对 clipboard API 有权限门) */
  async function grantClipboard(window: any) {
    try {
      await window.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    } catch (err) {
      // CDP 连接下个别环境不暴露 grantPermissions,忽略(Electron 默认放行)
    }
  }

  // ── 1. 外部粘贴 markdown 源清洗 ────────────────────────────────────

  test('外部粘贴 markdown 源:加粗生效、代码/颜色被剥离;reload 无字面量', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)
    await grantClipboard(window)
    const writing = await newFile(window, '粘贴清洗测试')

    const md = [
      '**加粗文字**',
      '',
      '| A | B |',
      '|---|---|',
      '| 1 | 2 |',
      '',
      '`行内代码`',
      '',
      '<span style="color:#d97757">染红文字</span>',
    ].join('\n')

    // 写入系统剪贴板(纯文本)→ 聚焦编辑器 → Ctrl+V
    await window.evaluate((s) => navigator.clipboard.writeText(s), md)
    const proseMirror = writing.editor.locator('.ProseMirror')
    await proseMirror.click()
    await window.keyboard.press('Control+v')
    await window.waitForTimeout(500)

    // 加粗生效
    await expect(writing.editor.locator('strong', { hasText: '加粗文字' })).toBeVisible({ timeout: 3000 })
    // 表格结构保留
    await expect(writing.editor.locator('.ProseMirror table')).toHaveCount(1)
    // 行内代码与颜色被剥离
    await expect(writing.editor.locator('.ProseMirror code')).toHaveCount(0)
    await expect(writing.editor.locator('.ProseMirror span[style*="color"]')).toHaveCount(0)

    // Ctrl+S → reload → 重开后编辑器内容不含字面量 `**` 与 `<span`
    await proseMirror.click()
    await window.keyboard.press('Control+s')
    await expect(writing.saveStatus).toContainText('已保存', { timeout: 5000 })

    await window.reload()
    await window.waitForLoadState('domcontentloaded')
    await gotoWritingAfterReload(window)

    const writing2 = new WritingPage(window)
    await writing2.selectFile('粘贴清洗测试')
    await window.waitForTimeout(1000)
    await expect(writing2.editor).toBeVisible()

    const content = await writing2.getEditorContent()
    expect(content).toContain('加粗文字')
    expect(content).not.toContain('**')
    expect(content).not.toContain('<span')
  })

  // ── 2. 内部复制粘贴保留颜色/加粗 ───────────────────────────────────

  test('内部复制粘贴:着色+加粗跨文件 Ctrl+C/V 完整保留', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)
    await grantClipboard(window)
    const writing = await newFile(window, '内部复制测试')

    await writing.typeInEditor('内部复制保留格式')
    await writing.editor.locator('.ProseMirror').click()
    await window.keyboard.press('Control+a')

    // 悬浮栏:先加粗再着色
    await expect(window.locator(SELECTORS.writing.formatBubble)).toBeVisible({ timeout: 3000 })
    await window.locator(SELECTORS.writing.bubbleBold).click()
    await expect(writing.editor.locator('strong', { hasText: '内部复制保留格式' })).toBeVisible()
    await window.locator(SELECTORS.writing.bubbleColor).click()
    const option = window.locator(`${SELECTORS.writing.bubbleColorOption}[data-color="#d97757"]`)
    await expect(option).toBeVisible({ timeout: 3000 })
    await option.click()
    await expect(writing.editor.locator('span[style*="color"]')).toBeVisible({ timeout: 3000 })

    // 内部复制(ProseMirror data-pm-slice → 放行保留所有 mark)
    await window.keyboard.press('Control+c')
    await window.waitForTimeout(300)

    // 新文章 → Ctrl+V
    const writing2 = await newFile(window, '内部粘贴目标')
    await writing2.editor.locator('.ProseMirror').click()
    await window.keyboard.press('Control+v')
    await window.waitForTimeout(500)

    await expect(writing2.editor.locator('strong', { hasText: '内部复制保留格式' })).toBeVisible({ timeout: 3000 })
    await expect(writing2.editor.locator('span[style*="color"]')).toBeVisible({ timeout: 3000 })
  })

  // ── 3. 悬浮栏生命周期 ──────────────────────────────────────────────

  test('悬浮栏生命周期:选中出现、点加粗保持、点外消失', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)
    const writing = await newFile(window, '悬浮栏生命周期')

    await writing.typeInEditor('悬浮栏的测试文字')
    await writing.editor.locator('.ProseMirror').click()
    await window.keyboard.press('Control+a')

    const bubble = window.locator(SELECTORS.writing.formatBubble)
    await expect(bubble).toBeVisible({ timeout: 3000 })

    // 点加粗 → 悬浮栏保持可见
    await window.locator(SELECTORS.writing.bubbleBold).click()
    await expect(writing.editor.locator('strong', { hasText: '悬浮栏的测试文字' })).toBeVisible()
    await expect(bubble).toBeVisible()

    // 点击悬浮栏外部 → 消失
    await window.locator(SELECTORS.writing.saveStatus).click()
    await expect(bubble).not.toBeVisible({ timeout: 3000 })
  })

  // ── 4. 智能 Enter ──────────────────────────────────────────────────

  test('智能 Enter:段中回车=单行硬换行;段尾回车=新段落', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)
    const writing = await newFile(window, '智能回车测试')

    await writing.typeInEditor('ABCD')
    const proseMirror = writing.editor.locator('.ProseMirror')
    await proseMirror.click()
    // 光标移到 B/C 之间(段尾 → 左移两次)
    await window.keyboard.press('End')
    await window.keyboard.press('ArrowLeft')
    await window.keyboard.press('ArrowLeft')
    await window.keyboard.press('Enter')
    await window.waitForTimeout(200)

    // 段中回车 = 单行硬换行:仍是单个段落,只含一个 <br>,无空行
    await expect(proseMirror.locator('p')).toHaveCount(1)
    await expect(proseMirror.locator('br')).toHaveCount(1)

    // 段尾回车 = 新段落
    await window.keyboard.press('End')
    await window.keyboard.press('Enter')
    await window.waitForTimeout(200)
    await expect(proseMirror.locator('p')).toHaveCount(2)
  })

  // ── 5. 分隔线 ──────────────────────────────────────────────────────

  test('分隔线:工具栏插入后光标落到下一行;行首 Backspace 删除', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)
    const writing = await newFile(window, '分隔线测试')

    await writing.typeInEditor('分隔线上方')
    await writing.editor.locator('.ProseMirror').click()
    await window.keyboard.press('End')

    // 点工具栏分隔线 → 轨道 hr 渲染
    await window.locator(SELECTORS.writing.toolbarHr).click()
    await expect(writing.editor.locator('.writing-orbit-hr')).toHaveCount(1)

    // 光标在下一行:聚焦 hr 下方的空段落后输入 X,出现在分隔线下方
    const lastPara = writing.editor.locator('.ProseMirror p').last()
    await lastPara.click()
    await window.keyboard.type('X')
    await window.waitForTimeout(200)
    await expect(lastPara).toHaveText('X')
    await expect(writing.editor.locator('.writing-orbit-hr')).toHaveCount(1)

    // 光标移到行首 → Backspace 删除分隔线(ProseMirror 首次选中、再次删除,断言最终消失)
    await window.keyboard.press('Home')
    await window.keyboard.press('Backspace')
    await window.waitForTimeout(200)
    if (await writing.editor.locator('.writing-orbit-hr').count() > 0) {
      await window.keyboard.press('Backspace')
      await window.waitForTimeout(200)
    }
    await expect(writing.editor.locator('.writing-orbit-hr')).toHaveCount(0)
  })

  // ── 6. 工具栏引用包裹 + 渲染格调 + 报纸主题 ─────────────────────────

  test('工具栏引用按钮包裹段落为 blockquote 且蜡烛 ::before 生效', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)
    const writing = await newFile(window, '引用样式测试')

    await writing.typeInEditor('引用段落')
    await writing.editor.locator('.ProseMirror').click()
    await window.locator(SELECTORS.writing.toolbarBlockquote).click()

    await expect(writing.editor.locator('blockquote')).toHaveCount(1)
    const bqContent = await writing.editor.locator('blockquote').first().evaluate(
      (el) => getComputedStyle(el, '::before').content,
    )
    expect(bqContent).not.toBe('none')
  })

  // 渲染格调用 seed 的 markdown(含引用/标题/有序列表/分隔线)断言 CSS 伪元素;
  // 不用 UI 依次插入——实测「正文→hr→gutter 有序列表」会触发 ProseMirror
  // RangeError(位置越界)+ orbit-hr nodeView 重复(独立 feature bug,见报告)。
  test('渲染格调:蜡烛引用/轨道分隔线/列表序号/标题烛首 + 报纸主题适配', async ({ window, testLibraryPath }) => {
    const styledBody = `# 格调标题\n\n> 引用段落\n\n1. 有序第一项\n2. 有序第二项\n\n---\n`
    const fm = '---\ntype: writing\ntitle: 格调渲染\ncreated: 2026-08-11\nupdated: 2026-08-11\n---\n\n'
    const writingDir = path.join(testLibraryPath, 'writing')
    fs.mkdirSync(writingDir, { recursive: true })
    fs.writeFileSync(path.join(writingDir, '格调渲染.md'), fm + styledBody, 'utf8')

    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })
    await window.waitForTimeout(1500)

    const writing = new WritingPage(window)
    await writing.selectFile('格调渲染')
    await window.waitForTimeout(1500)
    await expect(writing.editor).toBeVisible()

    // 引用蜡烛 ::before
    await expect(writing.editor.locator('blockquote')).toHaveCount(1)
    const bqContent = await writing.editor.locator('blockquote').first().evaluate(
      (el) => getComputedStyle(el, '::before').content,
    )
    expect(bqContent).not.toBe('none')

    // 标题烛首 ::before
    await expect(writing.editor.locator('h1')).toHaveCount(1)
    const h1Content = await writing.editor.locator('h1').first().evaluate(
      (el) => getComputedStyle(el, '::before').content,
    )
    expect(h1Content).not.toBe('none')

    // 有序列表暖橙序号 ::before
    await expect(writing.editor.locator('ol')).toHaveCount(1)
    const olContent = await writing.editor.locator('ol li').first().evaluate(
      (el) => getComputedStyle(el, '::before').content,
    )
    expect(olContent).not.toBe('none')

    // 分隔线轨道 svg
    await expect(writing.editor.locator('.writing-orbit-hr svg')).toHaveCount(1)

    // 切报纸主题 → 轨道 svg 仍在,且 --writing-tone-color = #1a1a1a
    await window.locator(SELECTORS.briefing.themeToggle).click()
    await window.waitForTimeout(300)
    await expect(writing.editor.locator('.writing-orbit-hr svg')).toHaveCount(1)
    const tone = await window.locator(SELECTORS.writing.editor).evaluate(
      (el) => getComputedStyle(el).getPropertyValue('--writing-tone-color').trim(),
    )
    expect(tone).toBe('#1a1a1a')
  })
})
