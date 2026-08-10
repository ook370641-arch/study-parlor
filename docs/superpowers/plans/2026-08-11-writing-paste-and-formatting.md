# 写作粘贴清洗 + 悬浮格式栏 + 排版格调化 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复写作编辑器三个粘贴问题（颜色字段、`**` 字面量、代码字体不统一），把加粗/斜体/删除线/颜色移入悬浮格式栏，给引用/分隔线/列表/标题做格调化渲染，并让段中 Enter 只换一行。

**Architecture:** 整体接管 Milkdown clipboard 的 `handlePaste`（去 code + 去 textColor），新增选中文字悬浮栏（`$prose` 插件 + view，复用 table-handles 模式），`writing-editor.css` 用 `currentColor` + 固定 ember 做主题自适应渲染，分隔线用 ProseMirror node view 渲染轨道动画，Enter 用自定义 keymap 做「段中=硬换行」。

**Tech Stack:** Milkdown v7（`@milkdown/prose/state|model|keymap`）、Vitest（jsdom）、Playwright E2E、Tailwind（工具栏）、原生 CSS（编辑器内容）。

## Global Constraints

- 新增 `src/lib/*.ts` 文件**禁止 import node 内置模块**（渲染进程使用，ipc-state §5）。
- 每个 UI 出口必须有 `data-testid` 且至少一个 E2E 断言（feature-development §12）。
- 动效必须可退化：`@media (prefers-reduced-motion: reduce)` 停止动画；分隔线动画在 reduced-motion 下不渲染 `<animateMotion>`（node view 里用 `window.matchMedia` 判断）。
- 验证只跑受影响测试：改测试 → `npx vitest run tests/<file>.test.ts`；改源码 → 对应单元测试 + `node scripts/e2e-changed.js --run --no-retries`。**禁止 `npx vitest run`（全量）与 `npm run test:e2e`**（general §9）。
- E2E 跑 `out/` 构建产物：`e2e-changed.js --run` 自动先构建；手动跑前须 `npx electron-vite build`（e2e §11）。
- 组件文件只导出组件（ui-styling §10）：SVG 图标常量放 `src/lib/`，不要 export 到 `WritingToolbar.tsx`。
- 节点名：`schema.nodes.hardbreak`（不是 `hard_break`）、`schema.nodes.code_block`、`schema.nodes.paragraph`。

---

### Task 1: 切片清洗纯函数 `cleanPastedSlice`

**Files:**
- Create: `src/lib/milkdown-clipboard.ts`（只放纯函数 + 类型，Task 2 再扩插件）
- Test: `tests/writing-paste-clean.test.ts`

**Interfaces:**
- Produces: `export function cleanPastedSlice(slice: Slice, schema: Schema): Slice` —— 内部对 content 递归：`code_block` → `paragraph`（行间插 `hardbreak`）、文本节点去掉 `code`/`textColor` mark、其余节点递归。Task 2 的 handlePaste 依赖它。

- [ ] **Step 1: 写失败测试** `tests/writing-paste-clean.test.ts`

```ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { Editor, rootCtx, defaultValueCtx, schemaCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { Slice, Fragment } from '@milkdown/prose/model'
import { textColorPlugins } from '@/lib/milkdown-text-color'
import { cleanPastedSlice } from '@/lib/milkdown-clipboard'

async function makeSchema() {
  const editor = await Editor.make()
    .use(commonmark).use(gfm).use(textColorPlugins)
    .config(ctx => { ctx.set(rootCtx, document.createElement('div')); ctx.set(defaultValueCtx, '') })
    .create()
  const schema = editor.action(ctx => ctx.get(schemaCtx))
  editor.destroy()
  return schema
}

describe('cleanPastedSlice', () => {
  it('code_block 转 paragraph，多行行间插 hardbreak', async () => {
    const schema = await makeSchema()
    const cb = schema.nodes.code_block.create(null, schema.text('数据需关联核心业务指标'))
    const slice = new Slice(Fragment.from(cb), 0, 0)
    const cleaned = cleanPastedSlice(slice, schema)
    const node = cleaned.content.firstChild!
    expect(node.type.name).toBe('paragraph')
    expect(node.textContent).toBe('数据需关联核心业务指标')
    expect(cleaned.content.childCount).toBe(1)
  })

  it('多行代码块 → 每行之间是 hardbreak，无空白行', async () => {
    const schema = await makeSchema()
    const cb = schema.nodes.code_block.create(null, schema.text('line1\nline2\nline3'))
    const cleaned = cleanPastedSlice(new Slice(Fragment.from(cb), 0, 0), schema)
    const node = cleaned.content.firstChild!
    expect(node.childCount).toBe(5) // text hardbreak text hardbreak text
    expect(node.child(1).type.name).toBe('hardbreak')
    expect(node.child(3).type.name).toBe('hardbreak')
  })

  it('去掉 code 与 textColor mark，保留 strong', async () => {
    const schema = await makeSchema()
    const strong = schema.marks.strong.create()
    const code = schema.marks.code.create()
    const color = schema.marks.textColor.create({ color: '#d97757' })
    const para = schema.nodes.paragraph.create(null, [
      schema.text('加粗', [strong]),
      schema.text('代码', [code]),
      schema.text('彩色', [color]),
    ])
    const cleaned = cleanPastedSlice(new Slice(Fragment.from(para), 0, 0), schema)
    const p = cleaned.content.firstChild!
    expect(p.child(0).marks.map(m => m.type.name)).toEqual(['strong'])
    expect(p.child(1).marks.map(m => m.type.name)).toEqual([])
    expect(p.child(2).marks.map(m => m.type.name)).toEqual([])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/writing-paste-clean.test.ts`
Expected: FAIL — `Cannot find module '@/lib/milkdown-clipboard'`

- [ ] **Step 3: 实现纯函数** `src/lib/milkdown-clipboard.ts`

```ts
// 注意:本文件被渲染进程使用,禁止引入 node 内置模块(ipc-state §5)。
// 粘贴清洗核心:外部粘贴的 slice 统一去掉行内/块级代码与 textColor 颜色,
// 使粘贴进来的内容字体统一(设计:2026-08-11-writing-paste-and-formatting-design.md §A)。
import { Fragment, Slice, Node, Schema } from '@milkdown/prose/model'

export function cleanPastedSlice(slice: Slice, schema: Schema): Slice {
  return new Slice(cleanFragment(slice.content, schema), slice.openStart, slice.openEnd)
}

function cleanFragment(frag: Fragment, schema: Schema): Fragment {
  const out: Node[] = []
  frag.forEach(child => {
    if (child.type.name === 'code_block') {
      out.push(codeBlockToParagraph(child, schema))
    } else if (child.isText) {
      out.push(stripInlineMarks(child))
    } else {
      const cleaned = cleanFragment(child.content, schema)
      out.push(cleaned === child.content ? child : child.copy(cleaned))
    }
  })
  return Fragment.from(out)
}

function codeBlockToParagraph(node: Node, schema: Schema): Node {
  const lines = node.textContent.split('\n')
  const content: Node[] = []
  lines.forEach((line, i) => {
    if (i > 0) content.push(schema.nodes.hardbreak.create())
    if (line) content.push(schema.text(line))
  })
  return schema.nodes.paragraph.create(null, content)
}

function stripInlineMarks(node: Node): Node {
  const kept = node.marks.filter(m => m.type.name !== 'code' && m.type.name !== 'textColor')
  return kept.length === node.marks.length ? node : node.mark(kept)
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/writing-paste-clean.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/lib/milkdown-clipboard.ts tests/writing-paste-clean.test.ts
git commit -m "feat(writing): cleanPastedSlice 去代码+去颜色纯函数"
```

---

### Task 2: 自定义 clipboard 插件（handlePaste + 复制序列化）

**Files:**
- Modify: `src/lib/milkdown-clipboard.ts`（追加插件）
- Modify: `src/components/writing/WritingEditor.tsx`（`.use(clipboard)` → `.use(milkdownClipboardPlugins)`）
- Test: `tests/writing-clipboard.test.ts`

**Interfaces:**
- Consumes: `cleanPastedSlice(slice, schema)`（Task 1）、`sanitizeExternalHTML(html)`（`milkdown-paste-plain.ts` 已存在）
- Produces: `export const milkdownClipboardPlugins: MilkdownPlugin[]`
- `WritingEditor.tsx` 现在注册顺序：`commonmark, gfm, listener, history, clipboard` → 改为 `commonmark, gfm, listener, history, milkdownClipboardPlugins`（后续 Task 3/5 在末尾追加）。

- [ ] **Step 1: 写失败测试** `tests/writing-clipboard.test.ts`

```ts
// @vitest-environment jsdom
// 外部粘贴清洗(自定义 handlePaste):markdown 文本路径 / rich html 路径 / 内部粘贴保留。
// 与 WritingEditor.tsx 的插件组合保持一致(用 milkdownClipboardPlugins 替换 @milkdown/plugin-clipboard)。
import { describe, it, expect } from 'vitest'
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { listener } from '@milkdown/plugin-listener'
import { history } from '@milkdown/plugin-history'
import { getMarkdown } from '@milkdown/utils'
import { AllSelection } from 'prosemirror-state'
import { textColorPlugins } from '@/lib/milkdown-text-color'
import { pastePlainPlugins } from '@/lib/milkdown-paste-plain'
import { milkdownClipboardPlugins } from '@/lib/milkdown-clipboard'

if (typeof globalThis.ClipboardEvent === 'undefined') {
  ;(globalThis as any).ClipboardEvent = class ClipboardEvent extends Event {}
}

type TestEditor = Awaited<ReturnType<typeof makeEditor>>

async function makeEditor(initial = '') {
  const root = document.createElement('div')
  document.body.appendChild(root)
  return Editor.make()
    .use(commonmark).use(gfm).use(listener).use(history)
    .use(milkdownClipboardPlugins)
    .use(textColorPlugins).use(pastePlainPlugins)
    .config(ctx => { ctx.set(rootCtx, root); ctx.set(defaultValueCtx, initial) })
    .create()
}

function pasteHTML(editor: TestEditor, html: string) {
  editor.action(ctx => {
    const view = ctx.get(editorViewCtx)
    const event = new (globalThis as any).ClipboardEvent('paste')
    event.clipboardData = { getData: (t: string) => (t === 'text/html' ? html : '') }
    view.pasteHTML(html, event)
  })
}

function pasteText(editor: TestEditor, text: string) {
  editor.action(ctx => {
    const view = ctx.get(editorViewCtx)
    const event = new (globalThis as any).ClipboardEvent('paste', { bubbles: true, cancelable: true })
    event.clipboardData = { getData: (t: string) => (t === 'text/plain' ? text : '') }
    view.dom.dispatchEvent(event)
  })
}

function docJSON(editor: TestEditor): any {
  return editor.action(ctx => ctx.get(editorViewCtx).state.doc.toJSON())
}

function collectTypes(node: any, out = { nodes: new Set<string>(), marks: new Set<string>() }) {
  if (node.type) out.nodes.add(node.type)
  for (const m of node.marks ?? []) out.marks.add(m.type)
  for (const c of node.content ?? []) collectTypes(c, out)
  return out
}

describe('自定义 handlePaste', () => {
  it('纯文本 markdown：**加粗** → strong，反引号代码 → 纯文字', async () => {
    const editor = await makeEditor('')
    pasteText(editor, '**加粗** and `代码`')
    const { nodes, marks } = collectTypes(docJSON(editor))
    expect(marks.has('strong')).toBe(true)
    expect(marks.has('code')).toBe(false)
    expect(editor.action(getMarkdown())).not.toContain('`')
    editor.destroy()
  })

  it('纯文本 span 颜色 → textColor 不保留', async () => {
    const editor = await makeEditor('')
    pasteText(editor, '前<span style="color:#d97757">彩色</span>后')
    const { marks } = collectTypes(docJSON(editor))
    expect(marks.has('textColor')).toBe(false)
    expect(editor.action(getMarkdown())).not.toContain('<span')
    editor.destroy()
  })

  it('纯文本代码块 → 转普通段落', async () => {
    const editor = await makeEditor('')
    pasteText(editor, '```\n数据需关联核心业务指标\n```')
    const { nodes } = collectTypes(docJSON(editor))
    expect(nodes.has('code_block')).toBe(false)
    expect(nodes.has('paragraph')).toBe(true)
    editor.destroy()
  })

  it('rich html：保留 strong/链接，剥 style/class 与代码', async () => {
    const editor = await makeEditor('')
    pasteHTML(editor, '<p><strong style="color:red">重要</strong> <code>代码</code> <a href="https://x.com" style="color:green">链接</a></p>')
    const { nodes, marks } = collectTypes(docJSON(editor))
    expect(marks.has('strong')).toBe(true)
    expect(marks.has('link')).toBe(true)
    expect(marks.has('code')).toBe(false)
    expect(marks.has('textColor')).toBe(false)
    editor.destroy()
  })

  it('内部粘贴(data-pm-slice)保留颜色与代码', async () => {
    const src = await makeEditor('带 `代码` 和 <span style="color:#d97757">彩色</span> 的内容')
    const internalHTML = src.action(ctx => {
      const view = ctx.get(editorViewCtx)
      view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)))
      const { dom } = view.serializeForClipboard(view.state.selection.content())
      return dom.outerHTML
    })
    src.destroy()
    expect(internalHTML).toContain('data-pm-slice')

    const target = await makeEditor('')
    pasteHTML(target, internalHTML)
    const { marks } = collectTypes(docJSON(target))
    expect(marks.has('textColor')).toBe(true)
    expect(marks.has('code')).toBe(true)
    target.destroy()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/writing-clipboard.test.ts`
Expected: FAIL — 插件未实现（paste 走默认行为，`**` 与 `\`\`` 原样进文档）

- [ ] **Step 3: 实现插件**（追加到 `src/lib/milkdown-clipboard.ts`）

```ts
import { $prose } from '@milkdown/utils'
import { parserCtx, schemaCtx, serializerCtx } from '@milkdown/core'
import { DOMParser, Slice } from '@milkdown/prose/model'
import { isTextOnlySlice } from '@milkdown/prose'
import { Plugin, PluginKey } from '@milkdown/prose/state'
import { sanitizeExternalHTML } from './milkdown-paste-plain'
import type { MilkdownPlugin, Ctx } from '@milkdown/ctx'
import type { EditorView } from '@milkdown/prose/view'

/** 判断 html 是否含「真实格式」标签;否则按纯文本 markdown 解析 */
const RICH_HTML_RE = /<(?:strong|b|em|i|a|ul|ol|table|blockquote|h[1-6]|img|pre)[\s>]/i

function isPureText(content: any): boolean {
  if (!content) return false
  if (Array.isArray(content)) {
    if (content.length > 1) return false
    return isPureText(content[0])
  }
  const child = content.content
  if (child) return isPureText(child)
  return content.type === 'text'
}

function dispatchPasteSlice(view: EditorView, slice: Slice): boolean {
  const node = isTextOnlySlice(slice)
  if (node) {
    view.dispatch(view.state.tr.replaceSelectionWith(node, true))
    return true
  }
  try {
    view.dispatch(view.state.tr.replaceSelection(slice))
    return true
  } catch {
    return false
  }
}

export const milkdownClipboardPlugins: MilkdownPlugin[] = [
  $prose((ctx: Ctx) => {
    const schema = ctx.get(schemaCtx)
    return new Plugin({
      key: new PluginKey('STUDY_PARLOR_CLIPBOARD'),
      props: {
        // 复制方向:编辑器内复制产出 markdown(与 Milkdown clipboard 一致)
        clipboardTextSerializer: (slice: any) => {
          const serializer = ctx.get(serializerCtx)
          if (isPureText(slice.content.toJSON())) return slice.content.textBetween(0, slice.content.size, '\n\n')
          const doc = schema.topNodeType.createAndFill(undefined, slice.content)
          if (!doc) return ''
          return serializer(doc)
        },
        handlePaste: (view: EditorView, event: any, _preProcessedSlice: any) => {
          const parser = ctx.get(parserCtx)
          const editable = view.props.editable?.(view.state) ?? true
          const clipboardData = event.clipboardData
          if (!editable || !clipboardData) return false
          if (view.state.selection.$from.node().type.spec.code) return false
          const text = clipboardData.getData('text/plain')
          const html = clipboardData.getData('text/html')
          // 内部复制(ProseMirror 标记)交还默认,完整保留颜色/代码/标题
          if (html.includes('data-pm-slice')) return false
          if (html.length === 0 && text.length === 0) return false
          let slice: Slice
          if (html.length > 0 && RICH_HTML_RE.test(html)) {
            const sanitized = sanitizeExternalHTML(html)
            const template = document.createElement('template')
            template.innerHTML = sanitized
            slice = DOMParser.fromSchema(schema).parseSlice(template.content as any)
          } else {
            const parsed = parser(text)
            if (!parsed || typeof parsed === 'string') return false
            slice = parsed as Slice
          }
          slice = cleanPastedSlice(slice, schema)
          return dispatchPasteSlice(view, slice)
        },
      },
    })
  }),
]
```

- [ ] **Step 4: 接入 WritingEditor.tsx**：删 `import { clipboard } from '@milkdown/plugin-clipboard'`，加 `import { milkdownClipboardPlugins } from '@/lib/milkdown-clipboard'`，`.use(clipboard)` → `.use(milkdownClipboardPlugins)`。

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run tests/writing-clipboard.test.ts tests/writing-paste-clean.test.ts`
Expected: 全部 PASS

- [ ] **Step 6: 提交**

```bash
git add src/lib/milkdown-clipboard.ts src/components/writing/WritingEditor.tsx tests/writing-clipboard.test.ts
git commit -m "feat(writing): 自定义 handlePaste 接管外部粘贴(去代码去颜色)"
```

---

### Task 3: 智能 Enter（段中回车 = 单行硬换行）

**Files:**
- Create: `src/lib/milkdown-smart-enter.ts`
- Modify: `src/components/writing/WritingEditor.tsx`（追加 `.use(smartEnterPlugins)`）
- Test: `tests/writing-smart-enter.test.ts`

**Interfaces:**
- Produces: `export const smartEnterPlugins: MilkdownPlugin[]`
- 行为（spec §F）：仅普通段落（`paragraph`）且光标前后都有非空白文字 → 插入 `hardbreak`；否则 `return false` 交还默认（段尾/段首/空段=新段落，列表=新条目，代码块/标题/表格不变）。

- [ ] **Step 1: 写失败测试** `tests/writing-smart-enter.test.ts`

```ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { TextSelection } from 'prosemirror-state'
import { smartEnterPlugins } from '@/lib/milkdown-smart-enter'

type TestEditor = Awaited<ReturnType<typeof makeEditor>>

async function makeEditor(initial = '') {
  const root = document.createElement('div')
  document.body.appendChild(root)
  return Editor.make()
    .use(commonmark).use(gfm)
    .use(smartEnterPlugins)
    .config(ctx => { ctx.set(rootCtx, root); ctx.set(defaultValueCtx, initial) })
    .create()
}

function placeCursor(editor: TestEditor, targetText: string, offset = 0) {
  editor.action(ctx => {
    const view = ctx.get(editorViewCtx)
    const doc = view.state.doc
    let pos = -1
    doc.descendants((node, p) => {
      if (node.isText && node.text?.includes(targetText)) pos = p + offset
      return true
    })
    if (pos < 0) throw new Error(`找不到文本: ${targetText}`)
    view.dispatch(view.state.tr.setSelection(TextSelection.create(doc, pos)))
  })
}

function pressEnter(editor: TestEditor) {
  return editor.action(ctx => {
    const view = ctx.get(editorViewCtx)
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    view.dom.dispatchEvent(event)
    return { defaultPrevented: event.defaultPrevented }
  })
}

function docJSON(editor: TestEditor): any {
  return editor.action(ctx => ctx.get(editorViewCtx).state.doc.toJSON())
}

function collectNodes(node: any, out = new Set<string>()) {
  if (node.type) out.add(node.type)
  for (const c of node.content ?? []) collectNodes(c, out)
  return out
}

describe('智能 Enter', () => {
  it('段中 AB|CD 按 Enter → 插入 hardbreak，仍是单个段落', async () => {
    const editor = await makeEditor('ABCD')
    placeCursor(editor, 'ABCD', 2)
    const { defaultPrevented } = pressEnter(editor)
    expect(defaultPrevented).toBe(true)
    const nodes = collectNodes(docJSON(editor))
    expect(nodes.has('hardbreak')).toBe(true)
    const paras = docJSON(editor).content.filter((c: any) => c.type === 'paragraph')
    expect(paras.length).toBe(1) // 未拆成两段 → 无空行间距
    editor.destroy()
  })

  it('段尾按 Enter → 交还默认，拆成两个段落', async () => {
    const editor = await makeEditor('ABCD')
    placeCursor(editor, 'ABCD', 4)
    const { defaultPrevented } = pressEnter(editor)
    expect(defaultPrevented).toBe(false)
    const paras = docJSON(editor).content.filter((c: any) => c.type === 'paragraph')
    expect(paras.length).toBe(2)
    editor.destroy()
  })

  it('列表项内 Enter → 交还默认，新增列表项', async () => {
    const editor = await makeEditor('- 一\n- 二\n')
    placeCursor(editor, '二', 1)
    const { defaultPrevented } = pressEnter(editor)
    expect(defaultPrevented).toBe(false)
    const items = docJSON(editor).content[0].content.filter((c: any) => c.type === 'list_item')
    expect(items.length).toBe(3)
    editor.destroy()
  })

  it('空段落 Enter → 交还默认', async () => {
    const editor = await makeEditor('')
    const { defaultPrevented } = pressEnter(editor)
    expect(defaultPrevented).toBe(false)
    editor.destroy()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/writing-smart-enter.test.ts`
Expected: FAIL — 段中用例失败（默认 splitBlock 拆成两段，无 hardbreak）

- [ ] **Step 3: 实现 keymap** `src/lib/milkdown-smart-enter.ts`

```ts
// 注意:本文件被渲染进程使用,禁止引入 node 内置模块(ipc-state §5)。
// 段中 Enter = 硬换行(单行),段尾/段首/空段/列表/代码块交还默认(设计:2026-08-11-... §F)。
import { $prose } from '@milkdown/utils'
import { keymap } from '@milkdown/prose/keymap'
import type { MilkdownPlugin } from '@milkdown/ctx'

export const smartEnterPlugins: MilkdownPlugin[] = [
  $prose(() =>
    keymap({
      Enter: (state, dispatch) => {
        if (!dispatch || !state.selection.empty) return false
        const { $from } = state.selection
        const parent = $from.parent
        if (parent.type.name !== 'paragraph') return false
        if (parent.textContent.length === 0) return false
        const before = parent.textBetween(0, $from.parentOffset)
        const after = parent.textBetween($from.parentOffset, parent.nodeSize - 2)
        if (before.trim().length === 0 || after.trim().length === 0) return false
        const tr = state.tr.replaceSelectionWith(state.schema.nodes.hardbreak.create())
        dispatch(tr.scrollIntoView())
        return true
      },
    }),
  ),
]
```

- [ ] **Step 4: 接入 WritingEditor.tsx**：加 `import { smartEnterPlugins } from '@/lib/milkdown-smart-enter'`，在 `.use(gutterInsertPlugins)` 之后 `.use(smartEnterPlugins)`。

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run tests/writing-smart-enter.test.ts`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add src/lib/milkdown-smart-enter.ts src/components/writing/WritingEditor.tsx tests/writing-smart-enter.test.ts
git commit -m "feat(writing): 段中 Enter 单行硬换行(智能 Enter)"
```

---

### Task 4: 色板 6 色

**Files:**
- Modify: `src/lib/milkdown-text-color.ts`（`TEXT_COLOR_PALETTE`）
- Test: `tests/text-color-mark.test.ts`（确认无 palette 值断言，仅跑一次防回归）

**Interfaces:**
- Produces: `TEXT_COLOR_PALETTE` = `[默认(null), 红 #e5533b, 蓝 #5b8cff, 黄 #e8c84a, 绿 #4caf7d, 橙 #d97757]`（Task 5 悬浮栏、Task 6 后的 UI 读取它）

- [ ] **Step 1: 改色板** `src/lib/milkdown-text-color.ts`

```ts
export const TEXT_COLOR_PALETTE = [
  { label: '默认', value: null },
  { label: '红', value: '#e5533b' },
  { label: '蓝', value: '#5b8cff' },
  { label: '黄', value: '#e8c84a' },
  { label: '绿', value: '#4caf7d' },
  { label: '橙', value: '#d97757' },
] as const satisfies readonly { label: string; value: string | null }[]
```

- [ ] **Step 2: 跑既有 color 测试防回归**

Run: `npx vitest run tests/text-color-mark.test.ts tests/writing-paste-clean.test.ts tests/writing-clipboard.test.ts`
Expected: PASS（旧测试断言的是 transform/序列化，不含 palette 值）

- [ ] **Step 3: 提交**

```bash
git add src/lib/milkdown-text-color.ts
git commit -m "feat(writing): 色板改为默认+红蓝黄绿橙六色"
```

---

### Task 5: 悬浮格式栏插件

**Files:**
- Create: `src/lib/milkdown-selection-bubble.ts`
- Modify: `src/components/writing/WritingEditor.tsx`（追加 `.use(selectionBubblePlugins)`）
- Test: `tests/writing-selection-bubble.test.ts`

**Interfaces:**
- Produces: `export function shouldShowBubble(selection: any, editable: boolean): boolean`；`export const selectionBubblePlugins: MilkdownPlugin[]`
- 容器 `data-testid="writing-format-bubble"`；按钮 `writing-bubble-bold / -italic / -strikethrough`；颜色按钮 `writing-bubble-color` + 色块 `writing-bubble-color-option[data-color=...]`。
- 行为（spec §B）：非空选区浮现；**点击按钮后不隐藏**（可连续改色+加粗）；外点/Esc/选区消失/失焦隐藏；`mousedown.preventDefault()` 保住选区。

- [ ] **Step 1: 写失败测试** `tests/writing-selection-bubble.test.ts`

```ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { shouldShowBubble } from '@/lib/milkdown-selection-bubble'

// shouldShowBubble 是纯决策函数;视图层行为(定位/点击保持/隐藏)由 Task 8 E2E 覆盖。
describe('shouldShowBubble', () => {
  it('空选区 → false', () => {
    expect(shouldShowBubble({ empty: true }, true)).toBe(false)
  })
  it('非空选区 + 可编辑 → true', () => {
    const sel = { empty: false, $from: { depth: 1, node: (d: number) => ({ type: { name: d === 1 ? 'doc' : 'paragraph' } }) } }
    expect(shouldShowBubble(sel, true)).toBe(true)
  })
  it('不可编辑 → false', () => {
    expect(shouldShowBubble({ empty: false, $from: { depth: 1, node: () => ({ type: { name: 'paragraph' } }) } }, false)).toBe(false)
  })
  it('代码块内 → false', () => {
    const sel = { empty: false, $from: { depth: 2, node: (d: number) => ({ type: { name: d === 2 ? 'code_block' : 'doc' } }) } }
    expect(shouldShowBubble(sel, true)).toBe(false)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/writing-selection-bubble.test.ts`
Expected: FAIL — `Cannot find module '@/lib/milkdown-selection-bubble'`

- [ ] **Step 3: 实现插件** `src/lib/milkdown-selection-bubble.ts`

```ts
// 注意:本文件被渲染进程使用,禁止引入 node 内置模块(ipc-state §5)。
// 选中文字悬浮格式栏(设计:2026-08-11-... §B)。复用 milkdown-table-handles 的
// DOM 挂载/定位/滚动跟随模式;点击按钮不隐藏(可连续改色+加粗),外点/Esc/失焦隐藏。
import { $prose, callCommand } from '@milkdown/utils'
import { Plugin, PluginKey } from '@milkdown/prose/state'
import { toggleStrongCommand, toggleEmphasisCommand } from '@milkdown/preset-commonmark'
import { toggleStrikethroughCommand } from '@milkdown/preset-gfm'
import { textColorCommand, TEXT_COLOR_PALETTE } from './milkdown-text-color'
import type { MilkdownPlugin, Ctx } from '@milkdown/ctx'
import type { EditorView } from '@milkdown/prose/view'

export function shouldShowBubble(selection: any, editable: boolean): boolean {
  if (!editable || selection.empty) return false
  const { $from } = selection
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === 'code_block') return false
  }
  return true
}

class SelectionBubbleView {
  private container: HTMLDivElement
  private swatches: HTMLDivElement
  private relayout = () => this.layout()
  private onDocClick = () => this.hide()
  private onKeydown = (e: KeyboardEvent) => { if (e.key === 'Escape') this.hide() }

  constructor(private view: EditorView, private ctx: Ctx, private root: HTMLElement) {
    this.container = document.createElement('div')
    this.container.dataset.testid = 'writing-format-bubble'
    this.container.className = 'writing-format-bubble'
    this.container.style.display = 'none'
    this.container.addEventListener('mousedown', e => e.preventDefault())
    this.container.addEventListener('click', e => e.stopPropagation())
    root.appendChild(this.container)

    this.mkBtn('writing-bubble-bold', 'B', () => this.call(toggleStrongCommand.key), { fontWeight: '700' })
    this.mkBtn('writing-bubble-italic', 'I', () => this.call(toggleEmphasisCommand.key), { fontStyle: 'italic' })
    this.mkBtn('writing-bubble-strikethrough', 'S', () => this.call(toggleStrikethroughCommand.key), { textDecoration: 'line-through' })

    const colorBtn = this.mkBtn('writing-bubble-color', 'A▾', () => this.toggleSwatches(), {})
    colorBtn.style.color = '#d97757'

    this.swatches = document.createElement('div')
    this.swatches.dataset.testid = 'writing-bubble-swatches'
    this.swatches.className = 'writing-bubble-swatches'
    this.swatches.style.display = 'none'
    for (const c of TEXT_COLOR_PALETTE) {
      const s = document.createElement('button')
      s.dataset.testid = 'writing-bubble-color-option'
      s.dataset.color = c.value ?? ''
      s.title = c.label
      s.className = 'writing-bubble-swatch'
      s.style.background = c.value ?? 'transparent'
      s.addEventListener('mousedown', e => e.preventDefault())
      s.addEventListener('click', e => {
        e.stopPropagation()
        this.call(textColorCommand.key, { color: c.value })
        this.swatches.style.display = 'none' // 选色后收起色板,悬浮栏本体保持
      })
      this.swatches.appendChild(s)
    }
    this.container.appendChild(this.swatches)

    document.addEventListener('scroll', this.relayout, true)
    window.addEventListener('resize', this.relayout)
    document.addEventListener('click', this.onDocClick)
    document.addEventListener('keydown', this.onKeydown)
  }

  private call(cmd: any, payload?: any) { callCommand(cmd, payload)(this.ctx) }

  private mkBtn(testid: string, text: string, onClick: () => void, style: Record<string, string>): HTMLButtonElement {
    const b = document.createElement('button')
    b.dataset.testid = testid
    b.textContent = text
    Object.assign(b.style, style)
    b.addEventListener('mousedown', e => e.preventDefault()) // 保住编辑器选区
    b.addEventListener('click', e => { e.stopPropagation(); onClick() }) // 点击后悬浮栏保持
    this.container.appendChild(b)
    return b
  }

  private toggleSwatches() {
    this.swatches.style.display = this.swatches.style.display === 'none' ? 'block' : 'none'
  }

  private hide() {
    this.container.style.display = 'none'
    this.swatches.style.display = 'none'
  }

  private layout() {
    const view = this.view
    const { selection } = view.state
    const editable = view.props.editable?.(view.state) ?? true
    if (!shouldShowBubble(selection, editable)) return this.hide()
    const domSel = window.getSelection()
    const range = domSel && domSel.rangeCount > 0 ? domSel.getRangeAt(0) : null
    const rect = range ? range.getBoundingClientRect() : null
    if (!rect || rect.width === 0 || rect.height === 0) return this.hide()
    const rootRect = this.root.getBoundingClientRect()
    this.container.style.display = 'block'
    const bw = this.container.offsetWidth
    const left = Math.max(8, Math.min(rect.left - rootRect.left + rect.width / 2 - bw / 2, rootRect.width - bw - 8))
    const topAbove = rect.top - rootRect.top - this.container.offsetHeight - 8
    const top = topAbove >= 0 ? topAbove : rect.bottom - rootRect.top + 8
    this.container.style.left = `${Math.round(left)}px`
    this.container.style.top = `${Math.round(top)}px`
  }

  update(view: EditorView) { this.view = view; this.layout() }

  destroy() {
    document.removeEventListener('scroll', this.relayout, true)
    window.removeEventListener('resize', this.relayout)
    document.removeEventListener('click', this.onDocClick)
    document.removeEventListener('keydown', this.onKeydown)
    this.container.remove()
  }
}

export const selectionBubblePlugins: MilkdownPlugin[] = [
  $prose((ctx: Ctx) =>
    new Plugin({
      key: new PluginKey('STUDY_PARLOR_SELECTION_BUBBLE'),
      view: (view: EditorView) => {
        const root = view.dom.closest('.writing-editor-root') as HTMLElement | null
        if (!root) return { update: () => {}, destroy: () => {} }
        return new SelectionBubbleView(view, ctx, root)
      },
    }),
  ),
]
```

- [ ] **Step 4: 接入 WritingEditor.tsx**：加 `import { selectionBubblePlugins } from '@/lib/milkdown-selection-bubble'`，末尾 `.use(selectionBubblePlugins)`。

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run tests/writing-selection-bubble.test.ts`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add src/lib/milkdown-selection-bubble.ts src/components/writing/WritingEditor.tsx tests/writing-selection-bubble.test.ts
git commit -m "feat(writing): 选中文字悬浮格式栏(点击保持,六色板)"
```

---

### Task 6: 顶部工具栏重构 + 分隔线行为

**Files:**
- Modify: `src/components/writing/WritingToolbar.tsx`
- Create: `src/lib/writing-toolbar-icons.ts`（蜡烛/轨道 SVG 常量，避免组件文件导出非组件）

**Interfaces:**
- Consumes: `wrapInBlockquoteCommand.key`、`insertHrCommand.key`、`wrapInHeadingCommand.key`、`runCollapsedBlockCommand`（全部已存在）
- Produces: `src/lib/writing-toolbar-icons.ts` 导出 `QuoteIcon` / `HrIcon`（React 组件）；`WritingToolbar` 移除 B/I/S/颜色按钮。
- 分隔线行为：点击分割线 → 插入后**光标落到下一行**（helper `insertHrBelow(ctx)`，供 `exec` 使用）。

- [ ] **Step 1: 建 SVG 图标常量** `src/lib/writing-toolbar-icons.ts`

```tsx
// 注意:本文件被渲染进程使用,禁止引入 node 内置模块(ipc-state §5)。
// 工具栏 SVG 图标(蜡烛=引用、轨道=分割线),文案来自设计 visual 对齐稿。
export function QuoteIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 2.5c1.15 1.9 2.05 3.4 2.05 4.9a2.05 2.05 0 1 1-4.1 0c0-1.5.9-3 2.05-4.9z" fill="#d97757" />
      <rect x="9.6" y="9.5" width="4.8" height="11" rx="1.2" fill="currentColor" opacity="0.75" />
    </svg>
  )
}

export function HrIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M2.5 12h19" stroke="currentColor" strokeWidth="1.2" opacity="0.7" strokeLinecap="round" />
      <ellipse cx="12" cy="12" rx="7" ry="2.3" stroke="currentColor" strokeWidth="1" opacity="0.4" />
      <circle cx="12" cy="12" r="2.1" fill="#d97757" />
      <circle cx="19" cy="10.4" r="0.9" fill="currentColor" opacity="0.6" />
    </svg>
  )
}
```

- [ ] **Step 2: 重构 WritingToolbar.tsx**
  - 删除 import：`toggleStrongCommand`、`toggleEmphasisCommand`、`toggleStrikethroughCommand`、`textColorCommand`、`TEXT_COLOR_PALETTE`。
  - 删除加粗/斜体/删除线按钮与颜色下拉（含 `colorMenuOpen` state、`data-testid="writing-toolbar-bold/italic/strikethrough/color"`）。
  - 引用按钮内容 → `<QuoteIcon />`；分割线按钮内容 → `<HrIcon />`；两者 testid 与 `exec` 不变。
  - 保留：引用（`wrapInBlockquoteCommand`，block 折叠）、分割线、标题 H▾、`hint`。

- [ ] **Step 3: 分隔线「插入后光标落下一行」**
  - 在 `WritingToolbar.tsx` 内加模块私有 helper（不导出，满足 ui-styling §10），内部复用 `runCollapsedBlockCommand` 防非空选区被铲平：

```ts
// 分割线插入后光标落到下一行(设计 spec §E)。
// 复用 runCollapsedBlockCommand:先折叠非空选区到 head,再执行 insertHrCommand;
// 成功后若 hr 下方已有内容则光标放其行首,否则补一个空段落并放光标。
function insertHrBelow(ctx: any): boolean {
  const ok = runCollapsedBlockCommand(insertHrCommand.key)(ctx)
  if (ok === false) return false
  const view = ctx.get(editorViewCtx)
  const doc = view.state.doc
  let hrPos = -1
  doc.descendants((node: any, pos: number) => {
    if (node.type.name === 'hr') hrPos = pos
    return true
  })
  if (hrPos < 0) return true
  const after = hrPos + 1 // hr nodeSize === 1 → after = hr 之后的位置
  const next = doc.nodeAt(after) // hr 下方原本的节点
  let tr = view.state.tr
  let targetPos: number
  if (next) {
    targetPos = after + 1 // 下一块内容行首
  } else {
    tr = tr.replaceWith(after, after, view.state.schema.nodes.paragraph.create())
    targetPos = after + 1
  }
  try {
    tr.setSelection(TextSelection.create(tr.doc, targetPos))
  } catch {
    tr.setSelection(Selection.near(tr.doc.resolve(targetPos)))
  }
  view.dispatch(tr.scrollIntoView())
  return true
}
```
  - 工具栏分割线按钮 onClick 直接走 `act`（exec 只接受命令 key，此处传入的是函数）：

```ts
onClick={() => act((ctx: any) => { const ok = insertHrBelow(ctx); if (ok === false) showHint('当前位置不支持该操作') })}
```
  - import：`editorViewCtx` from `@milkdown/core`，`Selection, TextSelection` from `@milkdown/prose/state`。

- [ ] **Step 4: 验证可删除**：在 dev 里手动确认「光标在分隔线下方行首按 Backspace」能删除分隔线（ProseMirror 基础 keymap 对叶子块通常可行）。**若删不掉**：在 `WritingEditor.tsx` 注册 `keymap({ Backspace: joinBackward })`（`prosemirror-commands`），并在 `tests/writing-editor.test.tsx` 补一条「hr 后行首 Backspace 删除 hr」用例。本步验收 = build 通过 + 既有 writing 单元测试通过。

- [ ] **Step 5: 构建 + 既有单元测试**

Run: `npx electron-vite build && npx vitest run tests/writing-editor.test.tsx tests/writing-toolbar.test.tsx 2>/dev/null || true`
Expected: build 成功；writing 相关单元测试通过

- [ ] **Step 6: 提交**

```bash
git add src/components/writing/WritingToolbar.tsx src/lib/writing-toolbar-icons.ts
git commit -m "feat(writing): 顶部栏移除四格式按钮,引用/分割线换 SVG,分割线插入后光标落下一行"
```

---

### Task 7: 编辑器渲染格调（writing-editor.css + 轨道分隔线 node view）

**Files:**
- Modify: `src/components/writing/writing-editor.css`
- Create: `src/lib/milkdown-orbit-hr.ts`（hr node view，轨道 + 卫星公转动画）

**Interfaces:**
- Consumes: `window.matchMedia('(prefers-reduced-motion: reduce)')`
- Produces: `export const orbitHrPlugins: MilkdownPlugin[]`，接入 `WritingEditor.tsx`。

- [ ] **Step 1: 建轨道分隔线 node view** `src/lib/milkdown-orbit-hr.ts`

```ts
// 注意:本文件被渲染进程使用,禁止引入 node 内置模块(ipc-state §5)。
// 分隔线 = 行星轨道(设计 spec §D):固定椭圆+中心行星(ember)+卫星(currentColor)沿椭圆公转。
// reduced-motion 下不渲染 animateMotion,卫星静止在起点。
import { $prose } from '@milkdown/utils'
import { Plugin, PluginKey } from '@milkdown/prose/state'
import type { MilkdownPlugin } from '@milkdown/ctx'

const SAT_PATH = 'M160 20 A 60 12 0 1 1 40 20 A 60 12 0 1 1 160 20'

export const orbitHrPlugins: MilkdownPlugin[] = [
  $prose(() =>
    new Plugin({
      key: new PluginKey('STUDY_PARLOR_ORBIT_HR'),
      props: {
        nodeViews: {
          hr: () => ({
            dom: (() => {
              const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
              const wrap = document.createElement('div')
              wrap.className = 'writing-orbit-hr'
              wrap.innerHTML = `<svg viewBox="0 0 200 40" xmlns="http://www.w3.org/2000/svg">
                <line x1="0" y1="20" x2="200" y2="20" stroke="currentColor" stroke-width="1" opacity="0.4"/>
                <ellipse cx="100" cy="20" rx="60" ry="12" stroke="currentColor" stroke-width="1" opacity="0.5" fill="none"/>
                <circle cx="100" cy="20" r="6" fill="#d97757"/>
                <circle r="3.5" fill="currentColor" opacity="0.75">
                  ${reduced ? '' : `<animateMotion dur="14s" repeatCount="indefinite" path="${SAT_PATH}"/>`}
                </circle>
              </svg>`
              return wrap
            })(),
          }),
        },
      },
    }),
  ),
]
```

- [ ] **Step 2: 写 CSS**（追加到 `src/components/writing/writing-editor.css`，替换现有 blockquote/ul/ol/hr 段）

```css
/* ── 格调化渲染(设计 2026-08-11 §D):墨/烛身色走 currentColor,点缀用固定 ember #d97757 ── */
.writing-editor-root .ProseMirror blockquote {
  position: relative;
  border: none;
  padding-left: 34px;
  margin: 0.5em 0;
  font-style: italic;
  opacity: 0.92;
}
/* 竖直蜡烛:烛身/融蜡/烛台随文字色,烛焰固定 ember */
.writing-editor-root .ProseMirror blockquote::before {
  content: '';
  position: absolute;
  left: 0; top: -3px; bottom: -3px;
  width: 26px;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 26 120' preserveAspectRatio='none'%3E%3Cpath d='M13 3c1.5 2.5 2.6 4.4 2.6 6.3a2.6 2.6 0 1 1-5.2 0C10.4 7.4 11.5 5.5 13 3z' fill='%23d97757'/%3E%3Crect x='9.5' y='15' width='7' height='97' rx='2.2' fill='currentColor' opacity='0.88'/%3E%3Cpath d='M9.5 26c-2 0-3 2.2-2 4.4 1.1 2.6-1.2 4.2-.6 6.4' fill='none' stroke='currentColor' stroke-width='1.6' opacity='0.7' stroke-linecap='round'/%3E%3Crect x='8' y='110' width='10' height='4.5' rx='1.2' fill='currentColor' opacity='0.55'/%3E%3C/svg%3E") no-repeat left top / auto 100%;
}

/* 分隔线:node view 渲染轨道,这里只定尺寸 */
.writing-editor-root .ProseMirror hr,
.writing-editor-root .writing-orbit-hr {
  height: 40px;
  margin: 24px 0;
  border: none;
}
.writing-editor-root .writing-orbit-hr svg { width: 100%; height: 100%; display: block; }

/* 无序列表:烛光点 */
.writing-editor-root .ProseMirror ul { list-style: none; padding-left: 1.5em; }
.writing-editor-root .ProseMirror ul li { position: relative; }
.writing-editor-root .ProseMirror ul li::before {
  content: '';
  position: absolute;
  left: -1.15em; top: 0.55em;
  width: 0.5em; height: 0.5em;
  border-radius: 50%;
  background: #d97757;
  box-shadow: 0 0 0.4em rgba(217, 119, 87, 0.55);
}
.writing-editor-root .ProseMirror ul ul li::before { background: rgba(217, 119, 87, 0.55); box-shadow: none; }

/* 有序列表:暖橙序号 */
.writing-editor-root .ProseMirror ol { list-style: none; counter-reset: writing-ol; padding-left: 1.6em; }
.writing-editor-root .ProseMirror ol li { counter-increment: writing-ol; position: relative; }
.writing-editor-root .ProseMirror ol li::before {
  content: counter(writing-ol) '.';
  position: absolute;
  left: -1.5em;
  color: #d97757;
  font-weight: 600;
}

/* 标题:烛首装饰(随字号缩放,ember 烛焰) */
.writing-editor-root .ProseMirror h1::before,
.writing-editor-root .ProseMirror h2::before,
.writing-editor-root .ProseMirror h3::before {
  content: '';
  display: inline-block;
  width: 0.55em; height: 0.85em;
  margin-right: 0.3em;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 14'%3E%3Cpath d='M6 .5c.7 1.1 1.2 2 1.2 2.9a1.2 1.2 0 1 1-2.4 0C4.8 2.5 5.3 1.6 6 .5z' fill='%23d97757'/%3E%3C/svg%3E") no-repeat center / contain;
  vertical-align: 0.08em;
}
```

- [ ] **Step 3: 接入 node view 插件**：`WritingEditor.tsx` 加 `import { orbitHrPlugins } from '@/lib/milkdown-orbit-hr'`，`.use(orbitHrPlugins)`。

- [ ] **Step 4: 手动验证**：`npx electron-vite build` 通过；`npm run dev` 打开一篇文章，插入引用/分隔线/列表/标题，肉眼核对蜡烛、轨道动画、烛光点、暖橙序号、烛首。报纸主题切换后蜡烛烛身/轨道线跟随文字色（`currentColor`）。

- [ ] **Step 5: 提交**

```bash
git add src/components/writing/writing-editor.css src/lib/milkdown-orbit-hr.ts src/components/writing/WritingEditor.tsx
git commit -m "feat(writing): 编辑器格调化渲染(蜡烛引用/轨道分隔线/烛光列表/烛首标题)"
```

---

### Task 8: E2E 迁移 + 新增用例

**Files:**
- Modify: `e2e/helpers/selectors.ts`（删旧四按钮、加悬浮栏选择器）
- Modify: `e2e/specs/writing-editor.spec.ts`（迁移旧用例）
- Create: `e2e/specs/writing-paste-format.spec.ts`（新用例）
- Modify: `e2e/source-map.json`（若新 spec 名未被 `writing-*.spec.ts` glob 覆盖则补登记）

**Interfaces:**
- Consumes: 全部 Task 1-7 产物；`WritingPage` page object 已存在。
- Produces: 通过 E2E 验证的真实效果（spec §测试计划 + feature-development §12 出口断言）。

- [ ] **Step 1: 更新 selectors.ts**——删 `toolbarBold/Italic/Strikethrough/Color`、`colorOption`；加：

```ts
formatBubble: '[data-testid="writing-format-bubble"]',
bubbleBold: '[data-testid="writing-bubble-bold"]',
bubbleItalic: '[data-testid="writing-bubble-italic"]',
bubbleStrikethrough: '[data-testid="writing-bubble-strikethrough"]',
bubbleColor: '[data-testid="writing-bubble-color"]',
bubbleColorOption: '[data-testid="writing-bubble-color-option"]',
```

- [ ] **Step 2: 迁移 writing-editor.spec.ts**
  - 「加粗/斜体按钮真实生效」→ 改为悬浮栏路径：`typeInEditor` → 选中全文 → `formatBubble` 可见 → 点 `bubbleBold` → `strong` 可见 **且 bubble 仍可见** → 点 `bubbleColor` + `bubbleColorOption[data-color="#d97757"]` → `span[style*="color"]` 可见（验证「点击后保持、连续操作」）。
  - 「选中文字着色 → reload 保留」→ 悬浮栏取色，其余不变。
  - 删 4 个「工具栏 B/I/S 按钮可见」用例；保留引用/分割线/标题可见用例。
  - 「工具栏全部按钮可见」→ 只列 `toolbarBlockquote/toolbarHr/toolbarHeading`；加一条 `expect(toolbarBold).toHaveCount(0)`（顶部不再有）。
  - 粘贴断言（markdown 源带 `**`/表格/反引号/span 颜色 → 加粗生效、无代码无颜色；Ctrl+S → reload → 无多余 `**`）与内部复制粘贴保留颜色/代码，放入新 spec。

- [ ] **Step 3: 写新 spec** `e2e/specs/writing-paste-format.spec.ts`，覆盖：
  1. 外部粘贴 markdown 源（`**加粗**` + 表格 + `` `代码` `` + `<span style="color:#d97757">`）→ `strong` 可见、`code`/`span[style*="color"]` 不存在；Ctrl+S → reload → `getEditorContent()` 不含 `**` 与 `<span`
  2. 内部复制粘贴颜色/代码保留：编辑器内着色+加粗 → Ctrl+C → 新文章 → Ctrl+V → `span[style*="color"]`/`strong` 均保留
  3. 悬浮栏生命周期：选中 → 出现；点加粗 → 保持可见；点空白 → 消失
  4. 智能 Enter：`typeInEditor('ABCD')` → 光标移到 BC 之间（`keyboard.press('ArrowLeft'/'ArrowRight')`）→ `Enter` → `getEditorContent()` 为 `AB\nCD`（无空行）；段尾 `Enter` → 两个段落
  5. 分隔线：点 `toolbarHr` → 光标在下一行（继续输入 `X` → 出现在分隔线下方）；光标移到分隔线后行首 → `Backspace` → 分隔线删除
  6. 渲染格调：插入引用/列表/标题 → `.ProseMirror blockquote::before`（蜡烛）有内容、`.writing-orbit-hr svg` 存在、`ol li::before`/`h1::before` 生效；切报纸主题 → `.writing-orbit-hr svg` 仍在且 `--writing-tone-color` 为 `#1a1a1a`
  - 粘贴用 `page.evaluate(() => navigator.clipboard.writeText(md))` + 编辑器聚焦 + `keyboard.press('Control+v')`；若 clipboard 权限问题，先 `page.context().grantPermissions(['clipboard-read','clipboard-write'])`。
  - 每个断言用稳定 testid，不使用展示文案。

- [ ] **Step 4: source-map**：`writing` group specs 已是 `writing-*.spec.ts`，新 spec 名自动被覆盖；跑 `node scripts/e2e-changed.js` 确认无孤儿 WARNING。

- [ ] **Step 5: 跑定向 E2E**

Run: `node scripts/e2e-changed.js --run --no-retries`
Expected: 受影响 writing spec 全绿

- [ ] **Step 6: 提交**

```bash
git add e2e/helpers/selectors.ts e2e/specs/writing-editor.spec.ts e2e/specs/writing-paste-format.spec.ts e2e/source-map.json
git commit -m "test(writing): 迁移旧工具栏用例 + 粘贴/悬浮栏/智能Enter/渲染 E2E"
```

---

### Task 9: 全量验证（合并前门禁）

**Files:** 无新文件

- [ ] **Step 1: 全量单元测试**

Run: `npx vitest run`
Expected: 全部 PASS（改动只涉及 writing 域，如有无关失败先排查是否环境问题）

- [ ] **Step 2: 全量 E2E**

Run: `npm run test:e2e`
Expected: 全部 PASS（含 startup-health）

- [ ] **Step 3: 打包冒烟**

Run: `npm run package` 并启动产物手动冒烟（写作页粘贴/悬浮栏/分隔线/智能 Enter）
Expected: 打包版与 dev 行为一致
