# GroupRecCard "从已知推未知" 重设计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix GroupRecCard refresh flicker bug, rewrite recommendation prompts with 3 strategy variants, add a strategy toggle UI.

**Architecture:** Types-first approach: extend `StateJson` and `IpcApi` types, then propagate changes through state → IPC → LLM → prompts, and finally UI components. Three prompt files coexist; a global strategy state selects which one to use on each refresh.

**Tech Stack:** Electron 30, React 18, TypeScript, Zustand, Vitest

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/types/index.ts` | Modify | Add `inspirationStrategy` to `StateJson`; add `strategy` to `IpcApi.llmGroupInspiration` |
| `electron/ipc/state.ts` | Modify | Add `inspirationStrategy` default to `DEFAULT` state |
| `electron/ipc/llm.ts` | Modify | Pass `strategy` arg through to `generateGroupInspiration` |
| `electron/lib/llm-tasks.ts` | Modify | Read strategy-specific prompt file |
| `src/store/index.ts` | Modify | Add `inspirationStrategy` state + setter; pass strategy through IPC |
| `src/components/GroupRecCard.tsx` | Modify | Remove `removeGroupInspiration` from refresh; add loading overlay |
| `src/components/StrategyToggle.tsx` | Create | Small button cycling v1→v2→v3 with colored borders |
| `src/pages/Home.tsx` | Modify | Add `StrategyToggle` next to section title |
| `electron/prompts/group-inspiration-v1.md` | Create | "领域盲区" prompt variant |
| `electron/prompts/group-inspiration-v2.md` | Create | "知识树分支" prompt variant (default) |
| `electron/prompts/group-inspiration-v3.md` | Create | "知识闭环" prompt variant |
| `electron/prompts/group-inspiration.md` | Delete | Replaced by 3 variants |
| `tests/types.test.ts` | Modify | Add test for `inspirationStrategy` field in `StateJson` |
| `tests/llm-tasks.test.ts` | Modify | Add test for `strategy` parameter passing in `generateGroupInspiration` |

---

## Task 1: Extend Types

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add `inspirationStrategy` to `StateJson`**

In `src/types/index.ts`, add `inspirationStrategy` to the `StateJson` type:

```typescript
export type StateJson = {
  version: 1
  profile: Profile
  lastUsed: { difficulty: Difficulty; temperature: Temperature }
  suggested_new_topics: { generated_at: string; topics: NewTopic[] } | null
  groupInspirations: Record<string, NewTopic>
  ui: { session_count: number }
  inspirationStrategy: 'v1' | 'v2' | 'v3'  // ← add this line
}
```

- [ ] **Step 2: Add `strategy` to `IpcApi.llmGroupInspiration`**

In the same file, modify the `llmGroupInspiration` signature:

```typescript
llmGroupInspiration: (args: {
  groupName: string
  topics: { dirName: string; title: string }[]
  profile: Profile
  strategy?: 'v1' | 'v2' | 'v3'  // ← add this line
}) => Promise<NewTopic>
```

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "types: add inspirationStrategy to StateJson and IpcApi"
```

---

## Task 2: State Defaults

**Files:**
- Modify: `electron/ipc/state.ts`

- [ ] **Step 1: Add `inspirationStrategy` default**

In `electron/ipc/state.ts`, add the field to `DEFAULT`:

```typescript
const DEFAULT: StateJson = {
  version: 1,
  profile: { name: '', profile_text: '', preferred_topics: [] },
  lastUsed: { difficulty: 'mid', temperature: 0.7 },
  suggested_new_topics: null,
  groupInspirations: {},
  ui: { session_count: 0 },
  inspirationStrategy: 'v2'  // ← add this line
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/ipc/state.ts
git commit -m "state: default inspirationStrategy to v2"
```

---

## Task 3: Pass Strategy Through IPC Chain

**Files:**
- Modify: `electron/ipc/llm.ts`
- Modify: `electron/lib/llm-tasks.ts`

- [ ] **Step 1: Accept `strategy` in LLM IPC handler**

In `electron/ipc/llm.ts`, modify the `llm:groupInspiration` handler:

```typescript
// Current (lines 57-61):
ipcMain.handle('llm:groupInspiration', async (_, args: {
  groupName: string
  topics: { dirName: string; title: string }[]
  profile: Profile
}) => generateGroupInspiration(cfg, args))

// Replace with:
ipcMain.handle('llm:groupInspiration', async (_, args: {
  groupName: string
  topics: { dirName: string; title: string }[]
  profile: Profile
  strategy?: 'v1' | 'v2' | 'v3'
}) => generateGroupInspiration(cfg, args))
```

- [ ] **Step 2: Accept `strategy` in `generateGroupInspiration`**

In `electron/lib/llm-tasks.ts`, modify the function signature and prompt reading logic:

```typescript
// Current function signature (lines 219-225):
export async function generateGroupInspiration(
  cfg: AppConfig,
  args: {
    groupName: string
    topics: { dirName: string; title: string }[]
    profile: Profile
  }
): Promise<NewTopic> {

// Replace with:
export async function generateGroupInspiration(
  cfg: AppConfig,
  args: {
    groupName: string
    topics: { dirName: string; title: string }[]
    profile: Profile
    strategy?: 'v1' | 'v2' | 'v3'
  }
): Promise<NewTopic> {
```

Then change the prompt file reading (around line 239):

```typescript
// Current:
const prompt = read('group-inspiration.md')

// Replace with:
const strategyFile = args.strategy ? `group-inspiration-${args.strategy}.md` : 'group-inspiration-v2.md'
const prompt = read(strategyFile)
```

- [ ] **Step 3: Commit**

```bash
git add electron/ipc/llm.ts electron/lib/llm-tasks.ts
git commit -m "ipc: pass inspiration strategy through to prompt selection"
```

---

## Task 4: Add Strategy State to Zustand Store

**Files:**
- Modify: `src/store/index.ts`

- [ ] **Step 1: Add `inspirationStrategy` to store type and state**

In `src/store/index.ts`, add to the `AppStore` type (around line 56, after `groupInspirations`):

```typescript
groupInspirations: Record<string, NewTopic>
inspirationStrategy: 'v1' | 'v2' | 'v3'  // ← add
```

Add to the initial state object (around line 126):

```typescript
groupInspirations: {},
inspirationStrategy: 'v2'  // ← add
```

- [ ] **Step 2: Load strategy from persisted state**

In the `init` function (around line 140), add:

```typescript
set({
  profile: state.profile,
  lastUsed: state.lastUsed,
  inspirations: state.suggested_new_topics?.topics ?? [],
  groupInspirations: state.groupInspirations ?? {},
  inspirationStrategy: state.inspirationStrategy ?? 'v2',  // ← add this line
  session_count: state.ui?.session_count ?? 0,
  library,
  unsavedSessions: unsaved,
  groups: groupsData.groups,
  groupMapping: groupsData.mapping
})
```

- [ ] **Step 3: Add setter action**

Add to the `AppStore` type (around line 105, after `removeGroupInspiration`):

```typescript
setInspirationStrategy: (s: 'v1' | 'v2' | 'v3') => void  // ← add
```

Add to the store implementation (after `removeGroupInspiration`):

```typescript
setInspirationStrategy: (strategy) => {
  set({ inspirationStrategy: strategy })
  ipc.patchState({ inspirationStrategy: strategy } as Partial<StateJson>)
},
```

- [ ] **Step 4: Pass strategy through when fetching group inspiration**

In the `load` callback inside `GroupRecCard`, we need to pass the strategy. But `GroupRecCard` doesn't have access to the strategy directly through props. The simplest approach: read it from the store inside `GroupRecCard.load`.

Actually, looking more carefully at the current code, `GroupRecCard` is a separate component that reads from `useStore`. We can read the strategy inside `GroupRecCard`. We'll handle this in Task 6.

For now, the store changes are complete.

- [ ] **Step 5: Commit**

```bash
git add src/store/index.ts
git commit -m "store: add inspirationStrategy state with setter and persistence"
```

---

## Task 5: Create Prompt Files

**Files:**
- Create: `electron/prompts/group-inspiration-v1.md`
- Create: `electron/prompts/group-inspiration-v2.md`
- Create: `electron/prompts/group-inspiration-v3.md`
- Delete: `electron/prompts/group-inspiration.md`

- [ ] **Step 1: Create v1 prompt**

```bash
cat > electron/prompts/group-inspiration-v1.md << 'EOF'
你正在为一个知识领域推荐新学习主题。

领域: {{group_name}}
已覆盖的主题: {{topic_summaries}}

这个领域中，有哪些基础概念、常见技术或重要分支是学习者目前尚未覆盖的？推荐其中一个最值得了解的。

约束：
1. 不要推荐已有主题的变体、深挖、或抽象延伸。
2. 应该是该领域中"常见但你还没学"的东西——别人聊起这个领域时会默认你知道。
3. 是一个独立的、30-45分钟能覆盖核心概念的知识单元。
4. 不要硬拗与学习者个人身份的直接关联。
5. Hook 文案说明：为什么这个主题是该领域的"常识盲区"，不超过40字。

输出 JSON: { "topic": "主题名", "hook": "hook文案" }
EOF
```

- [ ] **Step 2: Create v2 prompt**

```bash
cat > electron/prompts/group-inspiration-v2.md << 'EOF'
你正在为一个知识领域推荐新学习主题。

领域: {{group_name}}
已点亮的节点: {{topic_summaries}}

这个领域是一棵知识树。已点亮的节点标记了学习者当前覆盖的位置。你的任务：在这棵树上，推荐一个尚未被点亮的、值得探索的新分支。

约束：
1. 推荐是知识树上的另一个分支，不是已有节点的深挖或抽象延伸。
2. 应该是一个独立的、30-45分钟能覆盖核心概念的知识单元。
3. 与已有节点可以有关（前置/伴生/互补/对比），但关系不必很强——关键是同属"{{group_name}}"这棵树。
4. 不要硬拗与学习者个人身份的直接关联。
5. 不要重复已有节点。
6. Hook 文案：说明这个节点在知识树中的位置/角色，让用户意识到"原来还有这个分支值得了解"。不超过40字。

输出 JSON: { "topic": "主题名", "hook": "hook文案" }
EOF
```

- [ ] **Step 3: Create v3 prompt**

```bash
cat > electron/prompts/group-inspiration-v3.md << 'EOF'
你正在为一个知识领域推荐新学习主题。

领域: {{group_name}}
已有主题: {{topic_summaries}}

这些主题之间可能存在缺口——学了 A 和 C，但中间的 B 还没学；或者学了理论但缺一个对比视角；或者学了工具但缺协议。推荐一个能填补这种缺口的概念。

约束：
1. 推荐不是已有主题的延伸，而是让已有知识更完整的一个"连接件"。
2. 是一个独立的、30-45分钟能覆盖核心概念的知识单元。
3. 不要硬拗与学习者个人身份的直接关联。
4. 不要重复已有节点。
5. Hook 文案：暗示这个主题与已有知识的连接方式（如"如果说 X 是 Y，那 Z 就是 W"），不超过40字。

输出 JSON: { "topic": "主题名", "hook": "hook文案" }
EOF
```

- [ ] **Step 4: Delete old prompt**

```bash
rm electron/prompts/group-inspiration.md
```

- [ ] **Step 5: Commit**

```bash
git add electron/prompts/group-inspiration-v1.md electron/prompts/group-inspiration-v2.md electron/prompts/group-inspiration-v3.md
git rm electron/prompts/group-inspiration.md
git commit -m "prompts: add 3 group inspiration variants, remove old unified prompt"
```

---

## Task 6: Fix GroupRecCard Refresh Flicker

**Files:**
- Modify: `src/components/GroupRecCard.tsx`

- [ ] **Step 1: Remove `removeGroupInspiration` from refresh and deps**

In `src/components/GroupRecCard.tsx`, remove `removeGroupInspiration` from imports and usage:

```typescript
// Current imports (lines 1-6):
import { useState, useCallback, useEffect } from 'react'
import { useStore } from '@/store'
import type { Group } from '@shared/index'
import { ipc } from '@/lib/ipc'
import { StarOrbit } from './StarOrbit'

// Remove from destructured hooks (around line 18):
const removeGroupInspiration = useStore((s) => s.removeGroupInspiration)  // ← delete this line

// Current refresh (lines 47-50):
const refresh = useCallback(() => {
  removeGroupInspiration(group.id)
  load()
}, [group.id, removeGroupInspiration, load])

// Replace with:
const refresh = useCallback(() => {
  load()
}, [load])
```

- [ ] **Step 2: Add loading overlay when recommendation exists**

Replace the final return block (starting around line 88) to show loading overlay:

```tsx
// Current return block (lines 88-137), replace entirely with:
return (
  <div
    className="relative bg-ink/70 backdrop-blur-md border border-slate/40 rounded overflow-hidden hover:border-ember/60 hover:bg-ink/80 transition-all cursor-pointer group"
    onClick={(e) => {
      const target = e.target as HTMLElement
      if (target.closest('[data-refresh]')) return
      onClickTopic(recommendation.topic)
    }}
  >
    {/* 左侧色条 */}
    <div
      className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l overflow-hidden transition-all group-hover:w-1"
      style={{ backgroundColor: group.color }}
    >
      <div
        className="absolute inset-0 opacity-0 group-hover:animate-lightSweep"
        style={{
          background: 'linear-gradient(180deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%)',
        }}
      />
    </div>

    <div className="pl-4 pr-3 py-2.5 relative">
      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 bg-ink/60 backdrop-blur-sm z-10 flex flex-col items-center justify-center gap-2">
          <StarOrbit starCount={4} radius={12} period={3000} showLines={true} />
          <span className="text-[10px] text-parchment/50 font-sans italic tracking-wide">
            正在浮现…
          </span>
        </div>
      )}

      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-sans tracking-wide" style={{ color: group.color + 'cc' }}>
          {group.name}
        </span>
        <button
          data-refresh
          onClick={(e) => {
            e.stopPropagation()
            refresh()
          }}
          disabled={loading}
          className={`w-5 h-5 flex items-center justify-center rounded text-parchment/40 hover:text-ember hover:bg-ember/10 transition-all ${loading ? 'animate-spin' : ''}`}
          title="换一个"
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
```

- [ ] **Step 3: Pass strategy to IPC call**

In the `load` callback, add the `strategy` parameter to the IPC call. First, read the strategy from the store:

```typescript
// Add near line 17 (after profile):
const inspirationStrategy = useStore((s) => s.inspirationStrategy)
```

Then pass it in the `ipc.llmGroupInspiration` call (around line 33):

```typescript
const result = await ipc.llmGroupInspiration({
  groupName: group.name,
  topics,
  profile,
  strategy: inspirationStrategy  // ← add this line
})
```

Also add `inspirationStrategy` to the `load` useCallback deps.

- [ ] **Step 4: Commit**

```bash
git add src/components/GroupRecCard.tsx
git commit -m "fix(GroupRecCard): remove cache-clear on refresh, add loading overlay"
```

---

## Task 7: Create StrategyToggle Component

**Files:**
- Create: `src/components/StrategyToggle.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useState } from 'react'
import { useStore } from '@/store'

const STRATEGY_META: Record<string, { label: string; color: string }> = {
  v1: { label: '领域盲区', color: '#d97757' },
  v2: { label: '知识树分支', color: '#7c9cb5' },
  v3: { label: '知识闭环', color: '#6b8f71' },
}

export function StrategyToggle() {
  const inspirationStrategy = useStore((s) => s.inspirationStrategy)
  const setInspirationStrategy = useStore((s) => s.setInspirationStrategy)
  const [hovered, setHovered] = useState(false)

  const cycle = () => {
    const order: Array<'v1' | 'v2' | 'v3'> = ['v1', 'v2', 'v3']
    const idx = order.indexOf(inspirationStrategy)
    const next = order[(idx + 1) % order.length]
    setInspirationStrategy(next)
  }

  const meta = STRATEGY_META[inspirationStrategy]
  const borderColor = meta.color + '80' // 50% opacity

  return (
    <div className="relative">
      <button
        onClick={cycle}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="w-5 h-5 flex items-center justify-center rounded text-[10px] font-sans font-medium transition-all"
        style={{
          color: meta.color,
          border: `1px solid ${hovered ? meta.color : borderColor}`,
        }}
        title="切换推荐策略"
      >
        {inspirationStrategy}
      </button>
      {hovered && (
        <div className="absolute right-0 top-7 z-20 whitespace-nowrap bg-ink/90 border border-slate/40 rounded px-2 py-1">
          <span className="text-[10px] text-parchment/60 font-sans">
            当前策略: {inspirationStrategy} {meta.label} · 点击切换
          </span>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/StrategyToggle.tsx
git commit -m "feat: add StrategyToggle component for prompt A/B testing"
```

---

## Task 8: Wire Up StrategyToggle in Home Page

**Files:**
- Modify: `src/pages/Home.tsx`

- [ ] **Step 1: Import and place StrategyToggle**

Add import at the top:

```typescript
import { StrategyToggle } from '@/components/StrategyToggle'
```

Modify the section header (around lines 105-106) to include the toggle:

```tsx
// Current:
<div className="text-xs text-parchment/40 font-sans px-1">从已知推未知</div>

// Replace with:
<div className="flex items-center justify-between px-1">
  <span className="text-xs text-parchment/40 font-sans">从已知推未知</span>
  <StrategyToggle />
</div>
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/Home.tsx
git commit -m "feat(Home): add StrategyToggle next to inspiration section title"
```

---

## Task 9: Add Type Tests

**Files:**
- Modify: `tests/types.test.ts`

- [ ] **Step 1: Add `inspirationStrategy` instantiation test**

In `tests/types.test.ts`, add a new test after the existing `StateJson` test:

```typescript
it('StateJson accepts inspirationStrategy', () => {
  const state: StateJson = {
    version: 1,
    profile: { name: 'Test', profile_text: '', preferred_topics: [] },
    lastUsed: { difficulty: 'mid', temperature: 0.7 },
    suggested_new_topics: null,
    groupInspirations: {},
    ui: { session_count: 0 },
    inspirationStrategy: 'v2',
  }
  expect(state.inspirationStrategy).toBe('v2')
})
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run tests/types.test.ts
```

Expected: All tests pass, including the new one.

- [ ] **Step 3: Commit**

```bash
git add tests/types.test.ts
git commit -m "test(types): add inspirationStrategy field test"
```

---

## Task 10: Add LLM Tasks Test for Strategy

**Files:**
- Modify: `tests/llm-tasks.test.ts`

- [ ] **Step 1: Add strategy parameter passing test**

In `tests/llm-tasks.test.ts`, add a new test in the `generateGroupInspiration` describe block:

```typescript
it('passes strategy to select prompt file', async () => {
  const fetchSpy = vi.fn(async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: '{"topic":"T","hook":"h"}' } }] })
  }))
  vi.stubGlobal('fetch', fetchSpy as any)
  await generateGroupInspiration(cfg, {
    groupName: 'AI PM',
    topics: [{ dirName: 'agent', title: 'Agent' }],
    profile,
    strategy: 'v3'
  })
  const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
  // The prompt content should mention "缺口" or "连接件" which are in v3
  expect(body.messages[0].content).toContain('缺口')
})
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run tests/llm-tasks.test.ts
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/llm-tasks.test.ts
git commit -m "test(llm-tasks): verify strategy parameter selects correct prompt"
```

---

## Task 11: Type Check and Lint

- [ ] **Step 1: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 2: Run all tests**

```bash
npm run test
```

Expected: All tests pass.

- [ ] **Step 3: Commit if clean**

If any fixes were needed:

```bash
git add -A
git commit -m "fix: type check and test cleanup"
```

---

## Self-Review

### Spec Coverage Check

| Spec Section | Plan Task |
|-------------|-----------|
| 3.2 Bug fix: remove `removeGroupInspiration` | Task 6, Step 1 |
| 3.2 Bug fix: loading overlay | Task 6, Step 2 |
| 4.2 v1 prompt | Task 5, Step 1 |
| 4.3 v2 prompt | Task 5, Step 2 |
| 4.4 v3 prompt | Task 5, Step 3 |
| 5.1 StrategyToggle position | Task 8, Step 1 |
| 5.2 Visual design (color, size, tooltip) | Task 7, Step 1 |
| 5.3 Interaction (cycle, no refresh) | Task 7, Step 1 |
| 6.1 StateJson extension | Task 1, Step 1 + Task 2, Step 1 |
| 6.2 IPC extension | Task 1, Step 2 + Task 3, Step 1 |
| 6.3 Data flow | Task 4 + Task 6, Step 3 |
| 8.1 Prompt A/B test | Not code — manual process documented in spec |

**No gaps found.**

### Placeholder Scan

No TBD, TODO, or "implement later" found. All steps contain exact file paths, exact code, and exact commands.

### Type Consistency Check

- `inspirationStrategy` type: `'v1' | 'v2' | 'v3'` — consistent across `StateJson`, `IpcApi`, Zustand store, and component props
- `strategy` parameter name: consistent in `IpcApi.llmGroupInspiration`, `generateGroupInspiration`, and IPC handler
- Default value: `'v2'` — consistent in `DEFAULT` state and Zustand fallback
