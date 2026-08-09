# 写作表格 UI + 块级 gutter 插入菜单 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给写作编辑器(Milkdown)的表格补上暗色网格样式、行列增删手柄、对齐/删除菜单,并把块级插入(列表/表格/标题)入口移到光标所在块左侧的 gutter「+」菜单。

**Architecture:** 全部渲染进程侧改动:一个 CSS 文件 + 两个新 `$prose` ProseMirror 插件(沿用 `milkdown-paste-plain.ts` 模式,插件工厂闭包持 ctx 直调 preset-gfm 命令)+ 顶部栏删一个按钮。行列定位走 DOM(`rowIndex`/`cellIndex`),不依赖 TableMap 的 pos 偏移约定。无 IPC、无持久化、无新依赖。

**Tech Stack:** Milkdown v7.21.3(preset-gfm 表格命令)、ProseMirror Plugin view、Playwright E2E。

**Spec:** `docs/superpowers/specs/2026-08-09-writing-table-ui-design.md`

## Global Constraints

- `src/lib/milkdown-*.ts` 被渲染进程使用,**禁止引入 node 内置模块**(ipc-state §5);文件首行注释照抄现有文件写法。
- 所有可交互元素必须有 `data-testid`(feature-development §12 UI 出口规则)。
- 验证只跑定向测试(general §9):`npx playwright test --config e2e/playwright.config.ts writing-table-ui`,禁止全量。
- 样式用项目调色板:深褐 `#2a1f1a`(=ink)、米色 `#e8d5b7`(=parchment,透明度变体用 rgba(232,213,183,x))、暖橙 `#d97757` 不用于表格。
- **不做**列宽拖拽 UX(手柄 CSS 隐藏)、列宽持久化、行列移动、单元格合并、简报渲染侧改动。
- 命令 payload 签名(preset-gfm 7.21.3 实测):`selectRowCommand/selectColCommand` 收 `{ index: number; pos?: number }`;`setAlignCommand` 收 `'left'|'center'|'right'`;`insertTableCommand` 收 `{ row?: number; col?: number }`;`addRowAfterCommand/addColAfterCommand/deleteSelectedCellsCommand/deleteTableCommand` 无 payload。
- e2e 运行时**不要**执行 `npm run dev:clean` / `taskkill`(会误杀 e2e 的 electron 进程)。

## 文件结构

| 文件 | 职责 |
|---|---|
| `src/components/writing/writing-editor.css` (改) | 表格网格、拖拽手柄隐藏、selectedCell、手柄/gutter 按钮样式、gutter 车道 padding |
| `src/lib/milkdown-table-handles.ts` (新) | 表格行列手柄 + ⋯ 菜单插件,导出 `tableHandlesPlugins: MilkdownPlugin[]` |
| `src/lib/milkdown-gutter-insert.ts` (新) | 块级 gutter「+」插入菜单插件,导出 `gutterInsertPlugins: MilkdownPlugin[]` |
| `src/components/writing/WritingEditor.tsx` (改) | 注册两个新插件 |
| `src/components/writing/WritingToolbar.tsx` (改) | 移除 ▦ 按钮与 `insertTableCommand` import |
| `e2e/specs/writing-table-ui.spec.ts` (新) | 全部 6 条 E2E 断言 |
| `e2e/helpers/selectors.ts` (改) | 删除死条目 `toolbarTable`(无任何 spec 引用) |

`e2e/source-map.json` 无需改:writing 组 specs 是 glob `writing-*.spec.ts`,自动覆盖新 spec。

---

### Task 1: 表格网格样式 CSS + E2E 骨架

**Files:**
- Modify: `src/components/writing/writing-editor.css`
- Test: `e2e/specs/writing-table-ui.spec.ts`

**Interfaces:**
- Consumes: 无(首个任务)。
- Produces: E2E spec 的 `setup()` helper(后续 Task 的所有测试复用,同一文件内);fixture 文章结构(标题 + 段落一 + 3列表格 + 代码块 + 段落二);CSS 选择器 `.writing-editor-root .ProseMirror td/th`、`.column-resize-handle` 隐藏规则。

- [ ] **Step 1: 写失败的 E2E 骨架(文件 + setup + 第 1 条测试)**

创建 `e2e/specs/writing-table-ui.spec.ts`(setup 结构复刻 `e2e/specs/writing-codeblock-wrap.spec.ts`):

```ts
import { test, expect } from '../fixtures/electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedStateJson } from '../helpers/test-library'

/**
 * 写作表格 UI(设计:docs/superpowers/specs/2026-08-09-writing-table-ui-design.md)
 * - 表格网格样式:官方 tables.css 未加载,自写暗色网格;列宽拖拽手柄显式隐藏
 *   (GFM 存不下列宽,不留假 affordance)。
 * - 行列手柄/⋯菜单/gutter 菜单见后续测试。
 */

const ARTICLE_TITLE = '表格 UI 验证'

/** 3 列 2 数据行表格,分隔行用裸 ---(对齐断言依赖:左对齐后才出现 `:---`) */
const ARTICLE_BODY = `# ${ARTICLE_TITLE}

正文段落一。

| 名称 | 数量 | 备注 |
| --- | --- | --- |
| 甲 | 1 | x |
| 乙 | 2 | y |

\`\`\`
code line
\`\`\`

正文段落二。
`

function fm(title: string): string {
  return `---\ntype: writing\ntitle: ${title}\ncreated: 2026-08-09\nupdated: 2026-08-09\n---\n\n`
}

test.describe('@p2 writing-table-ui', () => {
  async function setup(window: any, testLibraryPath: string, testConfigDir: string) {
    seedStateJson(testConfigDir, {})

    const writingDir = path.join(testLibraryPath, 'writing')
    fs.mkdirSync(writingDir, { recursive: true })
    fs.writeFileSync(path.join(writingDir, `${ARTICLE_TITLE}.md`), fm(ARTICLE_TITLE) + ARTICLE_BODY, 'utf8')

    const cover = new CoverPage(window)
    await cover.nameInput.or(cover.lightButton).waitFor({ state: 'visible', timeout: 15000 })
    if (await cover.nameInput.isVisible().catch(() => false)) {
      await cover.enterName('E2E 测试员')
    }
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })
    await window.waitForTimeout(1500)

    await window.getByTestId('writing-tree-node').filter({ hasText: ARTICLE_TITLE }).click()
    await expect(window.locator('[data-testid="writing-editor"] .ProseMirror')).toBeVisible({ timeout: 10000 })
    await window.waitForTimeout(1500)
  }

  test('表格渲染带边框网格,列宽拖拽手柄被隐藏', async ({ window, testLibraryPath, testConfigDir }) => {
    await setup(window, testLibraryPath, testConfigDir)

    const m = await window.evaluate(() => {
      const td = document.querySelector('.ProseMirror td') as HTMLElement
      // 拖拽手柄只在拖拽瞬间生成,用探针元素验证 CSS 规则本身
      const probe = document.createElement('div')
      probe.className = 'column-resize-handle'
      document.querySelector('.ProseMirror')!.appendChild(probe)
      const probeDisplay = getComputedStyle(probe).display
      probe.remove()
      return {
        tdBorderWidth: getComputedStyle(td).borderTopWidth,
        tdBorderStyle: getComputedStyle(td).borderTopStyle,
        probeDisplay,
      }
    })

    expect(m.tdBorderWidth).toBe('1px')
    expect(m.tdBorderStyle).toBe('solid')
    expect(m.probeDisplay).toBe('none')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx playwright test --config e2e/playwright.config.ts writing-table-ui`
Expected: FAIL — `tdBorderWidth` 为 `'0px'`(Tailwind preflight 重置了表格边框)。

- [ ] **Step 3: 在 writing-editor.css 末尾追加表格样式**

```css
/* 表格网格:官方 tables.css 未加载(亮色主题),自写暗色网格。
   列宽拖拽手柄显式隐藏——GFM markdown 存不下列宽,不留假 affordance
   (columnResizing 插件本身保留,只藏 UI)。 */
.writing-editor-root .ProseMirror table {
  border-collapse: collapse;
}
.writing-editor-root .ProseMirror td,
.writing-editor-root .ProseMirror th {
  border: 1px solid rgba(232, 213, 183, 0.2);
  padding: 0.3em 0.6em;
}
.writing-editor-root .ProseMirror th {
  background: rgba(232, 213, 183, 0.05);
  font-weight: 600;
}
.writing-editor-root .ProseMirror .column-resize-handle {
  display: none !important;
}
/* 单元格多选(prosemirror-tables cell selection)选中态 */
.writing-editor-root .ProseMirror .selectedCell {
  position: relative;
}
.writing-editor-root .ProseMirror .selectedCell::after {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(232, 213, 183, 0.1);
  pointer-events: none;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx playwright test --config e2e/playwright.config.ts writing-table-ui`
Expected: PASS(1 passed)

- [ ] **Step 5: Commit**

```bash
git add src/components/writing/writing-editor.css e2e/specs/writing-table-ui.spec.ts
git commit -m "feat(writing): 表格暗色网格样式 + 隐藏列宽拖拽手柄(假 affordance)"
```

---

### Task 2: 表格行列手柄 + ⋯ 菜单插件

**Files:**
- Create: `src/lib/milkdown-table-handles.ts`
- Modify: `src/components/writing/WritingEditor.tsx`(注册插件)
- Modify: `src/components/writing/writing-editor.css`(手柄/菜单样式 + root position)
- Test: `e2e/specs/writing-table-ui.spec.ts`(追加 2 条测试)

**Interfaces:**
- Consumes: Task 1 的 `setup()` 与 fixture。
- Produces: `tableHandlesPlugins: MilkdownPlugin[]`(Task 2 自己在 WritingEditor 注册);testid `writing-table-handles` / `writing-table-row-add` / `writing-table-row-del` / `writing-table-col-add` / `writing-table-col-del` / `writing-table-menu` / `writing-table-menu-popup` / `writing-table-align`(`data-align`)/ `writing-table-delete`;CSS 类 `.writing-handle-btn` / `.writing-table-menu-popup`;`.writing-editor-root` 获得 `position: relative`(Task 3 的 gutter 也挂载在此,依赖该定位上下文)。

- [ ] **Step 1: 追加失败的 E2E(2 条测试,加在 Task 1 的 test 之后)**

```ts
  test('行列手柄跟随光标,支持增删行列', async ({ window, testLibraryPath, testConfigDir }) => {
    await setup(window, testLibraryPath, testConfigDir)

    // 光标进表格第一个单元格 → 手柄出现
    await window.locator('.ProseMirror td').first().click()
    await expect(window.getByTestId('writing-table-row-add')).toBeVisible()
    await expect(window.getByTestId('writing-table-row-del')).toBeVisible()
    await expect(window.getByTestId('writing-table-col-add')).toBeVisible()
    await expect(window.getByTestId('writing-table-col-del')).toBeVisible()
    await expect(window.getByTestId('writing-table-menu')).toBeVisible()

    // 行增删:3 行(表头+2)→ 4 → 3
    await expect(window.locator('.ProseMirror tr')).toHaveCount(3)
    await window.getByTestId('writing-table-row-add').click()
    await expect(window.locator('.ProseMirror tr')).toHaveCount(4)
    await window.getByTestId('writing-table-row-del').click()
    await expect(window.locator('.ProseMirror tr')).toHaveCount(3)

    // 列增删:3 列 → 4 → 3
    await expect(window.locator('.ProseMirror tr').first().locator('th,td')).toHaveCount(3)
    await window.getByTestId('writing-table-col-add').click()
    await expect(window.locator('.ProseMirror tr').first().locator('th,td')).toHaveCount(4)
    await window.getByTestId('writing-table-col-del').click()
    await expect(window.locator('.ProseMirror tr').first().locator('th,td')).toHaveCount(3)
  })

  test('⋯ 菜单:列对齐写回 markdown,删除表格', async ({ window, testLibraryPath, testConfigDir }) => {
    await setup(window, testLibraryPath, testConfigDir)
    const filePath = path.join(testLibraryPath, 'writing', `${ARTICLE_TITLE}.md`)

    await window.locator('.ProseMirror td').first().click()
    await window.getByTestId('writing-table-menu').click()
    await expect(window.getByTestId('writing-table-menu-popup')).toBeVisible()

    // 左对齐 → 自动保存后磁盘 markdown 分隔行出现 `:---`(fixture 原为裸 `---`)
    await window.getByTestId('writing-table-align').filter({ hasText: '左对齐' }).click()
    await expect(window.locator(SELECTORS.writing.saveStatus)).toContainText('已保存', { timeout: 5000 })
    const aligned = fs.readFileSync(filePath, 'utf8')
    expect(aligned).toContain(':---')

    // 删除表格 → 编辑器中 table 消失
    await window.getByTestId('writing-table-menu').click()
    await window.getByTestId('writing-table-delete').click()
    await expect(window.locator('.ProseMirror table')).toHaveCount(0)
  })
```

- [ ] **Step 2: 运行确认失败**

Run: `npx playwright test --config e2e/playwright.config.ts writing-table-ui -g "行列手柄"`
Expected: FAIL — `writing-table-row-add` 不存在。

- [ ] **Step 3: 创建 `src/lib/milkdown-table-handles.ts`**

```ts
// 注意:本文件被渲染进程使用,禁止引入 node 内置模块(ipc-state §5)。
// 表格行列手柄 + 左上角 ⋯ 菜单(设计:docs/superpowers/specs/2026-08-09-writing-table-ui-design.md §②)。
// 光标在表格内时跟随光标所在单元格:行左侧 +/−(下方插行/删该行)、列顶部 +/−(右侧插列/
// 删该列)、左上角 ⋯(列对齐左/中/右、删除表格)。行列定位走 DOM(rowIndex/cellIndex),
// GFM 表格无跨行跨列,与 prosemirror-tables 的 grid 索引一致。
// 删行/列 = selectRow/selectCol → deleteSelectedCells(单元格多选态原生兼容)。
// 命令经 $prose 工厂闭包的 ctx 直调,不走 toolbar 的 writingEditorAction 代理。
// 按钮用 mousedown + preventDefault,避免点击夺走编辑器选区导致手柄自身隐藏。
import { $prose, callCommand } from '@milkdown/utils'
import { Plugin, PluginKey } from '@milkdown/prose/state'
import {
  addRowAfterCommand,
  addColAfterCommand,
  selectRowCommand,
  selectColCommand,
  deleteSelectedCellsCommand,
  setAlignCommand,
  deleteTableCommand,
} from '@milkdown/preset-gfm'
import type { MilkdownPlugin, Ctx } from '@milkdown/ctx'
import type { EditorView } from '@milkdown/prose/view'
import type { ResolvedPos } from '@milkdown/prose/model'

/** 光标祖先链上的表格节点 pos;不在表格内返回 null */
function findTablePos($from: ResolvedPos): number | null {
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === 'table') return $from.before(d)
  }
  return null
}

/** 光标所在单元格(table_cell/table_header 祖先)的 pos */
function findCellPos($from: ResolvedPos): number | null {
  for (let d = $from.depth; d > 0; d--) {
    const name = $from.node(d).type.name
    if (name === 'table_cell' || name === 'table_header') return $from.before(d)
  }
  return null
}

class TableHandlesView {
  private container: HTMLDivElement
  private popup: HTMLDivElement
  private row = 0
  private col = 0
  private relayout = () => this.layout()
  private onDocClick = () => this.closeMenu()

  constructor(private view: EditorView, private ctx: Ctx, private root: HTMLElement) {
    this.container = document.createElement('div')
    this.container.dataset.testid = 'writing-table-handles'
    this.container.style.display = 'none'
    root.appendChild(this.container)

    this.mkBtn('writing-table-row-add', '+', () => this.call(addRowAfterCommand.key))
    this.mkBtn('writing-table-row-del', '−', () => {
      this.call(selectRowCommand.key, { index: this.row })
      this.call(deleteSelectedCellsCommand.key)
    })
    this.mkBtn('writing-table-col-add', '+', () => this.call(addColAfterCommand.key))
    this.mkBtn('writing-table-col-del', '−', () => {
      this.call(selectColCommand.key, { index: this.col })
      this.call(deleteSelectedCellsCommand.key)
    })
    this.mkBtn('writing-table-menu', '⋯', () => this.toggleMenu())

    // ⋯ 弹出菜单:列对齐 + 删除表格
    this.popup = document.createElement('div')
    this.popup.dataset.testid = 'writing-table-menu-popup'
    this.popup.className = 'writing-table-menu-popup'
    this.popup.style.display = 'none'
    this.popup.addEventListener('click', e => e.stopPropagation())
    for (const [label, align] of [['左对齐', 'left'], ['居中', 'center'], ['右对齐', 'right']] as const) {
      const b = document.createElement('button')
      b.dataset.testid = 'writing-table-align'
      b.dataset.align = align
      b.textContent = label
      b.addEventListener('mousedown', e => {
        e.preventDefault()
        this.call(setAlignCommand.key, align)
        this.closeMenu()
      })
      this.popup.appendChild(b)
    }
    const del = document.createElement('button')
    del.dataset.testid = 'writing-table-delete'
    del.textContent = '删除表格'
    del.addEventListener('mousedown', e => {
      e.preventDefault()
      this.call(deleteTableCommand.key)
      this.closeMenu()
    })
    this.popup.appendChild(del)
    this.container.appendChild(this.popup)

    // capture 阶段监听任意滚动(编辑器容器/.tableWrapper 横滚),跟随重定位
    document.addEventListener('scroll', this.relayout, true)
    window.addEventListener('resize', this.relayout)
  }

  private call(cmd: any, payload?: any) {
    callCommand(cmd, payload)(this.ctx)
  }

  private mkBtn(testid: string, text: string, onDown: () => void): HTMLButtonElement {
    const b = document.createElement('button')
    b.dataset.testid = testid
    b.textContent = text
    b.className = 'writing-handle-btn'
    b.addEventListener('mousedown', e => { e.preventDefault(); onDown() })
    b.addEventListener('click', e => e.stopPropagation())
    this.container.appendChild(b)
    return b
  }

  private toggleMenu() {
    const open = this.popup.style.display !== 'none'
    if (open) return this.closeMenu()
    this.popup.style.display = 'block'
    document.addEventListener('click', this.onDocClick)
  }

  private closeMenu() {
    this.popup.style.display = 'none'
    document.removeEventListener('click', this.onDocClick)
  }

  private place(testid: string, left: number, top: number) {
    const b = this.container.querySelector<HTMLElement>(`[data-testid="${testid}"]`)!
    b.style.left = `${Math.round(left)}px`
    b.style.top = `${Math.round(top)}px`
  }

  private layout() {
    const { $from } = this.view.state.selection
    const tablePos = findTablePos($from)
    const cellPos = tablePos != null ? findCellPos($from) : null
    if (tablePos == null || cellPos == null) {
      this.container.style.display = 'none'
      this.closeMenu()
      return
    }
    const tableDOM = this.view.nodeDOM(tablePos) as HTMLElement | null
    const cellDOM = this.view.nodeDOM(cellPos) as HTMLTableCellElement | null
    const rootRect = this.root.getBoundingClientRect()
    const tableRect = tableDOM?.getBoundingClientRect()
    // 几何失败(表格滚出视口/未渲染)→ 隐藏,不抛错
    if (!tableDOM || !cellDOM || !tableRect || tableRect.width === 0) {
      this.container.style.display = 'none'
      this.closeMenu()
      return
    }
    const cellRect = cellDOM.getBoundingClientRect()
    this.row = (cellDOM.parentElement as HTMLTableRowElement).rowIndex
    this.col = cellDOM.cellIndex

    const t = (r: DOMRect) => r.top - rootRect.top
    const l = (r: DOMRect) => r.left - rootRect.left
    this.container.style.display = 'block'

    // 行手柄:表格左侧车道,竖排居中于光标所在行
    const rowX = l(tableRect) - 24
    const rowMidY = t(cellRect) + cellRect.height / 2
    this.place('writing-table-row-add', rowX, rowMidY - 19)
    this.place('writing-table-row-del', rowX, rowMidY + 1)
    // 列手柄:表格上方,横排对齐光标所在列左缘(顶部越界时压到 0)
    const colY = Math.max(t(tableRect) - 24, 0)
    this.place('writing-table-col-add', l(cellRect), colY)
    this.place('writing-table-col-del', l(cellRect) + 20, colY)
    // ⋯:表格左上角车道位
    this.place('writing-table-menu', l(tableRect) - 24, colY)
    this.popup.style.left = `${Math.round(l(tableRect) - 24)}px`
    this.popup.style.top = `${Math.round(colY + 22)}px`
  }

  update(view: EditorView) {
    this.view = view
    this.layout()
  }

  destroy() {
    document.removeEventListener('scroll', this.relayout, true)
    window.removeEventListener('resize', this.relayout)
    document.removeEventListener('click', this.onDocClick)
    this.container.remove()
  }
}

const tableHandles = $prose(
  (ctx) =>
    new Plugin({
      key: new PluginKey('STUDY_PARLOR_TABLE_HANDLES'),
      view: (view) => {
        const root = view.dom.closest('.writing-editor-root') as HTMLElement | null
        if (!root) return { update: () => {}, destroy: () => {} }
        return new TableHandlesView(view, ctx, root)
      },
    }),
)

export const tableHandlesPlugins: MilkdownPlugin[] = [tableHandles]
```

- [ ] **Step 4: 注册插件 + 追加 CSS**

`src/components/writing/WritingEditor.tsx`:
- import 区加 `import { tableHandlesPlugins } from '@/lib/milkdown-table-handles'`
- 插件链 `.use(codeblockEnterPlugins)` 之后加 `.use(tableHandlesPlugins)`

`src/components/writing/writing-editor.css` 末尾追加:

```css
/* 表格手柄/gutter 的挂载定位上下文 */
.writing-editor-root {
  position: relative;
}
/* 行列手柄与 ⋯ 按钮:深褐底 + 米色细边,悬浮提亮 */
.writing-handle-btn {
  position: absolute;
  z-index: 20;
  width: 18px;
  height: 18px;
  padding: 0;
  font-size: 12px;
  line-height: 16px;
  text-align: center;
  color: rgba(232, 213, 183, 0.6);
  background: #2a1f1a;
  border: 1px solid rgba(232, 213, 183, 0.2);
  border-radius: 4px;
  cursor: pointer;
}
.writing-handle-btn:hover {
  color: #e8d5b7;
  background: rgba(232, 213, 183, 0.1);
}
/* ⋯ 弹出菜单(与 toolbar 下拉同族:bg-ink + parchment/20 边) */
.writing-table-menu-popup {
  position: absolute;
  z-index: 30;
  min-width: 88px;
  padding: 4px 0;
  background: #2a1f1a;
  border: 1px solid rgba(232, 213, 183, 0.2);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}
.writing-table-menu-popup button {
  display: block;
  width: 100%;
  padding: 6px 12px;
  font-size: 12px;
  text-align: left;
  color: rgba(232, 213, 183, 0.8);
  background: none;
  border: none;
  cursor: pointer;
}
.writing-table-menu-popup button:hover {
  background: rgba(232, 213, 183, 0.1);
}
```

- [ ] **Step 5: 运行确认通过**

Run: `npx playwright test --config e2e/playwright.config.ts writing-table-ui`
Expected: PASS(3 passed)

- [ ] **Step 6: Commit**

```bash
git add src/lib/milkdown-table-handles.ts src/components/writing/WritingEditor.tsx src/components/writing/writing-editor.css e2e/specs/writing-table-ui.spec.ts
git commit -m "feat(writing): 表格行列手柄 + ⋯菜单(对齐/删除表格),跟随光标单元格"
```

---

### Task 3: 块级 gutter「+」插入菜单插件

**Files:**
- Create: `src/lib/milkdown-gutter-insert.ts`
- Modify: `src/components/writing/WritingEditor.tsx`(注册插件)
- Modify: `src/components/writing/writing-editor.css`(gutter 车道 padding + 菜单样式)
- Test: `e2e/specs/writing-table-ui.spec.ts`(追加 2 条测试)

**Interfaces:**
- Consumes: Task 1 的 `setup()`;Task 2 给 `.writing-editor-root` 加的 `position: relative`;`runCollapsedBlockCommand(cmd, payload)` from `src/lib/milkdown-collapse-selection.ts`(签名:`(cmd: any, payload?: any) => (ctx: Ctx) => boolean`)。
- Produces: `gutterInsertPlugins: MilkdownPlugin[]`;testid `writing-gutter-plus` / `writing-gutter-menu` / `writing-gutter-item`(`data-type`: `bullet|ordered|table|h1|h2|h3`);CSS 类 `.writing-gutter-menu`;`.ProseMirror` 获得 `padding-left: 26px` gutter 车道。

- [ ] **Step 1: 追加失败的 E2E(2 条测试,加在 Task 2 的测试之后)**

```ts
  test('gutter「+」菜单插入表格/无序列表/H2', async ({ window, testLibraryPath, testConfigDir }) => {
    await setup(window, testLibraryPath, testConfigDir)

    // 光标在段落二 →「+」可见 → 菜单 → 插入表格
    await window.locator('.ProseMirror p').filter({ hasText: '正文段落二' }).click()
    await expect(window.getByTestId('writing-gutter-plus')).toBeVisible()
    await window.getByTestId('writing-gutter-plus').click()
    await expect(window.getByTestId('writing-gutter-menu')).toBeVisible()
    const tableCount = await window.locator('.ProseMirror table').count()
    await window.getByTestId('writing-gutter-item').filter({ hasText: '表格' }).click()
    await expect(window.locator('.ProseMirror table')).toHaveCount(tableCount + 1)

    // 无序列表
    await window.locator('.ProseMirror p').filter({ hasText: '正文段落一' }).click()
    await window.getByTestId('writing-gutter-plus').click()
    await window.getByTestId('writing-gutter-item').filter({ hasText: '无序列表' }).click()
    await expect(window.locator('.ProseMirror ul li').filter({ hasText: '正文段落一' })).toHaveCount(1)

    // H2
    await window.locator('.ProseMirror li').filter({ hasText: '正文段落一' }).click()
    await window.getByTestId('writing-gutter-plus').click()
    await window.getByTestId('writing-gutter-item').filter({ hasText: 'H2' }).click()
    await expect(window.locator('.ProseMirror h2').filter({ hasText: '正文段落一' })).toHaveCount(1)
  })

  test('代码块内 gutter「+」隐藏', async ({ window, testLibraryPath, testConfigDir }) => {
    await setup(window, testLibraryPath, testConfigDir)

    await window.locator('.ProseMirror pre').click()
    await expect(window.getByTestId('writing-gutter-plus')).toBeHidden()
  })
```

- [ ] **Step 2: 运行确认失败**

Run: `npx playwright test --config e2e/playwright.config.ts writing-table-ui -g "gutter"`
Expected: FAIL — `writing-gutter-plus` 不存在。

- [ ] **Step 3: 创建 `src/lib/milkdown-gutter-insert.ts`**

```ts
// 注意:本文件被渲染进程使用,禁止引入 node 内置模块(ipc-state §5)。
// 块级 gutter「+」插入菜单(设计:docs/superpowers/specs/2026-08-09-writing-table-ui-design.md §③)。
// 常驻跟随光标所在顶层块(depth 1),点击展开菜单:无序/有序列表、表格、H1-H3。
// wrap 类命令复用 toolbar 的 runCollapsedBlockCommand(防非空选区被铲平);
// 代码块内隐藏(wrap 在代码块无意义);命令 when 不满足返回 false → 静默关闭,文档不变。
import { $prose, callCommand } from '@milkdown/utils'
import { Plugin, PluginKey } from '@milkdown/prose/state'
import {
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  wrapInHeadingCommand,
} from '@milkdown/preset-commonmark'
import { insertTableCommand } from '@milkdown/preset-gfm'
import { runCollapsedBlockCommand } from './milkdown-collapse-selection'
import type { MilkdownPlugin, Ctx } from '@milkdown/ctx'
import type { EditorView } from '@milkdown/prose/view'

const ITEMS: { type: string; label: string; run: (ctx: Ctx) => unknown }[] = [
  { type: 'bullet', label: '无序列表', run: ctx => runCollapsedBlockCommand(wrapInBulletListCommand.key)(ctx) },
  { type: 'ordered', label: '有序列表', run: ctx => runCollapsedBlockCommand(wrapInOrderedListCommand.key)(ctx) },
  { type: 'table', label: '表格', run: ctx => callCommand(insertTableCommand.key)(ctx) },
  { type: 'h1', label: 'H1', run: ctx => runCollapsedBlockCommand(wrapInHeadingCommand.key, 1)(ctx) },
  { type: 'h2', label: 'H2', run: ctx => runCollapsedBlockCommand(wrapInHeadingCommand.key, 2)(ctx) },
  { type: 'h3', label: 'H3', run: ctx => runCollapsedBlockCommand(wrapInHeadingCommand.key, 3)(ctx) },
]

class GutterInsertView {
  private plus: HTMLButtonElement
  private menu: HTMLDivElement
  private relayout = () => this.layout()
  private onDocClick = () => this.closeMenu()

  constructor(private view: EditorView, private ctx: Ctx, private root: HTMLElement) {
    this.plus = document.createElement('button')
    this.plus.dataset.testid = 'writing-gutter-plus'
    this.plus.textContent = '+'
    this.plus.className = 'writing-handle-btn'
    this.plus.style.display = 'none'
    this.plus.addEventListener('mousedown', e => { e.preventDefault(); this.toggleMenu() })
    this.plus.addEventListener('click', e => e.stopPropagation())
    root.appendChild(this.plus)

    this.menu = document.createElement('div')
    this.menu.dataset.testid = 'writing-gutter-menu'
    this.menu.className = 'writing-gutter-menu'
    this.menu.style.display = 'none'
    this.menu.addEventListener('click', e => e.stopPropagation())
    for (const item of ITEMS) {
      const b = document.createElement('button')
      b.dataset.testid = 'writing-gutter-item'
      b.dataset.type = item.type
      b.textContent = item.label
      b.addEventListener('mousedown', e => {
        e.preventDefault()
        item.run(this.ctx)
        this.closeMenu()
      })
      this.menu.appendChild(b)
    }
    root.appendChild(this.menu)

    document.addEventListener('scroll', this.relayout, true)
    window.addEventListener('resize', this.relayout)
  }

  private toggleMenu() {
    const open = this.menu.style.display !== 'none'
    if (open) return this.closeMenu()
    this.menu.style.display = 'block'
    document.addEventListener('click', this.onDocClick)
  }

  private closeMenu() {
    this.menu.style.display = 'none'
    document.removeEventListener('click', this.onDocClick)
  }

  private layout() {
    const { $from } = this.view.state.selection
    // 代码块内隐藏;depth < 1 无顶层块可言
    let inCode = false
    for (let d = $from.depth; d > 0; d--) {
      if ($from.node(d).type.spec.code || $from.node(d).type.name === 'code_block') { inCode = true; break }
    }
    if (inCode || $from.depth < 1) {
      this.plus.style.display = 'none'
      this.closeMenu()
      return
    }
    const rootRect = this.root.getBoundingClientRect()
    const coords = this.view.coordsAtPos($from.before(1))
    this.plus.style.display = 'block'
    this.plus.style.left = '2px'
    this.plus.style.top = `${Math.round(coords.top - rootRect.top + 2)}px`
    this.menu.style.left = '24px'
    this.menu.style.top = `${Math.round(coords.top - rootRect.top + 22)}px`
  }

  update(view: EditorView) {
    this.view = view
    this.layout()
  }

  destroy() {
    document.removeEventListener('scroll', this.relayout, true)
    window.removeEventListener('resize', this.relayout)
    document.removeEventListener('click', this.onDocClick)
    this.plus.remove()
    this.menu.remove()
  }
}

const gutterInsert = $prose(
  (ctx) =>
    new Plugin({
      key: new PluginKey('STUDY_PARLOR_GUTTER_INSERT'),
      view: (view) => {
        const root = view.dom.closest('.writing-editor-root') as HTMLElement | null
        if (!root) return { update: () => {}, destroy: () => {} }
        return new GutterInsertView(view, ctx, root)
      },
    }),
)

export const gutterInsertPlugins: MilkdownPlugin[] = [gutterInsert]
```

- [ ] **Step 4: 注册插件 + 追加 gutter 车道 CSS**

`src/components/writing/WritingEditor.tsx`:
- import 区加 `import { gutterInsertPlugins } from '@/lib/milkdown-gutter-insert'`
- 插件链 `.use(tableHandlesPlugins)` 之后加 `.use(gutterInsertPlugins)`

`src/components/writing/writing-editor.css` 末尾追加:

```css
/* gutter 车道:为左侧「+」与表格手柄让出 26px(整体均匀缩进,不按块推移正文) */
.writing-editor-root .ProseMirror {
  padding-left: 26px;
}
/* gutter 插入菜单(与 ⋯ 菜单同族) */
.writing-gutter-menu {
  position: absolute;
  z-index: 30;
  min-width: 88px;
  padding: 4px 0;
  background: #2a1f1a;
  border: 1px solid rgba(232, 213, 183, 0.2);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}
.writing-gutter-menu button {
  display: block;
  width: 100%;
  padding: 6px 12px;
  font-size: 12px;
  text-align: left;
  color: rgba(232, 213, 183, 0.8);
  background: none;
  border: none;
  cursor: pointer;
}
.writing-gutter-menu button:hover {
  background: rgba(232, 213, 183, 0.1);
}
```

- [ ] **Step 5: 运行确认通过**

Run: `npx playwright test --config e2e/playwright.config.ts writing-table-ui`
Expected: PASS(5 passed)

- [ ] **Step 6: Commit**

```bash
git add src/lib/milkdown-gutter-insert.ts src/components/writing/WritingEditor.tsx src/components/writing/writing-editor.css e2e/specs/writing-table-ui.spec.ts
git commit -m "feat(writing): 块级 gutter「+」插入菜单(列表/表格/标题),跟随光标顶层块"
```

---

### Task 4: 顶部栏移除 ▦ + 收尾验证

**Files:**
- Modify: `src/components/writing/WritingToolbar.tsx`(删按钮与 import)
- Modify: `e2e/helpers/selectors.ts`(删死条目)
- Test: `e2e/specs/writing-table-ui.spec.ts`(追加 1 条测试)

**Interfaces:**
- Consumes: Task 3 的 gutter 菜单(表格插入新入口已就位)。
- Produces: 无新接口;`writing-toolbar-table` testid 从代码库消失。

- [ ] **Step 1: 追加失败的 E2E(1 条测试,加在 Task 3 的测试之后)**

```ts
  test('顶部栏不再提供插入表格按钮(入口已移至 gutter)', async ({ window, testLibraryPath, testConfigDir }) => {
    await setup(window, testLibraryPath, testConfigDir)

    await expect(window.getByTestId('writing-toolbar-table')).toHaveCount(0)
  })
```

- [ ] **Step 2: 运行确认失败**

Run: `npx playwright test --config e2e/playwright.config.ts writing-table-ui -g "顶部栏"`
Expected: FAIL — 按钮仍存在(count 1)。

- [ ] **Step 3: 移除 ▦ 按钮与死选择器**

`src/components/writing/WritingToolbar.tsx`:
- 第 13 行 import 改为只留 strikethrough:`import { toggleStrikethroughCommand } from '@milkdown/preset-gfm'`
- 删除 ▦ 按钮整块(`<button data-testid="writing-toolbar-table" ...>▦</button>`)及其前面的分隔 `<span className="text-parchment/20 mx-0.5">|</span>`(即原 119-128 行的分隔符 + 按钮;保留 hr 按钮与标题下拉之间的视觉分隔由剩余分隔符承担——若删除后出现两个连续分隔符或首尾分隔符,一并删掉多余的那个)

`e2e/helpers/selectors.ts`:
- 删除第 338 行 `toolbarTable: '[data-testid="writing-toolbar-table"]',`

- [ ] **Step 4: 运行新 spec 全量确认通过**

Run: `npx playwright test --config e2e/playwright.config.ts writing-table-ui`
Expected: PASS(6 passed)

- [ ] **Step 5: 跑定向回归(编辑器既有 spec 未受影响)**

Run: `node scripts/e2e-changed.js --run`
Expected: 受影响 spec(至少含 writing-table-ui、writing-editor)全部 PASS;若脚本把无关大组也算进来,以 `writing-table-ui` + `writing-editor` 两个 spec 通过为准。

- [ ] **Step 6: Commit**

```bash
git add src/components/writing/WritingToolbar.tsx e2e/helpers/selectors.ts e2e/specs/writing-table-ui.spec.ts
git commit -m "refactor(writing): 顶部栏移除▦按钮,表格插入口统一至 gutter「+」菜单"
```

---

## Self-Review 记录

- **Spec 覆盖**:①网格样式→Task 1;②手柄+⋯菜单→Task 2;③gutter→Task 3;④顶部栏移除→Task 4;数据流/边界(几何失败隐藏、代码块隐藏、命令 false 静默、外点关闭、scroll/resize 重定位)→插件代码内联;测试 6 条→Task 1-4 各步。无缺口。
- **占位符扫描**:无 TBD/TODO;所有代码步骤含完整代码。
- **类型一致**:`tableHandlesPlugins`/`gutterInsertPlugins` 命名在定义处(Task 2/3 Step 3)与注册处(Step 4)一致;testid 字符串在插件代码与 E2E 断言间逐一核对一致;`runCollapsedBlockCommand` 签名与 `milkdown-collapse-selection.ts` 实际导出一致。
