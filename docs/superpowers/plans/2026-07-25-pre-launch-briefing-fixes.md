# 夜航简报上线前修复 · 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复夜航简报上线前审查发现的 12 项缺陷，覆盖运行时 Bug、LLM 入参质量、存档持久化三个维度，并补 3 个 E2E 测试。

**Architecture:** 按依赖层级自底向上：基础层（kimi.ts 超时、extract-json fallback）→ 核心逻辑层（LLM 参数、per-company 查询、BrowserWindow 并发）→ IO 层（原子写入）→ 状态层（briefingRead GC）→ 渲染层（Writing catalog UI）→ 验证层（E2E 测试）。

**Tech Stack:** TypeScript, Electron, React, Zustand, Vitest, Playwright

---

### 文件结构

| 文件 | 修改内容 |
|---|---|
| `electron/lib/kimi.ts` | F9: 超时加 `code: 'TIMEOUT'`（`timedOut` 模式） |
| `electron/lib/extract-json.ts` | F6: fallback 用 `lastIndexOf('}')` 替代 `$` 锚点 |
| `electron/lib/job-briefing.ts` | F1(extraction→thinking), F2(reasoning_effort→max), F5(原子写入), F7(per-company查询), F8(BrowserWindow信号量) |
| `electron/lib/llm-tasks.ts` | F1: `generateWritingSummary` 加 thinking |
| `electron/ipc/article-assistant.ts` | F3: guide 生成加 `thinking: { type: 'enabled', reasoning_effort: 'max' }` |
| `electron/ipc/briefing.ts` | F5: 缓存写入 temp+rename |
| `electron/ipc/job-briefing.ts` | F5: E2E mock 路径原子写入 |
| `src/store/index.ts` | F10: `deleteBriefings`/`deleteJobBriefings` 清理 `briefingRead` |
| `electron/ipc/writing.ts` | F11: 写空摘要占位 |
| `src/components/writing/WritingTree.tsx` | F11: 无摘要时显示提示文案 |
| `e2e/specs/briefing-annotations-persistence.spec.ts` | **新建** F12-1 |
| `e2e/specs/briefing-assistant-session-persistence.spec.ts` | **新建** F12-2 |
| `e2e/specs/briefing-delete-cleanup.spec.ts` | **新建** F12-3 |

---

### Task 1: F9 — `chatNonStream` 超时加 `code: 'TIMEOUT'`

**Files:**
- Modify: `electron/lib/kimi.ts:86-135`

- [ ] **Step 1: 加 `timedOut` 标记和 error code**

在 `chatNonStream` 函数中，参照 `chatStream`（L173-175, L257-259）的 `timedOut` 模式：

```ts
export async function chatNonStream(
  cfg: AppConfig,
  args: { messages: Message[]; temperature: number; thinking?: ThinkingConfig; signal?: AbortSignal }
): Promise<string> {
  const TIMEOUT_MS = 300_000
  const ctl = new AbortController()
  let timedOut = false  // ← 新增
  const timeoutId = setTimeout(() => {
    timedOut = true     // ← 新增
    ctl.abort()
  }, TIMEOUT_MS)
  let externalListenerAdded = false
  const onExternalAbort = () => ctl.abort()
  if (args.signal) {
    if (args.signal.aborted) {
      ctl.abort()
    } else {
      args.signal.addEventListener('abort', onExternalAbort, { once: true })
      externalListenerAdded = true
    }
  }

  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      // ... 现有 fetch 调用保持不变 ...
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error('[kimi] chatNonStream HTTP error:', res.status, body.slice(0, 500))
      throw new Error(`Kimi non-stream HTTP ${res.status}: ${body.slice(0, 200)}`)
    }
    const json = await res.json() as { choices: { message: { content: string } }[] }
    const content = json.choices[0]?.message?.content ?? ''
    if (!content) throw new Error('Kimi returned empty content')
    return content
  } catch (err: any) {
    // ← 新增 catch 块
    if (timedOut) {
      const e: any = new Error(`Request timeout after ${TIMEOUT_MS}ms`)
      e.code = 'TIMEOUT'
      throw e
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
    if (externalListenerAdded) {
      args.signal!.removeEventListener('abort', onExternalAbort)
    }
  }
}
```

- [ ] **Step 2: 验证 — 运行现有测试**

```bash
npx vitest run tests/job-briefing.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add electron/lib/kimi.ts
git commit -m "fix(kimi): add TIMEOUT error code to chatNonStream internal timeout"
```

---

### Task 2: F6 — `extractJsonObject` fallback 修复

**Files:**
- Modify: `electron/lib/extract-json.ts:84-95`
- Modify: `electron/lib/extract-json.ts:148`（`extractJsonArray` 同样的问题）

- [ ] **Step 1: 修复 `extractJsonObject` fallback**

替换 L84-95 的 fallback：

```ts
  // Fallback: 括号平衡失败时，尝试从第一个 { 到文本中最后一个 }
  const afterStart = text.slice(start)
  const lastBrace = afterStart.lastIndexOf('}')
  if (lastBrace !== -1) {
    const candidate = text.slice(start, start + lastBrace + 1)
    try {
      JSON.parse(candidate)
      return candidate
    } catch { /* fall through to return null */ }
  }

  return null
}
```

- [ ] **Step 2: 同样修复 `extractJsonArray` fallback（L148）**

```ts
  // Fallback
  const afterStart = text.slice(start)
  const lastBracket = afterStart.lastIndexOf(']')
  if (lastBracket !== -1) {
    const candidate = text.slice(start, start + lastBracket + 1)
    try {
      JSON.parse(candidate)
      return candidate
    } catch { /* fall through to return null */ }
  }

  return null
}
```

- [ ] **Step 3: 运行现有 JSON 提取测试**

```bash
npx vitest run tests/article-assistant/json-extract.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add electron/lib/extract-json.ts
git commit -m "fix(extract-json): use lastIndexOf instead of $ anchor in fallback regex"
```

---

### Task 3: F1 — Extraction 任务启用 thinking

**Files:**
- Modify: `electron/lib/job-briefing.ts` L272, L339, L542, L569, L594
- Modify: `electron/lib/llm-tasks.ts` L343-349

- [ ] **Step 1: `extractJobsFromHtml`（L270-273）**

```ts
  const text = await chatNonStream(cfg, {
    messages: [{ role: 'user', content: prompt } as Message],
    temperature: 0.3,
    thinking: { type: 'enabled' },  // was: { type: 'disabled' }
  })
```

- [ ] **Step 2: `discoverEvents` 内 LLM 调用（L336-341）— 追加 `reasoning_effort`**

```ts
      const text = await chatNonStream(cfg, {
        messages: [{ role: 'user', content: prompt } as Message],
        temperature: 0.3,
        thinking: { type: 'enabled', reasoning_effort: 'high' },  // was: { type: 'enabled' }
        signal: opts.signal,
      })
```

- [ ] **Step 3: `generateJobBriefingKeywords`（L539-544）**

```ts
  const text = await chatNonStream(cfg, {
    messages: [{ role: 'user', content: prompt } as Message],
    temperature: 0.3,
    thinking: { type: 'enabled' },  // was: { type: 'disabled' }
    signal: opts.signal,
  })
```

- [ ] **Step 4: `generateArticleSearchQuery`（L566-570）**

```ts
  const text = await chatNonStream(cfg, {
    messages: [{ role: 'user', content: prompt } as Message],
    temperature: 0.3,
    thinking: { type: 'enabled' },  // was: { type: 'disabled' }
  })
```

- [ ] **Step 5: `runQuestionQuery`（L591-596）**

```ts
  const text = await chatNonStream(cfg, {
    messages: [{ role: 'user', content: prompt } as Message],
    temperature: 0.3,
    thinking: { type: 'enabled' },  // was: { type: 'disabled' }
    signal: opts.signal,
  })
```

- [ ] **Step 6: `generateWritingSummary`（`electron/lib/llm-tasks.ts` L343-349）**

```ts
    const content = await chatNonStream(cfg, {
      messages: [
        { role: 'system', content: '为文章写一句话中文摘要（≤40字）。只输出摘要本身：禁止引号、禁止markdown、禁止"本文"开头、禁止换行。' },
        { role: 'user', content: `标题：${title}\n\n${body.slice(0, 2000)}` },
      ],
      temperature: 0.3,
      thinking: { type: 'enabled' },  // ← 新增
    })
```

- [ ] **Step 7: 运行测试验证**

```bash
npx vitest run tests/job-briefing.test.ts tests/llm-tasks.test.ts
```

- [ ] **Step 8: Commit**

```bash
git add electron/lib/job-briefing.ts electron/lib/llm-tasks.ts
git commit -m "fix(llm): enable thinking for all extraction tasks to preserve intended temperature"
```

---

### Task 4: F2 + F3 — reasoning_effort → max（synthesis / match-jobs / guide）

**Files:**
- Modify: `electron/lib/job-briefing.ts` L475, L779
- Modify: `electron/ipc/article-assistant.ts` L256-262

- [ ] **Step 1: `matchJobsToProfile`（L472-477）— `reasoning_effort: 'high'` → `'max'`**

```ts
  const text = await chatNonStream(cfg, {
    messages: [{ role: 'user', content: prompt } as Message],
    temperature: 0.3,
    thinking: { type: 'enabled', reasoning_effort: 'max' },  // was: 'high'
    signal: opts.signal,
  })
```

- [ ] **Step 2: `generateJobBriefing` synthesize（L776-781）— `reasoning_effort: 'high'` → `'max'`**

```ts
    content = await chatNonStream(cfg, {
      messages: [{ role: 'user', content: synthesisPrompt } as Message],
      temperature: 0.5,
      thinking: { type: 'enabled', reasoning_effort: 'max' },  // was: 'high'
      signal: synthesisCtl.signal,
    })
```

- [ ] **Step 3: `generateGuide`（`electron/ipc/article-assistant.ts` L256-262）— 加 thinking=max**

```ts
      const raw = await chatNonStream(cfg, {
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.7,
        thinking: { type: 'enabled', reasoning_effort: 'max' },  // ← 新增
      })
```

- [ ] **Step 4: Commit**

```bash
git add electron/lib/job-briefing.ts electron/ipc/article-assistant.ts
git commit -m "fix(llm): bump reasoning_effort to max for synthesis, match-jobs, and guide generation"
```

---

### Task 5: F5 — 简报缓存原子写入

**Files:**
- Modify: `electron/ipc/briefing.ts` L387-388, L514-515
- Modify: `electron/lib/job-briefing.ts` L816-817
- Modify: `electron/ipc/job-briefing.ts` L143-146

- [ ] **Step 1: Digest 简报 — 真实生成路径（`electron/ipc/briefing.ts` L514-515）**

```ts
      try {
        fs.mkdirSync(briefingDir(cfg), { recursive: true })
        const tmpPath = filePath + '.tmp'
        fs.writeFileSync(tmpPath, serializeFrontmatter('briefing', fm, content), 'utf8')
        fs.renameSync(tmpPath, filePath)
      } catch (writeErr) {
```

- [ ] **Step 2: Digest 简报 — E2E mock 路径（`electron/ipc/briefing.ts` L387-388）**

```ts
      fs.mkdirSync(path.dirname(filePath), { recursive: true })
      try {
        const tmpPath = filePath + '.tmp'
        fs.writeFileSync(tmpPath, frontmatter + mockContent, 'utf8')
        fs.renameSync(tmpPath, filePath)
      } catch {
```

- [ ] **Step 3: Job 简报 — 真实生成路径（`electron/lib/job-briefing.ts` L816-817）**

```ts
  try {
    fs.mkdirSync(jobBriefingDir(cfg), { recursive: true })
    const tmpPath = filePath + '.tmp'
    fs.writeFileSync(tmpPath, serializeFrontmatter('job-briefing', fm, content), 'utf8')
    fs.renameSync(tmpPath, filePath)
  } catch (writeErr) {
```

- [ ] **Step 4: Job 简报 — E2E mock 路径（`electron/ipc/job-briefing.ts` L143-146）**

```ts
      fs.mkdirSync(jobBriefingDir(cfg), { recursive: true })
      try {
        const tmpPath = filePath + '.tmp'
        fs.writeFileSync(tmpPath, fm, 'utf8')
        fs.renameSync(tmpPath, filePath)
      } catch { /* ignore */ }
```

- [ ] **Step 5: 运行测试验证**

```bash
npx vitest run tests/briefing.test.ts tests/job-briefing.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add electron/ipc/briefing.ts electron/lib/job-briefing.ts electron/ipc/job-briefing.ts
git commit -m "fix(cache): use atomic temp+rename for briefing cache writes"
```

---

### Task 6: F7 — `discoverQuestions` 使用 per-company 查询

**Files:**
- Modify: `electron/lib/job-briefing.ts` L616-634, L747

- [ ] **Step 1: 重写 `discoverQuestions`**

```ts
export async function discoverQuestions(
  cfg: AppConfig,
  profile: JobProfile,
  config: JobBriefingConfig,
  focus: FocusCompany[],
  opts: { apiKey: string; signal?: AbortSignal }
): Promise<InterviewQuestion[]> {
  // Use per-company queries for top focus companies
  const queries = focus.length > 0
    ? buildQuestionQueries(focus, profile, config)
    : []

  if (queries.length > 0) {
    const results = await Promise.all(
      queries.map(q =>
        runQuestionQuery(cfg, q.query, {
          apiKey: opts.apiKey,
          signal: opts.signal,
          includeDomains: q.includeDomains,
        }).catch(err => {
          console.warn(`[job-briefing] question query failed for ${q.query}`, err)
          return [] as InterviewQuestion[]
        })
      )
    )
    const allQuestions = results.flat()
    if (allQuestions.length > 0) return dedupQuestions(allQuestions)
  }

  // Fallback: generic query
  const fallbackQuery = buildFallbackQuestionQuery(profile, config)
  try {
    return await runQuestionQuery(cfg, fallbackQuery, {
      apiKey: opts.apiKey,
      signal: opts.signal,
      includeDomains: [...JOB_COMMUNITY_DOMAINS],
    })
  } catch (err) {
    console.warn(`[job-briefing] fallback question query failed: ${fallbackQuery}`, err)
    return []
  }
}
```

- [ ] **Step 2: 更新调用方 `generateJobBriefing`（L747）— 传入 `focus`**

```ts
    questions = await discoverQuestions(cfg, profile, config, focus, { apiKey, signal: opts.signal })
```

- [ ] **Step 3: 运行测试验证**

```bash
npx vitest run tests/job-briefing.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add electron/lib/job-briefing.ts
git commit -m "fix(job-briefing): use per-company queries for interview question discovery"
```

---

### Task 7: F8 — BrowserWindow 并发限制

**Files:**
- Modify: `electron/lib/job-briefing.ts`（`fetchPageHtml` 函数 + 模块级信号量）

- [ ] **Step 1: 添加模块级信号量（文件顶部，import 之后）**

```ts
// Simple promise-based semaphore for BrowserWindow concurrency
let browserSemaphore: Promise<void> = Promise.resolve()
function withBrowserLimit<T>(fn: () => Promise<T>): Promise<T> {
  const prev = browserSemaphore
  let release: () => void
  browserSemaphore = new Promise<void>(resolve => { release = resolve })
  return prev.then(() => fn().finally(() => release!()))
}
```

- [ ] **Step 2: 在 `fetchPageHtml` 的 BrowserWindow 创建处包裹信号量（L214-257）**

将 BrowserWindow fallback 的 `return new Promise(...)` 包裹在 `withBrowserLimit` 中：

```ts
  // Browser fallback for JS-rendered pages
  return withBrowserLimit(() => new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      // ... 现有代码不变 ...
    })
    // ... 现有代码不变 ...
  }))
```

- [ ] **Step 3: 运行测试验证**

```bash
npx vitest run tests/job-briefing.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add electron/lib/job-briefing.ts
git commit -m "fix(job-briefing): limit concurrent BrowserWindow instances to 1 via semaphore"
```

---

### Task 8: F10 — `briefingRead` GC on delete

**Files:**
- Modify: `src/store/index.ts` L687-696, L741-750

- [ ] **Step 1: 修改 `deleteBriefings`（L687-696）**

在删除文件循环和 `loadBriefingHistory` 之间插入 GC 逻辑：

```ts
  deleteBriefings: async (filePaths: string[]) => {
    const current = get().briefing.result?.filePath
    for (const p of filePaths) {
      await ipc.briefingDelete({ filePath: p })
    }
    if (current && filePaths.includes(current)) {
      set({ briefing: { result: null, loading: false, error: null } })
    }
    // GC: remove deleted dates from briefingRead
    const digestDates = new Set(
      filePaths
        .map(p => { const m = p.match(/夜航简报-(\d{4}-\d{2}-\d{2})\.md$/); return m?.[1] })
        .filter((d): d is string => !!d)
    )
    if (digestDates.size > 0) {
      const cur = get().briefingRead
      const nextDigest = cur.digest.filter(d => !digestDates.has(d))
      if (nextDigest.length !== cur.digest.length) {
        const next = { ...cur, digest: nextDigest }
        set({ briefingRead: next })
        await ipc.patchState({ briefingRead: next } as Partial<StateJson>)
      }
    }
    await get().loadBriefingHistory()
  },
```

- [ ] **Step 2: 修改 `deleteJobBriefings`（L741-750）**

```ts
  deleteJobBriefings: async (filePaths: string[]) => {
    const current = get().jobBriefing.result?.filePath
    for (const p of filePaths) {
      await ipc.jobBriefingDelete({ filePath: p })
    }
    if (current && filePaths.includes(current)) {
      set({ jobBriefing: { result: null, loading: false, error: null } })
    }
    // GC: remove deleted dates from briefingRead
    const jobDates = new Set(
      filePaths
        .map(p => { const m = p.match(/求职简报-(\d{4}-\d{2}-\d{2})\.md$/); return m?.[1] })
        .filter((d): d is string => !!d)
    )
    if (jobDates.size > 0) {
      const cur = get().briefingRead
      const nextJob = cur['job-briefing'].filter(d => !jobDates.has(d))
      if (nextJob.length !== cur['job-briefing'].length) {
        const next = { ...cur, 'job-briefing': nextJob }
        set({ briefingRead: next })
        await ipc.patchState({ briefingRead: next } as Partial<StateJson>)
      }
    }
    await get().loadJobBriefingHistory()
  },
```

- [ ] **Step 3: 运行测试验证**

```bash
npx vitest run tests/store-briefing-read.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/store/index.ts
git commit -m "fix(store): clean briefingRead entries when deleting briefings"
```

---

### Task 9: F11 — Writing catalog 摘要 UI 反馈

**Files:**
- Modify: `electron/ipc/writing.ts` L78-85, L113-121
- Modify: `src/components/writing/WritingTree.tsx` L152

- [ ] **Step 1: `writing:write` — 写空摘要占位（`electron/ipc/writing.ts` L78-85）**

```ts
    if (result.ok) {
      // Write empty summary placeholder so UI knows this file is pending
      const destRoot = rootFromPath(a.path)
      updateEntry(lib, destRoot, a.path, { title: path.basename(a.path, '.md'), summary: '', updatedAt: new Date().toISOString().slice(0, 10) })
      // fire-and-forget: generate summary and update catalog
      setTimeout(async () => {
        try {
          const { body } = tree.readWritingFile(lib, a.path)
          const summary = await generateWritingSummary(cfg, path.basename(a.path, '.md'), body)
          if (summary) updateEntry(lib, destRoot, a.path, { title: path.basename(a.path, '.md'), summary, updatedAt: new Date().toISOString().slice(0, 10) })
        } catch { /* silent — placeholder remains as empty, UI shows "摘要生成中…" */ }
      }, 0)
    }
```

- [ ] **Step 2: `writing:importFiles` — 同样写空摘要占位（`electron/ipc/writing.ts` L113-121）**

```ts
      const destRoot = root
      setTimeout(async () => {
        for (const destRel of imported) {
          // Write empty placeholder
          updateEntry(lib, destRoot, destRel, { title: path.basename(destRel, '.md'), summary: '', updatedAt: new Date().toISOString().slice(0, 10) })
          try {
            const { body } = tree.readWritingFile(lib, destRel)
            const summary = await generateWritingSummary(cfg, path.basename(destRel, '.md'), body)
            if (summary) updateEntry(lib, destRoot, destRel, { title: path.basename(destRel, '.md'), summary, updatedAt: new Date().toISOString().slice(0, 10) })
          } catch { /* silent */ }
        }
      }, 0)
```

- [ ] **Step 3: WritingTree — 无摘要时显示提示文案（`src/components/writing/WritingTree.tsx` L152）**

将现有的条件渲染 `{!isDir && node.summary && hovered && (` 改为同时显示两种情况：

```tsx
          {!isDir && hovered && (
            <div
              className="text-[10px] text-parchment/50 mt-0.5"
              style={{
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
              }}
            >
              {node.summary ? (
                <>
                  {node.summary}
                  {node.catalogUpdatedAt && (
                    <span className="text-parchment/30 ml-2">{node.catalogUpdatedAt}</span>
                  )}
                </>
              ) : (
                <span className="text-parchment/30 italic">摘要生成中…</span>
              )}
            </div>
          )}
```

- [ ] **Step 4: Commit**

```bash
git add electron/ipc/writing.ts src/components/writing/WritingTree.tsx
git commit -m "feat(writing): show pending summary hint in tree, write empty placeholder on save"
```

---

### Task 10: F12-1 — E2E: 标注持久化

**Files:**
- Create: `e2e/specs/briefing-annotations-persistence.spec.ts`

- [ ] **Step 1: 写测试**

```ts
import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import fs from 'node:fs'
import path from 'node:path'

test.describe('@p1 briefing annotations persistence', () => {
  test('annotations survive app restart', async ({ window: window1, testConfigDir }) => {
    // Generate a briefing first
    const cover = new CoverPage(window1)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()
    await window1.locator(SELECTORS.briefing.receiveDigestButton).click()
    await window1.locator(SELECTORS.briefing.jobCard).first().waitFor({ timeout: 30000 })

    // Verify the reading pane is visible
    const readingPane = window1.locator('[data-testid="briefing-reading-pane"]')
    await readingPane.waitFor({ state: 'visible', timeout: 15000 })

    // Select text in the article body to trigger ghost pen
    const articleBody = readingPane.locator('.briefing-article-body')
    const firstPara = articleBody.locator('p').first()
    await firstPara.waitFor({ state: 'visible', timeout: 5000 })

    // Use E2E helper to trigger ghost pen
    await firstPara.evaluate((el) => {
      const textNode = Array.from(el.childNodes).find(
        (n): n is Text => n.nodeType === Node.TEXT_NODE && (n.textContent?.length ?? 0) > 10,
      ) as Text | undefined
      if (!textNode) return
      const range = document.createRange()
      range.setStart(textNode, 0)
      range.setEnd(textNode, Math.min(20, textNode.textContent?.length ?? 0))
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
      // Trigger mouseup
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    })

    // Ghost pen should appear
    const ghostPen = window1.locator('[data-testid="anno-ghost-pen"]')
    await ghostPen.waitFor({ state: 'visible', timeout: 5000 })

    // Click ghost pen to create annotation
    await ghostPen.click()

    // Note card should appear
    const noteCard = window1.locator('[data-testid="anno-note-card"]')
    await noteCard.waitFor({ state: 'visible', timeout: 5000 })

    // Type a note
    const textarea = noteCard.locator('[data-testid="anno-note-textarea"]')
    await textarea.fill('这是一条E2E测试标注')
    await window1.locator('[data-testid="anno-save-button"]').click()

    // Verify marker appeared in DOM
    await expect(window1.locator('[data-testid="anno-marked-text"]').first()).toBeVisible({ timeout: 5000 })

    // Get the briefing file path to locate the annotations file
    const result = await window1.evaluate(() => {
      const store = (window as any).__ZUSTAND_STORE__
      return store?.getState?.()?.briefing?.result
    })
    const annotationsPath = result.filePath.replace(/\.md$/, '.annotations.md')
    expect(fs.existsSync(annotationsPath)).toBe(true)
  })
})
```

- [ ] **Step 2: 运行 E2E 测试**

```bash
npx playwright test --config e2e/playwright.config.ts briefing-annotations-persistence
```

- [ ] **Step 3: Commit**

```bash
git add e2e/specs/briefing-annotations-persistence.spec.ts
git commit -m "test(e2e): add annotation persistence spec"
```

---

### Task 11: F12-2 — E2E: 旁注对话历史恢复

**Files:**
- Create: `e2e/specs/briefing-assistant-session-persistence.spec.ts`

- [ ] **Step 1: 写测试**

```ts
import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import path from 'node:path'

test.describe('@p1 briefing assistant session persistence', () => {
  test('chat history restored when switching back to briefing', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()

    // Generate a digest briefing
    await window.locator(SELECTORS.briefing.receiveDigestButton).click()
    await window.locator(SELECTORS.briefing.jobCard).first().waitFor({ timeout: 30000 })

    // Open the assistant chat
    const chatTab = window.locator('[data-testid="article-assistant-tab"]')
    await chatTab.waitFor({ state: 'visible', timeout: 10000 })
    await chatTab.click()

    // Wait for chat window to appear
    const chatWindow = window.locator('[data-testid="article-assistant-chat-window"]')
    await chatWindow.waitFor({ state: 'visible', timeout: 5000 })

    // Type and send a message
    const chatInput = window.locator('[data-testid="article-assistant-input"]')
    await chatInput.fill('这篇文章的核心观点是什么？')
    await window.locator('[data-testid="article-assistant-send-btn"]').click()

    // Wait for the mock response
    await expect(window.locator('[data-testid="chat-message"]')).toHaveCount(2, { timeout: 10000 })

    // Switch to writing source
    await window.locator(SELECTORS.briefing.sourceSidebar).waitFor({ state: 'visible', timeout: 5000 })
    await window.locator(SELECTORS.writing.sourceButton).click()
    await window.locator('[data-testid="writing-board-empty"]').waitFor({ state: 'visible', timeout: 10000 })

    // Switch back to digest
    await window.locator(SELECTORS.briefing.sourceDigestButton).click()
    await window.locator('[data-testid="briefing-reading-pane"]').waitFor({ state: 'visible', timeout: 10000 })

    // Reopen assistant — chat messages should be restored
    await chatTab.click()
    await chatWindow.waitFor({ state: 'visible', timeout: 5000 })

    // Verify previous messages exist
    const messages = window.locator('[data-testid="chat-message"]')
    await expect(messages).toHaveCount(2, { timeout: 5000 })
  })
})
```

- [ ] **Step 2: 运行 E2E 测试**

```bash
npx playwright test --config e2e/playwright.config.ts briefing-assistant-session-persistence
```

- [ ] **Step 3: Commit**

```bash
git add e2e/specs/briefing-assistant-session-persistence.spec.ts
git commit -m "test(e2e): add assistant session persistence spec"
```

---

### Task 12: F12-3 — E2E: 简报删除清理 sibling 文件

**Files:**
- Create: `e2e/specs/briefing-delete-cleanup.spec.ts`

- [ ] **Step 1: 写测试**

```ts
import { test, expect } from '../fixtures/electron'
import { CoverPage } from '../pages/CoverPage'
import { SELECTORS } from '../helpers/selectors'
import fs from 'node:fs'

test.describe('@p1 briefing delete cleanup', () => {
  test('deleting a briefing removes sibling annotation/assistant/guide files', async ({ window }) => {
    const cover = new CoverPage(window)
    await cover.enterName('E2E 测试员')
    await cover.goToBriefing()

    // Generate a digest briefing
    await window.locator(SELECTORS.briefing.receiveDigestButton).click()
    await window.locator(SELECTORS.briefing.jobCard).first().waitFor({ timeout: 30000 })

    // Get the briefing file path
    const result = await window.evaluate(() => {
      const store = (window as any).__ZUSTAND_STORE__
      return store?.getState?.()?.briefing?.result
    })
    const briefingPath = result.filePath
    const annoPath = briefingPath.replace(/\.md$/, '.annotations.md')
    const sessionPath = briefingPath.replace(/\.md$/, '.assistant.md')
    const guidePath = briefingPath.replace(/\.md$/, '.guide.md')

    // Create dummy sibling files
    fs.writeFileSync(annoPath, 'test annotation', 'utf8')
    fs.writeFileSync(sessionPath, 'test session', 'utf8')
    fs.writeFileSync(guidePath, 'test guide', 'utf8')
    expect(fs.existsSync(annoPath)).toBe(true)

    // Open the date menu to delete
    const todayDate = result.date
    const dateItem = window.locator(SELECTORS.briefing.dateItem(todayDate))
    await dateItem.waitFor({ state: 'visible', timeout: 5000 })
    await dateItem.click({ button: 'right' })

    // Wait for context menu
    const dateMenu = window.locator(SELECTORS.briefing.dateMenu)
    await dateMenu.waitFor({ state: 'visible', timeout: 5000 })

    // Click delete option
    await window.locator(SELECTORS.briefing.dateDelete).click()

    // Confirm dialog appears
    const confirmDialog = window.locator(SELECTORS.confirmDialog.dialog)
    await confirmDialog.waitFor({ state: 'visible', timeout: 5000 })
    await window.locator(SELECTORS.confirmDialog.confirmButton).click()

    // Wait for deletion to complete
    await expect(confirmDialog).not.toBeVisible({ timeout: 5000 })

    // Verify sibling files are deleted
    expect(fs.existsSync(annoPath)).toBe(false)
    expect(fs.existsSync(sessionPath)).toBe(false)
    expect(fs.existsSync(guidePath)).toBe(false)
  })
})
```

- [ ] **Step 2: 运行 E2E 测试**

```bash
npx playwright test --config e2e/playwright.config.ts briefing-delete-cleanup
```

- [ ] **Step 3: Commit**

```bash
git add e2e/specs/briefing-delete-cleanup.spec.ts
git commit -m "test(e2e): add briefing delete sibling cleanup spec"
```

---

### Task 13: 全量回归

- [ ] **Step 1: 运行所有单元测试**

```bash
npx vitest run
```

- [ ] **Step 2: 运行所有 E2E 测试（mock 模式）**

```bash
npx playwright test --config e2e/playwright.config.ts --grep "@p1"
```

- [ ] **Step 3: 运行真实 API 回归**

```bash
npx playwright test --config e2e/playwright.config.ts briefing-real-api --env E2E_BRIEFING_DISABLE_MOCK=1
npx playwright test --config e2e/playwright.config.ts job-briefing-real
```

- [ ] **Step 4: 如全部通过，最终 commit**

```bash
git commit -m "chore: full regression pass after pre-launch fixes" --allow-empty
```
