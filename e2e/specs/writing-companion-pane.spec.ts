import { test, expect } from '../fixtures/electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { CoverPage } from '../pages/CoverPage'
import { WritingAssistantPanel } from '../pages/WritingAssistantPanel'
import { WritingPage } from '../pages/WritingPage'
import { SELECTORS } from '../helpers/selectors'
import { seedWritingTree } from '../helpers/test-library'

// 对照文模式（Companion Pane）E2E——对应 docs/superpowers/specs/2026-08-20-writing-companion-pane-design.md 验收清单。
// 断言只认 data-testid / data-companion；唯一文案匹配是空态引导「点击左侧文件树」（红线豁免）。
//
// seedWritingTree 树结构（zh 排序，顶层组默认展开，子组默认收起）：
//   writing/技术笔记/分布式随笔.md      ← 本 spec 的对照文
//   writing/技术笔记/子组/深度文章.md   ← 折叠组内；进入写作源时自动选中的第一篇（dirs-first 递归）
//   writing/随笔/七月夜话.md           ← 本 spec 的主文
const MAIN_NAME = '七月夜话'
const MAIN_PATH = 'writing/随笔/七月夜话.md'
const COMPANION_NAME = '分布式随笔'
const COMPANION_PATH = 'writing/技术笔记/分布式随笔.md'

test.describe('@p2 writing-companion-pane', () => {
  async function gotoWriting(window: any, testLibraryPath: string) {
    seedWritingTree(testLibraryPath)
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })
    await window.waitForTimeout(1200)
  }

  /** reload 后重回写作源（不 re-seed——树与 state.json 从磁盘恢复）。 */
  async function gotoWritingAfterReload(window: any) {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })
    await window.waitForTimeout(1200)
  }

  function treeNode(window: any, name: string) {
    return window.locator('[data-testid="writing-tree-node"]').filter({ hasText: name })
  }

  /** 右栏折叠/展开（折叠不切 panelMode——映射恢复链路依赖这一点）。 */
  async function collapsePanel(window: any) {
    await window.locator('[data-testid="article-assistant-divider-toggle"]').click()
    await expect(window.locator(SELECTORS.writing.assistantPanel)).toBeHidden()
  }
  async function expandPanel(window: any) {
    await window.locator('[data-testid="article-assistant-divider-toggle"]').click()
    await expect(window.locator(SELECTORS.writing.assistantPanel)).toBeVisible()
  }

  /** 面板折叠态左键点树 = 切主文；确定性等待 store 落位。 */
  async function selectMainFile(window: any, name: string, pathFragment: string) {
    await treeNode(window, name).click()
    await window.waitForFunction(
      (frag: string) => (window as any).useStore.getState().writingFile?.path?.includes(frag),
      pathFragment
    )
    await window.locator(SELECTORS.writing.editor).waitFor({ state: 'visible', timeout: 5000 })
  }

  /** 展开面板并切到对照 tab（主文已选中，tab 可用），断言空态出现。 */
  async function openCompanionTab(window: any) {
    const assistant = new WritingAssistantPanel(window)
    await assistant.open()
    await expect(window.locator('[data-testid="writing-panel-tab-companion"]')).toBeVisible()
    await window.locator('[data-testid="writing-panel-tab-companion"]').click()
    await expect(window.locator('[data-testid="companion-empty"]')).toBeVisible()
    return assistant
  }

  /** 对照模式展开时左键点树 = 换对照文；确定性等待 companionFile 落位。 */
  async function selectCompanion(window: any, name: string, pathFragment: string) {
    await treeNode(window, name).click()
    await window.waitForFunction(
      (frag: string) => (window as any).useStore.getState().companionFile?.path?.includes(frag),
      pathFragment
    )
    await expect(window.locator('[data-testid="companion-board"]')).toBeVisible()
  }

  // ── 1. tab 切换：对照 tab 可见 → 点击 → 空态 ─────────────────────
  test('对照 tab：可见 → 点击 → companion-empty 空态引导', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)
    await selectMainFile(window, MAIN_NAME, MAIN_PATH)

    const assistant = new WritingAssistantPanel(window)
    await assistant.open()
    await expect(window.locator('[data-testid="writing-panel-tab-assistant"]')).toBeVisible()
    await expect(window.locator('[data-testid="writing-panel-tab-companion"]')).toBeVisible()

    await window.locator('[data-testid="writing-panel-tab-companion"]').click()
    const empty = window.locator('[data-testid="companion-empty"]')
    await expect(empty).toBeVisible()
    await expect(empty).toContainText('点击左侧文件树')

    // 切回助手 tab → 助手输入区回来，对照空态消失（互斥槽位）
    await window.locator('[data-testid="writing-panel-tab-assistant"]').click()
    await expect(window.locator(SELECTORS.writing.assistantInput)).toBeVisible()
    await expect(empty).toHaveCount(0)
  })

  // ── 2. 左键情境化：对照模式点树 → 装载对照文 + 树双高亮 ───────────
  test('对照模式下左键点树文章 → companion-board 含文名；树节点带 data-companion；主文不变', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)
    await selectMainFile(window, MAIN_NAME, MAIN_PATH)
    await openCompanionTab(window)

    await selectCompanion(window, COMPANION_NAME, COMPANION_PATH)

    // 头部信息行显示对照文名
    await expect(window.locator('[data-testid="companion-filename"]')).toContainText(COMPANION_NAME)
    // 对照文是 md → 可编辑宿主挂载
    await expect(window.locator('[data-testid="companion-editor"]')).toBeVisible()

    // 树双高亮：对照节点带 data-companion="true"；主文节点不带
    await expect(
      window.locator('[data-testid="writing-tree-node"][data-companion="true"]').filter({ hasText: COMPANION_NAME })
    ).toBeVisible()
    await expect(
      window.locator('[data-testid="writing-tree-node"][data-companion="true"]').filter({ hasText: MAIN_NAME })
    ).toHaveCount(0)

    // 主文未被抢走（左键分流到对照槽，不写主文）
    const mainPath = await window.evaluate(() => (window as any).useStore.getState().writingFile?.path)
    expect(mainPath).toContain(MAIN_PATH)
  })

  // ── 3. 对照文编辑 → autosave 落盘 + 保存状态指示 ─────────────────
  test('编辑对照文 → autosave：保存状态 testid + 磁盘断言', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)
    await selectMainFile(window, MAIN_NAME, MAIN_PATH)
    await openCompanionTab(window)
    await selectCompanion(window, COMPANION_NAME, COMPANION_PATH)

    const marker = `对照文自动保存验证-${Date.now()}`
    const companionPm = window.locator('[data-testid="companion-editor"]').locator('.ProseMirror')
    await companionPm.waitFor({ state: 'visible', timeout: 5000 })
    await window.waitForTimeout(500) // 等 Milkdown loadedRef gate 打开
    await companionPm.click()
    await companionPm.fill(marker)

    // 保存状态指示（1.5s debounce autosave → 已保存 ✓）
    await expect(window.locator('[data-testid="companion-save-status"]')).toContainText('已保存', { timeout: 8000 })

    // 磁盘断言：对照文文件内容已更新（writingWrite 保留 frontmatter、改写 body）
    const diskPath = path.join(testLibraryPath, 'writing', '技术笔记', '分布式随笔.md')
    await expect.poll(() => (fs.existsSync(diskPath) ? fs.readFileSync(diskPath, 'utf8') : '')).toContain(marker)

    // 主文磁盘未被波及
    const mainDisk = fs.readFileSync(path.join(testLibraryPath, 'writing', '随笔', '七月夜话.md'), 'utf8')
    expect(mainDisk).toContain('这是第一篇写作文章')
  })

  // ── 4. 切主文 → companion-board 随映射恢复/清空 ──────────────────
  // 左键分流下切主文的 UI 路径 = 折叠右栏（panelMode 保持 companion）再点树。
  test('切主文：无映射 → 空态；切回有映射主文 → 自动恢复对照文', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)
    await selectMainFile(window, MAIN_NAME, MAIN_PATH)
    await openCompanionTab(window)
    await selectCompanion(window, COMPANION_NAME, COMPANION_PATH)
    // 映射已写：七月夜话 → 分布式随笔

    // 折叠面板切主文为「分布式随笔」（它无映射）→ 对照槽清空
    await collapsePanel(window)
    await selectMainFile(window, COMPANION_NAME, COMPANION_PATH)
    await window.waitForFunction(() => (window as any).useStore.getState().companionFile === null)

    // 重新展开 → 仍处对照 tab（折叠不切模式）→ 空态
    await expandPanel(window)
    await expect(window.locator('[data-testid="companion-empty"]')).toBeVisible()

    // 折叠切回「七月夜话」→ 映射命中 → 对照槽自动恢复分布式随笔
    await collapsePanel(window)
    await selectMainFile(window, MAIN_NAME, MAIN_PATH)
    await window.waitForFunction(
      (frag: string) => (window as any).useStore.getState().companionFile?.path?.includes(frag),
      COMPANION_PATH
    )
    await expandPanel(window)
    await expect(window.locator('[data-testid="companion-board"]')).toBeVisible()
    await expect(window.locator('[data-testid="companion-filename"]')).toContainText(COMPANION_NAME)
    await expect(
      window.locator('[data-testid="writing-tree-node"][data-companion="true"]').filter({ hasText: COMPANION_NAME })
    ).toBeVisible()
  })

  // ── 5. reload 后映射恢复（state.json 持久化）─────────────────────
  test('映射持久化：state.json 落盘 → reload 后切回主文自动恢复对照文', async ({ window, testLibraryPath, testConfigDir }) => {
    await gotoWriting(window, testLibraryPath)
    await selectMainFile(window, MAIN_NAME, MAIN_PATH)
    await openCompanionTab(window)
    await selectCompanion(window, COMPANION_NAME, COMPANION_PATH)

    // state.json 磁盘断言（patchState 同步落盘；poll 吸收 IPC 往返时差）
    const statePath = path.join(testConfigDir, 'state.json')
    await expect.poll(() => {
      try {
        const s = JSON.parse(fs.readFileSync(statePath, 'utf8'))
        return s.writingCompanionMap?.[MAIN_PATH] === COMPANION_PATH &&
          s.writingPanelMode === 'companion' && s.writingAssistantOpen === true
      } catch {
        return false
      }
    }).toBe(true)

    // reload → 重回写作源；panelMode/panelOpen/映射全部从 state.json 恢复
    await window.reload()
    await window.waitForLoadState('domcontentloaded')
    await gotoWritingAfterReload(window)

    // 自动选中第一篇（技术笔记/子组/深度文章，无映射）→ 对照 tab 下呈空态；
    // 能看见 companion-* 即证明「对照 tab 展开态」本身已跨重启恢复。
    await window.waitForFunction(() => !!(window as any).useStore.getState().writingFile)
    await expect(window.locator('[data-testid="companion-empty"]')).toBeVisible({ timeout: 10000 })

    // 折叠切回「七月夜话」→ 命中持久化映射 → 恢复对照文
    await collapsePanel(window)
    await selectMainFile(window, MAIN_NAME, MAIN_PATH)
    await window.waitForFunction(
      (frag: string) => (window as any).useStore.getState().companionFile?.path?.includes(frag),
      COMPANION_PATH
    )
    await expandPanel(window)
    await expect(window.locator('[data-testid="companion-board"]')).toBeVisible()
    await expect(window.locator('[data-testid="companion-filename"]')).toContainText(COMPANION_NAME)
  })

  // ── 6. 右键菜单已删除 ────────────────────────────────────────────
  test('右键树节点（文件/分组）→ 无菜单弹出，选择态不变', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)
    await selectMainFile(window, MAIN_NAME, MAIN_PATH)

    // 右键另一文件节点：旧实现的 fixed z-50 菜单不得出现，主文选择不得被右键改动
    await treeNode(window, COMPANION_NAME).click({ button: 'right' })
    await window.waitForTimeout(400)
    await expect(window.locator('div.fixed.z-50')).toHaveCount(0)
    let mainPath = await window.evaluate(() => (window as any).useStore.getState().writingFile?.path)
    expect(mainPath).toContain(MAIN_PATH)

    // 右键分组节点同样无菜单
    await treeNode(window, '技术笔记').click({ button: 'right' })
    await window.waitForTimeout(400)
    await expect(window.locator('div.fixed.z-50')).toHaveCount(0)
    mainPath = await window.evaluate(() => (window as any).useStore.getState().writingFile?.path)
    expect(mainPath).toContain(MAIN_PATH)
  })

  // ── 7. toolbar 隔离：对照编辑器挂载后主编辑器仍受全局 toolbar 槽驱动 ──
  // 顶栏无加粗按钮，加粗入口 = 选区悬浮栏（writing-bubble-bold，主编辑器 scoped）；
  // 真正消费全局单槽 writingEditorAction 的是顶栏（H▾）——两处都断，既验「加粗 → md 含 **」，
  // 也验对照编辑器（registerToolbarAction=false）没有抢注/清空主编辑器的注册。
  test('toolbar 隔离：对照编辑器挂载后，主编辑器悬浮栏加粗与顶栏标题仍生效', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)
    await selectMainFile(window, MAIN_NAME, MAIN_PATH)
    await openCompanionTab(window)
    await selectCompanion(window, COMPANION_NAME, COMPANION_PATH)
    await window.locator('[data-testid="companion-editor"]').locator('.ProseMirror').waitFor({ state: 'visible', timeout: 5000 })

    // 全局 toolbar 槽仍指向主编辑器（对照实例未覆盖注册）
    const actionRegistered = await window.evaluate(() => !!(window as any).useStore.getState().writingEditorAction)
    expect(actionRegistered).toBe(true)

    // 主编辑器输入 + 全选 + 悬浮栏加粗
    const writing = new WritingPage(window)
    await writing.typeInEditor('加粗隔离验证')
    await writing.editor.locator('.ProseMirror').click()
    await window.keyboard.press('Control+a')
    const bubble = writing.editor.locator(SELECTORS.writing.formatBubble)
    await expect(bubble).toBeVisible({ timeout: 3000 })
    await writing.editor.locator(SELECTORS.writing.bubbleBold).click()
    await expect(writing.editor.locator('strong', { hasText: '加粗隔离验证' })).toBeVisible({ timeout: 3000 })

    // md 断言：store 主文 body 含 **
    await window.waitForFunction(() => {
      const body = (window as any).useStore.getState().writingFile?.body ?? ''
      return body.includes('**加粗隔离验证**')
    })

    // 顶栏（writingEditorAction 消费者）：光标放回主文段落 → H▾ → H1
    await writing.editor.locator('strong', { hasText: '加粗隔离验证' }).click()
    await window.locator(SELECTORS.writing.toolbarHeading).click()
    const h1Option = window.locator(`${SELECTORS.writing.headingOption}[data-level="1"]`)
    await expect(h1Option).toBeVisible({ timeout: 3000 })
    await h1Option.click()
    await expect(writing.editor.locator('h1', { hasText: '加粗隔离验证' })).toBeVisible({ timeout: 3000 })
    await window.waitForFunction(() => {
      const body = (window as any).useStore.getState().writingFile?.body ?? ''
      return body.includes('# **加粗隔离验证**')
    })

    // 交叉断言：对照文未被顶栏/悬浮栏波及（若槽被抢，H1 会落进对照文档）
    const companionBody = await window.evaluate(() => (window as any).useStore.getState().companionFile?.body ?? '')
    expect(companionBody).toContain('关于分布式系统的思考')
    expect(companionBody).not.toContain('加粗隔离验证')
  })
})
