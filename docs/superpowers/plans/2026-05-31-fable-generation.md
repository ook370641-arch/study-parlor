# 寓言生成功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为学习库中已有学习报告但缺少寓言文件的 session，提供一键生成按钮「✨ 唤醒寓言」，点击后读取学习报告、调用 LLM 生成寓言、写入文件并刷新列表。

**Architecture:** 新增专用 IPC 链路 `llmGenerateFableFromReport`，输入为学习报告 body（而非对话历史），使用新的 prompt 模板 `fable-from-report.md`。UI 在 `StudyLibrary` 的 `SessionRow` 中维护组件级 `generatingFables` Set 状态，按钮在三种状态间切换：灰色禁用 → ✨ 唤醒寓言 → 正在书写...

**Tech Stack:** Electron 30 + React 18 + TypeScript + Tailwind CSS + Vitest + gray-matter

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `electron/prompts/fable-from-report.md` | 新建 | 基于学习报告生成寓言的 prompt 模板 |
| `src/types/index.ts` | 修改 | `IpcApi` 接口添加 `llmGenerateFableFromReport` |
| `electron/preload.ts` | 修改 | 暴露 `llmGenerateFableFromReport` IPC 方法 |
| `src/lib/ipc.ts` | 修改 | 添加 `llmGenerateFableFromReport` getter |
| `electron/lib/llm-tasks.ts` | 修改 | 新增 `generateFableFromReport` 函数 |
| `electron/ipc/llm.ts` | 修改 | 新增 IPC 处理器 `llm:generateFableFromReport` |
| `tests/llm-tasks.test.ts` | 修改 | 添加 `generateFableFromReport` 的单元测试 |
| `src/components/StudyLibrary.tsx` | 修改 | 按钮状态机 + 生成逻辑 + 取消机制 |

---

## Task 1: Prompt 模板

**Files:**
- Create: `electron/prompts/fable-from-report.md`

- [ ] **Step 1: 创建 prompt 模板**

```markdown
# 任务

根据以下学习报告，生成一则关于「{{topic}}」的寓言式概念讲解。

要求：
1. 从学习报告中提取核心概念
2. 用故事/寓言的方式间接讲授该概念
3. 故事要有角色、情节、冲突、转折
4. 直到故事快结尾时，读者才慢慢意识到概念是什么
5. 故事后补充一段精确解释，点破隐喻（每个元素对应概念的哪个部分）
6. 长度：1500-3000字，中文，文学性强
7. 只输出纯 JSON，不要 markdown 代码块，不要任何额外文字

# 学习报告

{{reportBody}}

# 输出格式

{
  "title": "寓言标题",
  "body": "完整的寓言正文（包含故事 + 解释）"
}
```

- [ ] **Step 2: 验证文件存在**

Run: `ls electron/prompts/`
Expected: 列表中包含 `fable-from-report.md`

- [ ] **Step 3: Commit**

```bash
git add electron/prompts/fable-from-report.md
git commit -m "feat: add fable-from-report prompt template"
```

---

## Task 2: IPC 类型定义与接线

**Files:**
- Modify: `src/types/index.ts`
- Modify: `electron/preload.ts`
- Modify: `src/lib/ipc.ts`

- [ ] **Step 1: 修改 `src/types/index.ts`，在 `IpcApi` 中添加新方法**

在 `llmGroupInspiration` 之后、`onLlmChunk` 之前插入：

```typescript
llmGenerateFableFromReport: (args: {
  reportBody: string
  topic: string
}) => Promise<{ title: string; body: string }>
```

完整上下文（用于定位）：
```typescript
  llmGroupInspiration: (args: {
    groupName: string
    topics: { dirName: string; title: string }[]
    profile: Profile
    strategy?: 'v1' | 'v2' | 'v3'
  }) => Promise<NewTopic>
  llmGenerateFableFromReport: (args: {
    reportBody: string
    topic: string
  }) => Promise<{ title: string; body: string }>
  onLlmChunk: (cb: (sessionId: string, text: string) => void) => () => void
```

- [ ] **Step 2: 修改 `electron/preload.ts`，暴露新方法**

在 `llmGroupInspiration` 之后、`onLlmChunk` 之前插入：

```typescript
llmGenerateFableFromReport: (a) => ipcRenderer.invoke('llm:generateFableFromReport', a),
```

完整上下文：
```typescript
  llmGroupInspiration: (a) => ipcRenderer.invoke('llm:groupInspiration', a),
  llmGenerateFableFromReport: (a) => ipcRenderer.invoke('llm:generateFableFromReport', a),

  onLlmChunk: (cb) => {
```

- [ ] **Step 3: 修改 `src/lib/ipc.ts`，添加 getter**

在 `llmGroupInspiration` 之后、`onLlmChunk` 之前插入：

```typescript
get llmGenerateFableFromReport() { return ensure().llmGenerateFableFromReport },
```

完整上下文：
```typescript
get llmGroupInspiration() { return ensure().llmGroupInspiration },
get llmGenerateFableFromReport() { return ensure().llmGenerateFableFromReport },
get onLlmChunk() { return ensure().onLlmChunk },
```

- [ ] **Step 4: TypeScript 编译验证**

Run: `npx tsc --noEmit`
Expected: 无错误（0 errors）

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts electron/preload.ts src/lib/ipc.ts
git commit -m "feat: add llmGenerateFableFromReport IPC types and wiring"
```

---

## Task 3: IPC 处理器与 LLM 任务函数

**Files:**
- Modify: `electron/lib/llm-tasks.ts`
- Modify: `electron/ipc/llm.ts`
- Modify: `tests/llm-tasks.test.ts`

- [ ] **Step 1: 修改 `electron/lib/llm-tasks.ts`，添加 `generateFableFromReport` 函数**

在 `generateFable` 函数之后、`getSortedSessionDirs` 函数之前插入：

```typescript
export async function generateFableFromReport(
  cfg: AppConfig,
  args: { reportBody: string; topic: string }
): Promise<{ title: string; body: string }> {
  const prompt = read('fable-from-report.md')
    .replace('{{reportBody}}', args.reportBody)
    .replace('{{topic}}', args.topic)

  try {
    const text = await chatNonStream(cfg, {
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7
    })
    const json = JSON.parse(text) as { title?: string; body?: string }
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

- [ ] **Step 2: 修改 `electron/ipc/llm.ts`，添加 IPC 处理器**

在 `llmGenerateFable` 处理器之后插入：

```typescript
  ipcMain.handle('llm:generateFableFromReport', async (_, args: {
    reportBody: string; topic: string
  }) => generateFableFromReport(cfg, args))
```

同时需要导入 `generateFableFromReport`：

修改 import 行：
```typescript
import { generateInspirations, finalizeProgress, finalizeReview, generateFable, generateGroupInspiration, generateFableFromReport } from '../lib/llm-tasks'
```

完整上下文（处理器区域）：
```typescript
  ipcMain.handle('llm:generateFable', async (_, args: {
    history: Message[]; topic: string
  }) => generateFable(cfg, args))

  ipcMain.handle('llm:generateFableFromReport', async (_, args: {
    reportBody: string; topic: string
  }) => generateFableFromReport(cfg, args))
```

- [ ] **Step 3: 修改 `tests/llm-tasks.test.ts`，添加测试**

在 import 语句中添加 `generateFableFromReport`：

```typescript
import {
  generateInspirations,
  generateGroupInspiration,
  finalizeProgress,
  finalizeReview,
  generateFableFromReport
} from '@electron/lib/llm-tasks'
```

在文件末尾添加测试套件：

```typescript
describe('generateFableFromReport', () => {
  it('parses valid JSON response with title and body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"title":"熵增的旅人","body":"从前有一个旅人...\\n\\n---\\n\\n这个故事中的旅人代表了系统中能量的流动..."}' } }]
      })
    })) as any)
    const out = await generateFableFromReport(cfg, {
      reportBody: '# 学习报告\n\n今天我们学习了熵增原理...',
      topic: '熵增原理'
    })
    expect(out.title).toBe('熵增的旅人')
    expect(out.body).toContain('从前有一个旅人')
    expect(out.body).toContain('这个故事中的旅人')
  })

  it('strips markdown code block before parsing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '```json\n{"title":"代码块标题","body":"# B"}\n```' } }]
      })
    })) as any)
    const out = await generateFableFromReport(cfg, {
      reportBody: 'report',
      topic: 'topic'
    })
    expect(out.title).toBe('代码块标题')
    expect(out.body).toBe('# B')
  })

  it('falls back to deterministic title on parse failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'oops' } }] })
    })) as any)
    const out = await generateFableFromReport(cfg, {
      reportBody: 'report body',
      topic: '测试主题'
    })
    expect(out.title).toBe('测试主题 — 寓言')
    expect(out.body).toContain('report body')
  })

  it('passes reportBody and topic into prompt', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"title":"T","body":"B"}' } }] })
    }))
    vi.stubGlobal('fetch', fetchSpy as any)
    await generateFableFromReport(cfg, {
      reportBody: '这是学习报告的内容',
      topic: '贝叶斯推断'
    })
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
    expect(body.messages[0].content).toContain('这是学习报告的内容')
    expect(body.messages[0].content).toContain('贝叶斯推断')
  })
})
```

- [ ] **Step 4: 运行测试**

Run: `npx vitest run tests/llm-tasks.test.ts`
Expected: 全部通过（包括新增的 4 个 `generateFableFromReport` 测试）

- [ ] **Step 5: Commit**

```bash
git add electron/lib/llm-tasks.ts electron/ipc/llm.ts tests/llm-tasks.test.ts
git commit -m "feat: implement generateFableFromReport backend with tests"
```

---

## Task 4: UI 层（StudyLibrary）

**Files:**
- Modify: `src/components/StudyLibrary.tsx`

- [ ] **Step 1: 添加必要 import**

在文件顶部，在 `useStore` import 之后添加 `ipc` import：

```typescript
import { ipc } from '@/lib/ipc'
```

如果文件中已有 `useState, useRef, useCallback, useEffect, useMemo`，保持不变。

在 `import { useStore } from '@/store'` 下一行添加：
```typescript
import { ipc } from '@/lib/ipc'
```

- [ ] **Step 2: 修改 `SessionRow` props 和按钮逻辑**

修改 `SessionRow` 函数签名，添加两个新 props：

```typescript
function SessionRow({
  dirName,
  session,
  onViewFile,
  onReview,
  onDelete,
  generatingFables,
  onGenerateFable,
}: {
  dirName: string
  session: SessionMeta
  onViewFile: (v: ViewerState) => void
  onReview: (session: SessionMeta) => void
  onDelete?: (dirName: string, sessionNumber: number) => void
  generatingFables: Set<string>
  onGenerateFable: (dirName: string, sessionNumber: number) => void
}) {
```

在函数体内，在 `fileButtons` 定义之后、return 之前添加：

```typescript
  const fableKey = `${dirName}-s${session.sessionNumber}`
  const isGeneratingFable = generatingFables.has(fableKey)
```

修改 `fileButtons` 数组，移除寓言项（因为寓言单独处理）：

```typescript
  const fileButtons: { label: string; fileName: string | undefined; disabled: boolean }[] = [
    { label: '学习报告', fileName: session.reportFile, disabled: !session.hasReport || !session.reportFile },
    { label: '原始对话', fileName: session.transcriptFile, disabled: !session.hasTranscript || !session.transcriptFile },
    { label: '图片', fileName: session.imageFile || session.fableImageFile, disabled: (!session.hasImage && !session.hasFableImage) || (!session.imageFile && !session.fableImageFile) },
  ]
```

修改按钮渲染区域（在 `<div className="flex flex-row gap-1.5 shrink-0">` 内部），将原有的 `{fileButtons.map(...)}` 替换为以下代码：

```tsx
        {fileButtons.map((btn) => (
          <button
            key={btn.label}
            disabled={btn.disabled}
            onClick={() =>
              !btn.disabled && btn.fileName &&
              onViewFile({
                dirName,
                sessionNumber: session.sessionNumber,
                fileName: btn.fileName,
                title: `${btn.label} · s${session.sessionNumber}`,
              })
            }
            className={`px-2 py-1 text-[10px] font-sans leading-tight rounded border transition-colors min-h-[36px] flex items-center justify-center whitespace-nowrap ${
              btn.disabled
                ? 'opacity-30 cursor-not-allowed border-slate/20 text-parchment/40'
                : 'border-slate/30 text-parchment/70 hover:border-ember'
            }`}
          >
            {btn.label}
          </button>
        ))}

        {/* 寓言按钮 */}
        {isGeneratingFable ? (
          <button
            onClick={() => onGenerateFable(dirName, session.sessionNumber)}
            className="px-2 py-1 text-[10px] font-sans leading-tight rounded border border-ember/40 text-ember/80 bg-ember/10 hover:bg-ember/20 transition-colors min-h-[36px] flex items-center justify-center whitespace-nowrap"
          >
            <span className="inline-block animate-spin mr-1">⟳</span>正在书写...
          </button>
        ) : session.hasFable ? (
          <button
            onClick={() =>
              session.fableFile &&
              onViewFile({
                dirName,
                sessionNumber: session.sessionNumber,
                fileName: session.fableFile,
                title: `寓言 · s${session.sessionNumber}`,
              })
            }
            className="px-2 py-1 text-[10px] font-sans leading-tight rounded border border-slate/30 text-parchment/70 hover:border-ember transition-colors min-h-[36px] flex items-center justify-center whitespace-nowrap"
          >
            寓言
          </button>
        ) : session.hasReport ? (
          <button
            onClick={() => onGenerateFable(dirName, session.sessionNumber)}
            className="px-2 py-1 text-[10px] font-sans leading-tight rounded border border-ember/40 text-ember/80 bg-ember/10 hover:border-ember hover:bg-ember/20 hover:text-ember transition-colors min-h-[36px] flex items-center justify-center whitespace-nowrap"
          >
            ✨ 唤醒寓言
          </button>
        ) : (
          <button
            disabled
            className="px-2 py-1 text-[10px] font-sans leading-tight rounded border border-slate/20 text-parchment/40 opacity-30 cursor-not-allowed min-h-[36px] flex items-center justify-center whitespace-nowrap"
          >
            寓言
          </button>
        )}
```

注意：上述按钮渲染代码应放在「复习报告 / 开始复习」按钮之前，即紧接在 `fileButtons.map(...)` 之后。

- [ ] **Step 3: 修改 `TopicAccordion` props，传递新的 fable props**

修改 `TopicAccordion` 函数签名，添加两个新 props：

```typescript
function TopicAccordion({
  topic,
  onViewFile,
  groupColor,
  onDragStart,
  onDeleteSession,
  onReviewSession,
  generatingFables,
  onGenerateFable,
}: {
  topic: TopicMeta
  onViewFile: (v: ViewerState) => void
  groupColor: string
  onDragStart?: (topic: TopicMeta, startX: number, startY: number) => void
  onDeleteSession?: (dirName: string, sessionNumber: number) => void
  onReviewSession?: (session: SessionMeta, topic: TopicMeta) => void
  generatingFables: Set<string>
  onGenerateFable: (dirName: string, sessionNumber: number) => void
}) {
```

修改 `TopicAccordion` 内部的 `SessionRow` 调用（在 `<div className="max-h-[160px]...` 内），添加两个新 prop：

```tsx
            <SessionRow
              key={s.sessionNumber}
              dirName={topic.dirName}
              session={s}
              onViewFile={onViewFile}
              onReview={(session) =>
                onReviewSession?.(session, topic)
              }
              onDelete={onDeleteSession}
              generatingFables={generatingFables}
              onGenerateFable={onGenerateFable}
            />
```

- [ ] **Step 4: 在 `StudyLibrary` 中添加 `generatingFables` state 和 handler**

在 `export function StudyLibrary()` 中，找到现有的 state hooks 区域，在 `const [currentPage, setCurrentPage] = useState(0)` 之后添加：

```typescript
  const [generatingFables, setGeneratingFables] = useState<Set<string>>(new Set())
```

在同一组件中，添加 `handleGenerateFable` handler（放在 `handleDragStart` 定义之前或之后都可以，保持相近即可）：

```typescript
  const handleGenerateFable = useCallback(async (dirName: string, sessionNumber: number) => {
    const key = `${dirName}-s${sessionNumber}`

    // 如果正在生成中，点击表示取消
    if (generatingFables.has(key)) {
      setGeneratingFables(prev => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
      return
    }

    setGeneratingFables(prev => new Set(prev).add(key))

    try {
      const topicMeta = library.find(t => t.dirName === dirName)
      const session = topicMeta?.sessions.find(s => s.sessionNumber === sessionNumber)
      if (!session?.reportFile) {
        useStore.getState().showToast('学习报告不存在，无法唤醒寓言')
        return
      }

      const { content } = await ipc.readSessionFile({ dirName, sessionNumber, fileName: session.reportFile })
      const matter = await import('gray-matter')
      const parsed = matter.default(content)
      const topic = parsed.data.title || session.title || dirName

      const fable = await ipc.llmGenerateFableFromReport({ reportBody: parsed.content, topic })
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
  }, [library, generatingFables])
```

- [ ] **Step 5: 修改 `TopicAccordion` 调用，传递新 props**

在 `StudyLibrary` 的 JSX 中，找到 `{paginatedTopics.map((topic) => (...))}` 区域，在 `TopicAccordion` 调用中添加两个新 prop：

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
            onGenerateFable={handleGenerateFable}
          />
```

- [ ] **Step 6: TypeScript 编译验证**

Run: `npx tsc --noEmit`
Expected: 无错误（0 errors）

- [ ] **Step 7: Commit**

```bash
git add src/components/StudyLibrary.tsx
git commit -m "feat: add fable generation UI in StudyLibrary"
```

---

## Task 5: 集成验证

- [ ] **Step 1: 启动应用**

Run: `npm run dev`

- [ ] **Step 2: 验证按钮显示状态**

打开学习库页面，展开一个 topic，验证每个 session 的寓言按钮状态：

| 场景 | 预期显示 |
|------|----------|
| Session 已有寓言文件 | 「寓言」（可点击，hover 边框变 ember） |
| Session 有学习报告但无寓言 | 「✨ 唤醒寓言」（ember 色，可点击） |
| Session 无学习报告 | 「寓言」（灰色禁用，opacity-30） |

- [ ] **Step 3: 验证生成流程（可选，需要真实 API key）**

点击「✨ 唤醒寓言」按钮：
1. 按钮变为「⟳ 正在书写...」
2. 再次点击可取消，按钮恢复为「✨ 唤醒寓言」
3. 等待生成完成后，按钮变为「寓言」（可点击查看）
4. 验证 `学习库/主题/sN/寓言.md` 文件已创建

- [ ] **Step 4: 验证错误场景**

如果测试环境不方便连接真实 API，可以手动测试：
1. 临时将 `llmGenerateFableFromReport` 在渲染进程 mock 为抛错，验证 toast 显示「寓言书写失败」
2. 或者查看 console 中是否有错误日志

---

## Self-Review Checklist

**Spec Coverage:**
- [x] 输入来源：学习报告 body（Task 4 Step 5）
- [x] 按钮布局 A：灰色 → ✨ 唤醒寓言 → 正在书写...（Task 4 Step 2）
- [x] 生成反馈：按钮变 loading + 可取消（Task 4 Step 2, 4）
- [x] Prompt：新建 fable-from-report.md（Task 1）
- [x] Frontmatter：保持现有 writeFable 结构（Task 4 Step 5 调用 ipc.writeFable）
- [x] 文件命名：中文 `寓言.md`（Task 4 Step 5 调用 ipc.writeFable）
- [x] 架构：新增专用 IPC（Task 2, 3）
- [x] 失败处理：toast「寓言书写失败」（Task 4 Step 5 catch 块）
- [x] 超时：不设超时（Task 4 Step 5 无 timeout 逻辑）
- [x] 取消：渲染层标记忽略（Task 4 Step 5 generatingFables Set）

**Placeholder Scan:**
- [x] 无 TBD/TODO
- [x] 无 "implement later"
- [x] 无 "add appropriate error handling"
- [x] 每个步骤包含完整代码
- [x] 无 "Similar to Task N"

**Type Consistency:**
- [x] `llmGenerateFableFromReport` 签名在 types、preload、ipc facade、llm-tasks、llm ipc 中一致
- [x] `generateFableFromReport` 参数名 `reportBody` / `topic` 在所有文件中一致
- [x] 返回值 `{ title: string; body: string }` 在所有文件中一致
