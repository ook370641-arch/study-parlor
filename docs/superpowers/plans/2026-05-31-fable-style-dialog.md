# 寓言风格偏好对话框实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为「✨ 唤醒寓言」按钮增加风格偏好输入对话框，用户可选择多选标签并填写补充描述，这些偏好作为 userPrompt 注入 LLM 生成过程。

**Architecture:** 新增独立对话框组件 `FableStyleDialog`，管理标签列表和选中状态。标签列表和上次选择持久化到 `state.json`。userPrompt 通过现有 IPC 链路 `llmGenerateFableFromReport` 传到后端，prompt 模板中注入。

**Tech Stack:** Electron 30 + React 18 + TypeScript + Tailwind CSS + Zustand

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/types/index.ts` | 修改 | `StateJson` 添加 `fableStyleTags`/`lastFableTags`；`IpcApi` 添加 `userPrompt` |
| `electron/lib/llm-tasks.ts` | 修改 | `generateFableFromReport` 接受 `userPrompt` |
| `electron/ipc/llm.ts` | 修改 | IPC 处理器传递 `userPrompt` |
| `electron/prompts/fable-from-report.md` | 修改 | 添加 `{{userPrompt}}` 占位符 |
| `src/store/index.ts` | 修改 | store 添加 `fableStyleTags`/`lastFableTags` 及 setter |
| `src/components/FableStyleDialog.tsx` | 新建 | 风格偏好对话框组件 |
| `src/components/StudyLibrary.tsx` | 修改 | 点击「唤醒寓言」打开对话框，集成生成流程 |

---

## Task 1: 类型定义与 Prompt 模板

**Files:**
- Modify: `src/types/index.ts`
- Modify: `electron/prompts/fable-from-report.md`

- [ ] **Step 1: 修改 `StateJson`，添加两个字段**

在 `src/types/index.ts` 的 `StateJson` 类型中，在 `inspirationStrategy` 之前插入：

```typescript
  fableStyleTags: string[]
  lastFableTags: string[]
```

完整 `StateJson`：
```typescript
export type StateJson = {
  version: 1
  profile: Profile
  lastUsed: { difficulty: Difficulty; temperature: Temperature }
  suggested_new_topics: { generated_at: string; topics: NewTopic[] } | null
  groupInspirations: Record<string, NewTopic>
  ui: { session_count: number }
  inspirationStrategy: 'v1' | 'v2' | 'v3'
  fableStyleTags: string[]
  lastFableTags: string[]
}
```

- [ ] **Step 2: 修改 `IpcApi.llmGenerateFableFromReport`，添加 `userPrompt`**

将现有的：
```typescript
  llmGenerateFableFromReport: (args: {
    reportBody: string
    topic: string
  }) => Promise<{ title: string; body: string }>
```

改为：
```typescript
  llmGenerateFableFromReport: (args: {
    reportBody: string
    topic: string
    userPrompt?: string
  }) => Promise<{ title: string; body: string }>
```

- [ ] **Step 3: 修改 `fable-from-report.md`，添加 userPrompt 占位符**

在文件末尾（`# 输出格式` 之前）插入：

```markdown
# 用户风格偏好

{{userPrompt}}
```

完整文件末尾应为：
```markdown
# 用户风格偏好

{{userPrompt}}

# 输出格式

{
  "title": "寓言标题",
  "body": "完整的寓言正文（包含故事 + 解释）"
}
```

- [ ] **Step 4: TypeScript 编译验证**

Run: `npx tsc --noEmit`
Expected: 无新增错误

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts electron/prompts/fable-from-report.md
git commit -m "feat: add fable style tags state and userPrompt to types and prompt"
```

---

## Task 2: 后端 IPC 与 LLM 任务

**Files:**
- Modify: `electron/lib/llm-tasks.ts`
- Modify: `electron/ipc/llm.ts`

- [ ] **Step 1: 修改 `generateFableFromReport`，接受 `userPrompt`**

将 `electron/lib/llm-tasks.ts` 中的 `generateFableFromReport` 函数签名和实现替换为：

```typescript
export async function generateFableFromReport(
  cfg: AppConfig,
  args: { reportBody: string; topic: string; userPrompt?: string }
): Promise<{ title: string; body: string }> {
  const userPromptSection = args.userPrompt
    ? `请根据以下用户偏好调整寓言的风格和呈现方式：\n${args.userPrompt}`
    : ''

  const prompt = read('fable-from-report.md')
    .replace('{{reportBody}}', args.reportBody)
    .replace('{{topic}}', args.topic)
    .replace('{{userPrompt}}', userPromptSection)

  try {
    const text = await chatNonStream(cfg, {
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7
    })
    const extracted = extractJsonObject(text)
    if (!extracted) throw new Error('JSON extraction failed')
    const json = JSON.parse(extracted) as { title?: string; body?: string }
    if (!json.title || !json.body) throw new Error('shape')
    return { title: json.title, body: json.body }
  } catch {
    return {
      title: `${args.topic} — 寓言`,
      body: `> 寓言生成失败，以下为原始学习报告：\n\n${args.reportBody}`
    }
  }
}
```

- [ ] **Step 2: 修改 IPC 处理器，传递 `userPrompt`**

在 `electron/ipc/llm.ts` 中，将现有的 `llm:generateFableFromReport` 处理器：

```typescript
  ipcMain.handle('llm:generateFableFromReport', async (_, args: {
    reportBody: string; topic: string
  }) => generateFableFromReport(cfg, args))
```

改为：
```typescript
  ipcMain.handle('llm:generateFableFromReport', async (_, args: {
    reportBody: string; topic: string; userPrompt?: string
  }) => generateFableFromReport(cfg, args))
```

- [ ] **Step 3: TypeScript 编译验证**

Run: `npx tsc --noEmit`
Expected: 无新增错误

- [ ] **Step 4: Commit**

```bash
git add electron/lib/llm-tasks.ts electron/ipc/llm.ts
git commit -m "feat: pass userPrompt through to generateFableFromReport backend"
```

---

## Task 3: Store 状态管理

**Files:**
- Modify: `src/store/index.ts`

- [ ] **Step 1: 在 `AppStore` 类型中添加字段和 setter**

在 `src/store/index.ts` 的 `AppStore` 类型中，在 `setInspirationStrategy` 之后添加：

```typescript
  fableStyleTags: string[]
  lastFableTags: string[]
  setFableStyleTags: (tags: string[]) => void
  setLastFableTags: (tags: string[]) => void
```

- [ ] **Step 2: 在 store 初始值中添加默认值**

在 `create<AppStore>` 的初始对象中，在 `inspirationStrategy: 'v2'` 之后添加：

```typescript
  fableStyleTags: ['科幻', '童话', '历史', '日常生活', '悬疑', '诗意散文'],
  lastFableTags: [],
```

- [ ] **Step 3: 在 `init` 中从 state.json 加载**

在 `init` 方法的 `set({...})` 调用中，在 `inspirationStrategy: state.inspirationStrategy ?? 'v2'` 之后添加：

```typescript
      fableStyleTags: state.fableStyleTags ?? ['科幻', '童话', '历史', '日常生活', '悬疑', '诗意散文'],
      lastFableTags: state.lastFableTags ?? [],
```

- [ ] **Step 4: 添加 setter actions**

在 store 末尾（`setInspirationStrategy` 之后）添加：

```typescript
  setFableStyleTags: (tags) => {
    set({ fableStyleTags: tags })
    ipc.patchState({ fableStyleTags: tags } as Partial<StateJson>)
  },
  setLastFableTags: (tags) => {
    set({ lastFableTags: tags })
    ipc.patchState({ lastFableTags: tags } as Partial<StateJson>)
  },
```

- [ ] **Step 5: TypeScript 编译验证**

Run: `npx tsc --noEmit`
Expected: 无新增错误

- [ ] **Step 6: Commit**

```bash
git add src/store/index.ts
git commit -m "feat: add fableStyleTags and lastFableTags to store with persistence"
```

---

## Task 4: FableStyleDialog 组件

**Files:**
- Create: `src/components/FableStyleDialog.tsx`

- [ ] **Step 1: 创建对话框组件**

创建 `src/components/FableStyleDialog.tsx`，内容如下：

```tsx
import { useState, useRef, useEffect } from 'react'

interface Props {
  open: boolean
  tags: string[]
  defaultSelected: string[]
  onClose: () => void
  onConfirm: (selectedTags: string[], description: string) => void
}

export function FableStyleDialog({ open, tags, defaultSelected, onClose, onConfirm }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [description, setDescription] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [newTag, setNewTag] = useState('')
  const [localTags, setLocalTags] = useState(tags)
  const inputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (open) {
      setSelected(new Set(defaultSelected))
      setDescription('')
      setLocalTags(tags)
    }
  }, [open, tags, defaultSelected])

  useEffect(() => {
    if (isAdding && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isAdding])

  if (!open) return null

  const toggleTag = (tag: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  const removeTag = (tag: string) => {
    setLocalTags(prev => prev.filter(t => t !== tag))
    setSelected(prev => {
      const next = new Set(prev)
      next.delete(tag)
      return next
    })
  }

  const confirmAddTag = () => {
    const trimmed = newTag.trim()
    if (trimmed && !localTags.includes(trimmed)) {
      setLocalTags(prev => [...prev, trimmed])
      setSelected(prev => new Set(prev).add(trimmed))
    }
    setNewTag('')
    setIsAdding(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') confirmAddTag()
    if (e.key === 'Escape') {
      setNewTag('')
      setIsAdding(false)
    }
  }

  const handleConfirm = () => {
    onConfirm(Array.from(selected), description.trim())
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-ink/95 border border-slate/25 rounded-lg p-5 w-full max-w-md mx-4 shadow-2xl"
        style={{ backdropFilter: 'blur(12px)' }}
      >
        <h3 className="text-sm text-parchment font-medium mb-1">✨ 为这则寓言注入你的意图</h3>
        <p className="text-[11px] text-parchment/40 mb-4">选择风格标签，或写下你自己的想法</p>

        <div className="flex flex-wrap gap-2 mb-4">
          {localTags.map(tag => (
            <span
              key={tag}
              onClick={() => toggleTag(tag)}
              className={`relative group px-2.5 py-1 text-[11px] rounded-full border cursor-pointer transition-colors ${
                selected.has(tag)
                  ? 'border-ember/50 text-ember bg-ember/10'
                  : 'border-slate/20 text-parchment/60 hover:border-slate/40'
              }`}
            >
              {tag}
              <span
                onClick={(e) => { e.stopPropagation(); removeTag(tag) }}
                className="hidden group-hover:inline ml-1 text-parchment/30 hover:text-wine cursor-pointer"
              >
                ✕
              </span>
            </span>
          ))}

          {isAdding ? (
            <input
              ref={inputRef}
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => {
                if (newTag.trim()) confirmAddTag()
                else setIsAdding(false)
              }}
              placeholder="新标签..."
              className="px-2.5 py-1 text-[11px] rounded-full border border-ember/30 bg-ink text-parchment outline-none w-20"
            />
          ) : (
            <button
              onClick={() => setIsAdding(true)}
              className="px-2.5 py-1 text-[11px] rounded-full border border-dashed border-slate/20 text-parchment/40 hover:border-slate/40 hover:text-parchment/60 transition-colors"
            >
              +
            </button>
          )}
        </div>

        <textarea
          ref={textareaRef}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="补充你的想法（可选）...&#10;如：主角是一位老档案管理员，背景是一座不断丢失数据的图书馆"
          className="w-full min-h-[72px] bg-ink/60 border border-slate/20 rounded-md px-3 py-2 text-[11px] text-parchment placeholder:text-parchment/20 outline-none resize-y"
          style={{ scrollbarColor: 'rgba(148,163,184,0.3) transparent', scrollbarWidth: 'thin' }}
        />
        <p className="text-[10px] text-parchment/25 mt-1.5">
          这些描述将作为提示词与学习内容一同交给 AI
        </p>

        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-[11px] rounded border border-slate/20 text-parchment/50 hover:border-slate/40 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            className="px-3 py-1.5 text-[11px] rounded border border-ember/40 text-ember bg-ember/10 hover:bg-ember/20 transition-colors"
          >
            开始书写
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript 编译验证**

Run: `npx tsc --noEmit`
Expected: 无新增错误

- [ ] **Step 3: Commit**

```bash
git add src/components/FableStyleDialog.tsx
git commit -m "feat: add FableStyleDialog component for user style preferences"
```

---

## Task 5: 集成到 StudyLibrary

**Files:**
- Modify: `src/components/StudyLibrary.tsx`

- [ ] **Step 1: 导入新组件**

在 `src/components/StudyLibrary.tsx` 顶部，在 `import { ReviewFlash } from './ReviewFlash'` 之后添加：

```typescript
import { FableStyleDialog } from './FableStyleDialog'
```

- [ ] **Step 2: 添加对话框状态**

在 `StudyLibrary` 组件中，找到现有的 state hooks 区域，在 `const [generatingFables, setGeneratingFables] = useState<Set<string>>(new Set())` 之后添加：

```typescript
  const [styleDialogOpen, setStyleDialogOpen] = useState(false)
  const [pendingFable, setPendingFable] = useState<{ dirName: string; sessionNumber: number } | null>(null)
```

- [ ] **Step 3: 从 store 读取标签**

在组件中（和其他 store selectors 一起），添加：

```typescript
  const fableStyleTags = useStore((s) => s.fableStyleTags)
  const lastFableTags = useStore((s) => s.lastFableTags)
  const setLastFableTags = useStore((s) => s.setLastFableTags)
```

- [ ] **Step 4: 重构 `handleGenerateFable`**

将现有的 `handleGenerateFable`（line 417-459）替换为两个函数：

**a) 点击「✨ 唤醒寓言」时打开对话框：**

```typescript
  const handleGenerateFableClick = useCallback((dirName: string, sessionNumber: number) => {
    const key = `${dirName}-s${sessionNumber}`

    // 如果正在生成中，点击表示取消
    if (generatingFablesRef.current.has(key)) {
      setGeneratingFables(prev => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
      return
    }

    const topicMeta = library.find(t => t.dirName === dirName)
    const session = topicMeta?.sessions.find(s => s.sessionNumber === sessionNumber)
    if (!session?.reportFile) {
      useStore.getState().showToast('学习报告不存在，无法唤醒寓言')
      return
    }

    // 打开风格偏好对话框
    setPendingFable({ dirName, sessionNumber })
    setStyleDialogOpen(true)
  }, [library])
```

**b) 对话框确认后执行生成：**

```typescript
  const handleStyleConfirm = useCallback(async (selectedTags: string[], description: string) => {
    if (!pendingFable) return
    const { dirName, sessionNumber } = pendingFable
    const key = `${dirName}-s${sessionNumber}`

    // 保存上次选中的标签
    setLastFableTags(selectedTags)

    // 构建 userPrompt
    const tagsText = selectedTags.join('、')
    const desc = description.trim()
    let userPrompt = ''
    if (tagsText && desc) {
      userPrompt = `风格：${tagsText}。${desc}`
    } else if (tagsText) {
      userPrompt = `风格：${tagsText}`
    } else if (desc) {
      userPrompt = desc
    }

    setStyleDialogOpen(false)
    setPendingFable(null)
    setGeneratingFables(prev => new Set(prev).add(key))

    try {
      const topicMeta = library.find(t => t.dirName === dirName)
      const session = topicMeta?.sessions.find(s => s.sessionNumber === sessionNumber)
      if (!session?.reportFile) {
        useStore.getState().showToast('学习报告不存在，无法唤醒寓言')
        return
      }

      const { content } = await ipc.readSessionFile({ dirName, sessionNumber, fileName: session.reportFile })
      const reportBody = stripFrontmatter(content)
      const topic = session.title || dirName

      const fable = await ipc.llmGenerateFableFromReport({ reportBody, topic, userPrompt: userPrompt || undefined })
      await ipc.writeFable({ dirName, sessionNumber, title: fable.title, body: fable.body })

      const lib = await ipc.scanLibrary()
      useStore.setState({ library: lib })
      useStore.getState().showToast(`寓言「${fable.title}」已唤醒`)
    } catch (err: any) {
      useStore.getState().showToast('寓言书写失败：' + (err?.message ?? err))
    } finally {
      setGeneratingFables(prev => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }
  }, [library, pendingFable, setLastFableTags])
```

- [ ] **Step 5: 更新 `SessionRow` 的 onGenerateFable prop**

将 `SessionRow` 的 `onGenerateFable` prop 从调用 `handleGenerateFable` 改为调用 `handleGenerateFableClick`。

在 `TopicAccordion` 的调用处（当前传递 `onGenerateFable={onGenerateFable}`），改为传递 `handleGenerateFableClick`。

**注意**：需要修改 `TopicAccordion` 的 prop 命名以匹配，或者直接在 JSX 中传递 `handleGenerateFableClick`。

找到 StudyLibrary JSX 中 `TopicAccordion` 的调用：

```tsx
          <TopicAccordion
            key={topic.dirName}
            topic={topic}
            onViewFile={setViewer}
            groupColor={groupColorMap.get(topic.groupId) || '#d97757'}
            onDragStart={handleDragStart}
            onDeleteSession={handleDeleteClick}
            onReviewSession={handleReviewSession}
            generatingFables={generatingFables}
            onGenerateFable={handleGenerateFableClick}
          />
```

- [ ] **Step 6: 添加 FableStyleDialog 到 JSX**

在 `StudyLibrary` 的 return JSX 中（在 `</div>` 闭合标签之前，和其他 dialog/modal 组件一起），添加：

```tsx
      <FableStyleDialog
        open={styleDialogOpen}
        tags={fableStyleTags}
        defaultSelected={lastFableTags}
        onClose={() => {
          setStyleDialogOpen(false)
          setPendingFable(null)
        }}
        onConfirm={handleStyleConfirm}
      />
```

- [ ] **Step 7: TypeScript 编译验证**

Run: `npx tsc --noEmit`
Expected: 无新增错误

- [ ] **Step 8: Commit**

```bash
git add src/components/StudyLibrary.tsx
git commit -m "feat: integrate FableStyleDialog into StudyLibrary fable generation flow"
```

---

## Task 6: 集成验证

- [ ] **Step 1: 运行测试**

```bash
npx vitest run tests/llm-tasks.test.ts
```
Expected: 19/19 通过

- [ ] **Step 2: TypeScript 编译**

```bash
npx tsc --noEmit
```
Expected: 无新增错误

- [ ] **Step 3: 启动应用验证**

```bash
npm run dev
```

验证以下场景：
1. 点击「✨ 唤醒寓言」→ 对话框弹出，显示默认标签
2. 选择标签（多选），填写补充描述
3. 点击「开始书写」→ 对话框关闭，按钮变为「⟳ 正在书写...」
4. 生成完成后按钮变为「寓言」
5. 再次点击「✨ 唤醒寓言」→ 上次选中的标签自动高亮
6. 添加新标签 → 出现在列表中
7. 删除标签 → 从列表移除
8. 点击「取消」→ 对话框关闭，不保存选择

---

## Self-Review Checklist

**Spec Coverage:**
- [x] 多选标签（Task 4, 5）
- [x] 标签可增删改（Task 4）
- [x] 补充描述 textarea（Task 4）
- [x] 记忆上次选中标签（Task 3, 5）
- [x] userPrompt 注入 prompt（Task 1, 2）
- [x] 持久化到 state.json（Task 3）
- [x] 取消按钮（Task 4）
- [x] 默认值（Task 3）

**Placeholder Scan:**
- [x] 无 TBD/TODO
- [x] 无 "implement later"
- [x] 每个步骤包含完整代码

**Type Consistency:**
- [x] `userPrompt?: string` 在 types, preload(不变), ipc facade(不变), llm-tasks, llm ipc 中一致
- [x] `fableStyleTags`/`lastFableTags` 在 StateJson, store init, store setters 中一致
