# 「新的小径」自定义旧主题新 Session 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 PreStudyModal 中增加「全新主题」/「已有主题」切换，让用户可以选择已有主题并输入自定义细分方向来开启新 session。

**Architecture:** 在 PreStudyModal 内部新增状态管理（`topicSource`、`selectedDirName`、`searchQuery`、`customTopic`）和对应的 UI 渲染逻辑。不修改任何类型定义、store 接口或归档逻辑——现有 `startSession` 的参数结构已支持 `dirName` + `topic` 组合。

**Tech Stack:** React 18 + TypeScript + Tailwind CSS + Zustand + Vitest + @testing-library/react

---

## 文件结构

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/components/PreStudyModal.tsx` | 修改 | 核心：新增状态、切换按钮、主题列表、细分方向输入、校验逻辑 |
| `tests/prestudy-modal.test.tsx` | 创建 | 验证「已有主题」模式下的主题列表渲染和过滤行为 |

---

## Task 1: 主题列表过滤/排序工具函数

**目的:** 将主题列表的过滤和排序逻辑抽成纯函数，便于单元测试。

**Files:**
- Create: `src/lib/filter-topics.ts`
- Test: `tests/filter-topics.test.ts`

- [ ] **Step 1: 编写测试**

创建 `tests/filter-topics.test.ts`：

```typescript
import { describe, it, expect } from 'vitest'
import { filterAndSortTopics } from '../src/lib/filter-topics'
import type { TopicMeta } from '../src/types'

function makeTopic(title: string, dirName: string, lastStudied: string, sessionCount: number): TopicMeta {
  return {
    dirName,
    title,
    sessionCount,
    sessions: [],
    last_studied: lastStudied,
    last_studied_days: 0,
    groupId: 'default'
  }
}

describe('filterAndSortTopics', () => {
  const topics: TopicMeta[] = [
    makeTopic('React Hooks', 'react-hooks', '2026-06-05T10:00:00Z', 5),
    makeTopic('TypeScript 进阶', 'ts-advanced', '2026-06-04T10:00:00Z', 3),
    makeTopic('设计模式', 'design-patterns', '2026-06-01T10:00:00Z', 2),
    makeTopic('算法与数据结构', 'algorithms', '2026-06-03T10:00:00Z', 8),
  ]

  it('sorts by last_studied descending by default', () => {
    const result = filterAndSortTopics(topics, '')
    expect(result.map(t => t.title)).toEqual([
      'React Hooks',
      'TypeScript 进阶',
      '算法与数据结构',
      '设计模式'
    ])
  })

  it('filters by title (case insensitive)', () => {
    const result = filterAndSortTopics(topics, 'react')
    expect(result.map(t => t.title)).toEqual(['React Hooks'])
  })

  it('filters by partial match', () => {
    const result = filterAndSortTopics(topics, '模式')
    expect(result.map(t => t.title)).toEqual(['设计模式'])
  })

  it('returns empty array when no match', () => {
    const result = filterAndSortTopics(topics, '不存在的主题')
    expect(result).toEqual([])
  })

  it('returns all topics sorted when query is whitespace', () => {
    const result = filterAndSortTopics(topics, '  ')
    expect(result).toHaveLength(4)
    expect(result[0].title).toBe('React Hooks')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run tests/filter-topics.test.ts
```

Expected: FAIL — `filterAndSortTopics` not found

- [ ] **Step 3: 实现过滤/排序函数**

创建 `src/lib/filter-topics.ts`：

```typescript
import type { TopicMeta } from '@shared/index'

export function filterAndSortTopics(topics: TopicMeta[], query: string): TopicMeta[] {
  const normalized = query.toLowerCase().trim()
  const filtered = normalized
    ? topics.filter(t => t.title.toLowerCase().includes(normalized))
    : [...topics]
  return filtered.sort((a, b) => {
    return new Date(b.last_studied).getTime() - new Date(a.last_studied).getTime()
  })
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run tests/filter-topics.test.ts
```

Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add tests/filter-topics.test.ts src/lib/filter-topics.ts
git commit -m "feat(prestudy): add topic filter/sort utility with tests"
```

---

## Task 2: PreStudyModal 组件改造

**目的:** 在 PreStudyModal 中新增「全新主题」/「已有主题」切换，以及对应的主题列表和细分方向输入。

**Files:**
- Modify: `src/components/PreStudyModal.tsx`

### 前置知识

当前 PreStudyModal 的关键状态（已有）：
- `topic` — 新主题输入（全新主题模式下使用）
- `difficulty`, `temperature`, `userRequirement` — 共用配置
- `isContinue` — 判断是否为续谈场景（`args?.dirName && args.mode === 'progress'`）

本次新增状态：
- `topicSource: 'new' | 'existing'` — 主题来源切换
- `selectedDirName: string | null` — 选中的已有主题
- `searchQuery: string` — 搜索关键词
- `customTopic: string` — 细分方向输入

当前 `onConfirm` 的关键逻辑：
```typescript
const finalTopic = (showTopicInput ? topic : args.topic).trim()
const selectedTopic = isContinue && suggestions[selectedSuggestionIndex]
  ? suggestions[selectedSuggestionIndex].title
  : undefined

await patchLastUsed({ difficulty, temperature })
startSession({
  mode: args.mode,
  topic: finalTopic,
  dirName: args.dirName,
  file_path: args.file_path,
  difficulty,
  temperature,
  userRequirement: userRequirement.trim() || undefined,
  selectedTopic
})
```

- [ ] **Step 1: 导入 filterAndSortTopics，新增状态变量**

在 `src/components/PreStudyModal.tsx` 中：

1. 在 imports 区域添加：

```typescript
import { filterAndSortTopics } from '@/lib/filter-topics'
```

2. 在现有 state hooks 下方（约第 97-105 行），新增：

```typescript
  const [topicSource, setTopicSource] = useState<'new' | 'existing'>('new')
  const [selectedDirName, setSelectedDirName] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [customTopic, setCustomTopic] = useState('')
```

- [ ] **Step 2: 重置 effect 中新增状态清零**

在 `useEffect` 中（约第 113-125 行），在现有重置逻辑后添加：

找到这段代码：
```typescript
    // Reset state every time modal opens
    setTopic(args.topic)
    setDifficulty(lastUsed.difficulty)
    setTemperature(lastUsed.temperature)
    setUserRequirement('')
    setSelectedSuggestionIndex(0)
    setSuggestions([])
    setLoadingSuggestions(false)
    setSuggestionError(false)
```

在其后添加：
```typescript
    setTopicSource('new')
    setSelectedDirName(null)
    setSearchQuery('')
    setCustomTopic('')
```

- [ ] **Step 3: 新增「主题来源」切换 UI（替换现有 Header 区域）**

找到现有 header 区域（约第 224-226 行）：

```tsx
        {/* Header label */}
        <div className="font-sans text-xs text-parchment/50">
          {args.mode === 'progress' ? '探索新知' : '复习检测'}
        </div>
```

替换为：

```tsx
        {/* Header: topic source toggle (only for progress mode without dirName) */}
        {args.mode === 'progress' && !args.dirName && (
          <div className="flex gap-2">
            <button
              onClick={() => {
                setTopicSource('new')
                setSelectedDirName(null)
                setSearchQuery('')
                setCustomTopic('')
              }}
              className={`flex-1 py-2 rounded font-sans text-sm border transition-colors
                ${topicSource === 'new'
                  ? 'bg-ember text-ink border-ember'
                  : 'border-slate/40 text-parchment/70 hover:border-parchment/60'}`}>
              全新主题
            </button>
            <button
              onClick={() => {
                setTopicSource('existing')
                setTopic('')
                setSelectedDirName(null)
                setSearchQuery('')
                setCustomTopic('')
              }}
              className={`flex-1 py-2 rounded font-sans text-sm border transition-colors
                ${topicSource === 'existing'
                  ? 'bg-ember text-ink border-ember'
                  : 'border-slate/40 text-parchment/70 hover:border-parchment/60'}`}>
              已有主题
            </button>
          </div>
        )}
        {!(args.mode === 'progress' && !args.dirName) && (
          <div className="font-sans text-xs text-parchment/50">
            {args.mode === 'progress' ? '探索新知' : '复习检测'}
          </div>
        )}
```

- [ ] **Step 4: 替换 Topic 区域为条件渲染**

找到现有 Topic 区域（约第 229-239 行）：

```tsx
        {/* Topic area */}
        {showTopicInput ? (
          <div>
            <div className="field-label mb-2">今夜想学</div>
            <Input ref={topicRef} value={topic}
                   onChange={e => setTopic(e.target.value)}
                   placeholder="主题或一个问题"
                   className="w-full" />
          </div>
        ) : (
          <div className="text-xl text-parchment">{args.topic}</div>
        )}
```

替换为：

```tsx
        {/* Topic area */}
        {showTopicInput ? (
          topicSource === 'new' ? (
            <div>
              <div className="field-label mb-2">今夜想学</div>
              <Input ref={topicRef} value={topic}
                     onChange={e => setTopic(e.target.value)}
                     placeholder="主题或一个问题"
                     className="w-full" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Search */}
              <div>
                <div className="field-label mb-2">搜索已有主题</div>
                <Input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="输入主题名过滤..."
                  className="w-full"
                />
              </div>

              {/* Topic list */}
              <div className="max-h-[160px] overflow-y-auto space-y-2" style={{ scrollbarColor: 'rgba(148,163,184,0.4) transparent', scrollbarWidth: 'thin' }}>
                {filterAndSortTopics(library, searchQuery).length === 0 ? (
                  <div className="text-sm text-parchment/40 italic text-center py-4">
                    {library.length === 0 ? '档案室还空着，先创建一个新主题吧' : '未找到匹配的主题'}
                  </div>
                ) : (
                  filterAndSortTopics(library, searchQuery).map(t => {
                    const daysText = t.last_studied_days === 0 ? '今天'
                      : t.last_studied_days === 1 ? '昨天'
                      : `${t.last_studied_days}天前`
                    return (
                      <div
                        key={t.dirName}
                        onClick={() => setSelectedDirName(t.dirName)}
                        className={`cursor-pointer rounded-lg border p-3 transition-colors flex justify-between items-center
                          ${selectedDirName === t.dirName
                            ? 'border-ember/50 bg-ember/10'
                            : 'border-slate/20 hover:border-slate/40 hover:bg-ember/5'}`}>
                        <span className={`text-sm ${selectedDirName === t.dirName ? 'text-parchment' : 'text-parchment/80'}`}>
                          {t.title}
                        </span>
                        <span className="text-xs text-parchment/40 font-sans">
                          {t.sessionCount}份 · {daysText}
                        </span>
                      </div>
                    )
                  })
                )}
              </div>

              {/* Custom topic input (shown after selection) */}
              {selectedDirName && (
                <div>
                  <div className="field-label mb-2">本次细分方向</div>
                  <Input
                    value={customTopic}
                    onChange={e => setCustomTopic(e.target.value)}
                    placeholder="例如：useDeferredValue 的具体场景"
                    className="w-full"
                  />
                </div>
              )}
            </div>
          )
        ) : (
          <div className="text-xl text-parchment">{args.topic}</div>
        )}
```

- [ ] **Step 5: 修改 onConfirm 校验和参数组装**

找到现有 `onConfirm` 函数（约第 197-216 行）：

```typescript
  const onConfirm = async () => {
    const finalTopic = (showTopicInput ? topic : args.topic).trim()
    if (showTopicInput && !finalTopic) return

    const selectedTopic = isContinue && suggestions[selectedSuggestionIndex]
      ? suggestions[selectedSuggestionIndex].title
      : undefined

    await patchLastUsed({ difficulty, temperature })
    startSession({
      mode: args.mode,
      topic: finalTopic,
      dirName: args.dirName,
      file_path: args.file_path,
      difficulty,
      temperature,
      userRequirement: userRequirement.trim() || undefined,
      selectedTopic
    })
  }
```

替换为：

```typescript
  const onConfirm = async () => {
    let finalTopic: string
    let finalDirName: string | undefined

    if (showTopicInput) {
      if (topicSource === 'new') {
        finalTopic = topic.trim()
        if (!finalTopic) return
        finalDirName = undefined
      } else {
        // existing topic mode
        if (!selectedDirName || !customTopic.trim()) return
        finalTopic = customTopic.trim()
        finalDirName = selectedDirName
      }
    } else {
      finalTopic = args.topic
      finalDirName = args.dirName
    }

    const selectedTopic = isContinue && suggestions[selectedSuggestionIndex]
      ? suggestions[selectedSuggestionIndex].title
      : undefined

    await patchLastUsed({ difficulty, temperature })
    startSession({
      mode: args.mode,
      topic: finalTopic,
      dirName: finalDirName,
      file_path: args.file_path,
      difficulty,
      temperature,
      userRequirement: userRequirement.trim() || undefined,
      selectedTopic
    })
  }
```

- [ ] **Step 6: 运行测试确认无回归**

```bash
npx vitest run
```

Expected: 所有现有测试继续通过，新增测试通过

- [ ] **Step 7: 启动应用手动验证**

```bash
npm run dev
```

验证清单：
1. 点击「新的小径」，Modal 默认显示「全新主题」模式，输入框正常
2. 切换到「已有主题」，显示搜索框和主题列表（按最近学习时间倒序）
3. 搜索过滤只匹配标题，实时过滤
4. 点击主题选中，下方显示「细分方向」输入框
5. 未选主题或未输入细分方向时，「开始」按钮应不可点击（实际行为：点击无反应）
6. 输入细分方向后点击「开始」，进入 Study 页面，header 显示细分方向
7. 归档后检查是否归入正确主题目录
8. 从学习库点击「续谈」不受任何影响，仍然加载 LLM 建议

- [ ] **Step 8: Commit**

```bash
git add src/components/PreStudyModal.tsx src/lib/filter-topics.ts tests/filter-topics.test.ts
git commit -m "feat(prestudy): add existing topic custom session flow

- Add 'new'/'existing' topic source toggle in PreStudyModal
- Searchable topic list sorted by last studied time
- Custom sub-topic input after selecting existing topic
- Archives to selected topic's dirName with incremented session number
- Pure filter/sort utility with unit tests"
```

---

## Self-Review

### 1. Spec Coverage

| Spec 要求 | 对应 Task/Step |
|-----------|---------------|
| 顶部「全新主题」/「已有主题」切换按钮组 | Task 2 Step 3 |
| 默认选中「全新主题」 | Task 2 Step 2（重置 effect 中设置 `'new'`） |
| 切换时清空模式专属状态 | Task 2 Step 3（onClick 中重置） |
| 保留共用设置（附加要求/强度/腔调） | Task 2 Step 2（重置 effect 中不重置这些） |
| 主题列表按 last_studied 倒序 | Task 1（filterAndSortTopics） |
| 搜索过滤只匹配 title | Task 1（`.title.toLowerCase().includes`） |
| 空状态提示 | Task 2 Step 4（条件渲染空提示） |
| 选中态样式 | Task 2 Step 4（ember 边框 + 背景） |
| 细分方向输入在选中后显示 | Task 2 Step 4（`selectedDirName &&` 条件） |
| 开始按钮校验 | Task 2 Step 5（`if (!selectedDirName \|\| !customTopic.trim()) return`） |
| Study header 显示细分方向 | Task 2 Step 5（`topic: finalTopic` = customTopic） |
| 归档归入已有主题 dirName | Task 2 Step 5（`dirName: finalDirName` = selectedDirName） |
| 续谈逻辑不受影响 | Task 2 Step 3（切换按钮只在 `!args.dirName` 时显示） |

✅ 无遗漏

### 2. Placeholder Scan

- 无 TBD / TODO / "implement later"
- 无 "add appropriate error handling" 等模糊描述
- 所有代码块包含完整代码
- 所有命令包含预期输出

✅ 通过

### 3. Type Consistency

- `filterAndSortTopics` 签名: `(topics: TopicMeta[], query: string) => TopicMeta[]` — 与 `@shared/index` 的 `TopicMeta` 一致
- `topicSource: 'new' | 'existing'` — 字面量类型，前后一致
- `selectedDirName: string | null` — 与 `args.dirName?: string` 兼容
- `customTopic` 传入 `startSession` 的 `topic` 字段 — 类型匹配

✅ 通过

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-05-custom-old-topic-session.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
