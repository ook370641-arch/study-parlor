# 审美提升 · 计划一：物理层（重量语法 + 换画通用组件 + 展签）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地 spec 批一——全应用统一的双弹簧重量语法（motion-presets）、换画通用组件（坠出/落入 + CRT 颗粒 + 连点锁）、展签（PaintingLabel）、日期选中落定、助手面板开合不对称。

**Architecture:** 纯渲染层改造：1 个常量文件 + globals.css 关键帧 + 3 个组件改造 + 2 个新组件测试 + 1 条新 E2E。零 IPC、零持久化字段。`SurfaceBackground`/`SwapPaintingButton` 是四 surface 共用件，改动天然覆盖 cover/home/study/briefing。

**Tech Stack:** Electron 30 + React 18 + TS + Tailwind 3.4 + zustand + Vitest + Playwright e2e。

**Spec:** `docs/superpowers/specs/2026-07-25-briefing-aesthetic-elevation-design.md`（本计划覆盖 F2/F3；批二 F4/F5、批三 F6/F7/F8、批四 F0/F1/F9/F10 各自另行出计划）

**执行环境：** 直接在 `main` 分支。

**跨任务铁律：**
- 所有弹性曲线必须引用 `motion-presets.ts` 常量，不得手写 `cubic-bezier`（除 globals.css 关键帧内部，那里是常量的 CSS 落点，值必须一致）。
- 过冲硬上限：scale ≤4% / 位移 ≤8px（换画位移 46px 是「坠出离场」不是过冲，不受此限）。
- 组件文件只导出组件；常量只进 `src/lib/`（ui-styling §10）。
- 定时器全部在 effect cleanup 中清理（快速切页/卸载无残留）。
- 现有 testid 一个不删；新增元素可新增 testid。

---

## 文件结构

| 文件 | 责任 | 改动 |
|---|---|---|
| `src/lib/motion-presets.ts` | 双弹簧曲线 + 换画时长常量（新） | 新建 |
| `src/styles/globals.css` | 换画/CRT/面板关键帧；删旧 fade 关键帧 | 修改 |
| `src/components/SurfaceBackground.tsx` | 坠出/落入换画 + CRT + data-swapping | 重写 |
| `src/components/PaintingLabel.tsx` | 展签组件（新） | 新建 |
| `src/components/SwapPaintingButton.tsx` | 挂展签、移除 title tooltip、连点锁 | 修改 |
| `src/components/BriefingDateColumn.tsx` | 日期选中 4px 落定 | 修改 |
| `src/components/article-assistant/ArticleAssistantPanel.tsx` | 导读面板开合不对称 | 修改 |
| `src/components/writing-assistant/WritingAssistantPanel.tsx` | 写作面板进场/退场动画 | 修改 |
| `tests/motion-presets.test.ts` | 常量测试（新） | 新建 |
| `tests/surface-background.test.tsx` | 换画动画测试（新） | 新建 |
| `tests/painting-label.test.tsx` | 展签测试（新） | 新建 |
| `tests/swap-painting-button.test.tsx` | 按钮+锁测试（新） | 新建 |
| `tests/briefing-date-column.test.tsx` | 补落定断言 | 修改 |
| `tests/writing-assistant-motion.test.tsx` | 面板动画测试（新） | 新建 |
| `e2e/specs/painting-swap.spec.ts` | 换画全链路 E2E（新） | 新建 |
| `.claude/rules/ui-styling.md` + `README.md` | §11 登记重量语法 + changelog | 修改 |

---

### Task 1: motion-presets 常量

**Files:**
- Create: `src/lib/motion-presets.ts`
- Test: `tests/motion-presets.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/motion-presets.test.ts
import { describe, expect, it } from 'vitest'
import {
  SPRING_SETTLE, SPRING_SLIDE,
  SWAP_FALL_MS, SWAP_DROP_MS, SWAP_DROP_DELAY_MS, SWAP_TOTAL_MS,
} from '@/lib/motion-presets'

describe('motion-presets', () => {
  it('exposes the two spring curves of the weight grammar', () => {
    expect(SPRING_SETTLE).toBe('cubic-bezier(0.34, 1.4, 0.5, 1)')
    expect(SPRING_SLIDE).toBe('cubic-bezier(0.22, 1, 0.36, 1)')
  })

  it('swap timing: fall 500ms, drop 550ms delayed 240ms, total 850ms lock', () => {
    expect(SWAP_FALL_MS).toBe(500)
    expect(SWAP_DROP_MS).toBe(550)
    expect(SWAP_DROP_DELAY_MS).toBe(240)
    expect(SWAP_TOTAL_MS).toBe(850)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/motion-presets.test.ts`
Expected: FAIL — `Cannot find module '@/lib/motion-presets'`

- [ ] **Step 3: Write the constants**

```ts
// src/lib/motion-presets.ts
// 重量/归位语法：全应用统一的双弹簧物理（ui-styling §11 登记：引力/轨道语言的触觉层）。
// 所有弹性过渡引用本文件常量；globals.css 关键帧是这些值的 CSS 落点，改值必须两边同步。

/** 落定：过冲回稳（换画落入、卫星归井、日期选中、抽屉开合的「停」） */
export const SPRING_SETTLE = 'cubic-bezier(0.34, 1.4, 0.5, 1)'
/** 滑动：快出慢停（抵达阶梯、面板进场的「迎」） */
export const SPRING_SLIDE = 'cubic-bezier(0.22, 1, 0.36, 1)'

/** 换画：旧画坠出时长 */
export const SWAP_FALL_MS = 500
/** 换画：新画落入时长 */
export const SWAP_DROP_MS = 550
/** 换画：新画落入的延迟（让坠落先发生） */
export const SWAP_DROP_DELAY_MS = 240
/** 换画全程 = max(500, 240+550) + 余量 = 连点锁时长 */
export const SWAP_TOTAL_MS = 850
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/motion-presets.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/motion-presets.ts tests/motion-presets.test.ts
git commit -m "feat(motion): add weight grammar spring presets"
```

---

### Task 2: globals.css 换画/CRT/面板关键帧

**Files:**
- Modify: `src/styles/globals.css`（painting-fade 段约 line 85-94 + reduced-motion 段约 line 133-141）

- [ ] **Step 1: 确认旧 fade 类没有其它使用者**

Run: `grep -rn "painting-fade" src/ tests/ e2e/ --include="*.tsx" --include="*.ts"`
Expected: 只有 `src/components/SurfaceBackground.tsx` 和 `globals.css` 本身。若出现其它文件，停下评估后再删。

- [ ] **Step 2: 替换关键帧（删旧添新）**

删除 `.painting-fade-in` / `.painting-fade-out` 及其 `@keyframes paintingFadeIn / paintingFadeOut`，替换为：

```css
/* ===== 换画重量语法（motion-presets 的 CSS 落点，值必须同步） ===== */
.painting-fall-out { animation: paintingFallOut 500ms cubic-bezier(0.55, 0, 0.85, 0.36) forwards; }
@keyframes paintingFallOut {
  to { transform: translateY(46px) rotate(0.6deg); opacity: 0; }
}
.painting-drop-in { animation: paintingDropIn 550ms cubic-bezier(0.34, 1.4, 0.5, 1) both; }
@keyframes paintingDropIn {
  0% { transform: translateY(-34px); opacity: 0; }
  60% { opacity: 1; }
  100% { transform: translateY(0); opacity: 1; }
}

/* 换画中点 CRT 细颗粒闪烁（微检定手势） */
.painting-crt {
  background:
    repeating-linear-gradient(0deg, rgba(255, 240, 210, 0.06) 0 1px, transparent 1px 3px),
    repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.08) 0 1px, transparent 1px 4px);
  opacity: 0;
}
.painting-crt.on { animation: paintingCrtBlink 220ms steps(2) 200ms 1; }
@keyframes paintingCrtBlink {
  0% { opacity: 0; }
  50% { opacity: 0.55; }
  100% { opacity: 0; }
}

/* ===== 面板开合不对称：开 = 快出慢停的迎接，关 = 慢出快收的抽离 ===== */
.panel-arise { animation: panelArise 300ms cubic-bezier(0.22, 1, 0.36, 1) both; }
@keyframes panelArise {
  0% { opacity: 0; transform: translateX(24px); }
  100% { opacity: 1; transform: translateX(0); }
}
.panel-depart { animation: panelDepart 200ms ease-in both; }
@keyframes panelDepart {
  0% { opacity: 1; transform: translateX(0); }
  100% { opacity: 0; transform: translateX(16px); }
}
```

- [ ] **Step 3: reduced-motion 退化（位移塌缩为 150ms 淡，不塌缩为无）**

把 reduced-motion 媒体查询里的 `.painting-fade-in, .painting-fade-out` 段替换为：

```css
@media (prefers-reduced-motion: reduce) {
  .painting-fall-out { animation: paintingSwapFadeOut 150ms ease-out forwards; }
  .painting-drop-in { animation: paintingSwapFadeIn 150ms ease-out both; }
  .painting-crt.on { animation: none; }
  .panel-arise { animation: panelFadeIn 150ms ease-out both; }
  .panel-depart { animation: panelFadeOut 150ms ease-out both; }
}
@keyframes paintingSwapFadeOut { to { opacity: 0; } }
@keyframes paintingSwapFadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes panelFadeIn { from { opacity: 0; } }
@keyframes panelFadeOut { to { opacity: 0; } }
```

（`.swap-btn svg` 的既有 reduce 规则保留不动。）

- [ ] **Step 4: Commit**

```bash
git add src/styles/globals.css
git commit -m "feat(motion): swap painting + panel keyframes with reduced-motion fallbacks"
```

---

### Task 3: SurfaceBackground 坠出/落入重写

**Files:**
- Modify: `src/components/SurfaceBackground.tsx`（全文重写）
- Test: `tests/surface-background.test.tsx`（新建）

- [ ] **Step 1: Write the failing test**

```tsx
// tests/surface-background.test.tsx
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({ ipc: { patchState: vi.fn(), getState: vi.fn() } }))
vi.mock('@/lib/paintings', () => ({ manifest: [], pickRandom: vi.fn(() => null) }))

import { useStore } from '@/store'
import { SurfaceBackground } from '@/components/SurfaceBackground'

const PAINT_A = { id: 'a', painter: 'Mark Rothko', title: 'A', url: 'paintings/a.jpg' }
const PAINT_B = { id: 'b', painter: 'Guy Billout', title: 'B', url: 'paintings/b.jpg' }

function seedPaintings(p: typeof PAINT_A) {
  useStore.setState({
    currentPaintings: { cover: null, home: null, study: null, briefing: p },
  })
}

describe('SurfaceBackground weight grammar', () => {
  beforeEach(() => { cleanup(); vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('first mount shows the painting immediately with no swap animation', () => {
    seedPaintings(PAINT_A)
    render(<SurfaceBackground surface="briefing" />)
    const bg = screen.getByTestId('surface-background')
    expect(bg.getAttribute('data-swapping')).toBeNull()
    const img = bg.querySelector('img')!
    expect(img.getAttribute('src')).toBe('paintings/a.jpg')
    expect(img.className).not.toContain('painting-drop-in')
  })

  it('swap: old falls out, new drops in delayed, settles after 850ms', () => {
    seedPaintings(PAINT_A)
    render(<SurfaceBackground surface="briefing" />)
    act(() => { seedPaintings(PAINT_B) })

    const bg = screen.getByTestId('surface-background')
    expect(bg.getAttribute('data-swapping')).toBe('')
    const imgs = bg.querySelectorAll('img')
    expect(imgs.length).toBe(2)
    expect(imgs[0].className).toContain('painting-fall-out')
    expect(imgs[1].className).toContain('painting-drop-in')
    expect(imgs[1].style.animationDelay).toBe('240ms')

    act(() => { vi.advanceTimersByTime(900) })
    expect(bg.getAttribute('data-swapping')).toBeNull()
    const settled = bg.querySelectorAll('img')
    expect(settled.length).toBe(1)
    expect(settled[0].getAttribute('src')).toBe('paintings/b.jpg')
    expect(settled[0].className).not.toContain('painting-drop-in')
  })

  it('CRT grain overlay activates during swap', () => {
    seedPaintings(PAINT_A)
    render(<SurfaceBackground surface="briefing" />)
    act(() => { seedPaintings(PAINT_B) })
    const crt = screen.getByTestId('surface-background').querySelector('.painting-crt')!
    expect(crt.className).toContain('on')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/surface-background.test.tsx`
Expected: FAIL — 旧实现无 `data-swapping`、无 `painting-fall-out/drop-in`、无 `.painting-crt`

- [ ] **Step 3: 重写 SurfaceBackground**

```tsx
// src/components/SurfaceBackground.tsx
import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store'
import { SWAP_DROP_DELAY_MS, SWAP_TOTAL_MS } from '@/lib/motion-presets'

interface Props {
  surface: 'cover' | 'home' | 'study' | 'briefing'
}

export function SurfaceBackground({ surface }: Props) {
  const painting = useStore(s => s.currentPaintings[surface])
  const [settledUrl, setSettledUrl] = useState<string | null>(painting?.url ?? null)
  const [outgoingUrl, setOutgoingUrl] = useState<string | null>(null)
  const [incomingUrl, setIncomingUrl] = useState<string | null>(null)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    if (!painting) return
    if (painting.url === settledUrl || painting.url === incomingUrl) return
    // 换画重量语法：旧画坠出（500ms），新画延迟 240ms 落入过冲回稳（550ms），
    // 中点 CRT 颗粒闪烁；SWAP_TOTAL_MS 后落定。cleanup 清定时器，快速切页无残留。
    setOutgoingUrl(settledUrl)
    setIncomingUrl(painting.url)
    timer.current = window.setTimeout(() => {
      setSettledUrl(painting.url)
      setOutgoingUrl(null)
      setIncomingUrl(null)
    }, SWAP_TOTAL_MS)
    return () => { if (timer.current) clearTimeout(timer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [painting?.url])

  if (!painting || !settledUrl) return null
  const swapping = incomingUrl !== null

  return (
    <div
      data-testid="surface-background"
      data-swapping={swapping || undefined}
      className="fixed inset-0 z-0 pointer-events-none"
    >
      {outgoingUrl && (
        <img
          src={outgoingUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover painting-fall-out"
        />
      )}
      <img
        key={incomingUrl ?? settledUrl}
        src={incomingUrl ?? settledUrl}
        alt=""
        className={`absolute inset-0 w-full h-full object-cover ${incomingUrl ? 'painting-drop-in' : ''}`}
        style={incomingUrl ? { animationDelay: `${SWAP_DROP_DELAY_MS}ms` } : undefined}
      />
      <div className={`absolute inset-0 painting-crt ${swapping ? 'on' : ''}`} />
      <div className="absolute inset-0 painting-vignette" />
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/surface-background.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/SurfaceBackground.tsx tests/surface-background.test.tsx
git commit -m "feat(paintings): weight-grammar swap (fall out / drop in / CRT grain)"
```

---

### Task 4: PaintingLabel 展签组件

**Files:**
- Create: `src/components/PaintingLabel.tsx`
- Test: `tests/painting-label.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/painting-label.test.tsx
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({ ipc: { patchState: vi.fn(), getState: vi.fn() } }))
vi.mock('@/lib/paintings', () => ({ manifest: [], pickRandom: vi.fn(() => null) }))

import { useStore } from '@/store'
import { PaintingLabel } from '@/components/PaintingLabel'

const PAINT = { id: 'a', painter: 'Mark Rothko', title: 'Composition I', url: 'paintings/a.jpg', year: 1931 }

function seed(p: typeof PAINT | null) {
  useStore.setState({ currentPaintings: { cover: null, home: null, study: null, briefing: p } })
}

describe('PaintingLabel', () => {
  beforeEach(() => { cleanup(); vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('renders attribution in wall-label style, hidden until hover (opacity-0 base)', () => {
    seed(PAINT)
    render(<PaintingLabel surface="briefing" />)
    const label = screen.getByTestId('painting-label')
    expect(label.textContent).toBe('Mark Rothko · Composition I · 1931')
    expect(label.className).toContain('italic')
    expect(label.className).toContain('opacity-0')
    expect(label.className).toContain('group-hover:opacity-70')
  })

  it('renders nothing when no painting', () => {
    seed(null)
    const { container } = render(<PaintingLabel surface="briefing" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('flashes once (~1.8s) after the painting changes, then retreats', () => {
    seed(PAINT)
    render(<PaintingLabel surface="briefing" />)
    const label = screen.getByTestId('painting-label')
    expect(label.getAttribute('data-flash')).toBeNull()

    act(() => { seed({ ...PAINT, id: 'b', url: 'paintings/b.jpg', title: 'Interior' }) })
    expect(label.getAttribute('data-flash')).toBe('')

    act(() => { vi.advanceTimersByTime(1900) })
    expect(label.getAttribute('data-flash')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/painting-label.test.tsx`
Expected: FAIL — `Cannot find module '@/components/PaintingLabel'`

- [ ] **Step 3: Write the component**

```tsx
// src/components/PaintingLabel.tsx
import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store'
import { formatAttribution } from '@/lib/paintings'

interface Props {
  surface: 'cover' | 'home' | 'study' | 'briefing'
  className?: string
}

// 美术馆展签：平时不在场，观者走近（hover 换画按钮所在 group）才显现；
// 换画后浮现一次（1.8s）作为「已挂上」的确认，然后隐退。替换原 title tooltip。
export function PaintingLabel({ surface, className = '' }: Props) {
  const painting = useStore(s => s.currentPaintings[surface])
  const [flash, setFlash] = useState(false)
  const prevUrl = useRef(painting?.url)

  useEffect(() => {
    if (!painting?.url || painting.url === prevUrl.current) return
    prevUrl.current = painting.url
    setFlash(true)
    const t = setTimeout(() => setFlash(false), 1800)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [painting?.url])

  if (!painting) return null

  return (
    <span
      data-testid="painting-label"
      data-flash={flash || undefined}
      className={`italic tracking-widest text-[11px] transition-all duration-300 ${
        flash ? 'opacity-70 translate-y-0' : 'opacity-0 translate-y-[2px]'
      } group-hover:opacity-70 group-hover:translate-y-0 ${className}`}
    >
      {formatAttribution(painting)}
    </span>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/painting-label.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/PaintingLabel.tsx tests/painting-label.test.tsx
git commit -m "feat(paintings): wall-label attribution component"
```

---

### Task 5: SwapPaintingButton 挂展签 + 移除 tooltip + 连点锁

**Files:**
- Modify: `src/components/SwapPaintingButton.tsx`
- Test: `tests/swap-painting-button.test.tsx`（新建）

注意：本任务把 `title={tooltip}` 移除（spec：同一信息只保留一种可见协议）。先跑 `grep -rn "title" tests/ e2e/ | grep -i swap` 确认没有断言依赖旧 tooltip；若有，同步删除该断言。

- [ ] **Step 1: Write the failing test**

```tsx
// tests/swap-painting-button.test.tsx
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({ ipc: { patchState: vi.fn(), getState: vi.fn() } }))
vi.mock('@/lib/paintings', () => ({ manifest: [], pickRandom: vi.fn(() => null) }))

import { useStore } from '@/store'
import { SwapPaintingButton } from '@/components/SwapPaintingButton'

const PAINT = { id: 'a', painter: 'Mark Rothko', title: 'A', url: 'paintings/a.jpg' }

describe('SwapPaintingButton', () => {
  beforeEach(() => {
    cleanup()
    vi.useFakeTimers()
    useStore.setState({ currentPaintings: { cover: null, home: null, study: null, briefing: PAINT } })
  })
  afterEach(() => { vi.useRealTimers() })

  it('renders wall label and no title tooltip (single visible protocol)', () => {
    render(<SwapPaintingButton surface="briefing" data-testid="swap-btn" />)
    expect(screen.getByTestId('painting-label')).toBeInTheDocument()
    expect(screen.getByTestId('swap-btn').getAttribute('title')).toBeNull()
  })

  it('locks against double-click during the 850ms swap, unlocks after', () => {
    render(<SwapPaintingButton surface="briefing" data-testid="swap-btn" />)
    const btn = screen.getByTestId('swap-btn') as HTMLButtonElement
    fireEvent.click(btn)
    expect(btn.disabled).toBe(true)
    act(() => { vi.advanceTimersByTime(900) })
    expect(btn.disabled).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/swap-painting-button.test.tsx`
Expected: FAIL — 旧实现有 `title`、无 `painting-label`、无锁

- [ ] **Step 3: Rewrite the component**

```tsx
// src/components/SwapPaintingButton.tsx
import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store'
import { SWAP_TOTAL_MS } from '@/lib/motion-presets'
import { PaintingLabel } from './PaintingLabel'

interface Props {
  surface: 'cover' | 'home' | 'study' | 'briefing'
  className?: string
  'data-testid'?: string
}

export function SwapPaintingButton({ surface, className = '', 'data-testid': dataTestId }: Props) {
  const swap = useStore(s => s.swapPainting)
  const [locked, setLocked] = useState(false)
  const lockTimer = useRef<number | null>(null)

  useEffect(() => () => { if (lockTimer.current) clearTimeout(lockTimer.current) }, [])

  const onSwap = () => {
    if (locked) return // 连点锁：换画动画全程（850ms）内不接受第二次触发
    setLocked(true)
    swap(surface)
    lockTimer.current = window.setTimeout(() => setLocked(false), SWAP_TOTAL_MS)
  }

  return (
    <span className={`group inline-flex items-center gap-2 ${className}`}>
      <PaintingLabel surface={surface} />
      <button
        data-testid={dataTestId}
        type="button"
        onClick={onSwap}
        disabled={locked}
        className={`swap-btn ${locked ? 'opacity-50 cursor-default' : ''}`}
        aria-label="换一幅画"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-4 h-4 transition-transform duration-300 group-hover:rotate-180"
        >
          <path d="M21 12a9 9 0 1 1-3.51-7.13M21 4v5h-5"/>
        </svg>
      </button>
    </span>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/swap-painting-button.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: 全量回归调用点（布局未破）**

Run: `npx vitest run tests/`
Expected: 全绿。调用点（Briefing.tsx / AcademicBriefingLayout / AnthropicBlogPanel / AnthropicArticleReader / 各页面）原有 className（如 `text-parchment/70 hover:text-parchment`）现在落在 wrapper 上，文字色对展签同样生效——这是预期行为。

- [ ] **Step 6: Commit**

```bash
git add src/components/SwapPaintingButton.tsx tests/swap-painting-button.test.tsx
git commit -m "feat(paintings): mount wall label on swap button, drop tooltip, add swap lock"
```

---

### Task 6: 日期选中 4px 落定

**Files:**
- Modify: `src/components/BriefingDateColumn.tsx:84` 附近
- Test: `tests/briefing-date-column.test.tsx`（补一条）

- [ ] **Step 1: Write the failing test（追加到现有文件）**

```tsx
  it('settles the current date item 4px toward content with the settle spring', () => {
    render(
      <BriefingDateColumn
        collapsed={false}
        history={[{ date: '2026-07-10', filePath: '/x.md' }]}
        currentDate="2026-07-10"
        today="2026-07-11"
        onSelect={vi.fn()}
        onReceiveToday={vi.fn()}
        theme="academic"
      />
    )
    const item = screen.getByTestId('briefing-date-item-2026-07-10')
    expect(item.style.transform).toBe('translateX(4px)')
    expect(item.style.transitionTimingFunction).toBe('cubic-bezier(0.34, 1.4, 0.5, 1)')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/briefing-date-column.test.tsx`
Expected: FAIL — 新断言的 transform 为空

- [ ] **Step 3: 修改条目渲染**

文件顶部加 import：

```ts
import { SPRING_SETTLE } from '@/lib/motion-presets'
```

line 84 的条目 button 改为：

```tsx
            className={`w-full text-left px-3 py-2 rounded transition-all duration-300 ${isCurrent ? activeItem : itemBase}`}
            style={{
              transform: isCurrent ? 'translateX(4px)' : undefined,
              transitionTimingFunction: SPRING_SETTLE,
            }}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/briefing-date-column.test.tsx`
Expected: PASS（含旧断言 `bg-ember/20`，`transition-all` 不影响类断言）

- [ ] **Step 5: Commit**

```bash
git add src/components/BriefingDateColumn.tsx tests/briefing-date-column.test.tsx
git commit -m "feat(briefing): date selection settles 4px with spring"
```

---

### Task 7: 助手面板开合不对称

**Files:**
- Modify: `src/components/article-assistant/ArticleAssistantPanel.tsx:93`
- Modify: `src/components/writing-assistant/WritingAssistantPanel.tsx`
- Test: `tests/writing-assistant-motion.test.tsx`（新建）

- [ ] **Step 1: Write the failing test**

```tsx
// tests/writing-assistant-motion.test.tsx
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({ ipc: { patchState: vi.fn(), getState: vi.fn() } }))
vi.mock('@/lib/paintings', () => ({ manifest: [], pickRandom: vi.fn(() => null) }))

import { useStore } from '@/store'
import { WritingAssistantPanel } from '@/components/writing-assistant/WritingAssistantPanel'

describe('WritingAssistantPanel open/close asymmetry', () => {
  beforeEach(() => {
    cleanup()
    vi.useFakeTimers()
    useStore.setState({ writingAssistantOpen: true, writingAssistantWidth: 320 })
  })
  afterEach(() => { vi.useRealTimers() })

  it('open: panel enters with panel-arise (ease-out welcome)', () => {
    render(<WritingAssistantPanel />)
    expect(screen.getByTestId('writing-assistant-panel').className).toContain('panel-arise')
  })

  it('close: panel-depart plays 200ms before the store actually closes', () => {
    render(<WritingAssistantPanel />)
    fireEvent.click(screen.getByTestId('writing-assistant-close-btn'))
    expect(screen.getByTestId('writing-assistant-panel').className).toContain('panel-depart')
    expect(useStore.getState().writingAssistantOpen).toBe(true) // 仍在播退场
    act(() => { vi.advanceTimersByTime(250) })
    expect(useStore.getState().writingAssistantOpen).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/writing-assistant-motion.test.tsx`
Expected: FAIL — 无 `panel-arise`，关闭即时生效

- [ ] **Step 3: WritingAssistantPanel 改造**

```tsx
// src/components/writing-assistant/WritingAssistantPanel.tsx
import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store'
import { ArticleDivider } from '@/components/article-assistant/ArticleDivider'
import { WritingAssistantMessages } from './WritingAssistantMessages'
import { WritingAssistantInput } from './WritingAssistantInput'

export function WritingAssistantPanel() {
  const open = useStore((s) => s.writingAssistantOpen)
  const width = useStore((s) => s.writingAssistantWidth)
  const setOpen = useStore((s) => s.setWritingAssistantOpen)
  const setWidth = useStore((s) => s.setWritingAssistantWidth)
  const [closing, setClosing] = useState(false)
  const closeTimer = useRef<number | null>(null)

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current) }, [])
  // 外部重开时复位本地 closing（depart 播完前被重新打开的边缘）
  useEffect(() => { if (open) setClosing(false) }, [open])

  // 关 = 慢出快收：先播 200ms 退场，再真正关闭（不对称：开是迎接，关是抽离）
  const requestClose = () => {
    if (closing) return
    setClosing(true)
    closeTimer.current = window.setTimeout(() => setOpen(false), 200)
  }

  // Collapsed state: right-edge tab
  if (!open) {
    return (
      <div
        data-testid="writing-assistant-collapsed"
        className="w-6 bg-ember text-white text-xs flex items-center justify-center cursor-pointer shrink-0 select-none"
        style={{ writingMode: 'vertical-rl' }}
        onClick={() => setOpen(true)}
      >
        AI 助手 ▸
      </div>
    )
  }

  return (
    <div
      data-testid="writing-assistant-panel"
      className={`relative z-[5] flex h-full shrink-0 ${closing ? 'panel-depart' : 'panel-arise'}`}
    >
      <ArticleDivider
        collapsed={false}
        onToggleCollapse={requestClose}
        onResize={(w) => {
          const maxWidth = window.innerWidth * 0.45
          if (w < 40) {
            requestClose()
          } else {
            setWidth(Math.max(200, Math.min(w, maxWidth)))
          }
        }}
        theme="academic"
      />
      <div className="h-full overflow-hidden" style={{ width }}>
        <div className="h-full flex flex-col min-w-0 border-l border-parchment/20 bg-[#1a1512]">
          <div className="h-9 flex items-center justify-between px-3 border-b border-parchment/10 shrink-0">
            <span className="text-[11px] tracking-[0.2em] text-parchment/80 font-serif">AI 写作助手</span>
            <button
              data-testid="writing-assistant-close-btn"
              className="text-parchment/60 hover:text-ember text-sm leading-none px-1"
              onClick={requestClose}
              aria-label="关闭"
            >
              ✕
            </button>
          </div>
          <WritingAssistantMessages />
          <WritingAssistantInput />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: ArticleAssistantPanel 导读宽度过渡改不对称**

`ArticleAssistantPanel.tsx:93` 一行改为（`guideCollapsed` 已在组件内）：

```tsx
          <div className={`h-full overflow-hidden ${resizing ? '' : guideCollapsed ? 'transition-[width] duration-200 ease-in' : 'transition-[width] duration-300 ease-out'}`} style={{ width: sidebarWidth }}>
```

（开 = 300ms ease-out 迎接；关 = 200ms ease-in 抽离。宽度轴不做位移过冲——过冲只用于位移类，spec §3-F2。）

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/writing-assistant-motion.test.tsx tests/writing-assistant-panel.test.tsx tests/GuideSidebar.test.tsx tests/ArticleDivider.test.tsx`
Expected: PASS（新 2 条 + 既有面板测试不 break）

- [ ] **Step 6: Commit**

```bash
git add src/components/writing-assistant/WritingAssistantPanel.tsx src/components/article-assistant/ArticleAssistantPanel.tsx tests/writing-assistant-motion.test.tsx
git commit -m "feat(panels): asymmetric open/close motion for assistant panels"
```

---

### Task 8: E2E 换画全链路

**Files:**
- Create: `e2e/specs/painting-swap.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
// e2e/specs/painting-swap.spec.ts
import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedBriefing } from '../helpers/test-library'

function localToday(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

test.describe('@p1 painting swap weight grammar', () => {
  test('swap: weight animation runs, button locks, wall label updates to real attribution', async ({ window, testLibraryPath }) => {
    seedBriefing(testLibraryPath, localToday())
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.locator(SELECTORS.briefing.receiveDigestButton).click()
    await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 15000 })

    const bg = window.locator('[data-testid="surface-background"]')
    const label = window.locator('[data-testid="painting-label"]').first()
    // 展签存在且携带真实署名（画家 · 标题）
    await expect(label).toBeAttached()
    const before = (await label.textContent()) ?? ''
    expect(before).toContain('·')

    const swapBtn = window.locator(SELECTORS.briefing.swapPaintingButton)
    await swapBtn.click()
    // 换画动画期间：背景进入 swapping 态，按钮锁定防连点
    await expect(bg).toHaveAttribute('data-swapping', '')
    await expect(swapBtn).toBeDisabled()
    // 落定：动画结束、锁定解除、署名变化（pickRandom 排除当前 id，必然不同）
    await expect(bg).not.toHaveAttribute('data-swapping', '', { timeout: 3000 })
    await expect(swapBtn).toBeEnabled()
    const after = (await label.textContent()) ?? ''
    expect(after).not.toBe(before)
  })
})
```

- [ ] **Step 2: Run E2E**

Run: `npx playwright test --config e2e/playwright.config.ts painting-swap`
Expected: PASS (1 test)。若 `academicLayout` 选择器名与 seedBriefing 签名有出入，对照 `e2e/specs/briefing-aesthetics.spec.ts` 与 `e2e/helpers/selectors.ts`、`e2e/helpers/test-library.ts` 修正——不得改断言语义。

- [ ] **Step 3: Commit**

```bash
git add e2e/specs/painting-swap.spec.ts
git commit -m "test(e2e): painting swap weight grammar + wall label"
```

---

### Task 9: ui-styling §11 登记 + 全量验证

**Files:**
- Modify: `.claude/rules/ui-styling.md`（§11）
- Modify: `.claude/rules/README.md`（Changelog）

- [ ] **Step 1: §11 追加一条（重量语法登记）**

在 `ui-styling.md` §11 的 bullet 列表末尾追加：

```markdown
- 重量/归位语法（`motion-presets` 双弹簧：SPRING_SETTLE / SPRING_SLIDE）登记为引力/轨道语言的触觉层；换画、归位、日期选中、面板开合一律引用同一常量，不得自造曲线。过冲硬上限 scale ≤4% / 位移 ≤8px。
```

- [ ] **Step 2: README.md Changelog 追加一行**

在 `.claude/rules/README.md` 的 Changelog 列表顶部追加：

```markdown
- `2026-07-25` ui-styling §11 登记第四类资产：重量/归位语法（motion-presets 双弹簧，引力语言的触觉层；来自审美提升批一：换画坠出/落入、面板开合不对称、日期落定）。
```

- [ ] **Step 3: 全量测试 + 构建**

Run: `npm run test`
Expected: 全绿（含本批新增 8 个测试文件/用例）

Run: `npm run build`
Expected: 构建成功无 TS 错误

- [ ] **Step 4: Commit**

```bash
git add .claude/rules/ui-styling.md .claude/rules/README.md
git commit -m "docs(rules): register weight grammar in ui-styling §11"
```

---

## 边界行为清单核对（spec §7 中本批相关项）

| # | 边界 | 覆盖处 |
|---|---|---|
| 换画连点 | Task 5 按钮锁 850ms + Task 8 E2E `toBeDisabled` |
| 快速切页/卸载 | Task 3/4/5/7 全部定时器在 cleanup 清理；Task 3 测试覆盖 settle |
| 首次进入 surface | Task 3 测试：首挂载无动画、立即显示（不闪棕色底） |
| reduced-motion | Task 2 媒体查询：fall/drop/CRT/panel 全部塌缩为 150ms 淡 |
| Newspaper 主题 | 展签经 wrapper 的 `text-*` className 继承墨色，无专属代码路径 |
| 无画作 | Task 4 测试：`PaintingLabel` 不渲染 |
| 过冲红线 | 换画 46px 是离场位移非过冲；面板/日期均 ≤8px / 无 scale |
