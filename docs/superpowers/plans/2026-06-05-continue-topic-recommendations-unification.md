# 续谈主题推荐统一化 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一续谈推荐的缓存数据格式、优化UI展示（图标标签+展开式卡片）、实现基于会话数变化的缓存失效机制，并提供一次性旧数据迁移脚本。

**Architecture:** 在 `TopicContinueCache` 中新增 `sessionCount` 字段，前后端统一用它来判定缓存有效性；渲染侧用 🔍➡🎯 图标标签展示三段内容；后端修复 `updateContinueSuggestions` 的参数传递并写入 `sessionCount`；一次性迁移脚本遍历旧缓存、调用LLM重生成新格式。

**Tech Stack:** Electron 30 + React 18 + TypeScript + Tailwind CSS + Zustand + Vitest

---

## 文件结构总览

| 文件 | 职责 |
|------|------|
| `src/types/index.ts` | `TopicContinueCache` 类型新增 `sessionCount` 字段 |
| `electron/ipc/files.ts` | `updateContinueSuggestions` 修复 topic 参数、计算并写入 `sessionCount` |
| `src/components/PreStudyModal.tsx` | `SuggestionCard` 图标标签渲染、缓存失效判断逻辑 |
| `src/store/index.ts` | 旧缓存（无 `sessionCount`）运行时兼容 |
| `scripts/migrate-continue-suggestions.ts` | 一次性迁移脚本：读取旧缓存 → 调用LLM重生成 → 写入 state.json |
| `tests/continue-cache.test.ts` | 缓存失效逻辑的单元测试 |

---

## Task 1: 更新类型定义

**Files:**
- Modify: `src/types/index.ts:78-81`

- [ ] **Step 1: 修改 TopicContinueCache 类型，添加 sessionCount 字段**

```typescript
export type TopicContinueCache = {
  generatedAt: string
  sessionCount: number        // ← 新增
  suggestions: ContinueTopicSuggestion[]
}
```

将第 78-81 行替换为上述代码。

- [ ] **Step 2: 运行类型检查**

```bash
npx tsc --noEmit
```

Expected: 可能有一些类型错误（因为现有代码创建 `TopicContinueCache` 时没有 `sessionCount`），这些会在后续任务中修复。记录任何非预期的错误。

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "types: add sessionCount to TopicContinueCache"
```

---

## Task 2: 更新后端缓存逻辑

**Files:**
- Modify: `electron/ipc/files.ts:182-217`
- Modify: `electron/ipc/files.ts:288`
- Modify: `electron/ipc/files.ts:486`

- [ ] **Step 1: 修改 updateContinueSuggestions 函数签名和逻辑**

将 `electron/ipc/files.ts` 第 182-217 行的 `updateContinueSuggestions` 函数替换为：

```typescript
  async function updateContinueSuggestions(dirName: string, topic?: string) {
    try {
      const summaries = readTopicReportSummaries(cfg.libraryPath, dirName)
      if (summaries.length === 0) {
        // 没有报告，删除缓存
        const { getCurrentState } = await import('./state')
        const current = getCurrentState()
        const next = { ...current.topicContinueSuggestions }
        delete next[dirName]
        patchState({ topicContinueSuggestions: next })
        return
      }

      // 如果没有传入 topic，尝试从最新报告 frontmatter 读取
      let resolvedTopic = topic
      if (!resolvedTopic) {
        const topicDir = path.join(cfg.libraryPath, dirName)
        const sessionDirs = getSortedSessionDirs(topicDir)
        if (sessionDirs.length > 0) {
          const latestReport = path.join(topicDir, sessionDirs[sessionDirs.length - 1], '学习报告.md')
          if (fs.existsSync(latestReport)) {
            try {
              const raw = fs.readFileSync(latestReport, 'utf8')
              const { frontmatter } = parseFrontmatter(raw, { filename: '学习报告.md' })
              if (frontmatter.title) {
                resolvedTopic = frontmatter.title
              }
            } catch {}
          }
        }
      }
      if (!resolvedTopic) {
        resolvedTopic = dirName
      }

      const suggestions = await generateContinueSuggestions(cfg, {
        topic: resolvedTopic,
        dirName
      })

      // 计算当前会话数
      const topicDir = path.join(cfg.libraryPath, dirName)
      const sessionDirs = getSortedSessionDirs(topicDir)
      const sessionCount = sessionDirs.length

      const cache: TopicContinueCache = {
        generatedAt: new Date().toISOString(),
        sessionCount,
        suggestions: suggestions.length > 0 ? suggestions : []
      }

      const { getCurrentState } = await import('./state')
      const current = getCurrentState()
      patchState({
        topicContinueSuggestions: {
          ...current.topicContinueSuggestions,
          [dirName]: cache
        }
      })
    } catch (err) {
      console.error(`[updateContinueSuggestions] failed for ${dirName}:`, err)
      // 静默失败，保留旧缓存
    }
  }
```

- [ ] **Step 2: 修改 writeProgress 的调用，传入 topic**

将 `electron/ipc/files.ts` 第 288 行：
```typescript
    updateContinueSuggestions(args.dirName).catch(console.error)
```
改为：
```typescript
    updateContinueSuggestions(args.dirName, args.title).catch(console.error)
```

- [ ] **Step 3: 确认 deleteArchivedSession 的调用不变**

`deleteArchivedSession`（第 486 行）保持 `updateContinueSuggestions(args.dirName).catch(console.error)` 不变，因为删除后没有明确的 topic 可传，函数内部会从文件系统读取。

- [ ] **Step 4: 运行类型检查**

```bash
npx tsc --noEmit
```

Expected: 无错误（backend 代码已完整适配新类型）

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/files.ts
git commit -m "fix(files): pass correct topic and sessionCount to continue suggestions cache"
```

---

## Task 3: 更新前端渲染与缓存失效判断

**Files:**
- Modify: `src/components/PreStudyModal.tsx`

- [ ] **Step 1: 添加 library 读取和图标常量**

在 `PreStudyModal` 组件中（第 73 行后），添加：

```typescript
  const library = useStore(s => s.library)
```

在文件顶部（import 后）添加图标常量：

```typescript
const ICONS = {
  context: '\u{1F50D}',   // 🔍
  rationale: '\u{27A1}',  // ➡
  benefit: '\u{1F3AF}',   // 🎯
} as const
```

- [ ] **Step 2: 修改 SuggestionCard 渲染逻辑**

将 `SuggestionCard` 函数（第 16-52 行）替换为：

```typescript
function SuggestionCard({ suggestion, selected, onSelect }: SuggestionCardProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect()
    }
  }

  return (
    <div
      role="radio"
      aria-checked={selected}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      className={`relative cursor-pointer rounded-lg border p-3 transition-colors ${
        selected
          ? 'border-ember/50 bg-ember/10'
          : 'border-slate/20 hover:border-slate/40'
      }`}
    >
      <div className={`absolute top-2.5 right-2.5 w-4 h-4 rounded-full border-2 flex items-center justify-center ${
        selected ? 'border-ember' : 'border-parchment/30'
      }`}>
        {selected && <div className="w-2 h-2 rounded-full bg-ember" />}
      </div>
      <div className={`text-sm font-medium mb-1 pr-6 ${selected ? 'text-parchment' : 'text-parchment/80'}`}>
        {suggestion.title}
      </div>
      <div className={`text-xs leading-relaxed space-y-1 ${selected ? 'text-parchment/70' : 'text-parchment/50'}`}>
        {suggestion.context && (
          <div className="flex gap-1.5">
            <span className={`text-xs shrink-0 mt-0.5 ${selected ? '' : 'opacity-40'}`}>{ICONS.context}</span>
            <p>{suggestion.context}</p>
          </div>
        )}
        {suggestion.rationale && (
          <div className="flex gap-1.5">
            <span className={`text-xs shrink-0 mt-0.5 ${selected ? '' : 'opacity-40'}`}>{ICONS.rationale}</span>
            <p>{suggestion.rationale}</p>
          </div>
        )}
        {suggestion.benefit && (
          <div className="flex gap-1.5">
            <span className={`text-xs shrink-0 mt-0.5 ${selected ? '' : 'opacity-40'}`}>{ICONS.benefit}</span>
            <p>{suggestion.benefit}</p>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 修改缓存加载逻辑，添加 sessionCount 失效判断**

将 `PreStudyModal` 中第 104-136 行的 useEffect 替换为：

```typescript
    if (isContinue && args.dirName) {
      const cacheKey = args.dirName
      const cache = topicContinueSuggestions[cacheKey]
      const topicMeta = library.find(t => t.dirName === cacheKey)

      // 缓存有效性判定：有缓存、有 sessionCount、且与当前 library 中的会话数一致
      const hasValidCache = cache &&
        cache.suggestions.length > 0 &&
        cache.sessionCount !== undefined &&
        topicMeta !== undefined &&
        cache.sessionCount === topicMeta.sessionCount

      if (hasValidCache) {
        setSuggestions(cache.suggestions)
      } else {
        setLoadingSuggestions(true)
        ipc.llmGenerateContinueSuggestions({ topic: args.topic, dirName: args.dirName })
          .then(result => {
            setSuggestions(result)
            const sessionCount = topicMeta?.sessionCount ?? 0
            // Persist to frontend store
            useStore.setState(state => ({
              topicContinueSuggestions: {
                ...state.topicContinueSuggestions,
                [cacheKey]: { generatedAt: new Date().toISOString(), sessionCount, suggestions: result }
              }
            }))
            // Also persist to backend state.json
            const currentCache = useStore.getState().topicContinueSuggestions
            ipc.patchState({
              topicContinueSuggestions: {
                ...currentCache,
                [cacheKey]: { generatedAt: new Date().toISOString(), sessionCount, suggestions: result }
              }
            })
          })
          .catch(err => {
            console.error('[PreStudyModal] Failed to load suggestions:', err)
            setSuggestionError(true)
            setSuggestions([])
          })
          .finally(() => setLoadingSuggestions(false))
      }
    }
```

- [ ] **Step 4: 运行类型检查**

```bash
npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 5: Commit**

```bash
git add src/components/PreStudyModal.tsx
git commit -m "feat(prestudy): icon labels for continue suggestions + sessionCount cache validation"
```

---

## Task 4: Store 旧缓存兼容

**Files:**
- Modify: `src/store/index.ts:176`

- [ ] **Step 1: 修改 init 中 topicContinueSuggestions 的加载逻辑**

将 `src/store/index.ts` 第 176 行：
```typescript
      topicContinueSuggestions: state.topicContinueSuggestions ?? {},
```

改为：
```typescript
      topicContinueSuggestions: (() => {
        const raw = state.topicContinueSuggestions ?? {}
        // 运行时兼容：旧缓存（无 sessionCount）在前端加载时标记为失效
        // 下一次打开续谈模态框时会触发重新生成
        return raw
      })(),
```

实际上这里不需要修改——旧缓存直接加载即可，因为 `PreStudyModal` 中已经通过 `cache.sessionCount !== undefined` 来判断有效性了。但为了代码清晰，保持原样，只添加注释说明：

```typescript
      topicContinueSuggestions: state.topicContinueSuggestions ?? {},
      // 注意：旧缓存（无 sessionCount）在 PreStudyModal 中会被判定为失效并重新生成
```

- [ ] **Step 2: Commit（如果做了修改）**

如果没有实际代码修改，跳过此 commit。

---

## Task 5: 创建一次性迁移脚本

**Files:**
- Create: `scripts/migrate-continue-suggestions.ts`

- [ ] **Step 1: 创建迁移脚本**

```typescript
/**
 * 一次性迁移脚本：将旧格式续谈推荐缓存（只有 title + reason）
 * 重新生成为新格式（title + context + rationale + benefit）。
 *
 * 用法：
 *   npx tsx scripts/migrate-continue-suggestions.ts
 *
 * 运行后手动删除本脚本。
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import dotenv from 'dotenv'
import { generateContinueSuggestions } from '../electron/lib/llm-tasks'
import { loadEnv } from '../electron/env'
import type { StateJson, TopicContinueCache } from '../src/types/index'

async function main() {
  // 加载 .env
  const envPath = path.resolve(process.cwd(), '.env')
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath })
  }

  const cfg = loadEnv()
  const statePath = path.join(os.homedir(), '.studyparlor', 'state.json')

  if (!fs.existsSync(statePath)) {
    console.error('state.json not found:', statePath)
    process.exit(1)
  }

  const state: StateJson = JSON.parse(fs.readFileSync(statePath, 'utf8'))
  const cache = state.topicContinueSuggestions ?? {}
  const entries = Object.entries(cache)

  console.log(`Found ${entries.length} cached topics.`)

  const migrated: string[] = []
  const skipped: string[] = []
  const failed: string[] = []

  for (const [dirName, topicCache] of entries) {
    const first = topicCache.suggestions[0]
    if (!first) {
      skipped.push(dirName)
      continue
    }

    // 检测旧格式：有 reason 字段 或 无 context 字段
    const isOldFormat = 'reason' in first || !('context' in first)

    if (!isOldFormat) {
      skipped.push(dirName)
      continue
    }

    console.log(`\n[Migrating] ${dirName}...`)
    try {
      // 从旧缓存中提取主题标题（尝试用第一个 suggestion 的 title 前缀，否则用 dirName）
      const topic = first.title || dirName

      const suggestions = await generateContinueSuggestions(cfg, {
        topic,
        dirName
      })

      // 计算会话数
      const topicDir = path.join(cfg.libraryPath, dirName)
      let sessionCount = 0
      if (fs.existsSync(topicDir)) {
        const sessionDirs = fs.readdirSync(topicDir, { withFileTypes: true })
          .filter(e => e.isDirectory() && /^s\d+$/.test(e.name))
        sessionCount = sessionDirs.length
      }

      const newCache: TopicContinueCache = {
        generatedAt: new Date().toISOString(),
        sessionCount,
        suggestions: suggestions.length > 0 ? suggestions : []
      }

      cache[dirName] = newCache
      migrated.push(dirName)
      console.log(`  ✓ Generated ${suggestions.length} suggestions`)
    } catch (err) {
      failed.push(dirName)
      console.error(`  ✗ Failed:`, err)
    }
  }

  // 写回 state.json
  state.topicContinueSuggestions = cache
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8')

  console.log('\n--- Migration Report ---')
  console.log(`Migrated: ${migrated.length}`)
  migrated.forEach(m => console.log(`  ✓ ${m}`))
  console.log(`Skipped (already new format): ${skipped.length}`)
  skipped.forEach(s => console.log(`  - ${s}`))
  console.log(`Failed: ${failed.length}`)
  failed.forEach(f => console.log(`  ✗ ${f}`))

  if (failed.length > 0) {
    process.exit(1)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 2: 验证脚本可编译**

```bash
npx tsc --noEmit scripts/migrate-continue-suggestions.ts
```

如果报错（因为脚本在 scripts/ 目录下不在 tsconfig 的 include 中），改为用 tsx 直接验证：

```bash
npx tsx --check scripts/migrate-continue-suggestions.ts
```

或者更简单：直接尝试运行（需要 .env 配置正确）：

```bash
npx tsx scripts/migrate-continue-suggestions.ts
```

Expected: 脚本正常执行，输出迁移报告。

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate-continue-suggestions.ts
git commit -m "feat(scripts): add one-time migration for old continue-suggestion cache format"
```

---

## Task 6: 测试

**Files:**
- Create: `tests/continue-cache.test.ts`

- [ ] **Step 1: 创建缓存失效逻辑的测试**

```typescript
import { describe, it, expect } from 'vitest'
import type { TopicContinueCache, TopicMeta } from '../src/types/index'

function isCacheValid(
  cache: TopicContinueCache | undefined,
  topicMeta: TopicMeta | undefined
): boolean {
  if (!cache || cache.suggestions.length === 0) return false
  if (cache.sessionCount === undefined) return false
  if (!topicMeta) return false
  return cache.sessionCount === topicMeta.sessionCount
}

describe('continue suggestion cache validation', () => {
  it('returns true when sessionCount matches', () => {
    const cache: TopicContinueCache = {
      generatedAt: '2026-06-01T00:00:00Z',
      sessionCount: 3,
      suggestions: [{ title: 'T', context: 'C', rationale: 'R', benefit: 'B' }]
    }
    const meta: TopicMeta = {
      dirName: 'test',
      title: 'Test',
      sessionCount: 3,
      sessions: [],
      last_studied: '',
      last_studied_days: 0,
      groupId: 'default'
    }
    expect(isCacheValid(cache, meta)).toBe(true)
  })

  it('returns false when sessionCount differs', () => {
    const cache: TopicContinueCache = {
      generatedAt: '2026-06-01T00:00:00Z',
      sessionCount: 2,
      suggestions: [{ title: 'T', context: 'C', rationale: 'R', benefit: 'B' }]
    }
    const meta: TopicMeta = {
      dirName: 'test',
      title: 'Test',
      sessionCount: 3,
      sessions: [],
      last_studied: '',
      last_studied_days: 0,
      groupId: 'default'
    }
    expect(isCacheValid(cache, meta)).toBe(false)
  })

  it('returns false when cache lacks sessionCount (old format)', () => {
    const cache = {
      generatedAt: '2026-06-01T00:00:00Z',
      suggestions: [{ title: 'T', context: 'C', rationale: 'R', benefit: 'B' }]
    } as TopicContinueCache
    const meta: TopicMeta = {
      dirName: 'test',
      title: 'Test',
      sessionCount: 3,
      sessions: [],
      last_studied: '',
      last_studied_days: 0,
      groupId: 'default'
    }
    expect(isCacheValid(cache, meta)).toBe(false)
  })

  it('returns false when cache is empty', () => {
    const cache: TopicContinueCache = {
      generatedAt: '2026-06-01T00:00:00Z',
      sessionCount: 3,
      suggestions: []
    }
    const meta: TopicMeta = {
      dirName: 'test',
      title: 'Test',
      sessionCount: 3,
      sessions: [],
      last_studied: '',
      last_studied_days: 0,
      groupId: 'default'
    }
    expect(isCacheValid(cache, meta)).toBe(false)
  })
})
```

- [ ] **Step 2: 运行测试**

```bash
npx vitest run tests/continue-cache.test.ts
```

Expected: 全部 4 个测试通过

- [ ] **Step 3: 运行全部现有测试，确保无回归**

```bash
npm run test
```

Expected: 所有现有测试通过

- [ ] **Step 4: Commit**

```bash
git add tests/continue-cache.test.ts
git commit -m "test: add continue cache validation logic tests"
```

---

## Spec 覆盖自检

| Spec 章节 | 实现任务 |
|-----------|----------|
| 3.1 类型定义（TopicContinueCache + sessionCount） | Task 1 |
| 4.1 展开式卡片布局 | Task 3 Step 2 |
| 4.2 图标标签（🔍➡🎯） | Task 3 Step 2 |
| 4.3 选中/未选中态 | Task 3 Step 2（已有 Tailwind 类） |
| 5.2 缓存失效（sessionCount 比较） | Task 3 Step 3 + Task 6 |
| 6 迁移脚本 | Task 5 |
| 8.1 topic 参数修正 | Task 2 |
| 8.2 sessionCount 写入 | Task 2 |

---

## 执行交接

**Plan complete and saved to `docs/superpowers/plans/2026-06-05-continue-topic-recommendations-unification.md`.**

**Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints for review

**Which approach?**
