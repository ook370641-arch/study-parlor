# 写作仓库 UX（展开持久化 / 排序规则 / 视觉标识 / 分组摘要）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 仓库分组展开/收起持久化（仓库默认收起）、新内容追加到列表末尾、目录永远在文章前、分组/文章视觉标识区分，以及分组级摘要喂给写作助手。

**Architecture:** 4 个改动都落在写作列表域。(A) 展开状态进 `state.json`（`writingExpandedGroups: Record<path, boolean>`），`TreeNode` 从 store 读、toggle 写；(B) `sortNodesByOrder` 改为按类型分区渲染（目录永远在前），创建时把新路径追加到 `writingOrder[parentDir]` 末尾；(C) 分组行 = 文本三角 ▾/▸ + 内联 SVG 文件夹（开/闭），文章行 = 内联 SVG 文档；(D) `.catalog.json` 升 v2 加 `groups` 字段，`writingRefreshCatalog` 的后台 diff 循环里对签名过期的分组生成摘要，写作助手索引（`prompt.ts`）追加分组条目，`read_local` 支持读取分组 id。

**Tech Stack:** Electron + React + Zustand + Vitest + Playwright（E2E 跑 `out/` 构建产物）。

## Global Constraints

- **只跑受影响测试，禁止全量**：改一个文件只跑对应测试文件（`npx vitest run tests/<file>.test.ts`）；改源码后跑 `node scripts/e2e-changed.js --run --no-retries`。禁止 `npx vitest run` / `npm run test:e2e`。
- **E2E 跑 out/ 产物**：改源码后必须先 `npx electron-vite build`（`e2e-changed.js --run` 会自动构建）。
- **跨层契约同步**：新增持久化字段在 `StateJson` 类型、`electron/ipc/state.ts` 的 `DEFAULT`、store 的 `init` 三处都要有默认值。
- **新持久化字段向后兼容**：旧 `state.json` 无 `writingExpandedGroups` → 默认规则生效；旧 `.catalog.json`（version 1）→ `loadCatalog` 归一化到 v2（`groups: {}`）。
- **琥珀只做点睛**：视觉标识默认米色弱化（`text-parchment/50`），仅选中/激活态琥珀（`text-ember`）。
- **Fast Refresh 约束**（ui-styling §10）：组件文件只导出组件；`FolderIcon`/`DocIcon` 必须是模块私有（不 export）。
- **仓库默认收起、writing 顶层默认展开**：无记录时的默认规则，兼容现有 E2E（`/^[▾▸]随笔/` 选择器依赖 writing 顶层展开 + 三角保持文本字形）。
- **E2E mock 摘要**：`process.env.NODE_ENV === 'test' && !!process.env.E2E_CONFIG_DIR` 时逐篇摘要用 `'E2E 摘要'`、分组摘要用 `'E2E 分组摘要'`。

---

### Task 1: 排序工具 —— 类型分区 + 新内容落末尾

**Files:**
- Modify: `src/lib/writing-tree-utils.ts:11-22`（`sortNodesByOrder`）、`src/lib/writing-tree-utils.ts:100-122`（`sortedInsertIndexForFile`）
- Test: `tests/writing-tree-utils.test.ts:93-110`（`sortedInsertIndexForFile` 断言更新 + 新增 `sortNodesByOrder` 分区测试）

**Interfaces:**
- Produces: `sortNodesByOrder<T extends { path: string; kind?: 'dir' | 'file' }>(nodes, order?)` —— 返回 `[有序目录] → [无序目录] → [有序文件] → [无序文件]`。`sortedInsertIndexForFile(children, _order, _value)` —— 恒返回 `children.length`。两者被 Task 3/4 与现有 `childrenPathsOf` 消费。

- [ ] **Step 1: 更新 `sortedInsertIndexForFile` 的测试为「恒末尾」**

修改 `tests/writing-tree-utils.test.ts:93-110` 的 `sortedInsertIndexForFile` describe，替换为：

```ts
describe('sortedInsertIndexForFile', () => {
  it('新建文章恒落在容器末尾（无序文件也末尾）', () => {
    const children = [f('7.5.md'), f('8.5.md')]
    expect(sortedInsertIndexForFile(children, undefined, '8.9')).toBe(2)
    expect(sortedInsertIndexForFile(children, undefined, '7.1')).toBe(2)
  })
  it('有 order 时同样末尾', () => {
    const children = [f('a.md', 'writing/a.md'), f('b.md', 'writing/b.md'), f('c.md', 'writing/c.md')]
    expect(sortedInsertIndexForFile(children, ['writing/a.md', 'writing/b.md'], 'x')).toBe(3)
  })
  it('空值返回末尾', () => {
    expect(sortedInsertIndexForFile([f('a.md')], undefined, '')).toBe(1)
    expect(sortedInsertIndexForFile([f('a.md')], undefined, '   ')).toBe(1)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/writing-tree-utils.test.ts`
Expected: `sortedInsertIndexForFile` 的 `7.1 → 0` 断言 FAIL（当前仍按名插入）。

- [ ] **Step 3: 新增 `sortNodesByOrder` 分区测试**

在 `tests/writing-tree-utils.test.ts` 末尾（`writingErrorText` describe 后）追加：

```ts
describe('sortNodesByOrder', () => {
  const dirNode = (name: string, path: string): WritingTreeNode => ({ name, path, kind: 'dir', children: [] })
  it('目录永远在文章前：有序目录在前、无序目录次之、有序文件、无序文件', () => {
    const nodes = [
      file({ name: 'b.md', path: 'writing/b.md' }),  // 无序文件
      dirNode('随笔', 'writing/随笔'),                 // 无序目录
      file({ name: 'a.md', path: 'writing/a.md' }),  // 有序文件
      dirNode('日记', 'writing/日记'),                 // 有序目录
    ]
    const sorted = sortNodesByOrder(nodes, ['writing/日记', 'writing/a.md'])
    expect(sorted.map(n => n.path)).toEqual(['writing/日记', 'writing/随笔', 'writing/a.md', 'writing/b.md'])
  })
  it('无 order 时保持扫描序（目录在前、文件按序）', () => {
    const nodes = [
      file({ name: 'b.md', path: 'writing/b.md' }),
      dirNode('随笔', 'writing/随笔'),
      file({ name: 'a.md', path: 'writing/a.md' }),
    ]
    expect(sortNodesByOrder(nodes, undefined).map(n => n.path)).toEqual(['writing/随笔', 'writing/b.md', 'writing/a.md'])
  })
})
```

> `file` helper 已存在于该文件（`const f = (name, path?) => ...`），用 `f` 即可；上面写成 `file(...)` 示意，实际用 `f('b.md', 'writing/b.md')`。

- [ ] **Step 4: 实现 `sortNodesByOrder` 类型分区 + `sortedInsertIndexForFile` 恒末尾**

修改 `src/lib/writing-tree-utils.ts`：

```ts
/** Sort nodes by a recorded order array, but always render directories before
 *  files (invariant): [ordered dirs] → [unordered dirs] → [ordered files] →
 *  [unordered files]. Nodes in the order list appear first in recorded sequence;
 *  nodes not in the list keep their original scan order within each kind. */
export function sortNodesByOrder<T extends { path: string; kind?: 'dir' | 'file' }>(nodes: T[], order: string[] | undefined): T[] {
  const rank = new Map((order ?? []).map((p, i) => [p, i]))
  const byRank = (a: T, b: T) => {
    const ra = rank.get(a.path)
    const rb = rank.get(b.path)
    if (ra === undefined && rb === undefined) return 0
    if (ra === undefined) return 1
    if (rb === undefined) return -1
    return ra - rb
  }
  const dirs = nodes.filter(n => n.kind === 'dir').sort(byRank)
  const files = nodes.filter(n => n.kind !== 'dir').sort(byRank)
  return [...dirs, ...files]
}
```

替换 `sortedInsertIndexForFile` 函数体：

```ts
/**
 * 新建文件（无序 file）在显示列表中的落盘槽位：始终为容器末尾。
 * 与 sortNodesByOrder 的「目录在前」不变量配合，新建文章落在列表最后。
 */
export function sortedInsertIndexForFile(children: WritingTreeNode[], _order: string[] | undefined, _value: string): number {
  return children.length
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run tests/writing-tree-utils.test.ts tests/writing-reorder.test.ts`
Expected: 全部 PASS（`writing-reorder.test.ts` 的 `sortNodesByOrder` 现有断言全为文件节点，分区不改变其相对顺序）。

- [ ] **Step 6: Commit**

```bash
git add src/lib/writing-tree-utils.ts tests/writing-tree-utils.test.ts
git commit -m "feat(writing): 排序工具——目录永远在文章前，新内容恒落容器末尾"
```

---

### Task 2: 展开持久化 —— 类型 + 默认值 + store 层

**Files:**
- Modify: `src/types/index.ts:525+`（`StateJson` 加 `writingExpandedGroups`）、`src/types/index.ts:399` 附近（`AppStore` 相关字段在 store 文件，不在 types —— 见下）
- Modify: `electron/ipc/state.ts:13`（`DEFAULT` 加 `writingExpandedGroups: {}`）
- Modify: `src/store/index.ts`（类型 `AppStore`、初始 state、`init`、`setWritingGroupExpanded`、`appendWritingOrder`、`writingRenamed` 扩展、debounce helper）
- Test: `tests/writing-store.test.ts`（beforeEach 重置 + 3 个新测试）

**Interfaces:**
- Consumes: 无（纯新增状态）。
- Produces:
  - `StateJson.writingExpandedGroups?: Record<string, boolean>`
  - `AppStore.writingExpandedGroups: Record<string, boolean>`
  - `AppStore.setWritingGroupExpanded(path: string, open: boolean): void`
  - `AppStore.appendWritingOrder(dir: string, newPath: string): void`
  - `writingRenamed` 同时改写 `writingOrder` 与 `writingExpandedGroups` 的 key。Task 3/4 消费这些。

- [ ] **Step 1: 加类型字段**

`src/types/index.ts` 的 `StateJson`（约 line 538 `writingOrder?:` 附近，先确认存在，在其后加一行）：

```ts
  writingOrder?: Record<string, string[]>
  writingExpandedGroups?: Record<string, boolean>
```

`electron/ipc/state.ts` 的 `DEFAULT`（`writingOrder: {},` 行后）：

```ts
  writingOrder: {},
  writingExpandedGroups: {},
```

- [ ] **Step 2: 先写 store 层失败测试**

在 `tests/writing-store.test.ts` 的 `beforeEach` 加重置（避免跨用例污染）：

```ts
    useStore.setState({ writingTree: null, writingFile: null, writingError: null, writingOrder: {}, writingExpandedGroups: {} })
```

在 `setWritingListTab` describe 后追加：

```ts
  describe('setWritingGroupExpanded', () => {
    it('写入 store 并 debounce 持久化', () => {
      vi.useFakeTimers()
      useStore.getState().setWritingGroupExpanded('repository/2023', true)
      expect(useStore.getState().writingExpandedGroups['repository/2023']).toBe(true)
      vi.advanceTimersByTime(300)
      expect(ipc.patchState).toHaveBeenCalledWith({ writingExpandedGroups: { 'repository/2023': true } })
      vi.useRealTimers()
    })
  })

  describe('appendWritingOrder', () => {
    it('新路径追加到容器末尾（当前全部子节点写回 + 新路径）', () => {
      useStore.setState({
        writingTree: {
          writing: [{ name: '随笔', path: 'writing/随笔', kind: 'dir' as const, children: [
            { name: 'a.md', path: 'writing/随笔/a.md', kind: 'file' as const },
          ] }],
          repository: [],
        },
        writingOrder: { 'writing/随笔': ['writing/随笔/a.md'] },
      })
      useStore.getState().appendWritingOrder('writing/随笔', 'writing/随笔/new.md')
      expect(useStore.getState().writingOrder['writing/随笔']).toEqual(['writing/随笔/a.md', 'writing/随笔/new.md'])
      expect(ipc.patchState).toHaveBeenCalledWith({ writingOrder: { 'writing/随笔': ['writing/随笔/a.md', 'writing/随笔/new.md'] } })
    })
  })

  describe('writingRenamed', () => {
    it('同步改写 writingExpandedGroups 的前缀', () => {
      useStore.setState({
        writingOrder: { 'writing/随笔': ['writing/随笔/a.md'] },
        writingExpandedGroups: { 'writing/随笔': true, 'writing/随笔/子': false },
      })
      useStore.getState().writingRenamed('writing/随笔', 'writing/散文')
      expect(useStore.getState().writingExpandedGroups).toEqual({ 'writing/散文': true, 'writing/散文/子': false })
    })
  })
```

- [ ] **Step 3: 运行确认失败**

Run: `npx vitest run tests/writing-store.test.ts`
Expected: FAIL（`writingExpandedGroups` 在 store 上不存在 → TS/运行时错误）。

- [ ] **Step 4: 实现 store 层**

在 `src/store/index.ts`：

(a) 模块级加 debounce helper（放 `debounceSaveAssistantWidth` 附近）：

```ts
let expandedSaveTimer: ReturnType<typeof setTimeout> | null = null
function debounceSaveExpanded(patch: Partial<StateJson>) {
  if (expandedSaveTimer) clearTimeout(expandedSaveTimer)
  expandedSaveTimer = setTimeout(() => {
    ipc.patchState(patch)
  }, 300)
}
```

(b) `AppStore` 类型（`writingOrder: Record<string, string[]>` 行后）：

```ts
  writingOrder: Record<string, string[]>
  writingExpandedGroups: Record<string, boolean>
```

（`setWritingGroupExpanded` / `appendWritingOrder` 签名加到 `reorderWritingSibling` 附近的方法声明区：）

```ts
  setWritingGroupExpanded: (path: string, open: boolean) => void
  appendWritingOrder: (dir: string, newPath: string) => void
```

(c) 初始 state（`writingOrder: {},` 行后）：

```ts
  writingOrder: {},
  writingExpandedGroups: {},
```

(d) `init` 里（`writingOrder: state.writingOrder ?? {},` 行后）：

```ts
      writingExpandedGroups: state.writingExpandedGroups ?? {},
```

(e) 替换 `writingRenamed`（line 2430-2439）为同时改写两组 key：

```ts
  // 目录/文件改名后,writingOrder 与 writingExpandedGroups 中该节点及其子级路径全部做前缀改写。
  writingRenamed: (oldPath, newPath) => {
    if (oldPath === newPath) return
    const next: Record<string, string[]> = {}
    for (const [k, paths] of Object.entries(get().writingOrder)) {
      const nk = k === oldPath ? newPath : k.startsWith(oldPath + '/') ? newPath + k.slice(oldPath.length) : k
      next[nk] = paths.map(p => p === oldPath ? newPath : p.startsWith(oldPath + '/') ? newPath + p.slice(oldPath.length) : p)
    }
    const nextExp: Record<string, boolean> = {}
    for (const [k, v] of Object.entries(get().writingExpandedGroups)) {
      const nk = k === oldPath ? newPath : k.startsWith(oldPath + '/') ? newPath + k.slice(oldPath.length) : k
      nextExp[nk] = v
    }
    set({ writingOrder: next, writingExpandedGroups: nextExp })
    ipc.patchState({ writingOrder: next, writingExpandedGroups: nextExp } as Partial<StateJson>)
  },
```

(f) 在 `reorderWritingSibling` 之后新增两个 action：

```ts
  // 展开/收起持久化：写显式状态（无记录时由组件按根/深度走默认规则）
  setWritingGroupExpanded: (path, open) => {
    const next = { ...get().writingExpandedGroups, [path]: open }
    set({ writingExpandedGroups: next })
    debounceSaveExpanded({ writingExpandedGroups: next } as Partial<StateJson>)
  },

  // 新建节点落末尾：把该容器当前全部子节点（排序后）写回 order，新路径在数组末尾。
  appendWritingOrder: (dir, newPath) => {
    const tree = get().writingTree
    const cur = get().writingOrder
    const siblings = tree ? (childrenPathsOf(tree, dir, cur[dir]) ?? []) : []
    const rest = siblings.filter(p => p !== newPath)
    const next = { ...cur, [dir]: [...rest, newPath] }
    set({ writingOrder: next })
    ipc.patchState({ writingOrder: next } as Partial<StateJson>)
  },
```

> `childrenPathsOf` 已在 store 顶部 import（line 9）。

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run tests/writing-store.test.ts`
Expected: 全部 PASS。

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts electron/ipc/state.ts src/store/index.ts tests/writing-store.test.ts
git commit -m "feat(writing): 展开/收起持久化 store 层 + 新建落末尾 order 辅助"
```

---

### Task 3: WritingTree —— 展开读 store + toggle 持久化 + 视觉标识 + 分组新建落 order

**Files:**
- Modify: `src/components/writing/WritingTree.tsx`（`TreeNode` 组件 + 文件底部加模块私有 SVG 组件）

**Interfaces:**
- Consumes: Task 1 的 `sortNodesByOrder`/`sortedInsertIndexForFile`（渲染已分区）；Task 2 的 `writingExpandedGroups`/`setWritingGroupExpanded`/`appendWritingOrder`。
- Produces: 树行前缀 = `▾`/`▸` 文本 + `writing-tree-folder-icon` SVG（展开/收起态）+ 文章行 `writing-tree-doc-icon` SVG。**文本三角保留 → 现有 `hasText: /^[▾▸]随笔/` E2E 选择器不破**。

- [ ] **Step 1: 替换 `TreeNode` 的展开状态为 store 驱动**

`WritingTree.tsx` line 34 附近（`TreeNode` 顶部）：

```ts
  const [open, setOpen] = useState(depth === 0)
```
删除这一行。在 `const isDir = node.kind === 'dir'` 之后插入：

```ts
  // 展开/收起持久化：显式记录优先；无记录时默认——writing 顶层展开、其余收起（仓库默认全收起）
  const expanded = useStore(s => s.writingExpandedGroups)
  const setWritingGroupExpanded = useStore(s => s.setWritingGroupExpanded)
  const appendWritingOrder = useStore(s => s.appendWritingOrder)
  const open = isDir ? (expanded[node.path] ?? (root === 'writing' && depth === 0)) : false
```

`handleClick` 中目录分支（line 45）：

```ts
    if (isDir) { setOpen(!open); return }
```
改为：

```ts
    if (isDir) { setWritingGroupExpanded(node.path, !open); return }
```

- [ ] **Step 2: 替换 `doNewFile` / `doNewFolder` 的 `setOpen(true)` 并让建组落 order**

`doNewFile`（line 106-107）：

```ts
    if (!open) setOpen(true)
```
改为：

```ts
    if (!open) setWritingGroupExpanded(node.path, true)
```

`doNewFolder` 的 onSubmit（line 115-118）：

```ts
      onSubmit: async (name) => {
        const dir = node.path.slice(root.length + 1)
        await ipc.writingCreateFolder({ root, dir, name })
        await loadWritingTree()
        if (!open) setOpen(true)
      },
```
改为：

```ts
      onSubmit: async (name) => {
        const dir = node.path.slice(root.length + 1)
        await ipc.writingCreateFolder({ root, dir, name })
        await loadWritingTree()
        if (!open) setWritingGroupExpanded(node.path, true)
        appendWritingOrder(node.path, `${node.path}/${name}`)
      },
```

- [ ] **Step 3: 替换行前缀标识为 三角+文件夹 / 文档 SVG**

`WritingTree.tsx` line 173：

```tsx
        <span className="w-4 text-center shrink-0">{isDir ? (open ? '▾' : '▸') : '·'}</span>
```
替换为：

```tsx
        <span className={`w-6 shrink-0 inline-flex items-center justify-center ${isSelected ? 'text-ember' : 'text-parchment/50'}`}>
          {isDir ? (
            <>
              <span className="inline-flex items-center justify-center w-3.5 shrink-0 text-[0.62em] leading-none">{open ? '▾' : '▸'}</span>
              <FolderIcon open={open} />
            </>
          ) : (
            <DocIcon />
          )}
        </span>
```

- [ ] **Step 4: 文件底部加模块私有 SVG 组件**

在 `WritingTree.tsx` 文件末尾（`WritingTree` 函数后）追加（**不 export**，遵守 Fast Refresh 约束）：

```tsx
// 分组/文章前缀标识（模块私有：不 export，避免破坏 Fast Refresh）
function FolderIcon({ open }: { open: boolean }) {
  return (
    <svg data-testid="writing-tree-folder-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
      {open ? (
        <path d="M6 14l1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />
      ) : (
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      )}
    </svg>
  )
}

function DocIcon() {
  return (
    <svg data-testid="writing-tree-doc-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
}
```

- [ ] **Step 5: 构建 + 确认现有 writing E2E 不破（重点：`/^[▾▸]` 选择器）**

Run: `node scripts/e2e-changed.js --run --no-retries`（自动构建；此时 Task 4/5/6 未完成，只确认本任务引入的渲染变化不破坏现有 writing-tree 断言）

Expected: 若失败且报错指向「找不到 ▾/▸ 前缀」，说明三角文本未保留——检查 Step 3 的 chevron 仍是文本 `▾`/`▸`（SVG 无文本内容，`allTextContents` 拼接为 `▾随笔`，匹配 `/^[▾▸]随笔/`）。

- [ ] **Step 6: Commit**

```bash
git add src/components/writing/WritingTree.tsx
git commit -m "feat(writing): 树行展开状态接 store + 分组/文章 SVG 标识 + 分组新建落 order"
```

---

### Task 4: WritingListColumn —— 新建文件/根级分组落末尾

**Files:**
- Modify: `src/components/writing/WritingListColumn.tsx`（`submitInlineNew`、`handleCreateFolder`、`handleCreateRepoFolder`）

**Interfaces:**
- Consumes: Task 2 的 `appendWritingOrder`。
- Produces: 根级与分组内新建文章、根级新建分组都写入 `writingOrder` 末尾。

- [ ] **Step 1: 加 store 引用**

`WritingListColumn.tsx` 顶部 store 读取区（`showToast` 附近）加：

```ts
  const appendWritingOrder = useStore(s => s.appendWritingOrder)
```

- [ ] **Step 2: `submitInlineNew` 创建成功后写 order**

`WritingListColumn.tsx` 的 `submitInlineNew`（line 53-63）：

```ts
  const submitInlineNew = async (name: string) => {
    if (!inlineNew) return
    const r = await ipc.writingCreateFile({ root: inlineNew.root, dir: inlineNew.dir, name })
    if (r.ok) {
      setInlineNew(null)
      await loadWritingTree()
      void selectWritingFile(r.value.path)
    } else {
      setInlineNew({ ...inlineNew, value: name, error: writingErrorText(r.code) })
    }
  }
```
替换为：

```ts
  const submitInlineNew = async (name: string) => {
    if (!inlineNew) return
    const r = await ipc.writingCreateFile({ root: inlineNew.root, dir: inlineNew.dir, name })
    if (r.ok) {
      setInlineNew(null)
      await loadWritingTree()
      void selectWritingFile(r.value.path)
      const dirKey = inlineNew.dir ? `${inlineNew.root}/${inlineNew.dir}` : inlineNew.root
      appendWritingOrder(dirKey, r.value.path)
    } else {
      setInlineNew({ ...inlineNew, value: name, error: writingErrorText(r.code) })
    }
  }
```

- [ ] **Step 3: 根级新建分组写 order**

`handleCreateFolder`（line 132-140）：

```ts
  const handleCreateFolder = () => {
    setPrompt({
      title: '分组名称:',
      onSubmit: async (name) => {
        const r = await ipc.writingCreateFolder({ root: 'writing', dir: '', name })
        if (r.ok) await loadWritingTree()
      },
    })
  }
```
替换为：

```ts
  const handleCreateFolder = () => {
    setPrompt({
      title: '分组名称:',
      onSubmit: async (name) => {
        const r = await ipc.writingCreateFolder({ root: 'writing', dir: '', name })
        if (r.ok) {
          await loadWritingTree()
          appendWritingOrder('writing', `writing/${name}`)
        }
      },
    })
  }
```

`handleCreateRepoFolder`（line 142-150）同样改为 `appendWritingOrder('repository', \`repository/${name}\`)`（`if (r.ok)` 后）。

- [ ] **Step 4: 构建 + 定向验证**

Run: `node scripts/e2e-changed.js --run --no-retries`
Expected: 现有 `writing-list-column.spec.ts` / `writing-tree.spec.ts` / `writing-repository.spec.ts` 通过；新建文章/分组的行为改动由 Task 6 的 E2E 固化。

- [ ] **Step 5: Commit**

```bash
git add src/components/writing/WritingListColumn.tsx
git commit -m "feat(writing): 新建文章/根级分组写入 order 末尾（落列表末尾）"
```

---

### Task 5: 分组级摘要 —— catalog v2 + 生成 + 助手索引

**Files:**
- Modify: `src/types/index.ts`（`WritingCatalog` v2、`WritingGroupSummaryEntry`、`WritingSourceType` 加 `'group'`）
- Modify: `electron/lib/writing-catalog.ts`（EMPTY/loadCatalog v2、`updateGroupSummary`、`removeGroupSummary`、`migratePrefix` 迁移 groups、`collectGroupDirs`、`groupSignature`）
- Modify: `electron/lib/llm-tasks.ts`（`generateGroupSummary`）
- Modify: `electron/ipc/writing.ts`（`writing:refreshCatalog` 追加分组摘要生成；`writing:delete` 清分组摘要）
- Modify: `electron/lib/writing-assistant/prompt.ts`（索引追加分组条目）
- Modify: `electron/lib/writing-assistant/tools.ts`（`read_local` 支持 `group:` id）
- Test: `tests/writing-catalog.test.ts`（version 断言更新 + 新增）、`tests/writing-assistant-tools.test.ts`（`read_local` group）

**Interfaces:**
- Produces:
  - `WritingCatalog = { version: 2; entries: Record<string, WritingCatalogEntry>; groups: Record<string, WritingGroupSummaryEntry> }`
  - `WritingGroupSummaryEntry = { summary: string; signature: string }`
  - `loadCatalog` 将 v1 归一化为 v2（`groups: {}`）。
  - `collectGroupDirs(nodes): { rel: string; memberPaths: string[] }[]`、`groupSignature(catalog, memberPaths): string`
  - `updateGroupSummary(lib, root, dir, entry)`、`removeGroupSummary(lib, root, dir)`
  - `generateGroupSummary(cfg, dirName, memberSummaries): Promise<string>`
  - 助手索引条目 `{ id: 'group:' + dirPath, type: 'group', title: basename(dirPath), summary }`；`read_local('group:...')` 从 index 返回该分组摘要。

- [ ] **Step 1: 类型**

`src/types/index.ts` line 503：

```ts
export type WritingSourceType = 'study' | 'blog' | 'digest' | 'job' | 'repository' | 'writing' | 'web'
```
改为：

```ts
export type WritingSourceType = 'study' | 'blog' | 'digest' | 'job' | 'repository' | 'writing' | 'web' | 'group'
```

`src/types/index.ts` line 520-521：

```ts
export type WritingCatalogEntry = { title: string; summary: string; updatedAt?: string; mtimeMs?: number }
export type WritingCatalog = { version: 1; entries: Record<string, WritingCatalogEntry> }
```
改为：

```ts
export type WritingCatalogEntry = { title: string; summary: string; updatedAt?: string; mtimeMs?: number }
export type WritingGroupSummaryEntry = { summary: string; signature: string }
export type WritingCatalog = { version: 2; entries: Record<string, WritingCatalogEntry>; groups: Record<string, WritingGroupSummaryEntry> }
```

- [ ] **Step 2: 更新 `tests/writing-catalog.test.ts` 的 version 断言（先改测试）**

`tests/writing-catalog.test.ts` line 19 `expect(c.version).toBe(1)` → `toBe(2)`；line 49 `expect(c.version).toBe(1)` → `toBe(2)`。

import 行（line 5）追加新导出：

```ts
import { loadCatalog, updateEntry, removeEntry, migratePrefix, diffStale, catalogPath, updateGroupSummary, removeGroupSummary, collectGroupDirs, groupSignature } from '../electron/lib/writing-catalog'
```

文件末尾追加（`scanRoot` 需从 `../electron/lib/writing-tree` import）：

```ts
it('v1 catalog 归一化为 v2（groups 缺省空）', () => {
  fs.writeFileSync(catalogPath(lib, 'writing'), JSON.stringify({ version: 1, entries: { 'a.md': { title: 'A', summary: 'A' } } }))
  const c = loadCatalog(lib, 'writing')
  expect(c.version).toBe(2)
  expect(c.entries['a.md'].summary).toBe('A')
  expect(c.groups).toEqual({})
})

it('collectGroupDirs 收集含文件的分组与全后代文件', () => {
  fs.mkdirSync(path.join(lib, 'writing/随笔'), { recursive: true })
  fs.writeFileSync(path.join(lib, 'writing/随笔/a.md'), '# a')
  fs.mkdirSync(path.join(lib, 'writing/随笔/子'), { recursive: true })
  fs.writeFileSync(path.join(lib, 'writing/随笔/子/b.md'), '# b')
  fs.writeFileSync(path.join(lib, 'writing/根.md'), '# root')
  const dirs = collectGroupDirs(scanRoot(lib, 'writing'))
  expect(dirs).toHaveLength(2)
  const sui = dirs.find(d => d.rel === 'writing/随笔')!
  expect(sui.memberPaths).toEqual(['writing/随笔/a.md', 'writing/随笔/子/b.md'])
  const zi = dirs.find(d => d.rel === 'writing/随笔/子')!
  expect(zi.memberPaths).toEqual(['writing/随笔/子/b.md'])
})

it('groupSignature 基于 catalog 条目 mtime，未生成条目为 ?', () => {
  const catalog = { version: 2 as const, entries: { 'writing/a.md': { title: 'A', summary: 'A', mtimeMs: 5 } }, groups: {} }
  expect(groupSignature(catalog, ['writing/a.md'])).toBe('writing/a.md:5')
  expect(groupSignature(catalog, ['writing/b.md'])).toBe('writing/b.md:?')
})

it('updateGroupSummary / removeGroupSummary', () => {
  updateGroupSummary(lib, 'writing', 'writing/随笔', { summary: '随笔内容', signature: 'x' })
  expect(loadCatalog(lib, 'writing').groups['writing/随笔']).toEqual({ summary: '随笔内容', signature: 'x' })
  removeGroupSummary(lib, 'writing', 'writing/随笔')
  expect(loadCatalog(lib, 'writing').groups['writing/随笔']).toBeUndefined()
})

it('migratePrefix 同时迁移 groups 前缀', () => {
  updateEntry(lib, 'writing', 'writing/随笔/a.md', { title: 'A', summary: 'A', mtimeMs: 1 })
  updateGroupSummary(lib, 'writing', 'writing/随笔', { summary: 'S', signature: 's1' })
  updateGroupSummary(lib, 'writing', 'writing/随笔/子', { summary: 'Z', signature: 's2' })
  migratePrefix(lib, 'writing', 'writing/随笔', 'writing/散文')
  const c = loadCatalog(lib, 'writing')
  expect(c.entries['writing/散文/a.md']).toBeDefined()
  expect(c.groups['writing/散文']).toEqual({ summary: 'S', signature: 's1' })
  expect(c.groups['writing/散文/子']).toEqual({ summary: 'Z', signature: 's2' })
  expect(c.groups['writing/随笔']).toBeUndefined()
})
```

在文件顶部 import `scanRoot`（现有 import 已含 `createFile`，加到同一行）：`import { createFile, scanRoot } from '../electron/lib/writing-tree'`。

- [ ] **Step 3: 运行确认失败**

Run: `npx vitest run tests/writing-catalog.test.ts`
Expected: FAIL（`collectGroupDirs`/`groupSignature` 未定义 + version 2 尚未实现）。

- [ ] **Step 4: 实现 `writing-catalog.ts`**

`EMPTY` 与 `loadCatalog`：

```ts
const EMPTY: WritingCatalog = { version: 2, entries: {}, groups: {} }

export function loadCatalog(lib: string, root: WritingRoot): WritingCatalog {
  const p = catalogPath(lib, root)
  if (!fs.existsSync(p)) return { ...EMPTY, entries: {}, groups: {} }
  try {
    const raw = fs.readFileSync(p, 'utf8')
    const parsed = JSON.parse(raw) as { version?: number; entries?: Record<string, WritingCatalogEntry>; groups?: Record<string, WritingGroupSummaryEntry> }
    if (parsed && parsed.version === 2 && typeof parsed.entries === 'object' && typeof parsed.groups === 'object') {
      return parsed as WritingCatalog
    }
    if (parsed && parsed.version === 1 && typeof parsed.entries === 'object') {
      return { version: 2, entries: parsed.entries, groups: parsed.groups ?? {} }
    }
  } catch { /* damaged — rebuild */ }
  return { ...EMPTY, entries: {}, groups: {} }
}
```

`WritingGroupSummaryEntry` import（line 3 `import type` 行加）：

```ts
import type { WritingCatalog, WritingCatalogEntry, WritingGroupSummaryEntry, WritingRoot, WritingTreeNode } from '@shared/index'
```

在 `removeEntry` 后加：

```ts
export function updateGroupSummary(lib: string, root: WritingRoot, dir: string, entry: WritingGroupSummaryEntry): void {
  const c = loadCatalog(lib, root)
  c.groups[dir] = entry
  saveCatalog(lib, root, c)
}

export function removeGroupSummary(lib: string, root: WritingRoot, dir: string): void {
  const c = loadCatalog(lib, root)
  if (c.groups[dir]) {
    delete c.groups[dir]
    saveCatalog(lib, root, c)
  }
}
```

`migratePrefix` 内、entries 迁移循环之后追加 groups 迁移：

```ts
  for (const k of Object.keys(c.groups)) {
    if (k === oldRel || k.startsWith(oldRel + '/')) {
      const g = c.groups[k]
      delete c.groups[k]
      c.groups[newRel + k.slice(oldRel.length)] = g
      changed = true
    }
  }
```

文件末尾（`diffStale` 后）加：

```ts
function collectDescendantFiles(node: WritingTreeNode): string[] {
  const out: string[] = []
  const walk = (n: WritingTreeNode) => {
    if (n.kind === 'file') { out.push(n.path); return }
    for (const c of n.children ?? []) walk(c)
  }
  walk(node)
  return out
}

/** 目录中所有含 md 文件的分组（含递归子分组）；memberPaths 为全后代文件路径（排序后）。 */
export function collectGroupDirs(nodes: WritingTreeNode[]): { rel: string; memberPaths: string[] }[] {
  const out: { rel: string; memberPaths: string[] }[] = []
  const walk = (ns: WritingTreeNode[]) => {
    for (const n of ns) {
      if (n.kind !== 'dir') continue
      const memberPaths = collectDescendantFiles(n).sort()
      if (memberPaths.length > 0) out.push({ rel: n.path, memberPaths })
      walk(n.children ?? [])
    }
  }
  walk(nodes)
  return out
}

/** 分组摘要签名：基于 catalog 条目 mtime（成员摘要变了才重算），未生成条目为 '?'。 */
export function groupSignature(catalog: WritingCatalog, memberPaths: string[]): string {
  return memberPaths.map(p => `${p}:${catalog.entries[p]?.mtimeMs ?? '?'}`).join('|')
}
```

- [ ] **Step 5: `llm-tasks.ts` 加 `generateGroupSummary`**

`electron/lib/llm-tasks.ts`（`generateWritingSummary` 后）：

```ts
export async function generateGroupSummary(cfg: AppConfig, dirName: string, memberSummaries: string): Promise<string> {
  try {
    const content = await chatNonStream(cfg, {
      messages: [
        { role: 'system', content: '你是整理学习资料库的助手。请用一句话（≤50字）概括下面这个分组里文章的主题内容。只输出摘要本身：禁止引号、禁止markdown、禁止"本组"开头、禁止换行。' },
        { role: 'user', content: `分组名：${dirName}\n\n组内文章摘要：\n${memberSummaries}` },
      ],
      temperature: 0.3,
      thinking: { type: 'enabled' },
    })
    return content.trim().replace(/\n[\s\S]*$/, '').slice(0, 80)
  } catch {
    return '' // silent fail — caller skips empty
  }
}
```

- [ ] **Step 6: `electron/ipc/writing.ts` 接生成**

import（line 8-9）加：

```ts
import { updateEntry, removeEntry, migrateEntry, migratePrefix, diffStale, loadCatalog, collectGroupDirs, groupSignature, updateGroupSummary, removeGroupSummary } from '../lib/writing-catalog'
import { generateWritingSummary, generateGroupSummary } from '../lib/llm-tasks'
```

`writing:refreshCatalog` handler（line 118-137）在 `setTimeout(async () => { ... })` 的逐篇循环**之后**追加：

```ts
      // 分组摘要：逐篇补齐后，对签名过期的分组生成（基于 catalog 条目 mtime 的签名）
      for (const root of roots) {
        const catalog = loadCatalog(lib, root)
        const dirs = collectGroupDirs(tree.scanRoot(lib, root))
        for (const { rel, memberPaths } of dirs) {
          const sig = groupSignature(catalog, memberPaths)
          if (catalog.groups[rel]?.signature === sig) continue
          const texts = memberPaths.map(p => catalog.entries[p]?.summary).filter((s): s is string => !!s)
          if (texts.length === 0) continue
          const summary = process.env.NODE_ENV === 'test' && !!process.env.E2E_CONFIG_DIR
            ? 'E2E 分组摘要'
            : await generateGroupSummary(cfg, path.basename(rel), texts.slice(0, 30).join('；'))
          if (summary) updateGroupSummary(lib, root, rel, { summary, signature: sig })
        }
      }
```

`writing:delete` 的迁移块（line 78-85）在 `removeEntry(lib, root, a.path)` 后加：

```ts
        removeGroupSummary(lib, root, a.path)
```

- [ ] **Step 7: `prompt.ts` 索引加分组条目**

`electron/lib/writing-assistant/prompt.ts`，在 repository 文件循环（section 2）之后、study section 之前插入：

```ts
  // ── 2b. 分组总览（writing/repository 目录级摘要）──────────────────
  for (const root of ['writing', 'repository'] as const) {
    try {
      const cat = loadCatalog(lib, root)
      for (const [dirPath, g] of Object.entries(cat.groups ?? {})) {
        entries.push({
          id: `group:${dirPath}`,
          type: 'group',
          title: path.basename(dirPath),
          summary: g.summary || '',
        })
      }
    } catch { /* catalog missing or unreadable — skip */ }
  }
```

- [ ] **Step 8: `tools.ts` `read_local` 支持 `group:` id**

`electron/lib/writing-assistant/tools.ts` `executeTool` 的 read_local 分支内、解析 `type` 之后（line 78-80 之间）插入：

```ts
        if (type === 'group') {
          const entry = (opts.index || []).find(e => e.id === id)
          results.push(entry
            ? `### [组] ${entry.title}\n\n${entry.summary}`
            : `⚠️ 分组不存在: ${id}（未读到内容，请勿引用）`)
          continue
        }
```

`tests/writing-assistant-tools.test.ts` 追加测试：

```ts
describe('executeTool read_local group id', () => {
  it('group id 从 index 返回分组摘要', async () => {
    const { cfg } = tmpLib()
    const result = await executeTool(cfg, { id: 'c1', name: 'read_local', args: { ids: ['group:repository/2023'] } }, {
      send: () => {}, sessionId: 's1', useSearch: false,
      index: [{ id: 'group:repository/2023', type: 'group' as const, title: '2023', summary: '2023年的旧博客' }],
    })
    expect(result).toContain('2023年的旧博客')
    expect(result).not.toContain('请勿引用')
  })
})
```

- [ ] **Step 9: 运行单元测试**

Run: `npx vitest run tests/writing-catalog.test.ts tests/writing-assistant-tools.test.ts tests/writing-assistant-prompt.test.ts`
Expected: 全部 PASS（`writing-assistant-prompt.test.ts` 的 `toContain('writing:日记/8.9.md')` 等断言不受分组条目影响）。

- [ ] **Step 10: Commit**

```bash
git add src/types/index.ts electron/lib/writing-catalog.ts electron/lib/llm-tasks.ts electron/ipc/writing.ts electron/lib/writing-assistant/prompt.ts electron/lib/writing-assistant/tools.ts tests/writing-catalog.test.ts tests/writing-assistant-tools.test.ts
git commit -m "feat(writing): 分组级摘要——catalog v2 groups + 后台生成 + 助手索引/read_local"
```

---

### Task 6: E2E 固化

**Files:**
- Create: `e2e/specs/writing-expand-persist.spec.ts`
- Modify: `e2e/specs/writing-catalog.spec.ts`（追加分组摘要断言）
- Modify: `e2e/specs/writing-tree.spec.ts`（改名过时测试 + 视觉标识断言）
- Modify: `e2e/helpers/selectors.ts`（无新 testid 需要；tree node testid 复用）

> `e2e/source-map.json` 的 writing group 用 glob `"writing-*.spec.ts"`，`writing-expand-persist.spec.ts` 自动被覆盖，无需改 source-map。

- [ ] **Step 1: 新建 `writing-expand-persist.spec.ts`**

```ts
import { test, expect } from '../fixtures/electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import { seedWritingTree, seedRepository, seedCatalogJson } from '../helpers/test-library'

test.describe('@p2 writing-expand-persist', () => {
  async function gotoWriting(window: any, testLibraryPath: string) {
    seedWritingTree(testLibraryPath)
    seedRepository(testLibraryPath)
    seedCatalogJson(testLibraryPath)
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })
    await window.waitForTimeout(1200)
  }

  test('仓库分组默认收起：组行可见、组内文章不可见', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)
    await window.locator(SELECTORS.writing.listTabRepository).click()
    await window.waitForTimeout(500)
    await expect(window.locator('[data-testid="writing-tree-node"]').filter({ hasText: /^[▾▸]2023/ })).toBeVisible({ timeout: 3000 })
    await expect(window.locator('[data-testid="writing-tree-node"]').filter({ hasText: /旧博客/ })).toHaveCount(0)
  })

  test('展开 → 切 tab → 切回仍展开', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)
    await window.locator(SELECTORS.writing.listTabRepository).click()
    await window.waitForTimeout(500)
    const dirRow = window.locator('[data-testid="writing-tree-node"]').filter({ hasText: /^[▾▸]2023/ }).first()
    await dirRow.click()
    await expect(window.locator('[data-testid="writing-tree-node"]').filter({ hasText: /旧博客/ })).toBeVisible({ timeout: 3000 })
    await window.locator(SELECTORS.writing.listTabArticles).click()
    await window.waitForTimeout(400)
    await window.locator(SELECTORS.writing.listTabRepository).click()
    await window.waitForTimeout(500)
    await expect(window.locator('[data-testid="writing-tree-node"]').filter({ hasText: /旧博客/ })).toBeVisible({ timeout: 3000 })
  })

  test('展开 → reload → 仍展开（state.json 持久化）', async ({ window, testLibraryPath, testConfigDir }) => {
    await gotoWriting(window, testLibraryPath)
    await window.locator(SELECTORS.writing.listTabRepository).click()
    await window.waitForTimeout(500)
    const dirRow = window.locator('[data-testid="writing-tree-node"]').filter({ hasText: /^[▾▸]2023/ }).first()
    await dirRow.click()
    await expect(window.locator('[data-testid="writing-tree-node"]').filter({ hasText: /旧博客/ })).toBeVisible({ timeout: 3000 })
    await window.waitForTimeout(800) // 等 debounce patchState 落盘

    const state = JSON.parse(fs.readFileSync(path.join(testConfigDir, 'state.json'), 'utf8'))
    expect(state.writingExpandedGroups?.['repository/2023']).toBe(true)

    await window.reload()
    // 重新走封面 → 简报 → 写作来源（reload 后 currentPage 回到 cover）
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SELECTORS.writing.listTabRepository)).toBeVisible({ timeout: 15000 })
    await window.locator(SELECTORS.writing.listTabRepository).click() // 幂等；writingListTab 已持久化为 repository
    await window.waitForTimeout(500)
    await expect(window.locator('[data-testid="writing-tree-node"]').filter({ hasText: /旧博客/ })).toBeVisible({ timeout: 3000 })
  })

  test('分组/文章前缀标识渲染：文件夹图标与文档图标存在', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)
    await window.locator(SELECTORS.writing.listTabRepository).click()
    await window.waitForTimeout(500)
    await expect(window.locator('[data-testid="writing-tree-folder-icon"]').first()).toBeVisible({ timeout: 3000 })
    await expect(window.locator('[data-testid="writing-tree-doc-icon"]').first()).toBeVisible({ timeout: 3000 })
  })
})
```

> `CoverPage.enterName` 在 reload 后再次调用：profile 已持久化，但封面仍是入口页；若 `enterName` 对已存在 name 有副作用，以现有 reload 模式（`article-assistant-controls.spec.ts`）为准——它在 reload 后重新走完整导航 helper。

- [ ] **Step 2: `writing-catalog.spec.ts` 追加分组摘要断言**

在文件末尾（`test.describe` 内）追加：

```ts
  test('进入写作来源后 repository catalog 出现分组摘要（E2E mock）', async ({ window, testLibraryPath }) => {
    seedWritingTree(testLibraryPath)
    seedRepository(testLibraryPath)

    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })

    await expect.poll(() => {
      const p = path.join(testLibraryPath, 'repository', '.catalog.json')
      if (!fs.existsSync(p)) return null
      const c = JSON.parse(fs.readFileSync(p, 'utf8'))
      return c.groups?.['repository/2023']?.summary ?? null
    }, { timeout: 15000 }).toBe('E2E 分组摘要')
  })
```

> 该测试**不** `seedCatalogJson`：让 refresh 从零生成（repository/2023 的成员 旧博客-xxx.md 逐篇先得 `'E2E 摘要'`，分组再得 `'E2E 分组摘要'`）。

- [ ] **Step 3: `writing-tree.spec.ts` 微调**

(a) 改名过时测试（line 376）：`'行内新建输入行定位在排序槽位（非分组末尾）'` → `'行内新建输入行定位在分组末尾'`，并把注释改为：新建输入恒显示在分组子列表末尾。

(b) 追加一个断言：分组内新建文章落**末尾**——复用现有 seed（随笔 只有 七月夜话.md），新建 组内新文.md 后，该文件节点 y 坐标 > 七月夜话 节点 y 坐标（沿用 line 386-388 的 boundingBox 比较法），并断言其是 随笔 子列表的最后一行。为简化，直接保留原断言（`inputBox.y > fileBox.y`）并追加「新建落盘后节点在末尾」：

```ts
  test('分组内新建文章落分组末尾', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    const dirRow = window.locator('[data-testid="writing-tree-node"]').filter({ hasText: /^[▾▸]随笔/ }).first()
    await dirRow.hover()
    await dirRow.getByTestId('writing-node-create').click()
    const input = window.getByTestId('writing-inline-new')
    await expect(input).toBeVisible({ timeout: 3000 })
    await input.fill('组内新文')
    await input.press('Enter')
    await window.waitForTimeout(1500)

    const fileBox = await window.locator('[data-testid="writing-tree-node"]').filter({ hasText: /七月夜话/ }).first().boundingBox()
    const newBox = await window.locator('[data-testid="writing-tree-node"]').filter({ hasText: /组内新文/ }).first().boundingBox()
    expect(newBox!.y).toBeGreaterThan(fileBox!.y)
    // 且新文件是列表最后一个写作树节点
    const nodes = window.locator('[data-testid="writing-tree-node"]')
    const lastText = (await nodes.allTextContents()).pop()!
    expect(lastText).toContain('组内新文')
  })
```

- [ ] **Step 4: 构建 + 跑定向 E2E**

Run: `node scripts/e2e-changed.js --run --no-retries`
Expected: 新增 spec 与改动的 writing 域 spec 全部通过。若 `writing-tree.spec.ts` 的「行内新建输入行定位」旧断言（`inputBox.y > fileBox.y`）通过但语义过时——已改名；若失败，检查 `sortedInsertIndexForFile` 是否已生效。

- [ ] **Step 5: Commit**

```bash
git add e2e/specs/writing-expand-persist.spec.ts e2e/specs/writing-catalog.spec.ts e2e/specs/writing-tree.spec.ts
git commit -m "test(e2e): 仓库展开持久化/前缀标识/分组新建末尾/分组摘要 E2E"
```

---

## Self-Review

**Spec coverage（对照 `docs/superpowers/specs/2026-08-12-writing-repository-ux-design.md`）：**
- 展开/收起持久化 + 仓库默认收起 → Task 2（store/默认）+ Task 3（组件接线）+ Task 6（E2E reload）。✓
- 排序规则（目录永远在前、新内容末尾、新分组最后）→ Task 1（工具）+ Task 3/4（创建写 order）。✓
- 视觉标识（A 结构 + B 文件夹、文档图标、米色/琥珀）→ Task 3（SVG）+ Task 6（testid 断言）。✓
- 分组级摘要（catalog v2、signature、喂助手、read_local 支持）→ Task 5。✓

**Placeholder scan：** 无 TBD/TODO；每步含真实代码。✓

**Type consistency：** `writingExpandedGroups`（Task 2 定义）在 Task 3/6 中一致使用；`appendWritingOrder(dir, newPath)`（Task 2）在 Task 3/4 调用签名一致；`WritingCatalog` v2 + `groups`（Task 5）与 `loadCatalog` 归一化一致；助手分组条目 id 前缀 `group:` 在 prompt.ts 生成、tools.ts 消费一致。✓
