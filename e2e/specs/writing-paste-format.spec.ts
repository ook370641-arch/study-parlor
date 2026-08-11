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

  test('鼠标拖选松手后悬浮栏保持(拖选尾巴 click 不算外点)', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)
    const writing = await newFile(window, '拖选保持')
    await writing.typeInEditor('这是一段用于鼠标拖选测试的足够长文字确保能选中')

    const prose = writing.editor.locator('.ProseMirror')
    const box = await prose.boundingBox()
    expect(box).not.toBeNull()

    // 真实鼠标拖选:按下 → 横移 → 松开(松手时浏览器补发一次 document click)
    await window.mouse.move(box!.x + 40, box!.y + box!.height / 2)
    await window.mouse.down()
    await window.mouse.move(box!.x + box!.width - 40, box!.y + box!.height / 2, { steps: 15 })
    await window.mouse.up()

    // 拖选真的建立了选区(否则是测试自身坐标问题,而非产品 bug)
    const selected = await window.evaluate(() => {
      const sel = window.getSelection()
      return !!sel && sel.rangeCount > 0 && !sel.isCollapsed
    })
    expect(selected).toBe(true)

    // 松手后选区仍高亮 → 悬浮栏必须保持(回归:被拖选尾巴的 click 当作外点误杀)
    await expect(window.locator(SELECTORS.writing.formatBubble)).toBeVisible({ timeout: 3000 })
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

  test('分隔线:插入不多空行、横线全宽、行首退格一步删除', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)
    const writing = await newFile(window, '分隔线测试')

    await writing.typeInEditor('分隔线上方')
    await writing.editor.locator('.ProseMirror').click()
    await window.keyboard.press('End')

    // 点工具栏分隔线 → 轨道 hr 渲染
    await window.locator(SELECTORS.writing.toolbarHr).click()
    await expect(writing.editor.locator('.writing-orbit-hr')).toHaveCount(1)

    // 结构断言:文字段直接贴着分隔线(中间无多余空段),分隔线后恰有一段放光标;
    // 且 ::before 全宽横线生效(设计 2026-08-12 §3/§4)
    const structure = await writing.editor.locator('.ProseMirror').evaluate((el) => {
      const hr = el.querySelector('.writing-orbit-hr')
      if (!hr) return null
      const prev = hr.previousElementSibling
      const next = hr.nextElementSibling
      return {
        prevText: prev ? prev.textContent : null,
        prevTag: prev ? prev.tagName : null,
        nextTag: next ? next.tagName : null,
        hrLine: getComputedStyle(hr, '::before').content,
      }
    })
    expect(structure).not.toBeNull()
    expect(structure!.prevTag).toBe('P')
    expect(structure!.prevText).toBe('分隔线上方') // 文字直接贴着分隔线,无多余空段
    expect(structure!.nextTag).toBe('P')           // 分隔线后是光标行
    expect(structure!.hrLine).not.toBe('none')     // 全宽横线 ::before 生效

    // 光标在下一行:输入 X 出现在分隔线下方
    const lastPara = writing.editor.locator('.ProseMirror p').last()
    await lastPara.click()
    await window.keyboard.type('X')
    await window.waitForTimeout(200)
    await expect(lastPara).toHaveText('X')
    await expect(writing.editor.locator('.writing-orbit-hr')).toHaveCount(1)

    // 行首退格一步删除分隔线(设计 2026-08-12 §2:不再需要先选中再删)
    await window.keyboard.press('Home')
    await window.keyboard.press('Backspace')
    await window.waitForTimeout(200)
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

  test('行首退格解除引用:引用内第一段退格 → 引用消失、文字保留', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)
    const writing = await newFile(window, '解除引用测试')

    await writing.typeInEditor('引用内容')
    await window.locator(SELECTORS.writing.toolbarBlockquote).click()
    await expect(writing.editor.locator('blockquote')).toHaveCount(1)

    // 引用内第一段行首退格 → blockquote 包裹消失,文字保留为普通段落
    await writing.editor.locator('.ProseMirror').click()
    await window.keyboard.press('Home')
    await window.keyboard.press('Backspace')
    await window.waitForTimeout(200)

    await expect(writing.editor.locator('blockquote')).toHaveCount(0)
    await expect(writing.editor.locator('.ProseMirror p').first()).toHaveText('引用内容')
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
