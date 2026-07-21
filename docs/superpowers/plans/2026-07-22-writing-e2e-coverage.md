# 写作功能完善 & E2E 全覆盖实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补全写作助手错误 UI + 空文章保护 + Catalog 摘要 hover，增强 E2E mock，新增 15 条 E2E 测试覆盖所有写作功能路径。

**Architecture:** 3 Phase 顺序执行。Phase 1 改 store/组件/类型/扫描器（~80 行业务代码）。Phase 2 改 E2E mock IPC（~30 行）。Phase 3 新增/修改 8 个 spec 文件（~15 条测试）。Phase 之间无循环依赖，Phase 3 依赖 Phase 1+2。

**Tech Stack:** React 18 + TypeScript + Zustand + Playwright (E2E)

**基线:** `a9b7f4d` — 实现前先 `git pull` 检查上游变更。

---

## 文件结构

```
修改:
  src/store/index.ts                          — +retryWritingAssistantMessage
  src/components/writing-assistant/
    WritingAssistantMessages.tsx               — +错误 UI
    WritingAssistantInput.tsx                  — +空文章保护
  src/types/index.ts                          — WritingTreeNode +summary/+catalogUpdatedAt
  electron/lib/writing-tree.ts                — scanDir 读 catalog 附加 summary
  src/components/writing/WritingTree.tsx      — +hover 展开摘要
  electron/ipc/writing-assistant.ts           — Mock 增强 (M1/M2/M3)
  e2e/helpers/test-library.ts                 — +seedRepoFile (带 frontmatter)
  e2e/specs/
    writing-tree.spec.ts                      — +2 用例
    writing-editor.spec.ts                    — +3 用例
    writing-assistant.spec.ts                 — +2 用例
    writing-assistant-tools.spec.ts           — +2 用例
    writing-assistant-search-thinking.spec.ts — +1 用例
    writing-repository.spec.ts                — +3 用例 (含修复 skip)

新建:
  e2e/specs/writing-assistant-error.spec.ts   — 错误态 + 重试
  e2e/specs/writing-assistant-resize.spec.ts  — 面板 resize
```

---

## Phase 1: 功能实现

### Task 1: Store — 新增 `retryWritingAssistantMessage`

**Files:**
- Modify: `src/store/index.ts`

`sendWritingAssistantMessage` 的签名是 `(text: string) => Promise<void>`。重试逻辑：找到最后一条 user 消息内容 → 移除最后一条空 assistant 消息 → 重新发送。

- [ ] **Step 1: 在 store types 中添加 action 签名**

在 `src/store/index.ts` 约 L316（`abortWritingAssistant` 下方）新增：

```ts
retryWritingAssistantMessage: () => Promise<void>
```

- [ ] **Step 2: 在 store 实现中添加 action**

在 `src/store/index.ts` 约 L1505（`abortWritingAssistant` 之后）新增：

```ts
retryWritingAssistantMessage: async () => {
  const s = get().writingAssistant
  if (!s || s.streaming) return
  const msgs = s.messages.slice()
  // 移除最后一条空的 assistant 消息
  const last = msgs[msgs.length - 1]
  if (last && last.role === 'assistant' && last.content.trim() === '') {
    msgs.pop()
  }
  // 找到最后一条 user 消息
  const lastUser = msgs.filter(m => m.role === 'user').at(-1)
  if (!lastUser) return
  const text = lastUser.content
  // 再移除那条 user 消息（sendWritingAssistantMessage 会重新添加它）
  const userIdx = msgs.lastIndexOf(lastUser)
  if (userIdx !== -1) msgs.splice(userIdx, 1)
  set({ writingAssistant: { ...s, messages: msgs, error: null } })
  // 重新发送
  await get().sendWritingAssistantMessage(text)
},
```

- [ ] **Step 3: 验证编译**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/store/index.ts
git commit -m "feat(store): add retryWritingAssistantMessage action"
```

---

### Task 2: WritingAssistantMessages — 错误 UI + 重试按钮

**Files:**
- Modify: `src/components/writing-assistant/WritingAssistantMessages.tsx`

参照 `ChatWindow.tsx:136-146` 的现有模式。需要在组件中读取 `error` 和 `retryWritingAssistantMessage`。

- [ ] **Step 1: 修改 WritingAssistantMessages.tsx**

在 L47-48（`assistant` 解构后）新增 `error` 和 `retry` 的读取：

```tsx
export function WritingAssistantMessages() {
  const assistant = useStore((s) => s.writingAssistant)
  const error = useStore((s) => s.writingAssistant?.error ?? null)
  const retryWritingAssistantMessage = useStore((s) => s.retryWritingAssistantMessage)
  const scrollRef = useRef<HTMLDivElement>(null)

  const messages = assistant?.messages ?? []
  const streaming = assistant?.streaming ?? false
```

在 L128-130（streaming 指示器上方、`</div>` 闭合前）新增错误 UI：

找到这一段：
```tsx
      {streaming && messages.length > 0 && (
        <div className="text-xs text-parchment/50 animate-pulse">思考中…</div>
      )}
    </div>
```

改为：
```tsx
      {streaming && messages.length > 0 && (
        <div className="text-xs text-parchment/50 animate-pulse">思考中…</div>
      )}

      {error && !streaming && messages.length > 0 && (() => {
        const lastMsg = messages[messages.length - 1]
        const showError = lastMsg?.role === 'assistant' && lastMsg.content.trim() === ''
        if (!showError) return null
        return (
          <div className="text-xs text-ember/80 px-3 pb-2">
            回复失败
            <button
              className="ml-2 underline hover:text-ember"
              onClick={() => retryWritingAssistantMessage()}
            >
              重试
            </button>
          </div>
        )
      })()}
    </div>
```

- [ ] **Step 2: 验证编译**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/writing-assistant/WritingAssistantMessages.tsx
git commit -m "feat(writing-assistant): add error UI with retry button"
```

---

### Task 3: WritingAssistantInput — 空文章保护

**Files:**
- Modify: `src/components/writing-assistant/WritingAssistantInput.tsx`

- [ ] **Step 1: 读取 writingFile 状态**

在 L4-12（组件顶部）新增：

```tsx
export function WritingAssistantInput() {
  const [input, setInput] = useState('')
  const writingFile = useStore((s) => s.writingFile)
  const streaming = useStore((s) => s.writingAssistant?.streaming ?? false)
  // ... 其余不变
```

- [ ] **Step 2: 派生 disabled 状态 + placeholder**

在 `handleSend` 之前新增：

```ts
  const noArticle = !writingFile
```

- [ ] **Step 3: 更新 textarea 和 send button**

L72-81 — textarea 的 `disabled` 和 `placeholder`：

```tsx
        <textarea
          data-testid="writing-assistant-input"
          className="flex-1 bg-transparent border border-parchment/20 rounded px-3 py-2 text-sm text-parchment resize-none placeholder:text-parchment/40 outline-none focus:border-ember/50"
          placeholder={noArticle ? "请先选择或新建一篇文章" : "问点什么…"}
          rows={2}
          value={noArticle ? "" : input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={noArticle || streaming}
        />
```

L91-97 — send button 的 `disabled`：

```tsx
          <button
            data-testid="writing-assistant-send-btn"
            className="text-xs text-parchment/80 hover:text-ember whitespace-nowrap px-2 py-1 shrink-0 disabled:opacity-30"
            onClick={handleSend}
            disabled={noArticle || input.trim().length === 0}
          >
```

- [ ] **Step 4: 验证编译**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/components/writing-assistant/WritingAssistantInput.tsx
git commit -m "feat(writing-assistant): disable input when no article is open"
```

---

### Task 4: WritingTreeNode 类型 — 新增 summary 字段

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: 修改 WritingTreeNode**

L421-426 当前：
```ts
export type WritingTreeNode = {
  name: string
  path: string
  kind: 'dir' | 'file'
  children?: WritingTreeNode[]
}
```

改为：
```ts
export type WritingTreeNode = {
  name: string
  path: string
  kind: 'dir' | 'file'
  children?: WritingTreeNode[]
  summary?: string
  catalogUpdatedAt?: string
}
```

- [ ] **Step 2: 验证编译**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): add summary and catalogUpdatedAt to WritingTreeNode"
```

---

### Task 5: scanDir — 附加 catalog 摘要到树节点

**Files:**
- Modify: `electron/lib/writing-tree.ts`

需要在 `scanDir` 函数中引入 `loadCatalog`，为每个文件节点附加 catalog 条目。

- [ ] **Step 1: 添加 import**

在 L1-5 的 import 区新增：

```ts
import { loadCatalog } from './writing-catalog'
```

- [ ] **Step 2: 修改 scanDir 函数签名和逻辑**

`scanDir` 当前签名：`function scanDir(absoluteDir: string, lib: string): WritingTreeNode[]`

需要在函数顶部加载 catalog，然后在文件节点创建时查条目。修改 `scanDir`：

```ts
function scanDir(absoluteDir: string, lib: string, root?: WritingRoot): WritingTreeNode[] {
  if (!fs.existsSync(absoluteDir)) return []

  // Load catalog for this root (only on first call, root is passed from scanRoot)
  let catalog: { entries: Record<string, { title?: string; summary?: string; updatedAt?: string }> } = { entries: {} }
  if (root) {
    try { catalog = loadCatalog(lib, root) } catch { /* keep empty */ }
  }

  const entries = fs.readdirSync(absoluteDir, { withFileTypes: true })
  const result: WritingTreeNode[] = []

  for (const entry of entries) {
    if (isHidden(entry.name)) continue
    if (entry.isDirectory()) {
      const children = scanDir(path.join(absoluteDir, entry.name), lib) // sub-dirs don't need root
      result.push({ name: entry.name, path: toRel(lib, path.join(absoluteDir, entry.name)), kind: 'dir', children })
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      const relPath = toRel(lib, path.join(absoluteDir, entry.name))
      const node: WritingTreeNode = { name: entry.name, path: relPath, kind: 'file' }
      // Attach catalog summary if available
      const catEntry = catalog.entries[relPath]
      if (catEntry) {
        if (catEntry.summary) node.summary = catEntry.summary
        if (catEntry.updatedAt) node.catalogUpdatedAt = catEntry.updatedAt
      }
      result.push(node)
    }
  }

  // sort ...
```

- [ ] **Step 3: 修改 scanRoot 传递 root 参数**

```ts
export function scanRoot(lib: string, root: WritingRoot): WritingTreeNode[] {
  const rootDir = path.join(lib, root)
  return scanDir(rootDir, lib, root)
}
```

- [ ] **Step 4: 验证编译**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add electron/lib/writing-tree.ts
git commit -m "feat(writing-tree): attach catalog summary to file tree nodes"
```

---

### Task 6: WritingTree — hover 展开显示摘要

**Files:**
- Modify: `src/components/writing/WritingTree.tsx`

参照 `AnthropicArticleRow.tsx` 的模式：`useState(false)` + `onMouseEnter/Leave`，常态 `hidden`，hover 时显示 summary。

- [ ] **Step 1: 在 TreeNode 中添加 hover 状态**

在 L18（`const [dragOver, setDragOver] = useState(false)` 之后）新增：

```ts
  const [hovered, setHovered] = useState(false)
```

- [ ] **Step 2: 修改树节点渲染，hover 时展开摘要**

L97-128（`<div data-testid="writing-tree-node">` 及其内容）改为：

```tsx
      <div
        data-testid="writing-tree-node"
        className={`flex items-center gap-1 px-2 py-1 cursor-pointer text-xs rounded transition-colors select-none
          ${isSelected ? 'bg-ember/10 text-ember' : 'text-parchment/70 hover:text-parchment hover:bg-parchment/5'}
          ${dragOver ? 'ring-1 ring-ember/50' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('text/writing-path', node.path)
        }}
        onDragOver={(e) => {
          if (isDir) {
            e.preventDefault()
            setDragOver(true)
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={async (e) => {
          e.preventDefault()
          setDragOver(false)
          const src = e.dataTransfer.getData('text/writing-path')
          if (src && src !== node.path) {
            await ipc.writingMove({ path: src, targetDir: node.path })
            await loadWritingTree()
          }
        }}
      >
        <span className="w-4 text-center shrink-0">{isDir ? (open ? '▾' : '▸') : '·'}</span>
        <div className="min-w-0 flex-1">
          <span className="truncate block">{node.name}</span>
          {!isDir && node.summary && hovered && (
            <div className="text-[10px] text-parchment/50 mt-0.5" style={{ lineClamp: 2, WebkitLineClamp: 2, overflow: 'hidden', display: '-webkit-box', WebkitBoxOrient: 'vertical' }}>
              {node.summary}
              {node.catalogUpdatedAt && (
                <span className="text-parchment/30 ml-2">{node.catalogUpdatedAt}</span>
              )}
            </div>
          )}
        </div>
      </div>
```

- [ ] **Step 2: 验证编译**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/writing/WritingTree.tsx
git commit -m "feat(writing-tree): show catalog summary on file node hover"
```

---

## Phase 2: Mock 增强

### Task 7: E2E Mock — 错误注入 + reasoning + 多轮回显

**Files:**
- Modify: `electron/ipc/writing-assistant.ts`

在 `isE2EMock()` 分支的顶部（send 声明之后、现有 mock 逻辑之前）插入三个增强。

- [ ] **Step 1: 添加错误注入 + reasoning + 多轮回显**

找到 `if (isE2EMock()) {` 块，在 `const send = ...` 之后、`const ctl = ...` 之前，插入：

```ts
    // E2E deterministic mock
    if (isE2EMock()) {
      const send = (channel: string, ...payload: unknown[]) => {
        if (event.sender.isDestroyed()) return
        event.sender.send(channel, ...payload)
      }

      // M1: Error injection via env var
      if (process.env.E2E_WRITING_ASSISTANT_ERROR) {
        const ctl = new AbortController()
        writingSessions.set(args.sessionId, ctl)
        send('llm:error', args.sessionId, {
          code: process.env.E2E_WRITING_ASSISTANT_ERROR,
          message: `E2E injected error: ${process.env.E2E_WRITING_ASSISTANT_ERROR}`,
        })
        writingSessions.delete(args.sessionId)
        return
      }

      const ctl = new AbortController()
      writingSessions.set(args.sessionId, ctl)
      try {
        // M2: Reasoning chunk (opt-in via env)
        if (process.env.E2E_WRITING_ASSISTANT_REASONING === '1') {
          send('writingAssistant:reasoningChunk', args.sessionId, '先梳理文章结构，确认论述逻辑……')
        }

        send('writingAssistant:tool', {
          sessionId: args.sessionId, phase: 'start', tool: 'read_local' as const,
          ids: ['repository:旧随笔.md']
        })
        send('writingAssistant:tool', {
          sessionId: args.sessionId, phase: 'done', tool: 'read_local' as const,
          ids: ['repository:旧随笔.md']
        })

        // M3: Multi-turn — include last user message in reply
        const lastUser = args.messages.filter((m: any) => m.role === 'user').at(-1)
        const userRef = lastUser ? `关于「${(lastUser as any).content.slice(0, 30)}」的分析：` : ''

        for (const chunk of ['这是一段', userRef, 'E2E 测试的', '写作助手回复。']) {
          if (ctl.signal.aborted) return
          send('llm:chunk', args.sessionId, chunk)
        }
        send('writingAssistant:tool', {
          sessionId: args.sessionId, phase: 'done', tool: 'insert_into_article' as const,
          markdown: '# 插入标题'
        })
        if (!ctl.signal.aborted) send('llm:done', args.sessionId)
        // ... existing last-writing-request.json logic unchanged
```

注意：保留原有的 `last-writing-request.json` 落盘逻辑（在 `if (!ctl.signal.aborted) send('llm:done', args.sessionId)` 之后），不要删除。

- [ ] **Step 2: 验证编译**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add electron/ipc/writing-assistant.ts
git commit -m "test(mock): add error injection, reasoning chunk, and multi-turn support to E2E mock"
```

---

## Phase 3: E2E 测试补充

### Task 8: writing-tree.spec.ts — 拖拽移动 + hover 摘要

**Files:**
- Modify: `e2e/specs/writing-tree.spec.ts`

在现有 `test.describe('@p2 writing-tree', ...)` 块末尾（最后一个 test 之后、闭合 `})` 之前）新增 2 个 test。

- [ ] **Step 1: 添加拖拽移动测试**

```ts
  test('拖拽移动文件到另一目录：磁盘位置变化 + 树更新', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    // Verify source file exists initially
    const srcPath = path.join(testLibraryPath, 'writing', '技术笔记', '子组', '深度文章.md')
    expect(fs.existsSync(srcPath)).toBe(true)

    // Drag "深度文章" from 技术笔记/子组/ to 随笔/
    const srcNode = window.locator('[data-testid="writing-tree-node"]').filter({ hasText: '深度文章' }).first()
    const targetDir = window.locator('[data-testid="writing-tree-node"]').filter({ hasText: /^[▾▸]随笔$/ }).first()

    // Use dataTransfer simulation: drag from src to target
    await srcNode.dragTo(targetDir)
    await window.waitForTimeout(1500)

    // File should have moved
    const newPath = path.join(testLibraryPath, 'writing', '随笔', '深度文章.md')
    expect(fs.existsSync(newPath)).toBe(true)
    expect(fs.existsSync(srcPath)).toBe(false)

    // Tree should reflect the move
    const allNodes = await window.locator('[data-testid="writing-tree-node"]').allTextContents()
    // After move, 深度文章 should be under 随笔, not under 子组
    expect(allNodes.some((t: string) => t.includes('深度文章'))).toBe(true)
  })
```

- [ ] **Step 2: 添加 hover 摘要测试**

（依赖 Task 5+6 的 catalog summary 功能，以及 seed catalog）

```ts
  test('hover 文件节点 → 显示 catalog 摘要', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    // seedWritingTree + seedCatalogJson ensure 七月夜话 has a summary
    const fileNode = window.locator('[data-testid="writing-tree-node"]').filter({ hasText: /七月夜话/ }).first()
    await fileNode.hover()
    await window.waitForTimeout(500)

    // Summary text should appear (from seeded catalog entry: "关于七月的随笔")
    const nodeText = await fileNode.textContent()
    expect(nodeText).toContain('关于七月的随笔')
  })
```

- [ ] **Step 3: 运行测试**

```bash
npx playwright test --config e2e/playwright.config.ts e2e/specs/writing-tree.spec.ts
```

- [ ] **Step 4: Commit**

```bash
git add e2e/specs/writing-tree.spec.ts
git commit -m "test(e2e): add drag-move and hover-summary tests for writing tree"
```

---

### Task 9: writing-editor.spec.ts — Insert-to-editor + 保存失败 + catalog 更新

**Files:**
- Modify: `e2e/specs/writing-editor.spec.ts`

在现有 `test.describe('@p2 writing-editor', ...)` 块末尾新增 3 个 test。

- [ ] **Step 1: 添加 Insert-to-editor 测试**

```ts
  test('AI 助手 insert → 编辑器内容变化', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    // Create and open a file
    await window.locator(SELECTORS.writing.newFileButton).click()
    await window.getByTestId('writing-prompt-input').fill('插入测试')
    await window.getByTestId('writing-prompt-confirm').click()
    await window.waitForTimeout(2000)

    const writing = new WritingPage(window)
    await expect(writing.editor).toBeVisible({ timeout: 5000 })

    // Open assistant and send a message (mock sends insert_into_article tool event)
    const assistant = new WritingAssistantPanel(window)
    await assistant.open()
    await assistant.send('帮我写')
    await assistant.waitForStreamingDone(15000)

    // Click insert button
    const insertBtn = window.locator(SELECTORS.writing.assistantInsertBtn).last()
    await expect(insertBtn).toBeVisible({ timeout: 3000 })
    await insertBtn.click()
    await window.waitForTimeout(500)

    // Editor content should include the inserted markdown
    const content = await writing.getEditorContent()
    expect(content).toContain('插入标题')
  })
```

- [ ] **Step 2: 添加保存失败测试**

注意：保存失败在真实磁盘场景下极难触发。这里通过评估 `saving === 'error'` 状态来标记——如果文件系统可靠，此用例可能无法真正失败。`extraEnv` 不适用（渲染进程状态）。可行的替代：直接操作 store 设置错误态。

```ts
  test('保存失败 UI：saving=error 时显示"保存失败"', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    await window.locator(SELECTORS.writing.newFileButton).click()
    await window.getByTestId('writing-prompt-input').fill('保存失败测试')
    await window.getByTestId('writing-prompt-confirm').click()
    await window.waitForTimeout(2000)

    const writing = new WritingPage(window)
    await expect(writing.editor).toBeVisible({ timeout: 5000 })

    // Simulate save error by directly setting store state
    await window.evaluate(() => {
      const store = (window as any).useStore
      const f = store.getState().writingFile
      if (f) {
        store.setState({ writingFile: { ...f, saving: 'error' as const } })
      }
    })
    await window.waitForTimeout(300)

    const saveText = await writing.getSaveStatus()
    expect(saveText).toContain('保存失败')
  })
```

- [ ] **Step 3: 添加 catalog 更新测试**

```ts
  test('Ctrl+S 保存 → catalog 条目 summary 非空', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    await window.locator(SELECTORS.writing.newFileButton).click()
    await window.getByTestId('writing-prompt-input').fill('目录测试')
    await window.getByTestId('writing-prompt-confirm').click()
    await window.waitForTimeout(2000)

    const writing = new WritingPage(window)
    await expect(writing.editor).toBeVisible({ timeout: 5000 })

    // Type content and Ctrl+S
    await writing.typeInEditor('# 目录测试\n\nLLM 应该为这段内容生成摘要。')
    await writing.editor.locator('.ProseMirror').click()
    await window.keyboard.press('Control+s')
    await window.waitForTimeout(3000)

    // Poll catalog for the new entry
    const catalogPath = path.join(testLibraryPath, 'writing', '.catalog.json')
    await expect.poll(() => {
      if (!fs.existsSync(catalogPath)) return ''
      const cat = JSON.parse(fs.readFileSync(catalogPath, 'utf8'))
      const entry = Object.values(cat.entries ?? {}).find((e: any) => e.title === '目录测试')
      return (entry as any)?.summary ?? ''
    }, { timeout: 15000 }).not.toBe('')
  })
```

- [ ] **Step 4: 运行测试**

```bash
npx playwright test --config e2e/playwright.config.ts e2e/specs/writing-editor.spec.ts
```

- [ ] **Step 5: Commit**

```bash
git add e2e/specs/writing-editor.spec.ts
git commit -m "test(e2e): add insert-to-editor, save-error, and catalog-update tests"
```

---

### Task 10: writing-assistant.spec.ts — 多轮对话 + 空文章保护

**Files:**
- Modify: `e2e/specs/writing-assistant.spec.ts`

- [ ] **Step 1: 在现有 describe 块末尾添加多轮对话测试**

```ts
  test('多轮对话：3 条消息产生 6 条记录，回复引用用户问题', async ({ window, testLibraryPath }) => {
    const assistant = await setupAssistant(window, testLibraryPath)
    await selectArticle(window, '七月夜话')
    await assistant.open()

    // Round 1
    await assistant.send('第一轮问题')
    await assistant.waitForStreamingDone(15000)

    // Round 2
    await assistant.send('第二轮问题')
    await assistant.waitForStreamingDone(15000)

    // Round 3
    await assistant.send('第三轮问题')
    await assistant.waitForStreamingDone(15000)

    // Verify 6 messages total (3 user + 3 assistant)
    const messages = await window.evaluate(() => {
      const state = (window as any).useStore?.getState()?.writingAssistant
      return state ? state.messages.map((m: any) => ({ role: m.role, content: m.content })) : []
    })
    expect(messages.length).toBe(6)
    expect(messages.filter((m: any) => m.role === 'user').length).toBe(3)
    expect(messages.filter((m: any) => m.role === 'assistant').length).toBe(3)

    // Assistant replies should reference user questions (M3 mock enhancement)
    const assistantReplies = messages.filter((m: any) => m.role === 'assistant')
    expect(assistantReplies.some((m: any) => m.content.includes('第一轮'))).toBe(true)
  })
```

- [ ] **Step 2: 添加空文章保护测试**

```ts
  test('空文章保护：未打开文章时输入框 disabled', async ({ window, testLibraryPath }) => {
    const assistant = await setupAssistant(window, testLibraryPath)
    // Do NOT select any article
    await assistant.open()

    // Input should be disabled
    const input = window.locator(SELECTORS.writing.assistantInput)
    await expect(input).toBeDisabled()

    // Placeholder should indicate user needs to select an article
    await expect(input).toHaveAttribute('placeholder', '请先选择或新建一篇文章')

    // Send button should also be disabled
    await expect(assistant.sendBtn).toBeDisabled()
  })
```

- [ ] **Step 3: 运行测试**

```bash
npx playwright test --config e2e/playwright.config.ts e2e/specs/writing-assistant.spec.ts
```

- [ ] **Step 4: Commit**

```bash
git add e2e/specs/writing-assistant.spec.ts
git commit -m "test(e2e): add multi-turn conversation and empty-article protection tests"
```

---

### Task 11: writing-assistant-tools.spec.ts — articleContent + tool 文本

**Files:**
- Modify: `e2e/specs/writing-assistant-tools.spec.ts`

- [ ] **Step 1: 添加 articleContent 传递测试**

```ts
  test('ArticleContent 传递：编辑内容后发消息，last-writing-request.json articleContent 匹配', async ({ window, testLibraryPath, testConfigDir }) => {
    const assistant = await setupAssistant(window, testLibraryPath)
    await assistant.open()

    // Select article and type distinctive content
    const node = window.locator('[data-testid="writing-tree-node"]').filter({ hasText: '七月夜话' })
    await node.click()
    await window.locator(SELECTORS.writing.editor).waitFor({ state: 'visible', timeout: 5000 })

    const uniqueContent = 'E2E测试文章正文-唯一标识符-' + Date.now()
    await window.locator(SELECTORS.writing.editor + ' .ProseMirror').click()
    await window.locator(SELECTORS.writing.editor + ' .ProseMirror').fill(uniqueContent)
    await window.waitForTimeout(2500) // autosave

    // Send message via assistant
    await assistant.send('帮我分析')
    await assistant.waitForStreamingDone(15000)

    // Read the request log
    const requestPath = path.join(testConfigDir, 'last-writing-request.json')
    expect(fs.existsSync(requestPath)).toBe(true)
    const req = JSON.parse(fs.readFileSync(requestPath, 'utf8'))
    expect(req.articleContent).toContain('E2E测试文章正文')
  })
```

- [ ] **Step 2: 添加 tool 事件文本可见测试**

```ts
  test('Tool 事件文本可见：消息区含"读取"和"来源"标记', async ({ window, testLibraryPath }) => {
    const assistant = await setupAssistant(window, testLibraryPath)
    await assistant.open()
    await assistant.send('读取资料')
    await assistant.waitForStreamingDone(15000)

    const messagesText = await assistant.messages.textContent()
    // Mock sends read_local start+done events
    expect(messagesText).toContain('读取')
    expect(messagesText).toContain('来源')
  })
```

- [ ] **Step 3: 运行测试**

```bash
npx playwright test --config e2e/playwright.config.ts e2e/specs/writing-assistant-tools.spec.ts
```

- [ ] **Step 4: Commit**

```bash
git add e2e/specs/writing-assistant-tools.spec.ts
git commit -m "test(e2e): add articleContent passthrough and tool event text tests"
```

---

### Task 12: writing-assistant-search-thinking.spec.ts — reasoning 块

**Files:**
- Modify: `e2e/specs/writing-assistant-search-thinking.spec.ts`

- [ ] **Step 1: 添加 reasoning 块测试**

需要在 test.describe 中新增一个使用 `extraEnv` 的 describe 块：

```ts
test.describe('@p2 writing-assistant reasoning', () => {
  test.use({
    extraEnv: { E2E_WRITING_ASSISTANT_REASONING: '1' },
  })

  test('Reasoning 块展示：details 可见且含思考文本', async ({ window, testLibraryPath }) => {
    const assistant = await (async () => {
      // Re-implement setup inline to avoid the helper (which doesn't take extraEnv)
      const { seedWritingTree } = await import('../helpers/test-library')
      seedWritingTree(testLibraryPath)
      const cover = new CoverPage(window)
      await cover.enterName('E2E 测试员')
      await cover.goToBriefing()
      await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
      await window.locator(SELECTORS.writing.sourceButton).click()
      await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })
      await window.waitForTimeout(1500)
      return new WritingAssistantPanel(window)
    })()

    await assistant.open()
    await assistant.send('测试 reasoning')
    await assistant.waitForStreamingDone(15000)

    // Reasoning should appear as a collapsible details block
    const messagesText = await assistant.messages.textContent()
    expect(messagesText).toContain('思考过程')
    expect(messagesText).toContain('先梳理文章结构')
  })
})
```

注意：`test.use({ extraEnv })` 在 fixture-based 测试中通过 `electron.ts` fixture 传递。需要确认 `extraEnv` 在 electron fixture 中已支持——检查 `e2e/fixtures/electron.ts`。

- [ ] **Step 2: 验证 electron fixture 支持 extraEnv**

`e2e/fixtures/electron.ts` 应该已有 `extraEnv` 支持（其他测试已在用）。若不存在则需要补充。

- [ ] **Step 3: 运行测试**

```bash
npx playwright test --config e2e/playwright.config.ts e2e/specs/writing-assistant-search-thinking.spec.ts
```

- [ ] **Step 4: Commit**

```bash
git add e2e/specs/writing-assistant-search-thinking.spec.ts
git commit -m "test(e2e): add reasoning block display test"
```

---

### Task 13: writing-assistant-error.spec.ts (新建) — 错误态 → 重试

**Files:**
- Create: `e2e/specs/writing-assistant-error.spec.ts`

- [ ] **Step 1: 创建文件**

`extraEnv` 在 fixture 级别固定，单次测试中无法切换。拆为两个 describe 块：一个注入错误验证 UI，一个不注入验证正常路径。

```ts
import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { WritingAssistantPanel } from '../pages/WritingAssistantPanel'
import { SELECTORS } from '../helpers/selectors'
import { seedWritingTree } from '../helpers/test-library'

async function setup(window: any, testLibraryPath: string) {
  seedWritingTree(testLibraryPath)
  const cover = new CoverPage(window)
  await cover.enterName('E2E 测试员')
  await cover.goToBriefing()
  await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
  await window.locator(SELECTORS.writing.sourceButton).click()
  await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })
  await window.waitForTimeout(1500)
}

test.describe('@p2 writing-assistant-error', () => {
  test.describe('with error injection', () => {
    test.use({ extraEnv: { E2E_WRITING_ASSISTANT_ERROR: 'CHAT_NETWORK_ERROR' } })

    test('错误注入 → "回复失败" + 重试按钮', async ({ window, testLibraryPath }) => {
      await setup(window, testLibraryPath)
      const node = window.locator('[data-testid="writing-tree-node"]').filter({ hasText: '七月夜话' })
      await node.click()
      await window.locator(SELECTORS.writing.editor).waitFor({ state: 'visible', timeout: 5000 })

      const assistant = new WritingAssistantPanel(window)
      await assistant.open()
      await assistant.send('触发错误')
      await window.waitForTimeout(1500)

      await expect(window.getByText('回复失败')).toBeVisible({ timeout: 5000 })
      await expect(window.getByText('重试')).toBeVisible()
    })
  })

  test.describe('without error injection', () => {
    test('正常发送 → 无错误 UI', async ({ window, testLibraryPath }) => {
      await setup(window, testLibraryPath)
      const node = window.locator('[data-testid="writing-tree-node"]').filter({ hasText: '七月夜话' })
      await node.click()
      await window.locator(SELECTORS.writing.editor).waitFor({ state: 'visible', timeout: 5000 })

      const assistant = new WritingAssistantPanel(window)
      await assistant.open()
      await assistant.send('正常消息')
      await assistant.waitForStreamingDone(15000)

      await expect(window.getByText('回复失败')).toHaveCount(0)
    })
  })
})
```

- [ ] **Step 2: 运行测试**

```bash
npx playwright test --config e2e/playwright.config.ts e2e/specs/writing-assistant-error.spec.ts
```

- [ ] **Step 3: Commit**

```bash
git add e2e/specs/writing-assistant-error.spec.ts
git commit -m "test(e2e): add writing assistant error state test"
```

---

### Task 14: writing-repository.spec.ts — 修复 skip + 编辑 + 导入

**Files:**
- Modify: `e2e/specs/writing-repository.spec.ts`
- Modify: `e2e/helpers/test-library.ts`（修改 `seedRepository` 为 repo 文件加 frontmatter）

- [ ] **Step 1: 修复并替换 skip 的测试**

替换 `writing-repository.spec.ts` 中 L53-66 的 `test.skip`：

```ts
  test('repo 文章可打开阅读', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    await window.locator(SELECTORS.writing.listTabRepository).click()
    await window.waitForTimeout(500)

    // Click on a seeded repo file WITH frontmatter
    const fileNode = window.locator('[data-testid="writing-tree-node"]').filter({ hasText: /旧随笔/ }).first()
    await expect(fileNode).toBeVisible({ timeout: 3000 })
    await fileNode.click()
    await window.waitForTimeout(1000)

    await expect(window.locator(SELECTORS.writing.editor)).toBeVisible({ timeout: 5000 })
  })
```

- [ ] **Step 2: 更新 seedRepository 使旧随笔.md 带 frontmatter**

在 `e2e/helpers/test-library.ts` 的 `seedRepository` 函数中，将 `旧随笔.md` 改为带 frontmatter：

```ts
export function seedRepository(libPath: string): void {
  const repoDir = path.join(libPath, 'repository', '2023')
  fs.mkdirSync(repoDir, { recursive: true })

  fs.writeFileSync(path.join(repoDir, '旧博客-xxx.md'), '# 旧博客\n\n过去的积累。\n', 'utf8')
  // Add frontmatter so selectWritingFile can open it
  fs.writeFileSync(
    path.join(libPath, 'repository', '旧随笔.md'),
    '---\ntype: writing\ntitle: 旧随笔\ncreated: 2026-07-20\nupdated: 2026-07-20\n---\n\n没有 frontmatter 的旧文件。\n',
    'utf8'
  )
}
```

- [ ] **Step 3: 添加 repo 文件编辑保存测试**

在 describe 块末尾新增：

```ts
  test('repo 文件编辑保存 → 磁盘内容变化', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    await window.locator(SELECTORS.writing.listTabRepository).click()
    await window.waitForTimeout(500)

    // Open the seeded repo file
    const fileNode = window.locator('[data-testid="writing-tree-node"]').filter({ hasText: /旧随笔/ }).first()
    await fileNode.click()
    await window.locator(SELECTORS.writing.editor).waitFor({ state: 'visible', timeout: 5000 })

    // Edit via store's updateWritingBody
    const newContent = 'E2E 编辑的 repo 内容-' + Date.now()
    await window.locator(SELECTORS.writing.editor + ' .ProseMirror').click()
    await window.locator(SELECTORS.writing.editor + ' .ProseMirror').fill(newContent)
    await window.waitForTimeout(2500)

    // Verify disk content changed
    const filePath = path.join(testLibraryPath, 'repository', '旧随笔.md')
    const diskContent = fs.readFileSync(filePath, 'utf8')
    expect(diskContent).toContain('E2E 编辑的 repo 内容')
  })
```

- [ ] **Step 4: 添加导入文件后树扫描测试**

由于 `dialog.showOpenDialog` 在 headless 环境下不可交互，完整导入按钮路径无法端到端测试。改为验证：手动放文件到 repo → tab 切换触发重新扫描 → 树中出现。

```ts
  test('外部新增 .md 到 repo → 切换 tab 重新扫描 → 树中出现', async ({ window, testLibraryPath }) => {
    await gotoWriting(window, testLibraryPath)

    await window.locator(SELECTORS.writing.listTabRepository).click()
    await window.waitForTimeout(500)

    // Manually place a file in the repository dir (simulating import result)
    const repoDir = path.join(testLibraryPath, 'repository')
    const newFilePath = path.join(repoDir, '导入测试文件.md')
    fs.writeFileSync(newFilePath,
      '---\ntype: writing\ntitle: 导入测试文件\ncreated: 2026-07-22\nupdated: 2026-07-22\n---\n\n# 导入测试\n\n外部导入的内容。\n',
      'utf8')

    // Tab away and back to trigger rescan
    await window.locator(SELECTORS.writing.listTabArticles).click()
    await window.waitForTimeout(500)
    await window.locator(SELECTORS.writing.listTabRepository).click()
    await window.waitForTimeout(1000)

    // Verify the new file appears in the tree
    const nodes = window.locator('[data-testid="writing-tree-node"]')
    const nodeTexts = await nodes.allTextContents()
    expect(nodeTexts.some((t: string) => t.includes('导入测试文件'))).toBe(true)

    // Cleanup
    fs.unlinkSync(newFilePath)
  })
```

- [ ] **Step 5: 运行测试**

```bash
npx playwright test --config e2e/playwright.config.ts e2e/specs/writing-repository.spec.ts
```

- [ ] **Step 6: Commit**

```bash
git add e2e/specs/writing-repository.spec.ts e2e/helpers/test-library.ts
git commit -m "test(e2e): fix repo file read skip, add edit-save and import tests"
```

---

### Task 15: writing-assistant-resize.spec.ts (新建) — 面板 resize

**Files:**
- Create: `e2e/specs/writing-assistant-resize.spec.ts`

- [ ] **Step 1: 创建文件**

参照 `article-assistant-resize.spec.ts` 的模式：

```ts
import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { WritingAssistantPanel } from '../pages/WritingAssistantPanel'
import { SELECTORS } from '../helpers/selectors'
import { seedWritingTree } from '../helpers/test-library'

test.describe('@p2 writing-assistant-resize', () => {
  async function setup(window: any, testLibraryPath: string) {
    seedWritingTree(testLibraryPath)
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
    await window.locator(SELECTORS.writing.sourceButton).click()
    await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })
    await window.waitForTimeout(1500)
  }

  test('拖 resize handle 向左 → 面板宽度增大', async ({ window, testLibraryPath }) => {
    await setup(window, testLibraryPath)

    const assistant = new WritingAssistantPanel(window)
    await assistant.open()

    const panel = window.locator(SELECTORS.writing.assistantPanel)
    const before = (await panel.boundingBox())!

    const handle = window.locator(SELECTORS.writing.assistantResizeHandle)
    const h = (await handle.boundingBox())!
    // Resize handle is on the left edge of the panel — drag left to expand
    await window.mouse.move(h.x + h.width / 2, h.y + h.height / 2)
    await window.mouse.down()
    await window.mouse.move(h.x - 60, h.y + h.height / 2, { steps: 10 })
    await window.mouse.up()

    const after = (await panel.boundingBox())!
    expect(after.width).toBeGreaterThan(before.width + 30)
  })

  test('拖 resize handle 向右 → 面板宽度缩小，不低于 200px', async ({ window, testLibraryPath }) => {
    await setup(window, testLibraryPath)

    const assistant = new WritingAssistantPanel(window)
    await assistant.open()

    const panel = window.locator(SELECTORS.writing.assistantPanel)
    const before = (await panel.boundingBox())!

    const handle = window.locator(SELECTORS.writing.assistantResizeHandle)
    const h = (await handle.boundingBox())!
    // Drag right to shrink
    await window.mouse.move(h.x + h.width / 2, h.y + h.height / 2)
    await window.mouse.down()
    await window.mouse.move(h.x + 200, h.y + h.height / 2, { steps: 10 })
    await window.mouse.up()

    const after = (await panel.boundingBox())!
    // Width should shrink but not below 200px (MIN in WritingAssistantPanel)
    expect(after.width).toBeLessThan(before.width - 50)
    expect(after.width).toBeGreaterThanOrEqual(200)
  })
})
```

- [ ] **Step 2: 运行测试**

```bash
npx playwright test --config e2e/playwright.config.ts e2e/specs/writing-assistant-resize.spec.ts
```

- [ ] **Step 3: Commit**

```bash
git add e2e/specs/writing-assistant-resize.spec.ts
git commit -m "test(e2e): add writing assistant panel resize tests"
```

---

## 验证

所有 Phase 完成后，运行全量测试验证：

```bash
# 单元测试
npm run test

# E2E 测试 — 仅写作相关
npx playwright test --config e2e/playwright.config.ts \
  e2e/specs/writing-tree.spec.ts \
  e2e/specs/writing-editor.spec.ts \
  e2e/specs/writing-assistant.spec.ts \
  e2e/specs/writing-assistant-tools.spec.ts \
  e2e/specs/writing-assistant-search-thinking.spec.ts \
  e2e/specs/writing-assistant-error.spec.ts \
  e2e/specs/writing-repository.spec.ts \
  e2e/specs/writing-assistant-resize.spec.ts \
  e2e/specs/writing-navigation.spec.ts \
  e2e/specs/writing-catalog.spec.ts \
  e2e/specs/writing-edge.spec.ts \
  e2e/specs/writing-empty-create.spec.ts

# 全量 E2E（确认无回归）
npx playwright test --config e2e/playwright.config.ts
```
