# 学习报告图表自动生成 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为每次学习报告归档自动生成 Mermaid 知识图谱，并在前端渲染展示；已有报告但无图表的 session 提供一键补生成。

**Architecture:** Mermaid 路线——Kimi 生成 Mermaid 语法 -> 保存 `.mmd` 文件 -> 前端 mermaid.js 渲染为 SVG。异步触发，不阻塞归档流程。

**Tech Stack:** TypeScript, Electron IPC, Mermaid v11, Kimi API

---

## 文件映射

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/types/index.ts` | 修改 | `SessionMeta` 添加 `hasDiagram`/`diagramFile`；`IpcApi` 添加 `llmGenerateDiagram` |
| `electron/lib/diagram.ts` | 新建 | `generateDiagram` 函数：读取 prompt -> 调 Kimi -> 解析 JSON -> 保存 `.mmd` |
| `electron/ipc/llm.ts` | 修改 | 注册 `llm:generateDiagram` IPC handler |
| `electron/preload.ts` | 修改 | 暴露 `llmGenerateDiagram` 到 `window.api` |
| `src/lib/ipc.ts` | 修改 | 添加 `llmGenerateDiagram` facade |
| `electron/ipc/files.ts` | 修改 | `getSessionMeta` 扫描 `学习图表.mmd`；`readSessionFile` 支持 `.mmd` |
| `src/components/MermaidRenderer.tsx` | 新建 | mermaid.js 渲染封装 |
| `src/components/SessionViewer.tsx` | 修改 | `.mmd` 文件走 `MermaidRenderer` |
| `src/components/StudyLibrary.tsx` | 修改 | `hasImage` -> `hasDiagram`，添加补生成按钮 |
| `src/lib/finalize.ts` | 修改 | 归档完成后调用 `llmGenerateDiagram` |
| `tests/diagram.test.ts` | 新建 | `generateDiagram` 单元测试 |

---

## Task 1: 类型定义扩展

**Files:**
- Modify: `src/types/index.ts:34-51` (SessionMeta)
- Modify: `src/types/index.ts:116-180` (IpcApi)

### Step 1: 修改 SessionMeta

在 `src/types/index.ts` 的 `SessionMeta` 中，将 `hasImage`/`imageFile` 替换为图表相关字段。

```typescript
export type SessionMeta = {
  sessionNumber: number
  date: string
  title?: string
  hasReport: boolean
  hasTranscript: boolean
  hasReview: boolean
  hasFable: boolean
  fableCount: number
  hasDiagram: boolean      // 替代 hasImage
  hasFableImage: boolean
  reportFile?: string
  transcriptFile?: string
  reviewFile?: string
  fableFile?: string
  diagramFile?: string     // 替代 imageFile
  fableImageFile?: string
}
```

### Step 2: 修改 IpcApi

在 `IpcApi` 中添加 `llmGenerateDiagram`：

```typescript
llmGenerateDiagram: (args: {
  dirName: string
  sessionNumber: number
  reportBody: string
}) => Promise<void>
```

放在 `llmGenerateContinueSuggestions` 之后、`onLlmChunk` 之前。

### Step 3: 编译检查

Run: `npx tsc --noEmit`
Expected: PASS（此时只改了类型，无实现，但类型本身应通过）

### Step 4: Commit

```bash
git add src/types/index.ts
git commit -m "types: add hasDiagram/diagramFile and llmGenerateDiagram IPC"
```

---

## Task 2: 图表生成器后端

**Files:**
- Create: `electron/lib/diagram.ts`
- Test: `tests/diagram.test.ts`

### Step 1: 写失败测试

```typescript
// tests/diagram.test.ts
import { describe, it, expect, vi } from 'vitest'
import { generateDiagram } from '../electron/lib/diagram'

describe('generateDiagram', () => {
  it('returns undefined when report body is empty', async () => {
    const result = await generateDiagram(
      { apiKey: 'test', baseUrl: 'http://test', model: 'test', libraryPath: '/tmp' },
      ''
    )
    expect(result).toBeUndefined()
  })
})
```

Run: `npx vitest run tests/diagram.test.ts`
Expected: FAIL — `generateDiagram` not defined

### Step 2: 实现 generateDiagram

```typescript
// electron/lib/diagram.ts
import fs from 'node:fs'
import path from 'node:path'
import { chatNonStream } from './kimi'
import type { AppConfig } from '../env'

const PROMPTS_DIR = (() => {
  const standard = path.resolve(__dirname, '..', 'prompts')
  if (fs.existsSync(standard)) return standard
  return path.resolve(__dirname, '..', '..', 'electron', 'prompts')
})()

function readPrompt(n: string): string {
  return fs.readFileSync(path.join(PROMPTS_DIR, n), 'utf8')
}

interface DiagramResult {
  chartType: string
  title: string
  rationale: string
  mermaid: string
}

/**
 * 根据学习报告内容生成 Mermaid 图表。
 * @returns 生成的 Mermaid 语法，或 undefined（空输入或失败）
 */
export async function generateDiagram(
  cfg: AppConfig,
  reportBody: string
): Promise<string | undefined> {
  if (!reportBody || reportBody.trim().length < 50) {
    return undefined
  }

  const prompt = readPrompt('diagram.md').replace('{{report_body}}', reportBody)

  try {
    const text = await chatNonStream(cfg, {
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3
    })

    // 提取 JSON（可能包裹在 markdown 代码块中）
    const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
    const jsonText = jsonMatch ? jsonMatch[1].trim() : text.trim()

    const result = JSON.parse(jsonText) as DiagramResult
    if (!result.mermaid || typeof result.mermaid !== 'string') {
      console.error('[generateDiagram] missing mermaid field:', result)
      return undefined
    }

    return result.mermaid
  } catch (err) {
    console.error('[generateDiagram] failed:', err)
    return undefined
  }
}
```

### Step 3: 运行测试

Run: `npx vitest run tests/diagram.test.ts`
Expected: PASS（空输入返回 undefined）

### Step 4: 添加更多测试

```typescript
// 追加到 tests/diagram.test.ts
  it('returns undefined for short report body', async () => {
    const result = await generateDiagram(
      { apiKey: 'test', baseUrl: 'http://test', model: 'test', libraryPath: '/tmp' },
      'too short'
    )
    expect(result).toBeUndefined()
  })
```

Run: `npx vitest run tests/diagram.test.ts`
Expected: PASS

### Step 5: Commit

```bash
git add electron/lib/diagram.ts tests/diagram.test.ts
git commit -m "feat(diagram): add generateDiagram backend with tests"
```

---

## Task 3: IPC 三层注册

**Files:**
- Modify: `electron/ipc/llm.ts`
- Modify: `electron/preload.ts`
- Modify: `src/lib/ipc.ts`

### Step 1: 注册 IPC handler

在 `electron/ipc/llm.ts` 中，新增 import 和 handler：

```typescript
// 顶部新增 import
import { generateDiagram } from '../lib/diagram'
import fs from 'node:fs'
import path from 'node:path'

// 在 registerLlmIpc 函数末尾，llmGenerateContinueSuggestions 之后添加：
  ipcMain.handle('llm:generateDiagram', async (_, args: {
    dirName: string
    sessionNumber: number
    reportBody: string
  }) => {
    try {
      const mermaid = await generateDiagram(cfg, args.reportBody)
      if (mermaid) {
        const sessionDir = path.join(cfg.libraryPath, args.dirName, `s${args.sessionNumber}`)
        const diagramPath = path.join(sessionDir, '学习图表.mmd')
        fs.writeFileSync(diagramPath, mermaid, 'utf8')
      }
    } catch (err: any) {
      console.error('[llm:generateDiagram] error:', err?.message ?? err)
    }
  })
```

### Step 2: Preload 暴露

在 `electron/preload.ts` 中 `llmGenerateContinueSuggestions` 之后添加：

```typescript
llmGenerateDiagram: (a) => ipcRenderer.invoke('llm:generateDiagram', a),
```

### Step 3: 前端 facade

在 `src/lib/ipc.ts` 中 `llmGenerateContinueSuggestions` 之后添加：

```typescript
get llmGenerateDiagram() { return ensure().llmGenerateDiagram },
```

### Step 4: 编译检查

Run: `npx tsc --noEmit`
Expected: PASS

### Step 5: Commit

```bash
git add electron/ipc/llm.ts electron/preload.ts src/lib/ipc.ts
git commit -m "feat(ipc): wire llmGenerateDiagram through preload and facade"
```

---

## Task 4: 文件扫描更新

**Files:**
- Modify: `electron/ipc/files.ts:10-75` (getSessionMeta)
- Modify: `electron/ipc/files.ts:405-425` (readSessionFile)

### Step 1: 更新 getSessionMeta

替换 `学习配图` 扫描为 `学习图表.mmd` 扫描：

```typescript
  // 替换原有的 imageFile 扫描
  const diagramFile = files.find(n => n === '学习图表.mmd')
  const fableImageFile = files.find(n => /^寓言配图(-research)?\.\w+$/.test(n))
  const hasDiagram = !!diagramFile
  const hasFableImage = !!fableImageFile
```

返回对象中替换：
```typescript
  return {
    sessionNumber,
    date,
    title,
    hasReport,
    hasTranscript,
    hasReview,
    hasFable,
    fableCount,
    hasDiagram,       // 替代 hasImage
    hasFableImage,
    reportFile,
    transcriptFile,
    reviewFile,
    fableFile,
    diagramFile,      // 替代 imageFile
    fableImageFile,
  }
```

### Step 2: 更新 readSessionFile

在 `readSessionFile` handler 中，`.mmd` 文件返回 `text/plain`：

```typescript
    const isImage = /\.(png|jpe?g|gif|webp)$/i.test(resolved)
    const isMermaid = resolved.endsWith('.mmd')
    if (isImage) {
      const buffer = fs.readFileSync(resolved)
      return { content: buffer.toString('base64'), mimeType: getMimeType(resolved) }
    }
    const content = fs.readFileSync(resolved, 'utf8')
    return { content, mimeType: isMermaid ? 'text/plain' : 'text/markdown' }
```

### Step 3: 编译检查

Run: `npx tsc --noEmit`
Expected: PASS

### Step 4: Commit

```bash
git add electron/ipc/files.ts
git commit -m "feat(files): scan 学习图表.mmd, return text/plain for .mmd"
```

---

## Task 5: 安装 mermaid + 前端渲染组件

**Files:**
- Modify: `package.json`
- Create: `src/components/MermaidRenderer.tsx`

### Step 1: 安装 mermaid

Run: `npm install mermaid@^11.0.0`
Expected: 安装成功，package.json 和 package-lock.json 更新

### Step 2: 实现 MermaidRenderer

```typescript
// src/components/MermaidRenderer.tsx
import { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'

let mermaidInitialized = false

function initMermaid() {
  if (mermaidInitialized) return
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
  })
  mermaidInitialized = true
}

type Props = {
  source: string
}

export function MermaidRenderer({ source }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!containerRef.current || !source) return

    initMermaid()
    setError(null)

    const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    mermaid.render(id, source).then(({ svg }) => {
      if (containerRef.current) {
        containerRef.current.innerHTML = svg
      }
    }).catch((err) => {
      setError(err?.message || '图表渲染失败')
    })
  }, [source])

  if (error) {
    return (
      <div className="text-center py-8 text-wine font-sans text-sm">
        图表渲染失败，请重试
      </div>
    )
  }

  return <div ref={containerRef} className="mermaid-diagram flex justify-center" />
}
```

### Step 3: 编译检查

Run: `npx tsc --noEmit`
Expected: PASS

### Step 4: Commit

```bash
git add package.json package-lock.json src/components/MermaidRenderer.tsx
git commit -m "feat(renderer): install mermaid and add MermaidRenderer component"
```

---

## Task 6: SessionViewer 集成

**Files:**
- Modify: `src/components/SessionViewer.tsx`

### Step 1: 导入并添加渲染分支

```typescript
import { MermaidRenderer } from '@/components/MermaidRenderer'
```

在渲染逻辑中，在现有 `mimeType.startsWith('image/')` 判断之前添加 `.mmd` 分支：

```typescript
          {!loading && !error && fileName.endsWith('.mmd') && content && (
            <MermaidRenderer source={content} />
          )}

          {!loading && !error && !fileName.endsWith('.mmd') && mimeType.startsWith('image/') && content && (
            <img
              src={`data:${mimeType};base64,${content}`}
              alt={title}
              className="max-w-full h-auto mx-auto"
            />
          )}
```

### Step 2: 编译检查

Run: `npx tsc --noEmit`
Expected: PASS

### Step 3: Commit

```bash
git add src/components/SessionViewer.tsx
git commit -m "feat(viewer): render .mmd files via MermaidRenderer"
```

---

## Task 7: StudyLibrary UI 迁移

**Files:**
- Modify: `src/components/StudyLibrary.tsx`

### Step 1: 替换图片为图表

在 `fileButtons` 数组中：

```typescript
  const fileButtons: { label: string; fileName: string | undefined; disabled: boolean }[] = [
    { label: '谈话记录', fileName: session.reportFile, disabled: !session.hasReport || !session.reportFile },
    { label: '图表', fileName: session.diagramFile, disabled: !session.hasDiagram || !session.diagramFile },
  ]
```

### Step 2: 添加补生成按钮

在寓言按钮区域的类似位置，添加图表补生成按钮。在 `fileButtons` 渲染之后、`{/* 寓言按钮 */}` 之前插入：

```typescript
        {/* 图表补生成按钮 */}
        {session.hasReport && !session.hasDiagram && (
          <button
            onClick={async () => {
              try {
                // 读取报告内容
                const report = await ipc.readSessionFile({
                  dirName,
                  sessionNumber: session.sessionNumber,
                  fileName: session.reportFile!
                })
                await ipc.llmGenerateDiagram({
                  dirName,
                  sessionNumber: session.sessionNumber,
                  reportBody: report.content
                })
                // 刷新库以显示新生成的图表
                const lib = await ipc.scanLibrary()
                useStore.setState({ library: lib })
              } catch (e) {
                console.error('[StudyLibrary] generate diagram failed:', e)
              }
            }}
            className="px-2 py-1 text-[10px] font-sans leading-tight rounded border border-slate/30 text-parchment/70 hover:border-ember transition-colors min-h-[36px] flex items-center justify-center whitespace-nowrap"
          >
            📊 生成图表
          </button>
        )}
```

**注意**：这个按钮需要 `ipc` 已在文件顶部导入（确认 `import { ipc } from '@/lib/ipc'` 存在）。如果 `useStore` 未导入，需要添加 `import { useStore } from '@/store'`。

检查现有导入：
- `ipc` 是否已在 StudyLibrary.tsx 中导入？如果不在，需要添加。
- `useStore` 是否已在 StudyLibrary.tsx 中导入？如果不在，需要添加。

### Step 3: 编译检查

Run: `npx tsc --noEmit`
Expected: PASS

### Step 4: Commit

```bash
git add src/components/StudyLibrary.tsx
git commit -m "feat(library): replace image with diagram UI, add generate-diagram button"
```

---

## Task 8: 归档流程触发

**Files:**
- Modify: `src/lib/finalize.ts`

### Step 1: 在归档完成后触发图表生成

在 `finalize.ts` 的 progress 模式归档流程中，在 `showToast` 之后、`scanLibrary` 之前添加图表生成调用：

```typescript
      // 异步生成图表（不 await，不阻塞归档）
      try {
        ipc.llmGenerateDiagram({
          dirName,
          sessionNumber,
          reportBody: body
        }).catch((e) => {
          console.warn('[finalize] diagram generation failed:', e)
        })
      } catch (e) {
        console.warn('[finalize] diagram generation init failed:', e)
      }
```

插入位置：在 `s.showToast(`《${title}》已归档`)` 之后，`const lib = await ipc.scanLibrary()` 之前。

### Step 2: 编译检查

Run: `npx tsc --noEmit`
Expected: PASS

### Step 3: Commit

```bash
git add src/lib/finalize.ts
git commit -m "feat(finalize): trigger diagram generation after archiving"
```

---

## Task 9: 端到端验证

### Step 1: 完整构建检查

Run: `npm run build`
Expected: 无编译错误

### Step 2: 运行测试

Run: `npm run test`
Expected: 所有测试通过（包括新增 diagram 测试）

### Step 3: 手动验证清单

启动应用后验证：
- [ ] 已有 session 的卡片上显示"图表"按钮（如果有报告但无图表，显示"📊 生成图表"）
- [ ] 点击"📊 生成图表"后，按钮变为"图表"，点击可打开查看
- [ ] 新 session 归档后，自动在后台生成图表
- [ ] 图表在 SessionViewer 中正确渲染为 SVG
- [ ] 图表暗色主题与 UI 一致

### Step 4: Commit

```bash
git commit -m "feat(diagram): complete learning report diagram generation pipeline"
```

---

## 附录：已有修改文件汇总

此计划假设以下文件已在 brainstorming 阶段创建/修改（不在本计划的任务范围内，但实现时依赖）：

- `electron/prompts/diagram_prompt_v1.md` — Prompt 模板（已创建）
- `electron/prompts/diagram_diagnosis_report.md` — 诊断报告（已创建）
- `docs/superpowers/specs/2026-06-03-learning-report-diagram-design.md` — 设计文档（已创建）
