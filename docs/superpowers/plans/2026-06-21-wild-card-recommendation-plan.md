# 意外之径（随机推荐）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Home 页「推开下一扇门」区域顶部新增一个名为「意外之径」的跨学科随机主题推荐卡片，用户可手动刷新，刷新前内容保持不变。

**Architecture:** 复用现有 `chatNonStream` LLM 调用链路：新增 prompt 文件与主进程生成函数，通过新 IPC 通道暴露给渲染进程；Zustand store 负责状态与持久化；新组件 `WildCardRecCard` 负责 UI 与刷新交互，由 `Home` 页面置顶渲染。

**Tech Stack:** Electron 30 + React 18 + TypeScript + Tailwind CSS + Zustand + Vitest

---

## File Structure

**新建文件：**
- `electron/prompts/wild-card-v1.md` — prompt 模板
- `src/components/WildCardRecCard.tsx` — 随机推荐卡片组件
- `tests/wild-card-prompt.test.ts` — prompt 内容测试

**修改文件：**
- `src/types/index.ts` — 新增 `wildCardInspiration` 到 `StateJson`，新增 `llmWildCardInspiration` 到 `IpcApi`
- `src/lib/ipc.ts` — 新增 `llmWildCardInspiration` facade
- `electron/lib/llm-tasks.ts` — 新增 `generateWildCardInspiration` 函数
- `electron/ipc/llm.ts` — 注册 `llm:wildCardInspiration` 处理器
- `src/store/index.ts` — 新增状态、action 与初始化加载
- `src/pages/Home.tsx` — 在分组推荐列表顶部渲染 `WildCardRecCard`
- `tests/llm-tasks.test.ts` — 补充 `generateWildCardInspiration` 测试

---

### Task 1: 扩展类型定义

**Files:**
- Modify: `src/types/index.ts:106-116`
- Modify: `src/types/index.ts:118-209`

- [ ] **Step 1: 在 `StateJson` 中新增 `wildCardInspiration`**

```typescript
export type StateJson = {
  version: 1
  profile: Profile
  lastUsed: { difficulty: Difficulty; temperature: Temperature }
  groupInspirations: Record<string, NewTopic>
  wildCardInspiration?: NewTopic          // ← 新增
  ui: { session_count: number }
  inspirationStrategy: 'v1' | 'v2' | 'v3'
  fableStyleTags: string[]
  lastFableTags: string[]
  topicContinueSuggestions: Record<string, TopicContinueCache>
}
```

- [ ] **Step 2: 在 `IpcApi` 中新增 `llmWildCardInspiration`**

```typescript
llmWildCardInspiration: (args: {
  profile: Profile
  topics: { title: string }[]
}) => Promise<NewTopic>
```

- [ ] **Step 3: 运行类型检查**

Run: `npx tsc --noEmit`
Expected: 无新增类型错误（可能报现有错误，忽略）

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts
git commit -m "types: add wildCardInspiration state and IPC type"
```

---

### Task 2: 渲染进程 IPC Facade

**Files:**
- Modify: `src/lib/ipc.ts:26-28`

- [ ] **Step 1: 在 `ipc` 对象中新增 getter**

```typescript
get llmWildCardInspiration() { return ensure().llmWildCardInspiration },
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/ipc.ts
git commit -m "ipc: expose llmWildCardInspiration facade"
```

---

### Task 3: 编写 Wild Card Prompt

**Files:**
- Create: `electron/prompts/wild-card-v1.md`

- [ ] **Step 1: 创建 prompt 文件**

```markdown
你正在扮演「意外之径推荐官」。

【你的角色】
你熟悉人类知识的各个领域，善于把远离学习者舒适区的概念包装成一次诱人的探索邀请。
你的任务：读取用户学习历史，推荐一个与学习历史**毫不相关**但**极具吸引力**的新主题。

【学习者信息】
{{profile_text}}

【学习历史】
用户已学习过的主题列表：
{{topic_list}}

【任务要求】
1. 推荐的主题必须与上述学习历史没有明显学科重叠。
2. 主题应来自以下跨学科候选域（但不限于）：热力学/熵增、量子物理、脑科学/神经科学、经济学原理、复杂系统、认知偏差、信息论、进化论、社会网络、语言学底层结构。
3. 用一句话 hook 说明：为什么一个完全不了解这个领域的人也会觉得它有趣。
4. 不要强行关联学习者身份或已有主题。
5. 不要推荐列表中已存在的主题、变体或延伸。
6. Hook 不超过 40 个汉字，优先使用日常可感知的比喻，强调「反直觉」或「底层解释力」。

【格式强制要求】
- 请只输出一个 JSON 对象，不要任何其他内容
- 不要 markdown 代码块（如 ```json），不要解释说明
- 回复必须直接以 { 开头，以 } 结尾
- 示例：{ "topic": "熵增定律", "hook": "它解释为什么房间总会变乱，也解释宇宙最终的命运。" }
```

- [ ] **Step 2: Commit**

```bash
git add electron/prompts/wild-card-v1.md
git commit -m "prompts: add wild-card-v1 recommendation prompt"
```

---

### Task 4: 实现主进程生成函数

**Files:**
- Modify: `electron/lib/llm-tasks.ts:1-10`
- Modify: `electron/lib/llm-tasks.ts:283-284`

- [ ] **Step 1: 确保导入 `Profile` 类型**

`electron/lib/llm-tasks.ts` 第 9 行已有：

```typescript
import type { Profile, NewTopic, Message, ContinueTopicSuggestion } from '@shared/index'
```

无需修改。

- [ ] **Step 2: 在 `generateGroupInspiration` 之后添加 `generateWildCardInspiration`**

```typescript
export async function generateWildCardInspiration(
  cfg: AppConfig,
  args: {
    profile: Profile
    topics: { title: string }[]
  }
): Promise<NewTopic> {
  const topicList = args.topics.length > 0
    ? args.topics.map(t => `- ${t.title}`).join('\n')
    : '（学习库为空）'

  const prompt = read('wild-card-v1.md')
    .replace('{{profile_text}}', args.profile.profile_text)
    .replace('{{topic_list}}', topicList)

  const text = await chatNonStream(cfg, {
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.8,
    thinking: { type: 'enabled', reasoning_effort: 'max' }
  })

  const extracted = extractJsonObject(text)
  if (!extracted) {
    const debugDir = path.join(os.homedir(), '.studyparlor', 'debug')
    fs.mkdirSync(debugDir, { recursive: true })
    const debugFile = path.join(debugDir, `wild-card-fail-${Date.now()}.txt`)
    fs.writeFileSync(debugFile, `=== Prompt ===\n${prompt}\n\n=== LLM Response ===\n${text}`, 'utf8')
    throw new Error(`JSON extraction failed. Debug written to: ${debugFile}`)
  }

  const json = JSON.parse(extracted) as NewTopic
  if (!json.topic || !json.hook) throw new Error('shape')
  return json
}
```

- [ ] **Step 3: 运行相关测试**

Run: `npx vitest run tests/llm-tasks.test.ts`
Expected: 现有测试全部通过

- [ ] **Step 4: Commit**

```bash
git add electron/lib/llm-tasks.ts
git commit -m "feat(llm): add generateWildCardInspiration task"
```

---

### Task 5: 注册 IPC 处理器

**Files:**
- Modify: `electron/ipc/llm.ts:4`
- Modify: `electron/ipc/llm.ts:65-78`

- [ ] **Step 1: 更新 `generateGroupInspiration` 的导入，加入 `generateWildCardInspiration`**

```typescript
import { finalizeProgress, finalizeReview, generateFable, generateGroupInspiration, generateFableFromReport, generateContinueSuggestions, generateWildCardInspiration } from '../lib/llm-tasks'
```

- [ ] **Step 2: 在 `llm:groupInspiration` 处理器附近添加 `llm:wildCardInspiration` 处理器**

```typescript
ipcMain.handle('llm:wildCardInspiration', async (_, args: {
  profile: Profile
  topics: { title: string }[]
}) => {
  try {
    return await generateWildCardInspiration(cfg, args)
  } catch (err: any) {
    const message = String(err?.message ?? err)
    console.error('[llm:wildCardInspiration] error:', message)
    throw new Error(message)
  }
})
```

- [ ] **Step 3: Commit**

```bash
git add electron/ipc/llm.ts
git commit -m "feat(ipc): register llm:wildCardInspiration handler"
```

---

### Task 6: 扩展 Store 状态与 Actions

**Files:**
- Modify: `src/store/index.ts:56-58`
- Modify: `src/store/index.ts:146-148`
- Modify: `src/store/index.ts:157-176`
- Modify: `src/store/index.ts:390-414`

- [ ] **Step 1: 在 `AppStore` 类型中添加状态与 actions**

```typescript
groupInspirations: Record<string, NewTopic>
inspirationStrategy: 'v1' | 'v2' | 'v3'
wildCardInspiration: NewTopic | null          // ← 新增
topicContinueSuggestions: Record<string, TopicContinueCache>
```

```typescript
setGroupInspiration: (groupId: string, topic: NewTopic) => void
removeGroupInspiration: (groupId: string) => void
setInspirationStrategy: (s: 'v1' | 'v2' | 'v3') => void
setWildCardInspiration: (topic: NewTopic | null) => void      // ← 新增
refreshWildCardInspiration: () => Promise<void>               // ← 新增
```

- [ ] **Step 2: 在初始状态中添加 `wildCardInspiration: null`**

```typescript
groupInspirations: {},
inspirationStrategy: 'v2',
wildCardInspiration: null,          // ← 新增
topicContinueSuggestions: {},
```

- [ ] **Step 3: 在 `init` 中从 state 恢复 `wildCardInspiration`**

```typescript
set({
  profile: state.profile,
  lastUsed: state.lastUsed ?? { difficulty: 'mid', temperature: 0.7 },
  groupInspirations: state.groupInspirations ?? {},
  wildCardInspiration: state.wildCardInspiration ?? null,   // ← 新增
  inspirationStrategy: state.inspirationStrategy ?? 'v2',
  ...
})
```

- [ ] **Step 4: 在 store 末尾添加 action 实现**

```typescript
setWildCardInspiration: (topic) => {
  set({ wildCardInspiration: topic })
  ipc.patchState({ wildCardInspiration: topic } as Partial<StateJson>)
},

refreshWildCardInspiration: async () => {
  const { profile, library, setWildCardInspiration } = get()
  const topics = library.map(t => ({ title: t.title }))
  const result = await ipc.llmWildCardInspiration({ profile, topics })
  setWildCardInspiration(result)
},
```

- [ ] **Step 5: Commit**

```bash
git add src/store/index.ts
git commit -m "feat(store): add wildCardInspiration state, persistence and refresh action"
```

---

### Task 7: 实现 WildCardRecCard 组件

**Files:**
- Create: `src/components/WildCardRecCard.tsx`

- [ ] **Step 1: 创建组件文件**

```typescript
import { useState, useCallback, useEffect } from 'react'
import { useStore } from '@/store'
import { ipc } from '@/lib/ipc'
import { StarOrbit } from './StarOrbit'

export function WildCardRecCard({
  onClickTopic
}: {
  onClickTopic: (topic: string) => void
}) {
  const profile = useStore((s) => s.profile)
  const library = useStore((s) => s.library)
  const cached = useStore((s) => s.wildCardInspiration)
  const setWildCardInspiration = useStore((s) => s.setWildCardInspiration)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const recommendation = cached ?? null

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    setErrorMsg('')
    try {
      const topics = library.map((t) => ({ title: t.title }))
      const result = await ipc.llmWildCardInspiration({ profile, topics })
      setWildCardInspiration(result)
    } catch (err: any) {
      const msg = String(err?.message ?? err)
      console.error('[WildCardRecCard] load error:', msg)
      setErrorMsg(msg)
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [profile, library, setWildCardInspiration])

  const refresh = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    load()
  }, [load])

  // 首次加载：无缓存且无错误时才触发
  useEffect(() => {
    if (!cached && !error) {
      load()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading && !recommendation) {
    return (
      <div className="bg-ink/70 backdrop-blur-md border border-violet/30 rounded py-3 px-4">
        <div className="flex flex-col items-center gap-3 py-2">
          <StarOrbit starCount={4} radius={14} period={3000} showLines={true} />
          <span className="text-xs text-parchment/40 font-sans italic tracking-wide">
            正在闯入…
          </span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <button
        onClick={() => load()}
        className="block w-full text-left bg-ink/70 backdrop-blur-md border border-violet/30 rounded py-3 px-4 hover:border-violet/50 transition-colors"
      >
        <div className="text-xs text-parchment/40 font-sans mb-1">
          这次闯入失败了，再试一次
        </div>
        {errorMsg && (
          <div className="text-[10px] text-red-400/70 font-sans break-words max-h-16 overflow-y-auto leading-relaxed">
            {errorMsg}
          </div>
        )}
      </button>
    )
  }

  if (!recommendation) return null

  return (
    <div
      className="relative bg-ink/70 backdrop-blur-md border border-violet/30 border-l-4 border-l-violet rounded overflow-hidden hover:border-violet/60 hover:bg-ink/80 transition-all cursor-pointer group"
      onClick={(e) => {
        const target = e.target as HTMLElement
        if (target.closest('[data-refresh]')) return
        onClickTopic(recommendation.topic)
      }}
    >
      {loading && (
        <div className="absolute inset-0 bg-ink/60 backdrop-blur-sm z-10 flex flex-col items-center justify-center gap-2">
          <StarOrbit starCount={4} radius={12} period={3000} showLines={true} />
          <span className="text-[10px] text-parchment/50 font-sans italic tracking-wide">
            正在闯入…
          </span>
        </div>
      )}

      <div className="px-3 py-2.5 relative">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-sans px-2 py-0.5 rounded bg-violet/15 text-violet">
            ✦ 意外之径
          </span>
          <button
            data-refresh
            onClick={refresh}
            disabled={loading}
            className={`w-5 h-5 flex items-center justify-center rounded text-parchment/40 hover:text-violet hover:bg-violet/10 transition-all ${loading ? 'animate-spin' : ''}`}
            title="换一条"
          >
            ↻
          </button>
        </div>
        <div className="font-serif text-[0.95rem] text-parchment font-semibold mb-1">
          {recommendation.topic}
        </div>
        <div className="text-xs text-parchment/50 leading-relaxed italic">
          {recommendation.hook}
        </div>
      </div>
    </div>
  )
}
```

注意：Tailwind 自定义颜色 `violet` 默认不存在。确认 `tailwind.config.ts` 是否已定义 `violet: '#8b7fb8'`。如未定义，需使用内联样式或扩展配置。

- [ ] **Step 2: 检查 tailwind 配置**

如果 `tailwind.config.ts` 没有 `violet` 颜色，添加：

```typescript
colors: {
  // ... 现有颜色
  violet: '#8b7fb8',
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/WildCardRecCard.tsx tailwind.config.ts
git commit -m "feat(ui): add WildCardRecCard component"
```

---

### Task 8: 在 Home 页插入卡片

**Files:**
- Modify: `src/pages/Home.tsx:1-8`
- Modify: `src/pages/Home.tsx:82-105`

- [ ] **Step 1: 导入 `WildCardRecCard`**

```typescript
import { WildCardRecCard } from '@/components/WildCardRecCard'
```

- [ ] **Step 2: 在分组推荐列表顶部渲染 `WildCardRecCard`**

```typescript
{/* 从已知推未知 */}
<div className="flex flex-col gap-2">
  <div className="flex items-center justify-between px-1">
    <span className="text-xs text-parchment/40 font-sans">推开下一扇门</span>
    <StrategyToggle />
  </div>

  <WildCardRecCard
    onClickTopic={(topic) => openPreStudy({ mode: 'progress', topic })}
  />

  {groups.map((group) => {
    ...
  })}
</div>
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/Home.tsx
git commit -m "feat(home): render WildCardRecCard above group recommendations"
```

---

### Task 9: 添加 Prompt 测试

**Files:**
- Create: `tests/wild-card-prompt.test.ts`

- [ ] **Step 1: 创建测试文件**

```typescript
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const PROMPTS_DIR = path.resolve(__dirname, '..', 'electron', 'prompts')

function readPrompt(name: string): string {
  return fs.readFileSync(path.join(PROMPTS_DIR, name), 'utf8')
}

describe('wild-card-v1.md', () => {
  const prompt = readPrompt('wild-card-v1.md')

  it('contains required placeholders', () => {
    expect(prompt).toContain('{{profile_text}}')
    expect(prompt).toContain('{{topic_list}}')
  })

  it('requires JSON output with topic and hook', () => {
    expect(prompt).toContain('"topic"')
    expect(prompt).toContain('"hook"')
    expect(prompt).toMatch(/\{[^}]*topic[^}]*hook[^}]*\}/)
  })

  it('instructs to avoid related topics', () => {
    expect(prompt).toContain('毫不相关')
    expect(prompt).toContain('不要推荐列表中已存在的主题')
  })

  it('limits hook length', () => {
    expect(prompt).toContain('不超过 40 个汉字')
  })
})
```

- [ ] **Step 2: 运行测试**

Run: `npx vitest run tests/wild-card-prompt.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/wild-card-prompt.test.ts
git commit -m "test(prompts): add wild-card prompt content tests"
```

---

### Task 10: 补充 LLM Tasks 测试

**Files:**
- Modify: `tests/llm-tasks.test.ts:1-9`
- Modify: `tests/llm-tasks.test.ts:179-180`

- [ ] **Step 1: 在导入列表中加入 `generateWildCardInspiration`**

```typescript
import {
  generateGroupInspiration,
  generateWildCardInspiration,          // ← 新增
  finalizeProgress,
  finalizeReview,
  generateFableFromReport,
  generateContinueSuggestions,
  readTopicReportSummaries
} from '@electron/lib/llm-tasks'
```

- [ ] **Step 2: 在 `generateGroupInspiration` 测试块之后添加新 describe**

```typescript
describe('generateWildCardInspiration', () => {
  it('parses valid JSON object', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"topic":"熵增定律","hook":"它解释为什么房间总会变乱。"}' } }]
      })
    })) as any)
    const out = await generateWildCardInspiration(cfg, {
      profile,
      topics: [{ title: '康德' }, { title: 'React Hooks' }]
    })
    expect(out.topic).toBe('熵增定律')
    expect(out.hook).toBe('它解释为什么房间总会变乱。')
  })

  it('strips markdown code block before parsing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '```json\n{"topic":"量子纠缠","hook":"粒子间的幽灵同步。"}\n```' } }]
      })
    })) as any)
    const out = await generateWildCardInspiration(cfg, {
      profile,
      topics: [{ title: '康德' }]
    })
    expect(out.topic).toBe('量子纠缠')
    expect(out.hook).toBe('粒子间的幽灵同步。')
  })

  it('passes profile and topics into prompt', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"topic":"T","hook":"h"}' } }] })
    }))
    vi.stubGlobal('fetch', fetchSpy as any)
    await generateWildCardInspiration(cfg, {
      profile: { ...profile, profile_text: '产品经理，喜欢哲学' },
      topics: [{ title: '康德' }, { title: '尼采' }]
    })
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
    expect(body.messages[0].content).toContain('产品经理，喜欢哲学')
    expect(body.messages[0].content).toContain('康德')
    expect(body.messages[0].content).toContain('尼采')
  })

  it('throws on parse failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, json: async () => ({ choices: [{ message: { content: 'not json' } }] })
    })) as any)
    await expect(generateWildCardInspiration(cfg, {
      profile,
      topics: []
    })).rejects.toThrow()
  })
})
```

- [ ] **Step 3: 运行测试**

Run: `npx vitest run tests/llm-tasks.test.ts`
Expected: 全部通过

- [ ] **Step 4: Commit**

```bash
git add tests/llm-tasks.test.ts
git commit -m "test(llm): add generateWildCardInspiration tests"
```

---

## Self-Review

### Spec coverage

| 设计文档要求 | 实现任务 |
|-------------|---------|
| Home 左侧置顶独立卡片 | Task 8 |
| 紫罗兰色条 + 「意外之径」徽章 | Task 7 |
| 用户手动刷新，不刷新不换 | Task 6 + Task 7 |
| 持久化到 `state.json` | Task 6 |
| 读取整个学习库历史 | Task 4 + Task 6 |
| 推荐毫不相关的跨学科主题 | Task 3 |
| 输出 JSON `{ topic, hook }` | Task 3 + Task 4 |
| 错误处理与重试 | Task 7 |
| 测试覆盖 | Task 9 + Task 10 |

### Placeholder scan

- 无 TBD/TODO
- 无 "添加适当错误处理" 等模糊描述
- 每个代码步骤均包含实际代码
- 类型、函数名前后一致

### Type consistency

- `StateJson.wildCardInspiration?: NewTopic` 与 store `wildCardInspiration: NewTopic | null` 一致
- `IpcApi.llmWildCardInspiration` 签名与主进程处理器、renderer facade、store action 一致
- prompt 变量 `{{profile_text}}` 和 `{{topic_list}}` 与 `generateWildCardInspiration` 替换逻辑一致

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-21-wild-card-recommendation-plan.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
