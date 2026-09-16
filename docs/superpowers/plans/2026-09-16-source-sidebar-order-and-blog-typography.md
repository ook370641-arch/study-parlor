# 来源边栏拖拽排序 + 博客阅读排版优化 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 简报页「来源」边栏五项导航支持拖拽排序并持久化；博客/拾贝阅读器排版对标 anthropic.com 实测参数（标题层级、列表间距、图注、代码块、链接、术语点睛），列宽保持现状。

**Architecture:** 功能 A 走 types → store → 组件三层（复用现有 patchState 通道，无新 IPC）；功能 B 全部限定在 briefing 渲染链路（`briefingComponents` + `.briefing-body-*` CSS 作用域 + 一个 prop 门控的 rehype 插件），学习报告/对话/寓言渲染零影响。

**Tech Stack:** React 18 + Zustand + react-markdown (hast/rehype) + Vitest(jsdom + @testing-library/react) + Playwright E2E。

**Spec:** `docs/superpowers/specs/2026-09-16-source-sidebar-order-and-blog-typography-design.md`

## Global Constraints

- **测试纪律**：只跑定向测试——改测试文件 → `npx vitest run tests/<file>`；E2E 前必须先 `npx electron-vite build`（E2E 跑 `out/` 产物）。禁止 `npx vitest run` 全量、禁止 `npm run test:e2e` 全量。
- **组件文件只导出组件**（ui-styling §10）：helper/常量/插件放 `src/lib/` 或 `src/components/md/` 的非组件文件。
- **琥珀点睛**：`#d97757` 只用于术语、插入线、hover 等点睛位；不大面积铺色。
- **双主题**：所有 CSS 改动必须同时给 `.briefing-body-academic` 和 `.briefing-body-newspaper` 两条规则。
- **向后兼容**：`briefingSourceOrder` 为可选字段，不进 `electron/ipc/state.ts` 的 `DEFAULT`（沿用 `briefingTheme` 等可选 UI 字段先例），归一化只在 store init 做。
- **持久化链路**：新字段按 types → store init → action → patchState 顺序（ipc-state §1/§3）。
- 列宽不动（用户已否决收窄方案）；导入管线不动。

---

### Task 1: BriefingSourceId 类型 + 顺序归一化 helper + store 接线

**Files:**
- Modify: `src/types/index.ts:633`（及内联联合处）
- Create: `src/lib/briefing-source-order.ts`
- Modify: `src/store/index.ts`（接口区 ~line 152/160；初始状态 ~line 600；init ~line 681；action 追加在 `setBriefingSource` 附近 ~line 1371 后）
- Test: `tests/briefing-source-order.test.ts`

**Interfaces:**
- Produces:
  - `type BriefingSourceId = 'writing' | 'digest' | 'anthropic' | 'job-briefing' | 'scout'`（from `@shared/index`）
  - `DEFAULT_BRIEFING_SOURCE_ORDER: BriefingSourceId[]`（from `@/lib/briefing-source-order`）
  - `normalizeBriefingSourceOrder(raw: unknown): BriefingSourceId[]`
  - store: `briefingSourceOrder: BriefingSourceId[]`、`setBriefingSourceOrder(order: BriefingSourceId[]): Promise<void>`
- Consumes: 无（首个任务）

- [ ] **Step 1: 写失败测试**

Create `tests/briefing-source-order.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_BRIEFING_SOURCE_ORDER, normalizeBriefingSourceOrder } from '@/lib/briefing-source-order'

describe('normalizeBriefingSourceOrder', () => {
  it('returns default order when raw is undefined', () => {
    expect(normalizeBriefingSourceOrder(undefined)).toEqual(['writing', 'digest', 'anthropic', 'job-briefing', 'scout'])
  })

  it('returns default order when raw is not an array', () => {
    expect(normalizeBriefingSourceOrder('anthropic')).toEqual(DEFAULT_BRIEFING_SOURCE_ORDER)
    expect(normalizeBriefingSourceOrder(null)).toEqual(DEFAULT_BRIEFING_SOURCE_ORDER)
  })

  it('preserves user order', () => {
    expect(normalizeBriefingSourceOrder(['anthropic', 'writing', 'digest', 'job-briefing', 'scout']))
      .toEqual(['anthropic', 'writing', 'digest', 'job-briefing', 'scout'])
  })

  it('filters unknown ids', () => {
    expect(normalizeBriefingSourceOrder(['anthropic', 'nope', 'writing', 'digest', 'job-briefing', 'scout']))
      .toEqual(['anthropic', 'writing', 'digest', 'job-briefing', 'scout'])
  })

  it('appends missing ids at the end (future new source)', () => {
    expect(normalizeBriefingSourceOrder(['anthropic', 'writing']))
      .toEqual(['anthropic', 'writing', 'digest', 'job-briefing', 'scout'])
  })

  it('dedupes repeated ids keeping first occurrence', () => {
    expect(normalizeBriefingSourceOrder(['anthropic', 'anthropic', 'writing', 'digest', 'job-briefing', 'scout']))
      .toEqual(['anthropic', 'writing', 'digest', 'job-briefing', 'scout'])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/briefing-source-order.test.ts`
Expected: FAIL — `Cannot find module '@/lib/briefing-source-order'`

- [ ] **Step 3: 实现类型 + helper + store 接线**

`src/types/index.ts`：在 `StateJson` 之前（约 line 616 附近）新增命名类型，并替换三处内联联合：

```ts
export type BriefingSourceId = 'writing' | 'digest' | 'anthropic' | 'job-briefing' | 'scout'
```

- line 633: `briefingSource?: 'digest' | 'anthropic' | 'job-briefing' | 'writing' | 'scout'` → `briefingSource?: BriefingSourceId`，并在其下新增 `briefingSourceOrder?: BriefingSourceId[]`
- `src/store/index.ts:152`: `briefingSource: 'digest' | 'anthropic' | 'job-briefing' | 'writing' | 'scout'` → `briefingSource: BriefingSourceId`，下方加 `briefingSourceOrder: BriefingSourceId[]`
- `src/store/index.ts:160`: setBriefingSource 参数类型同样换成 `BriefingSourceId`，下方加 `setBriefingSourceOrder: (order: BriefingSourceId[]) => Promise<void>`
- 确认 store 文件顶部从 `@shared/index` 的 import 里加入 `BriefingSourceId`（按现有 import 列表字母/分组位置插入）

Create `src/lib/briefing-source-order.ts`:

```ts
import type { BriefingSourceId } from '@shared/index'

export const DEFAULT_BRIEFING_SOURCE_ORDER: BriefingSourceId[] = [
  'writing',
  'digest',
  'anthropic',
  'job-briefing',
  'scout',
]

const VALID = new Set<string>(DEFAULT_BRIEFING_SOURCE_ORDER)

/**
 * 归一化持久化的来源顺序：
 * - 缺省/非数组 → 默认顺序（老 state.json 无此字段）
 * - 过滤未知 id；去重（保留首次出现）
 * - 追加遗漏的已知 id（未来新增来源时旧状态自动兼容）
 */
export function normalizeBriefingSourceOrder(raw: unknown): BriefingSourceId[] {
  if (!Array.isArray(raw)) return [...DEFAULT_BRIEFING_SOURCE_ORDER]
  const seen = new Set<string>()
  const picked: BriefingSourceId[] = []
  for (const item of raw) {
    if (typeof item !== 'string' || !VALID.has(item) || seen.has(item)) continue
    seen.add(item)
    picked.push(item as BriefingSourceId)
  }
  for (const id of DEFAULT_BRIEFING_SOURCE_ORDER) {
    if (!seen.has(id)) picked.push(id)
  }
  return picked
}
```

`src/store/index.ts`：

1. import 区加 `import { DEFAULT_BRIEFING_SOURCE_ORDER, normalizeBriefingSourceOrder } from '@/lib/briefing-source-order'`
2. 初始状态对象（`briefingSource: 'digest',` 附近，~line 600）加 `briefingSourceOrder: DEFAULT_BRIEFING_SOURCE_ORDER,`
3. `init()` 的 set 对象里（`briefingSource: state.briefingSource === ...` 行之后，~line 681）加：

```ts
      briefingSourceOrder: normalizeBriefingSourceOrder(state.briefingSourceOrder),
```

4. `setBriefingSource` action（~line 1365-1372）之后追加：

```ts
  setBriefingSourceOrder: async (order) => {
    set({ briefingSourceOrder: order })
    await ipc.patchState({ briefingSourceOrder: order } as Partial<StateJson>)
  },
```

- [ ] **Step 4: 跑测试确认通过 + 类型检查**

Run: `npx vitest run tests/briefing-source-order.test.ts`
Expected: PASS (6 tests)

Run: `npx tsc --noEmit`
Expected: clean

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/lib/briefing-source-order.ts src/store/index.ts tests/briefing-source-order.test.ts
git commit -m "feat(briefing): 来源顺序持久化字段 + 归一化（拖拽排序前置）"
```

---

### Task 2: 边栏拖拽排序交互

**Files:**
- Modify: `src/components/BriefingSourceSidebar.tsx`
- Test: `tests/briefing-sidebar.test.tsx`（追加 describe 块）

**Interfaces:**
- Consumes: store `briefingSourceOrder: BriefingSourceId[]`、`setBriefingSourceOrder(order): Promise<void>`（Task 1）；`BriefingSourceId`（from `@shared/index`）
- Produces: 无新导出（组件内部交互）

- [ ] **Step 1: 写失败测试**

在 `tests/briefing-sidebar.test.tsx` 末尾追加（文件顶部已有 `vi.mock('@/lib/ipc')`，其中 `patchState: vi.fn()` 已存在，直接可用）：

```tsx
describe('BriefingSourceSidebar 拖拽排序', () => {
  beforeEach(() => {
    cleanup()
    vi.mocked(ipc.patchState).mockClear()
    useStore.setState({
      briefingSource: 'digest',
      briefingSourceOrder: ['writing', 'digest', 'anthropic', 'job-briefing', 'scout'],
    })
  })

  function stubRect(el: HTMLElement, top: number, height: number) {
    el.getBoundingClientRect = () =>
      ({ top, height, bottom: top + height, left: 0, right: 160, width: 160, x: 0, y: top, toJSON: () => ({}) }) as DOMRect
  }

  it('renders nav items in store order', () => {
    useStore.setState({ briefingSourceOrder: ['anthropic', 'writing', 'digest', 'job-briefing', 'scout'] })
    render(<BriefingSourceSidebar theme="academic" collapsed={false} onToggle={() => {}} />)
    const buttons = screen.getAllByRole('button').filter((b) => b.dataset.testid?.startsWith('briefing-source-'))
    expect(buttons[0].dataset.testid).toBe('briefing-source-anthropic')
  })

  it('drop before target reorders and persists', () => {
    render(<BriefingSourceSidebar theme="academic" collapsed={false} onToggle={() => {}} />)
    const writing = screen.getByTestId('briefing-source-writing')
    const anthropic = screen.getByTestId('briefing-source-anthropic')
    stubRect(writing, 0, 32)
    const dt = { setData: vi.fn(), effectAllowed: '' }
    fireEvent.dragStart(anthropic, { dataTransfer: dt })
    fireEvent.dragOver(writing, { dataTransfer: dt, clientY: 4 }) // 上半 → before
    fireEvent.drop(writing, { dataTransfer: dt, clientY: 4 })
    expect(useStore.getState().briefingSourceOrder).toEqual(['anthropic', 'writing', 'digest', 'job-briefing', 'scout'])
    expect(vi.mocked(ipc.patchState)).toHaveBeenCalledWith(
      expect.objectContaining({ briefingSourceOrder: ['anthropic', 'writing', 'digest', 'job-briefing', 'scout'] })
    )
  })

  it('drop after target inserts after', () => {
    render(<BriefingSourceSidebar theme="academic" collapsed={false} onToggle={() => {}} />)
    const writing = screen.getByTestId('briefing-source-writing')
    const digest = screen.getByTestId('briefing-source-digest')
    stubRect(digest, 32, 32)
    const dt = { setData: vi.fn(), effectAllowed: '' }
    fireEvent.dragStart(writing, { dataTransfer: dt })
    fireEvent.dragOver(digest, { dataTransfer: dt, clientY: 32 + 28 }) // 下半 → after
    fireEvent.drop(digest, { dataTransfer: dt, clientY: 32 + 28 })
    expect(useStore.getState().briefingSourceOrder).toEqual(['digest', 'writing', 'anthropic', 'job-briefing', 'scout'])
  })

  it('drop onto itself is a no-op', () => {
    render(<BriefingSourceSidebar theme="academic" collapsed={false} onToggle={() => {}} />)
    const digest = screen.getByTestId('briefing-source-digest')
    stubRect(digest, 32, 32)
    const dt = { setData: vi.fn(), effectAllowed: '' }
    fireEvent.dragStart(digest, { dataTransfer: dt })
    fireEvent.dragOver(digest, { dataTransfer: dt, clientY: 32 + 4 })
    fireEvent.drop(digest, { dataTransfer: dt, clientY: 32 + 4 })
    expect(useStore.getState().briefingSourceOrder).toEqual(['writing', 'digest', 'anthropic', 'job-briefing', 'scout'])
    expect(vi.mocked(ipc.patchState)).not.toHaveBeenCalled()
  })

  it('collapsed mode disables dragging', () => {
    render(<BriefingSourceSidebar theme="academic" collapsed={true} onToggle={() => {}} />)
    expect(screen.getByTestId('briefing-source-anthropic')).not.toHaveAttribute('draggable', 'true')
  })
})
```

注意：文件顶部 `import { ipc }` 若不存在需补 `import { ipc } from '@/lib/ipc'`（mock 已生效，import 的是 mock 对象）。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/briefing-sidebar.test.tsx`
Expected: 新 describe 内 FAIL（顺序断言不成立 / draggable 属性不存在）

- [ ] **Step 3: 实现拖拽交互**

修改 `src/components/BriefingSourceSidebar.tsx`：

1. 顶部 import 加 `import { useRef, useState } from 'react'` 和 `import type { BriefingSourceId } from '@shared/index'`
2. 组件内新增状态与 store 读取（放在现有 `const source = useStore(...)` 附近）：

```tsx
  const order = useStore((s) => s.briefingSourceOrder)
  const setOrder = useStore((s) => s.setBriefingSourceOrder)
  const [dropTarget, setDropTarget] = useState<{ id: BriefingSourceId; pos: 'before' | 'after' } | null>(null)
  const dragIdRef = useRef<BriefingSourceId | null>(null)
  const didDropRef = useRef(false)
```

3. `navItems` 数组定义保持不变；渲染处改为按 store 顺序映射。把 `navItems.map((item) => ...)` 替换为：

```tsx
        {(order
          .map((id) => navItems.find((i) => i.id === id))
          .filter((i): i is (typeof navItems)[number] => Boolean(i))
        ).map((item) => {
          const Icon = item.icon
          const isActive = source === item.id
          const isDropBefore = dropTarget?.id === item.id && dropTarget.pos === 'before'
          const isDropAfter = dropTarget?.id === item.id && dropTarget.pos === 'after'
          return (
            <button
              key={item.id}
              data-testid={item.testId}
              draggable={!collapsed}
              onDragStart={(e) => {
                dragIdRef.current = item.id
                e.dataTransfer.setData('text/briefing-source', item.id)
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(e) => {
                if (collapsed) return
                e.preventDefault()
                const rect = e.currentTarget.getBoundingClientRect()
                if (!rect.height) return
                const r = (e.clientY - rect.top) / rect.height
                setDropTarget({ id: item.id, pos: r < 0.5 ? 'before' : 'after' })
              }}
              onDragLeave={() => setDropTarget((cur) => (cur?.id === item.id ? null : cur))}
              onDrop={(e) => {
                e.preventDefault()
                const src = dragIdRef.current
                const t = dropTarget
                setDropTarget(null)
                if (!src || !t || src === t.id) return
                const base = order.filter((id) => id !== src)
                let idx = base.indexOf(t.id)
                if (t.pos === 'after') idx += 1
                didDropRef.current = true
                void setOrder([...base.slice(0, idx), src, ...base.slice(idx)])
              }}
              onDragEnd={() => {
                dragIdRef.current = null
                setDropTarget(null)
              }}
              onClick={() => {
                // 拖拽落手后的合成 click 不触发导航
                if (didDropRef.current) { didDropRef.current = false; return }
                setSource(item.id)
              }}
              className={`group ${base} ${isActive ? `${themeClasses.active} ${
                isAcademic
                  ? source === 'job-briefing'
                    ? 'border-[#7fa8d9] rounded-none border-l-[3px]'
                    : 'border-[#d97757] rounded-none border-l-[3px]'
                  : 'border-[#1a1a1a] rounded-none border-l-[3px]'
              }` : themeClasses.inactive} ${isDropBefore ? 'border-t-2 border-t-ember' : ''} ${isDropAfter ? 'border-b-2 border-b-ember' : ''}`}
              title={item.label}
            >
              {!collapsed && (
                <span
                  aria-hidden="true"
                  title="拖拽排序"
                  className="opacity-0 group-hover:opacity-50 transition-opacity text-[10px] leading-none cursor-grab -ml-1"
                >
                  ⠿
                </span>
              )}
              <Icon />
              {!collapsed && <span>{item.label}</span>}
            </button>
          )
        })}
```

注意：原 `onClick={() => { setSource(item.id) }}` 被上面的 didDrop 守卫版本替换；原 `<Icon />` 和 label span 保留。插入线用 `border-t-2 border-t-ember` / `border-b-2 border-b-ember`（不与激活态 `border-l-[3px]` 冲突）。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/briefing-sidebar.test.tsx`
Expected: 全部 PASS（含原有用例无回归）

- [ ] **Step 5: Commit**

```bash
git add src/components/BriefingSourceSidebar.tsx tests/briefing-sidebar.test.tsx
git commit -m "feat(briefing): 来源边栏拖拽排序（hover 握把 + 插入线 + 持久化）"
```

---

### Task 3: rehypeFigureCaption 插件 + 接线 + figure 样式

**Files:**
- Create: `src/components/md/rehypeFigureCaption.ts`
- Modify: `src/components/md/MarkdownContent.tsx`
- Modify: `src/components/md/MarkdownRenderer.tsx`
- Modify: `src/components/md/markdown.css`
- Test: `tests/figure-caption.test.tsx`

**Interfaces:**
- Consumes: 无
- Produces:
  - `rehypeFigureCaption: Plugin<[], Root>`（from `@/components/md/rehypeFigureCaption`，注意是插件本体不是工厂——与 `rehypeTermHighlight(terms)` 工厂模式不同，使用时直接放数组：`[rehypeFigureCaption]`）
  - `MarkdownContent` 新 prop `figureCaptions?: boolean`
  - `MarkdownRenderer` 在 `briefingStyle` 存在时自动传 `figureCaptions`（调用方零改动）

- [ ] **Step 1: 写失败测试**

Create `tests/figure-caption.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({
  ipc: { openExternal: vi.fn() },
}))

import { MarkdownRenderer } from '@/components/md/MarkdownRenderer'

function renderBriefing(content: string) {
  return render(<MarkdownRenderer content={content} fileName="article.md" briefingStyle="academic" hideHeader />)
}

describe('rehypeFigureCaption（briefing 阅读器）', () => {
  beforeEach(() => cleanup())

  it('image-only paragraph + short text paragraph → figure with figcaption', () => {
    renderBriefing('![diagram](https://x.com/a.png)\n\nComponents of evaluations for agents.')
    const figure = document.querySelector('figure.md-figure')
    expect(figure).not.toBeNull()
    expect(figure!.querySelector('img')).not.toBeNull()
    expect(figure!.querySelector('figcaption')?.textContent).toBe('Components of evaluations for agents.')
    // 图注段落不再作为独立 p 出现
    expect(document.querySelectorAll('p').length).toBe(0)
  })

  it('caption over 140 chars stays a plain paragraph', () => {
    const long = 'x'.repeat(141)
    renderBriefing(`![a](https://x.com/a.png)\n\n${long}`)
    expect(document.querySelector('figure.md-figure')).toBeNull()
    expect(document.querySelectorAll('p').length).toBeGreaterThan(0)
  })

  it('caption containing a link is not converted', () => {
    renderBriefing('![a](https://x.com/a.png)\n\nSee [source](https://x.com) for details.')
    expect(document.querySelector('figure.md-figure')).toBeNull()
  })

  it('image without following paragraph stays unwrapped', () => {
    renderBriefing('正文段落。\n\n![a](https://x.com/a.png)')
    expect(document.querySelector('figure.md-figure')).toBeNull()
  })

  it('consecutive images each pair with their own captions', () => {
    renderBriefing('![a](https://x.com/a.png)\n\nFigure one.\n\n![b](https://x.com/b.png)\n\nFigure two.')
    const figures = document.querySelectorAll('figure.md-figure')
    expect(figures.length).toBe(2)
    expect(figures[0].querySelector('figcaption')?.textContent).toBe('Figure one.')
    expect(figures[1].querySelector('figcaption')?.textContent).toBe('Figure two.')
  })

  it('non-briefing rendering is not affected', () => {
    render(<MarkdownRenderer content={'![a](https://x.com/a.png)\n\nCaption here.'} fileName="a.md" hideHeader />)
    expect(document.querySelector('figure.md-figure')).toBeNull()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/figure-caption.test.tsx`
Expected: FAIL — `figure.md-figure` 找不到（插件未接入）

- [ ] **Step 3: 实现插件 + 接线 + 样式**

Create `src/components/md/rehypeFigureCaption.ts`:

```ts
import type { Plugin } from 'unified'
import type { Root, Element, ElementContent } from 'hast'

const MAX_CAPTION_LENGTH = 140

function textContent(node: ElementContent): string {
  if (node.type === 'text') return node.value
  if (node.type === 'element') return node.children.map(textContent).join('')
  return ''
}

/** p 的唯一有效子节点是 img（允许空白文本节点） */
function isImageOnlyParagraph(node: ElementContent): node is Element {
  if (node.type !== 'element' || node.tagName !== 'p') return false
  const meaningful = node.children.filter((c) => !(c.type === 'text' && c.value.trim() === ''))
  return (
    meaningful.length === 1 &&
    meaningful[0].type === 'element' &&
    (meaningful[0] as Element).tagName === 'img'
  )
}

/** 图注候选：纯文本短段落（可含 em/strong），不含链接/图片 */
function captionText(node: ElementContent): string | null {
  if (node.type !== 'element' || node.tagName !== 'p') return null
  const el = node as Element
  const forbidden = el.children.some(
    (c) => c.type === 'element' && ((c as Element).tagName === 'a' || (c as Element).tagName === 'img')
  )
  if (forbidden) return null
  const text = el.children.map(textContent).join('').trim()
  if (text.length === 0 || text.length > MAX_CAPTION_LENGTH) return null
  return text
}

/**
 * 「独占一段的图片 + 紧随的短文本段落」→ figure > img + figcaption。
 * 对标官网博客的图注排版（Anthropic engineering 文章每图一行小字图注）。
 * 仅由 MarkdownContent 在 figureCaptions prop 开启时挂载（briefing 阅读器专用）。
 */
export const rehypeFigureCaption: Plugin<[], Root> = () => (tree) => {
  const process = (parent: Root | Element) => {
    const children = parent.children as ElementContent[]
    for (let i = 0; i < children.length - 1; i++) {
      const imgP = children[i]
      if (!isImageOnlyParagraph(imgP)) continue
      const caption = captionText(children[i + 1])
      if (caption === null) continue
      const img = imgP.children.find((c) => c.type === 'element') as Element
      const figure: Element = {
        type: 'element',
        tagName: 'figure',
        properties: { className: ['md-figure'] },
        children: [
          img,
          {
            type: 'element',
            tagName: 'figcaption',
            properties: {},
            children: [{ type: 'text', value: caption }],
          },
        ],
      }
      children.splice(i, 2, figure)
      i--
    }
    for (const child of children) {
      if (child.type === 'element') process(child as Element)
    }
  }
  process(tree)
}
```

Modify `src/components/md/MarkdownContent.tsx`：

```tsx
// 顶部 import 加：
import { rehypeFigureCaption } from './rehypeFigureCaption'

// Props interface 加：
  figureCaptions?: boolean

// 组件签名加 figureCaptions，rehypePlugins 改为：
  const rehypePlugins = useMemo(() => {
    const plugins: Plugin[] = []
    // figure 化必须在术语高亮之前：caption 判定要求段落内无元素包裹
    if (figureCaptions) plugins.push(rehypeFigureCaption)
    if (terms && terms.length > 0) plugins.push(rehypeTermHighlight(terms))
    return plugins.length > 0 ? plugins : undefined
  }, [terms, figureCaptions])
```

（`Plugin` 类型从 `unified` import；如与现有类型冲突，用 `PluggableList` 或直接 `unknown[]` 断言，保持简单。）

Modify `src/components/md/MarkdownRenderer.tsx`：Props 不变，渲染处传参：

```tsx
<MarkdownContent components={components} terms={terms} figureCaptions={!!briefingStyle}>{body}</MarkdownContent>
```

Modify `src/components/md/markdown.css`，在「Theme-aware image borders」区块后追加：

```css
/* ===== Figure / 图注（briefing 阅读器） ===== */
.briefing-body-academic .md-body figure.md-figure,
.briefing-body-newspaper .md-body figure.md-figure {
  margin: 18px 0;
  text-align: center;
}

.briefing-body-academic .md-body figure.md-figure img,
.briefing-body-newspaper .md-body figure.md-figure img {
  margin: 0 auto;
}

.briefing-body-academic .md-body figure.md-figure figcaption {
  margin-top: 8px;
  font-size: 0.875em;
  font-style: italic;
  letter-spacing: 0.02em;
  color: rgba(232, 213, 183, 0.5);
}

.briefing-body-newspaper .md-body figure.md-figure figcaption {
  margin-top: 8px;
  font-size: 0.875em;
  font-style: italic;
  letter-spacing: 0.02em;
  color: #777;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/figure-caption.test.tsx`
Expected: PASS (6 tests)

Run: `npx tsc --noEmit`
Expected: clean

- [ ] **Step 5: Commit**

```bash
git add src/components/md/rehypeFigureCaption.ts src/components/md/MarkdownContent.tsx src/components/md/MarkdownRenderer.tsx src/components/md/markdown.css tests/figure-caption.test.tsx
git commit -m "feat(reader): 博客图注 figure 化（图+短文本段落 → figure/figcaption）"
```

---

### Task 4: 代码块卡片化 + 复制按钮（briefing 作用域）

**Files:**
- Modify: `src/components/md/components.tsx`
- Modify: `src/components/md/markdown.css`
- Test: `tests/md-codeblock.test.tsx`

**Interfaces:**
- Consumes: 无（独立于 Task 3，可并行）
- Produces: 无新导出；`briefingComponents()` 返回的 map 中 `code` 渲染器换为 `MdCodeBlock` 路径（`baseComponents` 的 `code` 保持不变，学习报告/对话不受影响）

- [ ] **Step 1: 写失败测试**

Create `tests/md-codeblock.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({
  ipc: { openExternal: vi.fn() },
}))

import { MarkdownRenderer } from '@/components/md/MarkdownRenderer'

describe('MdCodeBlock（briefing 阅读器）', () => {
  beforeEach(() => {
    cleanup()
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    })
  })

  it('fenced code with language renders bar with lang label and copy button', () => {
    render(
      <MarkdownRenderer
        content={'```yaml\ntask:\n  id: "fix-auth-bypass_1"\n```'}
        fileName="article.md"
        briefingStyle="academic"
        hideHeader
      />
    )
    expect(screen.getByText('yaml')).toBeInTheDocument()
    expect(screen.getByTestId('md-codeblock-copy')).toBeInTheDocument()
  })

  it('copy button writes code text to clipboard and shows transient confirmation', async () => {
    render(
      <MarkdownRenderer
        content={'```yaml\ntask:\n  id: "x"\n```'}
        fileName="article.md"
        briefingStyle="academic"
        hideHeader
      />
    )
    fireEvent.click(screen.getByTestId('md-codeblock-copy'))
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('task:\n  id: "x"')
    )
    expect(await screen.findByText('已复制 ✓')).toBeInTheDocument()
  })

  it('fenced code without language renders copy button but no lang label', () => {
    render(
      <MarkdownRenderer
        content={'```\nplain code\n```'}
        fileName="article.md"
        briefingStyle="academic"
        hideHeader
      />
    )
    expect(screen.getByTestId('md-codeblock-copy')).toBeInTheDocument()
    expect(document.querySelector('.md-codeblock-lang')).toBeNull()
  })

  it('inline code is unchanged (no copy button)', () => {
    render(
      <MarkdownRenderer content={'Use `pass@k` here.'} fileName="article.md" briefingStyle="academic" hideHeader />
    )
    expect(screen.queryByTestId('md-codeblock-copy')).not.toBeInTheDocument()
  })

  it('non-briefing rendering keeps old pre without copy button', () => {
    render(<MarkdownRenderer content={'```js\nconsole.log(1)\n```'} fileName="a.md" hideHeader />)
    expect(screen.queryByTestId('md-codeblock-copy')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/md-codeblock.test.tsx`
Expected: FAIL — `md-codeblock-copy` 不存在

- [ ] **Step 3: 实现 MdCodeBlock + 样式**

Modify `src/components/md/components.tsx`：

1. 顶部 import 已有 `useState, useEffect`；补 `useRef`
2. 在 `MdImage` 之后追加内部组件（不导出）：

```tsx
// ===== Code block with copy bar (briefing readers only) =====
function MdCodeBlock({ className, children }: { className?: string; children: React.ReactNode }) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<number | null>(null)
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])
  const lang = /language-(\w+)/.exec(className ?? '')?.[1] ?? null
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(extractText(children))
      setCopied(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => setCopied(false), 1500)
    } catch (err) {
      console.error('[md-codeblock] copy failed:', err)
    }
  }
  return (
    <div className="md-codeblock">
      <div className="md-codeblock-bar">
        {lang && <span className="md-codeblock-lang">{lang}</span>}
        <button
          type="button"
          data-testid="md-codeblock-copy"
          className="md-codeblock-copy"
          onClick={() => void handleCopy()}
        >
          {copied ? '已复制 ✓' : '复制'}
        </button>
      </div>
      <pre>
        <code className={className}>{children}</code>
      </pre>
    </div>
  )
}
```

3. `briefingComponents` 改为：

```tsx
export function briefingComponents(_style: 'academic' | 'newspaper'): Components {
  return {
    ...baseComponents,
    p: ({ children }) => <BriefingParagraph>{children}</BriefingParagraph>,
    code: ({ children, className }) => {
      if (!className) return <code>{children}</code>
      return <MdCodeBlock className={className}>{children}</MdCodeBlock>
    },
  }
}
```

（`baseComponents.code` 不动。注意 react-markdown v9+ 会把块级 code 渲染在 pre 内：默认结构是 `pre > code`，我们的 `code` 覆盖返回 `MdCodeBlock` 后 DOM 变为 `pre > div.md-codeblock`——需要确认。react-markdown 对 fenced block 输出 `pre > code.language-xxx`，覆盖 `code` 组件时外层 `pre` 仍是默认渲染。为避免 `pre` 包 `div` 的嵌套怪异，同时覆盖 `pre`：）

```tsx
    pre: ({ children }) => <>{children}</>,
```

加入 briefingComponents（剥掉默认 pre 外壳，MdCodeBlock 自带 pre）。单元测试里断言 `navigator.clipboard.writeText` 的入参不含首尾换行——若实际带出换行，用 `extractText(children).replace(/\n$/, '')`。

Modify `src/components/md/markdown.css`，在 Code 区块后追加：

```css
/* ===== Code block card（briefing 阅读器） ===== */
.briefing-body-academic .md-body .md-codeblock,
.briefing-body-newspaper .md-body .md-codeblock {
  margin: 14px 0;
  border-radius: 8px;
  overflow: hidden;
}

.briefing-body-academic .md-body .md-codeblock {
  background: #15100d;
  border: 1px solid rgba(148, 137, 121, 0.15);
}

.briefing-body-newspaper .md-body .md-codeblock {
  background: #f5f5f5;
  border: 1px solid rgba(26, 26, 26, 0.12);
}

.md-codeblock-bar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 6px 10px;
  font-size: 11px;
  font-family: "Courier New", "JetBrains Mono", monospace;
}

.briefing-body-academic .md-codeblock-bar {
  background: rgba(232, 213, 183, 0.06);
  color: rgba(232, 213, 183, 0.5);
}

.briefing-body-newspaper .md-codeblock-bar {
  background: rgba(26, 26, 26, 0.05);
  color: #777;
}

.md-codeblock-lang {
  margin-right: auto;
  text-transform: lowercase;
  letter-spacing: 0.08em;
}

.md-codeblock-copy {
  cursor: pointer;
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  color: inherit;
}

.briefing-body-academic .md-codeblock-copy:hover {
  color: #d97757;
}

.briefing-body-newspaper .md-codeblock-copy:hover {
  color: #1a1a1a;
}

.briefing-body-academic .md-body .md-codeblock pre,
.briefing-body-newspaper .md-body .md-codeblock pre {
  margin: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  padding: 12px 14px;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/md-codeblock.test.tsx`
Expected: PASS (5 tests)

同时跑相关旧测试防回归：
Run: `npx vitest run tests/md-image.test.tsx tests/ArticleBodyChunks.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/md/components.tsx src/components/md/markdown.css tests/md-codeblock.test.tsx
git commit -m "feat(reader): 博客代码块卡片化 + 语言标签 + 复制按钮（briefing 作用域）"
```

---

### Task 5: 排版 CSS 批次（标题层级 / 列表间距 / 链接加粗 / 术语点睛）

**Files:**
- Modify: `src/components/md/markdown.css`

**Interfaces:**
- Consumes: 无
- Produces: 无（纯 CSS，验证在 Task 7 的 E2E computed style 断言）

jsdom 不加载样式表，本任务无单元测试；验证方式为 Task 7 E2E 的 `toHaveCSS` 断言 + 手动目检。

- [ ] **Step 1: 修改 markdown.css**

在文件末尾追加（全部 briefing 作用域，不动 `.md-body` 基座规则——基座服务于学习报告/对话/寓言）：

```css
/* ===== 博客阅读排版对标（官网实测：H2 25px / H3 19px+32px 上距 / li 12px / 链接 700） ===== */

/* 标题层级拉开（字体沿用等宽设计语言，只调阶梯） */
.briefing-body-academic .md-body h2,
.briefing-body-newspaper .md-body h2 {
  font-size: 22px;
  font-weight: 600;
  margin: 36px 0 12px 0;
}

.briefing-body-academic .md-body h3,
.briefing-body-newspaper .md-body h3 {
  font-size: 17px;
  font-weight: 600;
  margin: 32px 0 8px 0;
}

.briefing-body-academic .md-body h4,
.briefing-body-newspaper .md-body h4 {
  font-size: 15px;
  margin: 20px 0 6px 0;
}

/* 列表透气（官网 li margin-bottom 12px） */
.briefing-body-academic .md-body li,
.briefing-body-newspaper .md-body li {
  margin: 10px 0;
}

/* 链接加粗 + 下划线偏移（官网链接 weight 700，颜色仍走琥珀点睛） */
.briefing-body-academic .md-body a,
.briefing-body-newspaper .md-body a {
  font-weight: 600;
  text-underline-offset: 3px;
}

/* 术语点睛：列表项开头的加粗词条（task/trial/grader… 术语表）染琥珀 */
.briefing-body-academic .md-body li > strong:first-child,
.briefing-body-newspaper .md-body li > strong:first-child {
  color: #d97757;
}
```

注意：`.briefing-body-academic .md-body h2::before` 的 `◆` 菱标规则已存在，不受字号调整影响（`font-size: 0.62em` 相对值）。

- [ ] **Step 2: 类型检查 + 构建冒烟**

Run: `npx tsc --noEmit`
Expected: clean

Run: `npx electron-vite build`
Expected: success（同时产出最新 `out/` 供 Task 6/7 E2E 使用）

- [ ] **Step 3: Commit**

```bash
git add src/components/md/markdown.css
git commit -m "feat(reader): 博客排版对标官网——标题阶梯/列表间距/链接加粗/术语点睛"
```

---

### Task 6: E2E — 来源边栏拖拽排序持久化

**Files:**
- Create: `e2e/specs/briefing-source-order.spec.ts`

**Interfaces:**
- Consumes: Task 1/2 的完整功能；fixture 参数 `window`、`testConfigDir`；`SELECTORS.briefing.sourceAnthropicButton`（既有）；其余按钮直接用 `[data-testid="briefing-source-writing"]` 定位
- Produces: 无

前置：`npx electron-vite build`（E2E 跑 `out/` 产物；Task 5 Step 2 已构建则跳过）。

- [ ] **Step 1: 写 E2E spec**

Create `e2e/specs/briefing-source-order.spec.ts`:

```ts
import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import * as fs from 'node:fs'
import * as path from 'node:path'

const SIDEBAR = '[data-testid="briefing-source-sidebar"]'
const BTN = (id: string) => `[data-testid="briefing-source-${id}"]`

async function navOrder(window: any): Promise<string[]> {
  return window.locator(`${SIDEBAR} nav button`).evaluateAll(
    (els: Element[]) => els.map((el) => el.getAttribute('data-testid') ?? '')
  )
}

test.describe('来源边栏拖拽排序', () => {
  test('拖拽博客到首位 → DOM 顺序与 state.json 同步，重启后保持', async ({ window, testConfigDir }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.page)).toBeVisible()

    expect(await navOrder(window)).toEqual([
      'briefing-source-writing',
      'briefing-source-digest',
      'briefing-source-anthropic',
      'briefing-source-job-briefing',
      'briefing-source-scout',
    ])

    // HTML5 DnD：手动 mouse 事件（dragTo 对 draggable 可靠性差）
    const src = window.locator(BTN('anthropic'))
    const dst = window.locator(BTN('writing'))
    const srcBox = (await src.boundingBox())!
    const dstBox = (await dst.boundingBox())!
    await window.mouse.move(srcBox.x + srcBox.width / 2, srcBox.y + srcBox.height / 2)
    await window.mouse.down()
    await window.mouse.move(dstBox.x + dstBox.width / 2, dstBox.y + 4, { steps: 10 })
    await window.mouse.up()

    await expect.poll(() => navOrder(window)).toEqual([
      'briefing-source-anthropic',
      'briefing-source-writing',
      'briefing-source-digest',
      'briefing-source-job-briefing',
      'briefing-source-scout',
    ])

    // state.json 落盘
    await expect.poll(() => {
      const raw = JSON.parse(fs.readFileSync(path.join(testConfigDir, 'state.json'), 'utf8'))
      return raw.briefingSourceOrder
    }).toEqual(['anthropic', 'writing', 'digest', 'job-briefing', 'scout'])

    // 重载后顺序保持（init 从 state.json 归一化恢复）
    await window.reload()
    const cover2 = new CoverPage(window)
    await cover2.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.page)).toBeVisible()
    expect(await navOrder(window)).toEqual([
      'briefing-source-anthropic',
      'briefing-source-writing',
      'briefing-source-digest',
      'briefing-source-job-briefing',
      'briefing-source-scout',
    ])
  })

  test('折叠态不可拖拽', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.page)).toBeVisible()
    await window.locator('[data-testid="briefing-sidebar-toggle"]').click()
    await expect(window.locator(BTN('anthropic'))).not.toHaveAttribute('draggable', 'true')
  })
})
```

注意：reload 后 cover 是否需要重新 enterName 取决于 profile 已持久化——参照既有 reload 持久化 spec（`briefing-annotations-persistence.spec.ts`）的实际做法调整这两行。

- [ ] **Step 2: 构建 + 跑 spec**

Run: `npx electron-vite build && npx playwright test --config e2e/playwright.config.ts briefing-source-order --no-retries`
Expected: 2 passed

- [ ] **Step 3: 确认 source-map 无孤儿 WARNING**

Run: `node scripts/e2e-changed.js`
Expected: 输出中无 `briefing-source-order.spec.ts` 的孤儿 WARNING（`briefing-*.spec.ts` glob 已覆盖本文件；若仍报 WARNING，把 `briefing-source-order.spec.ts` 显式加入 `e2e/source-map.json` 的 `briefing-core` group `specs`）

- [ ] **Step 4: Commit**

```bash
git add e2e/specs/briefing-source-order.spec.ts
git commit -m "test(briefing): 来源边栏拖拽排序持久化 E2E"
```

---

### Task 7: E2E — 博客排版对标断言

**Files:**
- Create: `e2e/specs/anthropic-blog-typography.spec.ts`

**Interfaces:**
- Consumes: Task 3/4/5 全部；helpers `seedAnthropicArticle`、`seedStateJson`（from `../helpers/test-library`）；fixture 参数 `window`、`testLibraryPath`、`testConfigDir`
- Produces: 无

离线模式：seed 文章到 `Anthropic博客/` + seed `state.json` 的 `anthropicBlogCache`（`isSaved: true` + `filePath`），列表离线可见，点击行进阅读器。模式照抄 `anthropic-blog-multi-source.spec.ts` 的 `seedSectionArticle`/`seedCache`。

- [ ] **Step 1: 写 E2E spec**

Create `e2e/specs/anthropic-blog-typography.spec.ts`:

```ts
import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedAnthropicArticle, seedStateJson } from '../helpers/test-library'

const PROFILE = { name: 'E2E 测试员', profile_text: '', preferred_topics: [] }

const ARTICLE_BODY = `## Introduction

Good evaluations help teams ship AI agents more confidently. See [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) for context.

![diagram](./.assets/image.png)

Components of evaluations for agents.

### Types of graders

*   A **task** is a single test with defined inputs.
*   A **trial** is one attempt at a task.

\`\`\`yaml
task:
  id: "fix-auth-bypass_1"
\`\`\`
`

test.describe('博客排版对标官网', () => {
  test('图注 figure 化 + 代码块复制 + 标题/链接/术语 computed style', async ({
    window,
    testLibraryPath,
    testConfigDir,
  }) => {
    const slug = 'e2e-typography'
    const url = `https://www.anthropic.com/engineering/${slug}`
    const filePath = seedAnthropicArticle(testLibraryPath, slug, 'Typography Fixture', ARTICLE_BODY, {
      published_at: '2026-01-08T16:00:00.000Z',
    })
    seedStateJson(testConfigDir, {
      profile: PROFILE,
      briefingSource: 'anthropic',
      anthropicBlogCache: {
        lastFetchedAt: new Date().toISOString(),
        articles: [{
          url, title: 'Typography Fixture', summary: null,
          publishedAt: '2026-01-08T16:00:00.000Z', imageUrl: null,
          isSaved: true, filePath, section: 'engineering',
        }],
        loading: false, error: null, sectionStatus: {},
      },
    })

    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.page)).toBeVisible()
    await window.locator(SELECTORS.briefing.sourceAnthropicButton).click()

    // 点击 fixture 文章行进阅读器（排除宪法置顶行）
    const row = window.locator(SELECTORS.briefing.anthropicArticleRow)
      .filter({ hasText: 'Typography Fixture' })
    await row.click()
    const article = window.locator('[data-testid="anthropic-reader-article"]')
    await expect(article).toBeVisible({ timeout: 15000 })

    // B3 图注：figure > img + figcaption
    const figure = article.locator('figure.md-figure')
    await expect(figure).toHaveCount(1)
    await expect(figure.locator('figcaption')).toHaveText('Components of evaluations for agents.')

    // B4 代码块：顶栏 + 语言标签 + 复制按钮，点击后文案翻转
    await expect(article.locator('.md-codeblock-lang')).toHaveText('yaml')
    const copyBtn = article.locator('[data-testid="md-codeblock-copy"]')
    await copyBtn.click()
    await expect(copyBtn).toHaveText('已复制 ✓')

    // B1 标题阶梯：h3 17px / 上间距 32px
    await expect(article.locator('h3').first()).toHaveCSS('font-size', '17px')
    await expect(article.locator('h3').first()).toHaveCSS('margin-top', '32px')

    // B5 链接加粗
    await expect(article.locator('p a').first()).toHaveCSS('font-weight', '600')

    // B6 术语琥珀：li > strong:first-child 颜色 #d97757
    await expect(article.locator('li > strong').first()).toHaveCSS('color', 'rgb(217, 119, 87)')

    // B2 列表间距 10px
    await expect(article.locator('li').first()).toHaveCSS('margin-top', '10px')
  })
})
```

注意：`seedAnthropicArticle` 不创建 `.assets/image.png`——图片会走 `MdImage` 的加载失败占位（`md-image-error` span），但 figure 结构判定发生在 hast 层（`p > img` 结构仍在），不影响 figcaption 断言。若失败占位导致结构差异，改用 `seedAnthropicArticleWithImage`（会创建 1x1 PNG），body 里引用 `./.assets/image.png`。

- [ ] **Step 2: 构建 + 跑 spec**

Run: `npx electron-vite build && npx playwright test --config e2e/playwright.config.ts anthropic-blog-typography --no-retries`
Expected: 1 passed

若 h3/li 断言失败：检查 `.prose`（tailwind typography）是否覆盖了 `.md-body` 同优先级规则——必要时提高选择器特异性（`.briefing-body-academic .md-body h3` 已带双层类，一般足够；不够则在规则上追加 `!important` 前先在 dev 工具确认竞争对手是谁，禁止盲目加）。

- [ ] **Step 3: 确认 source-map 无孤儿 WARNING**

Run: `node scripts/e2e-changed.js`
Expected: 无 `anthropic-blog-typography.spec.ts` 孤儿 WARNING（`anthropic-blog*.spec.ts` glob 已覆盖）

- [ ] **Step 4: 手动目检真实文章**

启动 `npm run dev`，打开 `Anthropic博客/2026-01/Demystifying evals for AI agents.md`，学术主题目检：标题层级、术语表琥珀词条、5 张图的图注、4 个 YAML 代码块复制按钮。切报纸主题确认不破版。

- [ ] **Step 5: Commit**

```bash
git add e2e/specs/anthropic-blog-typography.spec.ts
git commit -m "test(reader): 博客排版对标官网 E2E（图注/代码块/标题阶梯/链接/术语）"
```

---

## Self-Review 记录

- Spec 覆盖：功能 A（Task 1/2/6）、B1（Task 5/7）、B2（Task 5/7）、B3（Task 3/7）、B4（Task 4/7）、B5/B6（Task 5/7）、验收清单 1-5（Task 6/7 + Task 7 Step 4 目检）。列宽收窄按用户决定删去。
- 类型一致性：`BriefingSourceId` / `briefingSourceOrder` / `setBriefingSourceOrder` / `normalizeBriefingSourceOrder` / `DEFAULT_BRIEFING_SOURCE_ORDER` / `rehypeFigureCaption` / `figureCaptions` 在任务间引用一致。
