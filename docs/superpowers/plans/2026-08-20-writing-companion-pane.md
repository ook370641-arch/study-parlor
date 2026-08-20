# 写作右栏对照文模式（Companion Pane）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 写作页右栏从「AI 助手独占」改为「助手 ⇄ 对照文章」互斥槽位；对照文可编辑（无 toolbar）、按主文持久化映射、左键情境化换文；顺带删除文件树右键菜单。

**Architecture:** 全部在渲染进程 + store。store 新增对照槽（`companionFile`）+ 两个持久化字段（`writingPanelMode`/`writingCompanionMap`）；`WritingAssistantPanel` 改为槽位容器；新组件 `CompanionBoard` 复用 md/html/只读三分派；`WritingTree` 左键分流 + 双高亮 + 删菜单。主进程/IPC/preload 零改动。

**Tech Stack:** React 18 + Zustand + Milkdown v7 + Vitest + Playwright。

**Spec:** `docs/superpowers/specs/2026-08-20-writing-companion-pane-design.md`

## Global Constraints

- 主进程 / preload / IPC **零改动**——读用现有 `writingRead`/`writingReadPreview`，写用 `writingWrite`，持久化用现有 `patchState`。
- 新持久化字段必须带默认值并兼容旧 state.json（ipc-state §3）：`?? 'assistant'` / `?? {}`。
- **不动** toolbar 焦点路由；对照编辑器用 `registerToolbarAction={false}` 隔离（spec「toolbar 隔离」节）。
- **不动**助手会话的 `articlePath` 绑定机制（`selectWritingFile` 中 `wa.articlePath !== filePath` 段原样保留）。
- 组件文件只导出组件（ui-styling §10）；helper 入 `src/lib/`。
- 验证只跑受影响测试（general §9），禁止全量；E2E 用 `node scripts/e2e-changed.js --run --no-retries`。
- 提交信息遵循仓库现有中文 conventional 风格（如 `feat(writing): ...`）。

---

### Task 1: store 对照槽 + 映射持久化 + actions

**Files:**
- Modify: `src/types/index.ts`（StateJson 两个可选字段）
- Modify: `src/store/index.ts`
- Test: `tests/writing-companion.test.ts`（新建；store 测试先例见 `tests/writing-store.test.ts`、`tests/writing-assistant-store.test.ts`）

**Interfaces:**
- Consumes: 现有 `ipc.writingRead` / `ipc.writingReadPreview` / `ipc.writingWrite` / `ipc.patchState`；`writingPreviewKindOf`。
- Produces（Task 2/3 复用）:
  - state：`writingPanelMode: 'assistant' | 'companion'`、`writingCompanionMap: Record<string, string>`、`companionFile: { path: string; body: string; kind: WritingPreviewKind; truncated?: boolean; previewError?: string; dirty: boolean; saving: 'idle' | 'saving' | 'saved' | 'error' } | null`
  - actions：`setWritingPanelMode(mode)`、`selectCompanionFile(path: string)`、`updateCompanionBody(body: string)`、`saveCompanionFile()`、`closeCompanion()`、`saveAllDirtyWriting()`

- [ ] **Step 1: 写失败测试**

新建 `tests/writing-companion.test.ts`。参考 `tests/writing-store.test.ts` 的 store 驱动方式（`useStore` 经 `window` 暴露仅 E2E；单测直接 import store，ipc 走 mock——照抄 writing-assistant-store.test.ts 的 mock 模式）。用例：

```ts
// tests/writing-companion.test.ts
describe('writing companion store', () => {
  it('初始：panelMode=assistant，companionFile=null，companionMap={}', () => { /* ... */ })

  it('setWritingPanelMode 切模式并 patchState 持久化', () => { /* 断言 ipc.patchState 被调，参数含 writingPanelMode */ })

  it('selectCompanionFile：装载 md 并写入映射（patchState 含 writingCompanionMap）', () => { /* mock writingRead 返回 body；断言 companionFile 与映射 */ })

  it('selectCompanionFile：path 等于当前主文 → 拒绝，toast，状态不变', () => { /* ... */ })

  it('selectCompanionFile：旧对照文 dirty → 先 saveCompanionFile 再切换', () => { /* 断言 writingWrite 先于 writingRead 被调 */ })

  it('非 md 对照文走 writingReadPreview 分支（kind=html）', () => { /* ... */ })

  it('读取失败 → 清映射 + toast + companionFile=null', () => { /* mock writingRead 返回 ok:false */ })

  it('selectWritingFile 切主文：对照文 dirty 先保存；有映射则恢复新主文的对照文', () => { /* ... */ })

  it('selectWritingFile 切主文：无映射 → companionFile 清空', () => { /* ... */ })

  it('closeCompanion：dirty 先存，清槽，panelMode 回 assistant，映射保留', () => { /* 断言 map 仍在 */ })

  it('saveAllDirtyWriting：主文+对照文中 dirty 者各存一次，clean 者不写', () => { /* 断言 writingWrite 调用次数与路径 */ })

  it('防竞态：连续两次 selectCompanionFile，过期结果被丢弃（companionSelectSeq）', () => { /* 复刻 writingSelectSeq 语义 */ })

  it('旧 state.json 无新字段 → 合并默认值不炸（ipc-state §3）', () => { /* ... */ })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/writing-companion.test.ts`
Expected: FAIL（字段/action 不存在）

- [ ] **Step 3: 实现**

(a) `src/types/index.ts` 的 `StateJson`（`:578` 附近）追加：

```ts
  writingPanelMode?: 'assistant' | 'companion'
  writingCompanionMap?: Record<string, string>
```

(b) `src/store/index.ts`：

- state 声明区（`:395-420` 附近）加三个字段；初始值区（`:574-590`）加 `writingPanelMode: 'assistant'`、`writingCompanionMap: {}`、`companionFile: null`；loadState 合并区（`:595-627` 模式）加 `writingPanelMode: state.writingPanelMode ?? 'assistant'`、`writingCompanionMap: state.writingCompanionMap ?? {}`。
- 模块级加 `let companionSelectSeq = 0`（复刻 `writingSelectSeq` 模式）。
- 实现六个 action。`selectCompanionFile` 要点：
  - `++companionSelectSeq` 记 seq；`if (path === get().writingFile?.path)` → `showToast('该文章已在主编辑区打开')` return。
  - 旧 `companionFile?.dirty` → `await get().saveCompanionFile()`。
  - 写映射：`const main = get().writingFile?.path; if (main) { const map = { ...get().writingCompanionMap, [main]: path }; set({ writingCompanionMap: map }); ipc.patchState({ writingCompanionMap: map } as Partial<StateJson>) }`。
  - kind 分流照抄 `selectWritingFile`（`:2513-2535`）：非 md 走 `writingReadPreview`，md 走 `writingRead`；每步 `if (seq !== companionSelectSeq) return`；失败 → 清映射（`delete map[main]` + patchState）+ toast + `companionFile: null`。
- `selectWritingFile`（`:2510` 起）在主文 dirty 先存之后追加：对照文 dirty 先存；若 `get().writingPanelMode === 'companion'` → 查 `writingCompanionMap[filePath]`，有则走装载（seq 复用 companionSelectSeq），无则 `set({ companionFile: null })`。
- `saveAllDirtyWriting`：`const tasks = []; if (get().writingFile?.dirty) tasks.push(get().saveWritingFile()); if (get().companionFile?.dirty) tasks.push(get().saveCompanionFile()); await Promise.all(tasks)`。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/writing-companion.test.ts`
Expected: PASS（13 条）

同时确认既有 store/写作测试不回归：
Run: `npx vitest run tests/writing-store.test.ts tests/writing-assistant-store.test.ts tests/store.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/store/index.ts tests/writing-companion.test.ts
git commit -m "feat(writing): 对照文状态槽与主文-对照映射持久化（panelMode/companionMap/companionFile）"
```

---

### Task 2: 槽位容器改造 + CompanionBoard + toolbar 隔离

**Files:**
- Modify: `src/components/writing/WritingEditor.tsx`（`registerToolbarAction` prop）
- Modify: `src/components/writing-assistant/WritingAssistantPanel.tsx`（槽位容器：tab 头 + 模式分派）
- Create: `src/components/writing/CompanionBoard.tsx`
- Modify: `src/components/writing/WritingBoard.tsx`（Ctrl+S 改调 `saveAllDirtyWriting`）
- Test: `tests/writing-companion-pane.test.tsx`（新建；组件测试先例见 `tests/writing-assistant-panel.test.tsx`）

**Interfaces:**
- Consumes: Task 1 的 state/actions；现有 `HtmlPreview`/`ReadonlyPreview`/`WritingAssistantMessages`/`WritingAssistantInput`。
- Produces: `<CompanionBoard />`（`data-testid="companion-board"`）。

- [ ] **Step 1: 写失败测试**

`tests/writing-companion-pane.test.tsx`（render + store 直驱，照抄 writing-assistant-panel.test.tsx 模式）：

```ts
describe('companion pane', () => {
  it('默认渲染助手 tab 内容；点对照 tab → 切到对照模式', () => { /* 断言 tab testid 与内容区 */ })

  it('对照模式无 companionFile → 空态引导文案（companion-empty）', () => { /* ... */ })

  it('主区无文章（writingFile=null）→ 对照 tab 置灰 disabled', () => { /* ... */ })

  it('对照模式有 md companionFile → 渲染编辑器宿主', () => { /* 断言 companion-board 存在 */ })

  it('对照模式有 html companionFile → 渲染 HtmlPreview（writing-html-preview-iframe）', () => { /* ... */ })

  it('✕ → closeCompanion 被调（回助手模式）', () => { /* ... */ })

  it('CompanionBoard 的 WritingEditor 不注册全局 toolbar action（registerToolbarAction=false）', () => { /* 挂载后断言 store.writingEditorAction 仍为 null */ })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/writing-companion-pane.test.tsx`
Expected: FAIL

- [ ] **Step 3: 实现**

(a) `WritingEditor.tsx`：`Props` 加 `registerToolbarAction?: boolean`，`EditorInner` 的注册 effect 包条件：

```ts
useEffect(() => {
  if (registerAction === false) return        // 对照编辑器：不触碰全局 toolbar 槽
  if (!loading) {
    loadedRef.current = true
    setAction((fn: any) => { getRef.current()?.action(fn) })
  }
  return () => { setAction(null) }
}, [loading, setAction, registerAction])
```

（`loadedRef.current = true` 必须留在条件外或在对照分支也执行——onChange gate 依赖它；实现时把 gate 赋值与 action 注册拆开，对照实例只跳过注册、不跳过 gate。）

(b) `WritingAssistantPanel.tsx`：头部（`:49-59`）改为 tab 行——左「助手 | 对照」segmented（`writing-panel-tab-assistant`/`writing-panel-tab-companion`，置灰逻辑：`!writingFile` 时对照 tab disabled），右 ✕ 关闭不变。内容区：`writingPanelMode === 'assistant' ? <><WritingAssistantMessages /><WritingAssistantInput /></> : <CompanionBoard />`。容器折叠/拖宽/`writingAssistantWidth` 逻辑一行不动。

(c) `CompanionBoard.tsx`（新）：头部信息行（`displayWritingName(companionFile.path)` + 保存状态文案复刻主文 + ✕ `companion-close`）；空态 `companion-empty`（文案「点击左侧文件树中的一篇文章，在此展开对照」）；md → `<WritingEditor key={path} initial={body} onChange={updateCompanionBody} registerToolbarAction={false} />`；html → `<HtmlPreview file={...} />`；其余 → `<ReadonlyPreview file={...} />`；autosave effect 复刻 `WritingBoard.tsx:19-23`。样式变量（`--writing-body-size` 等）从 `WritingBoard` 的 style 块抄过来，保证两栏排版一致。

(d) `WritingBoard.tsx`：Ctrl+S 监听 handler（`:28-35`）改调 `saveAllDirtyWriting()`；其余不动。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/writing-companion-pane.test.tsx tests/writing-assistant-panel.test.tsx tests/writing-editor.test.tsx`
Expected: PASS（新 7 条 + 既有两文件不回归）

- [ ] **Step 5: Commit**

```bash
git add src/components/writing/WritingEditor.tsx src/components/writing-assistant/WritingAssistantPanel.tsx src/components/writing/CompanionBoard.tsx src/components/writing/WritingBoard.tsx tests/writing-companion-pane.test.tsx
git commit -m "feat(writing): 右栏槽位化——助手⇄对照 tab 切换 + CompanionBoard + 对照编辑器 toolbar 隔离"
```

---

### Task 3: 文件树——左键分流 + 双高亮 + 删除右键菜单

**Files:**
- Modify: `src/components/writing/WritingTree.tsx`
- Test: `tests/writing-tree-delete.test.tsx`（既有，核对不回归）；新建用例并入 `tests/writing-companion-pane.test.tsx` 或 `tests/writing-list-column.test.tsx`（按贴近度选择）

**Interfaces:**
- Consumes: Task 1 的 `writingPanelMode`/`writingAssistantOpen`/`companionFile`/`selectCompanionFile`。
- Produces: 树节点 `data-companion="true"` 属性（E2E 断言用）。

- [ ] **Step 1: 写失败测试**

```ts
describe('文件树对照交互', () => {
  it('对照模式展开时左键点文章 → selectCompanionFile（不写主文）', () => { /* ... */ })
  it('助手模式或右栏折叠时左键点文章 → selectWritingFile（现状）', () => { /* ... */ })
  it('目录节点点击仍只展开/收起，不分流', () => { /* ... */ })
  it('对照文在树中带 data-companion 与高亮 class；主文高亮不变', () => { /* ... */ })
  it('右键任意节点不弹出菜单（menu 已删除）', () => { /* fireEvent.contextMenu 后断言无菜单文案 */ })
  it('hover 的 ✎/＋/🗀/🗑 与拖拽移出分组仍可用（删菜单无功能回退）', () => { /* 既有用例兜底 + 移出分组走根投放区 onDrop（WritingTree.tsx:416-430） */ })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/writing-companion-pane.test.tsx`
Expected: 新用例 FAIL

- [ ] **Step 3: 实现**

`WritingTree.tsx`：

(a) `TreeNode` 新增订阅：`const panelMode = useStore(s => s.writingPanelMode)`、`const assistantOpen = useStore(s => s.writingAssistantOpen)`、`const companionPath = useStore(s => s.companionFile?.path)`、`const selectCompanionFile = useStore(s => s.selectCompanionFile)`。

(b) `handleClick`（`:48-52`）分流：

```ts
const handleClick = () => {
  if (editing) return
  if (isDir) { setWritingGroupExpanded(node.path, !open); return }
  if (assistantOpen && panelMode === 'companion') selectCompanionFile(node.path)
  else selectWritingFile(node.path)
}
```

(c) 双高亮：行 className 块（`:133-139`）加对照分支——`isCompanion = companionPath === node.path && !isSelected`；academic：`bg-parchment/8 shadow-[inset_2px_0_0_rgba(232,213,183,0.4)]`；newspaper：`bg-[#6b5d52]/10 shadow-[inset_2px_0_0_rgba(42,31,26,0.35)]`。行根元素加 `data-companion={isCompanion || undefined}`。

(d) 删右键菜单：`menu`/`setMenu` state、`handleContextMenu`、`closeMenu`、`:59-65` 外点关闭 effect、`:278-321` 菜单 JSX、菜单专属 `doRename`（`:69-82`）；移除 `onContextMenu={handleContextMenu}` 绑定与因此 dead 的 import/变量。**保留**：`doNewFile`/`doNewFolder`（hover 按钮用）、`setEditing`/`setConfirmingDelete` 路径、拖拽全部逻辑。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/writing-companion-pane.test.tsx tests/writing-tree-delete.test.tsx tests/writing-list-column.test.tsx tests/writing-inline-input.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/writing/WritingTree.tsx tests/writing-companion-pane.test.tsx
git commit -m "feat(writing): 文件树左键情境化（对照模式直选对照文）+ 对照高亮 + 删除右键菜单"
```

---

### Task 4: E2E + source-map 核对

**Files:**
- Create: `e2e/specs/writing-companion-pane.spec.ts`（命名落入 `writing-*` 通配，自动归 writing group）
- Modify: `e2e/source-map.json`（仅当 `e2e-changed.js` 报孤儿 WARNING 或新源文件未被 writing group sources 覆盖时）

- [ ] **Step 1: 写 E2E spec**

参照既有 writing 相关 spec 的 fixture/学习库 seed 模式，覆盖 spec 验收清单的 UI 链路：

```ts
// 核心断言（data-testid）
// 1. writing-panel-tab-companion 可见 → 点击 → companion-empty 空态出现
// 2. 对照模式下左键点树文章 → companion-board 出现且含该文名；树节点带 data-companion
// 3. 编辑对照文 → 等待 autosave → 磁盘文件内容更新（或保存状态 testid 变化）
// 4. 切主文 → companion-board 随映射恢复/清空
// 5. 重启（reload）后映射恢复（state.json 持久化）
// 6. 右键树节点 → 无菜单
// 7. toolbar 隔离：对照编辑器挂载后主编辑器 toolbar 按钮仍生效
```

- [ ] **Step 2: 构建并跑定向 E2E**

```bash
node scripts/e2e-changed.js --run --no-retries
```

Expected: writing group 受影响 spec（含新 spec）全 PASS；无孤儿 spec WARNING。若有 WARNING → 更新 `e2e/source-map.json`（writing group 的 sources 补 `src/components/writing/CompanionBoard.tsx` 等未被 `**` 覆盖的新文件；store/index.ts 若不在任何 group 则按现有归类处理）。

- [ ] **Step 3: Commit**

```bash
git add e2e/specs/writing-companion-pane.spec.ts e2e/source-map.json
git commit -m "test(writing): 对照文模式 E2E——tab 切换/左键换文/映射持久化/toolbar 隔离"
```

---

## Self-Review 记录

- Spec 覆盖：互斥槽位/tab → Task 2b；左键情境化 → Task 3b；映射持久化 + 切主文恢复 → Task 1b；无 toolbar + 隔离 → Task 2a/2c；空态 + 置灰 → Task 2b/2c；双高亮 → Task 3c；删右键菜单 → Task 3d；Ctrl+S 双存 → Task 1 `saveAllDirtyWriting` + Task 2d；autosave → Task 2c；边界（同文拒绝/外部删除/竞态/旧 state 兼容）→ Task 1 测试用例。
- 无新 IPC/preload/主进程改动，符合 Global Constraints 第一条。
- toolbar 隔离采用条件注册 prop，未引入焦点路由（spec 非目标）。
- 规则 12 张力（移出分组仅剩拖拽路径）已在 spec 声明并接受，不在本 plan 补救。
- 已知取舍「重命名主文/对照文后映射失效」已在 spec 边界节声明，v1 不做映射跟随。
- 接口名全计划一致：`writingPanelMode` / `writingCompanionMap` / `companionFile` / `selectCompanionFile` / `saveCompanionFile` / `updateCompanionBody` / `closeCompanion` / `saveAllDirtyWriting` / `registerToolbarAction`。
