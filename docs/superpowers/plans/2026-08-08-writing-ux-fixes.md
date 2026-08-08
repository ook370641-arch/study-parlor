# 写作功能 UX 修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复写作功能 7 个体验问题：标题/加粗渲染、选中文字着色、字号统一、分组拖拽整理、长行换行、行内增删入口、摘要生成时机。

**Architecture:** 编辑器侧新增 Milkdown 自定义 `textColor` mark（`<span style="color">` 往返 .md）+ 专用 CSS 补回被 Tailwind preflight 重置的标题/加粗语义；树侧统一拖拽落点协议（横线=排序、整行高亮=入组、无缩进线=根级）；删除改为移入 `.trash/`；摘要收敛为进入写作来源时 diff 触发。

**Tech Stack:** Milkdown v7.21（`$markSchema`/`$command`/`$remark` from `@milkdown/utils`）、ProseMirror、React 18 + Zustand、Electron IPC、Vitest、Playwright E2E。

**Spec:** `docs/superpowers/specs/2026-08-08-writing-ux-fixes-design.md`（已批准，含三处现实修正）

## Global Constraints

- **红线：绝不真删用户文章**。一切删除 = 移入 `<lib>/<root>/.trash/`；解散分组必须先释放子项。
- 不改动学习库现有数据；不做数据迁移/清洗。
- 新增 IPC 按 types → handler → preload → facade → store 顺序同步（ipc-state §1）。
- 新持久化字段提供默认值兼容旧 state.json / 旧 .catalog.json（ipc-state §3）。
- E2E mock 守卫统一为 `process.env.NODE_ENV === 'test' && !!process.env.E2E_CONFIG_DIR`（同 `electron/ipc/llm.ts:16` 的 `isE2EMock()`）。
- 组件文件只导出组件（ui-styling §10）；helper 放 `src/lib/`。
- 验证只跑受影响测试：`npx vitest run <具体文件>` + `node scripts/e2e-changed.js --run`，禁止全量（general §9）。
- 提交粒度：每个 Task 一次 commit。

## 并行轨道（subagent 派发用）

- 轨道 A：Task 1 → Task 3（编辑器 mark → 工具栏）
- 轨道 B：Task 2（编辑器 CSS + 字号/默认色，与 A 文件不相交）
- 轨道 C：Task 4 → Task 5 → Task 6（同改 `WritingTree.tsx`，必须串行）
- 轨道 D：Task 7（electron catalog + IPC，与 A/B/C 仅 `src/types/index.ts` 有追加式相交——D 只追加 `writingRefreshCatalog` 到 IpcApi，先合 D 的类型改动或最后做 D 均可）
- Task 8 收尾：全部轨道合并后串行执行。

---

### Task 1: textColor mark 验证 spike（本迭代最大风险）

**Files:**
- Create: `src/lib/milkdown-text-color.ts`
- Test: `tests/text-color-mark.test.ts`

**Interfaces:**
- Produces（Task 3 依赖）:
  - `export const textColorPlugins: MilkdownPlugin[]` —— 编辑器 `.use(textColorPlugins)` 一把装配（schema + remark 插件 + command）。
  - `export const textColorCommand: $Command<{ color: string | null }>` —— payload `{color: '#d97757'}` 对选区着色/改色；`{color: null}` 去除颜色。选区为空时写 stored mark 作用于后续输入。
  - `export const TEXT_COLOR_PALETTE: { label: string; value: string | null }[]` —— `[{label:'默认',value:null},{label:'暖橙',value:'#d97757'},{label:'赤红',value:'#b34747'},{label:'墨灰',value:'#9c9490'},{label:'黑',value:'#1a1a1a'}]`。
- Consumes: 无（纯新增）。

**背景（实现者必读）：** Milkdown v7 的 remark 管线不会把 inline `<span style="color:…">…</span>` 还原成 mark——mdast 里它是 `html` 开标签 + 内容 + `html` 闭标签三个平级节点，且 commonmark preset 无 html 节点映射，**今天粘贴 span HTML 进编辑器内容会丢**。所以必须双向接管：
1. 解析方向：remark 插件把「html 开 span … html 闭 span」序列改写为 `{type:'textColor', data:{color}, children:[…]}` 自定义 mdast 节点，mark schema 的 `parseMarkdown` 认领它。
2. 序列化方向：mark schema 的 `toMarkdown` 产出 `textColor` mdast 节点，同一 remark 插件通过 `this.data('toMarkdownExtensions')` 注册 stringify handler 输出 raw `<span>` 字符串。

- [ ] **Step 1: 写失败测试（mdast 双向纯函数，不依赖 DOM）**

`tests/text-color-mark.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { transformSpanHtmlToTextColor, textColorToMarkdownExtension } from '../src/lib/milkdown-text-color'

describe('transformSpanHtmlToTextColor', () => {
  it('html span 开闭序列改写为 textColor 节点', () => {
    const tree = {
      type: 'root',
      children: [{
        type: 'paragraph',
        children: [
          { type: 'text', value: '前' },
          { type: 'html', value: '<span style="color:#d97757">' },
          { type: 'strong', children: [{ type: 'text', value: '重点' }] },
          { type: 'html', value: '</span>' },
          { type: 'text', value: '后' },
        ],
      }],
    }
    transformSpanHtmlToTextColor(tree as any)
    const para = (tree as any).children[0]
    expect(para.children).toHaveLength(3)
    expect(para.children[1].type).toBe('textColor')
    expect(para.children[1].data.color).toBe('#d97757')
    expect(para.children[1].children[0].type).toBe('strong')
  })

  it('不匹配颜色的 span / 未闭合 span 原样保留', () => {
    const tree = {
      type: 'root',
      children: [{
        type: 'paragraph',
        children: [
          { type: 'html', value: '<span class="x">' },
          { type: 'text', value: 'a' },
          { type: 'html', value: '</span>' },
        ],
      }],
    }
    transformSpanHtmlToTextColor(tree as any)
    expect((tree as any).children[0].children).toHaveLength(3)
    expect((tree as any).children[0].children[0].type).toBe('html')
  })
})

describe('textColorToMarkdownExtension', () => {
  it('textColor 节点序列化为 span HTML', async () => {
    const { toMarkdown } = await import('mdast-util-to-markdown')
    const out = toMarkdown(
      { type: 'paragraph', children: [
        { type: 'text', value: '前' },
        { type: 'textColor', data: { color: '#1a1a1a' }, children: [{ type: 'text', value: '黑字' }] } as any,
      ] } as any,
      { extensions: [textColorToMarkdownExtension] },
    )
    expect(out).toBe('前<span style="color:#1a1a1a">黑字</span>')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/text-color-mark.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `src/lib/milkdown-text-color.ts`**

```ts
// 注意:本文件被渲染进程使用,禁止引入 node 内置模块(ipc-state §5)。
import { $markSchema, $command, $remark } from '@milkdown/utils'
import type { MilkdownPlugin } from '@milkdown/ctx'

export const TEXT_COLOR_PALETTE = [
  { label: '默认', value: null },
  { label: '暖橙', value: '#d97757' },
  { label: '赤红', value: '#b34747' },
  { label: '墨灰', value: '#9c9490' },
  { label: '黑', value: '#1a1a1a' },
] as const satisfies readonly { label: string; value: string | null }[]

const SPAN_OPEN_RE = /^<span\s+style="color:\s*(#[0-9a-fA-F]{3,8})"\s*>$/
const SPAN_CLOSE_RE = /^<\/span\s*>$/

/** 把 mdast 中「<span style="color:X"> … </span>」html 序列改写为 textColor 节点(原地修改 tree)。 */
export function transformSpanHtmlToTextColor(tree: { children?: any[] }): void {
  if (!tree.children) return
  const out: any[] = []
  const kids = tree.children
  for (let i = 0; i < kids.length; i++) {
    const node = kids[i]
    if (node.children) transformSpanHtmlToTextColor(node)
    const m = node.type === 'html' ? SPAN_OPEN_RE.exec(node.value ?? '') : null
    if (m) {
      // 找配对闭合(不支持嵌套 span;遇到下一个开标签或父级末尾视为不闭合,放弃转换)
      let closeIdx = -1
      for (let j = i + 1; j < kids.length; j++) {
        if (kids[j].type === 'html' && SPAN_OPEN_RE.test(kids[j].value ?? '')) break
        if (kids[j].type === 'html' && SPAN_CLOSE_RE.test(kids[j].value ?? '')) { closeIdx = j; break }
      }
      if (closeIdx !== -1) {
        const inner = kids.slice(i + 1, closeIdx)
        const holder = { children: inner }
        transformSpanHtmlToTextColor(holder)
        out.push({ type: 'textColor', data: { color: m[1] }, children: holder.children })
        i = closeIdx
        continue
      }
    }
    out.push(node)
  }
  tree.children = out
}

/** mdast-util-to-markdown 扩展:textColor 节点输出 raw span HTML。 */
export const textColorToMarkdownExtension = {
  handlers: {
    textColor(node: any, _parent: any, state: any, info: any): string {
      const color = node.data?.color ?? ''
      const inner = state.containerPhrasing(node, info)
      return `<span style="color:${color}">${inner}</span>`
    },
  },
}

/** unified 插件:注册 stringify handler + 解析方向 tree 转换。 */
function remarkTextColor(this: any) {
  const data = this.data()
  const list = (data.toMarkdownExtensions ??= [])
  list.push(textColorToMarkdownExtension)
  return (tree: any) => { transformSpanHtmlToTextColor(tree) }
}

export const remarkTextColorPlugin = $remark('remarkTextColor', () => remarkTextColor)

export const textColorSchema = $markSchema('textColor', () => ({
  attrs: { color: { default: '' } },
  inclusive: true,
  parseDOM: [{
    tag: 'span[style*="color"]',
    getAttrs: (dom) => ({ color: (dom as HTMLElement).style.color || '' }),
  }],
  toDOM: (mark) => ['span', { style: `color: ${mark.attrs.color}` }, 0],
  parseMarkdown: {
    match: (node) => node.type === 'textColor',
    runner: (state, node, markType) => {
      const color = (node as any).data?.color ?? ''
      state.openMark(markType, { color })
      state.next((node as any).children ?? [])
      state.closeMark(markType)
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'textColor',
    runner: (state, mark) => {
      state.withMark(mark, 'textColor', undefined, { data: { color: mark.attrs.color } })
    },
  },
}))

export const textColorCommand = $command('textColor', (ctx) => (payload: { color: string | null }) => (state, dispatch) => {
  const markType = textColorSchema.type(ctx)
  const { from, to, empty } = state.selection
  if (payload.color === null) {
    if (!dispatch) return true
    if (empty) dispatch(state.tr.removeStoredMark(markType))
    else dispatch(state.tr.removeMark(from, to, markType))
    return true
  }
  const mark = markType.create({ color: payload.color })
  if (!dispatch) return true
  if (empty) {
    dispatch(state.tr.addStoredMark(mark))
  } else {
    dispatch(state.tr.removeMark(from, to, markType).addMark(from, to, mark).scrollIntoView())
  }
  return true
})

export const textColorPlugins: MilkdownPlugin[] = [remarkTextColorPlugin, textColorSchema, textColorCommand].flat()
```

**Spike 不确定性声明**：`withMark` 第 4 参 props 的落点（`data` 还是平铺）与 `toMarkdownExtensions` 是否被 Milkdown 内部 stringify processor 拾取，是 v7.21 API 细节。Step 4 测试若因这两点失败，允许实现者调整 `runner`/`data` 取值路径（如 `node.color` vs `node.data.color`，handler 内两处都读），**但不得改变外部接口与验收标准**。若 2 小时内无法打通 stringify 方向，降级方案（需回报后采用）：`toMarkdown.runner` 里直接 `state.withMark(mark, 'html', …)` 不可行（html 无 children），改为在 `WritingEditor` 的 `onChange` 出口做字符串后处理。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/text-color-mark.test.ts`
Expected: 3 个用例 PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/milkdown-text-color.ts tests/text-color-mark.test.ts
git commit -m "feat(writing): textColor mark——span HTML 与 .md 双向序列化(spike)"
```

---

### Task 2: 编辑器 CSS + 字号统一 + 默认色

**Files:**
- Create: `src/components/writing/writing-editor.css`
- Modify: `src/components/writing/WritingEditor.tsx`（import css + 包一层根 div）
- Modify: `src/lib/briefing-font-size.ts`（新增常量）
- Modify: `src/components/writing/WritingBoard.tsx:9-13,51-60`（字号/颜色来源切换）
- Test: `tests/` 无新增；E2E 断言在 Task 3 一并落地

**Interfaces:**
- Produces: `WRITING_BODY_FROM_UI: Record<BriefingFontSize, { size: string; weight: number }>`（WritingBoard 使用）。
- Consumes: 无。

- [ ] **Step 1: 写 `src/components/writing/writing-editor.css`**

```css
/* 编辑器内容样式:补回被 Tailwind preflight 重置的标题/加粗语义。
   正文字号由容器内联 fontSize(var(--writing-body-size))给出,标题用 em 阶梯跟随。 */
.writing-editor-root .ProseMirror {
  outline: none;
  overflow-wrap: anywhere;
  word-break: break-word;
  line-height: 1.8;
}
.writing-editor-root .ProseMirror h1 {
  font-size: 1.6em;
  font-weight: 600;
  line-height: 1.4;
  margin: 0.8em 0 0.4em;
}
.writing-editor-root .ProseMirror h2 {
  font-size: 1.35em;
  font-weight: 600;
  line-height: 1.4;
  margin: 0.7em 0 0.35em;
}
.writing-editor-root .ProseMirror h3 {
  font-size: 1.15em;
  font-weight: 600;
  line-height: 1.5;
  margin: 0.6em 0 0.3em;
}
.writing-editor-root .ProseMirror strong {
  font-weight: 700;
}
.writing-editor-root .ProseMirror p {
  margin: 0.35em 0;
}
.writing-editor-root .ProseMirror blockquote {
  border-left: 2px solid currentColor;
  padding-left: 0.8em;
  margin: 0.5em 0;
  opacity: 0.85;
}
```

- [ ] **Step 2: WritingEditor.tsx 接入**

顶部加 `import './writing-editor.css'`；`EditorInner` 的 return 改为：

```tsx
return (
  <div className="writing-editor-root">
    <Milkdown />
  </div>
)
```

- [ ] **Step 3: `src/lib/briefing-font-size.ts` 追加常量（文件末尾）**

```ts
/** 写作正文字号:按档位从 writingUIFontSize 映射。与 ACADEMIC_BODY_STYLES 同档同值,
 *  独立常量便于日后分化。右上角 −/+ 统一调控正文与界面。 */
export const WRITING_BODY_FROM_UI: Record<BriefingFontSize, { size: string; weight: number }> = {
  sm: { size: '17px', weight: 400 },
  base: { size: '19px', weight: 400 },
  lg: { size: '21px', weight: 500 },
  xl: { size: '23px', weight: 500 },
  '2xl': { size: '25px', weight: 600 },
  '3xl': { size: '27px', weight: 600 },
  '4xl': { size: '29px', weight: 600 },
  '5xl': { size: '31px', weight: 700 },
  '6xl': { size: '33px', weight: 700 },
  '7xl': { size: '35px', weight: 700 },
}
```

- [ ] **Step 4: WritingBoard.tsx 切换来源**

- 删除 `TONE_COLORS` 常量与 `const fontSize = useStore(s => s.writingFontSize)`、`const tone = useStore(s => s.writingTone)`、`ACADEMIC_BODY_STYLES` import（改 import `WRITING_BODY_FROM_UI`）。
- 替换计算：

```tsx
const body = WRITING_BODY_FROM_UI[writingUISize]
// 默认色跟主题走:报纸黑、学术暖米(spec A3)
const color = briefingTheme === 'newspaper' ? '#1a1a1a' : '#e8d5b7'
```

- 外层 div 的 style 里：`['--writing-body-size']: body.size`、`['--writing-body-weight']: body.weight`、`['--writing-tone-color']: color`（`--writing-ui-quote-size` 行不动）。

- [ ] **Step 5: 验证编译与既有测试**

Run: `npx tsc --noEmit` 与 `node scripts/e2e-changed.js`（仅列出受影响 spec，确认 writing 组被命中，不执行）
Expected: tsc 无新增错误；列表含 `writing-*.spec.ts`

- [ ] **Step 6: Commit**

```bash
git add src/components/writing/writing-editor.css src/components/writing/WritingEditor.tsx src/lib/briefing-font-size.ts src/components/writing/WritingBoard.tsx
git commit -m "feat(writing): 编辑器内容 CSS(标题阶梯/加粗/换行)+正文字号并入右上角档位+默认色跟主题"
```

---

### Task 3: 工具栏改造（标题下拉 + 颜色下拉）

**Files:**
- Modify: `src/components/writing/WritingEditor.tsx`（`.use(textColorPlugins)`）
- Modify: `src/components/writing/WritingToolbar.tsx`（删 A-/A+/🎨，加两个下拉）
- Modify: `src/store/index.ts`（删 `setWritingFontSize`/`setWritingTone` 及接口声明；字段与默认值保留）
- Test: `e2e/specs/writing-editor.spec.ts`（追加断言块；先看现有结构再加）

**Interfaces:**
- Consumes: Task 1 的 `textColorPlugins` / `textColorCommand` / `TEXT_COLOR_PALETTE`。
- Produces: testid `writing-toolbar-heading`、`writing-toolbar-color`、`writing-color-option`（`data-color` 属性）、`writing-heading-option`（`data-level` 属性）。

- [ ] **Step 1: WritingEditor.tsx 装配插件**

`.use(textColorPlugins)` 加在 `.use(clipboard)` 之后，并 import：

```ts
import { textColorPlugins } from '@/lib/milkdown-text-color'
```

- [ ] **Step 2: WritingToolbar.tsx 改造**

删除：font size 区段（`writing-toolbar-font-decrease`/`writing-toolbar-font-size`/`writing-toolbar-font-increase`）、tone 区段（`writing-toolbar-tone`/`writing-toolbar-tone-label`）、`FONT_SIZE_KEYS`、`TONE_LABELS`、`cycleFontSize`、`cycleTone`、相关 store 取值。

新增（放在分隔符后原 font size 位置）：

```tsx
import { useState } from 'react'
import { wrapInHeadingCommand } from '@milkdown/preset-commonmark'
import { textColorCommand, TEXT_COLOR_PALETTE } from '@/lib/milkdown-text-color'

// 组件内:
const [headingMenuOpen, setHeadingMenuOpen] = useState(false)
const [colorMenuOpen, setColorMenuOpen] = useState(false)

// 标题下拉:正文/H1/H2/H3。正文 = wrapInHeadingCommand payload 0(milkdown commonmark 约定;
// 若 spike 发现 0 不生效,降级为自定义 setBlockType paragraph 命令)。
<div className="relative">
  <button
    data-testid="writing-toolbar-heading"
    onClick={() => { setHeadingMenuOpen(v => !v); setColorMenuOpen(false) }}
    className="px-1.5 py-0.5 text-xs text-parchment/60 hover:text-parchment rounded hover:bg-parchment/10"
    title="标题级别"
  >
    H▾
  </button>
  {headingMenuOpen && (
    <div className="absolute top-full left-0 z-50 bg-ink border border-parchment/20 rounded shadow-lg py-1 text-xs min-w-[72px]">
      {[{ label: '正文', level: 0 }, { label: 'H1', level: 1 }, { label: 'H2', level: 2 }, { label: 'H3', level: 3 }].map(o => (
        <button
          key={o.label}
          data-testid="writing-heading-option"
          data-level={o.level}
          onClick={() => { setHeadingMenuOpen(false); exec(wrapInHeadingCommand, o.level) }}
          className="block w-full text-left px-3 py-1.5 hover:bg-parchment/10 text-parchment/80"
        >
          {o.label}
        </button>
      ))}
    </div>
  )}
</div>

// 颜色下拉:
<div className="relative">
  <button
    data-testid="writing-toolbar-color"
    onClick={() => { setColorMenuOpen(v => !v); setHeadingMenuOpen(false) }}
    className="px-1.5 py-0.5 text-xs text-parchment/60 hover:text-parchment rounded hover:bg-parchment/10"
    title="文字颜色"
  >
    A▾
  </button>
  {colorMenuOpen && (
    <div className="absolute top-full left-0 z-50 bg-ink border border-parchment/20 rounded shadow-lg py-1 text-xs min-w-[88px]">
      {TEXT_COLOR_PALETTE.map(c => (
        <button
          key={c.label}
          data-testid="writing-color-option"
          data-color={c.value ?? ''}
          onClick={() => { setColorMenuOpen(false); exec(textColorCommand.key, { color: c.value }) }}
          className="flex items-center gap-2 w-full text-left px-3 py-1.5 hover:bg-parchment/10 text-parchment/80"
        >
          <span className="inline-block w-3 h-3 rounded-full border border-parchment/30" style={{ background: c.value ?? 'transparent' }} />
          {c.label}
        </button>
      ))}
    </div>
  )}
</div>
```

注意 `exec` 现有签名 `(cmd, payload)` 走 `callCommand(cmd, payload)`，`textColorCommand.key` 作为 cmd 传入。菜单外点击关闭：沿用 WritingTree 的 document click 模式（两个 menu 各一个 useEffect，或包一层统一处理——取最小实现）。

- [ ] **Step 3: store 清理**

`src/store/index.ts`：删除接口声明 `setWritingFontSize`/`setWritingTone`（约 427-428 行）与实现（约 2181-2188 行）。**保留** `writingFontSize`/`writingTone` 字段、默认值、init 读取（旧 state.json 兼容）。grep 确认无其他引用：`grep -rn "setWritingFontSize\|setWritingTone" src e2e tests`。

- [ ] **Step 4: E2E 断言（追加到 `e2e/specs/writing-editor.spec.ts`，先看现有 POM/seed 再写）**

新增两个 test：
1. 「标题阶梯渲染」：seed 一篇含 `# 标题` 与正文的文章 → 打开 → 断言 `h1` computed font-size > `p` computed font-size，且 `h1` font-weight ≥ 600。
2. 「选中文字着色 round-trip」：新建文章 → 输入文字 → 全选 → 点 `writing-toolbar-color` → 点 `[data-color="#d97757"]` → Ctrl+S → reload → 重开该文 → 断言编辑器内存在 `span[style*="color"]` 且文字在；同时读磁盘 .md 断言含 `<span style="color:#d97757">`。
3. 顺带断言 testid `writing-toolbar-heading`、`writing-toolbar-color` 可见（UI 出口 §12）。

- [ ] **Step 5: 跑定向测试**

Run: `npx vitest run tests/text-color-mark.test.ts` 与 `npx playwright test --config e2e/playwright.config.ts writing-editor`
Expected: 全 PASS（`writing-editor.spec.ts` 里若有引用旧 A-/A+ 按钮 testid 的断言，一并改为新控件）

- [ ] **Step 6: Commit**

```bash
git add src/components/writing/ src/store/index.ts src/lib/milkdown-text-color.ts e2e/specs/writing-editor.spec.ts
git commit -m "feat(writing): 工具栏标题/颜色下拉,移除 A-/A+ 与色调循环按钮"
```

---

### Task 4: 回收站删除语义（红线落地）

**Files:**
- Modify: `electron/lib/writing-tree.ts`（新增 `trashNode`/`dissolveGroup`，隐藏名单加 `.trash`，删 `deleteNode`）
- Modify: `electron/ipc/writing.ts:64-70`（delete handler 改语义 + catalog 迁移）
- Test: `tests/writing-trash.test.ts`（新建）

**Interfaces:**
- Produces:
  - `trashNode(lib: string, rel: string): string` —— 移到 `<lib>/<root>/.trash/<原相对路径(去root前缀)>`，重名走 `uniqueName` `-HHMM` 后缀；返回新 rel 路径。
  - `dissolveGroup(lib: string, rel: string): { moved: { from: string; to: string }[]; trashed: string }` —— 组内非隐藏子项全部 `moveNode` 到父级，然后空壳目录（含遗留隐藏文件）进 `.trash`。
  - IPC `writing:delete` 返回结构改为 `WritingResult<{ moved: { from: string; to: string }[]; trashed: string }>`。
- Consumes: Task 5 用新返回结构渲染确认结果（不依赖字段，仅 fire）。

- [ ] **Step 1: 先查 deleteNode 引用面**

Run: `grep -rn "deleteNode" electron tests src e2e`
Expected: 记录所有引用，本任务全部改完（e2e helper 若直接用 `deleteNode` 清场，保留该 helper 调用时改为 `fs.rmSync` 直删或保留一个不被 IPC 使用的内部实现——实现者按引用实况选择最小改动）。

- [ ] **Step 2: 写失败测试 `tests/writing-trash.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createFile, createFolder, trashNode, dissolveGroup, scanRoot } from '../electron/lib/writing-tree'

let lib: string
beforeEach(() => {
  lib = fs.mkdtempSync(path.join(os.tmpdir(), 'wtrash-'))
  fs.mkdirSync(path.join(lib, 'writing'), { recursive: true })
})
afterEach(() => { fs.rmSync(lib, { recursive: true, force: true }) })

it('文件进 .trash 保留相对目录结构', () => {
  createFolder(lib, 'writing', '', '随笔')
  const rel = createFile(lib, 'writing', '随笔', 'a.md')
  const trashed = trashNode(lib, rel)
  expect(fs.existsSync(path.join(lib, rel))).toBe(false)
  expect(trashed).toBe(path.join('writing', '.trash', '随笔', 'a.md').replace(/\\/g, '/'))
  expect(fs.existsSync(path.join(lib, trashed))).toBe(true)
})

it('重名进 .trash 加 -HHMM 后缀不覆盖', () => {
  const a = createFile(lib, 'writing', '', 'a.md')
  trashNode(lib, a)
  const b = createFile(lib, 'writing', '', 'a.md')
  const t2 = trashNode(lib, b)
  expect(t2).not.toBe(path.join('writing', '.trash', 'a.md').replace(/\\/g, '/'))
  expect(fs.existsSync(path.join(lib, 'writing', '.trash', 'a.md'))).toBe(true)
  expect(fs.existsSync(path.join(lib, t2))).toBe(true)
})

it('解散分组:子项释放到父级,空壳进 .trash', () => {
  createFolder(lib, 'writing', '', '组A')
  const f1 = createFile(lib, 'writing', '组A', '一.md')
  const f2 = createFile(lib, 'writing', '组A', '二.md')
  const r = dissolveGroup(lib, 'writing/组A')
  expect(r.moved).toHaveLength(2)
  expect(fs.existsSync(path.join(lib, 'writing', '一.md'))).toBe(true)
  expect(fs.existsSync(path.join(lib, 'writing', '二.md'))).toBe(true)
  expect(fs.existsSync(path.join(lib, 'writing', '组A'))).toBe(false)
  expect(fs.existsSync(path.join(lib, r.trashed))).toBe(true)
  expect(f1).not.toBe(f2)
})

it('.trash 目录不出现在扫描树', () => {
  const rel = createFile(lib, 'writing', '', 'x.md')
  trashNode(lib, rel)
  const nodes = scanRoot(lib, 'writing')
  expect(nodes.some(n => n.name === '.trash')).toBe(false)
  expect(nodes).toHaveLength(0)
})
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npx vitest run tests/writing-trash.test.ts`
Expected: FAIL（trashNode/dissolveGroup 未导出）

- [ ] **Step 4: 实现 `electron/lib/writing-tree.ts`**

`HIDDEN_FILE_PATTERNS` 追加 `/^\.trash$/`。文件末尾（delete 区段）：

```ts
// ── trash(删除=移入回收站,红线:绝不真删用户文章) ─────────────

export function trashNode(lib: string, rel: string): string {
  const abs = assertInsideRoots(lib, rel)
  if (!fs.existsSync(abs)) {
    throw code('WRITING_NOT_FOUND', `Node not found: ${rel}`)
  }
  const root: WritingRoot = rel === 'writing' || rel.startsWith('writing/') ? 'writing' : 'repository'
  const underRoot = rel === root ? '' : rel.slice(root.length + 1)
  const sub = path.dirname(underRoot)
  const trashDir = path.join(lib, root, '.trash', sub === '.' ? '' : sub)
  createDir(trashDir)
  const safeName = uniqueName(trashDir, path.basename(abs))
  const absDest = path.join(trashDir, safeName)
  fs.renameSync(abs, absDest)
  return toRel(lib, absDest)
}

export function dissolveGroup(lib: string, rel: string): { moved: { from: string; to: string }[]; trashed: string } {
  const abs = assertInsideRoots(lib, rel)
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
    throw code('WRITING_NOT_FOUND', `Group not found: ${rel}`)
  }
  const parentRel = path.dirname(rel).replace(/\\/g, '/')
  const moved: { from: string; to: string }[] = []
  for (const child of fs.readdirSync(abs)) {
    if (isHidden(child)) continue
    const from = `${rel}/${child}`
    moved.push({ from, to: moveNode(lib, from, parentRel) })
  }
  const trashed = trashNode(lib, rel)
  return { moved, trashed }
}
```

删除 `deleteNode`（若 Step 1 发现 e2e helper 引用，保留导出但标注 `@deprecated 仅测试清场`，IPC 不再走它）。

- [ ] **Step 5: `electron/ipc/writing.ts` delete handler**

```ts
ipcMain.handle('writing:delete', async (_, a: { path: string }) => {
  const result = await wrapWriting(() => {
    const abs = tree.assertInsideRoots(lib, a.path)
    if (fs.statSync(abs).isDirectory()) return tree.dissolveGroup(lib, a.path)
    return { moved: [] as { from: string; to: string }[], trashed: tree.trashNode(lib, a.path) }
  })
  if (result.ok) {
    try {
      const root = rootFromPath(a.path)
      for (const m of result.value.moved) migrateEntry(lib, root, m.from, m.to)
      removeEntry(lib, root, a.path)
    } catch { /* silent */ }
  }
  return result
})
```

- [ ] **Step 6: 跑测试确认通过**

Run: `npx vitest run tests/writing-trash.test.ts tests/writing-catalog.test.ts`
Expected: PASS（catalog 旧测试此时尚未被 Task 7 改动，应仍绿）

- [ ] **Step 7: Commit**

```bash
git add electron/lib/writing-tree.ts electron/ipc/writing.ts tests/writing-trash.test.ts
git commit -m "feat(writing): 删除改回收站语义——文件进 .trash,分组解散释放子项"
```

---

### Task 5: 树行内按钮 + 确认对话框 + 移除悬停摘要

**Files:**
- Modify: `src/components/writing/WritingTree.tsx`
- Test: `e2e/specs/`（追加到既有 writing tree 相关 spec；先 `ls e2e/specs | grep writing` 确认承载文件，优先复用现有 spec）

**Interfaces:**
- Consumes: Task 4 的 `writing:delete` 新语义（UI 只 fire + reload）。
- Produces: testid `writing-node-delete`、`writing-node-create`（均带 `data-path` 属性）。

- [ ] **Step 1: 移除悬停摘要**

删除 `WritingTree.tsx` 中 `hovered` state、`onMouseEnter/onMouseLeave`、以及 152-173 行的摘要渲染块（含 `node.summary`/`catalogUpdatedAt` 引用）。行内容区回到单行 truncate。

- [ ] **Step 2: 行内悬停按钮**

行容器 div 加 `group` class。在 `<div className="min-w-0 flex-1">…</div>` 之后插入：

```tsx
<div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
  {isDir && (
    <button
      data-testid="writing-node-create"
      data-path={node.path}
      title="在此分组新建文章"
      className={`px-1 text-xs ${isAcademic ? 'text-parchment/50 hover:text-ember' : 'text-[#6b5d52] hover:text-[#8a3a3a]'}`}
      onClick={(e) => { e.stopPropagation(); doNewFile() }}
    >
      ＋
    </button>
  )}
  <button
    data-testid="writing-node-delete"
    data-path={node.path}
    title={isDir ? '解散分组' : '删除文章'}
    className={`px-1 text-xs ${isAcademic ? 'text-parchment/50 hover:text-red-400' : 'text-[#6b5d52] hover:text-red-600'}`}
    onClick={(e) => { e.stopPropagation(); setConfirmingDelete(true) }}
  >
    🗑
  </button>
</div>
```

- [ ] **Step 3: 确认对话框按类型分文案**

`ConfirmDialog` 的 children 与 title 改为：

```tsx
title={isDir ? '解散分组' : '删除'}
// children:
isDir ? (
  <p>确定解散分组「{node.name}」？组内 {countFiles(node.children)} 篇文章将移回上一级，不会被删除。</p>
) : (
  <p>确定删除《{node.name}》？文件将移入回收站（.trash/），可手动恢复。</p>
)
```

（`countFiles` 从 `@/lib/writing-tree-utils` import。）onConfirm 逻辑不变（`ipc.writingDelete` + `loadWritingTree`）。右键菜单「删除」文案同步改为「解散分组/删除」（动态）。

- [ ] **Step 4: E2E 断言**

在承载 spec 追加：
1. 「悬停显示行内按钮」：hover 文章行 → `writing-node-delete` 可见；分组行 → 两个按钮可见。
2. 「删除文章进回收站」：点 🗑 → 确认对话框文案含「回收站」→ 确认 → 树中消失 → 磁盘断言 `<lib>/writing/.trash/` 下存在该文件（seed 的文件原名）。
3. 「解散分组释放文章」：seed 分组含 2 文 → 🗑 → 文案含「移回上一级」→ 确认 → 两文出现在根级、磁盘文件仍在。
4. 「＋ 在分组内新建」：点分组行 ＋ → PromptDialog 输入名称 → 新文章出现在该分组下。
（seed/POM 复用现有 writing spec 的 helper；导航到写作页的入口动作照抄同文件既有用例。）

- [ ] **Step 5: 跑定向测试**

Run: `npx playwright test --config e2e/playwright.config.ts <承载spec文件名去掉.ts>`（如 `writing-tree`）
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/writing/WritingTree.tsx e2e/specs/
git commit -m "feat(writing): 行内悬停 ＋/🗑 按钮+分类型确认文案,移除悬停摘要展开"
```

---

### Task 6: 拖拽统一协议（拖入/拖出/排序/换组）

**Files:**
- Modify: `src/lib/writing-tree-utils.ts`（新增 `childrenPathsOf`）
- Modify: `src/store/index.ts`（新增 `moveWritingNode` action + 接口声明）
- Modify: `src/components/writing/WritingTree.tsx`（落点协议 + 根级末尾落点 + 右键「移出分组」）
- Test: `e2e/specs/`（承载 spec 同 Task 5；拖拽用 Playwright `dispatchEvent` 手工 drag 序列——先看该 spec 是否已有拖拽用例可复用模式）

**Interfaces:**
- Produces:
  - `childrenPathsOf(tree: { writing: WritingTreeNode[]; repository: WritingTreeNode[] } | null, dirPath: string, order?: string[]): string[] | null` —— dirPath 为 `'writing'`/`'repository'` 时取根数组；按 `order` 排序后返回 path 列表。
  - store `moveWritingNode: (args: { src: string; targetDir: string; index: number | null }) => Promise<void>` —— move → reload → 若 index 非 null 则把新路径写入 `writingOrder[targetDir]` 的 index 处并 patchState。`index: null` = 追加末尾不写 order。
  - testid `writing-drop-line`（根级末尾落点横线）。
- Consumes: 无新增 IPC（复用 `writingMove`）。

- [ ] **Step 1: `writing-tree-utils.ts` 追加**

```ts
/** 取 dirPath 直接子节点的 path 列表(按 order 排序)。根级传 'writing'/'repository'。 */
export function childrenPathsOf(
  tree: { writing: WritingTreeNode[]; repository: WritingTreeNode[] } | null,
  dirPath: string,
  order?: string[],
): string[] | null {
  if (!tree) return null
  let children: WritingTreeNode[] | null = null
  if (dirPath === 'writing') children = tree.writing
  else if (dirPath === 'repository') children = tree.repository
  else {
    const walk = (nodes: WritingTreeNode[]): WritingTreeNode[] | null => {
      for (const n of nodes) {
        if (n.path === dirPath) return n.children ?? []
        if (n.children) { const r = walk(n.children); if (r) return r }
      }
      return null
    }
    children = walk(tree.writing) ?? walk(tree.repository)
  }
  if (!children) return null
  return sortNodesByOrder(children, order).map(n => n.path)
}
```

- [ ] **Step 2: store 新增 action（接口 + 实现，紧挨 `reorderWritingSibling`）**

```ts
moveWritingNode: async ({ src, targetDir, index }) => {
  const r = await ipc.writingMove({ path: src, targetDir })
  if (!r.ok) { set({ writingError: r.message }); return }
  await get().loadWritingTree()
  if (index === null) return
  const siblings = childrenPathsOf(get().writingTree, targetDir, get().writingOrder[targetDir])
  if (!siblings) return
  const without = siblings.filter(p => p !== r.value.path)
  const clamped = Math.max(0, Math.min(index, without.length))
  const next = [...without.slice(0, clamped), r.value.path, ...without.slice(clamped)]
  const writingOrder = { ...get().writingOrder, [targetDir]: next }
  set({ writingOrder })
  ipc.patchState({ writingOrder } as Partial<StateJson>)
},
```

import `childrenPathsOf`。接口声明同步加（约 437 行 `reorderWritingSibling` 旁）。

- [ ] **Step 3: WritingTree.tsx 落点协议**

TreeNode 的 `onDragOver` 改为（`dragOver` = 入组高亮，`dropPos` = 横线，互斥）：

```ts
onDragOver={(e) => {
  e.preventDefault()
  const rect = e.currentTarget.getBoundingClientRect()
  const r = (e.clientY - rect.top) / rect.height
  if (isDir && r > 0.25 && r < 0.75) { setDragOver(true); setDropPos(null); return }
  setDragOver(false)
  setDropPos(r < 0.5 ? 'before' : 'after')
}}
```

`onDrop` 改为统一入口：

```ts
onDrop={async (e) => {
  e.preventDefault()
  const src = e.dataTransfer.getData('text/writing-path')
  const into = dragOver && isDir && !dropPos
  setDragOver(false); setDropPos(null)
  if (!src || src === node.path) return
  if (into) {
    await moveWritingNode({ src, targetDir: node.path, index: null })
    return
  }
  // 横线落点:同父 = 纯排序;跨父 = move + 定位
  const srcParent = src.includes('/') ? src.slice(0, src.lastIndexOf('/')) : root
  if (srcParent === parentDir) {
    reorderWritingSibling({ dir: parentDir, src, target: node.path, position: dropPos ?? 'after', siblings: siblingPaths })
  } else {
    const base = siblingPaths.filter(p => p !== src)
    const idx = base.indexOf(node.path)
    if (idx === -1) return
    await moveWritingNode({ src, targetDir: parentDir, index: dropPos === 'before' ? idx : idx + 1 })
  }
}}
```

注意防呆：拖动分组到自己的子分组横线上 = 移入自己——`moveNode` 主进程会拒绝（same dir 校验管不到祖父级）。加一行：若 `node.path.startsWith(src + '/')` 直接 return（禁止拖到自己后代里）。`moveWritingNode`/`reorderWritingSibling` 从 store 取出（组件顶部已有 useStore 模式）。

分组排序由此自动获得：dir 行边缘横线 → `reorderWritingSibling`/`moveWritingNode` 写 `writingOrder[parentDir]`，`sortNodesByOrder` 本就 path 泛型。

- [ ] **Step 4: 根级末尾落点（WritingTree 组件）**

```tsx
const [endDrop, setEndDrop] = useState(false)
const moveWritingNode = useStore(s => s.moveWritingNode)
// 外层:
<div
  className="py-1 min-h-[120px]"
  onDragOver={(e) => {
    if (e.target !== e.currentTarget) return
    e.preventDefault()
    setEndDrop(true)
  }}
  onDragLeave={(e) => { if (e.target === e.currentTarget) setEndDrop(false) }}
  onDrop={async (e) => {
    if (e.target !== e.currentTarget) return
    e.preventDefault()
    setEndDrop(false)
    const src = e.dataTransfer.getData('text/writing-path')
    if (!src) return
    const srcParent = src.includes('/') ? src.slice(0, src.lastIndexOf('/')) : root
    if (srcParent === root) return // 已在根级,纯末尾排序意义低,忽略
    await moveWritingNode({ src, targetDir: root, index: null })
  }}
>
  {sorted.map(...)}
  {endDrop && <div data-testid="writing-drop-line" className="mx-2 border-t-2 border-ember" />}
</div>
```

（`min-h-[120px]` 保证树短时也有留白落点。）

- [ ] **Step 5: 右键菜单「移出分组」**

TreeNode context menu 在「重命名」前插入（仅 `parentDir !== root` 时渲染）：

```tsx
{parentDir !== root && (
  <button
    className="block w-full text-left px-3 py-1.5 hover:bg-parchment/10 text-parchment/80"
    onClick={() => { closeMenu(); void moveWritingNode({ src: node.path, targetDir: root, index: null }) }}
  >
    移出分组
  </button>
)}
```

- [ ] **Step 6: E2E 断言**

1. 「组内文件拖到根级末尾」：seed 分组含 1 文 + 根级 1 文 → 拖文件到树底部留白 → 断言文件出现在根级、磁盘从组目录移到 `writing/`。
2. 「分组排序」：seed 两个分组 → 拖组B 到组A 上边缘横线 → 断言顺序交换且 reload 后保持（`writingOrder` 持久化）。
3. 「移出分组菜单」：右键组内文件 → 移出分组 → 到根级。
拖拽模拟参考现有 spec 是否已有 `dragstart/dragover/drop` dispatch 模式；没有则用 `locator.dispatchEvent('dragstart', { dataTransfer })` 标准三事件序列（Playwright 需手工构造 DataTransfer，见 `e2e/` 现有范例或 `page.evaluateHandle(() => new DataTransfer())`）。

- [ ] **Step 7: 跑定向测试**

Run: `npx playwright test --config e2e/playwright.config.ts <承载spec>` 与 `node scripts/e2e-changed.js`
Expected: PASS；受影响 spec 清单无孤儿 WARNING 之外的意外

- [ ] **Step 8: Commit**

```bash
git add src/lib/writing-tree-utils.ts src/store/index.ts src/components/writing/WritingTree.tsx e2e/specs/
git commit -m "feat(writing): 拖拽统一协议——横线=排序(缩进=层级),整行高亮=入组,根级末尾可拖出"
```

---

### Task 7: 摘要时机收敛（diff 触发 + mtime 版本）

**Files:**
- Modify: `src/types/index.ts:518`（`WritingCatalogEntry` 加 `mtimeMs`）+ IpcApi 追加 `writingRefreshCatalog`
- Modify: `electron/lib/writing-catalog.ts`（`diffPending` → `diffStale`，mtime 比较）
- Modify: `electron/lib/writing-tree.ts:111-120`（停止把 summary 附到树节点）
- Modify: `electron/ipc/writing.ts`（砍 `writing:write`/`writing:importFiles` 的生成逻辑；新增 `writing:refreshCatalog`）
- Modify: `electron/preload.ts:174-183`、`src/lib/ipc.ts:112-121`（追加 facade）
- Modify: `src/store/index.ts:1253-1256`（`setBriefingSource` 挂钩）
- Test: `tests/writing-catalog.test.ts`（改写 diff 用例）、`e2e/specs/writing-catalog.spec.ts`（按新时机重写）

**Interfaces:**
- Produces:
  - `WritingCatalogEntry = { title: string; summary: string; updatedAt?: string; mtimeMs?: number }`（旧字段可选保留，向后兼容）。
  - `diffStale(lib: string, root: WritingRoot): string[]` —— 无条目、条目无 `mtimeMs`（旧格式）、或文件 mtime > `mtimeMs` 的 .md 全量返回。
  - `writingRefreshCatalog: () => Promise<WritingResult<{ refreshed: number }>>`（fire-and-forget 调用，不等生成完）。
- Consumes: 无（与轨道 A/B/C 仅 types 追加相交）。

- [ ] **Step 1: 改写 `tests/writing-catalog.test.ts` diff 用例**

```ts
it('diffStale:无条目/mtime 更新/旧格式条目都算待更新', () => {
  const aPath = createFile(lib, 'writing', '', 'a.md')
  const bPath = createFile(lib, 'writing', '', 'b.md')
  const cPath = createFile(lib, 'writing', '', 'c.md')
  const aMtime = fs.statSync(path.join(lib, aPath)).mtimeMs
  updateEntry(lib, 'writing', aPath, { title: 'A', summary: 'A', mtimeMs: aMtime })
  updateEntry(lib, 'writing', bPath, { title: 'B', summary: 'B', updatedAt: '2026-07-20' }) // 旧格式
  const stale = diffStale(lib, 'writing')
  expect(stale).not.toContain(aPath)
  expect(stale).toContain(bPath)
  expect(stale).toContain(cPath)
  // a 内容变动(mtime 变大)后重新入列
  const future = aMtime + 100000
  fs.utimesSync(path.join(lib, aPath), new Date(), new Date(future))
  expect(diffStale(lib, 'writing')).toContain(aPath)
})
```

旧「diffPending 找出缺条目的文件」用例删除（函数改名换语义）。import 同步改。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/writing-catalog.test.ts`
Expected: FAIL（diffStale 未导出）

- [ ] **Step 3: `electron/lib/writing-catalog.ts`**

`diffPending` 替换为：

```ts
export function diffStale(lib: string, root: WritingRoot): string[] {
  const files = collectMdPaths(scanRoot(lib, root))
  const c = loadCatalog(lib, root)
  return files.filter(f => {
    const entry = c.entries[f]
    if (!entry || entry.mtimeMs == null) return true
    try {
      return fs.statSync(path.join(lib, f)).mtimeMs > entry.mtimeMs
    } catch { return true }
  })
}
```

- [ ] **Step 4: `src/types/index.ts`**

```ts
export type WritingCatalogEntry = { title: string; summary: string; updatedAt?: string; mtimeMs?: number }
```

IpcApi 追加（writingDelete 旁）：

```ts
writingRefreshCatalog: () => Promise<WritingResult<{ refreshed: number }>>
```

- [ ] **Step 5: `electron/ipc/writing.ts`**

- `writing:write`：删去 `updateEntry` 占位与 setTimeout 生成块（保存不动 catalog——否则 diff 看不到变动）。
- `writing:importFiles`：删去 setTimeout 生成块。
- 新增 handler：

```ts
ipcMain.handle('writing:refreshCatalog', () =>
  wrapWriting(async () => {
    const roots: WritingRoot[] = ['writing', 'repository']
    const pending = roots.flatMap(root => diffStale(lib, root))
    // fire-and-forget:逐篇后台生成,调用方不阻塞
    setTimeout(async () => {
      for (const rel of pending) {
        const root = rootFromPath(rel)
        try {
          const { body } = tree.readWritingFile(lib, rel)
          const mtimeMs = fs.statSync(path.join(lib, rel)).mtimeMs
          const summary = process.env.NODE_ENV === 'test' && !!process.env.E2E_CONFIG_DIR
            ? 'E2E 摘要'
            : await generateWritingSummary(cfg, path.basename(rel, '.md'), body)
          if (summary) updateEntry(lib, root, rel, { title: path.basename(rel, '.md'), summary, mtimeMs })
        } catch { /* silent — 下次进入再补 */ }
      }
    }, 0)
    return { refreshed: pending.length }
  }))
```

import `diffStale`。

- [ ] **Step 6: preload + facade**

`electron/preload.ts` writing 区块追加：
`writingRefreshCatalog: () => ipcRenderer.invoke('writing:refreshCatalog'),`
`src/lib/ipc.ts` 追加：
`get writingRefreshCatalog() { return ensure().writingRefreshCatalog },`

- [ ] **Step 7: store 挂钩**

`setBriefingSource`（1253-1256）：

```ts
setBriefingSource: async (source) => {
  set({ briefingSource: source })
  await ipc.patchState({ briefingSource: source } as Partial<StateJson>)
  if (source === 'writing') void ipc.writingRefreshCatalog() // 摘要唯一生成时机(spec C)
},
```

- [ ] **Step 8: `electron/lib/writing-tree.ts` 停止附摘要**

删除 scanDir 里 `const catEntry = …` 到 `node.catalogUpdatedAt = …` 的 6 行（114-119）及不再使用的 `loadCatalog` import、scanDir 的 catalog 参数链（`effectiveCatalog`/`root` 参数若因此闲置一并清理——注意 scanRoot 递归签名同步收敛，保持 surgical）。`WritingTreeNode` 类型的 `summary?`/`catalogUpdatedAt?` 字段保留（标 deprecated 注释），避免级联改 e2e helper。

- [ ] **Step 9: E2E 重写 `e2e/specs/writing-catalog.spec.ts`**

- 「保存触发 catalog 更新」用例改为：「进入写作来源触发 diff 生成」——seed 1 篇新文章（无 catalog 条目）→ 从其他来源点击「写作」来源按钮 → 轮询断言 `<lib>/writing/.catalog.json` 出现该文条目且 summary 为 `E2E 摘要`、含 `mtimeMs`。
- 新增「保存不再立即生成」：编辑保存后短窗口内断言 catalog 无新条目（或条目 summary 未被刷新）。
- 「seeded .catalog.json 可正常读取」等存量用例保留；引用 `summary` 上树的断言（如有）删除。
- 同时检查 `e2e/specs/writing-editor.spec.ts:360` 附近的 catalog 断言，按新时机修正（保存后不再立即有条目）。

- [ ] **Step 10: 跑定向测试**

Run: `npx vitest run tests/writing-catalog.test.ts tests/writing-trash.test.ts` 与 `npx playwright test --config e2e/playwright.config.ts writing-catalog`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add src/types/index.ts electron/lib/writing-catalog.ts electron/lib/writing-tree.ts electron/ipc/writing.ts electron/preload.ts src/lib/ipc.ts src/store/index.ts tests/writing-catalog.test.ts e2e/specs/writing-catalog.spec.ts e2e/specs/writing-editor.spec.ts
git commit -m "feat(writing): 摘要时机收敛为进入写作来源 diff 触发,mtime 版本化,保存不再生成"
```

---

### Task 8: 收尾（source-map + 定向回归 + 回检）

**Files:**
- Modify: `e2e/source-map.json`（仅当新增 spec 文件未被 `writing-*.spec.ts` glob 覆盖时）
- Modify: `e2e/README.md`（若目录/策略声明有变）

- [ ] **Step 1: source-map 检查**

Run: `node scripts/e2e-changed.js`
Expected: 无孤儿 spec WARNING；若新增 spec（如新建了 `writing-tree.spec.ts`）出现 WARNING，按 e2e §10 登记到 writing group。

- [ ] **Step 2: 受影响面全量定向跑**

Run: `node scripts/e2e-changed.js --run`
Expected: writing 组 + `startup-health` 全 PASS。 flaky 失败先查根因再重跑，禁止 skip（e2e §1c）。

- [ ] **Step 3: 受影响单元测试连跑**

Run: `npx vitest run tests/text-color-mark.test.ts tests/writing-catalog.test.ts tests/writing-trash.test.ts`
Expected: PASS

- [ ] **Step 4: spec 回检**

对照 `docs/superpowers/specs/2026-08-08-writing-ux-fixes-design.md` 验收清单逐项核对：7 个问题各有落地、红线未破（`.trash` 可回溯）、UI 出口 testid 均有 E2E 断言、旧 `writingFontSize`/`writingTone` state 兼容未破。发现 spec 与实现偏差时改文档或改代码，二者必须一致。

- [ ] **Step 5: Commit（如有改动）**

```bash
git add e2e/source-map.json e2e/README.md docs/superpowers/specs/2026-08-08-writing-ux-fixes-design.md
git commit -m "chore(e2e): writing UX 迭代 source-map 同步与 spec 回检"
```

---

## Self-Review 记录

- **Spec 覆盖**：A1→Task2；A2→Task2/3；A3→Task1/2/3；A4→Task2 CSS `overflow-wrap`（E2E 断言在 Task 3 Step 4-2 的长行换行隐含覆盖，验收时肉眼确认）；B1→Task6；B2→Task5；B3→Task4/5；C→Task7。UI 出口声明→Task3/5/6 各自 E2E 断言。
- **类型一致性**：`textColorCommand.key`（Task1 产出）= Task3 调用名；`childrenPathsOf`/`moveWritingNode`（Task6 内部）一致；`diffStale`（Task7）测试与实现同名；`WritingResult<{moved,trashed}>` Task4 定义、Task5 不强依赖字段（仅 fire+reload），无耦合风险。
- **风险点**：Task 1 的 Milkdown stringify 扩展拾取（已声明降级路径）；Task 6 拖拽 E2E 的 DataTransfer 构造模式以现有 spec 范例为准。
