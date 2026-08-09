# 写作树 行内新建 + 日记日期默认 + 悬停重命名 / 去 .md 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把写作树的新建/重命名从居中弹窗改为文章列内原地输入，日记分组新建预填当天日期，文章悬停加重命名按钮，所有文章名显示去 `.md`。

**Architecture:** 纯函数（排序槽位/日期预填/去后缀/错误映射）集中在 `src/lib/writing-tree-utils.ts` 并单测；新建 inline 状态提升到 `WritingListColumn`（WritingTree 是其子组件，无需动 store），经 props 下传；重命名 inline 状态是 TreeNode 局部 state。新增 `InlineNameInput` 通用输入行。显示层去 `.md` 不改磁盘文件名，文件重命名自动补 `.md`（修 `renameNode` 丢扩展名 bug）。

**Tech Stack:** Electron 30 + React 18 + TypeScript + Tailwind CSS + Vitest + Playwright(E2E)。

**Spec:** `docs/superpowers/specs/2026-08-09-writing-tree-inline-design.md`

## Global Constraints

- 验证只跑受影响测试：改测试文件跑对应 `npx vitest run tests/<file>.test.ts`；改源码跑对应单测 + `node scripts/e2e-changed.js --run`。**禁止** `npx vitest run` / `npm run test:e2e`（全量）。
- 组件文件只 export 组件；helper/纯函数进 `src/lib/`（ui-styling §10）。
- 新建/重命名输入行行为：Enter 确认（trim 后非空）、Esc 取消、外部点击取消、空值视为取消。
- 新建输入行**实时定位在落盘排序槽位**（用户决策），空值在列表末尾；输入行 `key="__inline_new__"` 固定（移动不 remount、保焦点）。
- 日记预填仅 `root==='writing' && dir==='日记'` 直接子级，格式 M.D 无补零（8 月 9 日 → `8.9`），该分组已有 `8.9.md` 则预填空串。
- 文章悬停 = ✎ 重命名 + 🗑 删除；分组悬停 = ＋ 新建 + 🗑 解散（不变）。分组右键重命名/新建子分组仍用 `PromptDialog`。
- 显示名去 `.md` 只影响显示（树行/折叠列/删除确认/重命名预填），磁盘文件名不变。
- 新 testid：`writing-inline-new`（新建输入行）、`writing-inline-rename`（重命名输入行）、`writing-node-rename`（悬停重命名按钮）。

---

### Task 1: writing-tree-utils 纯函数（TDD）

**Files:**
- Modify: `src/lib/writing-tree-utils.ts`
- Test: `tests/writing-tree-utils.test.ts`

**Interfaces:**
- Produces:
  - `displayWritingName(node: { name: string; kind: 'file' | 'dir' }): string` — 文件去 `.md`，目录原样。
  - `normalizeWritingFileName(name: string, isFile: boolean): string` — 文件补 `.md`（已带则不变），目录原样。
  - `diaryPrefillName(root: WritingRoot, dir: string, children: WritingTreeNode[] | undefined, now?: Date): string` — 仅 `writing`+`日记` 返回 `M.D`；该目录已有同名 `.md` 返回 `''`。
  - `sortedInsertIndexForFile(children: WritingTreeNode[], order: string[] | undefined, value: string): number` — 新文件在显示列表的落盘槽位；空值返回 `children.length`。
  - `writingErrorText(code: WritingErrorCode): string` — 错误码 → 中文文案。

- [ ] **Step 1: 写失败测试**

在 `tests/writing-tree-utils.test.ts` 追加：

```ts
import {
  firstWritingFilePath,
  displayWritingName,
  normalizeWritingFileName,
  diaryPrefillName,
  sortedInsertIndexForFile,
  writingErrorText,
} from '@/lib/writing-tree-utils'
import type { WritingTreeNode, WritingRoot } from '@shared/index'

const f = (name: string, path?: string): WritingTreeNode => ({ name, path: path ?? `writing/${name}`, kind: 'file' })
const d = (name: string, children: WritingTreeNode[] = []): WritingTreeNode => ({ name, path: `writing/${name}`, kind: 'dir', children })
const aug9 = new Date(2026, 7, 9) // 2026-08-09

describe('displayWritingName', () => {
  it('文件去 .md 后缀；目录名原样', () => {
    expect(displayWritingName(f('8.9.md'))).toBe('8.9')
    expect(displayWritingName(f('八月随笔.md'))).toBe('八月随笔')
    expect(displayWritingName(d('随笔'))).toBe('随笔')
  })
})

describe('normalizeWritingFileName', () => {
  it('文件补 .md，已带则不重复；目录原样', () => {
    expect(normalizeWritingFileName('八月夜话', true)).toBe('八月夜话.md')
    expect(normalizeWritingFileName('八月夜话.md', true)).toBe('八月夜话.md')
    expect(normalizeWritingFileName('随笔', false)).toBe('随笔')
  })
})

describe('diaryPrefillName', () => {
  it('writing 根级日记分组返回当天 M.D', () => {
    expect(diaryPrefillName('writing' as WritingRoot, '日记', [], aug9)).toBe('8.9')
  })
  it('该分组已存在当天文件则返回空串', () => {
    expect(diaryPrefillName('writing' as WritingRoot, '日记', [f('8.9.md')], aug9)).toBe('')
  })
  it('repository 根或非日记分组或日记子分组不预填', () => {
    expect(diaryPrefillName('repository' as WritingRoot, '日记', [], aug9)).toBe('')
    expect(diaryPrefillName('writing' as WritingRoot, '随笔', [], aug9)).toBe('')
    expect(diaryPrefillName('writing' as WritingRoot, '日记/2026', [], aug9)).toBe('')
  })
})

describe('sortedInsertIndexForFile', () => {
  it('无 order：目录靠前，文件按 localeCompare zh 插入', () => {
    const children = [f('7.5.md'), f('8.5.md')]
    expect(sortedInsertIndexForFile(children, undefined, '8.9')).toBe(2)
    expect(sortedInsertIndexForFile(children, undefined, '7.1')).toBe(0)
  })
  it('有 order：有序节点在前，新文件落其后无序文件槽位', () => {
    const children = [f('a.md', 'writing/a.md'), f('b.md', 'writing/b.md'), f('c.md', 'writing/c.md')]
    // a、b 有序在前，c 无序：新文件 x 插在无序文件（a,c）按 localeCompare 的 x 位 → 末尾
    expect(sortedInsertIndexForFile(children, ['writing/a.md', 'writing/b.md'], 'x')).toBe(3)
    // 仅 b 有序在前，无序 a、c 保持扫描序：新文件 d 落在 c 后
    expect(sortedInsertIndexForFile(children, ['writing/b.md'], 'd')).toBe(3)
  })
  it('空值返回末尾', () => {
    expect(sortedInsertIndexForFile([f('a.md')], undefined, '')).toBe(1)
    expect(sortedInsertIndexForFile([f('a.md')], undefined, '   ')).toBe(1)
  })
})

describe('writingErrorText', () => {
  it('映射到中文文案', () => {
    expect(writingErrorText('WRITING_NAME_CONFLICT')).toBe('同名文件已存在')
    expect(writingErrorText('WRITING_PATH_FORBIDDEN')).toBe('名称无效')
    expect(writingErrorText('WRITING_NOT_FOUND')).toBe('文件不存在')
    expect(writingErrorText('WRITING_IO_ERROR')).toBe('写入失败，请重试')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/writing-tree-utils.test.ts`
Expected: FAIL —— `displayWritingName is not a function`（函数未导出）。

- [ ] **Step 3: 实现纯函数**

在 `src/lib/writing-tree-utils.ts` 末尾追加：

```ts
import type { WritingErrorCode } from '@shared/index'

/** 文件显示名：去掉 .md 后缀；目录名原样返回。 */
export function displayWritingName(node: { name: string; kind: 'file' | 'dir' }): string {
  return node.kind === 'file' && node.name.endsWith('.md') ? node.name.slice(0, -3) : node.name
}

/** 文件重命名/新建名归一化：文件补 .md（防 renameNode 丢扩展名），目录原样。 */
export function normalizeWritingFileName(name: string, isFile: boolean): string {
  if (!isFile) return name
  return name.endsWith('.md') ? name : `${name}.md`
}

/** 日记分组新建预填：仅 writing 根级「日记」分组直接子级，返回当天 M.D；已存在同名文件返回空串。 */
export function diaryPrefillName(
  root: WritingRoot,
  dir: string,
  children: WritingTreeNode[] | undefined,
  now = new Date(),
): string {
  if (root !== 'writing' || dir !== '日记') return ''
  const candidate = `${now.getMonth() + 1}.${now.getDate()}`
  const exists = children?.some(c => c.kind === 'file' && c.name === `${candidate}.md`)
  return exists ? '' : candidate
}

/**
 * 新文件（无序 file）在显示列表中的落盘槽位：
 * 有序节点在前 → 其后无序目录靠前 → 无序文件按 localeCompare zh 排序。
 * children 传扫描序（root 用 tree?.[root]，分组用 node.children），与 sortNodesByOrder 语义一致。
 * 空值 → 列表末尾。
 */
export function sortedInsertIndexForFile(
  children: WritingTreeNode[],
  order: string[] | undefined,
  value: string,
): number {
  if (!value.trim()) return children.length
  const ordered = new Set(order ?? [])
  const orderedCount = children.filter(c => ordered.has(c.path)).length
  const name = `${value.trim()}.md`
  let dirCount = 0
  for (const c of children) {
    if (ordered.has(c.path)) continue
    if (c.kind === 'dir') dirCount++
    else break
  }
  let filePos = 0
  for (const c of children) {
    if (ordered.has(c.path) || c.kind === 'dir') continue
    if (c.name.localeCompare(name, 'zh') > 0) break
    filePos++
  }
  return orderedCount + dirCount + filePos
}

/** 写作错误码 → 中文文案。 */
export function writingErrorText(code: WritingErrorCode): string {
  switch (code) {
    case 'WRITING_NAME_CONFLICT': return '同名文件已存在'
    case 'WRITING_PATH_FORBIDDEN': return '名称无效'
    case 'WRITING_NOT_FOUND': return '文件不存在'
    case 'WRITING_IO_ERROR': return '写入失败，请重试'
    default: return '操作失败'
  }
}
```

> 注意：`WritingRoot`、`WritingTreeNode` 已在文件顶部 import；需补 `WritingErrorCode`（见 Step 3 首个 import 行）。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/writing-tree-utils.test.ts`
Expected: PASS（全部用例）。

- [ ] **Step 5: 提交**

```bash
git add src/lib/writing-tree-utils.ts tests/writing-tree-utils.test.ts
git commit -m "feat(writing): 写作树 inline 纯函数——去.md/补.md/日记预填/排序槽位/错误映射"
```

---

### Task 2: InlineNameInput 组件（TDD）

**Files:**
- Create: `src/components/writing/InlineNameInput.tsx`
- Test: `tests/writing-inline-input.test.tsx`

**Interfaces:**
- Consumes: 无（独立组件）。
- Produces:
  ```ts
  interface InlineNameInputProps {
    defaultValue?: string
    placeholder?: string
    error?: string
    theme?: 'academic' | 'newspaper'
    dataTestid?: string
    onSubmit: (value: string) => void   // trim 后非空才调用
    onCancel: () => void                // Esc / 外部点击 / 空值 Enter
    onValueChange?: (value: string) => void  // 每次输入变化（供实时定位）
  }
  export function InlineNameInput(props: InlineNameInputProps): JSX.Element
  ```
  行为：挂载 autofocus + 全选；Enter 提交 trim 后值、空值转 cancel；Esc/失焦 cancel；`doneRef` 防重入。

- [ ] **Step 1: 写失败测试**

新建 `tests/writing-inline-input.test.tsx`：

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { InlineNameInput } from '@/components/writing/InlineNameInput'

describe('InlineNameInput', () => {
  const tid = 'writing-inline-new'
  beforeEach(() => cleanup())

  it('Enter 提交已 trim 的值', () => {
    const onSubmit = vi.fn()
    const onCancel = vi.fn()
    render(<InlineNameInput dataTestid={tid} defaultValue="8.9" onSubmit={onSubmit} onCancel={onCancel} />)
    fireEvent.keyDown(screen.getByTestId(tid), { key: 'Enter' })
    expect(onSubmit).toHaveBeenCalledWith('8.9')
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('空值 Enter 视为取消，不提交', () => {
    const onSubmit = vi.fn()
    const onCancel = vi.fn()
    render(<InlineNameInput dataTestid={tid} onSubmit={onSubmit} onCancel={onCancel} />)
    fireEvent.keyDown(screen.getByTestId(tid), { key: 'Enter' })
    expect(onSubmit).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalled()
  })

  it('Esc 取消', () => {
    const onSubmit = vi.fn()
    const onCancel = vi.fn()
    render(<InlineNameInput dataTestid={tid} defaultValue="x" onSubmit={onSubmit} onCancel={onCancel} />)
    fireEvent.keyDown(screen.getByTestId(tid), { key: 'Escape' })
    expect(onSubmit).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalled()
  })

  it('失焦取消', () => {
    const onSubmit = vi.fn()
    const onCancel = vi.fn()
    render(<InlineNameInput dataTestid={tid} defaultValue="x" onSubmit={onSubmit} onCancel={onCancel} />)
    fireEvent.blur(screen.getByTestId(tid))
    expect(onCancel).toHaveBeenCalled()
  })

  it('值变化回调 onValueChange', () => {
    const onValueChange = vi.fn()
    render(<InlineNameInput dataTestid={tid} onSubmit={() => {}} onCancel={() => {}} onValueChange={onValueChange} />)
    fireEvent.change(screen.getByTestId(tid), { target: { value: 'a' } })
    expect(onValueChange).toHaveBeenCalledWith('a')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/writing-inline-input.test.tsx`
Expected: FAIL —— module not found / component missing。

- [ ] **Step 3: 实现组件**

新建 `src/components/writing/InlineNameInput.tsx`：

```tsx
import { useEffect, useRef } from 'react'

interface InlineNameInputProps {
  defaultValue?: string
  placeholder?: string
  error?: string
  theme?: 'academic' | 'newspaper'
  dataTestid?: string
  onSubmit: (value: string) => void
  onCancel: () => void
  onValueChange?: (value: string) => void
}

export function InlineNameInput({
  defaultValue = '',
  placeholder = '',
  error,
  theme = 'academic',
  dataTestid,
  onSubmit,
  onCancel,
  onValueChange,
}: InlineNameInputProps) {
  const isAcademic = theme !== 'newspaper'
  const ref = useRef<HTMLInputElement>(null)
  const doneRef = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (el) { el.focus(); el.select() }
  }, [])

  const commit = () => {
    if (doneRef.current) return
    const value = ref.current?.value.trim() ?? ''
    doneRef.current = true
    if (!value) { onCancel(); return }
    onSubmit(value)
  }

  const cancel = () => {
    if (doneRef.current) return
    doneRef.current = true
    onCancel()
  }

  return (
    <div className="px-2 py-1">
      <input
        ref={ref}
        data-testid={dataTestid}
        className={`w-full px-2 py-0.5 rounded text-xs outline-none border ${
          isAcademic
            ? 'bg-ink border-ember/60 text-parchment placeholder:text-parchment/40'
            : 'bg-white border-[#8a3a3a]/50 text-[#2a1f1a] placeholder:text-[#6b5d52]/50'
        }`}
        defaultValue={defaultValue}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(e) => onValueChange?.(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit() }
          else if (e.key === 'Escape') { e.preventDefault(); cancel() }
        }}
        onBlur={cancel}
      />
      {error && (
        <div className={`text-[10px] mt-0.5 ${isAcademic ? 'text-red-400' : 'text-red-600'}`}>{error}</div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/writing-inline-input.test.tsx`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/components/writing/InlineNameInput.tsx tests/writing-inline-input.test.tsx
git commit -m "feat(writing): 通用行内输入行 InlineNameInput(Enter提交/Esc取消/autofocus全选/错误提示)"
```

---

### Task 3: WritingListColumn —— inline 状态 + 根级入口 + 折叠列去 .md

**Files:**
- Modify: `src/components/writing/WritingListColumn.tsx`
- Modify: `src/components/writing/WritingTree.tsx`（仅签名 + 向下透传，不实现行为）
- Modify: `src/components/writing/WritingTree.tsx` 的 `TreeNode`（仅签名 + 向下透传）
- Test: `tests/writing-list-column.test.tsx`

**Interfaces:**
- Consumes: `displayWritingName`, `writingErrorText`（Task 1）；`WritingRoot`, `WritingTreeNode`。
- Produces:
  - `WritingListColumn` 内部新增 `inlineNew` 状态与 4 个 handler：
    ```ts
    type InlineNewState = { root: WritingRoot; dir: string; value: string; error?: string }
    startInlineNew: (t: { root: WritingRoot; dir: string; value: string }) => void
    changeInlineNew: (value: string) => void
    submitInlineNew: (name: string) => Promise<void>
    cancelInlineNew: () => void
    ```
  - `WritingTree` 新 props：`inlineNew: InlineNewState | null`、`onStartInlineNew`、`onInlineNewChange`、`onInlineNewSubmit`、`onInlineNewCancel`（本任务只接收并透传给 TreeNode，TreeNode 暂不渲染 inline）。

- [ ] **Step 1: 改 WritingListColumn**

`src/components/writing/WritingListColumn.tsx`：

1. import 区（第 4 行）补 `displayWritingName, writingErrorText`；新增 `import type { WritingRoot } from '@shared/index'`。
2. 新增状态与 handler（放在 `prompt` state 下方）：
   ```tsx
   const [inlineNew, setInlineNew] = useState<{ root: WritingRoot; dir: string; value: string; error?: string } | null>(null)

   const startInlineNew = (target: { root: WritingRoot; dir: string; value: string }) => setInlineNew({ ...target })
   const changeInlineNew = (value: string) => setInlineNew(s => (s ? { ...s, value } : s))
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
   const cancelInlineNew = () => setInlineNew(null)
   ```
3. `handleCreateFile`（第 92-103 行）改为：
   ```tsx
   const handleCreateFile = () => {
     startInlineNew({ root: 'writing', dir: '', value: '' })
   }
   ```
4. 折叠列 `recentFiles.push`（第 74/79 行两处）改为 `name: displayWritingName(n)`。
5. 两个 `<WritingTree>`（第 158/166 行）加 5 个 props（root 各自的 inlineNew 过滤由 WritingTree 内部处理，直接传同一对象）：
   ```tsx
   <WritingTree
     root="writing"
     theme={theme}
     inlineNew={inlineNew}
     onStartInlineNew={startInlineNew}
     onInlineNewChange={changeInlineNew}
     onInlineNewSubmit={submitInlineNew}
     onInlineNewCancel={cancelInlineNew}
   />
   ```

- [ ] **Step 2: 改 WritingTree/TreeNode 签名（透传，不实现）**

`src/components/writing/WritingTree.tsx`：

1. `TreeNode` props 增补：
   ```tsx
   function TreeNode({ node, depth, root, parentDir, siblingPaths, theme = 'academic', inlineNew, onStartInlineNew, onInlineNewChange, onInlineNewSubmit, onInlineNewCancel }: {
     node: WritingTreeNode; depth: number; root: WritingRoot; parentDir: string; siblingPaths: string[];
     theme?: 'academic' | 'newspaper'
     inlineNew: { root: WritingRoot; dir: string; value: string; error?: string } | null
     onStartInlineNew: (t: { root: WritingRoot; dir: string; value: string }) => void
     onInlineNewChange: (v: string) => void
     onInlineNewSubmit: (v: string) => void
     onInlineNewCancel: () => void
   })
   ```
2. TreeNode 的 children 递归处（第 183-188 行）把 5 个新 props 透传给子 TreeNode。
3. `WritingTree` 签名增补同样的 5 个 props，并在 `sorted.map(n => <TreeNode .../>)`（第 309-311 行）透传。

> 本任务结束时组件仍不渲染 inline（Task 4 实现），但 TS 通过、现有组件测试通过。

- [ ] **Step 3: 更新 writing-list-column 组件测试**

`tests/writing-list-column.test.tsx`：在 `collapsed shows vertical labels...` 测试末尾追加断言折叠列名字去 `.md`：

```tsx
    expect(screen.getByTestId('writing-collapsed-recent-0')).toHaveTextContent('a')
    expect(screen.getByTestId('writing-collapsed-recent-1')).toHaveTextContent('b')
```

- [ ] **Step 4: 跑组件测试 + 类型检查**

Run: `npx vitest run tests/writing-list-column.test.tsx tests/writing-inline-input.test.tsx`
Expected: PASS。

Run: `npx tsc --noEmit`
Expected: 无类型错误。

- [ ] **Step 5: 提交**

```bash
git add src/components/writing/WritingListColumn.tsx src/components/writing/WritingTree.tsx tests/writing-list-column.test.tsx
git commit -m "feat(writing): 列表列行内新建状态与根级入口 + 折叠列去.md(WritingTree 透传占位)"
```

---

### Task 4: WritingTree/TreeNode —— 行内新建渲染 + 日记预填 + 悬停重命名 + 去 .md

**Files:**
- Modify: `src/components/writing/WritingTree.tsx`

**Interfaces:**
- Consumes: `InlineNameInput`（Task 2）、`displayWritingName`/`normalizeWritingFileName`/`diaryPrefillName`/`sortedInsertIndexForFile`/`writingErrorText`（Task 1）、WritingListColumn 透传的 5 个 props（Task 3）。
- Produces: 完成行为 —— 分组/根级 inline 输入渲染在排序槽位、日记预填、悬停 ✎ 重命名 + 行内改名、树行/删除确认去 `.md`。

- [ ] **Step 1: 加 import 与 TreeNode 局部 state**

`src/components/writing/WritingTree.tsx`：
1. import 行（第 4 行）补 `InlineNameInput`：
   ```tsx
   import { InlineNameInput } from './InlineNameInput'
   ```
2. `src/lib/writing-tree-utils` import（第 4 行）补 `displayWritingName, normalizeWritingFileName, diaryPrefillName, sortedInsertIndexForFile, writingErrorText`。
3. TreeNode 内加局部 state（`confirmingDelete` 附近）：
   ```tsx
   const [editing, setEditing] = useState(false)
   const [renameError, setRenameError] = useState('')
   ```

- [ ] **Step 2: doNewFile 走 inline + 日记预填**

TreeNode 的 `doNewFile`（第 75-89 行）改为：

```tsx
const doNewFile = () => {
  closeMenu()
  const dir = node.path.slice(root.length + 1)
  const prefill = diaryPrefillName(root, dir, node.children)
  onStartInlineNew({ root, dir, value: prefill })
  if (!open) setOpen(true)
}
```

> 悬停「＋」与右键「新建文章」共用此函数，统一走 inline。

- [ ] **Step 3: 重命名走归一化（右键 PromptDialog 路径修 bug）**

TreeNode 的 `doRename`（第 56-67 行）改为（defaultValue 去 `.md`，提交补 `.md`）：

```tsx
const doRename = () => {
  closeMenu()
  setPrompt({
    title: '新名称:',
    defaultValue: displayWritingName(node),
    onSubmit: async (newName) => {
      const normalized = normalizeWritingFileName(newName.trim(), node.kind === 'file')
      if (normalized === node.name) return
      await ipc.writingRename({ path: node.path, newName: normalized })
      await loadWritingTree()
    },
  })
}
```

- [ ] **Step 4: 行内重命名提交**

TreeNode 加 `doRenameSubmit`（`doRename` 之后）：

```tsx
const doRenameSubmit = async (value: string) => {
  const normalized = normalizeWritingFileName(value, node.kind === 'file')
  if (normalized === node.name) { setRenameError(''); setEditing(false); return }
  const r = await ipc.writingRename({ path: node.path, newName: normalized })
  if (r.ok) {
    setRenameError('')
    setEditing(false)
    await loadWritingTree()
  } else {
    setRenameError(writingErrorText(r.code))
  }
}
```

- [ ] **Step 5: 名称区支持行内编辑 + 去 .md**

TreeNode 名称区（第 156-158 行）改为：

```tsx
<div className="min-w-0 flex-1">
  {editing ? (
    <InlineNameInput
      dataTestid="writing-inline-rename"
      defaultValue={displayWritingName(node)}
      theme={theme}
      error={renameError}
      onValueChange={() => setRenameError('')}
      onSubmit={doRenameSubmit}
      onCancel={() => { setRenameError(''); setEditing(false) }}
    />
  ) : (
    <span className="truncate block">{displayWritingName(node)}</span>
  )}
</div>
```

- [ ] **Step 6: 悬停按钮区——文章加 ✎**

TreeNode 悬停按钮区（第 159-180 行）改为：

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
  {!isDir && (
    <button
      data-testid="writing-node-rename"
      data-path={node.path}
      title="重命名"
      className={`px-1 text-xs ${isAcademic ? 'text-parchment/50 hover:text-ember' : 'text-[#6b5d52] hover:text-[#8a3a3a]'}`}
      onClick={(e) => { e.stopPropagation(); setEditing(true) }}
    >
      ✎
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

- [ ] **Step 7: 分组 children 渲染 inline 输入（排序槽位）**

TreeNode children 渲染（第 183-188 行）替换为：

```tsx
{isDir && open && (() => {
  const children = node.children ?? []
  const sorted = sortNodesByOrder(children, writingOrder[node.path])
  const here = inlineNew != null && inlineNew.root === root && inlineNew.dir === node.path.slice(root.length + 1)
  const renderChild = (child: WritingTreeNode) => (
    <TreeNode key={child.path} node={child} depth={depth + 1} root={root} parentDir={node.path} siblingPaths={sorted.map(n => n.path)} theme={theme}
      inlineNew={inlineNew} onStartInlineNew={onStartInlineNew} onInlineNewChange={onInlineNewChange} onInlineNewSubmit={onInlineNewSubmit} onInlineNewCancel={onInlineNewCancel} />
  )
  if (!here) return sorted.map(renderChild)
  const idx = sortedInsertIndexForFile(children, writingOrder[node.path], inlineNew.value)
  return (
    <>
      {sorted.slice(0, idx).map(renderChild)}
      <InlineNameInput
        key="__inline_new__"
        dataTestid="writing-inline-new"
        defaultValue={inlineNew.value}
        theme={theme}
        error={inlineNew.error}
        onValueChange={onInlineNewChange}
        onSubmit={onInlineNewSubmit}
        onCancel={onInlineNewCancel}
      />
      {sorted.slice(idx).map(renderChild)}
    </>
  )
})()}
```

- [ ] **Step 8: WritingTree 根级渲染 inline 输入 + 空态分支**

`WritingTree` 主体（第 272-315 行）替换为：

```tsx
export function WritingTree({ root, theme = 'academic', inlineNew, onStartInlineNew, onInlineNewChange, onInlineNewSubmit, onInlineNewCancel }: {
  root: WritingRoot; theme?: 'academic' | 'newspaper'
  inlineNew: { root: WritingRoot; dir: string; value: string; error?: string } | null
  onStartInlineNew: (t: { root: WritingRoot; dir: string; value: string }) => void
  onInlineNewChange: (v: string) => void
  onInlineNewSubmit: (v: string) => void
  onInlineNewCancel: () => void
}) {
  const isAcademic = theme !== 'newspaper'
  const tree = useStore(s => s.writingTree)
  const writingOrder = useStore(s => s.writingOrder)
  const moveWritingNode = useStore(s => s.moveWritingNode)
  const [endDrop, setEndDrop] = useState(false)
  const nodes = tree?.[root] ?? []
  const sorted = sortNodesByOrder(nodes, writingOrder[root])
  const here = inlineNew != null && inlineNew.root === root && inlineNew.dir === ''

  const renderChild = (n: WritingTreeNode) => (
    <TreeNode key={n.path} node={n} depth={0} root={root} parentDir={root} siblingPaths={sorted.map(x => x.path)} theme={theme}
      inlineNew={inlineNew} onStartInlineNew={onStartInlineNew} onInlineNewChange={onInlineNewChange} onInlineNewSubmit={onInlineNewSubmit} onInlineNewCancel={onInlineNewCancel} />
  )

  if (here) {
    const idx = sortedInsertIndexForFile(nodes, writingOrder[root], inlineNew.value)
    return (
      <div className="py-1 min-h-[120px]">
        {sorted.slice(0, idx).map(renderChild)}
        <InlineNameInput
          key="__inline_new__"
          dataTestid="writing-inline-new"
          defaultValue={inlineNew.value}
          theme={theme}
          error={inlineNew.error}
          onValueChange={onInlineNewChange}
          onSubmit={onInlineNewSubmit}
          onCancel={onInlineNewCancel}
        />
        {sorted.slice(idx).map(renderChild)}
      </div>
    )
  }

  if (sorted.length === 0) {
    return (
      <div className={`px-3 py-4 text-xs text-center ${isAcademic ? 'text-parchment/40' : 'text-[#6b5d52]/60'}`}>
        {root === 'writing' ? '还没有文章，点击上方 ＋ 新建' : '还没有导入文件，点击上方 ⬆ 导入'}
      </div>
    )
  }

  return (
    <div
      className="py-1 min-h-[120px]"
      onDragOver={(e) => { if (e.target !== e.currentTarget) return; e.preventDefault(); setEndDrop(true) }}
      onDragLeave={(e) => { if (e.target === e.currentTarget) setEndDrop(false) }}
      onDrop={async (e) => {
        if (e.target !== e.currentTarget) return
        e.preventDefault()
        setEndDrop(false)
        const src = e.dataTransfer.getData('text/writing-path')
        if (!src) return
        const srcParent = src.includes('/') ? src.slice(0, src.lastIndexOf('/')) : root
        if (srcParent === root) return
        await moveWritingNode({ src, targetDir: root, index: null })
      }}
    >
      {sorted.map(renderChild)}
      {endDrop && <div data-testid="writing-drop-line" className="mx-2 border-t-2 border-ember pointer-events-none" />}
    </div>
  )
}
```

- [ ] **Step 9: 删除确认书名去 .md**

TreeNode 删除确认文案（第 265 行）改为 `确定删除《{displayWritingName(node)}》？文件将被永久删除，无法恢复。`

- [ ] **Step 10: 类型检查 + 组件测试**

Run: `npx tsc --noEmit`
Expected: 无类型错误。

Run: `npx vitest run tests/writing-list-column.test.tsx tests/writing-inline-input.test.tsx tests/writing-tree-utils.test.ts`
Expected: 全部 PASS。

- [ ] **Step 11: 提交**

```bash
git add src/components/writing/WritingTree.tsx
git commit -m "feat(writing): 写作树行内新建(排序槽位定位)+日记日期预填+悬停重命名+文章名去.md"
```

---

### Task 5: E2E 更新与定向跑

**Files:**
- Modify: `e2e/specs/writing-tree.spec.ts`
- Modify: `e2e/specs/writing-edge.spec.ts`
- Verify: `e2e/source-map.json`（本任务不加新 spec 文件，writing-tree/writing-edge 已在 source-map，无需改；若 `e2e-changed.js` 报孤儿 WARNING 再补）

**Interfaces:**
- Consumes: 新 testid `writing-inline-new` / `writing-inline-rename` / `writing-node-rename`；树显示名去 `.md`。

- [ ] **Step 1: 全局替换 `.md` 显示断言**

`e2e/specs/writing-tree.spec.ts`：
- `hasText: /七月夜话\.md/` → `/七月夜话/`（第 68、88、167、185、228、276、331 行）
- `hasText: /八月随笔\.md/` → `/八月随笔/`（第 229 行）
- `hasText: /组内新文\.md/` → `/组内新文/`（第 245 行）
- 第 196 行 `hasText: /七月夜话\.md/` → `/七月夜话/`

`e2e/specs/writing-edge.spec.ts` 第 75 行：`/临时\.md/` → `/临时/`。

> 注意：**磁盘断言不变**（`fs.existsSync(...七月夜话.md)` 等仍用 `.md`）。

- [ ] **Step 2: 新建文章测试改走行内输入**

`writing-tree.spec.ts` 第 34-44 行「新建文章：prompt 输入 → 文件在磁盘」替换为：

```ts
  test('根级新建文章：行内输入 → 文件在磁盘', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    await window.locator(SELECTORS.writing.newFileButton).click()
    const input = window.getByTestId('writing-inline-new')
    await expect(input).toBeVisible({ timeout: 3000 })
    await input.fill('我的新文章')
    await input.press('Enter')
    await window.waitForTimeout(1500)

    expect(fs.existsSync(path.join(testLibraryPath, 'writing', '我的新文章.md'))).toBe(true)
  })
```

- [ ] **Step 3: 右键重命名测试改用无 .md 输入（验证归一化修复）**

`writing-tree.spec.ts` 第 64-82 行，把 `fill('八月夜话.md')` 改为 `fill('八月夜话')`（`PromptDialog` 预填值现在是去后缀名，提交补 `.md`；磁盘断言 `八月夜话.md` 不变）：

```ts
    await window.getByTestId('writing-prompt-input').fill('八月夜话')
    await window.getByTestId('writing-prompt-confirm').click()
```

- [ ] **Step 4: 悬停按钮测试补 rename 断言**

`writing-tree.spec.ts` 第 163-180 行「悬停显示行内按钮」：`fileRow` 断言补 rename 存在、create 不存在：

```ts
    // File row: delete+rename visible on hover, no create button
    await expect(fileRow.getByTestId('writing-node-create')).toHaveCount(0)
    await expect(fileRow.getByTestId('writing-node-rename')).toBeAttached()
```

（原第 167 行 `hasText: /七月夜话\.md/` 已由 Step 1 替换。）

- [ ] **Step 5: 分组内新建测试改走行内输入**

`writing-tree.spec.ts` 第 233-246 行「行内 ＋ 在分组内新建文章」替换为：

```ts
  test('行内 ＋ 在分组内新建文章：inline 输入 → 文件出现在该分组下', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    const dirRow = window.locator('[data-testid="writing-tree-node"]').filter({ hasText: /^[▾▸]随笔/ }).first()
    await dirRow.hover()
    await dirRow.getByTestId('writing-node-create').click()

    const input = window.getByTestId('writing-inline-new')
    await expect(input).toBeVisible({ timeout: 3000 })
    await input.fill('组内新文')
    await input.press('Enter')
    await window.waitForTimeout(1500)

    expect(fs.existsSync(path.join(testLibraryPath, 'writing', '随笔', '组内新文.md'))).toBe(true)
    await expect(window.locator('[data-testid="writing-tree-node"]').filter({ hasText: /组内新文/ })).toHaveCount(1)
  })
```

- [ ] **Step 6: 新增测试——输入行排序槽位、日记预填、悬停重命名、重命名冲突**

在 `writing-tree.spec.ts` 的 `describe` 内追加 5 个测试：

```ts
  test('行内新建输入行定位在排序槽位（非分组末尾）', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    const dirRow = window.locator('[data-testid="writing-tree-node"]').filter({ hasText: /^[▾▸]随笔/ }).first()
    await dirRow.hover()
    await dirRow.getByTestId('writing-node-create').click()
    const input = window.getByTestId('writing-inline-new')
    await expect(input).toBeVisible({ timeout: 3000 })
    await input.fill('组内新文')

    const fileBox = await window.locator('[data-testid="writing-tree-node"]').filter({ hasText: /七月夜话/ }).first().boundingBox()
    const inputBox = await input.boundingBox()
    expect(inputBox!.y).toBeGreaterThan(fileBox!.y) // 组内新文(新)排在七月夜话之后
  })

  test('日记分组新建预填当天日期', async ({ window, testLibraryPath }) => {
    fs.mkdirSync(path.join(testLibraryPath, 'writing', '日记'), { recursive: true })
    fs.writeFileSync(
      path.join(testLibraryPath, 'writing', '日记', '旧日记.md'),
      '---\ntype: writing\ntitle: 旧日记\n---\n\n旧日记。\n',
      'utf8',
    )
    await gotoWriting(window, testLibraryPath)

    const diaryRow = window.locator('[data-testid="writing-tree-node"]').filter({ hasText: /^[▾▸]日记/ }).first()
    await diaryRow.hover()
    await diaryRow.getByTestId('writing-node-create').click()
    const today = `${new Date().getMonth() + 1}.${new Date().getDate()}`
    await expect(window.getByTestId('writing-inline-new')).toHaveValue(today, { timeout: 3000 })
  })

  test('日记分组当天已存在 → 预填空，正常命名', async ({ window, testLibraryPath }) => {
    const today = `${new Date().getMonth() + 1}.${new Date().getDate()}`
    fs.mkdirSync(path.join(testLibraryPath, 'writing', '日记'), { recursive: true })
    fs.writeFileSync(path.join(testLibraryPath, 'writing', '日记', `${today}.md`), '---\ntype: writing\ntitle: 今天\n---\n\n今天的日记。\n', 'utf8')
    await gotoWriting(window, testLibraryPath)

    const diaryRow = window.locator('[data-testid="writing-tree-node"]').filter({ hasText: /^[▾▸]日记/ }).first()
    await diaryRow.hover()
    await diaryRow.getByTestId('writing-node-create').click()
    await expect(window.getByTestId('writing-inline-new')).toHaveValue('', { timeout: 3000 })
  })

  test('文章悬停重命名：✎ → 行内改名 → 无 .md 预填且更新成功', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    const fileRow = window.locator('[data-testid="writing-tree-node"]').filter({ hasText: /七月夜话/ }).first()
    await fileRow.hover()
    await fileRow.getByTestId('writing-node-rename').click()
    const renameInput = window.getByTestId('writing-inline-rename')
    await expect(renameInput).toHaveValue('七月夜话', { timeout: 3000 })
    await renameInput.fill('八月夜话')
    await renameInput.press('Enter')
    await window.waitForTimeout(1000)

    expect(fs.existsSync(path.join(testLibraryPath, 'writing', '随笔', '八月夜话.md'))).toBe(true)
    expect(fs.existsSync(path.join(testLibraryPath, 'writing', '随笔', '七月夜话.md'))).toBe(false)
    await expect(window.locator('[data-testid="writing-tree-node"]').filter({ hasText: /八月夜话/ })).toHaveCount(1)
  })

  test('重命名冲突：行内提示同名已存在', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    const fileRow = window.locator('[data-testid="writing-tree-node"]').filter({ hasText: /七月夜话/ }).first()
    await fileRow.hover()
    await fileRow.getByTestId('writing-node-rename').click()
    const renameInput = window.getByTestId('writing-inline-rename')
    await expect(renameInput).toBeVisible({ timeout: 3000 })
    await renameInput.fill('分布式随笔') // 技术笔记/分布式随笔.md 已存在 → 冲突
    await renameInput.press('Enter')
    await expect(window.getByText('同名文件已存在')).toBeVisible({ timeout: 3000 })
  })
```

> 若 `SELECTORS.writing.newFileButton` 未定义，改用 `[data-testid="writing-new-file"]`。

- [ ] **Step 7: 跑定向 E2E**

Run: `node scripts/e2e-changed.js --run`
Expected: 命中的 spec（`writing-tree.spec.ts`、`writing-edge.spec.ts`）全部通过。若 `e2e-changed.js` 报孤儿 spec WARNING，检查 `e2e/source-map.json` 并补齐登记。

- [ ] **Step 8: 提交**

```bash
git add e2e/specs/writing-tree.spec.ts e2e/specs/writing-edge.spec.ts e2e/source-map.json
git commit -m "test(writing): 行内新建/日记预填/悬停重命名 E2E + 去.md 显示断言更新"
```

---

## 自审记录

- **Spec 覆盖**：F1 行内新建（Task 3 状态/入口 + Task 4 渲染）✓；F2 日记预填（Task 1 `diaryPrefillName` + Task 4 `doNewFile`）✓；F3 悬停重命名 + 去 `.md` + rename 归一化 bug（Task 1/3/4）✓；错误文案（Task 1 `writingErrorText` + Task 4 接入）✓；测试（Task 1/2 单测、Task 3 组件测试、Task 5 E2E）✓。
- **占位符扫描**：无 TBD/TODO；每个代码步骤都含实际代码。
- **类型一致**：`InlineNewState` 形状 `{ root; dir; value; error? }` 在 Task 3/4 中一致；`sortedInsertIndexForFile(children, order, value)`、`diaryPrefillName(root, dir, children, now?)`、`displayWritingName(node)`、`normalizeWritingFileName(name, isFile)`、`writingErrorText(code)` 各任务签名一致。
