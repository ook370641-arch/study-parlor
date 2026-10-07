# 封面画作裁剪 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 封面新增裁剪按钮，拖拽缩略图上的裁剪框实时调整当前封面画作焦点（`object-position`），松手写回 `Pictures/index.json`。

**Architecture:** 纯函数几何模块（搬 crop-tool.html 的 object-cover 数学）+ 主进程 IPC 写回 index.json + 渲染组件拖拽联动 store。dev-only：打包版/E2E 环境不渲染入口。

**Tech Stack:** Electron 30 + React 18 + TypeScript + Zustand + Vitest + Playwright。

**Spec:** `docs/superpowers/specs/2026-10-07-cover-painting-crop-design.md`

## 对 spec 的两处细化（实现中发现的简化）

1. **不在运行时重新生成 `painting-manifest.json`**。dev server 启动（`configureServer`）和 build（`buildStart`）都会从 index.json 重新生成 manifest，运行时写它是多余的，还会触发 Vite reload 重洗画作。因此 `electron.vite.config.ts` 的 `watch.ignored` 也**不需要改**（index.json 不在渲染模块图中，改动不会触发 reload）。
2. **E2E 环境 `app.isPackaged` 为 false**（跑的是 out/ 未打包构建）。`paintings:canEdit` 额外检查 `process.env.E2E_CONFIG_DIR`，防止 E2E 污染真实画作库；E2E 断言按钮不渲染即可。

## Global Constraints

- 测试只跑定向：`npx vitest run <改动对应的测试文件>`；E2E 用 `node scripts/e2e-changed.js --run --no-retries`。禁止全量。
- 组件文件只导出组件（ui-styling §10）；helper/常量放 `src/lib/`。
- 按钮样式复用全局 `swap-btn` class；琥珀色用 Tailwind `ember`（#d97757）。
- IPC 错误码用类型化联合，定义在 `src/types/index.ts`（ipc-state §2）。
- `FOCUS_RE` / `DEFAULT_FOCUS` 与 `scripts/curation-crop.cjs` 保持一致：`/^\d{1,3}% \d{1,3}%$/`、`'50% 50%'`。
- 可交互元素必须有 `data-testid`（feature-development §12）。

---

### Task 1: crop-geometry 纯函数模块

**Files:**
- Create: `src/lib/crop-geometry.ts`
- Test: `tests/crop-geometry.test.ts`

**Interfaces:**
- Produces（后续任务依赖这些签名）:
  - `DEFAULT_FOCUS: string`（= `'50% 50%'`）
  - `CropGeo = { s, left, top, rectW, rectH, rangeX, rangeY: number }`
  - `computeCropGeo(args: { imgW, imgH, stageW, stageH, viewportW, viewportH: number }): CropGeo | null`
  - `focusToRect(focus: string, geo: CropGeo): { left: number; top: number }`（返回相对缩略图左上角的偏移）
  - `rectToFocus(left: number, top: number, geo: CropGeo): string`
  - `parseFocus(focus: string): [number, number]`
  - `formatFocus(x: number, y: number): string`

- [ ] **Step 1: Write the failing test**

```ts
// tests/crop-geometry.test.ts
import { describe, it, expect } from 'vitest'
import { computeCropGeo, focusToRect, rectToFocus, formatFocus, parseFocus } from '@/lib/crop-geometry'

describe('crop-geometry', () => {
  // 横图 2000x1000，舞台 320x160（contain s=0.16），视口 1600x900
  // object-cover: k=max(0.8,0.9)=0.9 → cw=1777.8, ch=1000 → 只横向有余量
  const geo = computeCropGeo({ imgW: 2000, imgH: 1000, stageW: 320, stageH: 160, viewportW: 1600, viewportH: 900 })!

  it('computeCropGeo 计算裁剪框与可移动范围', () => {
    expect(geo.s).toBeCloseTo(0.16)
    expect(geo.rangeX).toBeCloseTo(35.56, 1)
    expect(geo.rangeY).toBe(0)
    expect(geo.rectW).toBeCloseTo(1777.78 * 0.16, 1)
    expect(geo.rectH).toBeCloseTo(160)
  })

  it('focusToRect 把百分比焦点映射为框位置', () => {
    const r = focusToRect('50% 50%', geo)
    expect(r.left).toBeCloseTo(geo.rangeX / 2)
    expect(r.top).toBe(0)
  })

  it('rectToFocus 边界：0 → 0%，rangeX → 100%', () => {
    expect(rectToFocus(0, 0, geo)).toBe('0% 50%')
    expect(rectToFocus(geo.rangeX, 0, geo)).toBe('100% 50%')
  })

  it('object-cover 总有一轴无余量，该轴锁 50%', () => {
    // 竖图 1000x2000，视口 1600x900 → 横向无余量
    const g2 = computeCropGeo({ imgW: 1000, imgH: 2000, stageW: 320, stageH: 160, viewportW: 1600, viewportH: 900 })!
    expect(g2.rangeX).toBe(0)
    expect(g2.rangeY).toBeGreaterThan(0)
    expect(rectToFocus(5, g2.rangeY, g2)).toBe('50% 100%')
  })

  it('自由轴往返换算一致', () => {
    const r = focusToRect('50% 60%', geo) // rangeY=0，y 轴恒 50
    expect(rectToFocus(r.left, r.top, geo)).toBe('50% 50%')
    const g2 = computeCropGeo({ imgW: 1000, imgH: 2000, stageW: 320, stageH: 160, viewportW: 1600, viewportH: 900 })!
    const r2 = focusToRect('50% 60%', g2)
    expect(rectToFocus(r2.left, r2.top, g2)).toBe('50% 60%')
  })

  it('formatFocus clamp 到 0-100 并取整', () => {
    expect(formatFocus(-5, 130)).toBe('0% 100%')
    expect(formatFocus(33.6, 66.4)).toBe('34% 66%')
  })

  it('parseFocus 容错非法输入', () => {
    expect(parseFocus('50% 30%')).toEqual([50, 30])
    expect(parseFocus('garbage')).toEqual([50, 50])
  })

  it('非法尺寸返回 null', () => {
    expect(computeCropGeo({ imgW: 0, imgH: 100, stageW: 320, stageH: 160, viewportW: 1600, viewportH: 900 })).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/crop-geometry.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/crop-geometry.ts
// 封面裁剪的 object-cover 几何：缩略图 contain 适配舞台，裁剪框 = 视口宽高比在
// 原图上的可见窗口（换算到舞台像素）。数学与 scripts/curation-crop.cjs 的 geo() 一致。

export const DEFAULT_FOCUS = '50% 50%'

export interface CropGeo {
  /** 缩略图缩放比（contain） */
  s: number
  /** 缩略图左上角在舞台内的偏移 */
  left: number
  top: number
  /** 裁剪框尺寸（舞台像素） */
  rectW: number
  rectH: number
  /** 裁剪框可移动范围（舞台像素）；object-cover 总有一轴为 0 */
  rangeX: number
  rangeY: number
}

export function parseFocus(focus: string): [number, number] {
  const [x, y] = focus.split(' ').map(v => parseFloat(v))
  return [Number.isFinite(x) ? x : 50, Number.isFinite(y) ? y : 50]
}

export function formatFocus(x: number, y: number): string {
  const c = (v: number) => Math.round(Math.max(0, Math.min(100, v)))
  return `${c(x)}% ${c(y)}%`
}

export function computeCropGeo(args: {
  imgW: number; imgH: number; stageW: number; stageH: number; viewportW: number; viewportH: number
}): CropGeo | null {
  const { imgW, imgH, stageW, stageH, viewportW, viewportH } = args
  if (!imgW || !imgH || !stageW || !stageH || !viewportW || !viewportH) return null
  const s = Math.min(stageW / imgW, stageH / imgH)
  const k = Math.max(viewportW / imgW, viewportH / imgH)
  const cw = viewportW / k
  const ch = viewportH / k
  return {
    s,
    left: (stageW - imgW * s) / 2,
    top: (stageH - imgH * s) / 2,
    rectW: cw * s,
    rectH: ch * s,
    rangeX: Math.max(0, (imgW - cw) * s),
    rangeY: Math.max(0, (imgH - ch) * s),
  }
}

export function focusToRect(focus: string, geo: CropGeo): { left: number; top: number } {
  const [fx, fy] = parseFocus(focus)
  return { left: geo.rangeX * fx / 100, top: geo.rangeY * fy / 100 }
}

export function rectToFocus(left: number, top: number, geo: CropGeo): string {
  const fx = geo.rangeX ? (left / geo.rangeX) * 100 : 50
  const fy = geo.rangeY ? (top / geo.rangeY) * 100 : 50
  return formatFocus(fx, fy)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/crop-geometry.test.ts`
Expected: PASS（8 个用例）

- [ ] **Step 5: Commit**

```bash
git add src/lib/crop-geometry.ts tests/crop-geometry.test.ts
git commit -m "feat(crop): 封面裁剪几何模块——object-cover 窗口与焦点双向换算"
```

---

### Task 2: painting-focus 写回模块（主进程侧纯逻辑）

**Files:**
- Create: `electron/lib/painting-focus.ts`
- Modify: `src/types/index.ts`（加 `PaintingFocusErrorCode`，放在 `Painting` 类型附近，约 974 行后）
- Test: `tests/painting-focus.test.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - `PaintingFocusErrorCode = 'INVALID_FOCUS' | 'UNKNOWN_PAINTING' | 'INDEX_UNREADABLE' | 'WRITE_FAILED'`（在 src/types/index.ts）
  - `applyFocusToIndex(indexPath: string, id: string, focus: string): { ok: true } | { ok: false; code: PaintingFocusErrorCode; message: string }`
  - `FOCUS_RE: RegExp`

- [ ] **Step 1: 在 src/types/index.ts 加错误码类型**

在 `Painting` 类型定义（约 974-984 行）之后加：

```ts
/** 画作焦点写回的错误码（paintings:setFocus IPC） */
export type PaintingFocusErrorCode = 'INVALID_FOCUS' | 'UNKNOWN_PAINTING' | 'INDEX_UNREADABLE' | 'WRITE_FAILED'
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/painting-focus.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { applyFocusToIndex, FOCUS_RE } from '@electron/lib/painting-focus'

let dir: string
let indexPath: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'painting-focus-'))
  indexPath = path.join(dir, 'index.json')
  fs.writeFileSync(indexPath, JSON.stringify([
    { id: 'p1', file: 'a.jpg', painter: '莫奈', title: '睡莲' },
    { id: 'p2', file: 'b.jpg', painter: '梵高', title: '星夜', focus: '40% 60%' },
  ], null, 2))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('applyFocusToIndex', () => {
  it('写入非默认 focus', () => {
    const r = applyFocusToIndex(indexPath, 'p1', '62% 30%')
    expect(r).toEqual({ ok: true })
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'))
    expect(index[0].focus).toBe('62% 30%')
    expect(index[1].focus).toBe('40% 60%') // 其他条目不动
  })

  it('默认 focus 删除字段（与 curation-crop 约定一致）', () => {
    const r = applyFocusToIndex(indexPath, 'p2', '50% 50%')
    expect(r).toEqual({ ok: true })
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'))
    expect('focus' in index[1]).toBe(false)
  })

  it('非法 focus 拒绝且不写盘', () => {
    const before = fs.readFileSync(indexPath, 'utf-8')
    const r = applyFocusToIndex(indexPath, 'p1', 'abc')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('INVALID_FOCUS')
    expect(fs.readFileSync(indexPath, 'utf-8')).toBe(before)
  })

  it('未知 id 报 UNKNOWN_PAINTING', () => {
    const r = applyFocusToIndex(indexPath, 'nope', '50% 30%')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('UNKNOWN_PAINTING')
  })

  it('index.json 不存在报 INDEX_UNREADABLE', () => {
    const r = applyFocusToIndex(path.join(dir, 'missing.json'), 'p1', '50% 30%')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('INDEX_UNREADABLE')
  })

  it('FOCUS_RE 与 curation-crop 一致', () => {
    expect(FOCUS_RE.test('50% 30%')).toBe(true)
    expect(FOCUS_RE.test('0% 100%')).toBe(true)
    expect(FOCUS_RE.test('50%30%')).toBe(false)
    expect(FOCUS_RE.test('50%')).toBe(false)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/painting-focus.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 4: Write minimal implementation**

```ts
// electron/lib/painting-focus.ts
// 画作焦点写回 Pictures/index.json。与 scripts/curation-crop.cjs 的约定一致：
// FOCUS_RE 校验、默认焦点（50% 50%）删字段、tmp+rename 原子写。
import fs from 'node:fs'
import type { PaintingFocusErrorCode } from '@shared/index'

export const DEFAULT_FOCUS = '50% 50%'
export const FOCUS_RE = /^\d{1,3}% \d{1,3}%$/

export type SetFocusResult = { ok: true } | { ok: false; code: PaintingFocusErrorCode; message: string }

export function applyFocusToIndex(indexPath: string, id: string, focus: string): SetFocusResult {
  if (!FOCUS_RE.test(focus)) {
    return { ok: false, code: 'INVALID_FOCUS', message: `非法 focus 格式: ${focus}` }
  }
  let index: Array<{ id?: string; focus?: string }>
  try {
    index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'))
  } catch (err) {
    return { ok: false, code: 'INDEX_UNREADABLE', message: `index.json 读取失败: ${err instanceof Error ? err.message : String(err)}` }
  }
  const entry = index.find(p => p.id === id)
  if (!entry) {
    return { ok: false, code: 'UNKNOWN_PAINTING', message: `未知画作 id: ${id}` }
  }
  if (focus === DEFAULT_FOCUS) delete entry.focus
  else entry.focus = focus
  try {
    const tmp = indexPath + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(index, null, 2) + '\n')
    fs.renameSync(tmp, indexPath)
  } catch (err) {
    return { ok: false, code: 'WRITE_FAILED', message: `index.json 写入失败: ${err instanceof Error ? err.message : String(err)}` }
  }
  return { ok: true }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/painting-focus.test.ts`
Expected: PASS（6 个用例）

- [ ] **Step 6: Commit**

```bash
git add electron/lib/painting-focus.ts src/types/index.ts tests/painting-focus.test.ts
git commit -m "feat(crop): 画作焦点写回 index.json 模块——校验/默认值删字段/原子写"
```

---

### Task 3: IPC 三层接线（types → handler → preload → facade → 注册）

**Files:**
- Create: `electron/ipc/paintings.ts`
- Modify: `src/types/index.ts`（`IpcApi` 类型，约 698 行起；把两条加在 `Painting` 相关的注释分区附近或 IpcApi 末尾闭合前）
- Modify: `electron/preload.ts`（加在 `scoutDeleteArticle` / `onScoutTool` 之后）
- Modify: `src/lib/ipc.ts`（facade，加在 Scout 区之后）
- Modify: `electron/ipc/index.ts`（注册）

**Interfaces:**
- Consumes: Task 2 的 `applyFocusToIndex`；`PaintingFocusErrorCode`
- Produces（Task 4/5 依赖）:
  - `IpcApi.paintingsCanEdit: () => Promise<boolean>`
  - `IpcApi.paintingsSetFocus: (args: { id: string; focus: string }) => Promise<{ ok: true } | { ok: false; code: PaintingFocusErrorCode; message: string }>`
  - facade: `ipc.paintingsCanEdit` / `ipc.paintingsSetFocus`

- [ ] **Step 1: IpcApi 加两条**

`src/types/index.ts` 的 `IpcApi` 内（Scout 段之后、闭合 `}` 之前）加：

```ts
  // 画作裁剪（dev-only，打包版/e2e 下 canEdit=false）
  paintingsCanEdit: () => Promise<boolean>
  paintingsSetFocus: (args: { id: string; focus: string }) => Promise<{ ok: true } | { ok: false; code: PaintingFocusErrorCode; message: string }>
```

- [ ] **Step 2: 新建 electron/ipc/paintings.ts**

```ts
// 画作裁剪 IPC。dev-only：打包版与 e2e（E2E_CONFIG_DIR）下 canEdit=false，
// 渲染进程据此隐藏入口。setFocus 写 Pictures/index.json（事实源），manifest 由
// vite-paintings-plugin 在 dev 启动 / build 时重新生成，运行时无需处理。
import fs from 'node:fs'
import path from 'node:path'
import { app, ipcMain } from 'electron'
import { applyFocusToIndex } from '../lib/painting-focus'

function resolveIndexPath(): string {
  // 与 electron/ipc/files.ts getExtensionInfo 相同的路径解析
  const base = app.isPackaged ? path.dirname(app.getPath('exe')) : app.getAppPath()
  return path.join(base, 'Pictures', 'index.json')
}

function canEdit(): boolean {
  if (app.isPackaged) return false
  if (process.env.E2E_CONFIG_DIR) return false // e2e 跑未打包构建，防止污染真实画作库
  try {
    fs.accessSync(resolveIndexPath(), fs.constants.W_OK)
    return true
  } catch {
    return false
  }
}

export function registerPaintingsIpc() {
  ipcMain.handle('paintings:canEdit', async () => canEdit())
  ipcMain.handle('paintings:setFocus', async (_event, args: { id: string; focus: string }) =>
    applyFocusToIndex(resolveIndexPath(), args?.id ?? '', args?.focus ?? ''))
}
```

- [ ] **Step 3: preload.ts 暴露**

`electron/preload.ts` 的 api 对象中（`onScoutTool` 之后）加：

```ts
  paintingsCanEdit: () => ipcRenderer.invoke('paintings:canEdit'),
  paintingsSetFocus: (a) => ipcRenderer.invoke('paintings:setFocus', a),
```

- [ ] **Step 4: facade 加 getter**

`src/lib/ipc.ts`（`onScoutTool` getter 之后）加：

```ts
  get paintingsCanEdit() { return ensure().paintingsCanEdit },
  get paintingsSetFocus() { return ensure().paintingsSetFocus },
```

- [ ] **Step 5: 注册**

`electron/ipc/index.ts`：import 并调用（无 cfg 依赖，加在 `registerAppIpc()` 前）：

```ts
import { registerPaintingsIpc } from './paintings'
// registerAllIpc 内：
  registerPaintingsIpc()
```

- [ ] **Step 6: 类型检查 + 既有测试不回归**

Run: `npx tsc --noEmit`
Expected: 无错误

Run: `npx vitest run tests/crop-geometry.test.ts tests/painting-focus.test.ts`
Expected: PASS（接线不影响纯逻辑）

- [ ] **Step 7: Commit**

```bash
git add electron/ipc/paintings.ts electron/ipc/index.ts electron/preload.ts src/lib/ipc.ts src/types/index.ts
git commit -m "feat(crop): paintings:canEdit/setFocus IPC 三层接线"
```

---

### Task 4: store 字段与 action

**Files:**
- Modify: `src/store/index.ts`（类型区约 279-284 行；初始值区约 620 行；init 约 778 行；swapPainting 附近加 action）

**Interfaces:**
- Consumes: `ipc.paintingsCanEdit`（Task 3）
- Produces:
  - `paintingsEditable: boolean`（默认 false）
  - `setPaintingFocus: (surface: 'cover' | 'home' | 'study' | 'briefing', focus: string) => void`

- [ ] **Step 1: 类型区加声明（约 282 行 `paintingDeleteEnabled` 后）**

```ts
  /** dev 模式下允许在封面拖拽调整画作焦点（打包版/e2e 隐藏入口，启动时经 IPC 拉取） */
  paintingsEditable: boolean
```

操作区（`setPaintingDeleteEnabled` 声明后）加：

```ts
  setPaintingFocus: (surface: 'cover' | 'home' | 'study' | 'briefing', focus: string) => void
```

- [ ] **Step 2: 初始值（约 620 行 `currentPaintings` 初始值附近）**

```ts
      paintingsEditable: false,
```

- [ ] **Step 3: init() 拉取（`get().initPaintings()` 一行之后）**

```ts
    // dev-only 裁剪入口开关；失败静默（默认 false 即隐藏入口）
    ipc.paintingsCanEdit().then(v => set({ paintingsEditable: v === true })).catch(() => {})
```

- [ ] **Step 4: setPaintingFocus action（`swapPainting` 实现之后）**

```ts
  // 拖拽裁剪实时调用：同步改 manifest 条目（本会话内换走再换回仍是新焦点），
  // currentPaintings 换新对象触发 SurfaceBackground 的 objectPosition 更新。
  setPaintingFocus: (surface, focus) => {
    const current = get().currentPaintings[surface]
    if (!current) return
    const entry = manifest.find(p => p.id === current.id)
    if (entry) entry.focus = focus
    set(state => ({
      currentPaintings: { ...state.currentPaintings, [surface]: { ...current, focus } }
    }))
  },
```

顶部 import 处把 `manifest` 加入已有的 `@/lib/paintings` import（该行已 import `paintingPool` 等，补上 `manifest`）。

- [ ] **Step 5: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 6: Commit**

```bash
git add src/store/index.ts
git commit -m "feat(crop): store 增 paintingsEditable 开关与 setPaintingFocus 实时联动"
```

---

### Task 5: PaintingCropButton 组件 + Cover 接入

**Files:**
- Create: `src/components/PaintingCropButton.tsx`
- Modify: `src/pages/Cover.tsx`（按钮组接入）
- Test: `tests/PaintingCrop.test.tsx`

**Interfaces:**
- Consumes: Task 1（crop-geometry）、Task 3（`ipc.paintingsSetFocus`）、Task 4（`paintingsEditable` / `setPaintingFocus`）
- Produces: `<PaintingCropButton />`（封面右上角按钮组用，`data-testid="cover-crop-button"`）

- [ ] **Step 1: Write the failing test**

```tsx
// tests/PaintingCrop.test.tsx
// 封面裁剪：入口显隐 → 面板开合（按钮/Esc/点外部）→ 拖拽联动 store → 松手落盘 → 重置 → 失败提示。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'

const mockIpc = {
  paintingsCanEdit: vi.fn(() => Promise.resolve(true)),
  paintingsSetFocus: vi.fn(() => Promise.resolve({ ok: true as const })),
}
vi.mock('@/lib/ipc', () => ({ ipc: new Proxy({}, { get: (_, k) => mockIpc[k as keyof typeof mockIpc] ?? (() => Promise.resolve()) }) }))

import { PaintingCropButton } from '@/components/PaintingCropButton'
import { useStore } from '@/store'

const PAINTING = { id: 'p1', painter: '莫奈', title: '睡莲', url: 'paintings/x.jpg', focus: '50% 50%' }

function seed(editable = true) {
  useStore.setState({
    paintingsEditable: editable,
    currentPaintings: { cover: { ...PAINTING }, home: null, study: null, briefing: null },
  })
}

// jsdom 无布局与图片解码：mock 原图尺寸 + 舞台尺寸
beforeAll(() => {
  Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', { configurable: true, get() { return 2000 } })
  Object.defineProperty(HTMLImageElement.prototype, 'naturalHeight', { configurable: true, get() { return 1000 } })
})

beforeEach(() => {
  vi.clearAllMocks()
  seed()
})

afterEach(() => {
  cleanup()
})

// jsdom 视口默认 1024x768：k=max(0.512,0.768)=0.768 → cw=1333.3, ch=1000
// 舞台 320x160：s=0.16 → rangeX=(2000-1333.3)*0.16≈106.67，rangeY=0
async function openPanelWithGeo() {
  render(<PaintingCropButton />)
  fireEvent.click(screen.getByTestId('cover-crop-button'))
  const stage = screen.getByTestId('cover-crop-stage')
  Object.defineProperty(stage, 'clientWidth', { configurable: true, value: 320 })
  Object.defineProperty(stage, 'clientHeight', { configurable: true, value: 160 })
  fireEvent.load(stage.querySelector('img')!)
  await act(async () => { fireEvent(window, new Event('resize')) })
  return screen.getByTestId('cover-crop-rect')
}

describe('封面画作裁剪', () => {
  it('paintingsEditable=false 或无画作时不渲染入口', () => {
    seed(false)
    const { unmount } = render(<PaintingCropButton />)
    expect(screen.queryByTestId('cover-crop-button')).toBeNull()
    unmount()
    useStore.setState({ currentPaintings: { cover: null, home: null, study: null, briefing: null } })
    render(<PaintingCropButton />)
    expect(screen.queryByTestId('cover-crop-button')).toBeNull()
  })

  it('按钮开合面板，Esc 与点击外部关闭', async () => {
    render(<PaintingCropButton />)
    expect(screen.queryByTestId('cover-crop-panel')).toBeNull()
    fireEvent.click(screen.getByTestId('cover-crop-button'))
    expect(screen.getByTestId('cover-crop-panel')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByTestId('cover-crop-panel')).toBeNull()
    fireEvent.click(screen.getByTestId('cover-crop-button'))
    fireEvent.click(screen.getByTestId('cover-crop-overlay'))
    expect(screen.queryByTestId('cover-crop-panel')).toBeNull()
  })

  it('拖拽裁剪框实时更新 store 焦点，松手写回 index.json', async () => {
    const rect = await openPanelWithGeo()
    expect(screen.getByTestId('cover-crop-readout').textContent).toContain('50% 50%')

    fireEvent.pointerDown(rect, { clientX: 50, clientY: 50 })
    fireEvent.pointerMove(window, { clientX: 250, clientY: 50 }) // +200 超出 rangeX → clamp 到 100%
    expect(useStore.getState().currentPaintings.cover?.focus).toBe('100% 50%')
    expect(screen.getByTestId('cover-crop-readout').textContent).toContain('100% 50%')
    expect(mockIpc.paintingsSetFocus).not.toHaveBeenCalled() // 拖动中不落盘

    await act(async () => { fireEvent.pointerUp(window) })
    expect(mockIpc.paintingsSetFocus).toHaveBeenCalledWith({ id: 'p1', focus: '100% 50%' })
  })

  it('重置恢复面板打开时的焦点并落盘', async () => {
    const rect = await openPanelWithGeo()
    fireEvent.pointerDown(rect, { clientX: 50, clientY: 50 })
    fireEvent.pointerMove(window, { clientX: 250, clientY: 50 })
    await act(async () => { fireEvent.pointerUp(window) })
    expect(useStore.getState().currentPaintings.cover?.focus).toBe('100% 50%')

    await act(async () => { fireEvent.click(screen.getByTestId('cover-crop-reset')) })
    expect(useStore.getState().currentPaintings.cover?.focus).toBe('50% 50%')
    expect(mockIpc.paintingsSetFocus).toHaveBeenLastCalledWith({ id: 'p1', focus: '50% 50%' })
  })

  it('保存失败显示错误文案，store 不回滚', async () => {
    mockIpc.paintingsSetFocus.mockResolvedValue({ ok: false, code: 'WRITE_FAILED', message: 'index.json 写入失败' } as never)
    const rect = await openPanelWithGeo()
    fireEvent.pointerDown(rect, { clientX: 50, clientY: 50 })
    fireEvent.pointerMove(window, { clientX: 250, clientY: 50 })
    await act(async () => { fireEvent.pointerUp(window) })
    expect(screen.getByTestId('cover-crop-error').textContent).toContain('index.json 写入失败')
    expect(useStore.getState().currentPaintings.cover?.focus).toBe('100% 50%')
  })
})
```

（文件顶部 `beforeAll` 需 import：`import { beforeAll } from 'vitest'` —— 并入首行 import。）

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/PaintingCrop.test.tsx`
Expected: FAIL（组件不存在）

- [ ] **Step 3: Write the component**

```tsx
// src/components/PaintingCropButton.tsx
// 封面裁剪：缩略图完整原图 + 琥珀裁剪框（object-cover 可见窗口），拖拽实时联动封面，
// 松手经 paintings:setFocus 写回 Pictures/index.json。dev-only 入口（paintingsEditable）。
import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store'
import { ipc } from '@/lib/ipc'
import { computeCropGeo, focusToRect, rectToFocus, DEFAULT_FOCUS, type CropGeo } from '@/lib/crop-geometry'

const clamp = (v: number, hi: number) => Math.max(0, Math.min(hi, v))

export function PaintingCropButton() {
  const painting = useStore(s => s.currentPaintings.cover)
  const editable = useStore(s => s.paintingsEditable)
  const setPaintingFocus = useStore(s => s.setPaintingFocus)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null)
  const [stageSize, setStageSize] = useState<{ w: number; h: number } | null>(null)
  const [viewport, setViewport] = useState({ w: 0, h: 0 })
  const stageRef = useRef<HTMLDivElement | null>(null)
  const originalFocusRef = useRef(DEFAULT_FOCUS)
  const geoRef = useRef<CropGeo | null>(null)
  const focusRef = useRef(DEFAULT_FOCUS)

  const focus = painting?.focus ?? DEFAULT_FOCUS
  focusRef.current = focus

  // 面板打开：记录原值（重置目标）+ 初始化视口
  useEffect(() => {
    if (!open) return
    originalFocusRef.current = focusRef.current
    setError(null)
    setImgSize(null)
    setViewport({ w: window.innerWidth, h: window.innerHeight })
  }, [open])

  // 视口 resize：裁剪框宽高比 = 封面视口宽高比，跟随重算
  useEffect(() => {
    if (!open) return
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [open])

  // 测量舞台（图片加载 / resize / 开合后）
  useEffect(() => {
    if (!open) return
    const el = stageRef.current
    if (el) setStageSize({ w: el.clientWidth, h: el.clientHeight })
  }, [open, imgSize, viewport])

  // Esc 关闭
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const geo = open && imgSize && stageSize
    ? computeCropGeo({ imgW: imgSize.w, imgH: imgSize.h, stageW: stageSize.w, stageH: stageSize.h, viewportW: viewport.w, viewportH: viewport.h })
    : null
  geoRef.current = geo

  if (!editable || !painting) return null

  const save = (f: string) => {
    void ipc.paintingsSetFocus({ id: painting.id, focus: f }).then(res => {
      if (!res.ok) setError(res.message)
    })
  }

  const onRectPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!geoRef.current) return
    e.preventDefault()
    const base = focusToRect(focusRef.current, geoRef.current)
    const startX = e.clientX
    const startY = e.clientY
    const move = (ev: PointerEvent) => {
      const g = geoRef.current
      if (!g) return
      const nl = clamp(base.left + ev.clientX - startX, g.rangeX)
      const nt = clamp(base.top + ev.clientY - startY, g.rangeY)
      setPaintingFocus('cover', rectToFocus(nl, nt, g))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setError(null)
      save(focusRef.current)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const rect = geo ? focusToRect(focus, geo) : null

  return (
    <>
      <button
        data-testid="cover-crop-button"
        type="button"
        className="swap-btn"
        aria-label="裁剪画作"
        onClick={() => setOpen(v => !v)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <path d="M6 2v14a2 2 0 0 0 2 2h14" />
          <path d="M18 22V8a2 2 0 0 0-2-2H2" />
        </svg>
      </button>
      {open && (
        <>
          <div data-testid="cover-crop-overlay" className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            data-testid="cover-crop-panel"
            className="absolute top-14 right-4 z-20 w-[340px] rounded-lg border border-parchment/30
                       bg-[rgba(15,10,8,0.85)] backdrop-blur-md p-3 shadow-lg"
          >
            <div className="mb-2 text-xs text-parchment/60">裁剪画作 · 拖拽琥珀框，封面实时联动</div>
            <div ref={stageRef} data-testid="cover-crop-stage" className="relative w-full aspect-[2/1] overflow-hidden">
              <img
                src={painting.url}
                alt=""
                draggable={false}
                className="absolute max-w-none select-none"
                style={geo && imgSize
                  ? { width: imgSize.w * geo.s, height: imgSize.h * geo.s, left: geo.left, top: geo.top }
                  : { visibility: 'hidden' }}
                onLoad={e => setImgSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              />
              {geo && rect && (
                <div
                  data-testid="cover-crop-rect"
                  onPointerDown={onRectPointerDown}
                  className="absolute border-2 border-ember cursor-grab active:cursor-grabbing touch-none"
                  style={{
                    left: geo.left + rect.left,
                    top: geo.top + rect.top,
                    width: geo.rectW,
                    height: geo.rectH,
                    boxShadow: '0 0 0 9999px rgba(10,6,4,0.62)',
                  }}
                />
              )}
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span data-testid="cover-crop-readout" className="text-xs text-parchment/60">焦点 {focus}</span>
              <button
                type="button"
                data-testid="cover-crop-reset"
                className="text-xs text-parchment/60 hover:text-ember"
                onClick={() => { setPaintingFocus('cover', originalFocusRef.current); save(originalFocusRef.current) }}
              >
                重置
              </button>
            </div>
            {error && <div data-testid="cover-crop-error" className="mt-1 text-xs text-red-400">{error}</div>}
          </div>
        </>
      )}
    </>
  )
}
```

- [ ] **Step 4: Cover.tsx 接入**

`src/pages/Cover.tsx`：import 并在右上角按钮组（记事板按钮之前）加 `<PaintingCropButton />`：

```tsx
import { PaintingCropButton } from '@/components/PaintingCropButton'
// ...
        <SwapPaintingButton surface="cover" />
        {paintingDeleteEnabled && <DeletePaintingButton surface="cover" />}
        <PaintingCropButton />
        <button data-testid="cover-notepad-button" ...>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/PaintingCrop.test.tsx tests/Cover.test.tsx`
Expected: PASS（Cover 既有测试不回归——paintingsEditable 默认 false，入口不渲染）

- [ ] **Step 6: Commit**

```bash
git add src/components/PaintingCropButton.tsx src/pages/Cover.tsx tests/PaintingCrop.test.tsx
git commit -m "feat(crop): 封面裁剪按钮——拖拽缩略图裁剪框实时联动并写回 index.json"
```

---

### Task 6: E2E 门控断言 + source-map + 全链路验证

**Files:**
- Modify: `e2e/helpers/selectors.ts`（cover 组加 cropButton）
- Modify: `e2e/specs/cover.spec.ts`（@p1 组加一个用例）
- Modify: `e2e/source-map.json`（cover 所在 group 的 sources 加新文件 glob）

**Interfaces:**
- Consumes: Task 5 的 `data-testid="cover-crop-button"`
- Produces: E2E 断言打包构建中入口隐藏 + `window.api.paintingsCanEdit` 已暴露（满足 ipc-state §1 启动探测要求）

- [ ] **Step 1: selectors.ts 加选择器**

在 `SELECTORS.cover` 对象内加：

```ts
cropButton: '[data-testid="cover-crop-button"]',
```

- [ ] **Step 2: cover.spec.ts 加用例（@p1 describe 内）**

```ts
  test('crop button hidden outside dev (e2e/packaged)', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.nameInput.or(cover.lightButton).waitFor({ state: 'visible' })

    // e2e 环境 E2E_CONFIG_DIR 置位 → canEdit=false → 入口不渲染（打包版同理走 isPackaged）
    await expect(window.locator(SELECTORS.cover.cropButton)).toHaveCount(0)

    // IPC 暴露探测：打包/未打包构建的 preload 都必须挂上（ipc-state §1）
    const hasApi = await window.evaluate(() => typeof (window as unknown as { api: Record<string, unknown> }).api.paintingsCanEdit === 'function')
    expect(hasApi).toBe(true)
  })
```

- [ ] **Step 3: source-map.json 维护**

打开 `e2e/source-map.json`，找到 `specs` 含 `cover.spec.ts` 的 group，在其 `sources` 中追加：

```json
"src/components/PaintingCropButton.tsx",
"src/lib/crop-geometry.ts",
"src/pages/Cover.tsx",
"electron/ipc/paintings.ts",
"electron/lib/painting-focus.ts"
```

（`src/pages/Cover.tsx` 若已在列则跳过；保持 JSON 合法、无尾逗号。）

- [ ] **Step 4: 构建 + 定向 E2E**

Run: `node scripts/e2e-changed.js --run --no-retries`
Expected: cover group 的 spec 被执行且全部通过（e2e-changed 自动先构建 out/）

- [ ] **Step 5: dev 手动冒烟（向用户报告，由用户确认）**

```bash
npm run dev
```

人工确认：封面右上角出现裁剪按钮 → 点击展开面板 → 拖拽琥珀框封面实时移动 → 松手后 `Pictures/index.json` 对应条目 focus 更新 → `npm run dev` 重启后焦点保持。

- [ ] **Step 6: Commit**

```bash
git add e2e/helpers/selectors.ts e2e/specs/cover.spec.ts e2e/source-map.json
git commit -m "test(crop): E2E 断言打包/e2e 环境裁剪入口隐藏 + IPC 暴露探测"
```

---

## Self-Review 记录

- Spec 覆盖：UI 入口/面板/拖拽联动（Task 5）✓；几何模块（Task 1）✓；IPC 写回（Task 2/3）✓；dev-only 门控 + E2E 断言（Task 3/6）✓；打包版分析已在 spec 记录、本计划不实现 ✓。spec 中「watch.ignored 防护」经分析为多余（见顶部细化 1），已移除。
- 类型一致性：`paintingsCanEdit` / `paintingsSetFocus` / `setPaintingFocus` / `paintingsEditable` / `applyFocusToIndex` / `computeCropGeo` / `focusToRect` / `rectToFocus` / `CropGeo` 跨任务签名一致 ✓。
- 占位符扫描：无 TBD/TODO ✓。
