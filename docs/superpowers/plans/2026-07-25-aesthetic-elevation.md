# 夜航简报审美提升 · 总实施计划（四部分 · 一份计划）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地 spec 全部十件入藏设计——物理层（重量语法/换画通用组件/展签）、仪式层（生成仪式 B/抵达）、阅读层（燃熄/阖卷/内化脊柱）、照明层（烛光随行/烛光有识/并置/聚焦呼吸）。

**Architecture:** 纯渲染层为主：3 个新 hook（generation-transition / reading-finished / focus-zone）+ 1 个常量文件 + 少量 store 瞬态字段（脉搏/抵达/烛光呼吸）与 3 个持久化字段（candlelightEnabled/briefingRead/paintingPlateEnabled）。零新增 IPC（复用 annotationsRead 与 patchState）。

**Tech Stack:** Electron 30 + React 18 + TS + Tailwind 3.4 + zustand + Vitest + Playwright e2e。

**Spec:** `docs/superpowers/specs/2026-07-25-briefing-aesthetic-elevation-design.md`（唯一 spec；本计划为其唯一实施计划）

**执行环境：** 直接在 `main` 分支。

**部分划分（按依赖排序，每部分末尾全量回归 + commit）：**
- **Part 1 物理层**（Task 1-9）：motion-presets、换画通用组件、展签、日期落定、面板开合 —— 无依赖，先行
- **Part 2 仪式层**（Task 10-15）：生成仪式 B（星图滑入/脉搏/检定/失败收束）+ 抵达（四源通用）—— 依赖 Part 1 的弹簧常量
- **Part 3 阅读层**（Task 16-21）：use-reading-finished、燃熄、阖卷、内化脊柱 —— 依赖 store 瞬态字段（Task 10）
- **Part 4 照明层**（Task 22-28）：烛光随行、烛光有识、并置、聚焦呼吸 —— F1/F7 联动依赖 Part 3 的 candleBreathAt 通道

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

---
---

# Part 2 仪式层（F4 生成仪式 B + F5 抵达）

**本部分铁律：**
- 星图 testid 契约一个不删：`briefing-progress`、`briefing-progress-step-{key}`（docked 后仍在 DOM）、`briefing-constellation`、`briefing-constellation-well`。
- 所有过渡定时器在 cleanup 清理；组件 key = source+date 重挂载归零。
- 「诚实约束」：`finalizing` 华彩绑定真实 stage 时长，不设人为最短时长。

---

### Task 10: store 瞬态字段（脉搏 / 抵达 / 烛光呼吸通道）

**Files:**
- Modify: `src/store/index.ts`（类型区 ~line 120、init ~line 422、generateBriefing line 611-650、generateJobBriefing line 679+）
- Test: `tests/store-generation-pulse.test.ts`（新建）

- [ ] **Step 1: Write the failing test**

```ts
// tests/store-generation-pulse.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest'

let progressCb: ((stage: string, detail?: string) => void) | null = null
vi.mock('@/lib/ipc', () => ({
  ipc: {
    patchState: vi.fn(),
    getState: vi.fn(),
    onBriefingProgress: vi.fn((cb: (stage: string, detail?: string) => void) => {
      progressCb = cb
      return () => {}
    }),
    briefingGenerate: vi.fn(async () => ({
      title: '夜航简报', content: '## A\n正文', date: '2026-07-25',
      generatedAt: '2026-07-25T01:00:00.000Z', filePath: '/lib/夜航简报/夜航简报-2026-07-25.md',
      sourceStatus: {},
    })),
  },
}))

import { useStore } from '@/store'

describe('store generation pulse fields', () => {
  beforeEach(() => {
    progressCb = null
    useStore.setState({ briefingPulseAt: null, briefingArrivedAt: null, candleBreathAt: null })
  })

  it('progress events stamp briefingPulseAt; success clears it and stamps briefingArrivedAt', async () => {
    const p = useStore.getState().generateBriefing('2026-07-25')
    expect(progressCb).toBeTypeOf('function')
    progressCb!('extracting', '5 个来源')
    expect(useStore.getState().briefingPulseAt).toBeTypeOf('number')
    expect(useStore.getState().briefingStage).toBe('extracting')

    await p
    expect(useStore.getState().briefingPulseAt).toBeNull()
    expect(useStore.getState().briefingArrivedAt).toBeTypeOf('number')
  })

  it('breathCandle stamps candleBreathAt (阖卷→烛光通道)', () => {
    useStore.getState().breathCandle()
    expect(useStore.getState().candleBreathAt).toBeTypeOf('number')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/store-generation-pulse.test.ts`
Expected: FAIL — `breathCandle is not a function` / `briefingPulseAt` undefined

- [ ] **Step 3: store 改造**

类型区（`briefingStage` 声明附近）加：

```ts
  briefingPulseAt: number | null
  briefingArrivedAt: number | null
  candleBreathAt: number | null
  breathCandle: () => void
```

init（`briefingStage: null` 附近）加：

```ts
  briefingPulseAt: null,
  briefingArrivedAt: null,
  candleBreathAt: null,
```

（命名说明：本字段即 spec 中的 `lastChunkAt` 概念——briefing 生成非 SSE 流，无 chunk 事件落点；实际信号源是 `onBriefingProgress` 的 stage/detail 进度事件，故命名为 `briefingPulseAt`。spec §3-F4 的「token 呼吸」落地为「进度事件节拍呼吸」。）

`generateBriefing` 的 progress 订阅与成功分支改为：

```ts
    const unsubscribe = ipc.onBriefingProgress((stage, detail) => {
      set({ briefingStage: stage, briefingStageDetail: detail ?? null, briefingPulseAt: Date.now() })
    })

    try {
      const result = await ipc.briefingGenerate({ date, profile: s.profile, force: opts?.force })
      set({
        briefing: { result, loading: false, error: null },
        briefingStage: null,
        briefingStageDetail: null,
        briefingPulseAt: null,
        briefingArrivedAt: Date.now(),
      })
```

catch 分支与 `cancelBriefing` 的 set 里补 `briefingPulseAt: null`。`generateJobBriefing` 的 progress 订阅与成功/失败分支做同样处理（共享 `briefingPulseAt`/`briefingArrivedAt`，两源不会同屏生成）。action 区加：

```ts
  breathCandle: () => set({ candleBreathAt: Date.now() }),
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/store-generation-pulse.test.ts tests/safe-json.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/store/index.ts tests/store-generation-pulse.test.ts
git commit -m "feat(store): transient pulse/arrival/candle-breath fields for generation ceremony"
```

---

### Task 11: use-generation-transition hook

**Files:**
- Create: `src/lib/use-generation-transition.ts`
- Test: `tests/use-generation-transition.test.ts`（新建）

- [ ] **Step 1: Write the failing test**

```ts
// tests/use-generation-transition.test.ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useGenerationTransition, RESOLVED_MS, DEPART_MS, FAILING_MS } from '@/lib/use-generation-transition'

describe('useGenerationTransition', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('success: generating → resolved → departing → idle, fresh=true', () => {
    const { result, rerender } = renderHook(
      ({ loading, hasResult, hasError }) => useGenerationTransition('k1', loading, hasResult, hasError),
      { initialProps: { loading: true, hasResult: false, hasError: false } },
    )
    expect(result.current.phase).toBe('generating')

    rerender({ loading: false, hasResult: true, hasError: false })
    expect(result.current.phase).toBe('resolved')
    expect(result.current.fresh).toBe(true)

    act(() => { vi.advanceTimersByTime(RESOLVED_MS + 10) })
    expect(result.current.phase).toBe('departing')
    act(() => { vi.advanceTimersByTime(DEPART_MS + 10) })
    expect(result.current.phase).toBe('idle')
    expect(result.current.fresh).toBe(true) // fresh 保持到 key 变化
  })

  it('failure: generating → failing (1000ms) → failed', () => {
    const { result, rerender } = renderHook(
      ({ loading, hasResult, hasError }) => useGenerationTransition('k1', loading, hasResult, hasError),
      { initialProps: { loading: true, hasResult: false, hasError: false } },
    )
    rerender({ loading: false, hasResult: false, hasError: true })
    expect(result.current.phase).toBe('failing')
    act(() => { vi.advanceTimersByTime(FAILING_MS + 10) })
    expect(result.current.phase).toBe('failed')
  })

  it('cancel: loading drops with no result/error → back to idle (冻结回中性)', () => {
    const { result, rerender } = renderHook(
      ({ loading, hasResult, hasError }) => useGenerationTransition('k1', loading, hasResult, hasError),
      { initialProps: { loading: true, hasResult: false, hasError: false } },
    )
    rerender({ loading: false, hasResult: false, hasError: false })
    expect(result.current.phase).toBe('idle')
  })

  it('revisit: result already present on mount without loading → idle, fresh=false', () => {
    const { result } = renderHook(() => useGenerationTransition('k1', false, true, false))
    expect(result.current.phase).toBe('idle')
    expect(result.current.fresh).toBe(false)
  })

  it('key change resets phase and fresh', () => {
    const { result, rerender } = renderHook(
      ({ k, loading }) => useGenerationTransition(k, loading, false, false),
      { initialProps: { k: 'a', loading: true } },
    )
    expect(result.current.phase).toBe('generating')
    rerender({ k: 'b', loading: false })
    expect(result.current.phase).toBe('idle')
    expect(result.current.fresh).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/use-generation-transition.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the hook**

```ts
// src/lib/use-generation-transition.ts
import { useEffect, useRef, useState } from 'react'

export type GenerationPhase = 'idle' | 'generating' | 'resolved' | 'departing' | 'failing' | 'failed'

/** 成功收束（光子坠心绽光）时长 */
export const RESOLVED_MS = 900
/** 星图退潮时长 */
export const DEPART_MS = 600
/** 失败收束（屏息 400ms + 漂移褪冷 600ms）时长 */
export const FAILING_MS = 1000

/**
 * 生成→阅读/错误的过渡状态机（F4/F5 的编排核心）。
 * fresh：本次 key 内是否经历过 resolved（= 新抵达，配享有抵达动画；revisit 不重演）。
 * key = `${source}:${date}`，切换即归零（ui-styling §7 边界：快速切换无残留）。
 */
export function useGenerationTransition(
  key: string,
  loading: boolean,
  hasResult: boolean,
  hasError: boolean,
): { phase: GenerationPhase; fresh: boolean } {
  const [phase, setPhase] = useState<GenerationPhase>('idle')
  const [fresh, setFresh] = useState(false)
  const timers = useRef<number[]>([])
  const wasLoading = useRef(false)

  useEffect(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    wasLoading.current = false
    setPhase('idle')
    setFresh(false)
  }, [key])

  useEffect(() => {
    const clear = () => { timers.current.forEach(clearTimeout); timers.current = [] }
    if (loading) {
      wasLoading.current = true
      setPhase('generating')
      return clear
    }
    if (wasLoading.current) {
      wasLoading.current = false
      if (hasError) {
        setPhase('failing')
        timers.current.push(window.setTimeout(() => setPhase('failed'), FAILING_MS))
      } else if (hasResult) {
        setFresh(true)
        setPhase('resolved')
        timers.current.push(window.setTimeout(() => setPhase('departing'), RESOLVED_MS))
        timers.current.push(window.setTimeout(() => setPhase('idle'), RESOLVED_MS + DEPART_MS))
      } else {
        setPhase('idle') // 取消（BRIEFING_ABORTED）：冻结回中性，无屏息
      }
      return clear
    }
    if (hasError) setPhase('failed')
    return clear
  }, [loading, hasResult, hasError])

  return { phase, fresh }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/use-generation-transition.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/use-generation-transition.ts tests/use-generation-transition.test.ts
git commit -m "feat(ceremony): generation transition state machine hook"
```

---

### Task 12: BriefingConstellation 生成仪式 B 改造

**Files:**
- Modify: `src/components/briefing/BriefingConstellation.tsx`
- Modify: `src/styles/globals.css`（光子/退潮/失败关键帧）
- Test: `tests/briefing-constellation.test.tsx`（追加）

- [ ] **Step 1: globals.css 追加星图仪式关键帧**

```css
/* ===== 生成仪式（F4）：卫星滑入 / 检定光子 / 退潮 / 失败褪冷 ===== */
.sat-docked {
  left: 50% !important;
  top: 44% !important;
  transform: translate(-50%, -50%) scale(0.6) !important;
  opacity: 0;
}
.constellation-photon {
  position: absolute;
  left: 50%; top: 50%;
  width: 7px; height: 7px; margin: -3.5px;
  border-radius: 50%;
  background: #eec287;
  box-shadow: 0 0 10px 3px rgba(238, 194, 135, 0.7);
}
.constellation-photon.p1 { animation: photonOrbit 1.6s linear infinite; }
.constellation-photon.p2 { animation: photonOrbit 1.6s linear infinite reverse; }
@keyframes photonOrbit {
  from { transform: rotate(0deg) translateX(72px); }
  to { transform: rotate(360deg) translateX(72px); }
}
.constellation-well-resolved .constellation-photon {
  animation: none;
  transform: rotate(0deg) translateX(0) scale(0.2);
  opacity: 0;
  transition: transform 450ms cubic-bezier(0.6, 0, 0.8, 0.4), opacity 450ms;
}
.constellation-well-bloom { animation: constellationBloom 800ms cubic-bezier(0.34, 1.4, 0.5, 1) 1; }
@keyframes constellationBloom {
  30% { box-shadow: 0 0 60px 18px rgba(217, 119, 87, 0.5); }
}
.constellation-depart { opacity: 0; transform: scale(1.04); transition: opacity 600ms ease, transform 600ms ease; }
/* 失败：屏息 400ms（transition-delay）后漂移褪冷 */
.constellation-failed [data-testid^="briefing-progress-step-"],
.constellation-failed [data-testid="briefing-constellation-well"] {
  filter: saturate(0.35) brightness(0.75);
  transition: filter 600ms ease 400ms, transform 600ms ease 400ms;
}
.constellation-failed [data-testid^="briefing-progress-step-"] { transform: translate(var(--fail-dx, 0px), var(--fail-dy, 0px)) !important; }

@media (prefers-reduced-motion: reduce) {
  .constellation-photon.p1, .constellation-photon.p2 { animation: none; }
  .constellation-depart { transition: opacity 150ms ease; transform: none; }
  .constellation-failed [data-testid^="briefing-progress-step-"],
  .constellation-failed [data-testid="briefing-constellation-well"] { transition: none; }
}
```

- [ ] **Step 2: Write the failing tests（追加到 tests/briefing-constellation.test.tsx）**

```tsx
  it('done satellites dock into the well (slide-in, kept in DOM for testid contract)', () => {
    render(<BriefingConstellation stage="assembling" />)
    const done = screen.getByTestId('briefing-progress-step-fetching')
    expect(done.dataset.state).toBe('done')
    expect(done.className).toContain('sat-docked')
    // 未完成的卫星留在驻留位
    expect(screen.getByTestId('briefing-progress-step-finalizing').className).not.toContain('sat-docked')
  })

  it('finalizing: well enters checking state with two orbiting photons, counter hidden', () => {
    render(<BriefingConstellation stage="finalizing" />)
    const well = screen.getByTestId('briefing-constellation-well')
    expect(well.dataset.state).toBe('checking')
    expect(well.querySelectorAll('.constellation-photon').length).toBe(2)
    expect(well.textContent).not.toContain('已归位')
  })

  it('mode resolved: photons drop, bloom plays, counter shows N/N', () => {
    render(<BriefingConstellation stage="finalizing" mode="resolved" />)
    const well = screen.getByTestId('briefing-constellation-well')
    expect(well.dataset.state).toBe('resolved')
    expect(well.className).toContain('constellation-well-resolved')
    expect(well.className).toContain('constellation-well-bloom')
    expect(well.textContent).toContain('4 / 4 已归位')
  })

  it('mode failed: well data-state failed, root carries constellation-failed', () => {
    render(<BriefingConstellation stage="extracting" mode="failed" />)
    expect(screen.getByTestId('briefing-constellation-well').dataset.state).toBe('failed')
    expect(screen.getByTestId('briefing-progress').className).toContain('constellation-failed')
  })

  it('well breathes on briefingPulseAt (throttled pulse)', () => {
    vi.useFakeTimers()
    render(<BriefingConstellation stage="fetching" />)
    const well = screen.getByTestId('briefing-constellation-well')
    act(() => { useStore.setState({ briefingPulseAt: Date.now() }) })
    expect(well.style.transform).toContain('scale(1.015)')
    act(() => { vi.advanceTimersByTime(300) })
    expect(well.style.transform).not.toContain('scale(1.015)')
    vi.useRealTimers()
  })
```

文件顶部 import 补 `act` 与 `vi`（现有 import 行改为 `import { render, screen, cleanup, act } from '@testing-library/react'` 和 `import { beforeEach, describe, expect, it, vi } from 'vitest'`）。

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/briefing-constellation.test.tsx`
Expected: 新 5 条 FAIL（旧断言仍过——docked 不破坏 data-state/计数/右列 transform 契约）

- [ ] **Step 4: 改造 BriefingConstellation**

关键改动（其余结构/配色/防御逻辑保持不变）：

```tsx
interface Props {
  stage: BriefingStage
  mode?: 'live' | 'resolved' | 'failed'
}

export function BriefingConstellation({ stage, mode = 'live' }: Props) {
  // ...既有 theme/source/detail/ stations/posts/accent 逻辑不变...
  const pulseAt = useStore((s) => s.briefingPulseAt)
  const [pulse, setPulse] = useState(false)
  const lastBeat = useRef(0)
  const pulseTimer = useRef<number | null>(null)

  // 生成脉搏：进度事件节拍 → 井环 240ms 微呼吸，节流 400ms（均匀而非响应快）
  useEffect(() => {
    if (!pulseAt || mode !== 'live') return
    if (pulseAt - lastBeat.current < 400) return
    lastBeat.current = pulseAt
    setPulse(true)
    pulseTimer.current = window.setTimeout(() => setPulse(false), 240)
    return () => { if (pulseTimer.current) clearTimeout(pulseTimer.current) }
  }, [pulseAt, mode])

  const checking = mode === 'live' && stations[currentIndex]?.key === 'finalizing'
  const wellState = mode === 'resolved' ? 'resolved' : mode === 'failed' ? 'failed' : checking ? 'checking' : 'live'
```

根 div className 加 `${mode === 'failed' ? 'constellation-failed' : ''}`。井体：

```tsx
      <div
        data-testid="briefing-constellation-well"
        data-state={wellState}
        className={`absolute flex flex-col items-center justify-center rounded-full ${
          mode === 'resolved' ? 'constellation-well-resolved constellation-well-bloom' : ''
        }`}
        style={{
          left: '50%', top: '44%',
          transform: `translate(-50%,-50%) scale(${pulse ? 1.015 : 1})`,
          transition: 'transform 240ms ease',
          width: 96, height: 96,
          border: `2px solid ${accent}`,
          background: `${accent}1a`,
          boxShadow: `0 0 24px ${accent}59, 0 0 60px ${accent}26`,
        }}
      >
        {(checking || mode === 'resolved') && (
          <>
            <div className="constellation-photon p1" />
            <div className="constellation-photon p2" />
          </>
        )}
        <div className="font-serif text-[13px]" style={{ color: inkStrong }}>
          {isJob ? '求职' : '夜航'}
        </div>
        {!checking && (
          <div
            key={currentIndex}
            className="font-sans text-[9px] mt-0.5"
            style={{ color: accent, animation: 'wellPulse 600ms ease-out' }}
          >
            {mode === 'resolved' ? stations.length : currentIndex} / {stations.length} 已归位
          </div>
        )}
      </div>
```

卫星渲染：done 时加 `sat-docked`（右列原 `translateX(-100%)` 仅未 docked 时施加），并加失败漂移变量：

```tsx
          const FAIL_DRIFT = [{ x: -6, y: -4 }, { x: 6, y: -5 }, { x: -5, y: 5 }, { x: 7, y: 4 }, { x: 4, y: 6 }]
          // ...
              className={`absolute px-2.5 py-1 rounded font-sans text-[11px] whitespace-nowrap transition-all duration-700 ${done ? 'sat-docked' : ''}`}
              style={{
                left: `${posts[i].x}%`,
                top: `${posts[i].y}%`,
                transform: !done && posts[i].x > 50 ? 'translateX(-100%)' : undefined,
                transitionTimingFunction: 'cubic-bezier(0.34, 1.4, 0.5, 1)',
                ['--fail-dx' as string]: `${FAIL_DRIFT[i % FAIL_DRIFT.length].x}px`,
                ['--fail-dy' as string]: `${FAIL_DRIFT[i % FAIL_DRIFT.length].y}px`,
                // 其余 background/border/color/boxShadow 不变
```

（`duration-500` → `duration-700` + settle 曲线：卫星滑入是「归位」，用 SPRING_SETTLE 的 CSS 落点值。）

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/briefing-constellation.test.tsx tests/briefing-progress.test.tsx`
Expected: PASS 全绿（新旧断言）

- [ ] **Step 6: Commit**

```bash
git add src/components/briefing/BriefingConstellation.tsx src/styles/globals.css tests/briefing-constellation.test.tsx
git commit -m "feat(constellation): ceremony B — slide-in dock, token pulse, check photons, fail drift"
```

---

### Task 13: BriefingProgress mode 透传 + Briefing.tsx 过渡编排

**Files:**
- Modify: `src/components/BriefingProgress.tsx`
- Modify: `src/pages/Briefing.tsx`（digest/job 分支）
- Modify: `src/components/briefing/BriefingVeil.tsx`（抵达透亮）
- Test: `tests/briefing-transition.test.tsx`（新建）

- [ ] **Step 1: BriefingProgress 加 mode 透传**

```tsx
interface Props {
  stage: BriefingStage
  mode?: 'live' | 'resolved' | 'failed'
  onCancel?: () => void
}

export function BriefingProgress({ stage, mode = 'live', onCancel }: Props) {
  // ...
      <BriefingConstellation stage={stage} mode={mode} />
  // onCancel 按钮逻辑不变（mode !== 'live' 时调用方不传 onCancel）
```

- [ ] **Step 2: BriefingVeil 抵达透亮**

```tsx
// src/components/briefing/BriefingVeil.tsx
import { useEffect, useState } from 'react'
import { useStore } from '@/store'

// 分层渐变遮罩 + 抵达透亮：briefingArrivedAt 时 opacity 短暂下探（画作透出，~900ms）。
export function BriefingVeil() {
  const arrivedAt = useStore((s) => s.briefingArrivedAt)
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    if (!arrivedAt) return
    setFlash(true)
    const t = setTimeout(() => setFlash(false), 900)
    return () => clearTimeout(t)
  }, [arrivedAt])

  return (
    <div
      data-testid="briefing-veil"
      className="fixed inset-0 z-[1] pointer-events-none transition-opacity duration-500"
      style={{
        opacity: flash ? 0.82 : 1,
        background:
          'linear-gradient(180deg, rgba(12,8,6,0.30) 0%, rgba(12,8,6,0.62) 26%, rgba(12,8,6,0.86) 55%, rgba(12,8,6,0.94) 100%)',
      }}
      aria-hidden="true"
    />
  )
}
```

- [ ] **Step 3: Write the failing test**

```tsx
// tests/briefing-transition.test.tsx
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({
  ipc: new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'onBriefingProgress' || prop === 'onLlmChunk' || prop === 'onLlmDone' || prop === 'onLlmError') {
        return vi.fn(() => () => {})
      }
      return vi.fn(async () => ([]))
    },
  }),
}))
vi.mock('@/lib/paintings', () => ({ manifest: [], pickRandom: vi.fn(() => null) }))

import { useStore } from '@/store'
import { Briefing } from '@/pages/Briefing'

function seedBase() {
  useStore.setState({
    briefing: { result: null, loading: false, error: null },
    briefingStage: null,
    briefingStageDetail: null,
    briefingSource: 'digest',
    briefingTheme: 'academic',
    briefingHistory: { list: [], loading: false, error: null },
    jobBriefing: { result: null, loading: false, error: null },
    jobBriefingHistory: { list: [], loading: false, error: null },
    assistantSession: null,
  })
}

describe('Briefing generation transition choreography', () => {
  beforeEach(() => { cleanup(); vi.useFakeTimers(); seedBase() })
  afterEach(() => { vi.useRealTimers() })

  it('loading renders constellation live; result passes through resolved/departing into fresh reading pane', async () => {
    render(<Briefing />)
    act(() => {
      useStore.setState({
        briefing: { result: null, loading: true, error: null },
        briefingStage: 'fetching',
      })
    })
    expect(screen.getByTestId('briefing-constellation')).toBeInTheDocument()

    act(() => {
      useStore.setState({
        briefing: {
          result: {
            title: '夜航简报', content: '## A\n正文内容', date: '2026-07-25',
            generatedAt: '2026-07-25T01:00:00.000Z', filePath: '/x/夜航简报-2026-07-25.md',
            sourceStatus: {},
          } as never,
          loading: false, error: null,
        },
        briefingStage: null,
      })
    })
    // resolved + departing 期间星图仍在
    expect(screen.getByTestId('briefing-constellation')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(1600) })
    const pane = await screen.findByTestId('briefing-reading-pane')
    expect(pane.dataset.arrival).toBe('fresh')
  })

  it('error: failing keeps constellation 1000ms before the error panel', () => {
    render(<Briefing />)
    act(() => {
      useStore.setState({
        briefing: { result: null, loading: true, error: null },
        briefingStage: 'fetching',
      })
    })
    act(() => {
      useStore.setState({
        briefing: { result: null, loading: false, error: 'NETWORK_ERROR' },
        briefingStage: null,
      })
    })
    // 失败收束中：星图以 failed mode 驻留，错误面板未出
    expect(screen.getByTestId('briefing-constellation-well').dataset.state).toBe('failed')
    act(() => { vi.advanceTimersByTime(1100) })
    expect(screen.queryByTestId('briefing-constellation')).toBeNull()
  })

  it('revisit: seeded result without loading shows reading pane as revisit (no replay)', async () => {
    act(() => {
      useStore.setState({
        briefing: {
          result: {
            title: '夜航简报', content: '## A\n正文内容', date: '2026-07-24',
            generatedAt: '2026-07-24T01:00:00.000Z', filePath: '/x/夜航简报-2026-07-24.md',
            sourceStatus: {},
          } as never,
          loading: false, error: null,
        },
      })
    })
    render(<Briefing />)
    const pane = await screen.findByTestId('briefing-reading-pane')
    expect(pane.dataset.arrival).toBe('revisit')
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run tests/briefing-transition.test.tsx`
Expected: FAIL — 无 `briefing-reading-pane`、失败立即切错误面板

- [ ] **Step 5: Briefing.tsx digest 分支编排（job 分支同构）**

组件内加：

```tsx
import { useGenerationTransition } from '@/lib/use-generation-transition'
// ...
  const { phase: digestPhase, fresh: digestFresh } = useGenerationTransition(
    `digest:${result?.date ?? today}`, loading, !!result, !!error,
  )
  const { phase: jobPhase, fresh: jobFresh } = useGenerationTransition(
    `job:${jobResult?.date ?? today}`, jobLoading, !!jobResult, !!jobError,
  )
  const lastDigestStage = useRef(stage)
  if (stage) lastDigestStage.current = stage
  const lastJobStage = useRef(jobStage)
  if (jobStage) lastJobStage.current = jobStage
```

digest 内容分支改为（替换原 isDigestLoading / isDigestError 两个分支）：

```tsx
            ) : digestPhase === 'generating' || digestPhase === 'resolved' || digestPhase === 'departing' ? (
              <main className={`relative z-[5] flex-1 overflow-y-auto px-6 py-6 max-w-3xl mx-auto ${digestPhase === 'departing' ? 'constellation-depart' : ''}`}>
                <BriefingProgress
                  stage={lastDigestStage.current ?? 'fetching'}
                  mode={digestPhase === 'resolved' ? 'resolved' : 'live'}
                  onCancel={cancelBriefing}
                />
              </main>
            ) : digestPhase === 'failing' ? (
              <main className="relative z-[5] flex-1 overflow-y-auto px-6 py-6 max-w-3xl mx-auto">
                <BriefingProgress stage={lastDigestStage.current ?? 'fetching'} mode="failed" />
              </main>
            ) : isDigestError ? (
              // ...原 BriefingError 分支不变...
```

阅读态分支包一层（Academic/Newspaper 两个 layout 的外层 `<>` 换成）：

```tsx
              <div data-testid="briefing-reading-pane" data-arrival={digestFresh ? 'fresh' : 'revisit'} className="flex-1 flex min-h-0">
                {isAcademic ? (
                  <AcademicBriefingLayout ... />
                ) : (
                  <NewspaperBriefingLayout ... />
                )}
              </div>
```

job 分支用 `jobPhase/jobFresh/lastJobStage` 同构改造；`BriefingSkeleton` 分支（stage 为 null 的 loading 早期）保持原样挂在 `digestPhase === 'generating' && !lastDigestStage.current` 的兜底上（或直接保留在原条件——生成开始即 set stage， skeleton 几乎不出现，保留原防御）。

- [ ] **Step 6: Run tests**

Run: `npx vitest run tests/briefing-transition.test.tsx tests/briefing-page.test.tsx tests/briefing-veil.test.tsx`
Expected: PASS（briefing-page 旧断言若有 loading 分支断言按新分支微调——只调选择器不断言语义）

- [ ] **Step 7: Commit**

```bash
git add src/components/BriefingProgress.tsx src/pages/Briefing.tsx src/components/briefing/BriefingVeil.tsx tests/briefing-transition.test.tsx tests/briefing-page.test.tsx
git commit -m "feat(briefing): generation transition choreography + arrival veil flash"
```

---

### Task 14: 抵达阶梯（四源通用）

**Files:**
- Modify: `src/styles/globals.css`
- Modify: `src/components/briefing/AcademicBriefingLayout.tsx`、`NewspaperBriefingLayout.tsx`
- Modify: `src/components/anthropic/AnthropicArticleReader.tsx`（容器）
- Modify: `src/components/writing/WritingBoard.tsx`（编辑器容器）
- Test: `tests/briefing-layout.test.tsx`（追加）

- [ ] **Step 1: globals.css 追加**

```css
/* ===== 抵达阶梯（F5）：报题/正文依次落定；revisit 与 reduced-motion 不重演 ===== */
.arrive-item { animation: arriveItem 700ms cubic-bezier(0.22, 1, 0.36, 1) both; }
.arrive-item.d3 { animation-delay: 400ms; }
@keyframes arriveItem {
  0% { opacity: 0; transform: translateY(14px); }
  100% { opacity: 1; transform: translateY(0); }
}
[data-arrival="revisit"] .arrive-item { animation: none; }
@media (prefers-reduced-motion: reduce) {
  .arrive-item { animation: none; }
}
```

- [ ] **Step 2: Write the failing test（追加到 tests/briefing-layout.test.tsx）**

```tsx
  it('academic layout marks header and body as arrival cascade items', () => {
    render(
      <AcademicBriefingLayout
        result={RESULT as never}
        parsed={PARSED as never}
        displayDate="2026 年 7 月 25 日"
      />,
    )
    expect(screen.getByTestId('briefing-academic-layout').querySelector('header')!.className).toContain('arrive-item')
    expect(screen.getByTestId('briefing-markdown-body').className).toContain('arrive-item')
  })
```

（RESULT/PARSED 用该测试文件既有的 fixture 构造；若文件已有 render helper 直接复用。）

- [ ] **Step 3: 落位**

`AcademicBriefingLayout`：header className 加 `arrive-item`；`briefing-markdown-body` div className 加 `arrive-item d3`。`NewspaperBriefingLayout` 同样两处。
`AnthropicArticleReader` 文章容器（正文区根元素）加 `arrive-item`（打开文章即播一次，Anthropic 无 fresh/revisit 区分——每次打开都是主动事件）。
`WritingBoard` 编辑器**容器**（非 Milkdown 内部）加 `arrive-item`（容器级 opacity/transform，不触碰编辑器状态）。

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/briefing-layout.test.tsx tests/job-briefing-layout.test.tsx tests/anthropic-reader-theme.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/styles/globals.css src/components/briefing/AcademicBriefingLayout.tsx src/components/briefing/NewspaperBriefingLayout.tsx src/components/anthropic/AnthropicArticleReader.tsx src/components/writing/WritingBoard.tsx tests/briefing-layout.test.tsx
git commit -m "feat(arrival): cascade settle for all four briefing sources"
```

---

### Task 15: E2E 生成仪式

**Files:**
- Create: `e2e/specs/generation-ceremony.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
// e2e/specs/generation-ceremony.spec.ts
import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedBriefing } from '../helpers/test-library'

function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

test.describe('@p1 generation ceremony', () => {
  test('fresh generation passes constellation into fresh arrival; history revisit does not replay', async ({ window, testLibraryPath }) => {
    const today = localToday()
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()

    // 生成今日（走 e2e mock 链路，与 briefing-generation.spec.ts 同策略）
    await window.locator(SELECTORS.briefing.receiveDigestButton).click()
    await expect(window.locator('[data-testid="briefing-reading-pane"]')).toHaveAttribute('data-arrival', 'fresh', { timeout: 20000 })

    // 切到历史日期（seed 一篇昨天）→ revisit，不重演抵达
    const yesterday = new Date(Date.now() - 86400000)
    const yDate = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`
    seedBriefing(testLibraryPath, yDate)
    await window.reload()
    const cover2 = new CoverPage(window)
    await cover2.enterName('E2E 测试员')
    await cover2.goToBriefing()
    await window.locator(`[data-testid="briefing-date-item-${yDate}"]`).click()
    await expect(window.locator('[data-testid="briefing-reading-pane"]')).toHaveAttribute('data-arrival', 'revisit')
  })
})
```

- [ ] **Step 2: Run E2E**

Run: `npx playwright test --config e2e/playwright.config.ts generation-ceremony`
Expected: PASS。选择器/seed 签名对照 `e2e/specs/briefing-generation.spec.ts` 与 `e2e/helpers/test-library.ts` 修正，断言语义不动。

- [ ] **Step 3: Part 2 全量回归 + Commit**

Run: `npm run test`
Expected: 全绿

```bash
git add e2e/specs/generation-ceremony.spec.ts
git commit -m "test(e2e): generation ceremony fresh/revisit arrival"
```

---
---

# Part 3 阅读层（F6 燃熄 + F7 阖卷 + F8 内化脊柱）

**本部分铁律：**
- 「读完」只有 `use-reading-finished` 一个语义来源，燃熄与阖卷共享，禁止分叉。
- `briefingRead` 是渲染层状态，**绝不写入简报 md**（briefing 文件不被 UI 状态污染）。

---

### Task 16: use-reading-finished hook

**Files:**
- Create: `src/lib/use-reading-finished.ts`
- Test: `tests/use-reading-finished.test.ts`（新建）

- [ ] **Step 1: Write the failing test**

```ts
// tests/use-reading-finished.test.ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRef } from 'react'
import { useReadingFinished } from '@/lib/use-reading-finished'

let ioCallback: ((entries: { isIntersecting: boolean }[]) => void) | null = null
class MockIO {
  constructor(cb: typeof ioCallback) { ioCallback = cb }
  observe = vi.fn()
  disconnect = vi.fn()
}

function setup(resetKey = 'k1') {
  const container = document.createElement('div')
  const sentinel = document.createElement('div')
  document.body.appendChild(container)
  container.appendChild(sentinel)
  const containerRef = { current: container }
  const sentinelRef = { current: sentinel }
  const hook = renderHook(({ k }) => useReadingFinished(containerRef, sentinelRef, k), { initialProps: { k: resetKey } })
  return { container, hook }
}

describe('useReadingFinished', () => {
  beforeEach(() => { ioCallback = null; vi.stubGlobal('IntersectionObserver', MockIO) })
  afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = '' })

  it('does not finish before any scroll (hasScrolled guard)', () => {
    const { hook } = setup()
    act(() => { ioCallback!([{ isIntersecting: true }]) })
    expect(hook.result.current).toBe(false)
  })

  it('finishes when sentinel intersects after a scroll', () => {
    const { container, hook } = setup()
    act(() => { container.dispatchEvent(new Event('scroll')) })
    act(() => { ioCallback!([{ isIntersecting: true }]) })
    expect(hook.result.current).toBe(true)
  })

  it('resets when resetKey changes', () => {
    const { container, hook } = setup()
    act(() => { container.dispatchEvent(new Event('scroll')) })
    act(() => { ioCallback!([{ isIntersecting: true }]) })
    expect(hook.result.current).toBe(true)
    hook.rerender({ k: 'k2' })
    expect(hook.result.current).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/use-reading-finished.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the hook**

```ts
// src/lib/use-reading-finished.ts
import { useEffect, useRef, useState, type RefObject } from 'react'

/**
 * 唯一「读完」语义（F6 燃熄 / F7 阖卷共享，禁止第二套判定）。
 * hasScrolled 守卫：用户至少滚过一次才计数——防短正文打开即已读。
 * resetKey = filePath / date，切换即归零。
 */
export function useReadingFinished(
  containerRef: RefObject<HTMLElement | null>,
  sentinelRef: RefObject<HTMLElement | null>,
  resetKey: string | undefined,
): boolean {
  const [finished, setFinished] = useState(false)
  const scrolled = useRef(false)

  useEffect(() => {
    setFinished(false)
    scrolled.current = false
    const container = containerRef.current
    const sentinel = sentinelRef.current
    if (!container || !sentinel) return

    const onScroll = () => { scrolled.current = true }
    container.addEventListener('scroll', onScroll, { passive: true })
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && scrolled.current) setFinished(true)
    }, { root: container, threshold: 0.6 })
    io.observe(sentinel)

    return () => {
      container.removeEventListener('scroll', onScroll)
      io.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey])

  return finished
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/use-reading-finished.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/use-reading-finished.ts tests/use-reading-finished.test.ts
git commit -m "feat(reading): shared reading-finished hook with scroll guard"
```

---

### Task 17: store briefingRead 持久化

**Files:**
- Modify: `src/types/index.ts`（StateJson ~line 467 附近）
- Modify: `src/store/index.ts`（类型/init/hydration/action）
- Test: `tests/store-briefing-read.test.ts`（新建）

- [ ] **Step 1: Write the failing test**

```ts
// tests/store-briefing-read.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest'

const patchState = vi.fn()
vi.mock('@/lib/ipc', () => ({ ipc: { patchState, getState: vi.fn() } }))
vi.mock('@/lib/paintings', () => ({ manifest: [], pickRandom: vi.fn(() => null) }))

import { useStore } from '@/store'

describe('store briefingRead', () => {
  beforeEach(() => {
    patchState.mockClear()
    useStore.setState({ briefingRead: { digest: [], 'job-briefing': [] } })
  })

  it('markBriefingRead appends, dedups, patches state.json', async () => {
    await useStore.getState().markBriefingRead('digest', '2026-07-25')
    expect(useStore.getState().briefingRead.digest).toEqual(['2026-07-25'])
    expect(patchState).toHaveBeenCalledWith({ briefingRead: { digest: ['2026-07-25'], 'job-briefing': [] } })

    patchState.mockClear()
    await useStore.getState().markBriefingRead('digest', '2026-07-25')
    expect(patchState).not.toHaveBeenCalled() // 重复日期不重写
  })

  it('trims each source to the latest 120 dates', async () => {
    const many = Array.from({ length: 121 }, (_, i) => `2026-01-${String(i + 1).padStart(3, '0')}`)
    useStore.setState({ briefingRead: { digest: many.slice(0, 120), 'job-briefing': [] } })
    await useStore.getState().markBriefingRead('digest', '2026-07-25')
    const list = useStore.getState().briefingRead.digest
    expect(list.length).toBe(120)
    expect(list[119]).toBe('2026-07-25')
    expect(list).not.toContain(many[0])
  })

  it('keeps digest and job-briefing lists independent', async () => {
    await useStore.getState().markBriefingRead('job-briefing', '2026-07-25')
    expect(useStore.getState().briefingRead.digest).toEqual([])
    expect(useStore.getState().briefingRead['job-briefing']).toEqual(['2026-07-25'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/store-briefing-read.test.ts`
Expected: FAIL — `markBriefingRead is not a function`

- [ ] **Step 3: 三层接线**

`src/types/index.ts` StateJson 加：

```ts
  briefingRead?: { digest?: string[]; 'job-briefing'?: string[] }
```

store 类型区加：

```ts
  briefingRead: { digest: string[]; 'job-briefing': string[] }
  markBriefingRead: (source: 'digest' | 'job-briefing', date: string) => Promise<void>
```

init 加 `briefingRead: { digest: [], 'job-briefing': [] },`；hydration（`briefingFontSize: state.briefingFontSize ?? 'base'` 附近）加：

```ts
      briefingRead: {
        digest: Array.isArray(state.briefingRead?.digest) ? state.briefingRead.digest : [],
        'job-briefing': Array.isArray(state.briefingRead?.['job-briefing']) ? state.briefingRead['job-briefing'] : [],
      },
```

action：

```ts
  markBriefingRead: async (source, date) => {
    const cur = get().briefingRead
    if (cur[source].includes(date)) return
    const next = { ...cur, [source]: [...cur[source], date].slice(-120) }
    set({ briefingRead: next })
    await ipc.patchState({ briefingRead: next } as Partial<StateJson>)
  },
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/store-briefing-read.test.ts tests/safe-json.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/store/index.ts tests/store-briefing-read.test.ts
git commit -m "feat(store): persisted briefingRead with 120-date trim"
```

---

### Task 18: 日期列烛火（燃熄）

**Files:**
- Modify: `src/components/BriefingDateColumn.tsx`
- Modify: `src/pages/Briefing.tsx`（两个 BriefingDateColumn 调用点传参）
- Test: `tests/briefing-date-column.test.tsx`（追加）

- [ ] **Step 1: Write the failing tests（追加）**

```tsx
  it('renders flame states: spent for read, lit for generated-unread, unlit for not-generated today', () => {
    render(
      <BriefingDateColumn
        collapsed={false}
        history={[{ date: '2026-07-10', filePath: '/x.md' }, { date: '2026-07-11', filePath: '/y.md' }]}
        currentDate="2026-07-11"
        today="2026-07-11"
        generatedDates={['2026-07-10', '2026-07-11']}
        readDates={['2026-07-10']}
        onSelect={vi.fn()}
        onReceiveToday={vi.fn()}
        theme="academic"
      />
    )
    expect(screen.getByTestId('briefing-date-flame-2026-07-10').dataset.state).toBe('spent')
    expect(screen.getByTestId('briefing-date-flame-2026-07-11').dataset.state).toBe('lit')
  })

  it('today without generation shows an unlit flame', () => {
    render(
      <BriefingDateColumn
        collapsed={false}
        history={[]}
        today="2026-07-11"
        generatedDates={[]}
        readDates={[]}
        onSelect={vi.fn()}
        onReceiveToday={vi.fn()}
        theme="academic"
      />
    )
    expect(screen.getByTestId('briefing-date-flame-2026-07-11').dataset.state).toBe('unlit')
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/briefing-date-column.test.tsx`
Expected: FAIL — 无 `briefing-date-flame-*` 元素

- [ ] **Step 3: 组件改造**

Props 加 `generatedDates: string[]`、`readDates: string[]`、`accent?: 'ember' | 'blue'`（默认 'ember'）。每个日期条目 button 内 label 前加：

```tsx
            {(() => {
              const state = readDates.includes(entry.date)
                ? 'spent'
                : generatedDates.includes(entry.date)
                  ? 'lit'
                  : 'unlit'
              const isAcademic = theme !== 'newspaper'
              const color = !isAcademic ? '#1a1a1a' : accent === 'blue' ? '#7fa8d9' : '#d97757'
              const style: React.CSSProperties =
                state === 'lit'
                  ? { background: color, borderColor: color, boxShadow: `0 0 8px 2px ${color}88` }
                  : state === 'spent'
                    ? { background: `${color}47`, borderColor: `${color}4d` }
                    : { background: 'transparent', borderColor: `${color}cc` }
              return (
                <span
                  data-testid={`briefing-date-flame-${entry.date}`}
                  data-state={state}
                  className="inline-block w-[7px] h-[7px] rounded-full border shrink-0 transition-all duration-500"
                  style={style}
                />
              )
            })()}
```

spent 条目文字「沉半阶」：`isCurrent` 不变，非 current 且 spent 的条目 text class 追加 `opacity-60`。

- [ ] **Step 4: Briefing.tsx 传参（digest 与 job 两处）**

```tsx
// digest:
              <BriefingDateColumn
                ...
                generatedDates={[...historyList.map((h) => h.date), ...(result ? [result.date] : [])]}
                readDates={useStore.getState().briefingRead.digest}
              />
// job: accent="blue"，generatedDates 用 jobHistoryList + jobResult，readDates 用 briefingRead['job-briefing']
```

（readDates 用 `useStore((s) => s.briefingRead.digest)` 订阅式取，不用 getState——保证燃熄后重渲染。）

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/briefing-date-column.test.tsx tests/briefing-page.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/BriefingDateColumn.tsx src/pages/Briefing.tsx tests/briefing-date-column.test.tsx
git commit -m "feat(briefing): date column candle flames (unlit/lit/spent)"
```

---

### Task 19: 阖卷 ◆ + 烛光呼吸触发

**Files:**
- Modify: `src/components/briefing/AcademicBriefingLayout.tsx`、`NewspaperBriefingLayout.tsx`
- Modify: `src/components/job-briefing/JobBriefingRenderer.tsx`
- Modify: `src/pages/Briefing.tsx`（finished→markBriefingRead 接线）
- Modify: `src/styles/globals.css`
- Test: `tests/briefing-colophon.test.tsx`（新建）

- [ ] **Step 1: globals.css 追加**

```css
/* ===== 阖卷（F7）：卷尾 ◆ 静驻 ===== */
.briefing-colophon {
  text-align: center;
  margin-top: 60px;
  color: #d97757;
  font-size: 13px;
  opacity: 0;
  transition: opacity 600ms ease;
}
.briefing-colophon.show { opacity: 1; }
@media (prefers-reduced-motion: reduce) {
  .briefing-colophon { transition: none; }
}
```

- [ ] **Step 2: Write the failing test**

```tsx
// tests/briefing-colophon.test.tsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({ ipc: { patchState: vi.fn(), getState: vi.fn() } }))
vi.mock('@/lib/paintings', () => ({ manifest: [], pickRandom: vi.fn(() => null) }))

import { AcademicBriefingLayout } from '@/components/briefing/AcademicBriefingLayout'

const RESULT = {
  title: '夜航简报', content: '## A\n第一段正文。\n\n## B\n第二段正文。',
  date: '2026-07-25', generatedAt: '2026-07-25T01:00:00.000Z',
  filePath: '/x/夜航简报-2026-07-25.md', sourceStatus: {},
}
const PARSED = { sources: [] }

describe('colophon (阖卷)', () => {
  beforeEach(() => cleanup())

  it('shows ◆ when finished prop arrives; static when alreadyRead', () => {
    const { rerender } = render(
      <AcademicBriefingLayout result={RESULT as never} parsed={PARSED as never} displayDate="2026 年 7 月 25 日" />,
    )
    expect(screen.getByTestId('briefing-volume-end')).toBeInTheDocument()
    expect(screen.queryByTestId('briefing-colophon')).toBeNull()

    rerender(
      <AcademicBriefingLayout result={RESULT as never} parsed={PARSED as never} displayDate="2026 年 7 月 25 日" finished />,
    )
    expect(screen.getByTestId('briefing-colophon')).toBeInTheDocument()
  })

  it('already-read report renders colophon statically (no scroll needed)', () => {
    render(
      <AcademicBriefingLayout result={RESULT as never} parsed={PARSED as never} displayDate="2026 年 7 月 25 日" alreadyRead />,
    )
    expect(screen.getByTestId('briefing-colophon')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/briefing-colophon.test.tsx`
Expected: FAIL — 无 sentinel / colophon；`alreadyRead` prop 不存在

- [ ] **Step 4: 页面层统一持有 hook，布局只收 props**

**方案（唯一，禁止布局内自建第二套 hook）**：`useReadingFinished` 只在 `Briefing.tsx` 实例化（main 滚动容器 ref 在页面层），三个布局组件只接收 `finished` / `alreadyRead` props；`breathCandle` 与 `markBriefingRead` 都在页面层的 finished effect 里触发（耦合方向 阖卷→燃熄/烛光，一处）。

```tsx
// Briefing.tsx digest 阅读态：
  const digestMainRef = useRef<HTMLElement>(null)
  const digestSentinelRef = useRef<HTMLDivElement>(null)
  const digestFinished = useReadingFinished(digestMainRef, digestSentinelRef, result?.filePath)
  const digestRead = useStore((s) => s.briefingRead.digest)
  const breathCandle = useStore((s) => s.breathCandle)
  const markBriefingRead = useStore((s) => s.markBriefingRead)
  useEffect(() => {
    if (!digestFinished || !result) return
    breathCandle()                                  // 阖卷带起的风（F0 的消费者）
    void markBriefingRead('digest', result.date)    // F6 燃熄
  }, [digestFinished])
// main 元素加 ref={digestMainRef}；
// layout 之后、main 末尾渲染 <div ref={digestSentinelRef} data-testid="briefing-volume-end" />
// layout 传 finished={digestFinished} alreadyRead={result ? digestRead.includes(result.date) : false}
```

job 分支同构（`jobMainRef/jobSentinelRef/jobFinished`，`markBriefingRead('job-briefing', jobResult.date)`）。

三个布局（Academic/Newspaper/JobBriefingRenderer）props 加 `finished?: boolean; alreadyRead?: boolean`，正文末尾渲染：

```tsx
        {(finished || alreadyRead) && (
          <div data-testid="briefing-colophon" className="briefing-colophon show">◆</div>
        )}
```

Newspaper：◆ 墨色（class 追加 `text-[#1a1a1a]`）。Job：同上琥珀/星蓝按既有配色。

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/briefing-colophon.test.tsx tests/briefing-layout.test.tsx`
Expected: PASS（colophon 测试 = Step 2 的 props 版；hook 行为已由 Task 16 覆盖；页面层 effect 的 breathCandle/markBriefingRead 接线由 Task 21 E2E 的 spent 断言兜住）

- [ ] **Step 6: Commit**

```bash
git add src/components/briefing/AcademicBriefingLayout.tsx src/components/briefing/NewspaperBriefingLayout.tsx src/components/job-briefing/JobBriefingRenderer.tsx src/pages/Briefing.tsx src/styles/globals.css tests/briefing-colophon.test.tsx
git commit -m "feat(reading): colophon at volume end + candle breath trigger + mark-read wiring"
```

---

### Task 20: 内化脊柱（InternalizationSpine）

**Files:**
- Create: `src/lib/spine-seals.ts`
- Create: `src/components/briefing/InternalizationSpine.tsx`
- Modify: `src/components/briefing/AcademicBriefingLayout.tsx`（挂载 + visitedMax）
- Modify: `src/styles/globals.css`
- Test: `tests/spine-seals.test.ts`（新建）、`tests/internalization-spine.test.tsx`（新建）

- [ ] **Step 1: Write the failing util test**

```ts
// tests/spine-seals.test.ts
import { describe, expect, it } from 'vitest'
import { computeSealedChunks } from '@/lib/spine-seals'

const CONTENT = '## X / Twitter\nAaron Levie 讨论了 LLM 在企业工作流中的落地。\n\n## Official Blogs\nClaude 的新功能提升了长上下文可靠性。'
const CHUNKS = [
  { heading: 'X / Twitter', summary: '', terms: [] },
  { heading: 'Official Blogs', summary: '', terms: [] },
]
const anno = (selectedText: string) => ({
  id: '1', selectedText, note: '', paragraphIndex: 0, createdAt: '', updatedAt: '',
})

describe('computeSealedChunks', () => {
  it('seals the chunk whose body contains the annotation text', () => {
    const sealed = computeSealedChunks(CONTENT, CHUNKS as never, [anno('长上下文可靠性')])
    expect([...sealed]).toEqual([1])
  })

  it('no match → no seal (宁可少封不可错封)', () => {
    const sealed = computeSealedChunks(CONTENT, CHUNKS as never, [anno('不存在的文本')])
    expect(sealed.size).toBe(0)
  })

  it('skips empty selectedText', () => {
    const sealed = computeSealedChunks(CONTENT, CHUNKS as never, [anno('  ')])
    expect(sealed.size).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/spine-seals.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write spine-seals.ts**

```ts
// src/lib/spine-seals.ts
import type { ArticleAnnotation, ArticleAssistantChunk } from '@shared/index'
import { splitArticleIntoChunks } from '@/lib/article-chunks'

/** 封印推导：标注的 selectedText 落在哪个 chunk，哪个 chunk 即「已内化」。映射失败宁可少封不可错封。 */
export function computeSealedChunks(
  content: string,
  chunks: ArticleAssistantChunk[],
  annotations: ArticleAnnotation[],
): Set<number> {
  const bodies = splitArticleIntoChunks(content, chunks.map((c) => c.heading))
  const sealed = new Set<number>()
  for (const a of annotations) {
    const text = a.selectedText?.trim()
    if (!text) continue
    const i = bodies.findIndex((b) => b.body.includes(text))
    if (i >= 0) sealed.add(i)
  }
  return sealed
}
```

- [ ] **Step 4: Write the component test**

```tsx
// tests/internalization-spine.test.tsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    patchState: vi.fn(), getState: vi.fn(),
    annotationsRead: vi.fn(async () => [
      { id: '1', selectedText: '长上下文可靠性', note: '', paragraphIndex: 0, createdAt: '', updatedAt: '' },
    ]),
  },
}))
vi.mock('@/lib/paintings', () => ({ manifest: [], pickRandom: vi.fn(() => null) }))

import { useStore } from '@/store'
import { InternalizationSpine } from '@/components/briefing/InternalizationSpine'

const CONTENT = '## X / Twitter\nAaron Levie 讨论了 LLM。\n\n## Official Blogs\nClaude 的新功能提升了长上下文可靠性。'
const CHUNKS = [
  { heading: 'X / Twitter', summary: '', terms: [] },
  { heading: 'Official Blogs', summary: '', terms: [] },
]

describe('InternalizationSpine', () => {
  beforeEach(() => {
    cleanup()
    useStore.setState({ assistantSession: { activeChunkIndex: null } as never })
  })

  it('renders one node per chunk; sealed from annotations; visited up to visitedMax', async () => {
    render(
      <InternalizationSpine content={CONTENT} chunks={CHUNKS as never} filePath="/x.md" visitedMax={0} />,
    )
    await waitFor(() => {
      expect(screen.getByTestId('spine-node-1').dataset.state).toBe('sealed')
    })
    expect(screen.getByTestId('spine-node-0').dataset.state).toBe('visited')
  })

  it('hover highlights the chunk via activeChunkIndex; click scrolls', async () => {
    const onNavigate = vi.fn()
    render(
      <InternalizationSpine content={CONTENT} chunks={CHUNKS as never} filePath="/x.md" visitedMax={null} onNavigate={onNavigate} />,
    )
    await waitFor(() => screen.getByTestId('spine-node-0'))
    fireEvent.mouseEnter(screen.getByTestId('spine-node-0'))
    expect(useStore.getState().assistantSession?.activeChunkIndex).toBe(0)
    fireEvent.mouseLeave(screen.getByTestId('spine-node-0'))
    expect(useStore.getState().assistantSession?.activeChunkIndex ?? null).toBeNull()
    fireEvent.click(screen.getByTestId('spine-node-1'))
    expect(onNavigate).toHaveBeenCalledWith(1)
  })

  it('renders nothing when no chunks and no markdown headings', () => {
    const { container } = render(
      <InternalizationSpine content="无标题纯文本" chunks={[]} filePath="/x.md" visitedMax={null} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `npx vitest run tests/internalization-spine.test.tsx`
Expected: FAIL — component not found

- [ ] **Step 6: Write the component + globals.css + layout 挂载**

```tsx
// src/components/briefing/InternalizationSpine.tsx
import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@/store'
import { ipc } from '@/lib/ipc'
import { computeSealedChunks } from '@/lib/spine-seals'
import type { ArticleAssistantChunk } from '@shared/index'

interface Props {
  content: string
  chunks: ArticleAssistantChunk[]
  filePath: string
  visitedMax: number | null
  onNavigate?: (index: number) => void
}

// 内化脊柱：文档记得你吸收过什么。未访(空心) / 行经(米色,会话级) / 已内化(琥珀封印,跨会话)。
// 封印由既有标注推导，零新持久化；标注删除后封印自然消失。
export function InternalizationSpine({ content, chunks, filePath, visitedMax, onNavigate }: Props) {
  const setAssistantActiveChunk = useStore((s) => s.setAssistantActiveChunk)
  const [sealed, setSealed] = useState<Set<number>>(new Set())

  const headings = useMemo(() => {
    if (chunks.length > 0) return chunks.map((c) => c.heading)
    // 无 guide chunks：回退 markdown 章节锚点
    return [...content.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim())
  }, [content, chunks])

  useEffect(() => {
    let alive = true
    ipc.annotationsRead(filePath)
      .then((list) => { if (alive) setSealed(computeSealedChunks(content, chunks, list)) })
      .catch(() => { /* annotationsRead 对缺失文件返回 []；其它失败 = 无封印 */ })
    return () => { alive = false }
  }, [filePath, content, chunks])

  if (headings.length === 0) return null

  return (
    <div data-testid="internalization-spine" className="internalization-spine" aria-hidden="true">
      {headings.map((h, i) => {
        const state = sealed.has(i) ? 'sealed' : visitedMax !== null && i <= visitedMax ? 'visited' : 'unvisited'
        return (
          <button
            key={h}
            type="button"
            data-testid={`spine-node-${i}`}
            data-state={state}
            className={`spine-node spine-${state}`}
            style={{ top: `${(i + 1) * 48}px` }}
            onMouseEnter={() => setAssistantActiveChunk(i)}
            onMouseLeave={() => setAssistantActiveChunk(null)}
            onClick={() => onNavigate?.(i)}
            tabIndex={-1}
          />
        )
      })}
    </div>
  )
}
```

```css
/* ===== 内化脊柱（F8） ===== */
.internalization-spine {
  position: absolute;
  left: -38px; top: 0; bottom: 0; width: 14px;
}
.internalization-spine::before {
  content: '';
  position: absolute; left: 6px; top: 0; bottom: 0; width: 1px;
  background: linear-gradient(180deg, transparent, rgba(232,213,183,0.18) 8%, rgba(232,213,183,0.18) 92%, transparent);
}
.spine-node {
  position: absolute; left: 2px; width: 9px; height: 9px;
  border-radius: 50%; border: 1px solid rgba(232,213,183,0.45);
  background: transparent; cursor: pointer; padding: 0;
  transition: background 500ms ease, border-color 500ms ease;
}
.spine-node.spine-visited { background: rgba(232,213,183,0.75); border-color: rgba(232,213,183,0.75); }
.spine-node.spine-sealed {
  background: #d97757; border-color: #d97757; border-radius: 2px;
  transform: rotate(45deg); box-shadow: 0 0 7px 1px rgba(217,119,87,0.5);
}
@media (max-width: 900px) { .internalization-spine { display: none; } }
@media (prefers-reduced-motion: reduce) { .spine-node { transition: none; } }
```

`AcademicBriefingLayout` 挂载（`briefing-article-body` 容器内、相对定位已具备）：

```tsx
// visitedMax：activeChunkIndex 的会话级累计最大值
  const [visitedMax, setVisitedMax] = useState<number | null>(null)
  useEffect(() => {
    if (activeChunkIndex !== null) setVisitedMax((v) => Math.max(v ?? -1, activeChunkIndex))
  }, [activeChunkIndex])
// onNavigate：滚动到对应 chunk
  const navigateToChunk = (i: number) => {
    articleBodyRef.current
      ?.querySelector(`[data-chunk-index="${i}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
// JSX（filePath 存在时）:
      {filePath && (
        <InternalizationSpine
          content={result.content}
          chunks={chunks ?? []}
          filePath={filePath}
          visitedMax={visitedMax}
          onNavigate={navigateToChunk}
        />
      )}
```

（注：组件测试里 `top` 用 `(i+1)*48px` 的简化定位；layout 内真实对齐由后续真实阅读反馈微调——节点语义不依赖像素级对齐。reduced-motion 下 scrollIntoView 的 smooth 行为浏览器自动降级。）

- [ ] **Step 7: Run tests**

Run: `npx vitest run tests/spine-seals.test.ts tests/internalization-spine.test.tsx tests/ArticleBodyChunks.test.tsx`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/lib/spine-seals.ts src/components/briefing/InternalizationSpine.tsx src/components/briefing/AcademicBriefingLayout.tsx src/styles/globals.css tests/spine-seals.test.ts tests/internalization-spine.test.tsx
git commit -m "feat(reading): internalization spine with annotation-derived seals"
```

---

### Task 21: E2E 阅读仪式 + Part 3 回归

**Files:**
- Create: `e2e/specs/reading-ritual.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
// e2e/specs/reading-ritual.spec.ts
import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedBriefing } from '../helpers/test-library'

function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

test.describe('@p1 reading ritual (燃熄 + 阖卷 + 脊柱)', () => {
  test('flame lit → scroll to end → colophon + spent; persists across reload; spine visible', async ({ window, testLibraryPath }) => {
    const today = localToday()
    seedBriefing(testLibraryPath, today)
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.locator(SELECTORS.briefing.receiveDigestButton).click()
    await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 15000 })

    // 今日烛火：已生成未读 = lit
    await expect(window.locator(`[data-testid="briefing-date-flame-${today}"]`)).toHaveAttribute('data-state', 'lit')

    // 滚到卷尾：阖卷 ◆ 静驻
    await window.locator(SELECTORS.briefing.academicLayout).evaluate((el) => el.scrollTo(0, (el as HTMLElement).scrollHeight))
    await expect(window.locator('[data-testid="briefing-colophon"]')).toBeVisible({ timeout: 5000 })
    // 燃熄：读过 = spent
    await expect(window.locator(`[data-testid="briefing-date-flame-${today}"]`)).toHaveAttribute('data-state', 'spent', { timeout: 5000 })

    // 跨重启持久化
    await window.reload()
    const cover2 = new CoverPage(window)
    await cover2.enterName('E2E 测试员')
    await cover2.goToBriefing()
    await expect(window.locator(`[data-testid="briefing-date-flame-${today}"]`)).toHaveAttribute('data-state', 'spent')

    // 脊柱存在（无标注时无封印，节点存在即可）
    await expect(window.locator('[data-testid="internalization-spine"]')).toBeAttached()
  })
})
```

- [ ] **Step 2: Run E2E**

Run: `npx playwright test --config e2e/playwright.config.ts reading-ritual`
Expected: PASS。`scrollTo` 目标容器若不是 academicLayout 本身，对照实际 DOM 调整为最近的 overflow 容器。

- [ ] **Step 3: Part 3 全量回归 + Commit**

Run: `npm run test`
Expected: 全绿

```bash
git add e2e/specs/reading-ritual.spec.ts
git commit -m "test(e2e): reading ritual flame/colophon/spine persistence"
```

---
---

# Part 4 照明层（F0 烛光随行 + F1 烛光有识 + F9 并置 + F10 聚焦呼吸）

**本部分铁律：**
- 对比度红线：烛光 alpha ≤0.20、screen 混合、文字层恒在光层之上（z-index 契约：画作 0 / 遮罩 1 / 烛光 3 / 内容 5）。
- 氛围功能给用户开关（烛光、并置）；开关状态持久化、跨重启保持。
- 光的调制通道不走 React state（高频 pointer 事件直写 DOM class）。

---

### Task 22: store 两个开关字段（candlelightEnabled / paintingPlateEnabled）

**Files:**
- Modify: `src/types/index.ts`（StateJson）
- Modify: `src/store/index.ts`（类型/init/hydration/actions）
- Test: `tests/store-lighting-toggles.test.ts`（新建）

- [ ] **Step 1: Write the failing test**

```ts
// tests/store-lighting-toggles.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest'

const patchState = vi.fn()
vi.mock('@/lib/ipc', () => ({ ipc: { patchState, getState: vi.fn() } }))
vi.mock('@/lib/paintings', () => ({ manifest: [], pickRandom: vi.fn(() => null) }))

import { useStore } from '@/store'

describe('store lighting toggles', () => {
  beforeEach(() => {
    patchState.mockClear()
    useStore.setState({ candlelightEnabled: true, paintingPlateEnabled: false })
  })

  it('candlelightEnabled defaults on and toggles with persistence', async () => {
    await useStore.getState().toggleCandlelight()
    expect(useStore.getState().candlelightEnabled).toBe(false)
    expect(patchState).toHaveBeenCalledWith({ candlelightEnabled: false })
    await useStore.getState().toggleCandlelight()
    expect(useStore.getState().candlelightEnabled).toBe(true)
  })

  it('paintingPlateEnabled defaults off and toggles with persistence', async () => {
    await useStore.getState().togglePaintingPlate()
    expect(useStore.getState().paintingPlateEnabled).toBe(true)
    expect(patchState).toHaveBeenCalledWith({ paintingPlateEnabled: true })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/store-lighting-toggles.test.ts`
Expected: FAIL — actions not defined

- [ ] **Step 3: 三层接线**

StateJson 加：

```ts
  candlelightEnabled?: boolean
  paintingPlateEnabled?: boolean
```

store 类型区加：

```ts
  candlelightEnabled: boolean
  paintingPlateEnabled: boolean
  toggleCandlelight: () => Promise<void>
  togglePaintingPlate: () => Promise<void>
```

init：`candlelightEnabled: true,`、`paintingPlateEnabled: false,`；hydration：

```ts
      candlelightEnabled: state.candlelightEnabled ?? true,
      paintingPlateEnabled: state.paintingPlateEnabled ?? false,
```

actions：

```ts
  toggleCandlelight: async () => {
    const next = !get().candlelightEnabled
    set({ candlelightEnabled: next })
    await ipc.patchState({ candlelightEnabled: next } as Partial<StateJson>)
  },
  togglePaintingPlate: async () => {
    const next = !get().paintingPlateEnabled
    set({ paintingPlateEnabled: next })
    await ipc.patchState({ paintingPlateEnabled: next } as Partial<StateJson>)
  },
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/store-lighting-toggles.test.ts tests/safe-json.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/store/index.ts tests/store-lighting-toggles.test.ts
git commit -m "feat(store): candlelight/plate toggle fields with persistence"
```

---

### Task 23: CandlelightLayer + 左下角控制簇

**Files:**
- Create: `src/components/briefing/CandlelightLayer.tsx`
- Create: `src/components/briefing/BriefingCornerControls.tsx`
- Modify: `src/pages/Briefing.tsx`（挂载）
- Test: `tests/candlelight-layer.test.tsx`（新建）

- [ ] **Step 1: Write the failing test**

```tsx
// tests/candlelight-layer.test.tsx
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({ ipc: { patchState: vi.fn(), getState: vi.fn() } }))
vi.mock('@/lib/paintings', () => ({ manifest: [], pickRandom: vi.fn(() => null) }))

import { useStore } from '@/store'
import { CandlelightLayer } from '@/components/briefing/CandlelightLayer'

function seed(over: Record<string, unknown> = {}) {
  useStore.setState({
    candlelightEnabled: true,
    briefingTheme: 'academic',
    briefingSource: 'digest',
    assistantSession: null,
    candleBreathAt: null,
    ...over,
  })
}

describe('CandlelightLayer', () => {
  beforeEach(() => { cleanup(); vi.useFakeTimers(); seed() })
  afterEach(() => { vi.useRealTimers() })

  it('renders glow when enabled+academic; hidden when disabled', () => {
    const { unmount } = render(<CandlelightLayer />)
    expect(screen.getByTestId('briefing-candlelight')).toBeInTheDocument()
    unmount()
    seed({ candlelightEnabled: false })
    render(<CandlelightLayer />)
    expect(screen.queryByTestId('briefing-candlelight')).toBeNull()
  })

  it('glow wakes on first mousemove and idles out after 8s', () => {
    render(<CandlelightLayer />)
    const layer = screen.getByTestId('briefing-candlelight')
    const glow = layer.querySelector('.candle-glow') as HTMLElement
    expect(glow.style.opacity).toBe('0')
    fireEvent.mouseMove(window, { clientX: 100, clientY: 100 })
    expect(glow.style.opacity).toBe('1')
    act(() => { vi.advanceTimersByTime(8100) })
    expect(glow.style.opacity).toBe('0')
    fireEvent.mouseMove(window, { clientX: 120, clientY: 120 })
    expect(glow.style.opacity).toBe('1')
  })

  it('job source uses star-blue candle', () => {
    seed({ briefingSource: 'job-briefing' })
    render(<CandlelightLayer />)
    const glow = screen.getByTestId('briefing-candlelight').querySelector('.candle-glow') as HTMLElement
    expect(glow.style.background).toContain('127, 168, 217')
  })

  it('candleBreathAt triggers a 1.5s breath (阖卷的风)', () => {
    render(<CandlelightLayer />)
    const glow = screen.getByTestId('briefing-candlelight').querySelector('.candle-glow') as HTMLElement
    act(() => { useStore.setState({ candleBreathAt: Date.now() }) })
    expect(glow.className).toContain('candle-breath-once')
    act(() => { vi.advanceTimersByTime(1600) })
    expect(glow.className).not.toContain('candle-breath-once')
  })

  it('assistant streaming makes the candle breathe; stop ends it', () => {
    render(<CandlelightLayer />)
    const glow = screen.getByTestId('briefing-candlelight').querySelector('.candle-glow') as HTMLElement
    act(() => { useStore.setState({ assistantSession: { streaming: true } as never }) })
    expect(glow.className).toContain('candle-breathe')
    act(() => { useStore.setState({ assistantSession: { streaming: false } as never }) })
    expect(glow.className).not.toContain('candle-breathe')
  })

  it('annotated paragraph hover warms the candle (有识)', () => {
    render(<CandlelightLayer />)
    const glow = screen.getByTestId('briefing-candlelight').querySelector('.candle-glow') as HTMLElement
    const para = document.createElement('div')
    para.innerHTML = '<span class="anno-wrap" data-anno-id="1"></span>'
    document.body.appendChild(para)
    fireEvent.pointerOver(para.querySelector('.anno-wrap')!)
    expect(glow.className).toContain('candle-warm')
    fireEvent.pointerOver(document.body)
    expect(glow.className).not.toContain('candle-warm')
    para.remove()
  })

  it('generation dims the candle (全场让路), restored afterwards', () => {
    render(<CandlelightLayer />)
    const glow = screen.getByTestId('briefing-candlelight').querySelector('.candle-glow') as HTMLElement
    act(() => { useStore.setState({ briefing: { result: null, loading: true, error: null } }) })
    expect(glow.className).toContain('candle-dim')
    expect(glow.style.width).toBe(`${Math.round(640 * 0.92)}px`)
    act(() => { useStore.setState({ briefing: { result: null, loading: false, error: null } }) })
    expect(glow.className).not.toContain('candle-dim')
    expect(glow.style.width).toBe('640px')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/candlelight-layer.test.tsx`
Expected: FAIL — component not found

- [ ] **Step 3: Write CandlelightLayer**

```tsx
// src/components/briefing/CandlelightLayer.tsx
import { useEffect, useRef } from 'react'
import { useStore } from '@/store'

const SIZE = 640
const LERP = 0.11
const IDLE_MS = 8000

const AMBER = { a: '255, 214, 150', b: '255, 190, 110', c: '255, 226, 175' }
const STAR_BLUE = { a: '180, 205, 240', b: '127, 168, 217', c: '200, 220, 245' }

function gradient(p: typeof AMBER): string {
  return [
    `radial-gradient(closest-side, rgba(${p.a}, 0.20), rgba(${p.b}, 0.08) 45%, transparent 72%)`,
    `radial-gradient(closest-side, rgba(${p.c}, 0.14), transparent 55%)`,
  ].join(', ')
}

// 烛光随行（F0）+ 有识调制（F1）+ 全场让路（F4）：光标带一池暖光，screen 混合，惯性跟随；
// 静止 8s 渐熄；识标注（warm）；助手流式（breathe）；阖卷（breath-once）；生成中半径 -8%/亮度 -6%。
// 全局 chrome：仅 Academic 渲染光层；求职源星蓝。高频路径直写 DOM，不走 React state。
export function CandlelightLayer() {
  const enabled = useStore((s) => s.candlelightEnabled)
  const theme = useStore((s) => s.briefingTheme)
  const source = useStore((s) => s.briefingSource)
  const breathAt = useStore((s) => s.candleBreathAt)
  const streaming = useStore((s) =>
    Boolean(s.assistantSession?.streaming || s.writingAssistant?.streaming))
  const generating = useStore((s) => s.briefing.loading || s.jobBriefing.loading)
  const glowRef = useRef<HTMLDivElement>(null)

  const isAcademic = theme !== 'newspaper'
  const palette = source === 'job-briefing' ? STAR_BLUE : AMBER
  const live = enabled && isAcademic

  // 随行 + 惯性 + 静止渐熄（rAF/定时器全部 cleanup）
  useEffect(() => {
    if (!live) return
    const glow = glowRef.current
    if (!glow) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    let seen = false
    let target = { x: window.innerWidth / 2, y: window.innerHeight * 0.4 }
    let pos = { ...target }
    let idleTimer: number | null = null

    const armIdle = () => {
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = window.setTimeout(() => { glow.style.opacity = '0' }, IDLE_MS)
    }
    const onMove = (e: MouseEvent) => {
      target = { x: e.clientX, y: e.clientY }
      if (!seen) { pos = { ...target }; seen = true }
      glow.style.opacity = '1'
      armIdle()
    }
    const onLeave = () => { glow.style.opacity = '0' }
    const frame = () => {
      const k = reduced ? 1 : LERP // reduced-motion：无惯性直接跟随
      pos.x += (target.x - pos.x) * k
      pos.y += (target.y - pos.y) * k
      glow.style.transform = `translate(${pos.x}px, ${pos.y}px)`
      raf = requestAnimationFrame(frame)
    }
    window.addEventListener('mousemove', onMove)
    document.documentElement.addEventListener('mouseleave', onLeave)
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      if (idleTimer) clearTimeout(idleTimer)
      window.removeEventListener('mousemove', onMove)
      document.documentElement.removeEventListener('mouseleave', onLeave)
    }
  }, [live])

  // 有识：事件代理，悬停标注/术语 → warm（不经 React state）
  useEffect(() => {
    if (!live) return
    const glow = glowRef.current
    if (!glow) return
    const onOver = (e: PointerEvent) => {
      const t = e.target as Element | null
      const near = t?.closest?.('.anno-wrap, .article-term-highlight') ?? null
      glow.classList.toggle('candle-warm', near !== null)
    }
    document.addEventListener('pointerover', onOver)
    return () => document.removeEventListener('pointerover', onOver)
  }, [live])

  // 阖卷的风：candleBreathAt → 1.5s breath-once
  useEffect(() => {
    const glow = glowRef.current
    if (!live || !breathAt || !glow) return
    glow.classList.add('candle-breath-once')
    const t = window.setTimeout(() => glow.classList.remove('candle-breath-once'), 1500)
    return () => clearTimeout(t)
  }, [live, breathAt])

  // 助手流式 → 呼吸
  useEffect(() => {
    const glow = glowRef.current
    if (!glow) return
    glow.classList.toggle('candle-breathe', live && streaming)
  }, [live, streaming])

  if (!live) return null

  return (
    <div data-testid="briefing-candlelight" className="fixed inset-0 z-[3] pointer-events-none" aria-hidden="true">
      <div
        ref={glowRef}
        className={`candle-glow ${live && generating ? 'candle-dim' : ''}`}
        style={{
          position: 'fixed', left: 0, top: 0,
          width: generating ? Math.round(SIZE * 0.92) : SIZE,   // 全场让路：半径 -8%
          height: generating ? Math.round(SIZE * 0.92) : SIZE,
          margin: -(generating ? Math.round(SIZE * 0.92) : SIZE) / 2,
          background: gradient(palette),
          mixBlendMode: 'screen',
          opacity: 0,
          transition: 'opacity 450ms ease, filter 600ms ease, width 1200ms ease, height 1200ms ease, margin 1200ms ease',
          willChange: 'transform',
        }}
      />
    </div>
  )
}
```

globals.css 追加：

```css
/* ===== 烛光调制（F1）+ 全场让路（F4） ===== */
.candle-glow.candle-warm { filter: saturate(1.3) brightness(1.12); }
.candle-glow.candle-dim { filter: brightness(0.94) saturate(0.95); } /* 生成中亮度 -6%，半径收缩见内联 width */
.candle-glow.candle-breathe { animation: candleBreathe 4s ease-in-out infinite; }
@keyframes candleBreathe { 50% { opacity: 0.62 !important; } }
.candle-glow.candle-breath-once { animation: candleBreathOnce 1.5s ease-in-out 1; }
@keyframes candleBreathOnce { 40% { opacity: 0.3 !important; } 100% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .candle-glow.candle-breathe, .candle-glow.candle-breath-once { animation: none; }
  .candle-glow.candle-warm { filter: saturate(1.15); }
}
```

（测试里 streaming/breath/dim 断言读的是 class 与内联 width——`candle-breathe` 的 opacity 动画在 jsdom 不生效但 class 在，断言成立。）

- [ ] **Step 4: Write BriefingCornerControls + 挂载**

```tsx
// src/components/briefing/BriefingCornerControls.tsx
import { useStore } from '@/store'

// 左下角控制簇：烛光开关（默认开）+ 画框开关（默认关）。
// Newspaper 主题：烛光置灰（无画作可照亮）；无画作：画框置灰。
export function BriefingCornerControls() {
  const theme = useStore((s) => s.briefingTheme)
  const candle = useStore((s) => s.candlelightEnabled)
  const plate = useStore((s) => s.paintingPlateEnabled)
  const painting = useStore((s) => s.currentPaintings.briefing)
  const toggleCandle = useStore((s) => s.toggleCandlelight)
  const togglePlate = useStore((s) => s.togglePaintingPlate)
  const isAcademic = theme !== 'newspaper'

  return (
    <div className="fixed left-3 bottom-3 z-[6] flex flex-col gap-2">
      <button
        type="button"
        data-testid="briefing-candlelight-toggle"
        aria-pressed={candle}
        disabled={!isAcademic}
        title={isAcademic ? '烛光随行' : 'Academic 主题下可用'}
        onClick={() => void toggleCandle()}
        className={`w-8 h-8 rounded-full border flex items-center justify-center transition-colors ${
          candle && isAcademic
            ? 'border-ember/60 text-ember bg-ember/10'
            : 'border-parchment/25 text-parchment/50'
        } ${!isAcademic ? 'opacity-40 cursor-not-allowed' : ''}`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
          strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <path d="M12 3c1.5 2.5 3.5 4.2 3.5 7a3.5 3.5 0 1 1-7 0c0-1.5.6-2.6 1.4-3.7.3 1 .9 1.7 1.6 2.2C11.6 6.6 11.7 4.8 12 3z" />
          <path d="M9 21h6" />
        </svg>
      </button>
      <button
        type="button"
        data-testid="painting-plate-toggle"
        aria-pressed={plate}
        disabled={!isAcademic || !painting}
        title={isAcademic ? '并置画框' : 'Academic 主题下可用'}
        onClick={() => void togglePlate()}
        className={`w-8 h-8 rounded-full border flex items-center justify-center transition-colors ${
          plate && isAcademic
            ? 'border-ember/60 text-ember bg-ember/10'
            : 'border-parchment/25 text-parchment/50'
        } ${!isAcademic || !painting ? 'opacity-40 cursor-not-allowed' : ''}`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
          strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <rect x="3" y="5" width="18" height="14" rx="1" />
          <rect x="6.5" y="8" width="11" height="8" />
        </svg>
      </button>
    </div>
  )
}
```

`Briefing.tsx` 挂载（页面根 div 内、与 ConfirmDialog 同级——全局 chrome，不受内容分支影响）：

```tsx
      <CandlelightLayer />
      <BriefingCornerControls />
```

（两个组件内部自判 Academic/Newspaper，页面层无条件挂载，符合 ui-styling §8。）

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/candlelight-layer.test.tsx tests/briefing-page.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/briefing/CandlelightLayer.tsx src/components/briefing/BriefingCornerControls.tsx src/pages/Briefing.tsx src/styles/globals.css tests/candlelight-layer.test.tsx
git commit -m "feat(lighting): candlelight layer with aware modulation + corner controls"
```

---

### Task 24: PaintingPlate 并置画框

**Files:**
- Create: `src/components/briefing/PaintingPlate.tsx`
- Modify: `src/components/briefing/AcademicBriefingLayout.tsx`（报头挂载）
- Test: `tests/painting-plate.test.tsx`（新建）

- [ ] **Step 1: Write the failing test**

```tsx
// tests/painting-plate.test.tsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({ ipc: { patchState: vi.fn(), getState: vi.fn() } }))
vi.mock('@/lib/paintings', () => ({ manifest: [], pickRandom: vi.fn(() => null) }))

import { useStore } from '@/store'
import { PaintingPlate } from '@/components/briefing/PaintingPlate'

const PAINT = { id: 'b1', painter: 'Guy Billout', title: 'World', url: 'paintings/001-world.jpg' }

describe('PaintingPlate', () => {
  beforeEach(() => {
    cleanup()
    useStore.setState({
      paintingPlateEnabled: false,
      currentPaintings: { cover: null, home: null, study: null, briefing: PAINT },
    })
  })

  it('hidden by default (paintingPlateEnabled=false)', () => {
    const { container } = render(<PaintingPlate />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows framed painting with attribution caption when enabled', () => {
    useStore.setState({ paintingPlateEnabled: true })
    render(<PaintingPlate />)
    const plate = screen.getByTestId('painting-plate')
    expect(plate.querySelector('img')!.getAttribute('src')).toBe('paintings/001-world.jpg')
    expect(screen.getByTestId('painting-plate-caption').textContent).toContain('Guy Billout · World')
  })

  it('renders nothing when no painting even if enabled', () => {
    useStore.setState({
      paintingPlateEnabled: true,
      currentPaintings: { cover: null, home: null, study: null, briefing: null },
    })
    const { container } = render(<PaintingPlate />)
    expect(container).toBeEmptyDOMElement()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/painting-plate.test.tsx`
Expected: FAIL — component not found

- [ ] **Step 3: Write the component + 挂载**

```tsx
// src/components/briefing/PaintingPlate.tsx
import { useStore } from '@/store'
import { formatAttribution } from '@/lib/paintings'

// 并置（F9）：报头把画作正式装裱挂出——画框、衬底、留白、画下展签。
// 默认不展示（左下角开关，决策权留给用户）。仅 digest Academic 落地。
export function PaintingPlate() {
  const enabled = useStore((s) => s.paintingPlateEnabled)
  const painting = useStore((s) => s.currentPaintings.briefing)
  if (!enabled || !painting) return null

  return (
    <figure
      data-testid="painting-plate"
      className="mx-auto mb-8 w-full max-w-[620px] p-2.5 bg-[#1c130d] border border-parchment/15 shadow-[0_18px_50px_rgba(0,0,0,0.5)]"
    >
      <div className="aspect-[21/9] w-full overflow-hidden">
        <img
          src={painting.url}
          alt={formatAttribution(painting)}
          className="w-full h-full object-cover"
          style={{ filter: 'brightness(1.1) saturate(1.06)' }}
        />
      </div>
      <figcaption
        data-testid="painting-plate-caption"
        className="mt-1.5 flex justify-between text-[10px] italic tracking-wider text-parchment/50"
      >
        <span>{formatAttribution(painting)}</span>
        <span>今日展品</span>
      </figcaption>
    </figure>
  )
}
```

`AcademicBriefingLayout`：`<header>` 内 title 之前（报头最上方）插 `<PaintingPlate />`。

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/painting-plate.test.tsx tests/briefing-layout.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/briefing/PaintingPlate.tsx src/components/briefing/AcademicBriefingLayout.tsx tests/painting-plate.test.tsx
git commit -m "feat(lighting): painting plate with default-off corner toggle"
```

---

### Task 25: use-focus-zone + 聚焦呼吸接线

**Files:**
- Create: `src/lib/use-focus-zone.ts`
- Modify: `src/pages/Briefing.tsx`（三区 data-zone 包裹 + hook）
- Modify: `src/styles/globals.css`
- Test: `tests/use-focus-zone.test.ts`（新建）

- [ ] **Step 1: Write the failing test**

```ts
// tests/use-focus-zone.test.ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useFocusZone } from '@/lib/use-focus-zone'

function buildDom() {
  document.body.innerHTML = `
    <div id="root">
      <div data-zone="rail-source"><button id="s1">x</button></div>
      <div data-zone="rail-list"><button id="l1">x</button></div>
      <div data-zone="article"><p id="a1">text</p></div>
    </div>`
  return document.getElementById('root') as HTMLElement
}

describe('useFocusZone', () => {
  let root: HTMLElement
  beforeEach(() => { root = buildDom() })
  afterEach(() => { document.body.innerHTML = '' })

  it('pointer over a zone lights it and dims the rest; leaving returns to rest(none)', () => {
    const rootRef = { current: root }
    renderHook(() => useFocusZone(rootRef))
    expect(root.dataset.focusZone).toBe('none')

    document.getElementById('a1')!.dispatchEvent(new MouseEvent('pointermove', { bubbles: true }))
    expect(root.dataset.focusZone).toBe('article')

    document.getElementById('s1')!.dispatchEvent(new MouseEvent('pointermove', { bubbles: true }))
    expect(root.dataset.focusZone).toBe('rail-source')

    document.body.dispatchEvent(new MouseEvent('pointermove', { bubbles: true }))
    expect(root.dataset.focusZone).toBe('none')
  })

  it('keyboard focus inside a zone counts as presence (无障碍)', () => {
    const rootRef = { current: root }
    renderHook(() => useFocusZone(rootRef))
    document.getElementById('l1')!.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    expect(root.dataset.focusZone).toBe('rail-list')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/use-focus-zone.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the hook**

```ts
// src/lib/use-focus-zone.ts
import { useEffect, type RefObject } from 'react'

export type FocusZone = 'article' | 'rail-source' | 'rail-list' | 'none'

/**
 * 聚焦呼吸（F10）：光标/键盘所在区全亮，其余两区缓熄。
 * 直接写根元素 data-focus-zone 属性（高频 pointermove 不经 React state）。
 * 区元素以 data-zone="article|rail-source|rail-list" 标记。
 */
export function useFocusZone(rootRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    root.dataset.focusZone = 'none'

    const classify = (target: EventTarget | null) => {
      const zone = (target as Element | null)?.closest?.('[data-zone]')
      root.dataset.focusZone = zone?.getAttribute('data-zone') ?? 'none'
    }
    const onPointer = (e: PointerEvent) => classify(e.target)
    const onFocus = (e: FocusEvent) => classify(e.target)
    const onLeave = () => { root.dataset.focusZone = 'none' }

    window.addEventListener('pointermove', onPointer, { passive: true })
    window.addEventListener('focusin', onFocus)
    document.documentElement.addEventListener('mouseleave', onLeave)
    return () => {
      window.removeEventListener('pointermove', onPointer)
      window.removeEventListener('focusin', onFocus)
      document.documentElement.removeEventListener('mouseleave', onLeave)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
```

globals.css 追加（静息 0.38 基线；熄灭仅降透明度，不动布局）：

```css
/* ===== 聚焦呼吸（F10）：三区照明 ===== */
.focus-zone-root [data-zone] { transition: opacity 250ms ease; }
.focus-zone-root[data-focus-zone="none"] [data-zone] { opacity: 0.38; }
.focus-zone-root[data-focus-zone="article"] [data-zone="rail-source"],
.focus-zone-root[data-focus-zone="article"] [data-zone="rail-list"],
.focus-zone-root[data-focus-zone="rail-source"] [data-zone="article"],
.focus-zone-root[data-focus-zone="rail-source"] [data-zone="rail-list"],
.focus-zone-root[data-focus-zone="rail-list"] [data-zone="article"],
.focus-zone-root[data-focus-zone="rail-list"] [data-zone="rail-source"] { opacity: 0.38; }
```

- [ ] **Step 4: Briefing.tsx 三区包裹**

页面根 div 加 `focus-zone-root` class + ref 接 hook：

```tsx
  const rootRef = useRef<HTMLDivElement>(null)
  useFocusZone(rootRef)
  // <div ref={rootRef} data-testid="briefing-page" className={`focus-zone-root relative h-full flex overflow-hidden ...`}
```

三处包裹（`display: contents` 不影响布局）：
- `<BriefingSourceSidebar>` 外包 `<div data-zone="rail-source" className="contents">`
- 三个 `BriefingListColumn` 分支各自外包 `<div data-zone="rail-list" className="contents">`
- 中央 `flex-1 flex flex-col min-w-0` 列 + 三个助手面板（ArticleAssistantPanel ×2 / WritingAssistantPanel）共同外包 `<div data-zone="article" className="contents">`

（`display: contents` 的 opacity 不生效——所以 data-zone 必须挂在**实际渲染的容器**上：SourceSidebar 根、ListColumn 根、中央列根、助手面板根。实现时改为给这些现有容器透传/追加 data-zone 属性（如 `BriefingSourceSidebar` 根元素直接加 `data-zone="rail-source"`），而非 contents 包裹。中央列已有 `flex-1 flex flex-col min-w-0` 根，直接加 `data-zone="article"`；助手面板根元素加 `data-zone="article"`。）

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/use-focus-zone.test.ts tests/briefing-page.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/use-focus-zone.ts src/pages/Briefing.tsx src/styles/globals.css tests/use-focus-zone.test.ts
git commit -m "feat(lighting): focus breathing across three page zones"
```

---

### Task 26: 助手面板流式态确认（F1 接线校验）

**Files:**
- Modify: `src/store/index.ts`（仅当字段名不符时）

- [ ] **Step 1: 确认 `writingAssistant.streaming` 存在**

Run: `grep -n "writingAssistant" src/store/index.ts | grep -i "stream\|open\|width" | head -10`
Expected: 存在 `writingAssistant` 切片且含 `streaming: boolean`（Task 23 的 `s.writingAssistant?.streaming` 订阅依赖它）。若字段名不符（如 `writingAssistantStreaming`），回头改 Task 23 组件选择器并同步 `tests/candlelight-layer.test.tsx` 的 seed。

- [ ] **Step 2: Commit（若有改动）**

```bash
git add src/store/index.ts src/components/briefing/CandlelightLayer.tsx tests/candlelight-layer.test.tsx
git commit -m "fix(lighting): align streaming selector with store field"
```

---

### Task 27: E2E 照明层

**Files:**
- Create: `e2e/specs/lighting.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
// e2e/specs/lighting.spec.ts
import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedBriefing } from '../helpers/test-library'

function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

test.describe('@p1 lighting layer (烛光 + 并置 + 聚焦呼吸)', () => {
  test('candlelight on by default, toggle persists across reload', async ({ window, testLibraryPath }) => {
    seedBriefing(testLibraryPath, localToday())
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.locator(SELECTORS.briefing.receiveDigestButton).click()
    await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 15000 })

    // 默认开：光层存在；关闭后消失
    await expect(window.locator('[data-testid="briefing-candlelight"]')).toBeAttached()
    await window.locator('[data-testid="briefing-candlelight-toggle"]').click()
    await expect(window.locator('[data-testid="briefing-candlelight"]')).toHaveCount(0)

    // 跨重启保持关闭
    await window.reload()
    const cover2 = new CoverPage(window)
    await cover2.enterName('E2E 测试员')
    await cover2.goToBriefing()
    await expect(window.locator('[data-testid="briefing-candlelight"]')).toHaveCount(0)
  })

  test('painting plate hidden by default, toggle shows it with real painting src', async ({ window, testLibraryPath }) => {
    seedBriefing(testLibraryPath, localToday())
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.locator(SELECTORS.briefing.receiveDigestButton).click()
    await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 15000 })

    await expect(window.locator('[data-testid="painting-plate"]')).toHaveCount(0)
    await window.locator('[data-testid="painting-plate-toggle"]').click()
    const plate = window.locator('[data-testid="painting-plate"]')
    await expect(plate).toBeVisible()
    const src = await plate.locator('img').getAttribute('src')
    expect(src).toBeTruthy()
    await expect(window.locator('[data-testid="painting-plate-caption"]')).toContainText('·')
  })

  test('focus breathing: hovering date rail dims the article zone', async ({ window, testLibraryPath }) => {
    seedBriefing(testLibraryPath, localToday())
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.locator(SELECTORS.briefing.receiveDigestButton).click()
    await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 15000 })

    const root = window.locator('[data-testid="briefing-page"]')
    await expect(root).toHaveAttribute('data-focus-zone', 'none')
    await window.locator('[data-zone="rail-list"]').first().hover()
    await expect(root).toHaveAttribute('data-focus-zone', 'rail-list')
    const opacity = await window.locator('[data-zone="article"]').first().evaluate(
      (el) => getComputedStyle(el).opacity,
    )
    expect(parseFloat(opacity)).toBeLessThan(1)
  })

  test('newspaper theme: candlelight absent and its toggle greyed', async ({ window, testLibraryPath }) => {
    seedBriefing(testLibraryPath, localToday())
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window.locator(SELECTORS.briefing.receiveDigestButton).click()
    await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 15000 })

    await window.locator('[data-testid="briefing-theme-toggle"]').click()
    await expect(window.locator('[data-testid="briefing-candlelight"]')).toHaveCount(0)
    await expect(window.locator('[data-testid="briefing-candlelight-toggle"]')).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run E2E**

Run: `npx playwright test --config e2e/playwright.config.ts lighting`
Expected: PASS (4 tests)

- [ ] **Step 3: Commit**

```bash
git add e2e/specs/lighting.spec.ts
git commit -m "test(e2e): lighting layer candle/plate/focus-breathing/theme"
```

---

### Task 28: §11 规则登记（全量）+ 终验

**Files:**
- Modify: `.claude/rules/ui-styling.md`（§11）
- Modify: `.claude/rules/README.md`（Changelog）

- [ ] **Step 1: §11 追加（在 Task 9 的重量语法条目之后）**

```markdown
- 光的语言两个层级：烛光（点照明，CandlelightLayer，screen 混合 alpha ≤0.20）与聚焦呼吸（区照明，data-focus-zone 三区，熄灭仅降透明度 ≥0.38）。求职星蓝烛光为例外主色的合法用法（源标识性元素）。
- 检定动效协议：凡「世界在做决定」的时刻（归档/随机控件），先有可见的不确定相（光子互逐/CRT 颗粒），再以运动语言收束成败（急停坠落 vs 漂移褪冷）；不设人为最短时长，绑定真实异步时长。
- 内化脊柱是引力/轨道语汇的衍生 motif；「读完」「内化」等文档记忆只从真实用户行为（滚动、标注）推导，不伪造进度。
```

- [ ] **Step 2: README.md Changelog 追加一行（顶部）**

```markdown
- `2026-07-25` ui-styling §11 登记：光的语言两层级（烛光/聚焦呼吸）、检定动效协议、内化脊柱 motif（来自审美提升总计划 Part 2-4：生成仪式 B、燃熄阖卷、并置画框）。
```

- [ ] **Step 3: 全量终验**

Run: `npm run test`
Expected: 全绿（含 Part 1-4 全部新增测试）

Run: `npm run build`
Expected: 构建成功无 TS 错误

Run: `npx playwright test --config e2e/playwright.config.ts painting-swap generation-ceremony reading-ritual lighting`
Expected: 四组新 E2E 全绿

- [ ] **Step 4: Commit**

```bash
git add .claude/rules/ui-styling.md .claude/rules/README.md
git commit -m "docs(rules): register light language, check protocol, spine motif in ui-styling §11"
```

---

## 全局边界行为清单核对（spec §7）

| # | 边界 | 覆盖处 |
|---|---|---|
| 1 快速切源/切日期 | Task 11 hook key 归零；Task 12/23 cleanup；E2E Part 2 revisit 断言 |
| 2 失败/取消 | Task 11 failing/idle 两路测试；Task 12 failed mode；Task 13 编排 |
| 3 finalizing <400ms | Task 12 checking 由 stage 驱动，无最短时长 |
| 5 短正文 | Task 16 hasScrolled 守卫测试 |
| 6 无画作 | Task 4/24 测试；Task 23 画框开关置灰 |
| 7 无 guide chunks | Task 20 脊柱回退 markdown 锚点/不渲染 |
| 8 标注映射失败 | Task 20 util 测试（少封不错封） |
| 9 Newspaper 主题 | Task 12 墨色；Task 18 墨火；Task 23 置灰；Task 27 E2E |
| 10 reduced-motion | Task 2/12/14/20/23 CSS 退化；Task 23 直接跟随 |
| 12 对比度红线 | Task 23 alpha 0.20 常量；Task 25 opacity ≥0.38 |
| 14 旧 state.json | Task 17/22 hydration 默认值测试 |
| 15 烛光静止 8s | Task 23 idle 测试 |
| 16 组件卸载 | 所有 hook/组件 effect cleanup（各 Task 代码内） |


