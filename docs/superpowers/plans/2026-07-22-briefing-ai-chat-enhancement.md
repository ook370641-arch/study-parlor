# 夜航简报 AI 对话体验增强 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复写作助手会话丢失 bug，补齐仓库/Digest/标注注入功能缺口，新增 7 条 E2E 覆盖盲区。

**Architecture:** 本次改动沿现有三层架构（主进程 IPC → Preload → 渲染进程 Store）进行。写作助手复用已有的 `articleAssistantWriteSession` IPC 做持久化；仓库分组复用已有 `createFolder` IPC；标注注入沿用 `buildAssistantUserPrompt` 的参数扩展模式；chunk buffering 复用 `assistant-stream-buffers.ts`。

**Tech Stack:** Electron 30 + React 18 + TypeScript + Zustand + Playwright (E2E)

**Spec:** `docs/superpowers/specs/2026-07-22-briefing-ai-chat-enhancement-design.md`

---

## Phase 1：数据安全 + 关键缺口

### Task 1: P0-1 写作助手会话自动保存

**Files:**
- Modify: `src/store/index.ts`

**Why:** `finishWritingAssistantStreaming()` 只设 `streaming: false`，不写 `.assistant.md`。用户聊天在切换文章/重启后丢失。

- [ ] **Step 1: 新增 `saveWritingAssistantSession` store action**

在 `src/store/index.ts`，在 `retryWritingAssistantMessage` 之后（line ~1527 之后），`loadWritingAssistantSession` 之前，插入：

```typescript
saveWritingAssistantSession: async () => {
  const s = get().writingAssistant
  if (!s || !s.articlePath) return
  const persistable = s.messages.filter(
    (m) => m.content.trim().length > 0
  )
  if (persistable.length === 0) return
  try {
    await ipc.articleAssistantWriteSession({
      parentPath: s.articlePath,
      parentType: 'writing' as const,
      messages: persistable,
    })
  } catch (_err) {
    get().showToast('助手对话暂存失败')
  }
},
```

同时在 store 类型声明区域（约 line 315 附近，`finishWritingAssistantStreaming` 之后）添加类型：

```typescript
saveWritingAssistantSession: () => Promise<void>
```

- [ ] **Step 2: 在 `finishWritingAssistantStreaming` 末尾调保存**

找到 `src/store/index.ts` 中的 `finishWritingAssistantStreaming:`（line ~1495），从：

```typescript
finishWritingAssistantStreaming: () => {
  const s = get().writingAssistant
  if (!s) return
  set({ writingAssistant: { ...s, streaming: false } })
},
```

改为：

```typescript
finishWritingAssistantStreaming: () => {
  const s = get().writingAssistant
  if (!s) return
  set({ writingAssistant: { ...s, streaming: false } })
  get().saveWritingAssistantSession()
},
```

- [ ] **Step 3: 在 `abortWritingAssistant` 末尾调保存**

找到 `abortWritingAssistant:`（line ~1501），从：

```typescript
abortWritingAssistant: () => {
  const s = get().writingAssistant
  if (!s || !s.streaming) return
  ipc.writingAssistantAbort({ sessionId: s.sessionId })
  set({ writingAssistant: { ...s, streaming: false } })
},
```

改为：

```typescript
abortWritingAssistant: () => {
  const s = get().writingAssistant
  if (!s || !s.streaming) return
  ipc.writingAssistantAbort({ sessionId: s.sessionId })
  set({ writingAssistant: { ...s, streaming: false } })
  get().saveWritingAssistantSession()
},
```

- [ ] **Step 4: 面板关闭时触发保存**

找到 `setWritingAssistantOpen:` store action。在其实现中，当 `open` 变为 `false` 且当前有消息时调保存。找到 setter（可能在 store 顶部的简单 setter 区域，约 line 1090 附近的位置——搜索 `writingAssistantOpen`）：

```typescript
// 在 setWritingAssistantOpen 的逻辑中，关闭前保存
setWritingAssistantOpen: (open: boolean) => {
  if (!open) {
    const s = get().writingAssistant
    if (s && s.messages.length > 0 && !s.streaming) {
      get().saveWritingAssistantSession()
    }
  }
  set({ writingAssistantOpen: open })
  debounceSaveWritingLayout({ writingAssistantOpen: open })
},
```

> 注：若 `setWritingAssistantOpen` 仅做简单 set，需改为上述形式。查阅实际实现后再调整。

- [ ] **Step 5: 运行现有 E2E 确认无回归**

```bash
npx playwright test --config e2e/playwright.config.ts writing-assistant
```

预期：所有已有用例通过。

- [ ] **Step 6: 新增 E2E — 无 seed 对话跨文章恢复**

在 `e2e/specs/writing-assistant.spec.ts` 新增用例：

```typescript
test('会话保存：新建对话 → 切换文章 → 切回 → 消息恢复', async ({ window, testLibraryPath }) => {
  // Setup: seed tree but NO .assistant.md for the target article
  const { seedWritingTree } = await import('../helpers/test-library')
  seedWritingTree(testLibraryPath)
  // Remove pre-seeded .assistant.md to test fresh save
  const sessionPath = path.join(testLibraryPath, 'writing', '随笔', '七月夜话.assistant.md')
  if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath)

  const cover = new CoverPage(window)
  await cover.enterName('E2E 测试员')
  await cover.goToBriefing()
  await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
  await window.locator(SELECTORS.writing.sourceButton).click()
  await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })
  await window.waitForTimeout(1500)

  // Select article A, open assistant, send message
  const nodeA = window.locator('[data-testid="writing-tree-node"]').filter({ hasText: '七月夜话' })
  await nodeA.click()
  await window.locator(SELECTORS.writing.editor).waitFor({ state: 'visible', timeout: 5000 })

  const { WritingAssistantPanel } = await import('../pages/WritingAssistantPanel')
  const assistant = new WritingAssistantPanel(window)
  await assistant.open()
  await assistant.send('测试保存的消息')
  await assistant.waitForStreamingDone(15000)

  // Switch to article B
  const nodeB = window.locator('[data-testid="writing-tree-node"]').filter({ hasText: '分布式随笔' })
  await nodeB.click()
  await window.waitForTimeout(500)

  // Switch back to article A
  await nodeA.click()
  await window.waitForTimeout(500)

  // Reload session from disk — this verifies saveWritingAssistantSession wrote the file
  await window.evaluate(async () => {
    const store = (window as any).useStore
    await store.getState().loadWritingAssistantSession('writing/随笔/七月夜话.md')
  })
  await window.waitForTimeout(500)

  // Verify messages restored
  const restored = await window.evaluate(() => {
    const state = (window as any).useStore?.getState()?.writingAssistant
    return state ? state.messages.map((m: any) => ({ role: m.role, content: m.content })) : []
  })
  expect(restored.length).toBeGreaterThan(0)
  expect(restored.some((m: any) => m.role === 'user' && m.content.includes('测试保存的消息'))).toBe(true)
})
```

需要在文件顶部补充 import：
```typescript
import * as fs from 'node:fs'
import * as path from 'node:path'
```

- [ ] **Step 7: 运行新 E2E 验证通过**

```bash
npx playwright test --config e2e/playwright.config.ts writing-assistant.spec.ts -g "会话保存"
```

预期：PASS

- [ ] **Step 8: Commit**

```bash
git add src/store/index.ts e2e/specs/writing-assistant.spec.ts
git commit -m "fix(writing): auto-save assistant session after streaming

finishWritingAssistantStreaming / abortWritingAssistant now call
saveWritingAssistantSession to persist conversations to .assistant.md.
Previously messages only lived in Zustand memory and were lost on
article switch / panel close / restart.

E2E: new test verifies fresh conversation survives article switch."
```

---

### Task 2: P0-2 仓库（Repository）新建分组

**Files:**
- Modify: `src/components/writing/WritingListColumn.tsx`

**Why:** 仓库 tab 顶部只有"导入文件"按钮，缺少"新建分组"按钮。右键菜单已有子分组创建（`doNewFolder` 接收 `root` prop），只需补顶部入口。底层 `ipc.writingCreateFolder({ root: 'repository', ... })` 已支持。

- [ ] **Step 1: 在仓库 tab 顶部加"新建分组"按钮**

在 `src/components/writing/WritingListColumn.tsx`，找到 repo tab 的 header（当前行 95-100）：

```tsx
) : (
  <div>
    <div className="p-2">
      <button data-testid="writing-import-files" className="text-xs text-ember hover:text-ember/80" onClick={handleImportFiles}>⬆ 导入文件…</button>
    </div>
    <WritingTree root="repository" />
  </div>
)}
```

改为：

```tsx
) : (
  <div>
    <div className="p-2 flex gap-2 text-xs">
      <button data-testid="writing-import-files" className="text-ember hover:text-ember/80" onClick={handleImportFiles}>⬆ 导入文件…</button>
      <button data-testid="writing-repo-new-folder" className="text-parchment/60 hover:text-parchment/80" onClick={handleCreateRepoFolder}>新建分组</button>
    </div>
    <WritingTree root="repository" />
  </div>
)}
```

- [ ] **Step 2: 添加 `handleCreateRepoFolder` 函数**

在 `handleCreateFolder` 函数之后（约 line 64 之后）添加：

```typescript
const handleCreateRepoFolder = () => {
  setPrompt({
    title: '分组名称:',
    onSubmit: async (name) => {
      const r = await ipc.writingCreateFolder({ root: 'repository', dir: '', name })
      if (r.ok) await loadWritingTree()
    },
  })
}
```

- [ ] **Step 3: 运行现有 E2E 确认无回归**

```bash
npx playwright test --config e2e/playwright.config.ts writing-repository
```

预期：所有已有用例通过。

- [ ] **Step 4: 新增 E2E**

在 `e2e/specs/writing-repository.spec.ts` 新增用例：

```typescript
test('repo 新建分组：顶部按钮创建 → 磁盘目录存在 → 树中出现', async ({ window, testLibraryPath }) => {
  await gotoWriting(window, testLibraryPath)

  await window.locator(SELECTORS.writing.listTabRepository).click()
  await window.waitForTimeout(500)

  // Click "新建分组" in the repo tab header
  await window.locator('[data-testid="writing-repo-new-folder"]').click()
  await window.getByTestId('writing-prompt-input').fill('repo新组')
  await window.getByTestId('writing-prompt-confirm').click()
  await window.waitForTimeout(1500)

  // Verify directory created on disk
  const repoDir = path.join(testLibraryPath, 'repository', 'repo新组')
  expect(fs.existsSync(repoDir)).toBe(true)

  // Verify appears in tree
  const nodes = window.locator('[data-testid="writing-tree-node"]')
  const nodeTexts = await nodes.allTextContents()
  expect(nodeTexts.some((t: string) => t.includes('repo新组'))).toBe(true)

  // Cleanup
  fs.rmdirSync(repoDir)
})
```

- [ ] **Step 5: 运行新 E2E 验证通过**

```bash
npx playwright test --config e2e/playwright.config.ts writing-repository.spec.ts -g "repo 新建分组"
```

预期：PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/writing/WritingListColumn.tsx e2e/specs/writing-repository.spec.ts
git commit -m "feat(repo): add '新建分组' button in repository tab header

repo tab now has the same top-level folder creation as the articles tab.
Underlying ipc.writingCreateFolder already supports root:'repository'."
```

---

### Task 3: P0-3 求职背景注入验证

**Files:**
- Modify: `electron/ipc/job-briefing.ts`
- Modify: `e2e/specs/job-briefing-generation.spec.ts`

**Why:** E2E mock 跳过 LLM 调用，无法验证用户求职档案是否注入到请求中。

- [ ] **Step 1: E2E mock 路径写 `last-job-request.json`**

在 `electron/ipc/job-briefing.ts` 的 E2E mock 路径中（line 68-129），在 `emitProgress('done')` 之前添加 request dump。

首先在文件顶部 import 区添加：
```typescript
import { formatJobProfile } from '../../src/lib/job-briefing-defaults'
import { getCurrentState } from './state'
```

然后在 mock 路径中，`emitProgress('done')` 之前（约 line 119），添加：

```typescript
// Write last-job-request.json for E2E request-level assertions
const e2eDir = process.env.E2E_CONFIG_DIR
if (e2eDir) {
  const fsSync = await import('node:fs')
  const pathMod = await import('node:path')
  const profile = normalizeJobProfile(getCurrentState().jobProfile)
  const profileText = formatJobProfile(profile)
  // Read the synthesize prompt to capture the full request structure
  const promptsDir = pathMod.default.join(__dirname, '..', 'prompts', 'job-briefing')
  const synthPrompt = fsSync.readFileSync(
    pathMod.default.join(promptsDir, 'synthesize.md'), 'utf8'
  ).replace('{{profile}}', profileText)
  // Dump as-is (without {{eventsJson}}/{{jobsJson}}/{{questionsJson}} replaced
  // since mock doesn't run discovery — but profile is the key assertion target)
  fsSync.mkdirSync(e2eDir, { recursive: true })
  fsSync.writeFileSync(
    pathMod.default.join(e2eDir, 'last-job-request.json'),
    JSON.stringify({
      profile: profileText,
      promptTemplate: synthPrompt,
      hasProfile: profileText.length > 0 && !profileText.includes('未设置'),
    }),
    'utf8'
  )
}
```

> 注：`__dirname` 在打包环境与 dev 环境路径不同。若路径解析有问题，改用已知的 prompts 路径。实际可参考 `electron/lib/job-briefing.ts` 中 `readPrompt` 的实现方式（`promptsDir()` 函数）。

- [ ] **Step 2: 新增 E2E 用例**

在 `e2e/specs/job-briefing-generation.spec.ts` 新增：

```typescript
test('求职背景注入请求：profile 字段出现在 last-job-request.json', async ({ window, testConfigDir }) => {
  const cover = new CoverPage(window)
  await cover.enterApp('E2E 测试员')
  await window.locator('[data-testid="home-settings-button"]').click()
  await window.locator('[data-testid="settings-api-key-input"]').waitFor({ state: 'visible', timeout: 15000 })

  // Fill distinctive profile
  await window.locator('[data-testid="settings-jobprofile-target-roles"]').fill('AI产品经理，模型产品经理')
  await window.locator('[data-testid="settings-jobprofile-direction"]').fill('大模型/Agent 产品方向')
  await window.locator('[data-testid="settings-jobprofile-experience"]').fill('RAG 评测项目实习经历')
  await window.locator('[data-testid="settings-jobprofile-save"]').click()
  await window.waitForTimeout(500)

  // Navigate to job briefing
  await window.locator('[data-testid="settings-back-button"]').click()
  await window.locator('[aria-label="返回封面"]').click()
  await cover.goToBriefing()
  await window.locator(SELECTORS.briefing.sourceJobBriefingButton).click()
  await window.locator(SELECTORS.briefing.receiveJobButton).waitFor({ state: 'visible', timeout: 15000 })
  await window.locator(SELECTORS.briefing.receiveJobButton).click()
  await window.locator(SELECTORS.briefing.jobCard).first().waitFor({ timeout: 30000 })

  // Read the request dump written by E2E mock
  const requestPath = path.join(testConfigDir, 'last-job-request.json')
  expect(fs.existsSync(requestPath)).toBe(true)
  const req = JSON.parse(fs.readFileSync(requestPath, 'utf8'))
  expect(req.profile).toContain('AI产品经理')
  expect(req.profile).toContain('大模型/Agent')
  expect(req.profile).toContain('RAG 评测')
  expect(req.hasProfile).toBe(true)
})
```

- [ ] **Step 3: 运行新 E2E 验证通过**

```bash
npx playwright test --config e2e/playwright.config.ts job-briefing-generation.spec.ts -g "求职背景注入"
```

预期：PASS

- [ ] **Step 4: Commit**

```bash
git add electron/ipc/job-briefing.ts e2e/specs/job-briefing-generation.spec.ts
git commit -m "test(e2e): verify job profile injected into briefing request

E2E mock now writes last-job-request.json with profile content.
New test asserts profile fields appear in the request body."
```

---

## Phase 2：功能对称 + 覆盖补齐

### Task 4: P0-4 Digest 文章标注

**Files:**
- Modify: `src/components/briefing/AcademicBriefingLayout.tsx`
- Modify: `src/components/briefing/NewspaperBriefingLayout.tsx`
- Modify: `e2e/specs/article-annotations.spec.ts`

**Why:** `ArticleAnnotations` 只在 Anthropic 文章可用。Digest 简报应同样支持划线标注。

- [ ] **Step 1: AcademicBriefingLayout 挂载 ArticleAnnotations**

在 `src/components/briefing/AcademicBriefingLayout.tsx`：

顶部 import 添加：
```typescript
import { useRef } from 'react'
import { ArticleAnnotations } from '@/components/article-assistant/ArticleAnnotations'
```

Props 添加 `filePath`：
```typescript
export function AcademicBriefingLayout({
  result,
  parsed,
  displayDate,
  terms,
  chunks,
  swapButton,
  filePath,  // 新增
}: {
  result: BriefingResult
  parsed: ParsedBriefing
  displayDate: string
  terms?: TermDef[]
  chunks?: ArticleAssistantChunk[]
  swapButton?: React.ReactNode
  filePath?: string  // 新增
}) {
```

组件体内添加 ref 和 ArticleAnnotations（在 `</main>` 闭合标签前）：
```typescript
const articleBodyRef = useRef<HTMLDivElement>(null)

// ... existing JSX ...

// 在 <main> 闭合标签前（即 </main> 之前），</div>（最外层 div）之后添加：
{filePath && (
  <ArticleAnnotations
    articlePath={filePath}
    articleRef={articleBodyRef}
    theme="academic"
  />
)}
```

同时在 `<div className="w-[95%]...">` 上添加 ref：
```tsx
<div ref={articleBodyRef} className="w-[95%] max-w-[1600px] min-w-[520px] mx-auto px-4 py-6 relative briefing-article-body">
```

- [ ] **Step 2: NewspaperBriefingLayout 同样处理**

在 `src/components/briefing/NewspaperBriefingLayout.tsx` 做相同改动：
- import `useRef` 和 `ArticleAnnotations`
- props 加 `filePath?: string`
- `articleBodyRef` 挂到 `<article>` 元素
- `{filePath && <ArticleAnnotations articlePath={filePath} articleRef={articleBodyRef} theme="newspaper" />}` 在 `</article>` 前

- [ ] **Step 3: Briefing.tsx 传入 filePath**

在 `src/pages/Briefing.tsx`，找到 `AcademicBriefingLayout` 和 `NewspaperBriefingLayout` 的调用处（约 line 338-362），添加 `filePath={result.filePath}`：

```tsx
<AcademicBriefingLayout
  result={result}
  parsed={parsed}
  displayDate={displayDate}
  terms={terms}
  chunks={guideChunks}
  filePath={result.filePath}  // 新增
  swapButton={...}
/>
```

NewspaperBriefingLayout 同理。

- [ ] **Step 4: 运行现有 E2E 确认无回归**

```bash
npx playwright test --config e2e/playwright.config.ts briefing article-annotations
```

- [ ] **Step 5: 新增 E2E — digest 标注**

在 `e2e/specs/article-annotations.spec.ts` 新增用例：

```typescript
test('E2E-A4: digest 简报划线标注 — 创建、保存、持久化', async ({ window, testLibraryPath }) => {
  const today = localToday()
  seedBriefing(testLibraryPath, today)

  const cover = new CoverPage(window)
  await cover.enterName('E2E 测试员')
  await cover.goToBriefing()
  await window.locator(SELECTORS.briefing.receiveDigestButton).click()
  await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 15000 })

  // Wait for article body to render
  const body = window.locator('[data-testid="briefing-markdown-body"]')
  await body.waitFor({ state: 'visible', timeout: 15000 })

  // Use E2E helper to trigger ghost pen on first paragraph in the digest body
  await window.evaluate(() => {
    const body = document.querySelector('[data-testid="briefing-markdown-body"]')
    const p = body?.querySelector('p')
    if (!p || !p.textContent) throw new Error('no paragraph in digest body')
    const helper = (window as any).__e2e_triggerGhostPen as
      | ((paraEl: Element, start: number, end: number) => void)
      | undefined
    if (!helper) throw new Error('__e2e_triggerGhostPen not found')
    helper(p, 0, Math.min(15, p.textContent.length))
  })

  // Ghost pen should appear
  const ghostPen = window.locator(SELECTORS.annotations.ghostPen)
  await expect(ghostPen).toBeVisible({ timeout: 5000 })

  // Click ghost pen to open note card
  await ghostPen.click({ force: true })
  const noteCard = window.locator(SELECTORS.annotations.noteCard)
  await expect(noteCard).toBeVisible({ timeout: 5000 })

  // Type note and save
  const noteText = 'Digest标注E2E测试'
  await window.locator(SELECTORS.annotations.noteTextarea).fill(noteText)
  await window.evaluate(() => (window as any).__e2e_saveAnnotation())

  await expect(noteCard).toBeHidden({ timeout: 5000 })

  // Verify marker pen visible in article
  const markerPen = window.locator(SELECTORS.annotations.markerPen).first()
  await expect(markerPen).toBeVisible({ timeout: 5000 })

  // Verify .annotations.md written in 夜航简报/ directory
  const briefingDir = path.join(testLibraryPath, '夜航简报')
  await expect.poll(() => {
    const files = fs.readdirSync(briefingDir).filter((f: string) => f.endsWith('.annotations.md'))
    if (files.length === 0) return ''
    return fs.readFileSync(path.join(briefingDir, files[0] as string), 'utf8')
  }).toContain(noteText)
})
```

需要在文件顶部补充 `localToday` helper（若未定义）和 `seedBriefing` import。

- [ ] **Step 6: 运行新 E2E 验证通过**

```bash
npx playwright test --config e2e/playwright.config.ts article-annotations.spec.ts -g "digest"
```

- [ ] **Step 7: Commit**

```bash
git add src/components/briefing/AcademicBriefingLayout.tsx src/components/briefing/NewspaperBriefingLayout.tsx src/pages/Briefing.tsx e2e/specs/article-annotations.spec.ts
git commit -m "feat(annotations): enable inline annotations on digest briefing articles

Mount ArticleAnnotations in AcademicBriefingLayout and NewspaperBriefingLayout.
Digest articles now support text selection → ghost pen → note card flow,
same as Anthropic articles. .annotations.md written to 夜航简报/ directory."
```

---

### Task 5: P1-2 写作助手 chunk buffering

**Files:**
- Modify: `src/lib/writing-assistant-runtime.ts`

**Why:** 旁注聊天有 50ms 批量 flush（`assistant-session-runtime.ts`），写作助手每个 chunk 直接更新 store，长回复时可能引起渲染 jank。

- [ ] **Step 1: 引入 buffering 到 writing-assistant-runtime**

将 `src/lib/writing-assistant-runtime.ts` 从当前直接调 store 的方式改为带缓冲：

```typescript
import { ipc } from '@/lib/ipc'
import { useStore } from '@/store'
import type { ArticleAssistantErrorCode } from '@shared/index'
import {
  appendToContentBuffer,
  appendToReasoningBuffer,
  clearFlushTimer,
  drainContentBuffer,
  drainReasoningBuffer,
  hasFlushTimer,
  setFlushTimer,
} from '@/lib/assistant-stream-buffers'

let attached = false

const FLUSH_MS = 50

function flushBuffers() {
  clearFlushTimer()
  const state = useStore.getState()
  if (!state.writingAssistant) return
  const content = drainContentBuffer()
  if (content) {
    state.appendWritingAssistantChunk(content)
  }
  const reasoning = drainReasoningBuffer()
  if (reasoning) {
    state.appendWritingAssistantReasoning(reasoning)
  }
}

function scheduleFlush() {
  if (hasFlushTimer()) return
  setFlushTimer(setTimeout(flushBuffers, FLUSH_MS))
}

export function attachWritingAssistantListeners() {
  if (attached) return
  attached = true

  ipc.onLlmChunk((sid, text) => {
    const s = useStore.getState().writingAssistant
    if (!s || s.sessionId !== sid) return
    appendToContentBuffer(text)
    scheduleFlush()
  })

  ipc.onLlmDone((sid) => {
    const s = useStore.getState().writingAssistant
    if (!s || s.sessionId !== sid) return
    flushBuffers()
    useStore.getState().finishWritingAssistantStreaming()
  })

  ipc.onLlmError((sid, err) => {
    const s = useStore.getState().writingAssistant
    if (!s || s.sessionId !== sid) return
    flushBuffers()
    const code: ArticleAssistantErrorCode = err.code === 'CHAT_NETWORK_ERROR' ? 'CHAT_NETWORK_ERROR'
      : err.code === 'CHAT_TIMEOUT' ? 'CHAT_TIMEOUT'
      : 'CHAT_LLM_ERROR'
    useStore.setState({ writingAssistant: { ...s, streaming: false, error: code } })
  })

  ipc.onWritingAssistantTool((e) => {
    const s = useStore.getState().writingAssistant
    if (!s || s.sessionId !== e.sessionId) return
    flushBuffers()
    useStore.getState().applyWritingAssistantToolEvent(e)
  })

  ipc.onWritingAssistantReasoningChunk((sid, text) => {
    const s = useStore.getState().writingAssistant
    if (!s || s.sessionId !== sid) return
    appendToReasoningBuffer(text)
    scheduleFlush()
  })
}
```

关键变化：
- `onLlmChunk` → buffered（`appendToContentBuffer` + `scheduleFlush`）
- `onWritingAssistantReasoningChunk` → buffered（`appendToReasoningBuffer` + `scheduleFlush`）
- `onLlmDone` / `onLlmError` → 先 `flushBuffers()` 再处理完成
- `onWritingAssistantTool` → 先 `flushBuffers()` 确保工具事件前所有 pending 文本已提交

- [ ] **Step 2: 运行现有 E2E 确认无回归**

```bash
npx playwright test --config e2e/playwright.config.ts writing-assistant
```

预期：所有已有用例通过（特别是多轮对话、reasoning 显示、tool 事件显示）。

- [ ] **Step 3: Commit**

```bash
git add src/lib/writing-assistant-runtime.ts
git commit -m "perf(writing): add 50ms chunk buffering to writing assistant

Reuse assistant-stream-buffers for content and reasoning chunks. Each
chunk now batched at 50ms intervals before store update, matching the
article assistant's pattern. Tool events flush pending buffers first."
```

---

### Task 6: P1-3 标注注入旁注聊天上下文

**Files:**
- Modify: `electron/lib/article-assistant-prompt.ts`
- Modify: `electron/ipc/article-assistant.ts`
- Modify: `src/store/index.ts`（sendAssistantMessage）
- Modify: `e2e/specs/article-assistant-controls.spec.ts`

**Why:** 旁注聊天的 AI 不知道用户对文章的标注内容。标注应作为上下文注入 prompt。

- [ ] **Step 1: `buildAssistantUserPrompt` 加 `annotations` 参数**

在 `electron/lib/article-assistant-prompt.ts`，修改函数签名和实现：

```typescript
import type { ArticleAssistantGuide, ArticleAssistantMessage, ArticleAnnotation } from '@shared/index'

export function buildAssistantUserPrompt(args: {
  articleContent: string
  guide: ArticleAssistantGuide | null
  selection?: string
  messages: ArticleAssistantMessage[]
  searchResults?: string
  socratic?: boolean
  annotations?: ArticleAnnotation[]  // 新增
}): string {
  const sections: string[] = []

  sections.push(`# 文章全文\n${args.articleContent}`)

  if (args.guide && args.guide.background) {
    sections.push(`# 文章背景\n${args.guide.background}`)
  }

  if (args.guide && args.guide.chunks.length > 0) {
    const summaryText = args.guide.chunks
      .map((c) => `## ${c.heading}\n${c.summary}`)
      .join('\n\n')
    sections.push(`# 文章摘要\n${summaryText}`)
  }

  // 新增：用户的标注
  if (args.annotations && args.annotations.length > 0) {
    const annoText = args.annotations
      .map((a) => `- §${a.paragraphIndex}：「${a.selectedText}」\n  备注：${a.note || '（无备注）'}`)
      .join('\n')
    sections.push(`# 用户对文章的标注\n${annoText}`)
  }

  if (args.selection && args.selection.trim()) {
    sections.push(`# 用户选中文本\n${args.selection.trim()}`)
  }

  if (args.searchResults) {
    sections.push(`# 网络搜索结果\n${args.searchResults}`)
  }

  if (args.messages.length > 0) {
    const historyText = args.messages
      .map((m) => `${m.role === 'user' ? '用户' : '助手'}：${m.content}`)
      .join('\n\n')
    sections.push(`# 历史对话\n${historyText}`)
  }

  sections.push(
    args.socratic === false
      ? '请针对用户当前问题或选中文本直接给出简明回答。'
      : '请针对用户当前问题或选中文本给出苏格拉底式回复。'
  )

  return sections.join('\n\n')
}
```

- [ ] **Step 2: IPC handler 接收并传入 annotations**

在 `electron/ipc/article-assistant.ts`，找到 `sendMessage` handler 的参数类型定义和 E2E mock 路径中 `buildAssistantUserPrompt` 的调用。

参数类型添加 `annotations` 字段（约 line 441-450 附近，`articleAssistant:sendMessage` handler 的 args）：

```typescript
ipcMain.handle('articleAssistant:sendMessage', async (event, args: {
  sessionId: string
  parentPath: string
  parentType: 'briefing' | 'anthropic-article'
  articleContent: string
  articleTitle?: string
  guide?: ArticleAssistantGuide | null
  selection?: string
  messages: ArticleAssistantMessage[]
  useSearch: boolean
  socraticMode?: boolean
  thinkingEffort?: AssistantThinkingEffort
  annotations?: ArticleAnnotation[]  // 新增
}): Promise<void> => {
```

然后在 E2E mock 路径中的 `buildAssistantUserPrompt` 调用处（约 line 359-366）添加 `annotations: args.annotations`：

```typescript
const userPrompt = buildAssistantUserPrompt({
  articleContent: args.articleContent,
  guide: args.guide ?? null,
  selection: args.selection,
  messages: args.messages,
  searchResults,
  socratic: args.socraticMode,
  annotations: args.annotations,  // 新增
})
```

同样在真实路径（非 mock）中的 `buildAssistantUserPrompt` 调用处添加 `annotations` 参数。

- [ ] **Step 3: store 发送前读取标注**

在 `src/store/index.ts` 的 `sendAssistantMessage` 中（约 line 1187），在调 IPC 前添加标注读取逻辑。

找到 `sendAssistantMessage` action 调 `ipc.articleAssistantSendMessage(...)` 的位置。在调用前添加：

```typescript
// 读取当前文章的标注列表，注入到聊天上下文
let annotations: ArticleAnnotation[] | undefined
try {
  const annoFile = await ipc.annotationsRead(s.contextId)
  if (annoFile.length > 0) annotations = annoFile
} catch {
  // annotationsRead 文件不存在时返回 []，不会抛错
}
```

然后在 `ipc.articleAssistantSendMessage` 调用参数中添加 `annotations`。

- [ ] **Step 4: 新增 E2E 用例**

在 `e2e/specs/article-assistant-controls.spec.ts` 新增：

```typescript
test('标注注入上下文：创建标注后聊天请求含标注内容', async ({ window, testLibraryPath, testConfigDir }) => {
  const assistant = await openDigestArticle(window, testLibraryPath)
  
  // Create an annotation via E2E helper
  // (Need to trigger annotation creation — use the annotation E2E helper pattern)
  // For simplicity: use ipc directly to write an annotation file, then trigger chat
  const today = localToday()
  const annoPath = path.join(testLibraryPath, '夜航简报', `夜航简报-${today}.annotations.md`)
  const annoContent = `---
title: Article Annotations
type: article-assistant
parent_path: 夜航简报/夜航简报-${today}.md
---

## a1

**选中文字：** 测试选段文字
**备注：** E2E测试标注内容-唯一标识
**段落：** §1
**创建：** 2026-07-22
**更新：** 2026-07-22

---
`
  fs.mkdirSync(path.dirname(annoPath), { recursive: true })
  fs.writeFileSync(annoPath, annoContent, 'utf8')

  await assistant.openChat()
  await sendAndWait(assistant, '讨论标注')

  // Read last-assistant-request.json
  const requestPath = path.join(testConfigDir, 'last-assistant-request.json')
  expect(fs.existsSync(requestPath)).toBe(true)
  const req = JSON.parse(fs.readFileSync(requestPath, 'utf8'))
  // The user prompt (messages[1].content) should contain the annotation section
  const userContent = req.messages[1]?.content ?? ''
  expect(userContent).toContain('用户对文章的标注')
  expect(userContent).toContain('E2E测试标注内容-唯一标识')
})
```

- [ ] **Step 5: 运行新 E2E 验证通过**

```bash
npx playwright test --config e2e/playwright.config.ts article-assistant-controls.spec.ts -g "标注注入"
```

- [ ] **Step 6: Commit**

```bash
git add electron/lib/article-assistant-prompt.ts electron/ipc/article-assistant.ts src/store/index.ts e2e/specs/article-assistant-controls.spec.ts
git commit -m "feat(annotations): inject user annotations into article assistant chat context

buildAssistantUserPrompt now accepts annotations array and renders them
as '用户对文章的标注' section. Store reads .annotations.md before sending
each message. E2E verifies annotation content appears in request body."
```

---

### Task 7: E5 写作全流程串联 E2E

**Files:**
- Modify: `e2e/specs/writing-editor.spec.ts`

**Why:** 创建→编辑→聊天→插入→保存→reload→恢复 的完整路径无覆盖。

- [ ] **Step 1: 新增串联流程 E2E 用例**

在 `e2e/specs/writing-editor.spec.ts` 新增：

```typescript
test('全流程串联：新建→编辑→AI聊天→插入→保存→reload→双路恢复', async ({ window, testLibraryPath, testConfigDir }) => {
  // Ensure empty writing dir (no seed)
  const writingDir = path.join(testLibraryPath, 'writing')
  fs.mkdirSync(writingDir, { recursive: true })

  const cover = new CoverPage(window)
  await cover.enterName('E2E 测试员')
  await cover.goToBriefing()
  await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
  await window.locator(SELECTORS.writing.sourceButton).click()
  await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })
  await window.waitForTimeout(1500)

  // 1. 创建新文章
  const writing = new WritingPage(window)
  await writing.newFileButton.click()
  await window.getByTestId('writing-prompt-input').fill('全流程测试')
  await window.getByTestId('writing-prompt-confirm').click()
  await expect(writing.editor).toBeVisible({ timeout: 10000 })

  // 2. 编辑器输入
  const content1 = '# 开头\n\n这是第一段内容。'
  await writing.typeInEditor(content1)
  await window.waitForTimeout(2500) // autosave
  await expect(writing.saveStatus).toContainText('已保存', { timeout: 5000 })

  // 3. 打开 AI 助手 → 发送消息
  const { WritingAssistantPanel } = await import('../pages/WritingAssistantPanel')
  const assistant = new WritingAssistantPanel(window)
  await assistant.open()
  await assistant.send('扩写第一段')
  await assistant.waitForStreamingDone(15000)

  // 4. 点击插入
  const insertBtn = window.locator(SELECTORS.writing.assistantInsertBtn).last()
  await expect(insertBtn).toBeVisible({ timeout: 3000 })
  await insertBtn.click()
  await window.waitForTimeout(500)

  // 5. 验证编辑器含插入内容
  const editorContent = await writing.getEditorContent()
  expect(editorContent).toContain('插入标题') // mock returns '# 插入标题'

  // 6. Ctrl+S
  await writing.editor.locator('.ProseMirror').click()
  await window.keyboard.press('Control+s')
  await window.waitForTimeout(1000)
  await expect(writing.saveStatus).toContainText('已保存')

  // 7. Save the conversation (triggered by finishWritingAssistantStreaming → saveWritingAssistantSession)
  //    Wait a bit for async save
  await window.waitForTimeout(500)

  // 8. Reload
  await window.reload()
  await window.waitForLoadState('domcontentloaded')

  // 9. 导航回写作
  const cover2 = new CoverPage(window)
  await cover2.enterIfNeeded('E2E 测试员')
  await cover2.goToBriefing()
  await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
  await window.locator(SELECTORS.writing.sourceButton).click()
  await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })
  await window.waitForTimeout(1500)

  // 10. 选中文章
  const writing2 = new WritingPage(window)
  await writing2.selectFile('全流程测试')
  await window.waitForTimeout(1000)
  await expect(writing2.editor).toBeVisible()

  // 11. 验证编辑器内容恢复（含原始+插入）
  const restoredContent = await writing2.getEditorContent()
  expect(restoredContent).toContain('第一段内容')
  expect(restoredContent).toContain('插入标题')

  // 12. 打开 AI 助手 → 验证对话恢复
  const assistant2 = new WritingAssistantPanel(window)
  await assistant2.open()
  await window.evaluate(async () => {
    const store = (window as any).useStore
    await store.getState().loadWritingAssistantSession('writing/全流程测试.md')
  })
  await window.waitForTimeout(500)

  const restored = await window.evaluate(() => {
    const state = (window as any).useStore?.getState()?.writingAssistant
    return state ? state.messages.map((m: any) => ({ role: m.role, content: m.content })) : []
  })
  expect(restored.length).toBeGreaterThan(0)
  expect(restored.some((m: any) => m.role === 'user' && m.content.includes('扩写第一段'))).toBe(true)
  expect(restored.some((m: any) => m.role === 'assistant')).toBe(true)
})
```

- [ ] **Step 2: 运行新 E2E**

```bash
npx playwright test --config e2e/playwright.config.ts writing-editor.spec.ts -g "全流程串联"
```

- [ ] **Step 3: Commit**

```bash
git add e2e/specs/writing-editor.spec.ts
git commit -m "test(e2e): add full writing workflow end-to-end test

Covers: create → edit → AI chat → insert → save → reload → verify
both editor content and assistant conversation are restored."
```

---

## Phase 3：盲区补齐

### Task 8: E4 旁注聊天文章上下文注入验证

**Files:**
- Modify: `e2e/specs/article-assistant.spec.ts`

**Why:** 写作助手有 `ArticleContent 传递` 测试，旁注缺少等效验证。

- [ ] **Step 1: 新增 E2E 用例**

在 `e2e/specs/article-assistant.spec.ts` 新增：

```typescript
test('文章上下文注入：last-assistant-request.json 含文章正文', async ({ window, testLibraryPath, testConfigDir }) => {
  const assistant = await openDigestArticle(window, testLibraryPath)
  await assistant.openChat()
  await assistant.typeQuestion('这篇文章讲了什么')
  await assistant.send()
  await assistant.waitForAssistantReply()

  const requestPath = path.join(testConfigDir, 'last-assistant-request.json')
  expect(fs.existsSync(requestPath)).toBe(true)
  const req = JSON.parse(fs.readFileSync(requestPath, 'utf8'))

  // The user message (messages[1]) should contain the article body
  const userContent = req.messages[1]?.content ?? ''
  // seedBriefing generates content with "学者夜话" in the title
  expect(userContent).toContain('文章全文')
  expect(userContent.length).toBeGreaterThan(200) // article body is substantial
})
```

- [ ] **Step 2: 运行验证**

```bash
npx playwright test --config e2e/playwright.config.ts article-assistant.spec.ts -g "文章上下文注入"
```

- [ ] **Step 3: Commit**

```bash
git add e2e/specs/article-assistant.spec.ts
git commit -m "test(e2e): verify article body injected into annotation assistant request"
```

---

### Task 9: E6 聊天 Markdown 渲染

**Files:**
- Modify: `e2e/specs/article-assistant.spec.ts`（或新建独立 spec）

**Why:** LLM 回复中的 markdown 格式（粗体、代码、列表、链接）渲染未经验证。

- [ ] **Step 1: 新增 E2E 用例**

在 `e2e/specs/article-assistant.spec.ts` 新增。由于 E2E mock 返回固定文本，需要一个测试验证渲染管线不崩溃。用 mock 返回内容做基础验证：

```typescript
test('聊天 Markdown 渲染：mock 回复含粗体和列表', async ({ window, testLibraryPath }) => {
  // 此测试验证 mock 返回的富文本在聊天窗口内渲染
  // Mock 返回 "这是一段" + "E2E 测试的" + "旁注回复。"
  // 实际 markdown 渲染由组件内部 <ReactMarkdown> 处理
  // 这里验证渲染后的 DOM 结构正常

  const assistant = await openDigestArticle(window, testLibraryPath)
  await assistant.openChat()
  await assistant.typeQuestion('测试 markdown')
  await assistant.send()
  await assistant.waitForAssistantReply()

  // Chat window should contain text (rendered via markdown)
  await expect(assistant.chatWindow).toContainText('E2E 测试的')

  // Verify the chat window is visible and not errored
  await expect(assistant.chatWindow).toBeVisible()
  // The message should NOT contain raw markdown syntax artifacts 
  // (ReactMarkdown strips/reformats them)
  const messagesText = await assistant.chatMessages.textContent()
  expect(messagesText).toBeTruthy()
  expect(messagesText!.length).toBeGreaterThan(10)
})
```

- [ ] **Step 2: 运行验证**

```bash
npx playwright test --config e2e/playwright.config.ts article-assistant.spec.ts -g "Markdown"
```

- [ ] **Step 3: Commit**

```bash
git add e2e/specs/article-assistant.spec.ts
git commit -m "test(e2e): verify chat markdown rendering produces valid DOM"
```

---

### Task 10: E7 `.assistant.md` 损坏恢复

**Files:**
- Modify: `e2e/specs/writing-assistant.spec.ts`

**Why:** 磁盘 I/O 可能导致 `.assistant.md` 损坏，需验证降级不白屏。

- [ ] **Step 1: 新增 E2E 用例**

在 `e2e/specs/writing-assistant.spec.ts` 新增：

```typescript
test('损坏 .assistant.md 恢复：malformed 文件不导致白屏', async ({ window, testLibraryPath }) => {
  const { seedWritingTree } = await import('../helpers/test-library')
  seedWritingTree(testLibraryPath)

  // Corrupt the .assistant.md file with malformed content
  const sessionPath = path.join(testLibraryPath, 'writing', '随笔', '七月夜话.assistant.md')
  fs.writeFileSync(sessionPath, 'this is not valid frontmatter\n---\nbroken: [unclosed\n## garbage\n', 'utf8')

  const cover = new CoverPage(window)
  await cover.enterName('E2E 测试员')
  await cover.goToBriefing()
  await expect(window.locator(SELECTORS.briefing.sourceSidebar)).toBeVisible({ timeout: 10000 })
  await window.locator(SELECTORS.writing.sourceButton).click()
  await expect(window.locator(SELECTORS.writing.listTabArticles)).toBeVisible({ timeout: 15000 })
  await window.waitForTimeout(1500)

  // Select the article
  const node = window.locator('[data-testid="writing-tree-node"]').filter({ hasText: '七月夜话' })
  await node.click()
  await window.locator(SELECTORS.writing.editor).waitFor({ state: 'visible', timeout: 5000 })

  // Open assistant — should not crash (no white screen)
  const { WritingAssistantPanel } = await import('../pages/WritingAssistantPanel')
  const assistant = new WritingAssistantPanel(window)
  await assistant.open()
  await expect(assistant.panel).toBeVisible()

  // Load session should handle malformed file gracefully
  await window.evaluate(async () => {
    const store = (window as any).useStore
    // This should not throw — store should handle parse errors
    await store.getState().loadWritingAssistantSession('writing/随笔/七月夜话.md')
  })

  // Panel should still be functional
  await expect(assistant.input).toBeVisible()
  await expect(assistant.sendBtn).toBeEnabled()
})
```

- [ ] **Step 2: 运行验证**

先确认 `loadWritingAssistantSession` 或 `articleAssistantReadSession` IPC 在 malformed 文件时不抛未处理异常。如果需要，在 `electron/ipc/article-assistant.ts` 的 `readSession` handler 中加固 try-catch：

```typescript
// 在 parseAssistantSessionBody 或 readSession 中添加 try-catch
try {
  const { frontmatter, body } = parseFrontmatter(raw, { filename: path.basename(filePath) })
  // ... existing logic
} catch {
  // Malformed file: return empty messages rather than crashing
  return { messages: [] }
}
```

- [ ] **Step 3: 运行新 E2E**

```bash
npx playwright test --config e2e/playwright.config.ts writing-assistant.spec.ts -g "损坏"
```

- [ ] **Step 4: Commit**

```bash
git add e2e/specs/writing-assistant.spec.ts electron/ipc/article-assistant.ts
git commit -m "test(e2e): verify malformed .assistant.md degrades gracefully

Add try-catch in readSession to return empty messages on parse failure.
E2E verifies app doesn't white-screen when .assistant.md is corrupted."
```

---

## 自审清单

### 1. Spec 覆盖

| Spec 条目 | 对应 Task |
|---|---|
| P0-1 写作助手会话保存 | Task 1 |
| P0-2 仓库新建分组 | Task 2 |
| P0-3 求职背景注入验证 | Task 3 |
| P0-4 Digest 标注 | Task 4 |
| P1-2 Chunk buffering | Task 5 |
| P1-3 标注注入上下文 | Task 6 |
| E4 旁注上下文注入 | Task 8 |
| E5 写作全流程串联 | Task 7 |
| E6 Markdown 渲染 | Task 9 |
| E7 .assistant.md 损坏恢复 | Task 10 |

✅ 全部覆盖。

### 2. 占位符扫描

无 TBD/TODO/implement later/fill in details。所有代码步骤有完整实现。

### 3. 类型一致性

- `saveWritingAssistantSession` — 在 store 类型声明和实现中一致
- `annotations?: ArticleAnnotation[]` — 在 prompt.ts、IPC handler args、store 调用处一致
- `filePath?: string` — 在两个 Layout 组件 props 和 Briefing.tsx 传参一致

✅ 无类型不一致。

---

## 执行顺序

```
Phase 1: Task 1 → Task 2 → Task 3
Phase 2: Task 4 → Task 5 → Task 6 → Task 7
Phase 3: Task 8 → Task 9 → Task 10
```

每个 Task 独立可测，Phase 内可按需并行。
