# 写作助手 Agent 标准与原生工具循环重构 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将写作助手工具循环从 markdown 围栏解析重构为原生 function-calling，落地 S1-S5 标准（正文快照注入、路径修复、引用可信、移除插入、记录经济），并修复"无输出"故障。

**Architecture:** 主进程 `electron/lib/writing-assistant/` 内重写工具契约与循环。`kimi.ts` 增加原生工具 SSE 解析与结构化返回（additive，不影响主会话调用方）。`loop.ts` 改为状态机：`finish_reason` 判定收尾，工具用尽强制逼答，空输出经 `llm:error` 显式上报。`store`/UI 实现快照按钮与条件快照。

**Tech Stack:** Electron 30 + React 18 + TypeScript + Zustand + Vitest + Playwright。

**Spec:** `docs/superpowers/specs/2026-08-10-writing-assistant-agent-loop-design.md`

## Global Constraints

- 禁止全量测试：改哪个文件跑哪个测试文件（`.claude/rules/general.md §9`）。
- 定向 E2E：`node scripts/e2e-changed.js --run`（自动先 `npx electron-vite build`）；本地迭代加 `--no-retries`。
- 新增 IPC/事件必须四层同步：types → handler → preload → store/组件。
- LLM 结构化输入一律走 extract → sanitize → shape-check，不直接 `JSON.parse` LLM 输出（llm.md §4）。
- 工具 schema 单一来源在 CODE；系统提示词只写"何时用、引用规则"，不写调用语法。
- 组件文件只导出组件（ui-styling §10）。
- 提交时只 `git add` 本任务的改动文件，不动工作区其他未提交改动。
- 重构窗口（Task 4-7）内 `tsc --noEmit` 可能红（tool-protocol 旧 API 删除后 loop/tools 尚未切换），属预期；**每任务门禁是 vitest 单文件**（esbuild 转译不 typecheck），Task 12 收口 tsc。

---

### Task 1: Spike — 验证 relay 原生 tools 支持

**Files:**
- Test: 无（手动 curl）

**Interfaces:**
- 无产物依赖。决定 Task 2 是否走原生 tools；若不支持，回退"硬化围栏"方案并更新 spec。

- [ ] **Step 1: 构造带 tools 的请求**

用应用实际读取的 `.env` 凭据构造一个最小 `/chat/completions` 请求，验证模型是否返回 `tool_calls`：

```bash
cd /c/Users/86468/Desktop/project/study-parlor
KEY=$(grep -E '^KIMI_API_KEY=' .env | cut -d= -f2-)
BASE=$(grep -E '^KIMI_BASE_URL=' .env | cut -d= -f2-)
MODEL=$(grep -E '^KIMI_MODEL=' .env | cut -d= -f2-)
curl -s "$BASE/chat/completions" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -H "User-Agent: claude-code/0.1.0" \
  -d "{\"model\":\"$MODEL\",\"stream\":false,\"messages\":[{\"role\":\"user\",\"content\":\"请读取一篇本地文章（没有文章就说明不需要）\"}],\"tools\":[{\"type\":\"function\",\"function\":{\"name\":\"read_local\",\"description\":\"读取本地资料\",\"parameters\":{\"type\":\"object\",\"properties\":{\"ids\":{\"type\":\"array\",\"items\":{\"type\":\"string\"}}},\"required\":[\"ids\"]}}}]}" \
  | head -c 2000
```

- [ ] **Step 2: 判定结果**

- 若响应含 `tool_calls` 数组与 `finish_reason: "tool_calls"` → 原生路径可用，继续 Task 2。
- 若报错（`400`/不支持）或忽略 `tools` → 原生不可用：回退方案（保留围栏解析 + 增加最终回答保障与空输出上报），**更新 spec 后重新计划**。
- 若模型同时支持 `thinking` 与 `tool_calls` → 记录；若互斥（工具轮无 reasoning），则 Task 7 中工具轮 `thinking: disabled`。

- [ ] **Step 3: 记录结论到 plan 开头注释**

把 spike 结论（可用/回退/thinking 互斥）作为注释写到本计划 Task 2 前，供执行者决策。不提交。

---

### Task 2: kimi.ts 原生工具支持（additive）

**Files:**
- Modify: `electron/lib/kimi.ts`
- Test: `tests/kimi.test.ts`

**Interfaces:**
- 新增导出类型：`ToolDef = { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }`
- 新增导出类型：`NativeToolCallRaw = { id?: string; name?: string; arguments?: string }`
- 新增导出类型：`ChatStreamResult = { content: string; toolCalls: NativeToolCallRaw[]; finishReason: string | null }`
- `buildChatBody(cfg, args & { tools?: ToolDef[] })` — `args.tools?.length` 时加 `body.tools = args.tools`。
- `parseSseChunk(line): SseEvent` — SseEvent 联合新增：
  - `| { kind: 'tool_call'; index: number; id?: string; name?: string; args?: string }`（`delta.tool_calls` 分片）
  - chunk 事件在 `finish_reason` 存在时附 `finishReason: string`（仅存在时，不附 null）
- `chatStream(...): Promise<ChatStreamResult>` — 累积 content/toolCalls/finishReason，返回结构化结果。**现有调用方忽略返回值，行为不变**。

- [ ] **Step 1: 写失败的测试**

在 `tests/kimi.test.ts` 的 `parseSseChunk` describe 末尾追加：

```ts
it('parses tool_call deltas with partial function args', () => {
  const line1 = 'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"read_local","arguments":"{\\"ids\\":"}}]}}]}'
  const line2 = 'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"[\\"writing:a.md\\"]"}}]}}]}'
  expect(parseSseChunk(line1)).toEqual({ kind: 'tool_call', index: 0, id: 'call_1', name: 'read_local', args: '{"ids":' })
  expect(parseSseChunk(line2)).toEqual({ kind: 'tool_call', index: 0, args: '["writing:a.md"]' })
})

it('attaches finish_reason when present on chunk', () => {
  const line = 'data: {"choices":[{"delta":{"content":"答"},"finish_reason":"stop"}]}'
  expect(parseSseChunk(line)).toEqual({ kind: 'chunk', text: '答', finishReason: 'stop' })
})
```

在 `chatStream` describe（用已有 `sseBody` helper）追加：

```ts
it('accumulates native tool_calls and finish_reason across deltas', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200,
    body: sseBody([
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"read_local","arguments":"{\\"ids\\":"}}]}}]}',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"[\\"writing:a.md\\"]"}}]}}]}',
      'data: {"choices":[{"delta":{}},"finish_reason":"tool_calls"}]}',
      'data: [DONE]',
    ]),
  })) as any)

  const chunks: string[] = []
  const result = await chatStream(
    cfg,
    { messages: [{ role: 'user', content: 'q' }], temperature: 0.7, signal: new AbortController().signal },
    (t) => chunks.push(t),
  )
  expect(result.content).toBe('')
  expect(result.toolCalls).toEqual([{ id: 'call_1', name: 'read_local', arguments: '{"ids":["writing:a.md"]}' }])
  expect(result.finishReason).toBe('tool_calls')
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/kimi.test.ts`
Expected: 新用例 FAIL（`parseSseChunk` 不识别 tool_calls；`chatStream` 返回 void，`result` undefined）。

- [ ] **Step 3: 实现**

`electron/lib/kimi.ts`：

```ts
export type ToolDef = { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }
export type NativeToolCallRaw = { id?: string; name?: string; arguments?: string }
export type ChatStreamResult = { content: string; toolCalls: NativeToolCallRaw[]; finishReason: string | null }

// buildChatBody 的 args 类型加 tools?: ToolDef[]，body 构造后：
if (args.tools && args.tools.length > 0) body.tools = args.tools
```

`SseEvent` 联合更新与 `parseSseChunk` 更新（保持现有 chunk/reasoning 断言不变——只在存在时附加字段）：

```ts
export type SseEvent =
  | { kind: 'chunk'; text: string; finishReason?: string }
  | { kind: 'reasoning'; text: string; content?: string }
  | { kind: 'tool_call'; index: number; id?: string; name?: string; args?: string }
  | { kind: 'done' }
  | { kind: 'noop' }

export function parseSseChunk(line: string): SseEvent {
  const trimmed = line.trim()
  if (!trimmed.startsWith('data:')) return { kind: 'noop' }
  const payload = trimmed.slice(5).trim()
  if (payload === '[DONE]') return { kind: 'done' }
  try {
    const json = JSON.parse(payload) as { choices?: { delta?: { content?: string; reasoning_content?: string; tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }> }; finish_reason?: string }[] }
    const delta = json.choices?.[0]?.delta
    const finishReason = json.choices?.[0]?.finish_reason ?? null
    if (delta?.reasoning_content) {
      const ev: SseEvent = { kind: 'reasoning', text: delta.reasoning_content }
      if (delta.content) ev.content = delta.content
      return ev
    }
    if (delta?.tool_calls && Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0) {
      const tc = delta.tool_calls[0]
      const ev: SseEvent = { kind: 'tool_call', index: tc.index ?? 0 }
      if (tc.id) ev.id = tc.id
      if (tc.function?.name) ev.name = tc.function.name
      if (tc.function?.arguments) ev.args = tc.function.arguments
      return ev
    }
    const text = delta?.content ?? ''
    if (finishReason) return { kind: 'chunk', text, finishReason }
    return { kind: 'chunk', text }
  } catch { return { kind: 'noop' } }
}
```

`chatStream` 末尾改为累积并返回（签名 `Promise<ChatStreamResult>`；`onReasoning` 可选不变）。把 while 循环内 `else if (ev.kind === 'done') return` 改为 `else if (ev.kind === 'done') break`，并加累积器：

```ts
// while 循环前：
const toolCallMap = new Map<number, { id: string; name: string; args: string }>()
let finishReason: string | null = null
let contentAcc = ''
let done = false

// while 循环内解析分支替换为：
if (ev.kind === 'chunk') { onChunk(ev.text); contentAcc += ev.text; if (ev.finishReason) finishReason = ev.finishReason }
else if (ev.kind === 'reasoning') { onReasoning?.(ev.text); if (ev.content) { onChunk(ev.content); contentAcc += ev.content } }
else if (ev.kind === 'tool_call') {
  const cur = toolCallMap.get(ev.index) ?? { id: '', name: '', args: '' }
  if (ev.id) cur.id = ev.id
  if (ev.name) cur.name = ev.name
  if (ev.args) cur.args += ev.args
  toolCallMap.set(ev.index, cur)
}
else if (ev.kind === 'done') { done = true; break }

// 函数末尾（finally 之后）返回：
return {
  content: contentAcc,
  toolCalls: [...toolCallMap.values()].map(tc => ({ id: tc.id, name: tc.name, arguments: tc.args })),
  finishReason,
}
```

注意保留现有 `reasoning` 双重派发修正（if/else-if 链，每种事件只走一个分支）——见 memory 备忘 §1。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/kimi.test.ts`
Expected: 全部 PASS（新用例 + 既有 reasoning/buildChatBody 用例回归）。

- [ ] **Step 5: Commit**

```bash
git add electron/lib/kimi.ts tests/kimi.test.ts
git commit -m "feat(kimi): 原生 function-calling SSE 解析与结构化返回
chatStream 返回 {content, toolCalls, finishReason};buildChatBody 支持可选 tools;parseSseChunk 解析 delta.tool_calls。additive,现有调用方忽略返回值行为不变。"
```

---

### Task 3: 错误码 CHAT_EMPTY_REPLY 接线

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/lib/writing-assistant-runtime.ts`
- Test: `tests/writing-assistant-runtime.test.ts`（若无此文件则新建）

**Interfaces:**
- `ArticleAssistantErrorCode` 联合新增 `'CHAT_EMPTY_REPLY'`。
- `writing-assistant-runtime.ts` 的 `onLlmError` 映射新增 `err.code === 'CHAT_EMPTY_REPLY' ? 'CHAT_EMPTY_REPLY'`。

- [ ] **Step 1: 写失败的测试**

新建 `tests/writing-assistant-runtime.test.ts`（若存在则在既有 describe 追加）：

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/ipc', () => {
  const handlers: Record<string, (sid: string, err?: { code: string; message: string }) => void> = {}
  return {
    ipc: {
      onLlmChunk: vi.fn(() => () => {}),
      onLlmDone: vi.fn(() => () => {}),
      onLlmError: vi.fn((cb: (sid: string, err: { code: string; message: string }) => void) => {
        handlers.error = cb
        return () => {}
      }),
      onWritingAssistantTool: vi.fn(() => () => {}),
      onWritingAssistantReasoningChunk: vi.fn(() => () => {}),
    },
  }
})
vi.mock('@/lib/assistant-stream-buffers', () => ({
  appendToContentBuffer: vi.fn(),
  appendToReasoningBuffer: vi.fn(),
  clearFlushTimer: vi.fn(),
  drainContentBuffer: vi.fn(() => ''),
  drainReasoningBuffer: vi.fn(() => ''),
  hasFlushTimer: vi.fn(() => false),
  setFlushTimer: vi.fn(),
}))

import { attachWritingAssistantListeners } from '@/lib/writing-assistant-runtime'
import { ipc } from '@/lib/ipc'
import { useStore } from '@/store'

describe('writing assistant runtime llm:error mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    attachWritingAssistantListeners()
    useStore.setState({
      writingAssistant: {
        sessionId: 'wa-001', articlePath: null,
        messages: [{ role: 'user', content: 'q' }],
        streaming: true, error: null,
      },
    })
  })

  it('maps CHAT_EMPTY_REPLY to CHAT_EMPTY_REPLY', () => {
    const cb = vi.mocked(ipc.onLlmError).mock.calls[0][0]
    cb('wa-001', { code: 'CHAT_EMPTY_REPLY', message: '助手未产生回答' })
    const s = useStore.getState().writingAssistant!
    expect(s.streaming).toBe(false)
    expect(s.error).toBe('CHAT_EMPTY_REPLY')
  })

  it('falls back to CHAT_LLM_ERROR for unknown codes', () => {
    const cb = vi.mocked(ipc.onLlmError).mock.calls[0][0]
    cb('wa-001', { code: 'SOMETHING_ELSE', message: 'x' })
    expect(useStore.getState().writingAssistant!.error).toBe('CHAT_LLM_ERROR')
  })
})
```

（若 mock 结构与本仓库既有 runtime 测试不一致，以现有 `tests/*-runtime.test.ts` 的 mock 模式为准调整。）

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/writing-assistant-runtime.test.ts`
Expected: `CHAT_EMPTY_REPLY` 用例 FAIL（映射不到，落为 `CHAT_LLM_ERROR`）。

- [ ] **Step 3: 实现**

`src/types/index.ts` `ArticleAssistantErrorCode`（第 150-157 行）加：

```ts
  | 'CHAT_EMPTY_REPLY'
```

`src/lib/writing-assistant-runtime.ts` 第 59-61 行映射改为：

```ts
    const code: ArticleAssistantErrorCode = err.code === 'CHAT_NETWORK_ERROR' ? 'CHAT_NETWORK_ERROR'
      : err.code === 'CHAT_TIMEOUT' ? 'CHAT_TIMEOUT'
      : err.code === 'CHAT_EMPTY_REPLY' ? 'CHAT_EMPTY_REPLY'
      : 'CHAT_LLM_ERROR'
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/writing-assistant-runtime.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/lib/writing-assistant-runtime.ts tests/writing-assistant-runtime.test.ts
git commit -m "feat(writing): CHAT_EMPTY_REPLY 错误码四层接线
types 联合 + runtime 映射,空输出显式上报走既有 llm:error 通道。"
```

---

### Task 4: tool-protocol 重写为原生

**Files:**
- Rewrite: `electron/lib/writing-assistant/tool-protocol.ts`
- Test: `tests/writing-tool-protocol.test.ts`（重写）

**Interfaces:**
- 删除：`ToolCall`（旧围栏）、`extractToolCall`、`createToolBuffer`。
- 新增导出：`NativeToolCall = { id: string; name: 'read_local' | 'web_search'; args: { ids: string[] } | { query: string } }`
- 新增导出：`parseNativeToolCall(raw: { id?: string; name?: string; arguments?: string }): NativeToolCall | null`
- 新增导出：`buildToolDefinitions(searchEnabled: boolean): ToolDef[]`（`ToolDef` 来自 `../kimi`）
- 保留导出：`MAX_TOOL_CALLS = 3`

- [ ] **Step 1: 写失败的测试**

重写 `tests/writing-tool-protocol.test.ts` 为：

```ts
import { describe, expect, it } from 'vitest'
import { parseNativeToolCall, buildToolDefinitions, MAX_TOOL_CALLS } from '../electron/lib/writing-assistant/tool-protocol'

describe('parseNativeToolCall', () => {
  it('parses read_local with ids', () => {
    const raw = { id: 'call_1', name: 'read_local', arguments: '{"ids":["writing:a.md","repository:旧随笔.md"]}' }
    expect(parseNativeToolCall(raw)).toEqual({ id: 'call_1', name: 'read_local', args: { ids: ['writing:a.md', 'repository:旧随笔.md'] } })
  })

  it('parses web_search with query', () => {
    const raw = { id: 'call_2', name: 'web_search', arguments: '{"query":"TypeScript best practices"}' }
    expect(parseNativeToolCall(raw)).toEqual({ id: 'call_2', name: 'web_search', args: { query: 'TypeScript best practices' } })
  })

  it('rejects read_local with missing ids', () => {
    expect(parseNativeToolCall({ name: 'read_local', arguments: '{}' })).toBeNull()
    expect(parseNativeToolCall({ name: 'read_local', arguments: 'not json' })).toBeNull()
  })

  it('rejects web_search with empty query', () => {
    expect(parseNativeToolCall({ name: 'web_search', arguments: '{"query":""}' })).toBeNull()
  })

  it('rejects unknown tool names and missing name', () => {
    expect(parseNativeToolCall({ name: 'insert_into_article', arguments: '{}' })).toBeNull()
    expect(parseNativeToolCall({ arguments: '{}' })).toBeNull()
  })
})

describe('buildToolDefinitions', () => {
  it('always includes read_local', () => {
    const defs = buildToolDefinitions(false)
    expect(defs.map(d => d.function.name)).toContain('read_local')
  })

  it('includes web_search only when enabled', () => {
    expect(buildToolDefinitions(false).map(d => d.function.name)).not.toContain('web_search')
    expect(buildToolDefinitions(true).map(d => d.function.name)).toContain('web_search')
  })

  it('never defines insert_into_article', () => {
    const names = buildToolDefinitions(true).map(d => d.function.name)
    expect(names).not.toContain('insert_into_article')
  })
})

it('MAX_TOOL_CALLS stays 3', () => {
  expect(MAX_TOOL_CALLS).toBe(3)
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/writing-tool-protocol.test.ts`
Expected: FAIL（模块还是旧围栏 API）。

- [ ] **Step 3: 实现**

重写 `electron/lib/writing-assistant/tool-protocol.ts`：

```ts
import type { ToolDef } from '../kimi'

export const MAX_TOOL_CALLS = 3

export type NativeToolCall =
  | { id: string; name: 'read_local'; args: { ids: string[] } }
  | { id: string; name: 'web_search'; args: { query: string } }

export function parseNativeToolCall(raw: { id?: string; name?: string; arguments?: string }): NativeToolCall | null {
  if (!raw || typeof raw.name !== 'string') return null
  let parsed: unknown
  try {
    parsed = raw.arguments ? JSON.parse(raw.arguments) : {}
  } catch { return null }
  const id = raw.id ?? ''
  if (raw.name === 'read_local') {
    const o = parsed as { ids?: unknown }
    if (!Array.isArray(o.ids) || !o.ids.every((x): x is string => typeof x === 'string')) return null
    return { id, name: 'read_local', args: { ids: o.ids } }
  }
  if (raw.name === 'web_search') {
    const o = parsed as { query?: unknown }
    if (typeof o.query !== 'string' || o.query.length === 0) return null
    return { id, name: 'web_search', args: { query: o.query } }
  }
  return null
}

export function buildToolDefinitions(searchEnabled: boolean): ToolDef[] {
  const defs: ToolDef[] = [{
    type: 'function',
    function: {
      name: 'read_local',
      description: '读取学习库中的本地资料文件（写作/仓库/学习主题/博客/日报）。ids 必须来自系统提示词的资料目录。',
      parameters: {
        type: 'object',
        properties: { ids: { type: 'array', items: { type: 'string' }, description: '要读取的文件 id 列表' } },
        required: ['ids'],
      },
    },
  }]
  if (searchEnabled) {
    defs.push({
      type: 'function',
      function: {
        name: 'web_search',
        description: '搜索网络获取最新信息或做事实核查。仅在需要最新信息时使用。',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string', description: '搜索关键词' } },
          required: ['query'],
        },
      },
    })
  }
  return defs
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/writing-tool-protocol.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add electron/lib/writing-assistant/tool-protocol.ts tests/writing-tool-protocol.test.ts
git commit -m "feat(writing): 工具协议重写为原生 function-calling
删围栏解析(createToolBuffer/extractToolCall),新增 parseNativeToolCall
与 buildToolDefinitions(web_search 仅开关开启时注入)。"
```

---

### Task 5: tools.ts — S2 路径修复 + S3 失败标记 + 删 insert

**Files:**
- Modify: `electron/lib/writing-assistant/tools.ts`
- Test: 新建 `tests/writing-assistant-tools.test.ts`

**Interfaces:**
- `resolveSourcePath(lib, type, idPath)` 对 `writing`/`repository` 在 join 前 strip 一次 `writing/`/`repository/` 前缀。
- `executeTool` 的 `read_local` 失败结果改为带 `（未读到内容，请勿引用）` 后缀。
- 删除 `insert_into_article` 分支。

- [ ] **Step 1: 写失败的测试**

新建 `tests/writing-assistant-tools.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resolveSourcePath } from '../electron/lib/writing-assistant/tools'
import type { AppConfig } from '../electron/env'

function tmpLib(): { dir: string; cfg: AppConfig } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-tools-'))
  fs.mkdirSync(path.join(dir, 'writing', '日记'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'repository'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'writing', '日记', '8.9.md'), '# 正文')
  fs.writeFileSync(path.join(dir, 'repository', '旧随笔.md'), '# 旧')
  const cfg = { apiKey: 'sk-test', baseUrl: 'https://x', model: 'm', libraryPath: dir } as AppConfig
  return { dir, cfg }
}

describe('resolveSourcePath (S2 双重前缀修复)', () => {
  it('resolves catalog-style id with redundant prefix', () => {
    const { dir, cfg } = tmpLib()
    const p = resolveSourcePath(cfg.libraryPath, 'writing', 'writing/日记/8.9.md')
    expect(p).toBe(path.join(dir, 'writing', '日记', '8.9.md'))
    expect(fs.existsSync(p!)).toBe(true)
  })

  it('resolves clean id without prefix', () => {
    const { dir, cfg } = tmpLib()
    const p = resolveSourcePath(cfg.libraryPath, 'writing', '日记/8.9.md')
    expect(p).toBe(path.join(dir, 'writing', '日记', '8.9.md'))
    expect(fs.existsSync(p!)).toBe(true)
  })

  it('resolves repository with redundant prefix', () => {
    const { dir, cfg } = tmpLib()
    const p = resolveSourcePath(cfg.libraryPath, 'repository', 'repository/旧随笔.md')
    expect(p).toBe(path.join(dir, 'repository', '旧随笔.md'))
    expect(fs.existsSync(p!)).toBe(true)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/writing-assistant-tools.test.ts`
Expected: 第一个用例 FAIL（`resolveSourcePath` 现在返回 `<dir>/writing/writing/...` 不存在）。

- [ ] **Step 3: 实现**

`electron/lib/writing-assistant/tools.ts` `resolveSourcePath`：

```ts
function resolveSourcePath(lib: string, type: string, idPath: string): string | null {
  switch (type) {
    case 'writing':
      return path.join(lib, 'writing', idPath.replace(/^writing\//, ''))
    case 'repository':
      return path.join(lib, 'repository', idPath.replace(/^repository\//, ''))
    // ...其余分支不变
  }
}
```

`executeTool` 的 `read_local` 失败分支（两处 `results.push`）改为：

```ts
        if (colonIdx === -1) { results.push(`⚠️ 无效 id 格式: ${id}（未读到内容，请勿引用）`); continue }
        ...
        if (!absPath) {
          results.push(`⚠️ 不支持的来源类型: ${type}（未读到内容，请勿引用）`)
          continue
        }
        if (!fs.existsSync(absPath)) {
          results.push(`⚠️ 文件不存在: ${id}（未读到内容，请勿引用）`)
          continue
        }
        ...
      } catch {
        results.push(`⚠️ id 不存在或无法读取: ${id}（未读到内容，请勿引用）`)
      }
```

删除 `tools.ts` 底部 `insert_into_article` 分支（第 129-131 行整段）。

**`executeTool` 入参从旧 `ToolCall` 改为 `NativeToolCall`**（Task 4 重命名），函数体同步改：

```ts
export async function executeTool(
  cfg: AppConfig,
  call: NativeToolCall,
  opts: {
    send: (e: WritingToolEvent) => void
    sessionId: string
    useSearch: boolean
    getSearchApiKey?: () => Promise<string | null>
    searchWeb?: (o: { query: string; apiKey: string; maxResults?: number }) => Promise<Array<{ title: string; url: string; content: string }>>
    index?: IndexEntry[]
  }
): Promise<string> {
  if (call.name === 'read_local') {
    const ids = call.args.ids
    opts.send({ sessionId: opts.sessionId, phase: 'start', tool: 'read_local', ids })

    if (ids.length === 0 || ids.includes('index')) {
      const catalogText = (opts.index || []).map(e =>
        `- [${e.type}] ${e.id} — ${e.title}: ${e.summary}`
      ).join('\n')
      opts.send({ sessionId: opts.sessionId, phase: 'done', tool: 'read_local', ids })
      return '可用资料列表：\n' + (catalogText || '(暂无资料)')
    }

    const results: string[] = []
    for (const id of ids) {
      try {
        const colonIdx = id.indexOf(':')
        if (colonIdx === -1) { results.push(`⚠️ 无效 id 格式: ${id}（未读到内容，请勿引用）`); continue }

        const type = id.slice(0, colonIdx)
        const relPath = id.slice(colonIdx + 1)
        const absPath = resolveSourcePath(cfg.libraryPath, type, relPath)
        if (!absPath) {
          results.push(`⚠️ 不支持的来源类型: ${type}（未读到内容，请勿引用）`)
          continue
        }
        if (!fs.existsSync(absPath)) {
          results.push(`⚠️ 文件不存在: ${id}（未读到内容，请勿引用）`)
          continue
        }
        const raw = fs.readFileSync(absPath, 'utf-8')
        let title = id
        let body = raw
        const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n?/)
        if (fmMatch) {
          const fmTitle = fmMatch[1].match(/^title:\s*(.+)$/m)
          if (fmTitle) title = fmTitle[1].trim().replace(/^["']|["']$/g, '')
          body = raw.slice(fmMatch[0].length)
        }
        results.push(`### [${type}] ${title}\n\n${body}`)
      } catch {
        results.push(`⚠️ id 不存在或无法读取: ${id}（未读到内容，请勿引用）`)
      }
    }

    opts.send({ sessionId: opts.sessionId, phase: 'done', tool: 'read_local', ids })
    return results.join('\n\n---\n\n')
  }

  if (call.name === 'web_search') {
    const query = call.args.query
    if (!opts.useSearch) return '网络搜索未开启（用户关闭了 🔍 开关）。'
    try {
      const apiKey = opts.getSearchApiKey ? await opts.getSearchApiKey() : null
      if (!apiKey) return '搜索 API Key 未配置。'
      const results = await (opts.searchWeb!)({ query, apiKey, maxResults: 8 })
      return results.map((r, i) =>
        `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.content?.slice(0, 300) || ''}`
      ).join('\n\n')
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code
      if (code === 'NO_RESULTS') return `搜索「${query}」未找到结果。`
      return `搜索「${query}」时出错，请稍后重试。`
    }
  }

  return '未知工具调用'
}
```

更新 `tools.ts` 顶部 import：`import type { ToolCall } from './tool-protocol'` → `import type { NativeToolCall } from './tool-protocol'`。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/writing-assistant-tools.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add electron/lib/writing-assistant/tools.ts tests/writing-assistant-tools.test.ts
git commit -m "fix(writing): read_local 双重前缀路径修复 + 读失败标记 + 删 insert
catalog id 与解析双向正确(S2);失败结果带'未读到内容,请勿引用'(S3)。"
```

---

### Task 6: prompt.ts — 干净 id + 策略式系统提示词 + S3 规则

**Files:**
- Modify: `electron/lib/writing-assistant/prompt.ts`
- Test: `tests/writing-assistant-prompt.test.ts`（新建，若有旧文件则按此重写）

**Interfaces:**
- `buildWritingIndex` 生成的 `writing`/`repository` id 去掉 `writing/`/`repository/` 前缀。
- `buildWritingSystemPrompt` 移除 `insert_into_article` 行、移除 ````tool``` 语法段、加 S3 规则、加"何时用工具"策略。
- `maxTools` 保持 3。

- [ ] **Step 1: 写失败的测试**

新建 `tests/writing-assistant-prompt.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { buildWritingSystemPrompt } from '../electron/lib/writing-assistant/prompt'
import type { IndexEntry } from '../electron/lib/writing-assistant/prompt'

describe('buildWritingSystemPrompt', () => {
  const index: IndexEntry[] = [
    { id: 'writing:日记/8.9.md', type: 'writing', title: '8.9', summary: '决策' },
    { id: 'repository:旧随笔.md', type: 'repository', title: '旧随笔', summary: '' },
  ]

  it('removes insert_into_article and fence syntax entirely', () => {
    const p = buildWritingSystemPrompt(index, false)
    expect(p).not.toContain('insert_into_article')
    expect(p).not.toContain('```tool')
  })

  it('mentions read_local as available tool', () => {
    expect(buildWritingSystemPrompt(index, false)).toContain('read_local')
  })

  it('mentions web_search only when search enabled', () => {
    expect(buildWritingSystemPrompt(index, false)).not.toContain('web_search')
    expect(buildWritingSystemPrompt(index, true)).toContain('web_search')
  })

  it('includes S3 no-fabrication rule on read failure', () => {
    const p = buildWritingSystemPrompt(index, false)
    expect(p).toContain('请勿引用')
    expect(p).toContain('重试')
  })

  it('lists catalog ids verbatim (clean, no double prefix)', () => {
    const p = buildWritingSystemPrompt(index, false)
    expect(p).toContain('writing:日记/8.9.md')
    expect(p).toContain('repository:旧随笔.md')
    expect(p).not.toContain('writing:writing/')
    expect(p).not.toContain('repository:repository/')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/writing-assistant-prompt.test.ts`
Expected: 多个断言 FAIL（现在仍含 insert/fence、无 S3 规则）。

- [ ] **Step 3: 实现**

`prompt.ts` `buildWritingIndex` 中 writing/repository 两段 id 生成改为：

```ts
      entries.push({
        id: `writing:${relPath.replace(/^writing\//, '')}`,
        type: 'writing',
        title: entry.title || path.basename(relPath, '.md'),
        summary: entry.summary || '',
      })
```
```ts
      entries.push({
        id: `repository:${relPath.replace(/^repository\//, '')}`,
        type: 'repository',
        title: entry.title || path.basename(relPath, '.md'),
        summary: entry.summary || '',
      })
```

`buildWritingSystemPrompt` 的返回字符串改为（整体替换）：

```ts
  const searchSection = searchEnabled
    ? `- web_search：搜索网络获取最新信息或事实核查（仅在需要最新信息或核实事实时使用，不要对简单概念问询使用）`
    : ''

  const maxTools = 3

  return `你是用户的写作助手。你的默认行为是直接回答——只有当你确实需要查阅用户本地资料${
    searchEnabled ? '、搜索网络最新信息' : ''
  }时，才调用工具。

# 可调取资料目录
${catalog || '(暂无资料)'}

# 工具
你有以下工具可用：
- read_local：读取本地资料文件，ids 必须来自上方资料目录（写文件路径，不要重复前缀）
${searchSection}
规则：
- 需要资料时直接调用工具，工具结果会以消息形式返回，然后基于结果继续回答
- 一次可调用多个工具；单轮最多 ${maxTools} 次
- 不需要工具时不要调用
- 禁止编造不存在的 id
- 若工具结果以 ⚠️ 开头（无法读取/文件不存在/未读到内容），表示该文件未被读到：禁止引用其内容作为依据；先换一个 id 重试一次，仍失败则明确告知用户读取失败

# 写作规范
- 回答使用 markdown 格式，结构清晰
- 使用 web_search 获取的信息，必须在正文中附带来源编号 [1] [2] ...，并在末尾列出"来源"列表（含标题和完整 URL）`
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/writing-assistant-prompt.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add electron/lib/writing-assistant/prompt.ts tests/writing-assistant-prompt.test.ts
git commit -m "feat(writing): 系统提示词改策略式 + 干净 id + S3 规则
移除 insert 与围栏语法;工具 schema 单一来源在代码;读失败重试/明说。"
```

---

### Task 7: loop.ts 状态机重写 + injectLatestSnapshot

**Files:**
- Rewrite: `electron/lib/writing-assistant/loop.ts`
- Test: 新建 `tests/writing-assistant-loop.test.ts`

**Interfaces:**
- 新增导出：`injectLatestSnapshot(base: string, messages: WritingAssistantMessage[]): string`
- `runWritingAssistantTurn(cfg, args, deps?: { chat?: typeof chatStream; executeTool?: typeof executeTool })` — 第三个可选参数用于注入 fake。
- 空输出：`args.send('llm:error', sessionId, { code: 'CHAT_EMPTY_REPLY', message: '助手未产生回答' })` 后 return。
- 工具用尽：追加强制逼答 user 消息，`tools: undefined` 再跑一轮。
- 每轮 `tools: buildToolDefinitions(args.useSearch)`。

- [ ] **Step 1: 写失败的测试**

新建 `tests/writing-assistant-loop.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { runWritingAssistantTurn, injectLatestSnapshot } from '../electron/lib/writing-assistant/loop'
import { MAX_TOOL_CALLS } from '../electron/lib/writing-assistant/tool-protocol'
import type { ChatStreamResult } from '../electron/lib/kimi'
import type { AppConfig } from '../electron/env'
import type { WritingAssistantMessage } from '../src/types'

const cfg = { apiKey: 'sk-test', baseUrl: 'https://x', model: 'm', libraryPath: '/tmp' } as AppConfig

function fakeChat(script: Array<{ toolCalls: ChatStreamResult['toolCalls']; content?: string; finishReason?: string | null }>) {
  let i = 0
  return async () => {
    const s = script[Math.min(i++, script.length - 1)]
    return { content: s.content ?? '', toolCalls: s.toolCalls, finishReason: s.finishReason ?? 'stop' } as ChatStreamResult
  }
}

const noop = () => {}

describe('injectLatestSnapshot', () => {
  it('appends the most recent snapshot to the system prompt', () => {
    const msgs: WritingAssistantMessage[] = [
      { role: 'user', content: 'a', snapshot: '# 旧版' },
      { role: 'assistant', content: 'r' },
      { role: 'user', content: 'b' },
    ]
    const out = injectLatestSnapshot('system', msgs)
    expect(out).toContain('## 当前文章全文快照')
    expect(out).toContain('# 旧版')
  })

  it('returns base unchanged when no snapshot', () => {
    const msgs: WritingAssistantMessage[] = [{ role: 'user', content: 'a' }]
    expect(injectLatestSnapshot('system', msgs)).toBe('system')
  })
})

describe('runWritingAssistantTurn loop', () => {
  function baseArgs(overrides: { chat?: any; executeTool?: any } = {}) {
    const sent: Array<{ channel: string; payload: unknown[] }> = []
    const done = runWritingAssistantTurn(cfg, {
      sessionId: 'wa-1',
      systemPrompt: 'system',
      messages: [{ role: 'user', content: 'q', snapshot: '# 正文' }],
      useSearch: false,
      thinkingEffort: 'off',
      send: (channel: string, ...payload: unknown[]) => sent.push({ channel, payload }),
      onChunk: noop as any,
      onReasoning: noop as any,
      signal: new AbortController().signal,
      index: [],
    } as any, overrides)
    return { sent, done }
  }

  it('returns normally when model answers without tools', async () => {
    const chat = fakeChat([{ toolCalls: [], content: '直接回答' }])
    const { sent, done } = baseArgs({ chat: chat as any })
    await done
    expect(sent).toEqual([]) // 未发送任何 llm:error
  })

  it('sends CHAT_EMPTY_REPLY when final content is empty', async () => {
    const chat = fakeChat([{ toolCalls: [], content: '' }])
    const { sent, done } = baseArgs({ chat: chat as any })
    await done
    expect(sent).toContainEqual({
      channel: 'llm:error',
      payload: ['wa-1', { code: 'CHAT_EMPTY_REPLY', message: '助手未产生回答' }],
    })
  })

  it('executes tool call then answers (rounds: tool_calls -> stop)', async () => {
    const calls: string[] = []
    const chat = fakeChat([
      { toolCalls: [{ id: 'c1', name: 'read_local', arguments: '{"ids":["writing:a.md"]}' }] },
      { toolCalls: [], content: '基于文件回答' },
    ])
    const executeTool = async (_cfg: unknown, call: { name: string }) => { calls.push(call.name); return '内容' }
    const { done } = baseArgs({ chat: chat as any, executeTool: executeTool as any })
    await done
    expect(calls).toEqual(['read_local'])
  })

  it('forces a final answer without tools when tool calls exhaust the cap', async () => {
    const toolsSeen: Array<unknown[] | undefined> = []
    let n = 0
    const chat = async (_c: unknown, args: { tools?: unknown[] }) => {
      toolsSeen.push(args.tools)
      n++
      // n=1..4 全返回 tool_calls,第 5 次(强制逼答轮)才 stop —— 让 round==MAX 分支真实触发
      if (n <= MAX_TOOL_CALLS + 1) {
        return { content: '', toolCalls: [{ id: `c${n}`, name: 'read_local', arguments: '{"ids":["writing:a.md"]}' }], finishReason: 'tool_calls' }
      }
      return { content: '最终回答', toolCalls: [], finishReason: 'stop' }
    }
    const { done } = baseArgs({ chat: chat as any, executeTool: (async () => 'ok') as any })
    await done
    expect(toolsSeen[toolsSeen.length - 1]).toBeUndefined() // 最后一次逼答不带 tools
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/writing-assistant-loop.test.ts`
Expected: FAIL（`injectLatestSnapshot` 未定义；旧 loop 无依赖注入）。

- [ ] **Step 3: 实现**

重写 `electron/lib/writing-assistant/loop.ts`：

```ts
import type { AppConfig } from '../../env'
import { chatStream, type ThinkingConfig, type ChatStreamResult } from '../kimi'
import type { WritingAssistantMessage, WritingToolEvent } from '../../../src/types'
import type { Message } from '@shared/index'
import { MAX_TOOL_CALLS, parseNativeToolCall, buildToolDefinitions } from './tool-protocol'
import { executeTool } from './tools'
import type { IndexEntry } from './prompt'
import { getSearchApiKey } from '../credentials'
import { searchWeb } from '../search'

function effortToThinking(effort: 'off' | 'high' | 'max'): ThinkingConfig {
  if (effort === 'off') return { type: 'disabled' }
  return { type: 'enabled', reasoning_effort: effort }
}

export function injectLatestSnapshot(base: string, messages: WritingAssistantMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const snap = messages[i].snapshot
    if (snap && snap.trim()) {
      return `${base}\n\n## 当前文章全文快照\n\n${snap.trim()}`
    }
  }
  return base
}

export type LoopDeps = {
  chat?: typeof chatStream
  executeTool?: typeof executeTool
}

export async function runWritingAssistantTurn(
  cfg: AppConfig,
  args: {
    sessionId: string
    systemPrompt: string
    messages: WritingAssistantMessage[]
    useSearch: boolean
    thinkingEffort: 'off' | 'high' | 'max'
    send: (channel: string, ...payload: unknown[]) => void
    onChunk: (text: string) => void
    onReasoning: (text: string) => void
    signal: AbortSignal
    index: IndexEntry[]
  },
  deps: LoopDeps = {}
): Promise<void> {
  const chat = deps.chat ?? chatStream
  const exec = deps.executeTool ?? executeTool

  const systemPrompt = injectLatestSnapshot(args.systemPrompt, args.messages)
  const history: Message[] = [
    { role: 'system', content: systemPrompt },
    ...args.messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  ]
  const tools = buildToolDefinitions(args.useSearch)

  for (let round = 0; round <= MAX_TOOL_CALLS; round++) {
    const result: ChatStreamResult = await chat(
      cfg,
      { messages: history, temperature: 0.7, signal: args.signal, thinking: effortToThinking(args.thinkingEffort), tools },
      args.onChunk,
      args.onReasoning
    )

    if (result.toolCalls.length === 0) {
      if (!result.content.trim()) {
        args.send('llm:error', args.sessionId, { code: 'CHAT_EMPTY_REPLY', message: '助手未产生回答' })
        return
      }
      return
    }

    if (round === MAX_TOOL_CALLS) {
      history.push({ role: 'user', content: '工具调用已达上限，请直接基于已有信息回答用户的问题。' })
      await chat(
        cfg,
        { messages: history, temperature: 0.7, signal: args.signal, thinking: { type: 'disabled' } },
        args.onChunk,
        args.onReasoning
      )
      return
    }

    for (const raw of result.toolCalls) {
      const call = parseNativeToolCall(raw)
      if (!call) {
        history.push({ role: 'user', content: '工具调用参数无效，请检查工具参数后重试。' })
        continue
      }
      const toolResult = await exec(cfg, call, {
        send: (e: WritingToolEvent) => args.send('writingAssistant:tool', e),
        sessionId: args.sessionId,
        useSearch: args.useSearch,
        getSearchApiKey,
        searchWeb,
        index: args.index,
      })
      history.push(
        { role: 'assistant', content: `（调用工具：${call.name}）` },
        { role: 'user', content: `工具结果：\n${toolResult}` }
      )
    }
  }
}
```

> 若 Task 1 spike 结论为"工具轮与 thinking 互斥"，则 `chat` 调用在 `result` 会工具时下一次改为 `thinking: { type: 'disabled' }`（即工具轮关思考，纯回答轮开启），在此处加条件。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/writing-assistant-loop.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add electron/lib/writing-assistant/loop.ts tests/writing-assistant-loop.test.ts
git commit -m "feat(writing): loop 重写为原生 function-calling 状态机
finish_reason 判定收尾;空输出上报 CHAT_EMPTY_REPLY;工具用尽强制逼答;
injectLatestSnapshot 注入最近正文快照(S1);chat/executeTool 依赖注入可单测。"
```

---

### Task 8: store — 条件快照 + 快照按钮 + 删 insert 接线

**Files:**
- Modify: `src/store/index.ts`
- Modify: `src/types/index.ts`（`WritingToolEvent` 去掉 insert）
- Test: `tests/writing-assistant-store.test.ts`

**Interfaces:**
- store 新增字段：`writingAssistantSnapshotLit: boolean`（默认 `false`）+ action `setWritingAssistantSnapshotLit(lit: boolean)`。
- `sendWritingAssistantMessage`：`const isFirstRun = !cur || cur.messages.length === 0`；`const lit = get().writingAssistantSnapshotLit`；`const snapshot = (isFirstRun || lit) && f?.body?.trim() ? f.body : undefined`。
- `selectWritingFile` 切文件置 `writingAssistant: null` 处同时 `writingAssistantSnapshotLit: false`。
- `applyWritingAssistantToolEvent` 删除 insert 分支（start label `> 插入到文章` 与 done `> 已插入`）。
- 删除 `insertTextIntoWritingEditor`（唯一调用方是待删按钮）。
- `WritingToolEvent` 类型：`tool` 去掉 `'insert_into_article'`、删 `markdown?` 字段。

- [ ] **Step 1: 写失败的测试**

在 `tests/writing-assistant-store.test.ts` 的 `sendWritingAssistantMessage` describe 追加：

```ts
    it('attaches snapshot only on first run and when lit (S1)', async () => {
      useStore.setState({
        writingFile: { path: 'writing/a.md', body: '# v1', dirty: false, saving: 'idle' },
      })
      await useStore.getState().sendWritingAssistantMessage('首轮')
      expect(useStore.getState().writingAssistant!.messages[0].snapshot).toBe('# v1')

      // 第二轮未点亮：不挂新快照
      useStore.setState(s => s.writingAssistant ? {
        writingAssistant: { ...s.writingAssistant, messages: [...s.writingAssistant.messages, { role: 'assistant' as const, content: 'r' }], streaming: false },
      } : {})
      await useStore.getState().sendWritingAssistantMessage('第二轮未点亮')
      const m2 = useStore.getState().writingAssistant!.messages
      expect(m2[m2.length - 1].snapshot).toBeUndefined()

      // 点亮后：挂新快照
      useStore.getState().setWritingAssistantSnapshotLit(true)
      await useStore.getState().sendWritingAssistantMessage('第三轮点亮')
      const m3 = useStore.getState().writingAssistant!.messages
      expect(m3[m3.length - 1].snapshot).toBe('# v1')
    })

    it('clears snapshotLit when switching articles', async () => {
      useStore.getState().setWritingAssistantSnapshotLit(true)
      useStore.setState({ writingFile: { path: 'writing/a.md', body: '# a', dirty: false, saving: 'idle' } })
      vi.mocked(ipc.writingRead).mockResolvedValue({ ok: true, value: { body: '# b' } })
      vi.mocked(ipc.articleAssistantReadSession).mockResolvedValue(null)
      await useStore.getState().selectWritingFile('writing/b.md')
      expect(useStore.getState().writingAssistantSnapshotLit).toBe(false)
    })
```

`applyWritingAssistantToolEvent` describe 追加"insert 事件被忽略/不再出现"用例（删除现存的 `adds insert_into_article done event` 用例，改为）：

```ts
    it('ignores insert_into_article events (removed tool)', () => {
      useStore.getState().applyWritingAssistantToolEvent({
        sessionId: 'wa-001',
        phase: 'done',
        tool: 'insert_into_article',
        markdown: '# 标题',
      } as any)
      const msgs = useStore.getState().writingAssistant!.messages
      expect(msgs[1].content).toBe('让我来查一下。')
    })
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/writing-assistant-store.test.ts`
Expected: 新用例 FAIL（无条件挂 snapshot、无 snapshotLit 字段、insert 事件仍有输出）。类型错误（`WritingToolEvent` 仍含 insert）属预期——先改实现再跑。

- [ ] **Step 3: 实现**

`src/types/index.ts`：

```ts
export type WritingToolEvent = {
  sessionId: string
  phase: 'start' | 'done' | 'error'
  tool: 'read_local' | 'web_search'
  ids?: string[]
  query?: string
  error?: string
}
```

`src/store/index.ts`：
- 接口加 `writingAssistantSnapshotLit: boolean` 与 `setWritingAssistantSnapshotLit: (lit: boolean) => void`（约 407-414 行附近）。
- 初值 `writingAssistantSnapshotLit: false`（约 569 行附近）。
- 新增 action（放在 `setAssistantThinkingEffort` 后）：

```ts
  setWritingAssistantSnapshotLit: (lit) => set({ writingAssistantSnapshotLit: lit }),
```

- `sendWritingAssistantMessage`（第 2230-2236 行）改为：

```ts
  sendWritingAssistantMessage: async (text: string) => {
    const f = get().writingFile
    const sessionId = `writing-assistant-${Date.now()}`
    const cur = get().writingAssistant
    const isFirstRun = !cur || cur.messages.length === 0
    const includeSnapshot = isFirstRun || get().writingAssistantSnapshotLit
    const messages: WritingAssistantMessage[] = [
      ...(cur?.messages ?? []),
      { role: 'user' as const, content: text, snapshot: includeSnapshot && f?.body?.trim() ? f.body : undefined },
    ]
    // ...其余不变
```

- `applyWritingAssistantToolEvent`：删 start 分支的 insert label（第 2304-2306 行）与 done 分支的 insert marker（第 2323-2324 行）。
- `selectWritingFile`（第 2474 行 `set({ writingAssistant: null })`）改为 `set({ writingAssistant: null, writingAssistantSnapshotLit: false })`。
- 删除 `insertTextIntoWritingEditor`（第 2204-2215 行整段）及其接口声明（第 432 行）。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/writing-assistant-store.test.ts`
Expected: 全部 PASS（含既有用例——首轮仍挂 snapshot，`toEqual` 忽略 undefined 字段）。

- [ ] **Step 5: Commit**

```bash
git add src/store/index.ts src/types/index.ts tests/writing-assistant-store.test.ts
git commit -m "feat(writing): store 条件快照(S1)+快照按钮状态+删 insert 接线
首轮强制挂快照、点亮轮刷新、未点亮不挂;切文章重置;remove insert event 分支。"
```

---

### Task 9: UI — 快照按钮 + 移除插入按钮

**Files:**
- Modify: `src/components/writing-assistant/WritingAssistantInput.tsx`
- Modify: `src/components/writing-assistant/WritingAssistantMessages.tsx`
- Test: `tests/writing-assistant-panel.test.tsx`（存在则追加，若没有则新建组件测试）

**Interfaces:**
- Input 控制行新增 📄 按钮：`data-testid="writing-assistant-snapshot-btn"`，`aria-pressed={snapshotLit}`，`title="正文快照：点亮后每轮把当前文章全文发给助手"`。
- Messages 删除 `handleInsert`/`insertTextIntoWritingEditor` 调用/`writing-assistant-insert-btn` 按钮。

- [ ] **Step 1: 写失败的测试**

新建 `tests/writing-assistant-input.test.tsx`（注意 `writing-assistant-panel.test.tsx` 把 Input/Messages 都 stub 了，故单独测真实 Input）：

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({ ipc: { patchState: vi.fn() } }))

import { useStore } from '@/store'
import { WritingAssistantInput } from '@/components/writing-assistant/WritingAssistantInput'

describe('WritingAssistantInput snapshot button', () => {
  beforeEach(() => {
    cleanup()
    useStore.setState({
      writingAssistantSnapshotLit: false,
      writingAssistant: null,
      writingFile: null,
      assistantSearchEnabled: false,
      assistantThinkingEffort: 'off',
    } as any)
  })

  it('toggles writingAssistantSnapshotLit when clicked', () => {
    render(<WritingAssistantInput />)
    const btn = screen.getByTestId('writing-assistant-snapshot-btn')
    fireEvent.click(btn)
    expect(useStore.getState().writingAssistantSnapshotLit).toBe(true)
    expect(btn).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(btn)
    expect(useStore.getState().writingAssistantSnapshotLit).toBe(false)
  })
})
```

> 插入按钮不存在由 E2E（Task 11 "插入按钮已移除"）断言，不在组件层测（Messages 依赖 react-markdown，成本高收益低）。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/writing-assistant-input.test.tsx`
Expected: FAIL（`writing-assistant-snapshot-btn` 不存在，`getByTestId` 抛错）。

- [ ] **Step 3: 实现**

`WritingAssistantInput.tsx`：从 store 读 `writingAssistantSnapshotLit`/`setWritingAssistantSnapshotLit`，在 🔍 🧠 按钮后加：

```tsx
        <button
          data-testid="writing-assistant-snapshot-btn"
          className={`px-1.5 py-1 rounded text-sm transition-colors duration-200 disabled:opacity-30 disabled:cursor-not-allowed ${
            snapshotLit ? 'text-sky-400' : 'text-parchment/40'
          }`}
          onClick={() => setSnapshotLit(!snapshotLit)}
          disabled={streaming}
          aria-pressed={snapshotLit}
          aria-label={snapshotLit ? '正文快照已点亮' : '正文快照关闭'}
          title={snapshotLit ? '正文快照已点亮 — 每轮发送当前文章全文' : '正文快照关闭 — 点亮后每轮把当前文章全文发给助手'}
        >
          📄
        </button>
```

`WritingAssistantMessages.tsx`：删除 `handleInsert` 定义（第 68-70 行）、按钮（第 129-137 行）、`data-testid="writing-assistant-insert-btn"` 引用。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/writing-assistant-input.test.tsx tests/writing-assistant-panel.test.tsx`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/components/writing-assistant/WritingAssistantInput.tsx src/components/writing-assistant/WritingAssistantMessages.tsx tests/writing-assistant-input.test.tsx
git commit -m "feat(writing): 📄 快照按钮 + 移除插入按钮
点亮每轮传正文快照(S1 UI 出口);删除 insert 按钮(S4)。"
```

---

### Task 10: IPC — 真实分支 + E2E mock 更新

**Files:**
- Modify: `electron/ipc/writing-assistant.ts`

**Interfaces:**
- 真实分支：`runWritingAssistantTurn(cfg, {...}, {})` 加第三个参数（默认 deps），并把 `args.useSearch` 传入（loop 内据此构建工具定义）。
- E2E mock：删除 `insert_into_article` 事件（第 70-73 行）；`last-writing-request.json` 加 `hasSnapshot` 字段（取最后一条 user 消息的 `snapshot`）。

- [ ] **Step 1: 更新 E2E mock（无独立测试，依赖 Task 11 E2E）**

`electron/ipc/writing-assistant.ts`：
- 删除第 70-73 行：

```ts
        send('writingAssistant:tool', {
          sessionId: args.sessionId, phase: 'done', tool: 'insert_into_article' as const,
          markdown: '# 插入标题'
        })
```

- 第 81-87 行 `writeFileSync` 的 JSON 加 `hasSnapshot`：

```ts
          fs.writeFileSync(path.join(e2eDir, 'last-writing-request.json'), JSON.stringify({
            articlePath: args.articlePath,
            articleContent: args.articleContent,
            useSearch: args.useSearch,
            thinkingEffort: args.thinkingEffort,
            messageCount: args.messages.length,
            hasSnapshot: !!((args.messages as Array<{ snapshot?: string }>).at(-1)?.snapshot),
          }))
```

- 真实分支第 103-114 行调用加第三个参数（可省，因默认 `{}`）——确认 `runWritingAssistantTurn(cfg, {...})` 调用无需改动（默认 deps 生效）。若需显式，传 `{}`。

- [ ] **Step 2: 定向运行既有相关测试**

Run: `npx vitest run tests/writing-assistant-store.test.ts tests/writing-assistant-loop.test.ts`
Expected: 全部 PASS（确认 mock 改动未破坏 store 测试）。

- [ ] **Step 3: Commit**

```bash
git add electron/ipc/writing-assistant.ts
git commit -m "refactor(writing): IPC mock 去 insert + hasSnapshot 断言字段"
```

---

### Task 11: E2E — POM/selectors/spec 更新

**Files:**
- Modify: `e2e/helpers/selectors.ts`
- Modify: `e2e/pages/WritingAssistantPanel.ts`
- Modify: `e2e/specs/writing-assistant.spec.ts`

**Interfaces:**
- selectors 删 `assistantInsertBtn`，加 `assistantSnapshotBtn: '[data-testid="writing-assistant-snapshot-btn"]'`。
- POM 删 `insertBtn`/`insertLastMessage`，加 `snapshotBtn` 与 `toggleSnapshot()`。

- [ ] **Step 1: 更新 selectors + POM**

`e2e/helpers/selectors.ts`：`assistantInsertBtn` 行替换为 `assistantSnapshotBtn: '[data-testid="writing-assistant-snapshot-btn"]'`。

`e2e/pages/WritingAssistantPanel.ts`：删 `readonly insertBtn`、构造里 `this.insertBtn = ...`、`insertLastMessage()` 方法；加：

```ts
  readonly snapshotBtn: Locator
  ...
  this.snapshotBtn = page.locator(SELECTORS.writing.assistantSnapshotBtn)
  ...
  /** Toggle the article-snapshot (📄) button. */
  async toggleSnapshot() {
    await this.snapshotBtn.click()
  }
```

- [ ] **Step 2: 写失败的 E2E（快照块断言）**

在 `e2e/specs/writing-assistant.spec.ts` 追加：

```ts
  test('S1 快照：首轮落盘；第二轮未点亮不新增；点亮后新增', async ({ window, testLibraryPath }) => {
    const assistant = await setupAssistant(window, testLibraryPath)
    await selectArticle(window, '分布式随笔')
    await assistant.open()

    await assistant.send('快照测试一')
    await assistant.waitForStreamingDone(15000)
    // seedWritingTree 生成:writing/技术笔记/分布式随笔.md(无预置 .assistant.md)
    const sessionPath = path.join(testLibraryPath, 'writing', '技术笔记', '分布式随笔.assistant.md')
    const countSnap = (p: string) => (fs.readFileSync(p, 'utf8').match(/<!-- snapshot:start -->/g) ?? []).length
    expect(countSnap(sessionPath)).toBe(1)

    // 第二轮未点亮
    await assistant.send('快照测试二')
    await assistant.waitForStreamingDone(15000)
    expect(countSnap(sessionPath)).toBe(1)

    // 点亮后第三轮
    await assistant.toggleSnapshot()
    await assistant.send('快照测试三')
    await assistant.waitForStreamingDone(15000)
    expect(countSnap(sessionPath)).toBe(2)
  })

  test('插入按钮已移除', async ({ window, testLibraryPath }) => {
    const assistant = await setupAssistant(window, testLibraryPath)
    await selectArticle(window, '七月夜话')
    await assistant.open()
    await assistant.send('测试')
    await assistant.waitForStreamingDone(15000)
    await expect(window.locator('[data-testid="writing-assistant-insert-btn"]')).toHaveCount(0)
  })
```

> 注意：`分布式随笔` 在 seed 中位于 `writing/技术笔记/`，无预置 `.assistant.md`，故快照计数从 0 开始，首轮后为 1。若 `seedWritingTree` 目录结构有变，先读 `e2e/helpers/test-library.ts:742` 确认。

- [ ] **Step 3: 构建并运行定向 E2E**

Run: `node scripts/e2e-changed.js --run --no-retries`
Expected: 新增用例通过；既有用例（除已删 insert 引用）全绿。若旧断言引用 `insertBtn` 需一并清理。

- [ ] **Step 4: Commit**

```bash
git add e2e/helpers/selectors.ts e2e/pages/WritingAssistantPanel.ts e2e/specs/writing-assistant.spec.ts
git commit -m "test(writing): E2E 快照块断言 + 移除 insert 引用"
```

---

### Task 12: 全链验证

**Files:**
- 无新改动

- [ ] **Step 1: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误（若有错误，修到过再继续——重点看 `WritingToolEvent`/`loop`/`chatStream` 类型）。

- [ ] **Step 2: 定向单测**

Run: `npx vitest run tests/kimi.test.ts tests/writing-tool-protocol.test.ts tests/writing-assistant-tools.test.ts tests/writing-assistant-prompt.test.ts tests/writing-assistant-loop.test.ts tests/writing-assistant-store.test.ts tests/writing-assistant-panel.test.tsx tests/writing-assistant-input.test.tsx tests/writing-assistant-runtime.test.ts`
Expected: 全部 PASS。

- [ ] **Step 3: 定向 E2E**

Run: `node scripts/e2e-changed.js --run --no-retries`
Expected: 受影响 spec 全绿（含 startup-health always 项）。

- [ ] **Step 4: 手动 smoke（可选但推荐）**

`npm run dev` → 打开写作 → 选一篇文章 → 开助手 → 发消息：
- 首轮后 `.assistant.md` 有 snapshot 块；
- 第二轮未点亮无新块；
- 点亮 📄 后发消息有新块；
- 无"插入到编辑器"按钮；
- 若读文件（引目录里的 id）能成功读出内容（S2 修复生效）。

- [ ] **Step 5: 提交遗留**

无新代码改动时跳过；若有修复，单独 commit。
