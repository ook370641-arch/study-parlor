# 旁注功能迭代实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复旁注流式卡顿/拖拽卡顿/历史不显示/选中无法取消四个 bug，新增搜索·苏格拉底·深度思考三个全局持久化开关、思考过程显示、chatbot 两侧布局与选段持久化。

**Architecture:** 渲染层性能优化（chunk 批处理 + 订阅收窄 + memo + transform 拖拽）不动状态结构；reasoning 走新增旁注专属 IPC 事件 `articleAssistant:reasoningChunk`，不改 `llm:chunk` 契约；三个开关存 state.json 全局字段，发送时由渲染端随 `articleAssistant:sendMessage` 传给主进程（主进程无状态）；E2E mock 分支走真实 prompt 装配链并把最终请求体落盘供请求级断言。

**Tech Stack:** Electron 30 + React 18 + TypeScript + Zustand + Vitest + Playwright。

**Spec:** `docs/superpowers/specs/2026-07-19-annotation-iteration-design.md`

**关键事实（执行前必读）：**
- 当前模型端点：`.env` 里 `KIMI_BASE_URL=https://api.deepseek.com/`、`KIMI_MODEL=deepseek-v4-pro`。DeepSeek V4 `reasoning_effort` 有效值仅 `high`/`max`。
- vitest 已 mock `electron` 模块（`ipcMain.handle` 为 noop），单元测试可直接 import `electron/ipc/article-assistant.ts`（先例：`tests/article-assistant/file-io.test.ts`）。
- store 单测先例：`tests/store-article-assistant.test.ts`（mock `@/lib/ipc` + `@/lib/paintings`）；runtime 监听单测先例：`tests/session-runtime.test.ts`。
- E2E fixture 提供 `window`、`testLibraryPath`、`testConfigDir`；mock 由 `NODE_ENV==='test' && E2E_CONFIG_DIR` 双 guard 触发。
- ui-styling §10：组件文件只导出组件，helper 放 `src/lib/`。

---

### Task 1: 全局设置字段（state.json 三字段 + store 迁移）

**Files:**
- Modify: `src/types/index.ts`（StateJson + 新类型 + ArticleAssistantMessage）
- Modify: `electron/ipc/state.ts:12-26`（DEFAULT）
- Create: `src/lib/assistant-settings.ts`
- Test: `tests/assistant-settings.test.ts`
- Modify: `src/store/index.ts`（type/初始值/init/actions；移除会话级 searchEnabled）
- Modify: `e2e/helpers/test-library.ts:437-461`（BASE_STATE）

- [ ] **Step 1: 写失败测试**

Create `tests/assistant-settings.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { nextThinkingEffort } from '@/lib/assistant-settings'

describe('nextThinkingEffort', () => {
  it('cycles off → high → max → off', () => {
    expect(nextThinkingEffort('off')).toBe('high')
    expect(nextThinkingEffort('high')).toBe('max')
    expect(nextThinkingEffort('max')).toBe('off')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/assistant-settings.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 类型与 helper**

`src/types/index.ts` 在 `ArticleAssistantErrorCode` 附近加：

```ts
export type AssistantThinkingEffort = 'off' | 'high' | 'max'
```

同文件 `ArticleAssistantMessage`（95-99 行）改为：

```ts
export type ArticleAssistantMessage = {
  role: 'user' | 'assistant'
  content: string
  searchSources?: { title: string; url: string; snippet: string }[]
  selection?: string
  reasoning?: string
}
```

同文件 `StateJson`（390-391 行 `articleAssistantGuideCollapsed?: boolean` 之后）加：

```ts
  assistantSearchEnabled?: boolean
  assistantSocraticMode?: boolean
  assistantThinkingEffort?: AssistantThinkingEffort
```

Create `src/lib/assistant-settings.ts`:

```ts
import type { AssistantThinkingEffort } from '@shared/index'

export function nextThinkingEffort(effort: AssistantThinkingEffort): AssistantThinkingEffort {
  if (effort === 'off') return 'high'
  if (effort === 'high') return 'max'
  return 'off'
}
```

- [ ] **Step 4: DEFAULT + BASE_STATE**

`electron/ipc/state.ts` 的 `DEFAULT`（`jobBriefingConfig` 行后）加：

```ts
  assistantSearchEnabled: false,
  assistantSocraticMode: true,
  assistantThinkingEffort: 'off',
```

`e2e/helpers/test-library.ts` 的 `BASE_STATE`（`articleAssistantGuideCollapsed: false,` 行后）加：

```ts
  assistantSearchEnabled: false,
  assistantSocraticMode: true,
  assistantThinkingEffort: 'off',
```

- [ ] **Step 5: store 迁移**

`src/store/index.ts`：

1. 顶部 import 加 `import { nextThinkingEffort } from '@/lib/assistant-settings'`，类型 import 加 `AssistantThinkingEffort`。
2. `AssistantSession` type（19-38 行）：删除 `searchEnabled: boolean` 行。
3. `AppStore` 接口（252 行区块）加：

```ts
  assistantSearchEnabled: boolean
  assistantSocraticMode: boolean
  assistantThinkingEffort: AssistantThinkingEffort
  toggleAssistantSocratic: () => void
  cycleAssistantThinkingEffort: () => void
```

`sendAssistantMessage` 签名改为 `(text: string) => Promise<void>`。

4. 初始值（333-334 行区块）加：

```ts
  assistantSearchEnabled: false,
  assistantSocraticMode: true,
  assistantThinkingEffort: 'off',
```

5. `init`（357-358 行区块）加：

```ts
      assistantSearchEnabled: state.assistantSearchEnabled ?? false,
      assistantSocraticMode: state.assistantSocraticMode ?? true,
      assistantThinkingEffort: state.assistantThinkingEffort ?? 'off',
```

6. `openAssistantSession`（962 行）：删除 `searchEnabled: false,`，保留 `searchLoading: false,`。
7. `toggleAssistantSearch` 改为：

```ts
  toggleAssistantSearch: () => {
    const next = !get().assistantSearchEnabled
    set({ assistantSearchEnabled: next })
    ipc.patchState({ assistantSearchEnabled: next })
  },

  toggleAssistantSocratic: () => {
    const next = !get().assistantSocraticMode
    set({ assistantSocraticMode: next })
    ipc.patchState({ assistantSocraticMode: next })
  },

  cycleAssistantThinkingEffort: () => {
    const next = nextThinkingEffort(get().assistantThinkingEffort)
    set({ assistantThinkingEffort: next })
    ipc.patchState({ assistantThinkingEffort: next })
  },
```

8. `sendAssistantMessage`（1045-1054 行）改为：

```ts
  sendAssistantMessage: async (text) => {
    const s = get().assistantSession
    if (!s || s.streaming || s.searchLoading) return
    const content = text.trim()
    if (!content && !s.pendingSelection) return
    const useSearch = get().assistantSearchEnabled
    const userMessage: ArticleAssistantMessage = { role: 'user', content, selection: s.pendingSelection }
    const history = [...s.messages, userMessage]
    set({ assistantSession: { ...s, messages: history, retryContext: { text, useSearch } } })
    await get().runAssistantStream(history, useSearch)
  },
```

- [ ] **Step 6: 跑测试 + typecheck**

Run: `npx vitest run tests/assistant-settings.test.ts` → PASS
Run: `npx tsc --noEmit` → 预期报错点都在 `ChatWindow.tsx`（用 `session.searchEnabled`、双参 `sendAssistantMessage`）和 `tests/article-assistant/ChatWindow.test.tsx`——这些在 Task 8 修，本任务暂不处理；其余文件应干净。

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts electron/ipc/state.ts src/lib/assistant-settings.ts tests/assistant-settings.test.ts src/store/index.ts e2e/helpers/test-library.ts
git commit -m "feat(assistant): global persisted toggles (search/socratic/thinking-effort) in state.json; record selection on user messages"
```

---

### Task 2: kimi.ts — reasoning 解析、effort 'max'、onReasoning 回调

**Files:**
- Modify: `electron/lib/kimi.ts`（ThinkingConfig、parseSseChunk、chatStream、export buildChatBody）
- Test: `tests/kimi.test.ts`

- [ ] **Step 1: 写失败测试**

`tests/kimi.test.ts` 末尾追加（import 行加 `buildChatBody`）：

```ts
import { probeModel, chatNonStream, parseSseChunk, buildChatBody } from '@electron/lib/kimi'

describe('parseSseChunk reasoning', () => {
  it('parses reasoning_content delta into a reasoning event', () => {
    const line = 'data: {"choices":[{"delta":{"reasoning_content":"让我想想"}}]}'
    expect(parseSseChunk(line)).toEqual({ kind: 'reasoning', text: '让我想想' })
  })

  it('still parses content delta into a chunk event', () => {
    const line = 'data: {"choices":[{"delta":{"content":"你好"}}]}'
    expect(parseSseChunk(line)).toEqual({ kind: 'chunk', text: '你好' })
  })

  it('ignores [DONE] and malformed lines', () => {
    expect(parseSseChunk('data: [DONE]')).toEqual({ kind: 'done' })
    expect(parseSseChunk('data: {not json')).toEqual({ kind: 'noop' })
  })
})

describe('buildChatBody deepseek effort', () => {
  const dsCfg = { apiKey: 'sk-test', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-pro', libraryPath: '/' }
  const msgs = [{ role: 'user' as const, content: 'hi' }]

  it('off → thinking disabled, no reasoning_effort', () => {
    const body = buildChatBody(dsCfg, { messages: msgs, temperature: 0.7, stream: true, thinking: { type: 'disabled' } })
    expect(body.thinking).toEqual({ type: 'disabled' })
    expect(body.reasoning_effort).toBeUndefined()
  })

  it('high → enabled + reasoning_effort high', () => {
    const body = buildChatBody(dsCfg, { messages: msgs, temperature: 0.7, stream: true, thinking: { type: 'enabled', reasoning_effort: 'high' } })
    expect(body.thinking).toEqual({ type: 'enabled' })
    expect(body.reasoning_effort).toBe('high')
  })

  it('max → enabled + reasoning_effort max', () => {
    const body = buildChatBody(dsCfg, { messages: msgs, temperature: 0.7, stream: true, thinking: { type: 'enabled', reasoning_effort: 'max' } })
    expect(body.reasoning_effort).toBe('max')
  })

  it('omitting thinking defaults to disabled', () => {
    const body = buildChatBody(dsCfg, { messages: msgs, temperature: 0.7, stream: true })
    expect(body.thinking).toEqual({ type: 'disabled' })
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/kimi.test.ts`
Expected: FAIL（`buildChatBody` 未导出 / reasoning 解析不存在）

- [ ] **Step 3: 实现**

`electron/lib/kimi.ts`：

1. `ThinkingConfig`（30-32 行）改：

```ts
export type ThinkingConfig =
  | { type: 'enabled'; reasoning_effort?: 'high' | 'max' }
  | { type: 'disabled' }
```

2. `buildChatBody`（42 行）加 `export`：`export function buildChatBody(`。
3. `SseEvent` 与 `parseSseChunk`（138-155 行）改：

```ts
export type SseEvent =
  | { kind: 'chunk'; text: string }
  | { kind: 'reasoning'; text: string }
  | { kind: 'done' }
  | { kind: 'noop' }

export function parseSseChunk(line: string): SseEvent {
  const trimmed = line.trim()
  if (!trimmed.startsWith('data:')) return { kind: 'noop' }
  const payload = trimmed.slice(5).trim()
  if (payload === '[DONE]') return { kind: 'done' }
  try {
    const json = JSON.parse(payload) as { choices?: { delta?: { content?: string; reasoning_content?: string } }[] }
    const delta = json.choices?.[0]?.delta
    if (delta?.reasoning_content) return { kind: 'reasoning', text: delta.reasoning_content }
    return { kind: 'chunk', text: delta?.content ?? '' }
  } catch {
    return { kind: 'noop' }
  }
}
```

4. `chatStream` 签名（157-161 行）加第三回调：

```ts
export async function chatStream(
  cfg: AppConfig,
  args: { messages: Message[]; temperature: number; signal: AbortSignal; thinking?: ThinkingConfig },
  onChunk: (text: string) => void,
  onReasoning?: (text: string) => void
): Promise<void> {
```

循环内（247 行附近）改：

```ts
        if (ev.kind === 'chunk') onChunk(ev.text)
        else if (ev.kind === 'reasoning') onReasoning?.(ev.text)
        if (ev.kind === 'done') return
```

- [ ] **Step 4: 跑测试**

Run: `npx vitest run tests/kimi.test.ts` → 全 PASS

- [ ] **Step 5: Commit**

```bash
git add electron/lib/kimi.ts tests/kimi.test.ts
git commit -m "feat(kimi): parse reasoning_content, support reasoning_effort max, optional onReasoning callback, export buildChatBody"
```

---

### Task 3: prompt 装配双模式（苏格拉底 / 信息检索）

**Files:**
- Modify: `electron/lib/article-assistant-prompt.ts`
- Test: `tests/article-assistant/prompt.test.ts`

- [ ] **Step 1: 写失败测试**

`tests/article-assistant/prompt.test.ts` 末尾追加：

```ts
describe('buildAssistantSystemPrompt socratic modes', () => {
  it('socratic mode keeps the questioning stance', () => {
    const p = buildAssistantSystemPrompt(true)
    expect(p).toContain('苏格拉底')
    expect(p).toMatch(/引导/)
  })

  it('retrieval mode answers directly without questioning', () => {
    const p = buildAssistantSystemPrompt(false)
    expect(p).not.toContain('苏格拉底')
    expect(p).toContain('直接')
    expect(p).toContain('不要反问')
  })

  it('defaults to socratic when the argument is omitted', () => {
    expect(buildAssistantSystemPrompt()).toContain('苏格拉底')
  })
})

describe('buildAssistantUserPrompt socratic flag', () => {
  const base = { articleContent: '正文内容', guide: null, messages: [] }

  it('ends with the socratic instruction by default', () => {
    expect(buildAssistantUserPrompt(base)).toContain('苏格拉底式回复')
  })

  it('ends with the direct-answer instruction when socratic is false', () => {
    const out = buildAssistantUserPrompt({ ...base, socratic: false })
    expect(out).toContain('直接给出简明回答')
    expect(out).not.toContain('苏格拉底式回复')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/article-assistant/prompt.test.ts`
Expected: FAIL（`buildAssistantSystemPrompt(false)` 仍返回苏格拉底版）

- [ ] **Step 3: 实现**

`electron/lib/article-assistant-prompt.ts`：

```ts
export function buildAssistantSystemPrompt(socratic = true): string {
  if (!socratic) {
    return `你是一位陪伴用户阅读文章的信息检索助手。

你的职责：
- 用户正在阅读一篇文章，你在旁边帮助他快速获取信息。
- 直接、简洁地回答问题，基于文章内容与搜索结果给出结论。
- 不要反问、不要质询、不要用提问引导用户。
- 除非用户明确要求用其他语言，一律用中文回答。`
  }
  return `你是一位陪伴用户阅读文章的苏格拉底式助手。

你的职责：
- 用户正在阅读一篇文章，你在旁边帮助他理解、思考和联想。
- 用简短的问题、类比和联想引导用户自己思考，而不是直接给出结论。
- 回答要简洁，不要长篇大论，一次聚焦一两个要点。
- 结合文章上下文、背景资料和用户选中的文本作答。
- 除非用户明确要求用其他语言，一律用中文回答。`
}
```

`buildAssistantUserPrompt` 的 args 类型加 `socratic?: boolean`，结尾句改：

```ts
  sections.push(
    args.socratic === false
      ? '请针对用户当前问题或选中文本直接给出简明回答。'
      : '请针对用户当前问题或选中文本给出苏格拉底式回复。'
  )
```

- [ ] **Step 4: 跑测试**

Run: `npx vitest run tests/article-assistant/prompt.test.ts` → 全 PASS

- [ ] **Step 5: Commit**

```bash
git add electron/lib/article-assistant-prompt.ts tests/article-assistant/prompt.test.ts
git commit -m "feat(assistant-prompt): socratic/retrieval dual-mode system prompt and closing instruction"
```

---

### Task 4: IPC 层 — sendMessage 新参数、reasoningChunk 事件、mock 落盘请求体

**Files:**
- Modify: `src/types/index.ts`（IpcApi）
- Modify: `electron/preload.ts:53-57` 区块后
- Modify: `src/lib/ipc.ts:84-90` 区块
- Modify: `electron/ipc/article-assistant.ts`（sendMessage handler + mock 分支）

- [ ] **Step 1: types**

`src/types/index.ts` 的 `IpcApi`：

`articleAssistantSendMessage`（532-541 行）args 加两个可选字段：

```ts
  articleAssistantSendMessage: (args: {
    sessionId: string
    articleContent: string
    articleType: 'briefing' | 'anthropic-article'
    messages: ArticleAssistantMessage[]
    selection?: string
    useSearch?: boolean
    guide?: ArticleAssistantGuide | null
    socraticMode?: boolean
    thinkingEffort?: AssistantThinkingEffort
  }) => Promise<void>
```

`onArticleAssistantSearchDone`（434 行）后加：

```ts
  onArticleAssistantReasoningChunk: (cb: (sessionId: string, text: string) => void) => () => void
```

- [ ] **Step 2: preload + facade**

`electron/preload.ts`（`onArticleAssistantSearchDone` block 后）加：

```ts
  onArticleAssistantReasoningChunk: (cb) => {
    const handler = (_: unknown, sessionId: string, text: string) => cb(sessionId, text)
    ipcRenderer.on('articleAssistant:reasoningChunk', handler)
    return () => ipcRenderer.off('articleAssistant:reasoningChunk', handler)
  },
```

`src/lib/ipc.ts`（`get articleAssistantWriteGuide()` 行后）加：

```ts
  get onArticleAssistantReasoningChunk() { return ensure().onArticleAssistantReasoningChunk },
```

- [ ] **Step 3: 主进程 sendMessage 改造**

`electron/ipc/article-assistant.ts`：

1. import 改：

```ts
import { chatNonStream, chatStream, buildChatBody } from '../lib/kimi'
import type { ThinkingConfig } from '../lib/kimi'
```

2. 文件级 helper（`isE2EMock` 后）加：

```ts
function toThinkingConfig(effort?: 'off' | 'high' | 'max'): ThinkingConfig {
  return effort && effort !== 'off' ? { type: 'enabled', reasoning_effort: effort } : { type: 'disabled' }
}
```

3. handler args 类型（299-307 行）加：

```ts
        socraticMode?: boolean
        thinkingEffort?: 'off' | 'high' | 'max'
```

4. mock 分支（316-340 行）整体替换为：

```ts
      if (isE2EMock()) {
        const ctl = new AbortController()
        assistantSessions.set(args.sessionId, ctl)
        try {
          // 走真实装配链并落盘最终请求体，供 E2E 做请求级断言（不改变 mock 推送行为）
          const mockSources = [
            {
              title: 'Constitutional AI（测试来源）',
              url: 'https://arxiv.org/abs/2212.08073',
              snippet: 'Constitutional AI 的原始论文摘要（E2E mock）。',
            },
          ]
          const searchResults = args.useSearch
            ? formatSearchResults(mockSources.map((s) => ({ title: s.title, url: s.url, content: s.snippet })))
            : undefined
          const userPrompt = buildAssistantUserPrompt({
            articleContent: args.articleContent,
            guide: args.guide ?? null,
            selection: args.selection,
            messages: args.messages,
            searchResults,
            socratic: args.socraticMode,
          })
          const requestBody = buildChatBody(cfg, {
            messages: [
              { role: 'system', content: buildAssistantSystemPrompt(args.socraticMode ?? true) },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.7,
            stream: true,
            thinking: toThinkingConfig(args.thinkingEffort),
          })
          fs.writeFileSync(
            path.join(process.env.E2E_CONFIG_DIR as string, 'last-assistant-request.json'),
            JSON.stringify(requestBody, null, 2),
            'utf8'
          )

          if (args.useSearch) {
            send('articleAssistant:searchDone', args.sessionId, { searchSources: mockSources })
          }
          if (args.thinkingEffort && args.thinkingEffort !== 'off') {
            for (const chunk of ['先梳理', '文章结构。']) {
              if (ctl.signal.aborted) return
              send('articleAssistant:reasoningChunk', args.sessionId, chunk)
            }
          }
          for (const chunk of ['这是一段', 'E2E 测试的', '旁注回复。']) {
            if (ctl.signal.aborted) return
            send('llm:chunk', args.sessionId, chunk)
          }
          if (!ctl.signal.aborted) send('llm:done', args.sessionId)
        } finally {
          assistantSessions.delete(args.sessionId)
        }
        return
      }
```

5. 真实路径（375-395 行区块）：`buildAssistantUserPrompt` 调用加 `socratic: args.socraticMode`；system prompt 与 chatStream 改：

```ts
      const llmMessages: Message[] = [
        { role: 'system', content: buildAssistantSystemPrompt(args.socraticMode ?? true) },
        { role: 'user', content: userPrompt },
      ]

      // --- stream ---
      const ctl = new AbortController()
      assistantSessions.set(args.sessionId, ctl)
      try {
        await chatStream(
          cfg,
          { messages: llmMessages, temperature: 0.7, signal: ctl.signal, thinking: toThinkingConfig(args.thinkingEffort) },
          (chunk) => send('llm:chunk', args.sessionId, chunk),
          (reasoning) => send('articleAssistant:reasoningChunk', args.sessionId, reasoning)
        )
        send('llm:done', args.sessionId)
```

- [ ] **Step 4: typecheck + 单测回归**

Run: `npx tsc --noEmit` → 除 Task 1 已知的 ChatWindow 报错外干净
Run: `npx vitest run tests/article-assistant tests/kimi.test.ts` → PASS

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts electron/preload.ts src/lib/ipc.ts electron/ipc/article-assistant.ts
git commit -m "feat(assistant-ipc): socraticMode/thinkingEffort params, reasoningChunk event, E2E mock records assembled request body"
```

---

### Task 5: store + runtime — chunk 批处理、reasoning action、参数传递

**Files:**
- Modify: `src/lib/assistant-session-runtime.ts`（整体重写）
- Modify: `src/store/index.ts`（appendAssistantReasoning、runAssistantStream 传参、abort 清缓冲）
- Test: `tests/assistant-session-runtime.test.ts`（新建）

- [ ] **Step 1: 写失败测试**

Create `tests/assistant-session-runtime.test.ts`:

```ts
import { describe, expect, it, vi, beforeAll, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    onLlmChunk: vi.fn(() => () => {}),
    onLlmDone: vi.fn(() => () => {}),
    onLlmError: vi.fn(() => () => {}),
    onArticleAssistantSearchDone: vi.fn(() => () => {}),
    onArticleAssistantReasoningChunk: vi.fn(() => () => {}),
    articleAssistantWriteSession: vi.fn().mockResolvedValue({ filePath: '/x.assistant.md' }),
    articleAssistantWriteGuide: vi.fn(),
    articleAssistantAbort: vi.fn(),
  },
}))

vi.mock('@/lib/paintings', () => ({
  manifest: [{ id: 'test', painter: 'Test', title: 'Test', url: '/test.jpg' }],
  pickRandom: vi.fn((m: unknown[]) => m[0] ?? null),
}))

import { ipc } from '@/lib/ipc'
import { attachAssistantSessionListeners } from '@/lib/assistant-session-runtime'
import { useStore } from '@/store'
import type { AssistantSession } from '@/store'

function makeSession(overrides: Partial<AssistantSession> = {}): AssistantSession {
  return {
    contextId: '/lib/a.md',
    contextType: 'briefing',
    articleContent: '正文',
    guide: null,
    guideLoading: false,
    guideError: null,
    messages: [{ role: 'assistant', content: '' }],
    streaming: true,
    abortId: 's1',
    searchLoading: false,
    searchError: null,
    chatError: null,
    retryContext: null,
    pendingSelection: undefined,
    isOpen: true,
    activeChunkIndex: null,
    ...overrides,
  }
}

const chunkCb = () => vi.mocked(ipc.onLlmChunk).mock.calls[0][0]
const doneCb = () => vi.mocked(ipc.onLlmDone).mock.calls[0][0]
const reasoningCb = () => vi.mocked(ipc.onArticleAssistantReasoningChunk).mock.calls[0][0]

describe('assistant session runtime', () => {
  beforeAll(() => {
    attachAssistantSessionListeners()
  })

  beforeEach(() => {
    useStore.setState({ assistantSession: makeSession() })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('batches rapid chunks into a single store update per flush window', () => {
    vi.useFakeTimers()
    let updates = 0
    const unsub = useStore.subscribe(() => { updates++ })

    chunkCb()('s1', 'a')
    chunkCb()('s1', 'b')
    chunkCb()('s1', 'c')
    // 未到 flush 窗口，store 尚未更新
    expect(useStore.getState().assistantSession!.messages.at(-1)!.content).toBe('')

    vi.advanceTimersByTime(60)
    expect(useStore.getState().assistantSession!.messages.at(-1)!.content).toBe('abc')
    expect(updates).toBe(1)
    unsub()
  })

  it('flushes immediately on done and finishes streaming', () => {
    vi.useFakeTimers()
    chunkCb()('s1', 'hello')
    doneCb()('s1')
    const s = useStore.getState().assistantSession!
    expect(s.messages.at(-1)!.content).toBe('hello')
    expect(s.streaming).toBe(false)
  })

  it('appends reasoning chunks to the last assistant message', () => {
    vi.useFakeTimers()
    reasoningCb()('s1', '先梳理')
    reasoningCb()('s1', '文章结构。')
    vi.advanceTimersByTime(60)
    expect(useStore.getState().assistantSession!.messages.at(-1)!.reasoning).toBe('先梳理文章结构。')
  })

  it('ignores chunks for a stale abortId', () => {
    vi.useFakeTimers()
    chunkCb()('other-session', 'x')
    vi.advanceTimersByTime(60)
    expect(useStore.getState().assistantSession!.messages.at(-1)!.content).toBe('')
  })

  it('drops buffered text when the stream is aborted', () => {
    vi.useFakeTimers()
    chunkCb()('s1', '残留')
    useStore.getState().abortAssistantStream()
    vi.advanceTimersByTime(120)
    expect(useStore.getState().assistantSession!.messages.at(-1)!.content).toBe('')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/assistant-session-runtime.test.ts`
Expected: FAIL（`onArticleAssistantReasoningChunk` 不在 mock 契约上属类型错 / 批处理不存在——chunk 立即进 store，updates ≠ 1）

- [ ] **Step 3: 重写 runtime**

`src/lib/assistant-session-runtime.ts` 整体替换为：

```ts
import { ipc } from '@/lib/ipc'
import { useStore } from '@/store'
import type { ArticleAssistantErrorCode } from '@shared/index'

let attached = false
let contentBuffer = ''
let reasoningBuffer = ''
let flushTimer: ReturnType<typeof setTimeout> | null = null

const FLUSH_MS = 50

export function resetAssistantStreamBuffers() {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  contentBuffer = ''
  reasoningBuffer = ''
}

function flushBuffers() {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  const state = useStore.getState()
  if (contentBuffer) {
    const text = contentBuffer
    contentBuffer = ''
    state.appendAssistantChunk(text)
  }
  if (reasoningBuffer) {
    const text = reasoningBuffer
    reasoningBuffer = ''
    state.appendAssistantReasoning(text)
  }
}

function scheduleFlush() {
  if (flushTimer) return
  flushTimer = setTimeout(flushBuffers, FLUSH_MS)
}

export function attachAssistantSessionListeners() {
  if (attached) return
  attached = true
  ipc.onLlmChunk((sid, text) => {
    const s = useStore.getState().assistantSession
    if (!s || s.abortId !== sid) return
    contentBuffer += text
    scheduleFlush()
  })
  ipc.onLlmDone((sid) => {
    const s = useStore.getState().assistantSession
    if (!s || s.abortId !== sid) return
    flushBuffers()
    useStore.getState().finishAssistantStreaming()
  })
  ipc.onLlmError((sid, err) => {
    const s = useStore.getState().assistantSession
    if (!s || s.abortId !== sid) return
    flushBuffers()
    const code: ArticleAssistantErrorCode = err.code === 'CHAT_NETWORK_ERROR' ? 'CHAT_NETWORK_ERROR'
      : err.code === 'CHAT_TIMEOUT' ? 'CHAT_TIMEOUT'
      : 'CHAT_LLM_ERROR'
    const cur = useStore.getState().assistantSession
    if (!cur) return
    useStore.setState({ assistantSession: { ...cur, streaming: false, searchLoading: false, chatError: code } })
  })
  ipc.onArticleAssistantReasoningChunk((sid, text) => {
    const s = useStore.getState().assistantSession
    if (!s || s.abortId !== sid) return
    reasoningBuffer += text
    scheduleFlush()
  })
  ipc.onArticleAssistantSearchDone((sid, payload) => {
    useStore.getState().applyAssistantSearchResult(sid, payload)
  })
}
```

- [ ] **Step 4: store 接线**

`src/store/index.ts`：

1. import 加 `import { resetAssistantStreamBuffers } from '@/lib/assistant-session-runtime'`。
   注意循环依赖：runtime import store、store import runtime 的 reset 函数——ESM 循环引用在两者都是函数调用（非模块顶层求值）时安全；若 vitest 报循环依赖错，则把 `resetAssistantStreamBuffers` 移到新文件 `src/lib/assistant-stream-buffers.ts`，runtime 与 store 各自 import。
2. `AppStore` 接口加 `appendAssistantReasoning: (text: string) => void`。
3. 新 action（`appendAssistantChunk` 后）：

```ts
  appendAssistantReasoning: (text) => {
    const s = get().assistantSession
    if (!s || !s.streaming) return
    const last = s.messages.at(-1)
    if (!last || last.role !== 'assistant') return
    const updated = s.messages.slice(0, -1)
    updated.push({ ...last, reasoning: (last.reasoning ?? '') + text })
    set({ assistantSession: { ...s, messages: updated } })
  },
```

4. `runAssistantStream`：开头（`const s = get().assistantSession; if (!s) return` 后）加 `resetAssistantStreamBuffers()`；`articleAssistantSendMessage` 调用加两个字段：

```ts
      await ipc.articleAssistantSendMessage({
        sessionId: abortId,
        articleContent: s.articleContent,
        articleType: s.contextType,
        messages: history,
        selection: s.pendingSelection,
        useSearch,
        guide: s.guide,
        socraticMode: get().assistantSocraticMode,
        thinkingEffort: get().assistantThinkingEffort,
      })
```

5. `abortAssistantStream`（1132-1138 行）改：

```ts
  abortAssistantStream: () => {
    const s = get().assistantSession
    if (!s || !s.streaming) return
    resetAssistantStreamBuffers()
    ipc.articleAssistantAbort({ sessionId: s.abortId })
    set({ assistantSession: { ...s, streaming: false, searchLoading: false } })
    get().saveAssistantSession()
  },
```

- [ ] **Step 5: 跑测试 + 相关回归**

Run: `npx vitest run tests/assistant-session-runtime.test.ts` → 全 PASS
Run: `npx vitest run tests/store-article-assistant.test.ts tests/session-runtime.test.ts` → PASS（若 `store-article-assistant.test.ts` 因 `searchEnabled` 移除报错，删除其会话 fixture 里的 `searchEnabled` 字段）
Run: `npx tsc --noEmit` → 除 ChatWindow 已知报错外干净

- [ ] **Step 6: Commit**

```bash
git add src/lib/assistant-session-runtime.ts src/store/index.ts tests/assistant-session-runtime.test.ts tests/store-article-assistant.test.ts
git commit -m "feat(assistant-runtime): batch stream chunks at 50ms, append reasoning, pass socratic/effort params, reset buffers on abort"
```

---

### Task 6: 会话文件选段持久化

**Files:**
- Modify: `electron/ipc/article-assistant.ts`（writeSession body 拼接 + parseAssistantSessionBody + 新 export serializeAssistantSessionBody）
- Test: `tests/article-assistant/file-io.test.ts`

- [ ] **Step 1: 写失败测试**

`tests/article-assistant/file-io.test.ts` 末尾追加（import 行加 `serializeAssistantSessionBody`）：

```ts
import { parseAssistantSessionBody, serializeAssistantSessionBody } from '@electron/ipc/article-assistant'

describe('assistant session selection persistence', () => {
  it('serializes a user selection as a quote line before the content', () => {
    const out = serializeAssistantSessionBody([
      { role: 'user', content: '这段什么意思？', selection: '原文中的一段话' },
    ])
    expect(out).toContain('## 用户')
    expect(out).toContain('> 选段：原文中的一段话')
    expect(out.indexOf('> 选段：')).toBeLessThan(out.indexOf('这段什么意思？'))
  })

  it('flattens multi-line selections into one line', () => {
    const out = serializeAssistantSessionBody([
      { role: 'user', content: '问', selection: '第一行\n第二行' },
    ])
    expect(out).toContain('> 选段：第一行 第二行')
  })

  it('round-trips messages with selections through frontmatter serialize/parse', () => {
    const messages: ArticleAssistantMessage[] = [
      { role: 'user', content: '这段什么意思？', selection: '原文中的一段话' },
      { role: 'assistant', content: '这是对选段的解释。' },
    ]
    const raw = serializeFrontmatter(
      'article-assistant',
      { title: '旁注记录', created: '2026-07-19T00:00:00.000Z', tags: [] },
      serializeAssistantSessionBody(messages)
    )
    const { body } = parseFrontmatter(raw, { filename: 'x.assistant.md' })
    expect(parseAssistantSessionBody(body)).toEqual(messages)
  })

  it('parses legacy sessions without selection lines (selection undefined)', () => {
    const body = ['## 用户', '', '旧消息', '', '## 助手', '', '旧回复', ''].join('\n')
    expect(parseAssistantSessionBody(body)).toEqual([
      { role: 'user', content: '旧消息', selection: undefined },
      { role: 'assistant', content: '旧回复' },
    ])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/article-assistant/file-io.test.ts`
Expected: FAIL（`serializeAssistantSessionBody` 未导出）

- [ ] **Step 3: 实现**

`electron/ipc/article-assistant.ts`：

1. 新 export 函数（`parseAssistantSessionBody` 前）：

```ts
export function serializeAssistantSessionBody(messages: ArticleAssistantMessage[]): string {
  return messages
    .map((m) => {
      const selLine =
        m.role === 'user' && m.selection?.trim()
          ? `> 选段：${m.selection.trim().replace(/\s*\n\s*/g, ' ')}\n\n`
          : ''
      return `## ${m.role === 'user' ? '用户' : '助手'}\n\n${selLine}${m.content}\n`
    })
    .join('\n')
}
```

2. `parseAssistantSessionBody`（137-148 行）替换为：

```ts
export function parseAssistantSessionBody(body: string): ArticleAssistantMessage[] {
  const messages: ArticleAssistantMessage[] = []
  const sections = body.split(/^## /m).slice(1)
  for (const section of sections) {
    const nl = section.indexOf('\n')
    const heading = (nl === -1 ? section : section.slice(0, nl)).trim()
    let content = (nl === -1 ? '' : section.slice(nl + 1)).trim()
    if (heading.startsWith('用户')) {
      let selection: string | undefined
      if (content.startsWith('> 选段：')) {
        const lineEnd = content.indexOf('\n')
        selection = content.slice('> 选段：'.length, lineEnd === -1 ? undefined : lineEnd).trim()
        content = (lineEnd === -1 ? '' : content.slice(lineEnd + 1)).trim()
      }
      messages.push({ role: 'user', content, selection })
    } else if (heading.startsWith('助手')) {
      messages.push({ role: 'assistant', content })
    }
  }
  return messages
}
```

3. `writeSession` handler 里的 body 拼接（230-232 行）改为：

```ts
      const body = serializeAssistantSessionBody(args.messages)
```

- [ ] **Step 4: 跑测试**

Run: `npx vitest run tests/article-assistant/file-io.test.ts` → 全 PASS

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/article-assistant.ts tests/article-assistant/file-io.test.ts
git commit -m "feat(assistant-session-file): persist per-message selection as quote line, backward-compatible parsing"
```

---

### Task 7: 「历史不显示」bug — E2E 复现 → 诊断 → 修复

**Files:**
- Test: `e2e/specs/article-assistant-controls.spec.ts`（新建，本任务先只放复现测试）
- Modify: `electron/ipc/article-assistant.ts`（readSession 可观测性）
- 视诊断结果 Modify: `src/store/index.ts` 或 `electron/ipc/article-assistant.ts`

**背景：** 静态排查已排除 `parseFrontmatter`（对 article-assistant 宽松、不 throw）与 `parseAssistantSessionBody` 格式问题（Task 6 round-trip 测试证明无损）。剩余嫌疑按可能性：① `readSession` 的 `catch { return null }` 静默吞掉未知错误；② `loadAssistantSession` 的 `cur.messages.length === 0` 守卫与异步加载的竞态；③ 用户在 dev 与打包版之间切换导致学习库路径不同（`.assistant.md` 写在另一个库里，非代码 bug）。

- [ ] **Step 1: 加可观测性（直接提交）**

`electron/ipc/article-assistant.ts` 的 `articleAssistant:readSession` handler，catch 改：

```ts
      } catch (err) {
        console.warn('[article-assistant] readSession failed for', sessionPath, err)
        return null
      }
```

- [ ] **Step 2: 写 E2E 复现测试**

Create `e2e/specs/article-assistant-controls.spec.ts`（`openDigestArticle` helper 从 `article-assistant.spec.ts` 复制——两文件都需用它时不抽公共模块，重复可接受）：

```ts
import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { ArticleAssistantPage } from '../pages/ArticleAssistantPage'
import { SELECTORS } from '../helpers/selectors'
import { seedBriefing } from '../helpers/test-library'
import type { Page } from '@playwright/test'

function localToday(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

async function openDigestArticle(window: Page, libPath: string): Promise<ArticleAssistantPage> {
  const today = localToday()
  seedBriefing(libPath, today)
  const cover = new CoverPage(window)
  await cover.enterName('E2E 测试员')
  await cover.goToBriefing()
  await window.locator(SELECTORS.briefing.receiveDigestButton).click()
  await expect(window.locator(SELECTORS.briefing.academicLayout)).toBeVisible({ timeout: 15000 })
  const assistant = new ArticleAssistantPage(window)
  await assistant.waitForMounted()
  return assistant
}

test.describe('@p1 article assistant history', () => {
  test('二次打开文章时显示之前的旁注对话', async ({ window, testLibraryPath }) => {
    const assistant = await openDigestArticle(window, testLibraryPath)
    await assistant.openChat()
    await assistant.typeQuestion('What is Constitutional AI?')
    await assistant.send()
    await assistant.waitForAssistantReply()
    await expect(assistant.chatWindow).toContainText('E2E 测试的')

    // 重新加载渲染进程（state/session 走磁盘），重新进入文章
    await window.reload()
    const assistant2 = await openDigestArticle(window, testLibraryPath)
    await assistant2.openChat()
    await expect(assistant2.chatWindow).toContainText('What is Constitutional AI?', { timeout: 15000 })
    await expect(assistant2.chatWindow).toContainText('E2E 测试的')
  })
})
```

注意：reload 后 cover 页行为取决于已存 profile——若 `enterName` 在已有名字时流程不同（如有「继续」按钮），按 `CoverPage` POM 现有能力调整（先跑，红了再看 POM）。

- [ ] **Step 3: 跑复现测试**

Run: `npx playwright test --config e2e/playwright.config.ts e2e/specs/article-assistant-controls.spec.ts`
- 若 PASS → bug 已被前序任务（或本任务 Step 1 之前不存在的路径）覆盖不到/已修，保留此回归测试，跳到 Step 5。
- 若 FAIL → 看主进程日志里 Step 1 加的 `console.warn`（fixture 会 pipe 主进程 stdout 到 testInfo 输出）。

- [ ] **Step 4: 按诊断修复**

- 若日志显示 readSession 抛错 → 按错误修读取路径。
- 若无日志、文件存在、但 UI 为空 → 是 store 竞态：将 `openAssistantSession` 改为等历史加载落地后再标记可用。具体修法（`src/store/index.ts`）：`loadAssistantSession` 的守卫保留 `contextId` 校验，同时在 `openAssistantSession` 里把 `get().loadAssistantSession()` 改为 `await` 语义的 fire-and-forget 不变，但给 `sendAssistantMessage` 加守卫：

```ts
  sendAssistantMessage: async (text) => {
    const s = get().assistantSession
    if (!s || s.streaming || s.searchLoading) return
    // 历史仍在加载时先等其落地，避免 load 的 messages.length===0 守卫丢弃历史
    await get().loadAssistantSessionPromise?.()
    ...
```

不新增字段的替代（推荐）：store 模块级加一个 `let historyLoadPromise: Promise<void> | null = null`；`openAssistantSession` 里 `historyLoadPromise = get().loadAssistantSession()`；`sendAssistantMessage` 开头 `await historyLoadPromise`。改完重跑 Step 3 确认 PASS。

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/article-assistant.ts e2e/specs/article-assistant-controls.spec.ts src/store/index.ts
git commit -m "fix(assistant): surface readSession errors and restore chat history on article reopen (E2E regression)"
```

---

### Task 8: ChatWindow 三开关 UI + 旧测试更新

**Files:**
- Modify: `src/components/article-assistant/ChatWindow.tsx`（输入栏 + store 订阅）
- Test: `tests/article-assistant/ChatWindow.test.tsx`（适配新契约）

- [ ] **Step 1: 更新组件测试为失败状态**

`tests/article-assistant/ChatWindow.test.tsx`：

1. `actions` 加：

```ts
  toggleAssistantSocratic: vi.fn(),
  cycleAssistantThinkingEffort: vi.fn(),
  setAssistantSelection: vi.fn(),
```

2. `baseSession` 删除 `searchEnabled: false,` 行。
3. `mockStore` 的 `fullState` 改：

```ts
  const fullState = {
    assistantSession: session,
    assistantSearchEnabled: false,
    assistantSocraticMode: true,
    assistantThinkingEffort: 'off',
    ...actions,
  }
```

   并让 mockStore 接受可选 overrides：`function mockStore(session: AssistantSession | null, globals: Record<string, unknown> = {})`，`const fullState = { ...默认值, ...globals, ...actions }`。
4. 两个 ember 测试替换：

```ts
  it('renders search button in off state with gray color', () => {
    mockStore(baseSession(), { assistantSearchEnabled: false })
    render(<ChatWindow />)
    const btn = screen.getByTestId('article-assistant-search-btn')
    expect(btn.className).toContain('text-parchment/40')
    expect(btn.className).not.toContain('text-sky-400')
  })

  it('renders search button in on state with blue color', () => {
    mockStore(baseSession(), { assistantSearchEnabled: true })
    render(<ChatWindow />)
    const btn = screen.getByTestId('article-assistant-search-btn')
    expect(btn.className).toContain('text-sky-400')
  })
```

5. `'keeps the search button enabled while streaming'` 改为：

```ts
  it('disables all three toggle buttons while streaming', () => {
    mockStore(baseSession({ streaming: true }))
    render(<ChatWindow />)
    expect(screen.getByTestId('article-assistant-search-btn')).toBeDisabled()
    expect(screen.getByTestId('article-assistant-socratic-btn')).toBeDisabled()
    expect(screen.getByTestId('article-assistant-thinking-btn')).toBeDisabled()
  })
```

6. `'sending uses the current searchEnabled state'` 改：

```ts
  it('sending delegates search state to the store (single-argument send)', () => {
    mockStore(baseSession(), { assistantSearchEnabled: true })
    render(<ChatWindow />)
    fireEvent.change(screen.getByTestId('article-assistant-input'), { target: { value: '问题' } })
    fireEvent.click(screen.getByTestId('article-assistant-send-btn'))
    expect(actions.sendAssistantMessage).toHaveBeenCalledWith('问题')
  })
```

7. 追加三开关测试：

```ts
  it('reflects socratic and thinking global state and calls their actions', () => {
    mockStore(baseSession(), { assistantSocraticMode: false, assistantThinkingEffort: 'max' })
    render(<ChatWindow />)
    const socratic = screen.getByTestId('article-assistant-socratic-btn')
    const thinking = screen.getByTestId('article-assistant-thinking-btn')
    expect(socratic).toHaveAttribute('aria-pressed', 'false')
    expect(socratic.className).toContain('text-parchment/40')
    expect(thinking.className).toContain('text-sky-400')
    expect(thinking.textContent).toContain('MAX')

    fireEvent.click(socratic)
    expect(actions.toggleAssistantSocratic).toHaveBeenCalledTimes(1)
    fireEvent.click(thinking)
    expect(actions.cycleAssistantThinkingEffort).toHaveBeenCalledTimes(1)
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/article-assistant/ChatWindow.test.tsx`
Expected: FAIL（新 testid 不存在 / 旧 class 断言不符）

- [ ] **Step 3: 实现 ChatWindow 输入栏**

`src/components/article-assistant/ChatWindow.tsx`：

1. store 订阅改为（删除 `toggleAssistantSearch` 旧订阅、`session.searchEnabled` 使用）：

```tsx
  const searchEnabled = useStore((s) => s.assistantSearchEnabled)
  const socraticMode = useStore((s) => s.assistantSocraticMode)
  const thinkingEffort = useStore((s) => s.assistantThinkingEffort)
  const toggleAssistantSearch = useStore((s) => s.toggleAssistantSearch)
  const toggleAssistantSocratic = useStore((s) => s.toggleAssistantSocratic)
  const cycleAssistantThinkingEffort = useStore((s) => s.cycleAssistantThinkingEffort)
```

2. `handleSend` 里 `sendAssistantMessage(text, session.searchEnabled)` 改为 `sendAssistantMessage(text)`。
3. 输入栏（原搜索按钮位置，149-164 行）替换为：

```tsx
      <div className="p-2 border-t border-parchment/10 flex items-center gap-1.5 shrink-0">
        <button
          data-testid="article-assistant-search-btn"
          className={`px-1.5 py-1 rounded text-sm transition-colors duration-200 disabled:opacity-30 disabled:cursor-not-allowed ${
            searchEnabled ? 'text-sky-400' : 'text-parchment/40 hover:text-parchment/70'
          }`}
          onClick={toggleAssistantSearch}
          disabled={session.streaming || session.searchLoading}
          aria-pressed={searchEnabled}
          aria-label={searchEnabled ? '搜索已开启' : '搜索已关闭'}
          title={searchEnabled ? '搜索已开启 — 发送时将联网搜索' : '搜索已关闭 — 点击开启联网搜索'}
        >
          {session.searchLoading ? (
            <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin align-middle" />
          ) : (
            '🔍'
          )}
        </button>
        <button
          data-testid="article-assistant-socratic-btn"
          className={`px-1.5 py-1 rounded text-sm transition-colors duration-200 disabled:opacity-30 disabled:cursor-not-allowed ${
            socraticMode ? 'text-sky-400' : 'text-parchment/40 hover:text-parchment/70'
          }`}
          onClick={toggleAssistantSocratic}
          disabled={session.streaming || session.searchLoading}
          aria-pressed={socraticMode}
          aria-label={socraticMode ? '苏格拉底模式已开启' : '苏格拉底模式已关闭'}
          title="苏格拉底学习模式：关闭后只做信息检索，不再质询"
        >
          🎓
        </button>
        <button
          data-testid="article-assistant-thinking-btn"
          className={`relative px-1.5 py-1 rounded text-sm transition-colors duration-200 disabled:opacity-30 disabled:cursor-not-allowed ${
            thinkingEffort !== 'off' ? 'text-sky-400' : 'text-parchment/40 hover:text-parchment/70'
          }`}
          onClick={cycleAssistantThinkingEffort}
          disabled={session.streaming || session.searchLoading}
          aria-label={`深度思考：${thinkingEffort === 'off' ? '关闭' : thinkingEffort === 'high' ? '高' : '最高'}`}
          title={`深度思考：${thinkingEffort === 'off' ? '关闭' : thinkingEffort === 'high' ? '高' : '最高（MAX）'} — 点击切换`}
        >
          🧠
          {thinkingEffort === 'max' && (
            <span className="absolute -top-1 -right-1 text-[8px] leading-none font-bold">MAX</span>
          )}
        </button>
```

- [ ] **Step 4: 跑测试**

Run: `npx vitest run tests/article-assistant/ChatWindow.test.tsx` → 全 PASS
Run: `npx tsc --noEmit` → 干净（Task 1 的已知报错应全部消失）

- [ ] **Step 5: Commit**

```bash
git add src/components/article-assistant/ChatWindow.tsx tests/article-assistant/ChatWindow.test.tsx
git commit -m "feat(assistant-ui): three toggle controls (search/socratic/thinking) with gray-to-blue icon transitions"
```

---

### Task 9: 消息列表重构 — 两侧布局、历史选段、思考区块、选中块下移+✕

**Files:**
- Create: `src/components/article-assistant/ChatMessageList.tsx`
- Modify: `src/components/article-assistant/ChatWindow.tsx`（消息区 + pendingSelection 块）
- Test: `tests/article-assistant/ChatWindow.test.tsx`

- [ ] **Step 1: 写失败测试（追加到 ChatWindow.test.tsx）**

```ts
  it('lays out user messages right-aligned and assistant messages left-aligned', () => {
    mockStore(
      baseSession({
        messages: [
          { role: 'user', content: '我的问题' },
          { role: 'assistant', content: '我的回答' },
        ],
      })
    )
    render(<ChatWindow />)
    const messages = screen.getAllByTestId('chat-message')
    expect(messages[0].dataset.role).toBe('user')
    expect(messages[0].className).toContain('justify-end')
    expect(messages[1].dataset.role).toBe('assistant')
    expect(messages[1].className).toContain('justify-start')
  })

  it('shows the historical selection inside a user message with muted styling', () => {
    mockStore(
      baseSession({
        messages: [{ role: 'user', content: '问', selection: '当时选的一段' }],
      })
    )
    render(<ChatWindow />)
    const sel = screen.getByTestId('chat-message-selection')
    expect(sel).toHaveTextContent('当时选的一段')
    expect(sel.className).toContain('border-parchment/40')
    expect(sel.className).not.toContain('border-ember')
  })

  it('renders reasoning in a collapsible block above the assistant content', () => {
    mockStore(
      baseSession({
        messages: [{ role: 'assistant', content: '最终答案', reasoning: '思考内容' }],
      })
    )
    render(<ChatWindow />)
    const block = screen.getByTestId('reasoning-block')
    expect(block).toHaveTextContent('思考内容')
    expect(block.tagName.toLowerCase()).toBe('details')
  })

  it('clears the pending selection via the cancel button', () => {
    mockStore(baseSession({ pendingSelection: 'selected text' }))
    render(<ChatWindow />)
    fireEvent.click(screen.getByTestId('selection-cancel-btn'))
    expect(actions.setAssistantSelection).toHaveBeenCalledWith('')
  })
```

同时把旧测试 `'renders the chat window and selection quote block when open with a pending selection'` 的断言改为查 `pending-selection` testid：

```ts
    expect(screen.getByTestId('pending-selection')).toHaveTextContent('selected text')
    expect(screen.getByTestId('pending-selection')).toHaveTextContent('你选中了：')
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/article-assistant/ChatWindow.test.tsx`
Expected: FAIL（新 testid 不存在）

- [ ] **Step 3: 新建 ChatMessageList 组件**

Create `src/components/article-assistant/ChatMessageList.tsx`（ui-styling §10：只导出组件）：

```tsx
import { memo } from 'react'
import type { ArticleAssistantMessage } from '@shared/index'

interface Props {
  messages: ArticleAssistantMessage[]
  streaming: boolean
}

export const ChatMessageList = memo(function ChatMessageList({ messages, streaming }: Props) {
  return (
    <>
      {messages.map((m, i) => (
        <div
          key={i}
          data-testid="chat-message"
          data-role={m.role}
          className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={`max-w-[85%] leading-relaxed whitespace-pre-wrap rounded px-2 py-1 ${
              m.role === 'user' ? 'bg-ember/10 text-parchment/80' : 'text-parchment/90'
            }`}
          >
            {m.role === 'user' && m.selection && (
              <div
                data-testid="chat-message-selection"
                className="text-xs border-l-2 border-parchment/40 bg-parchment/5 p-1.5 mb-1 text-parchment/60 rounded-r"
              >
                "{m.selection}"
              </div>
            )}
            {m.role === 'assistant' && m.reasoning && (
              <details
                data-testid="reasoning-block"
                open={streaming && i === messages.length - 1}
                className="mb-1"
              >
                <summary className="text-[11px] text-parchment/40 cursor-pointer select-none">思考过程</summary>
                <div className="text-xs text-parchment/50 whitespace-pre-wrap mt-1">{m.reasoning}</div>
              </details>
            )}
            {m.content || (m.role === 'assistant' && streaming ? '…' : '')}
            {m.searchSources && m.searchSources.length > 0 && (
              <div className="text-[11px] text-parchment/50 mt-1">已搜索 {m.searchSources.length} 个来源</div>
            )}
          </div>
        </div>
      ))}
    </>
  )
})
```

- [ ] **Step 4: 改 ChatWindow 消息区与 pendingSelection 块**

`src/components/article-assistant/ChatWindow.tsx`：

1. import 加 `import { ChatMessageList } from './ChatMessageList'`；store 订阅加 `const setAssistantSelection = useStore((s) => s.setAssistantSelection)`。
2. 消息区（98-146 行）替换为：

```tsx
      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 text-sm">
        {!hasMessages && (
          <div className="text-parchment/40 text-xs text-center mt-8">
            选中文章内容后点击旁注 tab，或直接输入问题
          </div>
        )}

        <ChatMessageList messages={session.messages} streaming={session.streaming} />

        {session.streaming && !session.searchLoading && (
          <div className="text-xs text-parchment/50 animate-pulse">思考中…</div>
        )}
        {session.searchLoading && session.streaming && (
          <div className="text-xs text-parchment/50 animate-pulse">搜索并思考中…</div>
        )}

        {showError && (
          <div className="text-xs text-ember/80">
            回复失败
            <button
              className="ml-2 underline hover:text-ember"
              onClick={() => retryAssistantMessage()}
            >
              重试
            </button>
          </div>
        )}
      </div>

      {/* Pending selection chip — 挂在历史对话下方、输入框上方 */}
      {session.pendingSelection && (
        <div
          data-testid="pending-selection"
          className="relative mx-2 mb-1 text-xs border-l-2 border-ember bg-ember/10 p-2 pr-6 text-parchment/80 rounded-r shrink-0"
        >
          <div className="opacity-60 mb-1">你选中了：</div>
          "{session.pendingSelection}"
          <button
            data-testid="selection-cancel-btn"
            aria-label="取消选中"
            className="absolute top-1 right-1 text-parchment/50 hover:text-ember leading-none"
            onClick={() => setAssistantSelection('')}
          >
            ✕
          </button>
        </div>
      )}
```

3. 删除原消息区内联的 pendingSelection 块与 messages.map 渲染；`hasMessages`/`lastMsg`/`showError` 逻辑保留。

- [ ] **Step 5: 跑测试**

Run: `npx vitest run tests/article-assistant/ChatWindow.test.tsx` → 全 PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/article-assistant/ChatMessageList.tsx src/components/article-assistant/ChatWindow.tsx tests/article-assistant/ChatWindow.test.tsx
git commit -m "feat(assistant-ui): chatbot two-sided message list, per-message selection quote, collapsible reasoning, movable pending-selection chip with cancel"
```

---

### Task 10: 性能收尾 — 收窄订阅 + transform 拖拽

**Files:**
- Modify: `src/components/article-assistant/GuideSidebar.tsx`
- Modify: `src/components/article-assistant/ArticleAssistantPanel.tsx`
- Modify: `src/components/article-assistant/ChatWindow.tsx`（handleDragStart）
- Test: `tests/article-assistant/ChatWindow.test.tsx`（拖拽测试更新）

- [ ] **Step 1: 收窄 GuideSidebar 订阅**

`src/components/article-assistant/GuideSidebar.tsx` 的三个订阅改为：

```tsx
  const guide = useStore((s) => s.assistantSession?.guide ?? null)
  const guideLoading = useStore((s) => s.assistantSession?.guideLoading ?? false)
  const guideError = useStore((s) => s.assistantSession?.guideError ?? null)
  const activeChunkIndex = useStore((s) => s.assistantSession?.activeChunkIndex ?? null)
  const setAssistantActiveChunk = useStore((s) => s.setAssistantActiveChunk)
```

组件体内 `session.guideLoading` → `guideLoading`、`session.guideError` → `guideError`、`session.guide` → `guide`；`if (!session) return null` 删除（guide 为 null 时各分支自然不渲染）。原理：`appendAssistantChunk` 浅拷贝 session 时 `guide` 引用不变，selector 返回同引用 → 流式期间不再重渲导读。

- [ ] **Step 2: 收窄 ArticleAssistantPanel 订阅**

`src/components/article-assistant/ArticleAssistantPanel.tsx`：

```tsx
  const contextId = useStore((s) => s.assistantSession?.contextId ?? null)
  const isOpen = useStore((s) => s.assistantSession?.isOpen ?? false)
  const hasPendingSelection = useStore((s) => !!s.assistantSession?.pendingSelection)
```

useEffect 里 `if (prev && session)` 改用 `useStore.getState().assistantSession`；底部 guard `if (!session || session.contextId !== parentPath) return null` 改 `if (!contextId || contextId !== parentPath) return null`；tab 按钮的 `session.isOpen` → `isOpen`、`session.pendingSelection` → `hasPendingSelection`。

- [ ] **Step 3: ChatWindow 拖拽改 transform（含视口 clamp）**

`src/components/article-assistant/ChatWindow.tsx` 的 `handleDragStart` 替换为：

```tsx
  const handleDragStart = (e: React.PointerEvent) => {
    const el = (e.target as HTMLElement).closest('[data-chat-window]') as HTMLElement | null
    if (!el) return
    const rect = el.getBoundingClientRect()
    dragging.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: rect.left,
      originY: rect.top,
    }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)

    // 拖拽期间只写 transform（不触发 React 重渲），松手时一次性提交 left/top。
    // clamp：标题栏不拖出视口（上 0 / 下 innerHeight-40 / 左右各留 80px 抓取区）。
    const clampPos = (x: number, y: number) => ({
      x: Math.max(-(rect.width - 80), Math.min(x, window.innerWidth - 80)),
      y: Math.max(0, Math.min(y, window.innerHeight - 40)),
    })
    const onMove = (ev: PointerEvent) => {
      if (!dragging.current) return
      const p = clampPos(
        dragging.current.originX + (ev.clientX - dragging.current.startX),
        dragging.current.originY + (ev.clientY - dragging.current.startY)
      )
      el.style.transform = `translate(${p.x - dragging.current.originX}px, ${p.y - dragging.current.originY}px)`
    }
    const onUp = (ev: PointerEvent) => {
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (dragging.current) {
        const p = clampPos(
          dragging.current.originX + (ev.clientX - dragging.current.startX),
          dragging.current.originY + (ev.clientY - dragging.current.startY)
        )
        el.style.transform = ''
        setPosition({ x: p.x, y: p.y })
      }
      dragging.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }
```

- [ ] **Step 4: 更新拖拽测试**

`tests/article-assistant/ChatWindow.test.tsx` 的 `'clamps dragging so the title bar drag handle never leaves the viewport'` 替换为：

```ts
  it('moves via transform during drag and commits clamped left/top on pointerup', () => {
    mockStore(baseSession())
    const { container } = render(<ChatWindow />)
    const win = screen.getByTestId('article-assistant-chat-window')
    vi.spyOn(win, 'getBoundingClientRect').mockReturnValue({
      left: 400, top: 300, width: 340, height: 260,
      right: 740, bottom: 560, x: 400, y: 300, toJSON: () => ({}),
    } as DOMRect)
    const titleBar = container.querySelector('.cursor-move') as HTMLElement
    titleBar.setPointerCapture = vi.fn()
    titleBar.releasePointerCapture = vi.fn()

    fireEvent.pointerDown(titleBar, { clientX: 420, clientY: 320, pointerId: 1 })

    // 拖出视口顶部：originY=300, rawY = 300 + (-100-320) = -120 → clamp y=0 → translate dy=-300
    fireEvent.pointerMove(window, { clientX: 420, clientY: -100 })
    expect(win.style.transform).toBe('translate(0px, -300px)')
    expect(win.style.top).toBe('') // 拖拽中不提交 left/top

    fireEvent.pointerUp(window, { clientX: 420, clientY: -100 })
    expect(win.style.transform).toBe('')
    expect(win.style.top).toBe('0px')
    expect(win.style.left).toBe('400px')
  })
```

- [ ] **Step 5: 跑测试 + 回归**

Run: `npx vitest run tests/article-assistant tests/GuideSidebar.test.tsx tests/ArticleBodyChunks.test.tsx` → 全 PASS（GuideSidebar 测试用 `setState({ assistantSession: session })`，收窄后 selector 仍命中同对象，应无回归）

- [ ] **Step 6: Commit**

```bash
git add src/components/article-assistant/GuideSidebar.tsx src/components/article-assistant/ArticleAssistantPanel.tsx src/components/article-assistant/ChatWindow.tsx tests/article-assistant/ChatWindow.test.tsx
git commit -m "perf(assistant): narrow store subscriptions, transform-based drag to stop per-token/per-frame re-renders"
```

---

### Task 11: E2E 套件 — 请求级断言 + 交互断言

**Files:**
- Modify: `e2e/helpers/selectors.ts:82-95`（articleAssistant 区块）
- Modify: `e2e/pages/ArticleAssistantPage.ts`
- Modify: `e2e/specs/article-assistant.spec.ts`（旧搜索按钮测试更新）
- Modify: `e2e/specs/article-assistant-controls.spec.ts`（Task 7 已建，本任务扩充）
- Modify: `e2e/README.md`（新 spec + mock 策略说明）

- [ ] **Step 1: selectors + POM**

`e2e/helpers/selectors.ts` 的 `articleAssistant` 区块加：

```ts
    socraticBtn: '[data-testid="article-assistant-socratic-btn"]',
    thinkingBtn: '[data-testid="article-assistant-thinking-btn"]',
    pendingSelection: '[data-testid="pending-selection"]',
    selectionCancelBtn: '[data-testid="selection-cancel-btn"]',
    chatMessage: '[data-testid="chat-message"]',
    chatMessageSelection: '[data-testid="chat-message-selection"]',
    reasoningBlock: '[data-testid="reasoning-block"]',
```

`e2e/pages/ArticleAssistantPage.ts` 加（constructor 里绑定 + 方法）：

```ts
  readonly socraticBtn: Locator
  readonly thinkingBtn: Locator
  readonly pendingSelection: Locator
  readonly selectionCancelBtn: Locator
  readonly chatMessages: Locator
  readonly reasoningBlock: Locator
```

```ts
    this.socraticBtn = page.locator(SELECTORS.articleAssistant.socraticBtn)
    this.thinkingBtn = page.locator(SELECTORS.articleAssistant.thinkingBtn)
    this.pendingSelection = page.locator(SELECTORS.articleAssistant.pendingSelection)
    this.selectionCancelBtn = page.locator(SELECTORS.articleAssistant.selectionCancelBtn)
    this.chatMessages = page.locator(SELECTORS.articleAssistant.chatMessage)
    this.reasoningBlock = page.locator(SELECTORS.articleAssistant.reasoningBlock)
```

方法：

```ts
  async clickSocratic() { await this.socraticBtn.click() }
  async clickThinking() { await this.thinkingBtn.click() }

  /** 从默认 off 起，把深度思考循环到目标档位 */
  async setThinkingEffort(target: 'off' | 'high' | 'max') {
    const clicks = { off: 0, high: 1, max: 2 }[target]
    for (let i = 0; i < clicks; i++) await this.clickThinking()
  }

  async cancelSelection() { await this.selectionCancelBtn.click() }
```

- [ ] **Step 2: 更新旧搜索按钮测试**

`e2e/specs/article-assistant.spec.ts` 的 `'搜索按钮为持久开关，点击不发送消息'`：把三处 `toHaveClass(/bg-ember/)` / `not.toHaveClass(/bg-ember/)` 断言改为颜色断言：

```ts
    // 关闭态：灰色
    await expect(assistant.searchBtn).toHaveCSS('color', 'rgba(232, 213, 183, 0.4)')
    // 开启态：蓝色
    await expect(assistant.searchBtn).toHaveCSS('color', 'rgb(56, 189, 248)')
```

（`text-parchment/40` = parchment #e8d5b7 @ 40% → `rgba(232, 213, 183, 0.4)`；`text-sky-400` → `rgb(56, 189, 248)`。若 Tailwind 计算值有出入，先跑拿到 actual 再校正。）

- [ ] **Step 3: 请求级断言测试**

`e2e/specs/article-assistant-controls.spec.ts` 顶部 import 加 `import * as fs from 'node:fs'`、`import * as path from 'node:path'`，并加 helper：

```ts
function readLastRequest(configDir: string): any {
  const p = path.join(configDir, 'last-assistant-request.json')
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

async function sendAndWait(assistant: ArticleAssistantPage, q: string) {
  await assistant.typeQuestion(q)
  await assistant.send()
  await assistant.waitForAssistantReply()
}
```

新 describe（fixture 每测试独立 configDir，开关均为默认：搜索关/苏格拉底开/思考关）：

```ts
test.describe('@p1 article assistant request contract', () => {
  test('默认：system 含苏格拉底提示词，thinking disabled 且无 reasoning_effort', async ({ window, testLibraryPath, testConfigDir }) => {
    const assistant = await openDigestArticle(window, testLibraryPath)
    await assistant.openChat()
    await sendAndWait(assistant, 'Q1')
    const req = readLastRequest(testConfigDir)
    expect(req.messages[0].role).toBe('system')
    expect(req.messages[0].content).toContain('苏格拉底')
    expect(req.thinking).toEqual({ type: 'disabled' })
    expect(req.reasoning_effort).toBeUndefined()
  })

  test('苏格拉底关：system 不含质询措辞、含直接回答', async ({ window, testLibraryPath, testConfigDir }) => {
    const assistant = await openDigestArticle(window, testLibraryPath)
    await assistant.openChat()
    await assistant.clickSocratic()
    await sendAndWait(assistant, 'Q1')
    const req = readLastRequest(testConfigDir)
    expect(req.messages[0].content).not.toContain('苏格拉底')
    expect(req.messages[0].content).toContain('直接')
  })

  test('深度思考 high/max 传对应 reasoning_effort', async ({ window, testLibraryPath, testConfigDir }) => {
    const assistant = await openDigestArticle(window, testLibraryPath)
    await assistant.openChat()
    await assistant.setThinkingEffort('high')
    await sendAndWait(assistant, 'Q1')
    let req = readLastRequest(testConfigDir)
    expect(req.thinking).toEqual({ type: 'enabled' })
    expect(req.reasoning_effort).toBe('high')

    await assistant.clickThinking() // high → max
    await sendAndWait(assistant, 'Q2')
    req = readLastRequest(testConfigDir)
    expect(req.reasoning_effort).toBe('max')
  })

  test('第二轮请求的历史对话段包含第一轮内容', async ({ window, testLibraryPath, testConfigDir }) => {
    const assistant = await openDigestArticle(window, testLibraryPath)
    await assistant.openChat()
    await sendAndWait(assistant, '第一问标记')
    await sendAndWait(assistant, '第二问')
    const req = readLastRequest(testConfigDir)
    expect(req.messages[1].content).toContain('历史对话')
    expect(req.messages[1].content).toContain('第一问标记')
  })

  test('搜索开：user prompt 含网络搜索结果段', async ({ window, testLibraryPath, testConfigDir }) => {
    const assistant = await openDigestArticle(window, testLibraryPath)
    await assistant.openChat()
    await assistant.clickSearch()
    await sendAndWait(assistant, 'Q1')
    const req = readLastRequest(testConfigDir)
    expect(req.messages[1].content).toContain('网络搜索结果')
    expect(req.messages[1].content).toContain('Constitutional AI（测试来源）')
  })

  test('preload 暴露 reasoningChunk 监听（IPC 契约探测）', async ({ window, testLibraryPath }) => {
    await openDigestArticle(window, testLibraryPath)
    const t = await window.evaluate(() => typeof (window as any).api?.onArticleAssistantReasoningChunk)
    expect(t).toBe('function')
  })
})
```

- [ ] **Step 4: 交互断言测试**

同文件追加：

```ts
test.describe('@p1 article assistant controls UI', () => {
  test('三开关状态持久化：写入 state.json 且 reload 后保持', async ({ window, testLibraryPath, testConfigDir }) => {
    const assistant = await openDigestArticle(window, testLibraryPath)
    await assistant.openChat()
    await assistant.clickSearch()
    await assistant.clickSocratic() // 关
    await assistant.setThinkingEffort('max')

    await expect.poll(() => {
      const s = JSON.parse(fs.readFileSync(path.join(testConfigDir, 'state.json'), 'utf8'))
      return [s.assistantSearchEnabled, s.assistantSocraticMode, s.assistantThinkingEffort]
    }).toEqual([true, false, 'max'])

    await window.reload()
    const assistant2 = await openDigestArticle(window, testLibraryPath)
    await assistant2.openChat()
    await expect(assistant2.searchBtn).toHaveAttribute('aria-pressed', 'true')
    await expect(assistant2.socraticBtn).toHaveAttribute('aria-pressed', 'false')
    await expect(assistant2.thinkingBtn).toHaveCSS('color', 'rgb(56, 189, 248)')
  })

  test('取消选中按钮清除 pending selection', async ({ window, testLibraryPath }) => {
    const assistant = await openDigestArticle(window, testLibraryPath)
    await assistant.dragSelectFirstParagraph()
    await assistant.openChat()
    await expect(assistant.pendingSelection).toBeVisible()
    await assistant.cancelSelection()
    await expect(assistant.pendingSelection).toHaveCount(0)
  })

  test('选中块位于消息列表下方、输入框上方', async ({ window, testLibraryPath }) => {
    const assistant = await openDigestArticle(window, testLibraryPath)
    await assistant.openChat()
    await sendAndWait(assistant, 'Q1')
    await assistant.dragSelectFirstParagraph()
    await expect(assistant.pendingSelection).toBeVisible()
    const selBox = await assistant.pendingSelection.boundingBox()
    const msgBox = await assistant.chatMessages.last().boundingBox()
    const inputBox = await assistant.input.boundingBox()
    expect(selBox!.y).toBeGreaterThan(msgBox!.y)
    expect(selBox!.y).toBeLessThan(inputBox!.y)
  })

  test('开深度思考后显示可折叠思考区块', async ({ window, testLibraryPath }) => {
    const assistant = await openDigestArticle(window, testLibraryPath)
    await assistant.openChat()
    await assistant.setThinkingEffort('high')
    await sendAndWait(assistant, 'Q1')
    await expect(assistant.reasoningBlock).toBeVisible()
    await expect(assistant.reasoningBlock).toContainText('先梳理')
    // 流式完成后 details 默认折叠（open 属性移除）
    await expect(assistant.reasoningBlock).not.toHaveAttribute('open', '')
  })

  test('用户消息靠右、AI 消息靠左', async ({ window, testLibraryPath }) => {
    const assistant = await openDigestArticle(window, testLibraryPath)
    await assistant.openChat()
    await sendAndWait(assistant, 'Q1')
    const user = assistant.chatMessages.filter({ hasText: 'Q1' }).first()
    const ai = assistant.chatMessages.filter({ hasText: 'E2E 测试的' }).first()
    await expect(user).toHaveClass(/justify-end/)
    await expect(ai).toHaveClass(/justify-start/)
  })

  test('历史选段与当前选中颜色不同', async ({ window, testLibraryPath }) => {
    const assistant = await openDigestArticle(window, testLibraryPath)
    await assistant.openChat()
    await assistant.dragSelectFirstParagraph()
    await sendAndWait(assistant, 'Q1')

    // 历史选段（米灰）已随消息渲染
    const historical = window.locator(SELECTORS.articleAssistant.chatMessageSelection).first()
    await expect(historical).toBeVisible()
    const historicalColor = await historical.evaluate((el) => getComputedStyle(el).borderLeftColor)

    // 当前选中（橙）
    await assistant.dragSelectFirstParagraph()
    await expect(assistant.pendingSelection).toBeVisible()
    const pendingColor = await assistant.pendingSelection.evaluate((el) => getComputedStyle(el).borderLeftColor)

    expect(pendingColor).not.toBe(historicalColor)
    expect(pendingColor).toBe('rgb(217, 119, 87)') // ember #d97757
  })
})
```

注意 `'历史选段与当前选中颜色不同'` 依赖 Task 5 的 `selection` 记录 + Task 9 的渲染；`'开深度思考后显示可折叠思考区块'` 依赖 Task 4 mock 推 reasoning + Task 9 渲染。

- [ ] **Step 5: e2e/README.md 同步**

在 spec 清单加 `article-assistant-controls.spec.ts` 条目，并在 mock 策略段落注明：旁注 mock 分支会走真实 prompt 装配链并把最终请求体写到 `E2E_CONFIG_DIR/last-assistant-request.json` 供请求级断言。

- [ ] **Step 6: 跑 E2E**

Run: `npx playwright test --config e2e/playwright.config.ts --grep "@p1" e2e/specs/article-assistant.spec.ts e2e/specs/article-assistant-controls.spec.ts`
Expected: 全 PASS。常见修正点：CSS computed 值、reload 后 cover 流程、mock reasoning 的 details open 属性时序。

- [ ] **Step 7: Commit**

```bash
git add e2e/
git commit -m "test(e2e): assistant request-contract matrix, toggle persistence, selection cancel, reasoning block, two-sided layout assertions"
```

---

### Task 12: 全量回归 + 手动验收

- [ ] **Step 1: 单测全量**

Run: `npm run test`
Expected: 全 PASS（基线遗留失败除外：`anthropic-reader-images`×2、`briefing-page`×3——若仍存在且与本迭代无关，记录即可）

- [ ] **Step 2: typecheck + build**

Run: `npx tsc --noEmit` → 干净
Run: `npm run build` → 成功

- [ ] **Step 3: E2E @p1 全量**

Run: `npx playwright test --config e2e/playwright.config.ts --grep "@p1"`
Expected: 全 PASS

- [ ] **Step 4: 手动验收清单（真实 API，`npm run dev`）**

对照 spec「手动验收」逐项：
1. 流式出字流畅不顿（开/关搜索各试一次）
2. 流式中拖拽旁注小窗跟手
3. 深度思考 `high` vs `max` 回复深度有可感知差异；思考过程灰色小字、完成后折叠
4. 关苏格拉底后提检索问题不再被反问
5. 三开关重启应用后保持
6. 选中 → ✕ 取消；历史消息里能看到当时的选段（米灰）

- [ ] **Step 5: 最终 Commit（如有修复）+ 更新记忆/规则**

若手动验收发现问题并修复，分别提交。若发现新的复发模式，按 `.claude/rules/README.md` 的触发条件考虑沉淀规则。

---

## Self-Review 记录

- **Spec 覆盖**：三开关持久化(T1/T8)、双模式 prompt(T3)、effort 传参(T2/T4)、reasoning 显示(T2/T4/T5/T9)、批处理+收窄+memo+transform 拖拽(T5/T9/T10)、历史 bug(T7)、取消选中+选中块下移(T9)、chatbot 两侧布局(T9)、选段持久化(T1/T5/T6)、E2E 请求级矩阵(T4 mock 落盘 + T11)、旧 state 兼容(T1 DEFAULT/init/BASE_STATE)、preload 探测(T11 Step 3)。✔
- **已知相互依赖**：T8 前 `npx tsc --noEmit` 会因 ChatWindow 引用已删除的 `session.searchEnabled` 报错——各任务内已注明，T8 完成后全干净。T11 的 `'历史选段'` 测试依赖 T5+T9。
- **类型一致性**：`AssistantThinkingEffort`（T1 定义）在 T4 types、T5 store、T8 UI 一致使用；`nextThinkingEffort`（T1）在 T1 store 使用；`serializeAssistantSessionBody`（T6）与 writeSession 一致；`resetAssistantStreamBuffers`（T5 runtime 导出）在 store abort/runAssistantStream 使用。
