# 写作编辑器代码块功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 写作编辑器加入代码块功能:行首加号栏可插入、NodeView 外壳支持折叠(前 3 行 + 淡出条)/展开、refractor 语法高亮、学术/报纸双版式 UI。

**Architecture:** 方案 A(spec: `docs/superpowers/specs/2026-08-23-writing-codeblock-design.md`)。`codeBlockSchema.extendSchema` 加视图态 `collapsed` attr(不进 markdown);NodeView 照抄 `milkdown-orbit-hr.ts` 的 `$prose` + `props.nodeViews` 模式;高亮是独立 `$prose` decoration 插件;样式全走 `writing-editor.css` 的 `[data-theme]` 选择器。

**Tech Stack:** Milkdown v7(`$prose`/`extendSchema`/`createCodeBlockCommand`)、ProseMirror(NodeView/Decoration)、refractor v4(唯一新增依赖,纯 JS ESM)、Vitest(jsdom)、Playwright E2E(跑 `out/` 构建产物)。

## Global Constraints

- 新增依赖只允许 `refractor`;禁止 codemirror/highlight.js/prism 原包。
- 渲染进程 lib 文件禁止 import node 内置模块(文件头注释照抄现有惯例)。
- `collapsed` 不得出现在序列化后的 markdown 中;`language` 走 preset 既有 attr。
- 主题钩子 = `writing-editor-root` 上的 `data-theme="academic|newspaper"`;token 色板 ≤6 色,两主题共用 class 名只换色值。
- 既有行为不得回退:`milkdown-codeblock-enter.ts`(末行 Enter 退出)、Tab 缩进、gutter 在代码块内隐藏「+」、`pre { white-space: pre-wrap }`。
- 验证只跑受影响测试:单元测试按文件指定,不跑 `npx vitest run` 全量;E2E 用 `node scripts/e2e-changed.js --run --no-retries`(自动先构建)。
- 组件文件只导出组件;新 helper/常量放 `src/lib/`。
- 所有新 UI 元素带 `data-testid`。

## 关键已有代码事实(实现者无需再探索)

- gutter 菜单:`src/lib/milkdown-gutter-insert.ts` L18-25 `ITEMS` 数组;菜单项 testid `writing-gutter-item` + `data-type`;命令失败返回 false 自动走 hint。
- `createCodeBlockCommand` 存在于 `@milkdown/preset-commonmark`(已验证 node_modules L855),签名 `(ctx) => (language = "") => setBlockType(codeBlockSchema.type(ctx), { language })`。
- `extendSchema` 用法参考 `node_modules/@milkdown/preset-gfm/src/node/task-list-item.ts`:`listItemSchema.extendSchema(prev => ctx => ({ ...baseSchema, attrs: {...} }))`。扩展后的 schema 插件 `.use()` 顺序必须在 `commonmark` 之后(同名 slice 后者覆盖,同 gfm 覆盖 listItem)。
- NodeView 范例:`src/lib/milkdown-orbit-hr.ts` L60-98。
- 单元测试编辑器范例:`tests/writing-hr-caret.test.ts`(`makeEditor` + `typeText` 模拟输入规则)。
- E2E 写作页导航范例:`e2e/specs/writing-codeblock-wrap.spec.ts`(seed + CoverPage + writing.sourceButton + writing-tree-node)。
- `e2e/source-map.json` writing 分组已 glob `writing-*.spec.ts` 与 `src/lib/milkdown-*.ts`,**无需改 source-map**,但 Task 6 需验证无孤儿 WARNING。
- `WritingEditor` 被两处使用:`WritingBoard.tsx:98`、`CompanionBoard.tsx:83`——theme prop 两处都要接。
- `refractor` 当前未安装。
- 序列化取 markdown:单元测试用 `te.action(getMarkdown())`(`getMarkdown` from `@milkdown/utils`)。

---

### Task 1: collapsed attr schema 扩展 + refractor 依赖

**Files:**
- Create: `src/lib/milkdown-codeblock-schema.ts`
- Create: `tests/writing-codeblock-schema.test.ts`
- Modify: `package.json`(npm install 自动)

**Interfaces:**
- Produces: `codeblockSchemaPlugins: MilkdownPlugin[]`(from `src/lib/milkdown-codeblock-schema.ts`)——Task 2/3 的测试与本任务测试都要 `.use()` 它;code_block 节点此后带 `attrs.collapsed: boolean`(默认 false)。

- [ ] **Step 1: 安装 refractor**

```bash
npm install refractor
```

预期:package.json dependencies 出现 `refractor`(v4.x)。

- [ ] **Step 2: 写失败的单元测试**

`tests/writing-codeblock-schema.test.ts`:

```ts
// @vitest-environment jsdom
// code_block 节点 collapsed 视图态 attr(设计 2026-08-23 §4):默认 false、可 setNodeMarkup、
// 序列化回 markdown 时不得出现(纯视图态,不落盘)。
import { describe, it, expect } from 'vitest'
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { getMarkdown } from '@milkdown/utils'
import { codeblockSchemaPlugins } from '@/lib/milkdown-codeblock-schema'

async function makeEditor(initial: string) {
  const root = document.createElement('div')
  root.className = 'writing-editor-root'
  document.body.appendChild(root)
  return Editor.make()
    .use(commonmark).use(gfm)
    .use(codeblockSchemaPlugins)
    .config(ctx => { ctx.set(rootCtx, root); ctx.set(defaultValueCtx, initial) })
    .create()
}

describe('code_block collapsed attr', () => {
  it('默认 collapsed=false,markdown 序列化不含 collapsed', async () => {
    const te = await makeEditor('```js\nconst a = 1\n```')
    const view = te.ctx.get(editorViewCtx)
    let cb: any = null
    view.state.doc.descendants((n) => { if (n.type.name === 'code_block') cb = n })
    expect(cb).not.toBeNull()
    expect(cb.attrs.collapsed).toBe(false)
    expect(cb.attrs.language).toBe('js')

    const md = te.action(getMarkdown())
    expect(md).toContain('```js')
    expect(md).not.toContain('collapsed')
    te.destroy()
  })

  it('setNodeMarkup 可将 collapsed 置 true,序列化仍不含 collapsed', async () => {
    const te = await makeEditor('```\nlet b = 2\n```')
    const view = te.ctx.get(editorViewCtx)
    let pos = -1
    view.state.doc.descendants((n, p) => { if (n.type.name === 'code_block') pos = p })
    view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { language: '', collapsed: true }))
    const cb = view.state.doc.nodeAt(pos)!
    expect(cb.attrs.collapsed).toBe(true)
    const md = te.action(getMarkdown())
    expect(md).not.toContain('collapsed')
    te.destroy()
  })
})
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npx vitest run tests/writing-codeblock-schema.test.ts`
Expected: FAIL —— `@/lib/milkdown-codeblock-schema` 模块不存在。

- [ ] **Step 4: 实现 schema 扩展**

`src/lib/milkdown-codeblock-schema.ts`:

```ts
// 注意:本文件被渲染进程使用,禁止引入 node 内置模块(ipc-state §5)。
// code_block collapsed 视图态 attr(设计 2026-08-23 §4):
// extendSchema 加 collapsed(默认 false);preset 的 toMarkdown 只读 language,
// collapsed 天然不进序列化。注册顺序必须在 commonmark 之后(同名 slice 后者覆盖)。
import { codeBlockSchema } from '@milkdown/preset-commonmark'
import type { MilkdownPlugin } from '@milkdown/ctx'

const extendedCodeBlockSchema = codeBlockSchema.extendSchema((prev) => (ctx) => {
  const base = prev(ctx)
  return {
    ...base,
    attrs: {
      ...base.attrs,
      collapsed: { default: false, validate: 'boolean' },
    },
  }
})

export const codeblockSchemaPlugins: MilkdownPlugin[] = [extendedCodeBlockSchema]
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run tests/writing-codeblock-schema.test.ts`
Expected: PASS(2 tests)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/milkdown-codeblock-schema.ts tests/writing-codeblock-schema.test.ts
git commit -m "feat(writing): code_block 增加 collapsed 视图态 attr(extendSchema,不进 markdown)"
```

---

### Task 2: NodeView 外壳(头部箭头 + 语言标签 + 折叠 + 展开条)

**Files:**
- Create: `src/lib/milkdown-codeblock-view.ts`
- Create: `tests/writing-codeblock-view.test.ts`
- Modify: `src/components/writing/writing-editor.css`(结构性样式,主题色在 Task 5)

**Interfaces:**
- Consumes: `codeblockSchemaPlugins`(Task 1)——测试里 `.use()` 顺序 commonmark → codeblockSchemaPlugins → codeblockViewPlugins。
- Produces: `codeblockViewPlugins: MilkdownPlugin[]`(from `src/lib/milkdown-codeblock-view.ts`);DOM 契约:testid `writing-codeblock` / `writing-codeblock-toggle` / `writing-codeblock-lang` / `writing-codeblock-expand`;`dom.dataset.collapsed = 'true'|'false'`(Task 5 的 CSS 与 Task 6 的 E2E 依赖这些钩子)。

- [ ] **Step 1: 写失败的单元测试**

`tests/writing-codeblock-view.test.ts`:

```ts
// @vitest-environment jsdom
// 代码块 NodeView 外壳(设计 2026-08-23 §2):头部行(折叠箭头 + 语言只读标签)、
// contentDOM 可编辑、折叠箭头/展开条切换 collapsed attr;编辑事件不被外壳拦截。
import { describe, it, expect } from 'vitest'
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { TextSelection } from '@milkdown/prose/state'
import { codeblockSchemaPlugins } from '@/lib/milkdown-codeblock-schema'
import { codeblockViewPlugins } from '@/lib/milkdown-codeblock-view'

async function makeEditor(initial: string) {
  const root = document.createElement('div')
  root.className = 'writing-editor-root'
  document.body.appendChild(root)
  return Editor.make()
    .use(commonmark).use(gfm)
    .use(codeblockSchemaPlugins)
    .use(codeblockViewPlugins)
    .config(ctx => { ctx.set(rootCtx, root); ctx.set(defaultValueCtx, initial) })
    .create()
}

function getBlock(te: any) {
  const view = te.ctx.get(editorViewCtx)
  const dom = view.dom.querySelector('[data-testid="writing-codeblock"]') as HTMLElement
  return { view, dom }
}

describe('代码块 NodeView 外壳', () => {
  it('渲染头部行:箭头 + 语言标签;contentDOM 为 pre>code', async () => {
    const te = await makeEditor('```js\nconst a = 1\n```')
    const { dom } = getBlock(te)
    expect(dom).not.toBeNull()
    expect(dom.dataset.collapsed).toBe('false')
    expect(dom.querySelector('[data-testid="writing-codeblock-toggle"]')!.textContent).toBe('▾')
    expect(dom.querySelector('[data-testid="writing-codeblock-lang"]')!.textContent).toBe('js')
    expect(dom.querySelector('pre > code')).not.toBeNull()
    te.destroy()
  })

  it('无语言时标签显示「文本」', async () => {
    const te = await makeEditor('```\nplain\n```')
    const { dom } = getBlock(te)
    expect(dom.querySelector('[data-testid="writing-codeblock-lang"]')!.textContent).toBe('文本')
    te.destroy()
  })

  it('点箭头折叠 → data-collapsed=true + 展开条可见;点展开条恢复', async () => {
    const te = await makeEditor('```\nline1\nline2\nline3\nline4\n```')
    const { view, dom } = getBlock(te)
    const toggle = dom.querySelector('[data-testid="writing-codeblock-toggle"]') as HTMLButtonElement
    toggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    expect(dom.dataset.collapsed).toBe('true')
    expect(toggle.textContent).toBe('▸')
    const expand = dom.querySelector('[data-testid="writing-codeblock-expand"]') as HTMLButtonElement
    expect(expand.style.display).not.toBe('none')
    // attr 真的写进了 doc
    let cb: any = null
    view.state.doc.descendants((n) => { if (n.type.name === 'code_block') cb = n })
    expect(cb.attrs.collapsed).toBe(true)

    expand.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    expect(dom.dataset.collapsed).toBe('false')
    expect(expand.style.display).toBe('none')
    te.destroy()
  })

  it('外壳不拦截 contentDOM 内事件,光标可进入代码区编辑', async () => {
    const te = await makeEditor('前文\n\n```\nlet x = 1\n```')
    const { view, dom } = getBlock(te)
    // 光标放进代码块末尾,插字符走 PM 正常路径
    let cbPos = -1
    view.state.doc.descendants((n, p) => { if (n.type.name === 'code_block') cbPos = p })
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, cbPos + 1 + 'let x = 1'.length)))
    view.dispatch(view.state.tr.insertText('!'))
    expect(dom.textContent).toContain('let x = 1!')
    // 语言标签不应被当成可编辑内容
    expect(view.state.doc.textContent).not.toContain('文本')
    te.destroy()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/writing-codeblock-view.test.ts`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 实现 NodeView**

`src/lib/milkdown-codeblock-view.ts`:

```ts
// 注意:本文件被渲染进程使用,禁止引入 node 内置模块(ipc-state §5)。
// 代码块 NodeView 外壳(设计 2026-08-23 §2,模式照抄 milkdown-orbit-hr.ts):
// dom = 面板(header + pre>code contentDOM + 折叠展开条);
// header/expand 的 mousedown 由 stopEvent 拦下(不进 PM 选区逻辑),
// contentDOM 内事件全部放行,保证代码区可编辑。
import { $prose } from '@milkdown/utils'
import { Plugin, PluginKey } from '@milkdown/prose/state'
import type { MilkdownPlugin } from '@milkdown/ctx'
import type { Node as PMNode } from '@milkdown/prose/model'
import type { EditorView } from '@milkdown/prose/view'

function langLabel(node: PMNode): string {
  return (node.attrs.language as string) || '文本'
}

const codeblockView = $prose(() =>
  new Plugin({
    key: new PluginKey('STUDY_PARLOR_CODEBLOCK_VIEW'),
    props: {
      nodeViews: {
        code_block: (node: PMNode, view: EditorView, getPos: () => number | undefined) => {
          const dom = document.createElement('div')
          dom.className = 'writing-codeblock'
          dom.dataset.testid = 'writing-codeblock'

          const header = document.createElement('div')
          header.className = 'writing-codeblock-header'
          header.contentEditable = 'false'

          const toggle = document.createElement('button')
          toggle.type = 'button'
          toggle.dataset.testid = 'writing-codeblock-toggle'
          toggle.className = 'writing-codeblock-toggle'
          toggle.title = '折叠/展开代码块'

          const lang = document.createElement('span')
          lang.dataset.testid = 'writing-codeblock-lang'
          lang.className = 'writing-codeblock-lang'
          header.append(toggle, lang)

          const body = document.createElement('pre')
          body.className = 'writing-codeblock-body'
          const code = document.createElement('code')
          body.appendChild(code)

          const expand = document.createElement('button')
          expand.type = 'button'
          expand.dataset.testid = 'writing-codeblock-expand'
          expand.className = 'writing-codeblock-expand'
          expand.textContent = '⌄ 展开'
          expand.contentEditable = 'false'

          dom.append(header, body, expand)

          const render = (n: PMNode) => {
            const collapsed = n.attrs.collapsed === true
            dom.dataset.collapsed = collapsed ? 'true' : 'false'
            toggle.textContent = collapsed ? '▸' : '▾'
            toggle.setAttribute('aria-expanded', String(!collapsed))
            lang.textContent = langLabel(n)
            expand.style.display = collapsed ? '' : 'none'
          }
          render(node)

          const setCollapsed = (collapsed: boolean) => {
            const pos = typeof getPos === 'function' ? getPos() : undefined
            if (typeof pos !== 'number') return
            const cur = view.state.doc.nodeAt(pos)
            if (!cur || cur.type.name !== 'code_block') return
            view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...cur.attrs, collapsed }))
            view.focus()
          }
          toggle.addEventListener('mousedown', (e) => {
            e.preventDefault()
            const pos = typeof getPos === 'function' ? getPos() : undefined
            if (typeof pos !== 'number') return
            const cur = view.state.doc.nodeAt(pos)
            if (!cur) return
            setCollapsed(cur.attrs.collapsed !== true)
          })
          expand.addEventListener('mousedown', (e) => { e.preventDefault(); setCollapsed(false) })

          return {
            dom,
            contentDOM: code,
            // header/expand 上的事件由外壳自己处理,PM 不接管;contentDOM 内放行
            stopEvent: (event: Event) =>
              !(event.target instanceof Node && code.contains(event.target)),
            // header/expand 的 DOM 变化不是文档变更;code 内的 mutation(含 characterData
            // 文本节点)必须放行,否则编辑不生效。Node 此处是 DOM 全局构造器,勿与 PMNode 混。
            ignoreMutation: (m: MutationRecord) =>
              !(m.target === code || (m.target instanceof Node && code.contains(m.target))),
            update: (n: PMNode) => {
              if (n.type.name !== 'code_block') return false
              render(n)
              return true
            },
          }
        },
      },
    },
  }),
)

export const codeblockViewPlugins: MilkdownPlugin[] = [codeblockView]
```

- [ ] **Step 4: 结构性 CSS 追加到 `writing-editor.css` 末尾**

```css
/* ── 代码块 NodeView(设计 2026-08-23):结构 + 折叠;面板/文字/token 颜色见下方 [data-theme] 块 ── */
.writing-editor-root .ProseMirror .writing-codeblock {
  position: relative;
  margin: 0.5em 0;
  border-radius: 6px;
  border: 1px solid transparent; /* 色值由主题块给 */
}
.writing-editor-root .writing-codeblock-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px;
  font-size: 0.72em;
  user-select: none;
}
.writing-editor-root .writing-codeblock-toggle {
  width: 16px;
  height: 16px;
  padding: 0;
  font-size: 10px;
  line-height: 14px;
  text-align: center;
  background: none;
  border: none;
  cursor: pointer;
  opacity: 0.45; /* 常驻但弱化,悬停面板时提亮 */
}
.writing-editor-root .writing-codeblock:hover .writing-codeblock-toggle { opacity: 0.9; }
.writing-editor-root .writing-codeblock-body {
  margin: 0;
  padding: 6px 12px 10px;
  font-family: 'Cascadia Code', Consolas, 'Courier New', monospace;
  font-size: 0.85em;
  line-height: 1.6;
}
/* 折叠:只露前 3 行,底部渐变淡出(颜色由主题块给,此处给结构) */
.writing-editor-root .writing-codeblock[data-collapsed="true"] .writing-codeblock-body {
  max-height: calc(1.6em * 3 + 16px);
  overflow: hidden;
}
.writing-editor-root .writing-codeblock-expand {
  display: block;
  width: 100%;
  padding: 1px 0 3px;
  font-size: 0.72em;
  text-align: center;
  background: none;
  border: none;
  cursor: pointer;
}
```

注意:`.writing-editor-root .ProseMirror pre` 既有规则(`white-space: pre-wrap`)对 contentDOM 的 `<pre class="writing-codeblock-body">` 继续生效,不删不改。

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run tests/writing-codeblock-view.test.ts tests/writing-codeblock-schema.test.ts`
Expected: PASS(6 tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/milkdown-codeblock-view.ts tests/writing-codeblock-view.test.ts src/components/writing/writing-editor.css
git commit -m "feat(writing): 代码块 NodeView 外壳——折叠箭头/语言标签/前 3 行折叠 + 展开条"
```

---

### Task 3: 加号栏「代码块」入口

**Files:**
- Modify: `src/lib/milkdown-gutter-insert.ts:6-25`(import + ITEMS)
- Create: `tests/writing-gutter-codeblock.test.ts`

**Interfaces:**
- Consumes: `codeblockSchemaPlugins` + `codeblockViewPlugins`(Task 1/2,测试里组装完整编辑器验证端到端插入);`runCollapsedBlockCommand`(既有,`src/lib/milkdown-collapse-selection.ts`)。
- Produces: gutter 菜单项 `writing-gutter-item[data-type="codeblock"]`(E2E Task 6 依赖)。

- [ ] **Step 1: 写失败的单元测试**

`tests/writing-gutter-codeblock.test.ts`:

```ts
// @vitest-environment jsdom
// 加号栏「代码块」入口(设计 2026-08-23 §1):菜单出现该项,点击把当前块转为代码块。
import { describe, it, expect } from 'vitest'
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { codeblockSchemaPlugins } from '@/lib/milkdown-codeblock-schema'
import { codeblockViewPlugins } from '@/lib/milkdown-codeblock-view'
import { gutterInsertPlugins } from '@/lib/milkdown-gutter-insert'

async function makeEditor(initial: string) {
  const root = document.createElement('div')
  root.className = 'writing-editor-root'
  document.body.appendChild(root)
  return Editor.make()
    .use(commonmark).use(gfm)
    .use(codeblockSchemaPlugins)
    .use(codeblockViewPlugins)
    .use(gutterInsertPlugins)
    .config(ctx => { ctx.set(rootCtx, root); ctx.set(defaultValueCtx, initial) })
    .create()
}

describe('加号栏代码块入口', () => {
  it('菜单含「代码块」项,点击后当前段落变成代码块(NodeView 外壳挂载)', async () => {
    const te = await makeEditor('前文段落')
    const view = te.ctx.get(editorViewCtx)
    // 触发一次 layout:插件构造时已 layout 一次,光标在首段 depth 1 → plus 可见
    const root = view.dom.closest('.writing-editor-root') as HTMLElement
    const plus = root.querySelector('[data-testid="writing-gutter-plus"]') as HTMLButtonElement
    expect(plus.style.display).not.toBe('none')
    plus.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))

    const item = root.querySelector('[data-testid="writing-gutter-item"][data-type="codeblock"]') as HTMLButtonElement
    expect(item).not.toBeNull()
    expect(item.textContent).toBe('代码块')
    item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))

    const first = view.state.doc.child(0)
    expect(first.type.name).toBe('code_block')
    expect(root.querySelector('[data-testid="writing-codeblock"]')).not.toBeNull()
    te.destroy()
  })
})
```
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/writing-gutter-codeblock.test.ts`
Expected: FAIL —— `item` 为 null(菜单无代码块项)。

- [ ] **Step 3: 实现菜单项**

`src/lib/milkdown-gutter-insert.ts`:

import 区加:

```ts
import {
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  wrapInHeadingCommand,
  createCodeBlockCommand,
} from '@milkdown/preset-commonmark'
```

`ITEMS` 数组(H3 之后)加:

```ts
  { type: 'codeblock', label: '代码块', run: ctx => runCollapsedBlockCommand(createCodeBlockCommand.key)(ctx) },
```

`this.plus.title` 改为 `'插入块(列表/表格/标题/代码块)'`。

- [ ] **Step 4: 跑测试确认通过 + 既有 gutter/collapse 回归**

Run: `npx vitest run tests/writing-gutter-codeblock.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/milkdown-gutter-insert.ts tests/writing-gutter-codeblock.test.ts
git commit -m "feat(writing): 行首加号栏新增「代码块」插入入口"
```

---

### Task 4: refractor 高亮插件

**Files:**
- Create: `src/lib/milkdown-codeblock-highlight.ts`
- Create: `tests/writing-codeblock-highlight.test.ts`

**Interfaces:**
- Consumes: code_block 节点 `attrs.language`(preset 既有)。
- Produces: `codeblockHighlightPlugins: MilkdownPlugin[]`;DOM 契约:代码 token 包 `span`(class 为 refractor 原生类,如 `token keyword`),仅出现在 `.writing-codeblock` 内(Task 5 CSS、Task 6 E2E 依赖 `.token.keyword` 选择器)。

- [ ] **Step 1: 写失败的单元测试**

`tests/writing-codeblock-highlight.test.ts`:

```ts
// @vitest-environment jsdom
// 代码块语法高亮(设计 2026-08-23 §3):refractor 装饰插件;
// 支持的语言 → token span;不支持/无语言 → 零装饰零报错。
import { describe, it, expect } from 'vitest'
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { codeblockSchemaPlugins } from '@/lib/milkdown-codeblock-schema'
import { codeblockViewPlugins } from '@/lib/milkdown-codeblock-view'
import { codeblockHighlightPlugins } from '@/lib/milkdown-codeblock-highlight'

async function makeEditor(initial: string) {
  const root = document.createElement('div')
  root.className = 'writing-editor-root'
  document.body.appendChild(root)
  return Editor.make()
    .use(commonmark).use(gfm)
    .use(codeblockSchemaPlugins)
    .use(codeblockViewPlugins)
    .use(codeblockHighlightPlugins)
    .config(ctx => { ctx.set(rootCtx, root); ctx.set(defaultValueCtx, initial) })
    .create()
}

describe('代码块语法高亮', () => {
  it('js 代码块出现 token 装饰 span', async () => {
    const te = await makeEditor('```js\nconst a = 1\n```')
    const view = te.ctx.get(editorViewCtx)
    const kw = view.dom.querySelector('.writing-codeblock .token.keyword')
    expect(kw).not.toBeNull()
    expect(kw!.textContent).toBe('const')
    te.destroy()
  })

  it('不支持的语言:无装饰、不报错', async () => {
    const te = await makeEditor('```cobol\nDISPLAY X\n```')
    const view = te.ctx.get(editorViewCtx)
    expect(view.dom.querySelector('.writing-codeblock .token')).toBeNull()
    expect(view.dom.textContent).toContain('DISPLAY X')
    te.destroy()
  })

  it('无语言/空代码块:无装饰、不报错', async () => {
    const te = await makeEditor('```\n\n```')
    const view = te.ctx.get(editorViewCtx)
    expect(view.dom.querySelector('.writing-codeblock .token')).toBeNull()
    te.destroy()
  })

  it('编辑后装饰跟随更新', async () => {
    const te = await makeEditor('```js\nlet a = 1\n```')
    const view = te.ctx.get(editorViewCtx)
    expect(view.dom.querySelector('.token.keyword')!.textContent).toBe('let')
    // 块首插入 const 语句
    let cbPos = -1
    view.state.doc.descendants((n, p) => { if (n.type.name === 'code_block') cbPos = p })
    view.dispatch(view.state.tr.insertText('const b = 2\n', cbPos + 1))
    const keywords = Array.from(view.dom.querySelectorAll('.token.keyword')).map(el => el.textContent)
    expect(keywords).toContain('const')
    expect(keywords).toContain('let')
    te.destroy()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/writing-codeblock-highlight.test.ts`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 实现高亮插件**

`src/lib/milkdown-codeblock-highlight.ts`:

```ts
// 注意:本文件被渲染进程使用,禁止引入 node 内置模块(ipc-state §5)。
// 代码块语法高亮(设计 2026-08-23 §3):refractor → inline decorations。
// 只注册常用语言子集(控制 bundle);不支持的语言静默跳过。
// 装饰重算粒度 = 整个 doc(笔记体量下足够;docChanged 才重算)。
import { $prose } from '@milkdown/utils'
import { Plugin, PluginKey } from '@milkdown/prose/state'
import { Decoration, DecorationSet } from '@milkdown/prose/view'
import type { MilkdownPlugin } from '@milkdown/ctx'
import type { Node as PMNode } from '@milkdown/prose/model'
import { refractor } from 'refractor'
// 注册顺序即依赖顺序(typescript 依赖 javascript,jsx/tsx 依赖 markup/javascript/typescript)
import refractorMarkup from 'refractor/lang/markup.js'
import refractorCss from 'refractor/lang/css.js'
import refractorClike from 'refractor/lang/clike.js'
import refractorJavascript from 'refractor/lang/javascript.js'
import refractorTypescript from 'refractor/lang/typescript.js'
import refractorJsx from 'refractor/lang/jsx.js'
import refractorTsx from 'refractor/lang/tsx.js'
import refractorPython from 'refractor/lang/python.js'
import refractorBash from 'refractor/lang/bash.js'
import refractorJson from 'refractor/lang/json.js'
import refractorYaml from 'refractor/lang/yaml.js'
import refractorMarkdown from 'refractor/lang/markdown.js'
import refractorSql from 'refractor/lang/sql.js'

for (const lang of [
  refractorMarkup, refractorCss, refractorClike, refractorJavascript,
  refractorTypescript, refractorJsx, refractorTsx, refractorPython,
  refractorBash, refractorJson, refractorYaml, refractorMarkdown, refractorSql,
]) {
  refractor.register(lang)
}

/** 把 refractor hast 子树展平成 (offset, length, classes) 片段 */
function collectTokens(
  node: { type: string; value?: string; children?: any[]; properties?: { className?: string[] } },
  pos: number,
  classes: string[],
  out: { from: number; to: number; cls: string }[],
): number {
  if (node.type === 'text') {
    const len = node.value!.length
    if (len > 0 && classes.length > 0) out.push({ from: pos, to: pos + len, cls: classes.join(' ') })
    return pos + len
  }
  let cur = pos
  const cls = node.type === 'element'
    ? [...classes, ...(node.properties?.className ?? [])]
    : classes
  for (const child of node.children ?? []) cur = collectTokens(child, cur, cls, out)
  return cur
}

function buildDecorations(doc: PMNode): DecorationSet {
  const decos: Decoration[] = []
  doc.descendants((node, pos) => {
    if (node.type.name !== 'code_block') return true
    const lang = node.attrs.language as string
    if (!lang || !refractor.registered(lang)) return true
    const text = node.textContent
    if (!text) return true
    try {
      const tree = refractor.highlight(text, lang) as unknown as { children: any[] }
      const spans: { from: number; to: number; cls: string }[] = []
      let cur = pos + 1 // 代码文本从节点内容起点开始
      for (const child of tree.children) cur = collectTokens(child, cur, [], spans)
      for (const s of spans) decos.push(Decoration.inline(s.from, s.to, { class: s.cls }))
    } catch {
      // 高亮失败静默降级为纯文本
    }
    return true
  })
  return DecorationSet.create(doc, decos)
}

const KEY = new PluginKey<DecorationSet>('STUDY_PARLOR_CODEBLOCK_HIGHLIGHT')

const codeblockHighlight = $prose(() =>
  new Plugin({
    key: KEY,
    state: {
      init: (_, state) => buildDecorations(state.doc),
      apply: (tr, old, _oldState, newState) => (tr.docChanged ? buildDecorations(newState.doc) : old),
    },
    props: {
      decorations: (state) => KEY.getState(state),
    },
  }),
)

export const codeblockHighlightPlugins: MilkdownPlugin[] = [codeblockHighlight]
```

注意:`refractor/lang/*.js` 默认导出形态若与上述不符(不同小版本可能改为具名导出),以 `node -e` 实际打印的模块键为准微调 import 写法,保持注册逻辑不变。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/writing-codeblock-highlight.test.ts`
Expected: PASS(4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/milkdown-codeblock-highlight.ts tests/writing-codeblock-highlight.test.ts
git commit -m "feat(writing): 代码块 refractor 语法高亮装饰插件(常用语言子集,失败静默降级)"
```

---

### Task 5: 双版式样式 + theme 接线 + 编辑器注册插件

**Files:**
- Modify: `src/components/writing/WritingEditor.tsx:26,92,98-104`(theme prop + data-theme + 注册三个新插件)
- Modify: `src/components/writing/WritingBoard.tsx:98-102`(传 theme)
- Modify: `src/components/writing/CompanionBoard.tsx:83` 附近(传 theme)
- Modify: `src/components/writing/writing-editor.css`(面板/文字/token 颜色,追加到末尾)

**Interfaces:**
- Consumes: `codeblockSchemaPlugins`、`codeblockViewPlugins`、`codeblockHighlightPlugins`(Task 1/2/4);DOM 钩子 `data-collapsed`、`.token.*` class。
- Produces: `.writing-editor-root[data-theme="academic|newspaper"]`(E2E Task 6 主题断言依赖)。

- [ ] **Step 1: WritingEditor 接线**

`src/components/writing/WritingEditor.tsx`:

import 区加:

```ts
import { codeblockSchemaPlugins } from '@/lib/milkdown-codeblock-schema'
import { codeblockViewPlugins } from '@/lib/milkdown-codeblock-view'
import { codeblockHighlightPlugins } from '@/lib/milkdown-codeblock-highlight'
```

`EditorInner` props 加 `theme: 'academic' | 'newspaper'`;`.use(orbitHrPlugins)` 之后加:

```ts
      .use(codeblockSchemaPlugins)
      .use(codeblockViewPlugins)
      .use(codeblockHighlightPlugins)
```

根节点改:

```tsx
    <div className="writing-editor-root" data-theme={theme}>
```

外层 `WritingEditor` props 加 `theme: 'academic' | 'newspaper'` 并透传给 `EditorInner`。

- [ ] **Step 2: 两处调用方传 theme**

`WritingBoard.tsx` L98-102 的 `<WritingEditor` 加 `theme={briefingTheme}`。

`CompanionBoard.tsx` 的 `<WritingEditor` 同样加 `theme={useStore 读取的 briefingTheme}`(该组件若尚无 briefingTheme,加 `const briefingTheme = useStore(s => s.briefingTheme)`)。

- [ ] **Step 3: 双版式 CSS 追加到 `writing-editor.css` 末尾**

```css
/* ── 代码块面板:学术(深墨) / 报纸(浅灰纸) ── */
.writing-editor-root[data-theme='academic'] .writing-codeblock {
  background: rgba(0, 0, 0, 0.28);
  border-color: rgba(232, 213, 183, 0.1);
}
.writing-editor-root[data-theme='academic'] .writing-codeblock-header {
  color: rgba(232, 213, 183, 0.5);
}
.writing-editor-root[data-theme='academic'] .writing-codeblock-toggle { color: #e8d5b7; }
.writing-editor-root[data-theme='academic'] .writing-codeblock-body { color: #e8d5b7; }
.writing-editor-root[data-theme='academic'] .writing-codeblock[data-collapsed="true"] .writing-codeblock-body {
  /* 淡出:底部 1.6em 渐隐到面板底色 */
  -webkit-mask-image: linear-gradient(to bottom, #000 55%, transparent 100%);
  mask-image: linear-gradient(to bottom, #000 55%, transparent 100%);
}
.writing-editor-root[data-theme='academic'] .writing-codeblock-expand { color: rgba(217, 119, 87, 0.85); }

.writing-editor-root[data-theme='newspaper'] .writing-codeblock {
  background: #f5f2ed;
  border-color: rgba(26, 26, 26, 0.1);
}
.writing-editor-root[data-theme='newspaper'] .writing-codeblock-header {
  color: #6b5d52;
}
.writing-editor-root[data-theme='newspaper'] .writing-codeblock-toggle { color: #1a1a1a; }
.writing-editor-root[data-theme='newspaper'] .writing-codeblock-body { color: #1a1a1a; }
.writing-editor-root[data-theme='newspaper'] .writing-codeblock[data-collapsed="true"] .writing-codeblock-body {
  -webkit-mask-image: linear-gradient(to bottom, #000 55%, transparent 100%);
  mask-image: linear-gradient(to bottom, #000 55%, transparent 100%);
}
.writing-editor-root[data-theme='newspaper'] .writing-codeblock-expand { color: #8a3a3a; }

/* token 色板(≤6 色,两主题同 class 只换色值) */
/* 学术:keyword=ember 点睛,其余米色衍生 */
.writing-editor-root[data-theme='academic'] .writing-codeblock .token.keyword { color: #d97757; }
.writing-editor-root[data-theme='academic'] .writing-codeblock .token.string { color: #a3b18a; }
.writing-editor-root[data-theme='academic'] .writing-codeblock .token.number { color: #d9a05b; }
.writing-editor-root[data-theme='academic'] .writing-codeblock .token.comment { color: rgba(232, 213, 183, 0.45); font-style: italic; }
.writing-editor-root[data-theme='academic'] .writing-codeblock .token.function { color: #e8d5b7; }
.writing-editor-root[data-theme='academic'] .writing-codeblock .token.operator,
.writing-editor-root[data-theme='academic'] .writing-codeblock .token.punctuation { color: rgba(232, 213, 183, 0.6); }
/* 报纸:低饱和印刷色 */
.writing-editor-root[data-theme='newspaper'] .writing-codeblock .token.keyword { color: #8a3a3a; }
.writing-editor-root[data-theme='newspaper'] .writing-codeblock .token.string { color: #2d6a4f; }
.writing-editor-root[data-theme='newspaper'] .writing-codeblock .token.number { color: #7c5a10; }
.writing-editor-root[data-theme='newspaper'] .writing-codeblock .token.comment { color: #6b5d52; font-style: italic; }
.writing-editor-root[data-theme='newspaper'] .writing-codeblock .token.function { color: #1a1a1a; }
.writing-editor-root[data-theme='newspaper'] .writing-codeblock .token.operator,
.writing-editor-root[data-theme='newspaper'] .writing-codeblock .token.punctuation { color: #6b5d52; }
```

- [ ] **Step 4: 验证**

Run: `npx vitest run tests/writing-codeblock-view.test.ts tests/writing-codeblock-schema.test.ts tests/writing-codeblock-highlight.test.ts tests/writing-gutter-codeblock.test.ts tests/writing-editor.test.tsx tests/writing-codeblock-enter.test.ts`
Expected: 全部 PASS(编辑器注册变化不回退既有行为)

再跑构建确认 renderer 可打包(refractor ESM 兼容):

Run: `npx electron-vite build`
Expected: 构建成功

- [ ] **Step 5: Commit**

```bash
git add src/components/writing/WritingEditor.tsx src/components/writing/WritingBoard.tsx src/components/writing/CompanionBoard.tsx src/components/writing/writing-editor.css
git commit -m "feat(writing): 代码块学术/报纸双版式样式 + theme 接线 + 编辑器注册"
```

---

### Task 6: E2E 用户链路全覆盖

**Files:**
- Create: `e2e/specs/writing-codeblock.spec.ts`
- Check(不改): `e2e/source-map.json`(writing 分组 glob 已覆盖,验证无孤儿 WARNING)

**Interfaces:**
- Consumes: 全部 DOM testid(Task 2/3 的 Produces);E2E 导航模式照抄 `e2e/specs/writing-codeblock-wrap.spec.ts` 的 `setup()`。

- [ ] **Step 1: 写 E2E spec**

`e2e/specs/writing-codeblock.spec.ts`,setup 复用 `writing-codeblock-wrap.spec.ts` 的 seed + 导航模式(文章 frontmatter 用同样 `fm()`;正文初始为 `# 标题\n\n上文段落\n`,后续交互在编辑器内产生代码块)。覆盖 spec checklist 10 条链路,每条约等于一个 test:

```ts
test.describe('@p1 writing-codeblock', () => {
  // 1) 加号栏插入:点击段落 → writing-gutter-plus → [data-type="codeblock"] →
  //    writing-codeblock 出现,光标在 pre code 内,打字进代码区
  // 2) 输入规则:新行打 ``` 生成代码块;再打 ```js + Enter(或输入 js)语言标签为 js
  //    (handleTextInput 在真机 Playwright 用 page.keyboard.type 逐字输入即可触发)
  // 3) 编辑:代码区输入字符 → writing-save-status 最终「已保存」→ 读 .md 文件含输入内容
  // 4) Enter 跳过:代码块末尾空行按 Enter → 出现新 paragraph,且 typing 进新段落不进代码块
  // 5) 折叠/展开:造 5 行代码 → 点 writing-codeblock-toggle → data-collapsed="true" +
  //    writing-codeblock-expand 可见 + body 计算高度 ≈ 3 行(断言 < 5 行全高)→
  //    点 expand → data-collapsed="false"
  // 6) 删除:代码块内 Ctrl+A Backspace 后块消失/变空段;块首 Backspace 与上文段落合并不错乱
  //    (断言 doc 结构:通过 window.evaluate 读 .ProseMirror 子节点类型)
  // 7) 高亮:```js 块内 .token.keyword 可见且色值非继承色;无语言块无 .token
  // 8) 双主题:seedStateJson 里 briefingTheme 分别 academic/newspaper(分两个 test 或参数化),
  //    断言 .writing-codeblock 背景色:academic 深色(r 通道 < 60)、newspaper 为 rgb(245, 242, 237)
  // 9) 序列化往返:编辑保存后 reload 重开文章,代码与语言标签保留;.md 文件内容不含 'collapsed'
  // 10) 嵌套守卫:光标在代码块内时 writing-gutter-plus 不可见
})
```

实现注意:
- 每个 test 独立 seed 文章内容(该链路需要的前置 doc),不要把 10 条串成一个超长 test。
- 折叠高度断言用 `window.evaluate` 读 `getBoundingClientRect().height` 与 `line-height` 比较,容差 ±4px。
- 主题切换两条链路各自 seed `briefingTheme` 后冷启动,不在运行中切主题(简化时序)。

- [ ] **Step 2: 构建 + 定向跑**

```bash
node scripts/e2e-changed.js --run --no-retries
```

Expected:`writing-codeblock.spec.ts` 全绿;无孤儿 spec WARNING(writing 分组 glob 已覆盖);`startup-health` 等受影响既有 spec 不红。若既有 spec(如 `writing-codeblock-wrap.spec.ts`)因 NodeView 改变 pre 结构而红,优先修本功能使其兼容(`pre` 选择器仍应命中 `.writing-codeblock-body`),不得改旧测试断言来迁就。

- [ ] **Step 3: Commit**

```bash
git add e2e/specs/writing-codeblock.spec.ts
git commit -m "test(writing): 代码块用户链路 E2E——插入/输入规则/编辑/Enter 退出/折叠/删除/高亮/双主题/往返/守卫"
```

---

## 完成定义

- 上述 6 个 Task 全部 commit,单元测试与定向 E2E 全绿
- `npx electron-vite build` 成功
- spec checklist 10 条链路均有对应测试断言
