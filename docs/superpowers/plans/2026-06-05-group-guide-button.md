# 分组栏帮助按钮 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在分组栏「+」号右侧新增常驻 `i` 信息按钮，点击弹出「分组使用指南」定位面板。

**Architecture：** 独立 `GuidePopover` 组件负责面板渲染与定位，`GroupRibbon` 管理按钮状态与 `anchorRef`。面板用 `position: fixed` 基于 `getBoundingClientRect` 定位，全局事件监听处理外部点击和 ESC 关闭。

**Tech Stack：** React 18 + TypeScript + Tailwind CSS + Vitest + @testing-library/react

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/components/GuidePopover.tsx` | Create | 帮助面板：定位、内容渲染、关闭逻辑 |
| `src/components/GroupRibbon.tsx` | Modify | 新增 `i` 按钮和 `guideOpen` 状态 |
| `src/assets/group-guide-drag-demo.png` | Add (user-provided) | 第3条拖拽示意图 |
| `tests/components/GuidePopover.test.tsx` | Create | 组件行为测试 |

---

### Task 1: 创建 GuidePopover 组件

**Files:**
- Create: `src/components/GuidePopover.tsx`
- Test: `tests/components/GuidePopover.test.tsx`

- [ ] **Step 1: 写 GuidePopover.tsx**

```tsx
import { useEffect, useRef, useCallback } from 'react'

interface GuidePopoverProps {
  open: boolean
  anchorRef: React.RefObject<HTMLElement | null>
  onClose: () => void
}

export function GuidePopover({ open, anchorRef, onClose }: GuidePopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  const updatePosition = useCallback(() => {
    const panel = panelRef.current
    const anchor = anchorRef.current
    if (!panel || !anchor) return

    const rect = anchor.getBoundingClientRect()
    const panelWidth = 320
    const margin = 8

    let left = rect.left + rect.width / 2 - panelWidth / 2
    let top = rect.bottom + margin

    // Keep within viewport
    if (left < margin) left = margin
    if (left + panelWidth > window.innerWidth - margin) {
      left = window.innerWidth - panelWidth - margin
    }

    panel.style.left = `${left}px`
    panel.style.top = `${top}px`
  }, [anchorRef])

  useEffect(() => {
    if (!open) return

    updatePosition()

    const handleResize = () => {
      // Close on resize to avoid drift
      onClose()
    }
    window.addEventListener('resize', handleResize)

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        panelRef.current &&
        !panelRef.current.contains(target) &&
        anchorRef.current &&
        !anchorRef.current.contains(target)
      ) {
        onClose()
      }
    }
    // Use capture phase to catch clicks before they bubble
    document.addEventListener('mousedown', handleClickOutside, true)

    return () => {
      window.removeEventListener('resize', handleResize)
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleClickOutside, true)
    }
  }, [open, onClose, updatePosition, anchorRef])

  if (!open) return null

  const items = [
    {
      text: '新创建的默认保存到「默认」分组中',
    },
    {
      text: '新建分组可包含多个主题，左侧推荐会根据你的分组智能推荐学习主题',
    },
    {
      text: '长按主题卡片并拖动，可将其移入其他分组',
      extra: (
        <div className="mt-2">
          <p className="text-[11px] text-parchment/40 mb-1">拖拽到目标分组附近即可</p>
          <img
            src="./src/assets/group-guide-drag-demo.png"
            alt="拖拽分组示意图"
            className="w-full rounded-md opacity-80"
            draggable={false}
          />
        </div>
      ),
    },
  ]

  return (
    <div
      ref={panelRef}
      className="fixed z-50 w-[320px] bg-[#1e1612] border border-parchment/20 rounded-xl shadow-xl p-4"
      style={{ left: 0, top: 0 }}
    >
      <div className="text-sm font-semibold text-parchment mb-3">
        分组使用指南
      </div>
      <div className="flex flex-col gap-3">
        {items.map((item, i) => (
          <div key={i} className="flex gap-2.5 items-start">
            <span className="shrink-0 w-5 h-5 rounded-full bg-ember/20 text-ember text-[11px] flex items-center justify-center font-semibold mt-0.5">
              {i + 1}
            </span>
            <div>
              <p className="text-[13px] leading-relaxed text-parchment/80">
                {item.text}
              </p>
              {item.extra}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/GuidePopover.tsx
git commit -m "feat(ui): add GuidePopover component for group help panel"
```

---

### Task 2: 修改 GroupRibbon 添加帮助按钮

**Files:**
- Modify: `src/components/GroupRibbon.tsx`
- Import `GuidePopover`, add `guideOpen` state, add `guideBtnRef`, add `i` button

- [ ] **Step 1: 导入 GuidePopover 并添加状态**

在 `src/components/GroupRibbon.tsx` 顶部，在现有 import 下方新增：

```tsx
import { GuidePopover } from './GuidePopover'
```

在组件内部，在 `const [deleteTarget, setDeleteTarget] = useState<Group | null>(null)` 之后新增：

```tsx
  const [guideOpen, setGuideOpen] = useState(false)
  const guideBtnRef = useRef<HTMLButtonElement>(null)
```

- [ ] **Step 2: 在「+」按钮右侧添加 `i` 按钮**

在 `src/components/GroupRibbon.tsx` 中，找到「+」按钮的代码（第 156–162 行），在其闭合 `</button>` 之后、在 `</div>`（flex 容器闭合标签）之前添加：

```tsx
        {/* Help button */}
        <button
          ref={guideBtnRef}
          onClick={() => setGuideOpen((v) => !v)}
          className="shrink-0 px-2.5 py-1 text-[11px] font-serif italic rounded-full border border-parchment/15 text-parchment/30 hover:border-parchment/30 hover:text-parchment/50 transition-colors"
        >
          i
        </button>
```

- [ ] **Step 3: 渲染 GuidePopover**

在 `src/components/GroupRibbon.tsx` 的 `return` 中，在 `</div>`（最外层 `relative` div 闭合）之前、在 `{deleteTarget && (...)}` 之后添加：

```tsx
      <GuidePopover
        open={guideOpen}
        anchorRef={guideBtnRef}
        onClose={() => setGuideOpen(false)}
      />
```

- [ ] **Step 4: Commit**

```bash
git add src/components/GroupRibbon.tsx
git commit -m "feat(ui): add group help button and wire GuidePopover"
```

---

### Task 3: 放置拖拽示意图

**Files:**
- Add: `src/assets/group-guide-drag-demo.png`

- [ ] **Step 1: 用户提供的引力场截图放到 assets 目录**

将拖拽示意图保存为：
```
src/assets/group-guide-drag-demo.png
```

> 图片由用户提供（即 brainstorming 阶段展示的引力场截图），展示拖拽 Topic 卡片时出现的分组节点分布效果。

- [ ] **Step 2: Commit**

```bash
git add src/assets/group-guide-drag-demo.png
git commit -m "assets: add group guide drag demo image"
```

---

### Task 4: 测试 GuidePopover 组件

**Files:**
- Create: `tests/components/GuidePopover.test.tsx`

- [ ] **Step 1: 编写测试文件**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useRef } from 'react'
import { GuidePopover } from '../../src/components/GuidePopover'

function TestWrapper({ open, onClose }: { open: boolean; onClose: () => void }) {
  const anchorRef = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button ref={anchorRef}>i</button>
      <GuidePopover open={open} anchorRef={anchorRef} onClose={onClose} />
    </>
  )
}

describe('GuidePopover', () => {
  it('renders nothing when closed', () => {
    render(<TestWrapper open={false} onClose={vi.fn()} />)
    expect(screen.queryByText('分组使用指南')).not.toBeInTheDocument()
  })

  it('renders content when open', () => {
    render(<TestWrapper open={true} onClose={vi.fn()} />)
    expect(screen.getByText('分组使用指南')).toBeInTheDocument()
    expect(screen.getByText(/新创建的默认保存到「默认」分组中/)).toBeInTheDocument()
    expect(screen.getByText(/左侧推荐会根据你的分组/)).toBeInTheDocument()
    expect(screen.getByText(/长按主题卡片并拖动/)).toBeInTheDocument()
  })

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn()
    render(<TestWrapper open={true} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when clicking outside', () => {
    const onClose = vi.fn()
    render(
      <div>
        <TestWrapper open={true} onClose={onClose} />
        <div data-testid="outside">outside</div>
      </div>
    )
    fireEvent.mouseDown(screen.getByTestId('outside'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: 运行测试**

```bash
npx vitest run tests/components/GuidePopover.test.tsx
```

Expected: 4 tests pass

- [ ] **Step 3: Commit**

```bash
git add tests/components/GuidePopover.test.tsx
git commit -m "test: add GuidePopover component tests"
```

---

### Task 5: 运行应用并验证

- [ ] **Step 1: 启动开发服务器**

```bash
npm run dev
```

- [ ] **Step 2: 手动验证清单**

打开应用后逐项检查：

- [ ] 分组栏「+」号右侧出现斜体 `i` 按钮
- [ ] 鼠标悬停 `i` 按钮时边框和文字变亮
- [ ] 点击 `i` 按钮弹出「分组使用指南」面板
- [ ] 面板出现在按钮下方，不遮挡分组栏
- [ ] 面板内显示 3 条带编号说明（1/2/3 圆圈为 ember 色）
- [ ] 第 3 条下方有拖拽示意图
- [ ] 点击面板外部区域，面板关闭
- [ ] 按 `Escape` 键，面板关闭
- [ ] 面板打开时点击分组标签，面板自动关闭并切换分组
- [ ] 面板打开时点击「+」号，面板自动关闭并进入新建分组输入态

---

## Spec Coverage Check

| Spec 要求 | 对应 Task |
|-----------|-----------|
| 「+」号右侧 `i` 按钮 | Task 2 |
| 按钮样式：圆角边框、半透明、hover 反馈 | Task 2 |
| 点击弹出定位面板 | Task 1 + Task 2 |
| 面板锚定按钮下方 | Task 1 (updatePosition) |
| 点击外部关闭 | Task 1 (handleClickOutside) |
| 按 ESC 关闭 | Task 1 (handleKeyDown) |
| 3 条编号说明 + ember 色圆圈 | Task 1 |
| 第 3 条下方拖拽示意图 | Task 1 + Task 3 |
| 面板打开时不阻断其他操作 | Task 1 (mousedown capture + onClose) |

## Placeholder Scan

- 无 TBD/TODO
- 无 "implement later"
- 所有代码块包含完整实现
- 图片路径为具体路径 `src/assets/group-guide-drag-demo.png`

## Type Consistency

- `GuidePopoverProps.open` → `boolean`
- `GuidePopoverProps.anchorRef` → `React.RefObject<HTMLElement | null>`
- `GuidePopoverProps.onClose` → `() => void`
- `guideOpen` → `useState<boolean>(false)`
- `guideBtnRef` → `useRef<HTMLButtonElement>(null)`
