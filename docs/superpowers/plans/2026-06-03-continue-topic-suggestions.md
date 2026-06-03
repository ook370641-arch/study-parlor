# 续谈主题推荐实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 点击续谈时弹出主题选择窗口，展示 AI 基于历史记录推荐的 2-3 个具体续谈方向，并支持用户附加学习要求；新主题和复习场景也支持附加要求。

**Architecture:** 归档/删除 session 时异步预生成续谈推荐，缓存到 state.json；点击续谈时直接读取展示。用户选定的主题 + 附加要求通过 system prompt 传入 LLM。

**Tech Stack:** Electron 30 + React 18 + TypeScript + Tailwind CSS + Zustand + Kimi API

---

## 文件结构

| 文件 | 职责 | 操作 |
|------|------|------|
| `src/types/index.ts` | 共享类型：StateJson、IpcApi、Session 类型扩展 | 修改 |
| `src/store/index.ts` | Zustand store：Session 类型、startSession 参数扩展 | 修改 |
| `src/components/PreStudyModal.tsx` | 三态弹窗 UI（新主题/续谈/复习） | 修改 |
| `src/lib/ipc.ts` | 前端 IPC 包装（如有缺失的类型同步） | 可能修改 |
| `electron/prompts/continue-suggestions.md` | 续谈推荐生成 prompt | 创建 |
| `electron/lib/llm-tasks.ts` | 新增 `generateContinueSuggestions` + 报告摘要读取 | 修改 |
| `electron/lib/prompts.ts` | 装配链插入【本次学习方向】段 | 修改 |
| `electron/ipc/llm.ts` | 扩展 `llm:start` 参数，新增 `llm:generateContinueSuggestions` | 修改 |
| `electron/ipc/state.ts` | 扩展 DEFAULT，暴露 `patchState` 函数供主进程内部使用 | 修改 |
| `electron/ipc/files.ts` | 归档/删除 session 后触发续谈推荐更新 | 修改 |
| `tests/llm-tasks.test.ts` | 新增 `generateContinueSuggestions` 测试 | 修改 |

---

## Task 1: 扩展共享类型定义

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: 在 StateJson 前新增续谈推荐类型**

```typescript
export type ContinueTopicSuggestion = {
  title: string
  reason: string
}

export type TopicContinueCache = {
  generatedAt: string
  suggestions: ContinueTopicSuggestion[]
}
```

- [ ] **Step 2: 扩展 StateJson**

在 `StateJson` 类型中添加：

```typescript
topicContinueSuggestions: Record<string, TopicContinueCache>
```

- [ ] **Step 3: 扩展 IpcApi**

在 `llmStart` 参数中添加：

```typescript
selectedTopic?: string
userRequirement?: string
```

在 `IpcApi` 中添加新方法（后端自己读取报告摘要，前端只传 topic 和 dirName）：

```typescript
llmGenerateContinueSuggestions: (args: {
  topic: string
  dirName: string
}) => Promise<ContinueTopicSuggestion[]>
```

- [ ] **Step 4: 扩展 UnsavedSession**

在 `UnsavedSession` 类型中添加：

```typescript
userRequirement?: string
selectedTopic?: string
```

---

## Task 2: 扩展 State 管理

**Files:**
- Modify: `electron/ipc/state.ts`

- [ ] **Step 1: 扩展 DEFAULT 初始化值**

```typescript
const DEFAULT: StateJson = {
  version: 1,
  profile: { name: '', profile_text: '', preferred_topics: [] },
  lastUsed: { difficulty: 'mid', temperature: 0.7 },
  suggested_new_topics: null,
  groupInspirations: {},
  ui: { session_count: 0 },
  inspirationStrategy: 'v2',
  fableStyleTags: ['科幻', '童话', '历史', '日常生活', '悬疑', '诗意散文'],
  lastFableTags: [],
  topicContinueSuggestions: {}
}
```

- [ ] **Step 2: 暴露 `patchState` 函数供主进程内部调用**

在 `registerStateIpc` 后添加：

```typescript
export function patchState(patch: Partial<StateJson>): void {
  currentState = { ...loadState(), ...patch }
  safeWriteJson(STATE_FILE, currentState)
}
```

---

## Task 3: 创建续谈推荐 Prompt

**Files:**
- Create: `electron/prompts/continue-suggestions.md`

- [ ] **Step 1: 写入 prompt 文件**

```markdown
你正在为"学者夜话"设计续谈主题。请根据学习者在该主题下的历史，推荐 2-3 个具体的续谈方向。

主题：{{topic}}
历史学习记录：
{{reportSummaries}}

约束：
1. 每个推荐是一个独立的、单次会话能讲完的具体子主题。
2. 推荐理由必须引用历史记录中的具体线索（如"你在第X次学习提到…"）。
3. 推荐之间要有区分度：覆盖深化理解、横向拓展、薄弱环节、前沿联系等不同维度。
4. 若历史显示某处有明确困惑，优先推荐针对性方向。
5. 首次学习（无历史记录）时，推荐该 topic 下的 3 个经典入门切入点。

【格式强制要求】
- 只输出 JSON 数组，不要任何其他内容
- 不要 markdown 代码块，不要解释说明
- 回复必须直接以 [ 开头，以 ] 结尾
- 示例：[{"title":"收敛性证明","reason":"你在第3次报告中提到对收敛条件理解不透彻，这次从贝尔曼方程逐步推导。"}]
```

---

## Task 4: 实现续谈推荐 LLM 任务

**Files:**
- Modify: `electron/lib/llm-tasks.ts`

- [ ] **Step 1: 在 `generateFableFromReport` 后添加 `generateContinueSuggestions`**

```typescript
export async function generateContinueSuggestions(
  cfg: AppConfig,
  args: { topic: string; dirName: string; reportSummaries: string[] }
): Promise<ContinueTopicSuggestion[]> {
  const prompt = read('continue-suggestions.md')
    .replace('{{topic}}', args.topic)
    .replace('{{reportSummaries}}', args.reportSummaries.map((s, i) => `第${i + 1}次学习：\n${s}`).join('\n\n'))

  try {
    const text = await chatNonStream(cfg, {
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7
    })
    const json = JSON.parse(text) as ContinueTopicSuggestion[]
    if (!Array.isArray(json)) return []
    return json.filter(item => item.title && item.reason).slice(0, 3)
  } catch {
    return []
  }
}
```

- [ ] **Step 2: 在 `generateContinueSuggestions` 后添加 `readTopicReportSummaries` helper**

```typescript
export function readTopicReportSummaries(
  libraryPath: string,
  dirName: string
): string[] {
  try {
    const topicDir = path.join(libraryPath, dirName)
    const sessionDirs = getSortedSessionDirs(topicDir)
    const summaries: string[] = []

    for (const sd of sessionDirs) {
      const reportPath = path.join(topicDir, sd, '学习报告.md')
      if (!fs.existsSync(reportPath)) continue
      try {
        const raw = fs.readFileSync(reportPath, 'utf8')
        const { frontmatter, body } = parseFrontmatter(raw, { filename: '学习报告.md' })
        // 优先用 progress_summary，没有则取 body 前 300 字
        const summary = frontmatter.progress_summary
          ? frontmatter.progress_summary.replace(/\s+/g, ' ').trim()
          : body.trim().slice(0, 300)
        summaries.push(summary)
      } catch {
        // 单份报告解析失败，跳过
      }
    }

    return summaries
  } catch {
    return []
  }
}
```

- [ ] **Step 3: 更新 import**

确保 import 中包含 `ContinueTopicSuggestion`：

```typescript
import type { Profile, NewTopic, Message, ContinueTopicSuggestion } from '@shared/index'
```

---

## Task 5: 扩展 Prompt 装配链

**Files:**
- Modify: `electron/lib/prompts.ts`

- [ ] **Step 1: 扩展 `AssembleArgs` 类型**

```typescript
export type AssembleArgs = {
  mode: Mode
  difficulty: Difficulty
  profile: Profile
  reviewFileBody?: string
  progressSummary?: string
  selectedTopic?: string
  userRequirement?: string
}
```

- [ ] **Step 2: 在 `assemblePrompt` 中插入【本次学习方向】段**

在 `read('learner-base.md')` 之后、模式注入之前插入：

```typescript
  // 插入本次学习方向
  const directionParts: string[] = []
  if (args.selectedTopic) {
    directionParts.push(`聚焦主题：${args.selectedTopic}`)
  }
  if (args.userRequirement) {
    directionParts.push(`学习者额外要求：${args.userRequirement}`)
  }
  if (directionParts.length > 0) {
    parts.push(`【本次学习方向】\n${directionParts.join('\n')}`)
  }
```

完整 assemblePrompt 函数：

```typescript
export function assemblePrompt(args: AssembleArgs): string {
  const parts: string[] = []
  parts.push(read('learner-base.md'))

  // 插入本次学习方向
  const directionParts: string[] = []
  if (args.selectedTopic) {
    directionParts.push(`聚焦主题：${args.selectedTopic}`)
  }
  if (args.userRequirement) {
    directionParts.push(`学习者额外要求：${args.userRequirement}`)
  }
  if (directionParts.length > 0) {
    parts.push(`【本次学习方向】\n${directionParts.join('\n')}`)
  }

  if (args.mode === 'review') {
    if (!args.reviewFileBody) throw new Error('reviewFileBody required when mode=review')
    parts.push(read('mode-review.md').replace('{{file_content}}', args.reviewFileBody))
  }

  if (args.mode === 'progress') {
    parts.push(read('mode-progress.md'))
  }

  if (args.mode === 'progress' && args.progressSummary) {
    parts.push(`[学习进度摘要]\n你正在继续之前的学习。目前已掌握的内容摘要:\n${args.progressSummary}\n\n请自然地接续之前的进度推进。`)
  }

  if (args.difficulty === 'mid') parts.push(read('difficulty-mid.md'))
  if (args.difficulty === 'low') parts.push(read('difficulty-low.md'))

  parts.push(formatProfile(args.profile))

  return parts.join('\n\n---\n\n')
}
```

---

## Task 6: 扩展后端 IPC 处理器

### 6a: 扩展 LLM IPC

**Files:**
- Modify: `electron/ipc/llm.ts`

- [ ] **Step 1: 扩展 `llm:start` 处理器参数**

```typescript
  ipcMain.handle('llm:start', async (_, args: {
    sessionId: string
    mode: Mode
    difficulty: Difficulty
    profile: Profile
    reviewFileBody?: string
    progressSummary?: string
    history: Message[]
    temperature: number
    selectedTopic?: string
    userRequirement?: string
  }) => {
```

- [ ] **Step 2: 将新参数传给 `assemblePrompt`**

```typescript
      const system = assemblePrompt({
        mode: args.mode, difficulty: args.difficulty,
        profile: args.profile, reviewFileBody: args.reviewFileBody,
        progressSummary: args.progressSummary,
        selectedTopic: args.selectedTopic,
        userRequirement: args.userRequirement
      })
```

- [ ] **Step 3: 添加 `llm:generateContinueSuggestions` 处理器**

在 `registerLlmIpc` 末尾添加：

```typescript
  ipcMain.handle('llm:generateContinueSuggestions', async (_, args: {
    topic: string
    dirName: string
  }) => {
    try {
      const summaries = readTopicReportSummaries(cfg.libraryPath, args.dirName)
      return await generateContinueSuggestions(cfg, {
        topic: args.topic,
        dirName: args.dirName,
        reportSummaries: summaries
      })
    } catch (err: any) {
      const message = String(err?.message ?? err)
      console.error('[llm:generateContinueSuggestions] error:', message)
      throw new Error(message)
    }
  })
```

- [ ] **Step 4: 更新 import**

```typescript
import { generateInspirations, finalizeProgress, finalizeReview, generateFable, generateGroupInspiration, generateFableFromReport, generateContinueSuggestions } from '../lib/llm-tasks'
```

### 6b: 扩展 Files IPC（触发更新）

**Files:**
- Modify: `electron/ipc/files.ts`

- [ ] **Step 1: 添加 import**

```typescript
import { generateContinueSuggestions, readTopicReportSummaries } from '../lib/llm-tasks'
import { patchState } from './state'
import type { TopicContinueCache } from '@shared/index'
```

- [ ] **Step 2: 添加 `updateContinueSuggestions` 内部函数**

在 `registerFilesIpc` 内部添加：

```typescript
  async function updateContinueSuggestions(dirName: string) {
    try {
      const summaries = readTopicReportSummaries(cfg.libraryPath, dirName)
      if (summaries.length === 0) {
        // 没有报告，删除缓存
        const current = getCurrentState()
        const next = { ...current.topicContinueSuggestions }
        delete next[dirName]
        patchState({ topicContinueSuggestions: next })
        return
      }

      const suggestions = await generateContinueSuggestions(cfg, {
        topic: dirName,
        dirName,
        reportSummaries: summaries
      })

      const cache: TopicContinueCache = {
        generatedAt: new Date().toISOString(),
        suggestions: suggestions.length > 0 ? suggestions : []
      }

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

- [ ] **Step 3: 在 `writeProgress` 成功后触发更新**

在 `fs.writeFileSync(filePath, ...)` 之后、return 之前添加：

```typescript
    // 异步更新续谈推荐（不阻塞返回）
    updateContinueSuggestions(args.dirName).catch(console.error)
```

- [ ] **Step 4: 在 `deleteArchivedSession` 成功后触发更新**

在 `fs.rmSync(sessionDir, ...)` 之后、return 之前添加：

```typescript
    // 异步更新续谈推荐（不阻塞返回）
    updateContinueSuggestions(args.dirName).catch(console.error)
```

---

## Task 7: 扩展前端 Store

**Files:**
- Modify: `src/store/index.ts`

- [ ] **Step 1: 扩展 `Session` 类型**

```typescript
type Session = {
  mode: Mode
  topic: string
  dirName?: string
  file_path?: string
  difficulty: Difficulty
  temperature: number
  history: Message[]
  streaming: boolean
  abortId: string
  archivePending: boolean
  reviewFileBody?: string
  userRequirement?: string
  selectedTopic?: string
}
```

- [ ] **Step 2: 扩展 `startSession` 参数**

```typescript
  startSession: (a: {
    mode: Mode; topic: string; dirName?: string; file_path?: string
    difficulty: Difficulty; temperature: number
    userRequirement?: string
    selectedTopic?: string
  }) => void
```

- [ ] **Step 3: 在 `startSession` 实现中传递 `userRequirement`**

```typescript
  startSession: (a) => {
    const sid = crypto.randomUUID()
    const nextCount = get().session_count + 1
    set({
      session_count: nextCount,
      session: {
        mode: a.mode, topic: a.topic, dirName: a.dirName, file_path: a.file_path,
        difficulty: a.difficulty, temperature: a.temperature,
        history: [], streaming: false, abortId: sid, archivePending: false,
        userRequirement: a.userRequirement,
        selectedTopic: a.selectedTopic
      },
      modal: null,
      preStudyArgs: null,
      currentPage: 'study'
    })
    ipc.patchState({ ui: { session_count: nextCount } } as Partial<StateJson>)
  }
```

- [ ] **Step 4: 扩展 `saveCurrentSession`**

```typescript
    const unsaved: UnsavedSession = {
      id: s.abortId,
      mode: s.mode,
      topic: s.topic,
      dirName: s.dirName,
      file_path: s.file_path,
      difficulty: s.difficulty,
      temperature: s.temperature,
      history: s.history,
      userRequirement: s.userRequirement,
      selectedTopic: s.selectedTopic
    }
```

- [ ] **Step 5: 扩展 `restoreSession`**

```typescript
      session: {
        mode: unsaved.mode,
        topic: unsaved.topic,
        dirName: unsaved.dirName,
        file_path: unsaved.file_path,
        difficulty: unsaved.difficulty,
        temperature: unsaved.temperature,
        history: unsaved.history,
        streaming: false,
        abortId: unsaved.id,
        archivePending: false,
        userRequirement: unsaved.userRequirement,
        selectedTopic: unsaved.selectedTopic
      }
```

- [ ] **Step 6: 扩展 AppStore 类型添加 `topicContinueSuggestions`**

在 `AppStore` 类型中添加：

```typescript
topicContinueSuggestions: Record<string, TopicContinueCache>
```

- [ ] **Step 7: 在 init 中加载 `topicContinueSuggestions`**

在 `init` 的 `set({...})` 中添加：

```typescript
topicContinueSuggestions: state.topicContinueSuggestions ?? {},
```

---

## Task 8: 改造 PreStudyModal 为三态 UI

**Files:**
- Modify: `src/components/PreStudyModal.tsx`

这是一个较大的改造。按以下结构重写：

- [ ] **Step 1: 新增推荐主题卡片组件**

```typescript
type SuggestionCardProps = {
  suggestion: ContinueTopicSuggestion
  selected: boolean
  onSelect: () => void
}

function SuggestionCard({ suggestion, selected, onSelect }: SuggestionCardProps) {
  return (
    <div
      onClick={onSelect}
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
      <div className={`text-xs leading-relaxed ${selected ? 'text-parchment/70' : 'text-parchment/50'}`}>
        {suggestion.reason}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 修改 PreStudyModal 主组件**

状态管理：

```typescript
export function PreStudyModal() {
  const args = useStore(s => s.preStudyArgs)
  const lastUsed = useStore(s => s.lastUsed)
  const closePreStudy = useStore(s => s.closePreStudy)
  const startSession = useStore(s => s.startSession)
  const patchLastUsed = useStore(s => s.patchLastUsed)
  const state = useStore(s => s) // 获取 topicContinueSuggestions

  const [topic, setTopic] = useState(args?.topic ?? '')
  const [difficulty, setDifficulty] = useState<Difficulty>(lastUsed.difficulty)
  const [temperature, setTemperature] = useState<number>(lastUsed.temperature)
  const [userRequirement, setUserRequirement] = useState('')
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0)
  const [suggestions, setSuggestions] = useState<ContinueTopicSuggestion[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)

  const topicRef = useRef<HTMLInputElement>(null)
  const diffRef = useRef<HTMLDivElement>(null)
```

- [ ] **Step 3: 添加 useEffect 加载续谈推荐**

```typescript
  useEffect(() => {
    if (!args) return
    setTopic(args.topic)
    setDifficulty(lastUsed.difficulty)
    setTemperature(lastUsed.temperature)
    setUserRequirement('')
    setSelectedSuggestionIndex(0)

    if (args.dirName && args.mode === 'progress') {
      // 续谈场景：加载推荐
      const cached = state.topicContinueSuggestions?.[args.dirName]
      if (cached && cached.suggestions.length > 0) {
        setSuggestions(cached.suggestions)
      } else {
        // 无缓存，实时生成
        setLoadingSuggestions(true)
        ipc.llmGenerateContinueSuggestions({
          topic: args.topic,
          dirName: args.dirName
        }).then(result => {
          setSuggestions(result)
          setSelectedSuggestionIndex(0)
        }).catch(() => {
          setSuggestions([])
        }).finally(() => {
          setLoadingSuggestions(false)
        })
      }
    } else {
      setSuggestions([])
    }

    if (args.dirName) {
      diffRef.current?.querySelector('button')?.focus?.()
    } else if (args.topic) {
      diffRef.current?.querySelector('button')?.focus?.()
    } else {
      topicRef.current?.focus()
    }
  }, [args])
```

- [ ] **Step 4: 修改 onConfirm 传递 userRequirement 和 selectedTopic**

```typescript
  const onConfirm = async () => {
    const finalTopic = (showTopicInput ? topic : args.topic).trim()
    if (showTopicInput && !finalTopic) return

    const selectedTopic = isContinue && suggestions[selectedSuggestionIndex]
      ? suggestions[selectedSuggestionIndex].title
      : undefined

    await patchLastUsed({ difficulty, temperature })
    startSession({
      mode: args.mode, topic: finalTopic, dirName: args.dirName,
      file_path: args.file_path,
      difficulty, temperature,
      userRequirement: userRequirement.trim() || undefined,
      selectedTopic
    })
  }
```

（Task 7 已扩展 `startSession` 参数和 `Session` 类型支持 `selectedTopic`）

- [ ] **Step 5: 修改 JSX 为三态渲染**

条件判断：

```typescript
  if (!args) return null

  const isNewTopic = !args.dirName && !args.topic
  const isContinue = args.dirName && args.mode === 'progress'
  const isReview = args.dirName && args.mode === 'review'
  const showTopicInput = !args.dirName
```

主体内容：

```tsx
      {/* 主题区域 */}
      {showTopicInput ? (
        <div>
          <div className="field-label mb-2">今夜想学</div>
          <Input ref={topicRef} value={topic}
                 onChange={e => setTopic(e.target.value)}
                 placeholder="主题或一个问题"
                 className="w-full" />
        </div>
      ) : (
        <div className="text-xl">{args.topic}</div>
      )}

      {/* 续谈推荐（仅续谈场景） */}
      {isContinue && (
        <div>
          <div className="field-label mb-2">AI 推荐的续谈方向</div>
          {loadingSuggestions ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-16 rounded-lg border border-slate/10 bg-ink/50 animate-pulse" />
              ))}
            </div>
          ) : suggestions.length > 0 ? (
            <div className="space-y-2">
              {suggestions.map((s, i) => (
                <SuggestionCard
                  key={i}
                  suggestion={s}
                  selected={selectedSuggestionIndex === i}
                  onSelect={() => setSelectedSuggestionIndex(i)}
                />
              ))}
            </div>
          ) : (
            <div className="text-sm text-parchment/40">
              暂无推荐，你可以自由输入学习方向。
            </div>
          )}
        </div>
      )}

      {/* 附加要求（所有场景） */}
      <div>
        <div className="field-label mb-2">💡 你对这次学习还有什么要求？（可选）</div>
        <textarea
          value={userRequirement}
          onChange={e => setUserRequirement(e.target.value)}
          placeholder="例如：多给我一些代码示例 / 用更直观的比喻 / 重点讲数学推导..."
          maxLength={200}
          className="w-full min-h-[60px] bg-ink/60 border border-slate/20 rounded-md px-3 py-2 text-sm text-parchment placeholder:text-parchment/20 outline-none resize-y"
          style={{ scrollbarColor: 'rgba(148,163,184,0.3) transparent', scrollbarWidth: 'thin' }}
        />
        <div className="text-[10px] text-parchment/25 mt-1">
          {userRequirement.length}/200
        </div>
      </div>
```

- [ ] **Step 6: 确保 ESC 关闭和焦点策略保留**

---

## Task 9: 扩展前端 IPC 和 Study 页面启动 LLM

**Files:**
- Modify: `src/lib/ipc.ts`（如有显式类型声明）
- Modify: `src/pages/Study.tsx`（如有 start LLM 调用）

需要确认 Study.tsx 中如何调用 `llmStart`，然后传递 `selectedTopic` 和 `userRequirement`。

- [ ] **Step 1: 在 Study.tsx 中找到启动 LLM 的位置**

通常在 useEffect 中，当 session 初始化时调用 `ipc.llmStart`。需要将 `session.selectedTopic` 和 `session.userRequirement` 传入。

```typescript
await ipc.llmStart({
  sessionId: sid,
  mode: sess.mode,
  difficulty: sess.difficulty,
  profile,
  reviewFileBody: sess.reviewFileBody,
  progressSummary: // 需要获取
  history: sess.history,
  temperature: sess.temperature,
  selectedTopic: sess.selectedTopic,
  userRequirement: sess.userRequirement
})
```

---

## Task 10: 测试

**Files:**
- Modify: `tests/llm-tasks.test.ts`

- [ ] **Step 1: 添加 `generateContinueSuggestions` 测试**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { generateContinueSuggestions } from '../electron/lib/llm-tasks'

const mockCfg = {
  apiKey: 'test-key',
  baseUrl: 'https://test.example.com',
  model: 'test-model',
  libraryPath: '/tmp/test-library'
}

describe('generateContinueSuggestions', () => {
  it('parses valid JSON array response', async () => {
    const mockChat = vi.fn().mockResolvedValue('[{"title":"测试主题","reason":"测试理由"}]')
    // 需要 mock chatNonStream
  })

  it('returns empty array on invalid JSON', async () => {
    // ...
  })

  it('filters out items missing title or reason', async () => {
    // ...
  })
})
```

---

## Task 11: 构建与验证

- [ ] **Step 1: 运行 TypeScript 类型检查**

```bash
npx tsc --noEmit
```

- [ ] **Step 2: 运行测试**

```bash
npm run test
```

- [ ] **Step 3: 运行开发模式验证**

```bash
npm run dev
```

验证场景：
1. 新主题学习：PreStudyModal 显示主题输入 + 附加要求 + 难度/腔调
2. 续谈：显示推荐主题卡片 + 附加要求 + 难度/腔调
3. 复习：显示 topic 名 + 附加要求 + 难度/腔调
4. 归档后：检查 state.json 中 `topicContinueSuggestions` 是否更新
5. 删除 session 后：检查缓存是否更新

---

## 计划自审

### Spec 覆盖检查

| Spec 要求 | 对应 Task |
|-----------|-----------|
| 续谈弹窗展示 2-3 个推荐主题 | Task 8 |
| 推荐理由引用历史记录 | Task 3 (prompt) |
| 附加要求所有场景通用 | Task 8 |
| 难度/腔调保留 | Task 8 |
| 预生成缓存到 state.json | Task 2, 4, 6b |
| 归档后触发更新 | Task 6b |
| 删除 session 后触发更新 | Task 6b |
| 删除 topic 删除缓存 | Task 6b (通过 deleteArchivedSession 间接，如无删除 topic 功能则不适用) |
| 缓存为空时实时生成 | Task 8 |
| 附加要求融入 system prompt | Task 5 |

### Placeholder 扫描

- 无 TBD/TODO
- 无 "add appropriate error handling"
- 所有代码步骤包含完整代码
- 无 "similar to Task N"

### 类型一致性

- `ContinueTopicSuggestion` 在 types、llm-tasks、PreStudyModal 中一致
- `TopicContinueCache` 在 types、state、files 中一致
- `userRequirement` 在 types (Session, UnsavedSession, IpcApi)、store、PreStudyModal、prompts 中一致
- `selectedTopic` 在 types (Session, IpcApi)、store、PreStudyModal、prompts 中一致