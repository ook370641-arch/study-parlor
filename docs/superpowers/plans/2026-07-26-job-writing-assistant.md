# 求职&写作助手 UI 统一实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一写作助手与求职助手的 UI 样式，修复写作助手关闭后无法重开的问题，加宽求职页文字。

**Architecture:** 三个独立改动：① WritingAssistantPanel 折叠态改用 ArticleDivider 箭头按钮；② 新建 JobAssistantPanel（抄 WritingAssistantPanel 外壳，内嵌 assistantSession 消息/输入）；③ JobBriefingRenderer + Briefing.tsx 宽度对齐博客阅读器。

**Tech Stack:** React 18 + TypeScript + Tailwind CSS + Zustand

---

## 文件结构

| 文件 | 职责 | 操作 |
|------|------|------|
| `src/components/writing-assistant/WritingAssistantPanel.tsx` | 写作助手面板（折叠/展开） | 修改 |
| `src/components/job-briefing/JobAssistantPanel.tsx` | 求职助手面板（新建） | **新建** |
| `src/components/job-briefing/index.ts` | 求职组件 barrel export | 修改 |
| `src/components/job-briefing/JobBriefingRenderer.tsx` | 求职简报内容渲染 | 修改 |
| `src/pages/Briefing.tsx` | 简报页主组件 | 修改 |

---

### Task 1: WritingAssistantPanel 折叠态改用 ArticleDivider

**Files:**
- Modify: `src/components/writing-assistant/WritingAssistantPanel.tsx`

**说明:** 删除 `!open` 分支的 24px 竖签，改为始终渲染外层容器 + ArticleDivider。折叠时 divider 上的 `◀` 按钮作为重开入口。

- [ ] **Step 1: 重构 WritingAssistantPanel 渲染逻辑**

将当前的双分支结构（`if (!open) return <tab>` + `return <panel>`）合并为单一路径：始终渲染外层 flex 容器 + ArticleDivider，面板内容区仅在 `open` 时渲染。

当前代码结构：
```tsx
// 旧: 两个独立 return 分支
if (!open) {
  return <div data-testid="writing-assistant-collapsed" className="w-6 bg-ember ...">AI 助手 ▸</div>
}
return (
  <div data-testid="writing-assistant-panel" className="relative z-[5] flex h-full shrink-0 ...">
    <ArticleDivider collapsed={false} onToggleCollapse={() => requestClose()} ... />
    <div className="h-full overflow-hidden" style={{ width }}>...</div>
  </div>
)
```

替换为：
```tsx
// 新: 单一路径, ArticleDivider 始终挂载
return (
  <div data-testid="writing-assistant-panel" className={`relative z-[5] flex h-full shrink-0 ${!open ? '' : (closing ? 'panel-depart' : 'panel-arise')}`}>
    <ArticleDivider
      collapsed={!open}
      onToggleCollapse={() => {
        if (open) {
          requestClose()
        } else {
          setOpen(true)
        }
      }}
      onResize={(w) => {
        const maxWidth = window.innerWidth * 0.45
        if (w < 40) {
          if (open) requestClose()
        } else {
          if (!open) setOpen(true)
          setWidth(Math.max(200, Math.min(w, maxWidth)))
        }
      }}
      theme="academic"
    />
    {open && (
      <div className="h-full overflow-hidden" style={{ width }}>
        <div className="h-full flex flex-col min-w-0 border-l border-parchment/20 bg-[#1a1512]">
          <div className="h-9 flex items-center justify-between px-3 border-b border-parchment/10 shrink-0">
            <span className="text-[11px] tracking-[0.2em] text-parchment/80 font-serif">AI 写作助手</span>
            <button
              data-testid="writing-assistant-close-btn"
              className="text-parchment/60 hover:text-ember text-sm leading-none px-1"
              onClick={() => requestClose()}
              aria-label="关闭"
            >
              ✕
            </button>
          </div>
          <WritingAssistantMessages />
          <WritingAssistantInput />
        </div>
      </div>
    )}
  </div>
)
```

- [ ] **Step 2: 删除不再需要的 data-testid 引用检查**

`data-testid="writing-assistant-collapsed"` 已删除。确认测试中是否有引用它的断言，如有则更新。

运行：
```bash
grep -r "writing-assistant-collapsed" tests/ e2e/
```

- [ ] **Step 3: 运行受影响测试**

```bash
npx vitest run tests/writing-panel.test.tsx 2>/dev/null || echo "test file may not exist — check manually"
```

- [ ] **Step 4: Commit**

```bash
git add src/components/writing-assistant/WritingAssistantPanel.tsx
git commit -m "feat: replace writing assistant collapsed tab with ArticleDivider toggle"
```

---

### Task 2: 新建 JobAssistantPanel

**Files:**
- Create: `src/components/job-briefing/JobAssistantPanel.tsx`
- Modify: `src/components/job-briefing/index.ts`
- Modify: `src/pages/Briefing.tsx`

**说明:** 抄 WritingAssistantPanel 的外壳结构（ArticleDivider + 标题栏 + 暗色背景），内嵌 assistantSession 的消息和输入。标题 "AI 求职助手"。接收文章数据作为 props，挂载时初始化 assistantSession。在 Briefing.tsx 中替换掉 ArticleAssistantPanel。

- [ ] **Step 1: 创建 JobAssistantPanel 组件**

```tsx
import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store'
import { ArticleDivider } from '@/components/article-assistant/ArticleDivider'
import { ChatMessageList } from '@/components/article-assistant/ChatMessageList'

interface Props {
  articlePath: string
  articleTitle?: string
  articleContent: string
}

export function JobAssistantPanel({ articlePath, articleTitle, articleContent }: Props) {
  const session = useStore((s) => s.assistantSession)
  const openAssistantSession = useStore((s) => s.openAssistantSession)
  const persistAssistantState = useStore((s) => s.persistAssistantState)
  const prevPath = useRef<string | null>(null)

  // Initialize assistantSession on mount / path change (same logic as ArticleAssistantPanel)
  useEffect(() => {
    if (prevPath.current !== articlePath) {
      const prev = prevPath.current
      prevPath.current = articlePath
      if (prev && useStore.getState().assistantSession) {
        persistAssistantState()
      }
      openAssistantSession({
        contextId: articlePath,
        contextType: 'briefing',
        articleTitle,
        articleContent,
      })
    }
    return () => {
      persistAssistantState()
    }
  }, [articlePath])
  const sendAssistantMessage = useStore((s) => s.sendAssistantMessage)
  const retryAssistantMessage = useStore((s) => s.retryAssistantMessage)
  const abortAssistantStream = useStore((s) => s.abortAssistantStream)
  const searchEnabled = useStore((s) => s.assistantSearchEnabled)
  const socraticMode = useStore((s) => s.assistantSocraticMode)
  const thinkingEffort = useStore((s) => s.assistantThinkingEffort)
  const toggleAssistantSearch = useStore((s) => s.toggleAssistantSearch)
  const toggleAssistantSocratic = useStore((s) => s.toggleAssistantSocratic)
  const cycleAssistantThinkingEffort = useStore((s) => s.cycleAssistantThinkingEffort)
  const setAssistantSelection = useStore((s) => s.setAssistantSelection)

  const [open, setOpen] = useState(false)
  const [width, setWidth] = useState(320)
  const [closing, setClosing] = useState(false)
  const closeTimer = useRef<number | null>(null)
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current) }, [])
  useEffect(() => { if (open) setClosing(false) }, [open])

  const requestClose = () => {
    if (closing) return
    setClosing(true)
    closeTimer.current = window.setTimeout(() => setOpen(false), 200)
  }

  const handleSend = () => {
    const text = input.trim()
    if (!text && !session?.pendingSelection) return
    sendAssistantMessage(text)
    setInput('')
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 50)
  }

  const hasMessages = (session?.messages.length ?? 0) > 0
  const streaming = session?.streaming ?? false
  const lastMsg = session?.messages.at(-1)
  const showError = session?.chatError && !streaming && lastMsg?.role === 'assistant' && lastMsg.content.trim() === ''

  return (
    <div data-testid="job-assistant-panel" className={`relative z-[5] flex h-full shrink-0 ${!open ? '' : (closing ? 'panel-depart' : 'panel-arise')}`}>
      <ArticleDivider
        collapsed={!open}
        onToggleCollapse={() => {
          if (open) {
            requestClose()
          } else {
            setOpen(true)
          }
        }}
        onResize={(w) => {
          const maxWidth = window.innerWidth * 0.45
          if (w < 40) {
            if (open) requestClose()
          } else {
            if (!open) setOpen(true)
            setWidth(Math.max(200, Math.min(w, maxWidth)))
          }
        }}
        theme="academic"
      />
      {open && (
        <div className="h-full overflow-hidden" style={{ width }}>
          <div className="h-full flex flex-col min-w-0 border-l border-parchment/20 bg-[#1a1512]">
            {/* Header */}
            <div className="h-9 flex items-center justify-between px-3 border-b border-parchment/10 shrink-0">
              <span className="text-[11px] tracking-[0.2em] text-parchment/80 font-serif">AI 求职助手</span>
              <button
                data-testid="job-assistant-close-btn"
                className="text-parchment/60 hover:text-ember text-sm leading-none px-1"
                onClick={() => requestClose()}
                aria-label="关闭"
              >
                ✕
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 text-sm">
              {!hasMessages && (
                <div className="text-parchment/40 text-xs text-center mt-8">
                  选中简报内容后打开面板，或直接输入问题
                </div>
              )}
              <ChatMessageList messages={session?.messages ?? []} streaming={streaming} />
              {streaming && !session?.searchLoading && (
                <div className="text-xs text-parchment/50 animate-pulse">思考中…</div>
              )}
              {session?.searchLoading && streaming && (
                <div className="text-xs text-parchment/50 animate-pulse">搜索并思考中…</div>
              )}
              {showError && (
                <div className="text-xs text-ember/80">
                  回复失败
                  <button className="ml-2 underline hover:text-ember" onClick={() => retryAssistantMessage()}>重试</button>
                </div>
              )}
            </div>

            {/* Pending selection chip */}
            {session?.pendingSelection && (
              <div className="relative mx-2 mb-1 text-xs border-l-2 border-ember bg-ember/10 p-2 pr-6 text-parchment/80 rounded-r shrink-0">
                <div className="opacity-60 mb-1">你选中了：</div>
                "{session.pendingSelection}"
                <button
                  aria-label="取消选中"
                  className="absolute top-1 right-1 text-parchment/50 hover:text-ember leading-none"
                  onClick={() => setAssistantSelection('')}
                >✕</button>
              </div>
            )}

            {/* Input area */}
            <div className="p-2 border-t border-parchment/10 flex items-center gap-1.5 shrink-0">
              <input
                data-testid="job-assistant-input"
                className="flex-1 min-w-0 bg-[#0c0806] border border-parchment/20 rounded px-2 py-1 text-sm text-parchment/90 placeholder:text-parchment/40 outline-none focus:border-ember/50"
                placeholder="问点什么……"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
              />
              {/* Controls */}
              <button
                data-testid="job-assistant-search-btn"
                className={`px-1.5 py-1 rounded text-sm transition-colors disabled:opacity-30 ${
                  searchEnabled ? 'text-sky-400' : 'text-parchment/40 hover:text-parchment/70'
                }`}
                onClick={toggleAssistantSearch}
                disabled={streaming || session?.searchLoading}
                aria-pressed={searchEnabled}
                title={searchEnabled ? '搜索已开启' : '搜索已关闭'}
              >🔍</button>
              <button
                data-testid="job-assistant-socratic-btn"
                className={`px-1.5 py-1 rounded text-sm transition-colors disabled:opacity-30 ${
                  socraticMode ? 'text-sky-400' : 'text-parchment/40 hover:text-parchment/70'
                }`}
                onClick={toggleAssistantSocratic}
                disabled={streaming || session?.searchLoading}
                aria-pressed={socraticMode}
                title="苏格拉底学习模式"
              >🎓</button>
              <button
                data-testid="job-assistant-thinking-btn"
                className={`relative px-1.5 py-1 rounded text-sm transition-colors disabled:opacity-30 ${
                  thinkingEffort !== 'off' ? 'text-sky-400' : 'text-parchment/40 hover:text-parchment/70'
                }`}
                onClick={cycleAssistantThinkingEffort}
                disabled={streaming || session?.searchLoading}
                title={`深度思考：${thinkingEffort === 'off' ? '关闭' : thinkingEffort === 'high' ? '高' : '最大'}`}
              >
                🧠
                {thinkingEffort === 'max' && (
                  <span className="absolute -top-1 -right-1 text-[8px] leading-none font-bold">MAX</span>
                )}
              </button>
              {streaming ? (
                <button
                  data-testid="job-assistant-stop-btn"
                  className="shrink-0 text-xs text-ember hover:text-ember/80 whitespace-nowrap px-1"
                  onClick={abortAssistantStream}
                >停止</button>
              ) : (
                <button
                  data-testid="job-assistant-send-btn"
                  className="shrink-0 text-xs text-parchment/80 hover:text-ember whitespace-nowrap px-1"
                  onClick={handleSend}
                >发送</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 更新 barrel export**

修改 `src/components/job-briefing/index.ts`，添加 `JobAssistantPanel` 导出：

```ts
export { JobBriefingRenderer } from './JobBriefingRenderer'
export { JobProfilePanel } from './JobProfilePanel'
export { JobAssistantPanel } from './JobAssistantPanel'
```

- [ ] **Step 3: Briefing.tsx 中替换面板**

当前代码（约 line 492-499）：
```tsx
{isJob && jobResult?.filePath && (
  <ArticleAssistantPanel
    articleType="briefing"
    parentPath={jobResult.filePath}
    articleTitle={jobResult.title}
    articleContent={jobResult.content ?? ''}
    showGuide={false}
  />
)}
```

替换为：
```tsx
{isJob && jobResult?.filePath && (
  <JobAssistantPanel
    articlePath={jobResult.filePath}
    articleTitle={jobResult.title}
    articleContent={jobResult.content ?? ''}
  />
)}
```

同时移除不再需要的 `ArticleAssistantPanel` import（检查 digest 分支是否还在使用 —— 是的，digest 分支 line 482-491 还在用，所以 import 保留）。

- [ ] **Step 4: Commit**

```bash
git add src/components/job-briefing/JobAssistantPanel.tsx src/components/job-briefing/index.ts src/pages/Briefing.tsx
git commit -m "feat: add JobAssistantPanel with inline chat, replace ArticleAssistantPanel"
```

---

### Task 3: Briefing.tsx 换画按钮定位修复

**Files:**
- Modify: `src/pages/Briefing.tsx`

**说明:** 当前求职页换画按钮用 `fixed top-6 right-4`，不随 JobAssistantPanel 展开而移动。改为 `absolute right-4`（放在 main 内），让面板展开时自然挤压按钮左移。

- [ ] **Step 1: 将求职页按钮从 fixed 改为 absolute**

当前代码（约 line 194-214）：
```tsx
{(source === 'job-briefing' || (source === 'digest' && !result)) && (
  <div className="fixed top-6 right-4 z-20 flex items-start gap-1">
    ...font size buttons...
    {isAcademic && <SwapPaintingButton ... />}
  </div>
)}
```

这个条件同时覆盖了 `job-briefing` 和 `digest`（无结果时）。需要将求职和 digest 的按钮分开处理：

对于 `job-briefing`：按钮应放入 main 内部，使用 `absolute` 定位，这样 JobAssistantPanel 展开时按钮自然左移。

对于 `digest`（无结果时）：保持当前行为。

修改后的逻辑 — 将求职按钮移到每个求职状态分支的 main 内部：

① **jobEmptyState** 分支（约 line 309-315）：BriefingEmptyState 不需要按钮。

② **jobPhase generating/resolved/departing** 分支（约 line 316-323）：在 main 内部加上按钮。
```tsx
) : (jobPhase === 'generating' || jobPhase === 'resolved' || jobPhase === 'departing') && !jobResult ? (
  <main className={`relative z-[5] flex-1 overflow-y-auto px-6 py-6 w-[95%] max-w-[1600px] min-w-[520px] mx-auto ${jobPhase === 'departing' ? 'constellation-depart' : ''}`}>
    <div className="absolute top-0 right-0 z-20 flex items-start gap-1">
      <button type="button" data-testid="briefing-font-size-decrease" ...>−</button>
      <button type="button" data-testid="briefing-font-size-increase" ...>+</button>
      {isAcademic && <SwapPaintingButton surface="briefing" ... />}
    </div>
    <BriefingProgress ... />
  </main>
)
```

③ **jobPhase failing** 分支（约 line 324-327）：同上方式添加。

④ **isJobError** 分支（约 line 328-336）：错误态居中显示，按钮放 main 内同理。

⑤ **jobResult** 分支（约 line 337-392）：main 内已有 BriefingMetaLine + JobBriefingRenderer，在 main 内顶部加按钮。
```tsx
) : jobResult ? (
  <div data-testid="job-briefing-reading-pane" ...>
    <main ref={jobMainRef} className="relative z-[5] flex-1 overflow-y-auto px-6 py-6">
      <div className="absolute top-0 right-0 z-20 flex items-start gap-1">
        ...buttons...
      </div>
      {isAcademic && <PaintingPlate />}
      ...
    </main>
  </div>
)
```

⑥ 将顶部 `fixed` 条件改为只覆盖 digest：
```tsx
{(source === 'digest' && !result) && (
  <div className="fixed top-6 right-4 z-20 flex items-start gap-1">
    ...font size + swap painting...
  </div>
)}
```

- [ ] **Step 2: 确认 digest 分支的按钮仍正常工作**

Digest 有结果时（line 422-477）按钮在 `reading-pane` 内部的 `absolute top-4 right-4`，已正确。Digest 无结果时用 `fixed`，也正确。

- [ ] **Step 3: Commit**

```bash
git add src/pages/Briefing.tsx
git commit -m "fix: move job briefing buttons from fixed to absolute for panel-aware positioning"
```

---

### Task 4: JobBriefingRenderer 宽度加宽

**Files:**
- Modify: `src/components/job-briefing/JobBriefingRenderer.tsx`

- [ ] **Step 1: 修改内容区宽度**

当前（line 233）：
```tsx
<div
  data-testid="job-briefing-renderer"
  className={`arrive-item max-w-3xl mx-auto space-y-8 ${pageClass}`}
  ...
>
```

改为：
```tsx
<div
  data-testid="job-briefing-renderer"
  className={`arrive-item w-[95%] max-w-[1600px] min-w-[520px] mx-auto space-y-8 ${pageClass}`}
  ...
>
```

- [ ] **Step 2: 运行测试**

```bash
npx vitest run tests/job-briefing-renderer.test.tsx 2>/dev/null || echo "no dedicated test file, check briefing tests"
```

- [ ] **Step 3: Commit**

```bash
git add src/components/job-briefing/JobBriefingRenderer.tsx
git commit -m "fix: widen job briefing content to match blog reader width"
```

---

### Task 5: Briefing.tsx 求职状态宽度同步

**Files:**
- Modify: `src/pages/Briefing.tsx`

**说明:** 求职页的 progress/loading/error 状态 main 元素仍有 `max-w-3xl`，需同步为博客宽度。MetaLine 行也需调整。

- [ ] **Step 1: 修改求职各状态的 main 宽度**

逐一修改 Briefing.tsx 中求职相关 main 元素的 className：

① generating/resolved/departing 状态（约 line 317）：
```
max-w-3xl mx-auto → w-[95%] max-w-[1600px] min-w-[520px] mx-auto
```

② failing 状态（约 line 325）：同上。

③ isJobError 状态（约 line 329）：当前是 `flex items-center justify-center`，不需要 max-w，保持。

④ jobResult main（约 line 339）：当前无 max-w，子元素控制宽度。

⑤ BriefingMetaLine 行（约 line 367）：
```
max-w-3xl mx-auto → w-[95%] max-w-[1600px] min-w-[520px] mx-auto
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/Briefing.tsx
git commit -m "fix: sync job briefing state widths to blog reader fluid width"
```

---

### Task 6: 测试更新

**Files:**
- 检查: `tests/briefing-page.test.tsx`, `tests/briefing-layout.test.tsx`

- [ ] **Step 1: 检查 writing-assistant-collapsed 引用**

```bash
grep -r "writing-assistant-collapsed" tests/ e2e/
```

如果存在，更新为新的 `data-testid` 或调整断言逻辑。

- [ ] **Step 2: 检查 job-briefing 相关测试**

```bash
grep -r "job-briefing\|job-briefing-renderer\|job-assistant\|job-profile" tests/ --include="*.test.tsx" -l
```

针对命中文件运行测试，确认改动不破坏现有断言。

- [ ] **Step 3: 运行所有受影响测试**

```bash
npx vitest run tests/briefing-page.test.tsx tests/briefing-layout.test.tsx
```

- [ ] **Step 4: 运行 E2E 定向测试**

```bash
node scripts/e2e-changed.js --run
```

- [ ] **Step 5: Commit**

```bash
git add tests/
git commit -m "test: update tests for assistant panel and width changes"
```

---

## 边界验证清单

实现完成后逐项确认：

- [ ] 写作助手：折叠→展开→关闭→再展开，动画/布局正常
- [ ] 写作助手：拖拽 <40px 自动折叠，点击 ◀ 重新展开
- [ ] 求职助手：面板展开/折叠时换画按钮位置跟随
- [ ] 求职助手：面板展开时主内容区不被遮挡
- [ ] 求职助手：无 jobResult 时不渲染面板（条件：`isJob && jobResult?.filePath`）
- [ ] 求职页宽度：窄窗口（<600px）下 `min-w-[520px]` 触发横向滚动
- [ ] 报纸主题：求职助手和写作助手均只在 academic 主题下渲染
- [ ] 求职助手消息发送/接收正常（复用 assistantSession）
