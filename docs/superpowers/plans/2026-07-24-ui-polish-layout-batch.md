# UI 打磨批次 · 计划二：布局视觉批 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** B+ 竖轨布局（移除顶栏、控件入左下角、玻璃材质）、导读高度统一、列表列五项（密排/极简计数/拖拽排序/仓库 switch/配色）、双字体 key 扩展、写作助手仿导读重做、日报 ❧ 铭牌与来源卡。

**Architecture:** 只动显示层与组件挂载结构；不碰数据流与存储格式（除新增 `writingUIFontSize` state key 与 `writingOrder` 排序映射）。所有现有 testid 保留或随迁。

**Tech Stack:** Electron 30 + React 18 + TS + Tailwind 3.4 + zustand + Vitest + Playwright e2e。

**执行环境：** 直接在 `main` 分支。前置：计划一（fix-batch）已合入。

**Spec:** `docs/superpowers/specs/2026-07-24-ui-polish-batch-design.md`（本计划覆盖 B/D/E/G/I；A/C/F/H 已在计划一完成）。

**跨任务铁律：**
- 每项按 spec 的「改动/保护清单」执行；清单外元素不动。
- testid 只能随迁不能删（除计划一已移除的 3 个删除模式 testid）；新增元素可新增 testid。
- 玻璃材质只作用于 academic 主题；newspaper 主题保持浅色实底、仅做结构随迁（顶栏移除、竖轨控件）。
- 原型参照：`.superpowers/brainstorm/914-1784827483/content/`（layout-real-v3 / collapsed-columns / digest-final）。

---

## 文件结构

| 文件 | 责任 | 改动 |
|---|---|---|
| `src/components/BriefingSourceSidebar.tsx` | 来源竖轨 | 底部控件区（字号/主题/返回/档案）+ 玻璃 |
| `src/components/BriefingHeader.tsx` | 旧顶栏 | 删除文件 |
| `src/components/briefing/BriefingMetaLine.tsx` | generated-at/来源状态行（新） | 新建 |
| `src/pages/Briefing.tsx` | 页面骨架 | 移除 Header、接 MetaLine、CSS vars 扩展 |
| `src/components/BriefingListColumn.tsx` | 列表列 | 玻璃材质 |
| `src/components/anthropic/AnthropicBlogPanel.tsx` | 博客面板 | 导读面板上移、玻璃、收起列密排+橙框 |
| `src/components/anthropic/AnthropicArticleReader.tsx` | 阅读器 | 卸下 ArticleAssistantPanel，上报 body/title |
| `src/components/anthropic/AnthropicArticleRow.tsx` | 文章行 | 字号接 CSS var |
| `src/components/BriefingDateColumn.tsx` | 日期列 | 字号接 CSS var |
| `src/components/writing/WritingListColumn.tsx` | 写作列 | switch 样式、仓库改名、配色修正、UI 字号 var |
| `src/components/writing/WritingTree.tsx` | 写作树 | 同级拖拽排序、主题化配色、字号 var |
| `src/store/index.ts` | store | writingOrder、writingUIFontSize、reader body/title |
| `src/lib/briefing-font-size.ts` | 字号映射 | 新增 LIST/QUOTE/WRITING_UI 映射 |
| `src/components/Quote.tsx` | 作家语录 | briefing/writing surface 接字号 var |
| `src/components/writing-assistant/WritingAssistantPanel.tsx` | 写作助手 | ArticleDivider 重做 |
| `src/components/article-assistant/ArticleBodyChunks.tsx` | chunk 标题 | ❧ 铭牌 |
| `src/components/briefing/BriefingSourceCard.tsx` | 来源卡（新） | 新建 |
| `src/components/briefing/AcademicBriefingLayout.tsx` / `NewspaperBriefingLayout.tsx` | 日报版式 | 来源区分组卡片化 |
| `src/lib/parse-source-link.ts` | 链接提取（新） | 新建 |
| `.claude/rules/feature-development.md` + `README.md` | 规则 | 新增「UI 出口」规则 |

---

### Task 1: 竖轨底座 —— 移除顶栏，控件迁入竖轨底部

**Files:**
- Modify: `src/components/BriefingSourceSidebar.tsx`
- Delete: `src/components/BriefingHeader.tsx`
- Create: `src/components/briefing/BriefingMetaLine.tsx`
- Modify: `src/pages/Briefing.tsx`
- Modify: `src/components/briefing/index.ts`（导出 MetaLine，若有 barrel）
- Test: `tests/briefing-sidebar.test.tsx`、`tests/briefing-meta-line.test.tsx`（新建）、删除 `tests/briefing-header.test.tsx`

顶栏现有内容（必须全部有去向，不许丢）：
- `BackToCover` → 竖轨底部
- 字号 −/＋（testid `briefing-font-size-decrease/increase`）→ 竖轨底部
- `BriefingThemeToggle` → 竖轨底部
- 求职档案入口（`job-briefing-profile-entry`，仅 job 源）→ 竖轨底部（仅 job 源显示）
- `briefing-generated-at` / `briefing-source-status` / `briefing-source-empty` / `briefing-cache-write-failed` → 新组件 `BriefingMetaLine`，digest 渲染在 Academic/Newspaper 版式 header 区，job 渲染在 `JobBriefingRenderer` 上方
- 「夜航简报」标题文字 → 按 spec 直接移除，不另设展示位

- [ ] **Step 1: 改/写测试**

新建 `tests/briefing-meta-line.test.tsx`：

```tsx
import { describe, expect, it } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { BriefingMetaLine } from '@/components/briefing/BriefingMetaLine'

describe('BriefingMetaLine', () => {
  it('renders generated time and failed sources with testids', () => {
    cleanup()
    render(
      <BriefingMetaLine
        displayDate="2026 年 07 月 24 日"
        timeString="08:30"
        sourceStatus={{ x: 'failed', blogs: 'ok', podcasts: 'empty' }}
        cacheWriteFailed
        theme="academic"
      />
    )
    expect(screen.getByTestId('briefing-generated-at')).toHaveTextContent('2026 年 07 月 24 日')
    expect(screen.getByTestId('briefing-generated-at')).toHaveTextContent('08:30')
    expect(screen.getByTestId('briefing-source-status')).toHaveTextContent('X 获取失败')
    expect(screen.getByTestId('briefing-source-empty')).toHaveTextContent('播客 暂无更新')
    expect(screen.getByTestId('briefing-cache-write-failed')).toBeInTheDocument()
  })

  it('renders nothing extra when all sources ok', () => {
    cleanup()
    render(<BriefingMetaLine displayDate="D" theme="academic" />)
    expect(screen.getByTestId('briefing-generated-at')).toHaveTextContent('D')
    expect(screen.queryByTestId('briefing-source-status')).not.toBeInTheDocument()
    expect(screen.queryByTestId('briefing-source-empty')).not.toBeInTheDocument()
    expect(screen.queryByTestId('briefing-cache-write-failed')).not.toBeInTheDocument()
  })
})
```

在 `tests/briefing-sidebar.test.tsx` 追加：

```tsx
  it('hosts font-size controls, theme toggle and back-to-cover in the rail bottom cluster', () => {
    render(<BriefingSourceSidebar collapsed={false} onToggle={vi.fn()} theme="academic" />)
    const cluster = screen.getByTestId('briefing-rail-controls')
    expect(cluster).toBeInTheDocument()
    expect(within(cluster).getByTestId('briefing-font-size-decrease')).toBeInTheDocument()
    expect(within(cluster).getByTestId('briefing-font-size-increase')).toBeInTheDocument()
  })

  it('shows job profile entry only for job-briefing source', () => {
    useStore.setState({ briefingSource: 'job-briefing' } as any)
    const { unmount } = render(<BriefingSourceSidebar collapsed={false} onToggle={vi.fn()} theme="academic" />)
    expect(screen.getByTestId('job-briefing-profile-entry')).toBeInTheDocument()
    unmount()
    useStore.setState({ briefingSource: 'digest' } as any)
    render(<BriefingSourceSidebar collapsed={false} onToggle={vi.fn()} theme="academic" />)
    expect(screen.queryByTestId('job-briefing-profile-entry')).not.toBeInTheDocument()
  })
```

（文件顶部补 `within` import；若该测试文件已有 sidebar 渲染辅助则复用。）删除 `tests/briefing-header.test.tsx`。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/briefing-meta-line.test.tsx tests/briefing-sidebar.test.tsx`
Expected: FAIL（组件不存在 / cluster 不存在）。

- [ ] **Step 3: 新建 BriefingMetaLine**

`src/components/briefing/BriefingMetaLine.tsx`（逻辑从 BriefingHeader L43-101 平移）：

```tsx
interface Props {
  displayDate: string
  timeString?: string
  sourceStatus?: Record<string, 'ok' | 'failed' | 'empty'>
  cacheWriteFailed?: boolean
  theme: 'academic' | 'newspaper'
}

export function BriefingMetaLine({ displayDate, timeString, sourceStatus, cacheWriteFailed, theme }: Props) {
  const isAcademic = theme !== 'newspaper'
  const metaClass = isAcademic ? 'text-xs text-parchment/50 font-sans' : 'text-xs text-[#555] font-sans'

  const knownLabels: Record<string, string> = {
    x: 'X', blogs: '博客', podcasts: '播客', tavily: 'Tavily',
    events: '新动态', jobs: '岗位检索', questions: '面经聚合',
  }
  const failedSources = sourceStatus
    ? Object.entries(sourceStatus)
        .filter(([, status]) => status === 'failed')
        .map(([key]) => (key.startsWith('official:') ? `${key.slice(9)} 官方页` : knownLabels[key] ?? key))
    : []
  const sourceStatusTitle = failedSources.length > 0 ? `来源获取失败：${failedSources.join('、')}` : '全部来源获取成功'
  const emptySources = sourceStatus
    ? Object.entries(sourceStatus)
        .filter(([, status]) => status === 'empty')
        .map(([key]) => knownLabels[key] ?? key)
    : []

  return (
    <div className={metaClass} data-testid="briefing-generated-at">
      {displayDate}
      {timeString && ` · ${timeString}`}
      {failedSources.length > 0 && (
        <span className="ml-2 text-wine" data-testid="briefing-source-status" title={sourceStatusTitle}>
          {failedSources.join('、')} 获取失败
        </span>
      )}
      {emptySources.length > 0 && (
        <span
          className={`ml-2 ${isAcademic ? 'text-parchment/50' : 'text-[#6b5d52]'}`}
          data-testid="briefing-source-empty"
          title={`来源暂无更新：${emptySources.join('、')}`}
        >
          {emptySources.join('、')} 暂无更新
        </span>
      )}
      {cacheWriteFailed && (
        <span className="ml-2 text-wine" data-testid="briefing-cache-write-failed">（本次未写入缓存）</span>
      )}
    </div>
  )
}
```

- [ ] **Step 4: 竖轨底部控件区**

`BriefingSourceSidebar.tsx`：
1. import 加：

```tsx
import { BackToCover } from './BackToCover'
import { Button } from './Button'
import { BriefingThemeToggle } from './briefing/BriefingThemeToggle'
```

2. 组件内加 store 订阅：

```tsx
  const increase = useStore((s) => s.increaseBriefingFontSize)
  const decrease = useStore((s) => s.decreaseBriefingFontSize)
  const fontSize = useStore((s) => s.briefingFontSize)
  const goto = useStore((s) => s.goto)
  const canDecrease = fontSize !== 'sm'
  const canIncrease = fontSize !== '7xl'
```

3. `</nav>` 之后、 `</aside>` 之前加底部控件区（newspaper 用对应浅色类）：

```tsx
      <div
        data-testid="briefing-rail-controls"
        className={`flex ${collapsed ? 'flex-col items-center' : 'flex-row items-center'} gap-1 p-2 border-t ${isAcademic ? 'border-[rgba(232,213,183,0.18)]' : 'border-[#c9c3b8]'}`}
      >
        <BackToCover className={isAcademic ? '' : 'text-[#1a1a1a] hover:text-[#555]'} />
        <Button
          variant="ghost"
          onClick={decrease}
          disabled={!canDecrease}
          data-testid="briefing-font-size-decrease"
          className={isAcademic ? '' : 'text-[#1a1a1a] hover:text-[#555]'}
          title="减小字号"
        >
          -
        </Button>
        <Button
          variant="ghost"
          onClick={increase}
          disabled={!canIncrease}
          data-testid="briefing-font-size-increase"
          className={isAcademic ? '' : 'text-[#1a1a1a] hover:text-[#555]'}
          title="增大字号"
        >
          +
        </Button>
        <BriefingThemeToggle />
        {source === 'job-briefing' && (
          <Button
            variant="ghost"
            data-testid="job-briefing-profile-entry"
            onClick={() => goto('settings')}
            className={isAcademic ? '' : 'text-[#1a1a1a] hover:text-[#555]'}
            title="编辑求职档案（意向岗位、方向、经历）"
          >
            档案
          </Button>
        )}
      </div>
```

- [ ] **Step 5: Briefing.tsx 移除顶栏、接 MetaLine**

1. 删除 `import { BriefingHeader }` 与 L140-164 的 `<BriefingHeader ... />` 整块。
2. digest 分支：把 MetaLine 传给两个版式（见 Step 6）；job 分支：在 `<JobBriefingRenderer ... />`（L281）上方加：

```tsx
                  {jobResult && (
                    <div className="max-w-3xl mx-auto mb-2">
                      <BriefingMetaLine
                        displayDate={jobDisplayDate}
                        timeString={jobResult.generatedAt ? formatGeneratedAt(jobResult.generatedAt, jobResult.date) : undefined}
                        sourceStatus={{ ...jobResult.sourceStatus.official, events: jobResult.sourceStatus.events, jobs: jobResult.sourceStatus.jobs, questions: jobResult.sourceStatus.questions }}
                        cacheWriteFailed={jobResult.cacheWriteFailed}
                        theme={theme}
                      />
                    </div>
                  )}
```

（import 加 BriefingMetaLine。）

- [ ] **Step 6: 版式组件接 MetaLine（digest）**

`AcademicBriefingLayout.tsx` header 区：`<p className="text-sm text-[#e8d5b7]/60">{displayDate}</p>` 替换为：

```tsx
          <BriefingMetaLine
            displayDate={displayDate}
            timeString={timeString}
            sourceStatus={sourceStatus}
            cacheWriteFailed={cacheWriteFailed}
            theme="academic"
          />
```

组件 props 加 `timeString?: string; sourceStatus?: Record<string, 'ok' | 'failed' | 'empty'>; cacheWriteFailed?: boolean`，Briefing.tsx 传入（digest 分支 L311-325 与 newspaper 分支 L327-335）：

```tsx
                    timeString={result.generatedAt ? formatGeneratedAt(result.generatedAt, result.date) : undefined}
                    sourceStatus={result.sourceStatus}
                    cacheWriteFailed={result.cacheWriteFailed}
```

`NewspaperBriefingLayout.tsx` 同样处理（theme="newspaper"）。

- [ ] **Step 7: 删除 BriefingHeader.tsx 并全量验证**

```bash
rm src/components/BriefingHeader.tsx tests/briefing-header.test.tsx
npx tsc --noEmit
npx vitest run tests/briefing-sidebar.test.tsx tests/briefing-meta-line.test.tsx tests/briefing-page.test.tsx tests/briefing-layout.test.tsx tests/briefing-typography.test.ts
```

Expected: 全绿。有其他文件 import BriefingHeader 的一并处理（grep 确认无残留引用）。

- [ ] **Step 8: Commit**

```bash
git add -A src/components/BriefingSourceSidebar.tsx src/components/BriefingHeader.tsx src/components/briefing src/pages/Briefing.tsx tests/briefing-sidebar.test.tsx tests/briefing-meta-line.test.tsx tests/briefing-header.test.tsx
git commit -m "feat(layout): remove top bar; rail bottom hosts font/theme/back/job-profile controls"
```

---

### Task 2: 玻璃材质（academic 主题）

**Files:**
- Modify: `src/pages/Briefing.tsx`（页面根 + 内容容器）
- Modify: `src/components/BriefingSourceSidebar.tsx`
- Modify: `src/components/BriefingListColumn.tsx`
- Test: `tests/briefing-layout.test.tsx`（追加类名断言）

材质规格（仅 academic；newspaper 保持现状）：`bg-ink/45 backdrop-blur-md border border-parchment/15 rounded-xl`。页面根加 `gap-2 p-2` 让画作从缝隙透出。

- [ ] **Step 1: 加测试**

`tests/briefing-layout.test.tsx` 追加：

```tsx
  it('applies glass material to rail, list column and content shell in academic theme', () => {
    useStore.setState({ briefingTheme: 'academic', briefingSource: 'digest' } as any)
    render(<Briefing />)
    expect(screen.getByTestId('briefing-source-sidebar').className).toContain('backdrop-blur-md')
    expect(screen.getByTestId('briefing-list-column').className).toContain('backdrop-blur-md')
    expect(screen.getByTestId('briefing-content-shell').className).toContain('backdrop-blur-md')
  })

  it('does not apply glass material in newspaper theme', () => {
    useStore.setState({ briefingTheme: 'newspaper', briefingSource: 'digest' } as any)
    render(<Briefing />)
    expect(screen.getByTestId('briefing-source-sidebar').className).not.toContain('backdrop-blur-md')
  })
```

（若 Briefing 渲染需要更多 store seed，参照该文件既有用例。）

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/briefing-layout.test.tsx`
Expected: FAIL。

- [ ] **Step 3: 实现**

1. `Briefing.tsx` 页面根：`className={... ${isAcademic ? 'gap-2 p-2' : 'bg-white'}}`。
2. 内容容器 `flex-1 flex flex-col min-w-0`（L127）：加 `data-testid="briefing-content-shell"`，academic 时加 `bg-ink/45 backdrop-blur-md border border-parchment/15 rounded-xl overflow-hidden`。
3. `BriefingSourceSidebar.tsx` aside：academic 时 `bg` 从 `bg-ink/70` 改 `bg-ink/45 backdrop-blur-md border border-parchment/15 rounded-xl`，去掉 `border-r`（glass 用整圈 border；newspaper 分支不变）。aside 在页面根有 padding 后自然悬浮。
4. `BriefingListColumn.tsx` themeClasses.academic：`bg: 'bg-ink/45 backdrop-blur-md border border-parchment/15 rounded-xl'`，`border` 字段从 `border-r border-[rgba...)]` 改为空串（保留字段避免外部引用断裂）。

- [ ] **Step 4: 跑测试确认通过 + 目视检查点**

Run: `npx vitest run tests/briefing-layout.test.tsx`
Expected: PASS。对照原型 `.superpowers/brainstorm/914-1784827483/content/layout-real-v3.html` 的缝隙透光效果。

- [ ] **Step 5: Commit**

```bash
git add src/pages/Briefing.tsx src/components/BriefingSourceSidebar.tsx src/components/BriefingListColumn.tsx tests/briefing-layout.test.tsx
git commit -m "feat(layout): glass material on rail/list/content shell (academic theme)"
```

---

### Task 3: 导读面板上移（博客与日报同高同组件）

**Files:**
- Modify: `src/store/index.ts`（新增 anthropicReaderBody/Title）
- Modify: `src/components/anthropic/AnthropicArticleReader.tsx`
- Modify: `src/components/anthropic/AnthropicBlogPanel.tsx`
- Test: `tests/anthropic-blog-panel.test.tsx`、`tests/anthropic-reader-theme.test.tsx`

现状：日报的 `ArticleAssistantPanel` 挂在页面级（全高）；博客的挂在 reader 内部（矮、在滚动列里、拖拽卡顿观感差）。把博客的面板上移到 `AnthropicBlogPanel` 根，与日报同高同组件。

- [ ] **Step 1: 加测试**

`tests/anthropic-blog-panel.test.tsx` 追加：

```tsx
  it('mounts ArticleAssistantPanel at panel root when reader is open', () => {
    useStore.setState({
      anthropicReaderFilePath: '/lib/Anthropic博客/x.md',
      anthropicReaderBody: '正文',
      anthropicReaderTitle: '标题',
    } as any)
    render(<AnthropicBlogPanel theme="academic" />)
    expect(screen.getByTestId('article-assistant-panel')).toBeInTheDocument()
  })

  it('does not mount ArticleAssistantPanel when no reader is open', () => {
    useStore.setState({ anthropicReaderFilePath: null, anthropicReaderBody: null, anthropicReaderTitle: null } as any)
    render(<AnthropicBlogPanel theme="academic" />)
    expect(screen.queryByTestId('article-assistant-panel')).not.toBeInTheDocument()
  })
```

（若 ArticleAssistantPanel 渲染依赖 ipc，参照该测试文件既有 mock 补齐。）

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/anthropic-blog-panel.test.tsx`
Expected: FAIL。

- [ ] **Step 3: store 增加 reader body/title**

`src/store/index.ts`：
1. 接口加：

```ts
  anthropicReaderBody: string | null
  anthropicReaderTitle: string | null
  setAnthropicReaderContent: (content: { body: string | null; title: string | null }) => void
```

2. 初始值（L408 附近）加 `anthropicReaderBody: null, anthropicReaderTitle: null,`
3. 实现：

```ts
  setAnthropicReaderContent: ({ body, title }) =>
    set({ anthropicReaderBody: body, anthropicReaderTitle: title }),
```

4. `closeAnthropicReader` 改为同时清空：`set({ anthropicReaderFilePath: null, anthropicReaderBody: null, anthropicReaderTitle: null })`

- [ ] **Step 4: reader 上报内容、卸下面板**

`AnthropicArticleReader.tsx`：
1. 找到 frontmatter/body 加载成功处（`!loading && frontmatter && body` 渲染分支对应的数据就绪点），加 effect：

```tsx
  const setAnthropicReaderContent = useStore((s) => s.setAnthropicReaderContent)
  useEffect(() => {
    if (!loading && frontmatter && body) {
      setAnthropicReaderContent({ body, title: frontmatter.title ?? null })
    }
  }, [loading, frontmatter, body, setAnthropicReaderContent])
```

2. 删除文件末尾的 `<ArticleAssistantPanel ... />` 块（L265-274）及其 import（若无其他使用）。

- [ ] **Step 5: blog 面板挂载**

`AnthropicBlogPanel.tsx`：
1. import 加 `import { ArticleAssistantPanel } from '@/components/article-assistant'`。
2. 组件内加：

```tsx
  const readerBody = useStore((s) => s.anthropicReaderBody)
  const readerTitle = useStore((s) => s.anthropicReaderTitle)
```

3. 根 div 末尾（阅读器 div 之后、ConfirmDialog 之前）加：

```tsx
      {readerFilePath && readerBody && (
        <ArticleAssistantPanel
          articleType="anthropic-article"
          parentPath={readerFilePath}
          articleTitle={readerTitle ?? undefined}
          articleContent={readerBody}
          autoGenerateGuide
          theme={theme}
        />
      )}
```

- [ ] **Step 6: 回归**

Run: `npx vitest run tests/anthropic-blog-panel.test.tsx tests/anthropic-reader-theme.test.tsx tests/anthropic-reader-images.test.tsx tests/assistant-session-runtime.test.ts`
Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git add src/store/index.ts src/components/anthropic/AnthropicArticleReader.tsx src/components/anthropic/AnthropicBlogPanel.tsx tests/anthropic-blog-panel.test.tsx
git commit -m "feat(guide): lift anthropic assistant panel to blog root (same height/component as digest)"
```

---

### Task 4: 博客收起列密排填满 + 已保存橙框

**Files:**
- Modify: `src/components/anthropic/AnthropicBlogPanel.tsx:143-179`
- Test: `tests/anthropic-blog-panel.test.tsx`

- [ ] **Step 1: 加测试**

```tsx
  it('collapsed rail renders ALL filtered articles (no 10-item cap)', () => {
    const articles = Array.from({ length: 15 }, (_, i) => ({
      url: `https://a/${i}`, title: `T${i}`, publishedAt: null, summary: '',
      imageUrl: null, isSaved: false, filePath: null,
    }))
    useStore.setState({
      anthropicBlogCache: { articles, loading: false, error: null, lastFetchedAt: null },
      anthropicReaderFilePath: null, anthropicReaderBody: null, anthropicReaderTitle: null,
    } as any)
    render(<AnthropicBlogPanel theme="academic" />)
    fireEvent.click(screen.getByTestId('briefing-list-column-toggle'))
    expect(screen.getAllByTestId('anthropic-list-rail-thumb')).toHaveLength(15)
  })

  it('collapsed rail marks saved articles with ember border', () => {
    useStore.setState({
      anthropicBlogCache: {
        articles: [
          { url: 'https://a/1', title: 'saved', publishedAt: null, summary: '', imageUrl: null, isSaved: true, filePath: '/x.md' },
          { url: 'https://a/2', title: 'plain', publishedAt: null, summary: '', imageUrl: null, isSaved: false, filePath: null },
        ],
        loading: false, error: null, lastFetchedAt: null,
      },
      anthropicReaderFilePath: null, anthropicReaderBody: null, anthropicReaderTitle: null,
    } as any)
    render(<AnthropicBlogPanel theme="academic" />)
    fireEvent.click(screen.getByTestId('briefing-list-column-toggle'))
    const [saved, plain] = screen.getAllByTestId('anthropic-list-rail-thumb')
    expect(saved.className).toContain('border-ember')
    expect(plain.className).not.toContain('border-ember')
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/anthropic-blog-panel.test.tsx`
Expected: FAIL（15 ≠ 10；无 border-ember）。

- [ ] **Step 3: 实现**

`AnthropicBlogPanel.tsx` 收起列分支（L143-179）：
1. `filtered.slice(0, 10).map` → `filtered.map`。
2. 缩略图 button 的 className 加条件边框：

```tsx
                className={`shrink-0 rounded overflow-hidden focus:outline-none focus:ring-2 focus:ring-ember/50 ${
                  article.isSaved ? 'border-2 border-ember' : 'border-2 border-transparent'
                }`}
```

（border-transparent 占位避免布局跳动。）

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/anthropic-blog-panel.test.tsx`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/components/anthropic/AnthropicBlogPanel.tsx tests/anthropic-blog-panel.test.tsx
git commit -m "feat(anthropic): dense collapsed rail with ember border for saved articles"
```

---

### Task 5: 仓库改名 + switch 样式 + 写作列配色修正

**Files:**
- Modify: `src/components/writing/WritingListColumn.tsx`
- Modify: `src/components/writing/WritingTree.tsx`（配色主题化）
- Modify: `src/pages/Briefing.tsx`（给 WritingListColumn 传 theme）
- Test: `tests/writing-list-column.test.tsx`（新建）、`tests/writing-tree-delete.test.tsx` 受影响处更新

D5 根因：写作列全部硬编码 parchment（浅色）文字；newspaper 主题（浅底）下变成浅-on-浅。修法：列与树接 theme prop，newspaper 用深色系。

- [ ] **Step 1: 写测试**

新建 `tests/writing-list-column.test.tsx`：

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    writingCreateFile: vi.fn(), writingCreateFolder: vi.fn(), writingImportFiles: vi.fn(),
  },
}))

import { useStore } from '@/store'
import { WritingListColumn } from '@/components/writing/WritingListColumn'

describe('WritingListColumn', () => {
  beforeEach(() => {
    cleanup()
    useStore.setState({
      writingListTab: 'articles',
      writingTree: { writing: [], repository: [] },
      writingFile: null,
      loadWritingTree: vi.fn(),
      selectWritingFile: vi.fn(),
    } as any)
  })

  it('labels the repository tab as 仓库', () => {
    render(<WritingListColumn theme="academic" />)
    expect(screen.getByTestId('writing-list-tab-repository')).toHaveTextContent('仓库')
    expect(screen.queryByText('repository')).not.toBeInTheDocument()
  })

  it('switch indicator moves with active tab', () => {
    render(<WritingListColumn theme="academic" />)
    expect(screen.getByTestId('writing-list-tab-articles').getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByTestId('writing-list-tab-repository'))
    expect(screen.getByTestId('writing-list-tab-repository').getAttribute('aria-pressed')).toBe('true')
  })

  it('uses dark text classes in newspaper theme', () => {
    render(<WritingListColumn theme="newspaper" />)
    expect(screen.getByTestId('writing-new-file').className).not.toContain('text-parchment')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/writing-list-column.test.tsx`
Expected: FAIL（theme prop 不存在；标签仍是 repository）。

- [ ] **Step 3: 实现**

`WritingListColumn.tsx`：
1. 签名改 `export function WritingListColumn({ theme = 'academic' }: { theme?: 'academic' | 'newspaper' })`，内部 `const isAcademic = theme !== 'newspaper'`。
2. 颜色常量：

```tsx
  const ink = isAcademic ? 'text-parchment' : 'text-[#2a1f1a]'
  const dim = isAcademic ? 'text-parchment/60 hover:text-parchment/80' : 'text-[#6b5d52] hover:text-[#2a1f1a]'
  const tabIdle = isAcademic ? 'text-parchment/50 hover:text-parchment/70' : 'text-[#6b5d52]/70 hover:text-[#6b5d52]'
  const borderCol = isAcademic ? 'border-parchment/15' : 'border-[#c9c3b8]'
```

3. tab 条改 switch 分段样式（保持两个 testid）：

```tsx
      <div className={`flex m-2 rounded-lg border ${borderCol} text-xs shrink-0 overflow-hidden`} role="tablist">
        {(['articles', 'repository'] as const).map(t => (
          <button
            key={t}
            role="tab"
            aria-pressed={tab === t}
            data-testid={t === 'articles' ? 'writing-list-tab-articles' : 'writing-list-tab-repository'}
            onClick={() => setTab(t)}
            className={`flex-1 py-1.5 transition-colors ${
              tab === t
                ? isAcademic ? 'bg-ember/20 text-ember' : 'bg-[#1a1a1a] text-white'
                : tabIdle
            }`}
          >
            {t === 'articles' ? '文章' : '仓库'}
          </button>
        ))}
      </div>
```

4. 操作按钮行（新建文章/新建分组/导入文件）的颜色类改用 `dim`/`text-ember`（academic）与 newspaper 对应色：

```tsx
              <button data-testid="writing-new-file" className={isAcademic ? 'text-ember hover:text-ember/80' : 'text-[#8a3a3a] hover:text-[#6a2a2a]'} onClick={handleCreateFile}>＋ 新建文章</button>
              <button data-testid="writing-new-folder" className={dim} onClick={handleCreateFolder}>新建分组</button>
```

repository 分支两个按钮同理（`writing-import-files` / `writing-repo-new-folder`）。

5. 空态文字（WritingTree 内 `text-parchment/40`）与树节点配色：`WritingTree.tsx` 加 `theme` prop（从 WritingListColumn 透传 `<WritingTree root="writing" theme={theme} />`），节点文字 academic 不变，newspaper：`text-[#6b5d52] hover:text-[#2a1f1a] hover:bg-black/5`，选中 `bg-[#1a1a1a]/10 text-[#1a1a1a]`，空态 `text-[#6b5d52]/60`。

6. `Briefing.tsx` L218：`<WritingListColumn />` → `<WritingListColumn theme={theme} />`。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/writing-list-column.test.tsx tests/writing-tree-delete.test.tsx`
Expected: PASS（tree-delete 若因新 prop 失败，给渲染处补 theme prop）。

- [ ] **Step 5: Commit**

```bash
git add src/components/writing/WritingListColumn.tsx src/components/writing/WritingTree.tsx src/pages/Briefing.tsx tests/writing-list-column.test.tsx
git commit -m "feat(writing): rename repository tab to 仓库 with segmented switch; fix column colors in newspaper theme"
```

---

### Task 6: 写作收起列极简计数

**Files:**
- Modify: `src/components/writing/WritingListColumn.tsx`
- Modify: `src/pages/Briefing.tsx`（透传 collapsed）
- Modify: `src/lib/writing-tree-utils.ts`（加 countFiles）
- Test: `tests/writing-list-column.test.tsx`、`tests/writing-tree-utils.test.ts`（若存在，否则合入 list-column 测试）

原型参照 collapsed-columns.html 的 writing-min：▶（列 toggle，已有）+ 竖排「文章」+ 计数徽章，底部竖排「仓库」+ 计数徽章。

- [ ] **Step 1: 加测试**

```tsx
  it('collapsed shows vertical labels with file counts instead of the tree', () => {
    useStore.setState({
      writingListTab: 'articles',
      writingTree: {
        writing: [
          { kind: 'file', name: 'a.md', path: 'writing/a.md' },
          { kind: 'dir', name: '随笔', path: 'writing/随笔', children: [{ kind: 'file', name: 'b.md', path: 'writing/随笔/b.md' }] },
        ],
        repository: [{ kind: 'file', name: 'r.md', path: 'repository/r.md' }],
      },
    } as any)
    render(<WritingListColumn theme="academic" collapsed />)
    expect(screen.getByTestId('writing-collapsed-articles-count')).toHaveTextContent('2')
    expect(screen.getByTestId('writing-collapsed-repository-count')).toHaveTextContent('1')
    expect(screen.queryByTestId('writing-tree-node')).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/writing-list-column.test.tsx`
Expected: FAIL。

- [ ] **Step 3: 实现**

1. `src/lib/writing-tree-utils.ts` 加（若文件已有同名则复用）：

```ts
import type { WritingTreeNode } from '@shared/index'

export function countFiles(nodes: WritingTreeNode[] | undefined): number {
  if (!nodes) return 0
  return nodes.reduce((sum, n) => sum + (n.kind === 'file' ? 1 : countFiles(n.children)), 0)
}
```

2. `WritingListColumn.tsx`：props 加 `collapsed?: boolean`；组件顶部：

```tsx
  if (collapsed) {
    return (
      <div className="flex flex-col items-center py-3 gap-3 h-full">
        <span className={dim} style={{ writingMode: 'vertical-rl' }}>文章</span>
        <span data-testid="writing-collapsed-articles-count" className="min-w-[18px] px-1 py-0.5 rounded-full text-[10px] text-center bg-ember text-white">
          {countFiles(tree?.writing)}
        </span>
        <div className="flex-1" />
        <span className={dim} style={{ writingMode: 'vertical-rl' }}>仓库</span>
        <span data-testid="writing-collapsed-repository-count" className={`min-w-[18px] px-1 py-0.5 rounded-full text-[10px] text-center ${isAcademic ? 'bg-parchment/20 text-parchment' : 'bg-[#1a1a1a] text-white'}`}>
          {countFiles(tree?.repository)}
        </span>
      </div>
    )
  }
```

3. `Briefing.tsx` L218：`<WritingListColumn theme={theme} collapsed={dateColumnCollapsed} />`。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/writing-list-column.test.tsx`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/components/writing/WritingListColumn.tsx src/lib/writing-tree-utils.ts src/pages/Briefing.tsx tests/writing-list-column.test.tsx
git commit -m "feat(writing): collapsed list column shows vertical labels + file counts"
```

---

### Task 7: 写作文章同级拖拽排序

**Files:**
- Modify: `src/store/index.ts`（writingOrder + reorder action）
- Modify: `src/types/index.ts`（StateJson 加 writingOrder）
- Modify: `electron/ipc/state.ts`（DEFAULT 加 writingOrder）
- Modify: `src/components/writing/WritingTree.tsx`
- Test: `tests/writing-reorder.test.ts`（新建）

方案：顺序不落盘到文件系统，存 state.json 的 `writingOrder: Record<string, string[]>`（key = 父目录 path 如 `writing/随笔`，value = 排序后的子节点 path 数组）；树渲染时按此排序，未记录的节点排最后保持扫描序。

- [ ] **Step 1: 写测试**

新建 `tests/writing-reorder.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const patchState = vi.fn()
vi.mock('@/lib/ipc', () => ({ ipc: { patchState: (...a: unknown[]) => patchState(...a) } }))

import { useStore } from '@/store'
import { sortNodesByOrder } from '@/lib/writing-tree-utils'

const nodes = [
  { kind: 'file', name: 'a.md', path: 'writing/a.md' },
  { kind: 'file', name: 'b.md', path: 'writing/b.md' },
  { kind: 'file', name: 'c.md', path: 'writing/c.md'},
] as any

describe('sortNodesByOrder', () => {
  it('sorts by recorded order, unknown nodes last in scan order', () => {
    const sorted = sortNodesByOrder(nodes, ['writing/c.md', 'writing/a.md'])
    expect(sorted.map(n => n.path)).toEqual(['writing/c.md', 'writing/a.md', 'writing/b.md'])
  })

  it('returns scan order when no order recorded', () => {
    expect(sortNodesByOrder(nodes, undefined).map(n => n.path)).toEqual(['writing/a.md', 'writing/b.md', 'writing/c.md'])
  })
})

describe('reorderWritingSibling', () => {
  beforeEach(() => {
    patchState.mockReset()
    useStore.setState({ writingOrder: {} } as any)
  })

  it('moves src before target and persists', () => {
    useStore.getState().reorderWritingSibling({
      dir: 'writing', src: 'writing/c.md', target: 'writing/a.md', position: 'before',
      siblings: ['writing/a.md', 'writing/b.md', 'writing/c.md'],
    })
    expect(useStore.getState().writingOrder['writing']).toEqual(['writing/c.md', 'writing/a.md', 'writing/b.md'])
    expect(patchState).toHaveBeenCalledWith({ writingOrder: { writing: ['writing/c.md', 'writing/a.md', 'writing/b.md'] } })
  })

  it('moves src after target', () => {
    useStore.getState().reorderWritingSibling({
      dir: 'writing', src: 'writing/a.md', target: 'writing/c.md', position: 'after',
      siblings: ['writing/a.md', 'writing/b.md', 'writing/c.md'],
    })
    expect(useStore.getState().writingOrder['writing']).toEqual(['writing/b.md', 'writing/c.md', 'writing/a.md'])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/writing-reorder.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

1. `src/lib/writing-tree-utils.ts` 加：

```ts
export function sortNodesByOrder<T extends { path: string }>(nodes: T[], order: string[] | undefined): T[] {
  if (!order || order.length === 0) return nodes
  const rank = new Map(order.map((p, i) => [p, i]))
  return [...nodes].sort((a, b) => {
    const ra = rank.get(a.path)
    const rb = rank.get(b.path)
    if (ra === undefined && rb === undefined) return 0
    if (ra === undefined) return 1
    if (rb === undefined) return -1
    return ra - rb
  })
}
```

2. `src/types/index.ts` StateJson 加 `writingOrder?: Record<string, string[]>`；`electron/ipc/state.ts` DEFAULT 加 `writingOrder: {},`；store 接口/初始值加 `writingOrder: Record<string, string[]>`（init 从 state 读取 `state.writingOrder ?? {}`）。
3. store action：

```ts
  reorderWritingSibling: ({ dir, src, target, position, siblings }) => {
    const rest = siblings.filter((p) => p !== src)
    const idx = rest.indexOf(target)
    if (idx === -1 || src === target) return
    const next = [...rest.slice(0, position === 'before' ? idx : idx + 1), src, ...rest.slice(position === 'before' ? idx : idx + 1)]
    const writingOrder = { ...get().writingOrder, [dir]: next }
    set({ writingOrder })
    ipc.patchState({ writingOrder } as Partial<StateJson>)
  },
```

接口加签名：`reorderWritingSibling: (args: { dir: string; src: string; target: string; position: 'before' | 'after'; siblings: string[] }) => void`

4. `WritingTree.tsx` TreeNode：
   - 从 store 取 `writingOrder`，渲染 children 前排序：`sortNodesByOrder(node.children ?? [], writingOrder[node.path])`；根层 `WritingTree` 对 `nodes` 排序 `sortNodesByOrder(nodes, writingOrder[root])`。
   - 文件节点 dragOver 也 `e.preventDefault()`（现在仅 dir），并记录插入位置：

```tsx
        onDragOver={(e) => {
          e.preventDefault()
          if (isDir) { setDragOver(true); return }
          const rect = e.currentTarget.getBoundingClientRect()
          setDropPos(e.clientY < rect.top + rect.height / 2 ? 'before' : 'after')
        }}
        onDragLeave={() => { setDragOver(false); setDropPos(null) }}
        onDrop={async (e) => {
          e.preventDefault()
          setDragOver(false)
          const src = e.dataTransfer.getData('text/writing-path')
          setDropPos(null)
          if (!src || src === node.path) return
          if (isDir) {
            await ipc.writingMove({ path: src, targetDir: node.path })
            await loadWritingTree()
            return
          }
          reorderWritingSibling({
            dir: parentDir, src, target: node.path,
            position: dropPos ?? 'after',
            siblings: siblingPaths,
          })
        }}
```

   `parentDir`/`siblingPaths` 由父级经 props 传入（TreeNode 加 props `parentDir: string; siblingPaths: string[]`；根层传 `root` 与顶层 paths；递归层传 `node.path` 与排序后 children paths）。
   - 插入指示线：文件节点 `dropPos === 'before'` → `border-t-2 border-ember`，`'after'` → `border-b-2 border-ember`（加在节点 div className）。新增 state：`const [dropPos, setDropPos] = useState<'before' | 'after' | null>(null)`。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/writing-reorder.test.ts tests/writing-tree-delete.test.tsx tests/writing-store.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/lib/writing-tree-utils.ts src/store/index.ts src/types/index.ts electron/ipc/state.ts src/components/writing/WritingTree.tsx tests/writing-reorder.test.ts
git commit -m "feat(writing): sibling drag-reorder persisted to state.json writingOrder"
```

---

### Task 8: 简报字体扩展（文章列文字 + 三界面语录）

**Files:**
- Modify: `src/lib/briefing-font-size.ts`
- Modify: `src/pages/Briefing.tsx`（pageStyle 加 vars）
- Modify: `src/components/anthropic/AnthropicArticleRow.tsx`
- Modify: `src/components/BriefingDateColumn.tsx`
- Modify: `src/components/Quote.tsx`
- Test: `tests/briefing-typography.test.ts`

- [ ] **Step 1: 加测试**

`tests/briefing-typography.test.ts` 追加：

```ts
  it('exposes list title/meta and quote sizes for every font step', () => {
    for (const size of BRIEFING_FONT_SIZES) {
      expect(BRIEFING_LIST_STYLES[size].title).toMatch(/px$/)
      expect(BRIEFING_LIST_STYLES[size].meta).toMatch(/px$/)
      expect(BRIEFING_QUOTE_SIZES[size]).toMatch(/px$/)
    }
  })

  it('briefing page sets list/quote CSS vars from briefingFontSize', () => {
    // 组件级：见 tests/briefing-page.test.tsx 的 pageStyle 断言（本任务在那里补）
  })
```

`tests/briefing-page.test.tsx` 追加：

```tsx
  it('sets --briefing-list-title-size/--briefing-quote-size vars on the page root', () => {
    useStore.setState({ briefingFontSize: 'lg' } as any)
    render(<Briefing />)
    const page = screen.getByTestId('briefing-page')
    expect(page.style.getPropertyValue('--briefing-list-title-size')).toBe(BRIEFING_LIST_STYLES.lg.title)
    expect(page.style.getPropertyValue('--briefing-quote-size')).toBe(BRIEFING_QUOTE_SIZES.lg)
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/briefing-typography.test.ts tests/briefing-page.test.tsx`
Expected: FAIL。

- [ ] **Step 3: 实现**

1. `briefing-font-size.ts` 加：

```ts
export const BRIEFING_LIST_STYLES: Record<BriefingFontSize, { title: string; meta: string }> = {
  sm: { title: '13px', meta: '10px' },
  base: { title: '14px', meta: '11px' },
  lg: { title: '15px', meta: '12px' },
  xl: { title: '16px', meta: '12px' },
  '2xl': { title: '17px', meta: '13px' },
  '3xl': { title: '18px', meta: '14px' },
  '4xl': { title: '19px', meta: '15px' },
  '5xl': { title: '20px', meta: '16px' },
  '6xl': { title: '21px', meta: '17px' },
  '7xl': { title: '22px', meta: '18px' },
}

export const BRIEFING_QUOTE_SIZES: Record<BriefingFontSize, string> = {
  sm: '12px', base: '13px', lg: '14px', xl: '15px', '2xl': '16px',
  '3xl': '17px', '4xl': '18px', '5xl': '19px', '6xl': '20px', '7xl': '21px',
}
```

2. `Briefing.tsx` pageStyle 加：

```ts
    '--briefing-list-title-size': BRIEFING_LIST_STYLES[fontSize].title,
    '--briefing-list-meta-size': BRIEFING_LIST_STYLES[fontSize].meta,
    '--briefing-quote-size': BRIEFING_QUOTE_SIZES[fontSize],
```

（import 对应补充。）

3. `AnthropicArticleRow.tsx`：标题 h3 移除 `text-base`，加 `style={{ fontSize: 'var(--briefing-list-title-size)' }}`；日期 p 移除 `text-xs`，加 `style={{ fontSize: 'var(--briefing-list-meta-size)' }}`。
4. `BriefingDateColumn.tsx` 展开态条目按钮：`text-sm` 移除，加 `style={{ fontSize: 'var(--briefing-list-title-size)' }}`（collapsed mini 保持原样）。
5. `Quote.tsx` briefing 分支：quote-text 的 `text-[13px]` 移除，加 `style={{ fontSize: 'var(--briefing-quote-size)', ...(isAcademic ? { textShadow: '0 1px 6px rgba(0,0,0,0.6)' } : {}) }}`。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/briefing-typography.test.ts tests/briefing-page.test.tsx tests/anthropic-article-row.test.tsx tests/briefing-date-column.test.tsx`
Expected: PASS（若有 text-base/text-sm 类名旧断言，更新为 var 断言）。

- [ ] **Step 5: Commit**

```bash
git add src/lib/briefing-font-size.ts src/pages/Briefing.tsx src/components/anthropic/AnthropicArticleRow.tsx src/components/BriefingDateColumn.tsx src/components/Quote.tsx tests/briefing-typography.test.ts tests/briefing-page.test.tsx
git commit -m "feat(font): briefing font key now drives list text + quotes on the three briefing surfaces"
```

---

### Task 9: 写作 UI 字体 key（左下角控件 + 消费方）

**Files:**
- Modify: `src/types/index.ts`（StateJson 加 writingUIFontSize）
- Modify: `electron/ipc/state.ts`（DEFAULT）
- Modify: `src/store/index.ts`（key + increase/decrease actions）
- Modify: `src/lib/briefing-font-size.ts`（WRITING_UI_STYLES + WRITING_UI_QUOTE_SIZES）
- Modify: `src/components/BriefingSourceSidebar.tsx`（writing 源时控件切到 writingUI key）
- Modify: `src/components/writing/WritingListColumn.tsx`、`src/components/writing/WritingTree.tsx`、`src/components/Quote.tsx`
- Test: `tests/writing-ui-font.test.tsx`（新建）

决策（spec E 澄清）：竖轨底部同一组 −/＋，在 writing 源控制 `writingUIFontSize`（testid 用 `writing-ui-font-size-decrease/increase`），其余三源控制 `briefingFontSize`（testid 不变）。写作正文仍由工具栏 A-/A+（writingFontSize）独立管控，本任务不碰。

- [ ] **Step 1: 写测试**

新建 `tests/writing-ui-font.test.tsx`：

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

const patchState = vi.fn()
vi.mock('@/lib/ipc', () => ({ ipc: { patchState: (...a: unknown[]) => patchState(...a), writingCreateFile: vi.fn(), writingCreateFolder: vi.fn(), writingImportFiles: vi.fn() } }))
vi.mock('@/lib/paintings', () => ({ manifest: [], pickRandom: vi.fn(() => null) }))

import { useStore } from '@/store'
import { BriefingSourceSidebar } from '@/components/BriefingSourceSidebar'
import { WritingListColumn } from '@/components/writing/WritingListColumn'

describe('writing UI font size', () => {
  beforeEach(() => {
    cleanup()
    patchState.mockReset()
    useStore.setState({
      briefingSource: 'writing',
      writingUIFontSize: 'base',
      writingListTab: 'articles',
      writingTree: { writing: [{ kind: 'file', name: 'a.md', path: 'writing/a.md' }], repository: [] },
      writingFile: null,
      loadWritingTree: vi.fn(),
      selectWritingFile: vi.fn(),
    } as any)
  })

  it('rail shows writing-ui controls on writing source and persists changes', () => {
    render(<BriefingSourceSidebar collapsed={false} onToggle={vi.fn()} theme="academic" />)
    expect(screen.queryByTestId('briefing-font-size-increase')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('writing-ui-font-size-increase'))
    expect(useStore.getState().writingUIFontSize).toBe('lg')
    expect(patchState).toHaveBeenCalledWith({ writingUIFontSize: 'lg' })
  })

  it('writing list column and tree names consume --writing-ui-size', () => {
    render(<WritingListColumn theme="academic" />)
    expect(screen.getByTestId('writing-list-tab-articles').style.fontSize).toBe('var(--writing-ui-size)')
    expect(screen.getByTestId('writing-tree-node').style.fontSize).toBe('var(--writing-ui-size)')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/writing-ui-font.test.tsx`
Expected: FAIL。

- [ ] **Step 3: 实现**

1. `src/types/index.ts` StateJson：`writingUIFontSize?: BriefingFontSize`；`electron/ipc/state.ts` DEFAULT：`writingUIFontSize: 'base',`。
2. store：接口加 `writingUIFontSize: BriefingFontSize`、`increaseWritingUIFontSize: () => Promise<void>`、`decreaseWritingUIFontSize: () => Promise<void>`；初始 `'base'`（init 读 `state.writingUIFontSize ?? 'base'`）；实现仿 `increaseBriefingFontSize`（L773-789）：`nextFontSize/prevFontSize` + `ipc.patchState({ writingUIFontSize })`。
3. `briefing-font-size.ts` 加：

```ts
export const WRITING_UI_STYLES: Record<BriefingFontSize, string> = {
  sm: '11px', base: '12px', lg: '13px', xl: '14px', '2xl': '15px',
  '3xl': '16px', '4xl': '17px', '5xl': '18px', '6xl': '19px', '7xl': '20px',
}

export const WRITING_UI_QUOTE_SIZES: Record<BriefingFontSize, string> = { ...BRIEFING_QUOTE_SIZES }
```

4. `BriefingSourceSidebar.tsx` 底部控件区：字号按钮改为按源切换（Task 1 的代码基础上改）：

```tsx
        {source === 'writing' ? (
          <>
            <Button variant="ghost" onClick={() => void decreaseWritingUIFontSize()} disabled={writingUISize === 'sm'} data-testid="writing-ui-font-size-decrease" title="减小界面字号">-</Button>
            <Button variant="ghost" onClick={() => void increaseWritingUIFontSize()} disabled={writingUISize === '7xl'} data-testid="writing-ui-font-size-increase" title="增大界面字号">+</Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={decrease} disabled={!canDecrease} data-testid="briefing-font-size-decrease" title="减小字号">-</Button>
            <Button variant="ghost" onClick={increase} disabled={!canIncrease} data-testid="briefing-font-size-increase" title="增大字号">+</Button>
          </>
        )}
```

（组件内订阅 `writingUIFontSize as writingUISize` 与两个 action。）

5. `WritingListColumn.tsx` 根 div 加 `style={{ ['--writing-ui-size' as string]: WRITING_UI_STYLES[useStore.getState().writingUIFontSize] }}`——改为订阅式：组件内 `const writingUISize = useStore(s => s.writingUIFontSize)`，根 div `style={{ ['--writing-ui-size' as string]: WRITING_UI_STYLES[writingUISize] }}`；tab 按钮与操作按钮加 `style={{ fontSize: 'var(--writing-ui-size)' }}`。
6. `WritingTree.tsx` 节点 div 移除 `text-xs`，加 `style={{ fontSize: 'var(--writing-ui-size)', paddingLeft: ... }}`（与既有 paddingLeft 合并为一个 style 对象）。
7. `Quote.tsx`：Props surface 加 `'writing'`；渲染分支 `surface === 'briefing' || surface === 'writing'` 共用一个 band，字号 var 按 surface 选择：

```tsx
  if (surface === 'briefing' || surface === 'writing') {
    const sizeVar = surface === 'writing' ? 'var(--writing-ui-quote-size)' : 'var(--briefing-quote-size)'
    // quote-text: style={{ fontSize: sizeVar, ... }}
  }
```

`WritingBoard.tsx` 的 `<Quote surface="briefing" />` 改 `surface="writing"`，并在 WritingBoard 根 div 的 style 里加 `['--writing-ui-quote-size' as string]: WRITING_UI_QUOTE_SIZES[writingUISize]`（组件内订阅 writingUIFontSize）。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/writing-ui-font.test.tsx tests/writing-list-column.test.tsx tests/briefing-sidebar.test.tsx`
Expected: PASS。

- [ ] **Step 5: 跨重启持久化核对**

`electron/ipc/state.ts` DEFAULT 已加；用既有 safe-json 测试确认：`npx vitest run tests/safe-json.test.ts tests/assistant-settings.test.ts` PASS。

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts electron/ipc/state.ts src/store/index.ts src/lib/briefing-font-size.ts src/components/BriefingSourceSidebar.tsx src/components/writing/WritingListColumn.tsx src/components/writing/WritingTree.tsx src/components/Quote.tsx src/components/writing/WritingBoard.tsx tests/writing-ui-font.test.tsx
git commit -m "feat(font): writing UI font key with rail-bottom control, tree/labels/quote consumers"
```

---

### Task 10: 写作助手仿导读重做

**Files:**
- Modify: `src/components/writing-assistant/WritingAssistantPanel.tsx`
- Modify: `src/store/index.ts`（setWritingAssistantWidth 防抖持久化）
- Test: `tests/writing-assistant-panel.test.tsx`（新建）

- [ ] **Step 1: 根因排查（先诊断后动手）**

「写作页面板有时整个消失」候选：
a) `writingAssistantOpen` 持久化为 true，但某路径下 store init 未恢复（检查 L462 `state.writingAssistantOpen ?? false` 与 StateJson 字段是否存在）
b) 宽度持久化为非法值（<200 或 NaN）导致面板挤没（检查 `writingAssistantWidth` 读写边界）
c) 挂载条件 `{source === 'writing' && <WritingAssistantPanel />}` 在源切换时与会话保存竞争（`setWritingAssistantOpen` 关闭时保存会话）

逐一在代码里确认并在报告中写明根因；若根因是 (a)/(b) 类持久化问题，在本任务一并修（加防御：init 时 clamp 宽度到 [200, 560]，open 只认 boolean true）。若是 (c) 或无实据，以本次重做（ArticleDivider + 明确折叠态）为准并在报告说明。

- [ ] **Step 2: 写测试**

新建 `tests/writing-assistant-panel.test.tsx`：

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

const patchState = vi.fn()
vi.mock('@/lib/ipc', () => ({ ipc: { patchState: (...a: unknown[]) => patchState(...a) } }))

import { useStore } from '@/store'
import { WritingAssistantPanel } from '@/components/writing-assistant/WritingAssistantPanel'

vi.mock('@/components/writing-assistant/WritingAssistantMessages', () => ({
  WritingAssistantMessages: () => <div data-testid="wa-messages" />,
}))
vi.mock('@/components/writing-assistant/WritingAssistantInput', () => ({
  WritingAssistantInput: () => <div data-testid="wa-input" />,
}))

describe('WritingAssistantPanel', () => {
  beforeEach(() => {
    cleanup()
    patchState.mockReset()
    useStore.setState({ writingAssistantOpen: true, writingAssistantWidth: 320, writingAssistant: null } as any)
  })

  it('uses the shared ArticleDivider for resizing', () => {
    render(<WritingAssistantPanel />)
    expect(screen.getByTestId('article-assistant-divider')).toBeInTheDocument()
  })

  it('divider toggle collapses the panel to the ember strip', () => {
    render(<WritingAssistantPanel />)
    fireEvent.click(screen.getByTestId('article-assistant-divider-toggle'))
    expect(useStore.getState().writingAssistantOpen).toBe(false)
  })

  it('keeps the collapsed strip entry with its testid', () => {
    useStore.setState({ writingAssistantOpen: false } as any)
    render(<WritingAssistantPanel />)
    expect(screen.getByTestId('writing-assistant-collapsed')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npx vitest run tests/writing-assistant-panel.test.tsx`
Expected: FAIL（现为自定义 2px 把手，无 article-assistant-divider）。

- [ ] **Step 4: 实现**

`WritingAssistantPanel.tsx` 重写展开态（收起竖条原样保留）：

```tsx
import { useStore } from '@/store'
import { ArticleDivider } from '@/components/article-assistant/ArticleDivider'
import { WritingAssistantMessages } from './WritingAssistantMessages'
import { WritingAssistantInput } from './WritingAssistantInput'

export function WritingAssistantPanel() {
  const open = useStore((s) => s.writingAssistantOpen)
  const width = useStore((s) => s.writingAssistantWidth)
  const setOpen = useStore((s) => s.setWritingAssistantOpen)
  const setWidth = useStore((s) => s.setWritingAssistantWidth)

  // Collapsed state: right-edge tab（保留原样，是唯一折叠态出口）
  if (!open) {
    return (
      <div
        data-testid="writing-assistant-collapsed"
        className="w-6 bg-ember text-white text-xs flex items-center justify-center cursor-pointer shrink-0 select-none"
        style={{ writingMode: 'vertical-rl' }}
        onClick={() => setOpen(true)}
      >
        AI 助手 ▸
      </div>
    )
  }

  return (
    <div data-testid="writing-assistant-panel" className="relative z-[5] flex h-full shrink-0">
      <ArticleDivider
        collapsed={false}
        onToggleCollapse={() => setOpen(false)}
        onResize={(w) => {
          const maxWidth = window.innerWidth * 0.45
          if (w < 40) {
            setOpen(false)
          } else {
            setWidth(Math.max(200, Math.min(w, maxWidth)))
          }
        }}
        theme="academic"
      />
      <div className="h-full overflow-hidden" style={{ width }}>
        <div className="h-full flex flex-col min-w-0 border-l border-parchment/20 bg-[#1a1512]">
          <div className="h-9 flex items-center justify-between px-3 border-b border-parchment/10 shrink-0">
            <span className="text-[11px] tracking-[0.2em] text-parchment/80 font-serif">AI 写作助手</span>
            <button
              data-testid="writing-assistant-close-btn"
              className="text-parchment/60 hover:text-ember text-sm leading-none px-1"
              onClick={() => setOpen(false)}
              aria-label="关闭"
            >
              ✕
            </button>
          </div>
          <WritingAssistantMessages />
          <WritingAssistantInput />
        </div>
      </div>
    </div>
  )
}
```

`src/store/index.ts` `setWritingAssistantWidth`（L1446-1448）：持久化改防抖（与 `debounceSaveGuideWidth` 同款模式；若该 debounce helper 是同文件顶层定义，仿照新建 `debounceSaveAssistantWidth`）：

```ts
  setWritingAssistantWidth: (width) => {
    const clamped = Math.max(200, Math.min(width, 1200))
    set({ writingAssistantWidth: clamped })
    debounceSaveAssistantWidth({ writingAssistantWidth: clamped })
  },
```

旧 testid `writing-assistant-resize-handle` 随自定义把手移除——全局 grep 引用（e2e/helpers/selectors.ts、tests），替换为 `article-assistant-divider`。

- [ ] **Step 5: 跑测试确认通过 + e2e 回归**

Run: `npx vitest run tests/writing-assistant-panel.test.tsx`
然后：`grep -rln "writing-assistant" e2e/specs/` 并对列出的 spec 逐个 `npx playwright test --config e2e/playwright.config.ts <spec>`。Expected: 全绿。

- [ ] **Step 6: Commit**

```bash
git add src/components/writing-assistant/WritingAssistantPanel.tsx src/store/index.ts tests/writing-assistant-panel.test.tsx e2e/helpers/selectors.ts
git commit -m "feat(writing-assistant): rebuild resize/collapse on shared ArticleDivider (guide pattern)"
```

---

### Task 11: rules 新增「功能必须有 UI 出口」

**Files:**
- Modify: `.claude/rules/feature-development.md`
- Modify: `.claude/rules/README.md`

- [ ] **Step 1: 追加规则**

`.claude/rules/feature-development.md` 末尾（Example 之前或之后，保持文件既有结构）追加：

```markdown
## 12. 功能必须声明 UI 出口

**Why:** 多次出现功能做完但没有可见入口（写作助手只有 24px 竖条、删除藏右键无发现性），用户以为功能不存在。

- 每个新功能在 spec 中必须声明其 UI 入口（按钮/菜单/面板/竖签），并给出收起态与展开态两种形态。
- 入口必须有 `data-testid` 并出现在至少一个 e2e 断言中（证明运行时真的渲染）。
- 入口的可见性不得依赖隐式知识（如「知道要右键」「知道边缘有条缝」）；隐藏式交互（右键菜单、拖拽）只能作为辅助路径，不能是唯一路径。
- Source: docs/superpowers/specs/2026-07-24-ui-polish-batch-design.md（写作助手无 UI 出口问题）
```

- [ ] **Step 2: 注册 README**

`.claude/rules/README.md`：
1. 表格中 feature-development 的规则数 11 → 12。
2. Changelog 顶部加：`` - `2026-07-24` feature-development 新增 §12：功能必须声明 UI 出口（来自写作助手仅 24px 竖条入口、用户以为功能不存在的反馈）。``

- [ ] **Step 3: Commit**

```bash
git add .claude/rules/feature-development.md .claude/rules/README.md
git commit -m "docs(rules): feature-development §12 every feature needs a visible UI entry"
```

---

### Task 12: 日报 ❧ 铭牌 + 来源卡

**Files:**
- Modify: `src/components/article-assistant/ArticleBodyChunks.tsx:46-50`
- Create: `src/lib/parse-source-link.ts`
- Create: `src/components/briefing/BriefingSourceCard.tsx`
- Modify: `src/components/briefing/AcademicBriefingLayout.tsx:81-100`
- Modify: `src/components/briefing/NewspaperBriefingLayout.tsx`（同源区块）
- Test: `tests/ArticleBodyChunks.test.tsx`、`tests/briefing-source-card.test.tsx`（新建）

- [ ] **Step 1: 写测试**

`tests/ArticleBodyChunks.test.tsx` 追加：

```tsx
  it('renders chunk headings as ❧ plaque with small-caps source name', () => {
    // 渲染两个 chunk 的文章（参照文件既有用法构造 chunks）
    const plaque = screen.getAllByTestId('article-chunk-plaque')[0]
    expect(plaque).toHaveTextContent('❧')
    expect(plaque).toHaveTextContent('1')
    expect(plaque).toHaveTextContent('X / Twitter')
    expect(plaque.textContent).not.toContain('§')
  })
```

新建 `tests/briefing-source-card.test.tsx`：

```tsx
import { describe, expect, it } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { BriefingSourceCard } from '@/components/briefing/BriefingSourceCard'
import { extractFirstLink } from '@/lib/parse-source-link'

describe('extractFirstLink', () => {
  it('extracts markdown link', () => {
    expect(extractFirstLink('[Swyx](https://x.com/swyx)')).toEqual({ text: 'Swyx', url: 'https://x.com/swyx' })
  })
  it('extracts bare url', () => {
    expect(extractFirstLink('Swyx https://x.com/swyx 晚间').url).toBe('https://x.com/swyx')
  })
  it('returns null url when no link', () => {
    expect(extractFirstLink('纯文本')).toEqual({ text: '纯文本', url: null })
  })
})

describe('BriefingSourceCard', () => {
  it('renders mono card with 原文 ↗ chip for linked items', () => {
    cleanup()
    render(<BriefingSourceCard item="[Swyx (AI Engineer)](https://x.com/swyx)" theme="academic" />)
    const link = screen.getByTestId('briefing-source-card-link')
    expect(link).toHaveAttribute('href', 'https://x.com/swyx')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByTestId('briefing-source-card').className).toContain('font-mono')
  })

  it('renders text without chip when item has no link', () => {
    cleanup()
    render(<BriefingSourceCard item="Swyx 播客笔记" theme="academic" />)
    expect(screen.queryByTestId('briefing-source-card-link')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/briefing-source-card.test.tsx tests/ArticleBodyChunks.test.tsx`
Expected: FAIL。

- [ ] **Step 3: 实现**

1. `src/lib/parse-source-link.ts`：

```ts
const LINK_PATTERN = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)|(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/

export function extractFirstLink(item: string): { text: string; url: string | null } {
  const m = LINK_PATTERN.exec(item)
  if (!m) return { text: item, url: null }
  const url = m[2] || m[3]
  const text = (m[1] || item.replace(m[0], '').trim() || url)
  return { text, url }
}
```

2. `src/components/briefing/BriefingSourceCard.tsx`：

```tsx
import { extractFirstLink } from '@/lib/parse-source-link'

interface Props {
  item: string
  theme: 'academic' | 'newspaper'
}

export function BriefingSourceCard({ item, theme }: Props) {
  const isAcademic = theme !== 'newspaper'
  const { text, url } = extractFirstLink(item)
  return (
    <div
      data-testid="briefing-source-card"
      className={`flex items-center gap-3 rounded-lg border px-3 py-2 font-mono ${
        isAcademic ? 'border-ember/35 bg-ink/50' : 'border-[#1a1a1a]/30 bg-white'
      }`}
    >
      <div className={`min-w-0 flex-1 text-xs leading-relaxed ${isAcademic ? 'text-parchment/85' : 'text-[#1a1a1a]'}`}>
        {text}
      </div>
      {url && (
        <a
          data-testid="briefing-source-card-link"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={`shrink-0 rounded border px-2 py-0.5 text-[10px] ${
            isAcademic
              ? 'border-ember/50 text-ember hover:bg-ember/15'
              : 'border-[#1a1a1a]/50 text-[#1a1a1a] hover:bg-black/5'
          }`}
        >
          原文 ↗
        </a>
      )}
    </div>
  )
}
```

3. `ArticleBodyChunks.tsx` chunk 标题（L46-50）替换为：

```tsx
            {chunk.heading && (
              <div data-testid="article-chunk-plaque" className="flex items-center gap-2 mb-2">
                <span className="text-ember text-sm leading-none">
                  ❧<span className="text-xs align-top">{i + 1}</span>
                </span>
                <span className="text-ember text-sm tracking-[0.2em]" style={{ fontVariant: 'small-caps' }}>
                  {chunk.heading}
                </span>
                <span className="flex-1 border-t border-ember/40" />
              </div>
            )}
```

4. 两个版式的来源区（AcademicBriefingLayout L90-98 与 Newspaper 同位置）替换为：

```tsx
            {expandedSources && (
              <div className="mt-4 space-y-4">
                {parsed.sources.map((group, i) => (
                  <div key={i} data-testid="briefing-source-group">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-xs tracking-[0.2em] ${isAcademic ? 'text-ember' : 'text-[#8a3a3a]'}`} style={{ fontVariant: 'small-caps' }}>
                        {group.title}
                      </span>
                      <span className={`flex-1 border-t ${isAcademic ? 'border-ember/30' : 'border-[#1a1a1a]/20'}`} />
                    </div>
                    <div className="space-y-2">
                      {group.items.map((item, j) => (
                        <BriefingSourceCard key={j} item={item} theme={theme} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
```

（Academic 版式文件里 `isAcademic` 恒 true，直接写死 academic 分支即可；Newspaper 同理。保留 `briefing-source-expand-toggle` 与折叠交互。）

- [ ] **Step 4: 跑测试确认通过 + e2e 检查**

Run: `npx vitest run tests/briefing-source-card.test.tsx tests/ArticleBodyChunks.test.tsx tests/briefing-layout.test.tsx`
再检查 e2e 是否断言了旧的 `§` 文本或 pill 结构：`grep -rn "§\|variant=\"pill\"\|briefing-source-item" e2e/specs/`，命中的 spec 更新后运行。Expected: 全绿。

- [ ] **Step 5: Commit**

```bash
git add src/lib/parse-source-link.ts src/components/briefing/BriefingSourceCard.tsx src/components/article-assistant/ArticleBodyChunks.tsx src/components/briefing/AcademicBriefingLayout.tsx src/components/briefing/NewspaperBriefingLayout.tsx tests/briefing-source-card.test.tsx tests/ArticleBodyChunks.test.tsx
git commit -m "feat(digest): ❧ plaque chunk headings + grouped source cards with restored group titles"
```

---

### Task 13: 全量回归与 e2e 修复

**Files:** 视修复面而定。

- [x] **Step 1: 类型 + 全量单测**

```bash
npx tsc --noEmit
npm run test
```

Expected: 全绿。修复所有失败（本批次改动导致的）；历史遗留失败记录不修。

- [x] **Step 2: e2e 全面排查**

顶栏移除/竖轨改动影响面大，逐个排查引用以下 testid 的 e2e：`briefing-generated-at`、`briefing-source-status`、`briefing-font-size-decrease/increase`、`briefing-sidebar-toggle`、`job-briefing-profile-entry`、`writing-assistant-resize-handle`、`article-chunk-plaque`、`briefing-source-group`：

```bash
grep -rln "briefing-generated-at\|briefing-font-size\|briefing-sidebar-toggle\|job-briefing-profile-entry\|writing-assistant\|chunk-plaque\|source-group" e2e/specs/ e2e/pages/ e2e/helpers/
```

对命中 spec 逐个运行 `npx playwright test --config e2e/playwright.config.ts <spec>` 并修复。然后跑一遍 briefing 相关 e2e 子集（startup-health、briefing、annotations、writing、assistant 关键词的 spec）。

- [x] **Step 3: 目视核对（报告给用户）**

在最终报告中写明需用户目视确认的点：竖轨玻璃质感 vs 原型 layout-real-v3、收起列两种形态、日报 ❧ 铭牌与来源卡、写作助手拖拽手感、写作页 UI 字号控件。

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test(e2e): align specs with rail layout, assistant divider, plaque headings"
```

---

### Task 14: E2E 验收补全（布局批新增/变更功能覆盖）

**Files:** `e2e/specs/*.spec.ts`, `e2e/pages/*.ts`, `e2e/helpers/selectors.ts`

**Goal:** 把 spec §K 的 10 条 e2e 验收用例落地为可运行的 Playwright spec，覆盖 B1/B2/D1/D2/D3/D4/D5/E1/E2/G1/I。

- [ ] **Step 1: 选择器补齐**
  - 把 spec §K 涉及的 testid 加入 `e2e/helpers/selectors.ts`（如 `railControls`, `railFontSizeDecrease`, `railFontSizeIncrease`, `writingCollapsedArticlesCount`, `writingCollapsedRepositoryCount`, `articleChunkPlaque`, `briefingSourceGroup`, `briefingSourceCardLink`, `anthropicListRailThumb` 等）。
  - 已有 testid 保持原名，避免重复。

- [ ] **Step 2: 新增/扩展 e2e spec**

| 目标文件 | 用例 |
|---|---|
| `e2e/specs/briefing-rail-layout.spec.ts`（新建） | B1 竖轨控件布局、B2 玻璃材质 |
| `e2e/specs/anthropic-blog-ui.spec.ts`（扩展） | B2 博客导读同高、D1 博客收起列密排+橙框 |
| `e2e/specs/writing-list-column.spec.ts`（新建） | D4/D5 仓库 switch + newspaper 配色、D2 收起列计数 |
| `e2e/specs/writing-tree-reorder.spec.ts`（新建） | D3 拖拽排序 |
| `e2e/specs/briefing-font.spec.ts`（新建） | E1/E2 字号联动 |
| `e2e/specs/writing-assistant-resize.spec.ts`（扩展） | G1 ArticleDivider 折叠/拖拽 |
| `e2e/specs/briefing-source-cards.spec.ts`（新建） | I ❧ 铭牌 + 来源卡 |

- [ ] **Step 3: mock / seed 策略**
  - 日报/博客/求职使用确定性 seed 或 fixture，不依赖真实 LLM。
  - 博客 15 篇文章用 fixture 或 seed helper 生成。
  - 写作树文件用 `seedWritingTree` helper（若不存在则创建）。
  - 拖拽排序后通过 `window.location.reload()` 或 state.json 后门验证持久化。

- [ ] **Step 4: 运行并修复**

```bash
npm run build
npx playwright test --config e2e/playwright.config.ts briefing-rail-layout anthropic-blog-ui writing-list-column writing-tree-reorder briefing-font writing-assistant-resize briefing-source-cards
```

Expected: 全绿。

- [ ] **Step 5: 文档同步**
  - 更新 `e2e/README.md` 目录与标签说明。
  - 更新本 plan Task 13 Step 4 commit 为包含新增 e2e 的 commit。

- [ ] **Step 6: Commit**

```bash
git add e2e/specs e2e/pages e2e/helpers/selectors.ts docs/superpowers/specs/2026-07-24-ui-polish-batch-design.md docs/superpowers/plans/2026-07-24-ui-polish-layout-batch.md
git commit -m "test(e2e): add acceptance specs for rail layout, list columns, source cards, font keys"
```

---

## Self-Review 记录

- Spec 覆盖：B1→Task 1/2，B2→Task 3，D1→Task 4，D4/D5→Task 5，D2→Task 6，D3→Task 7，E1→Task 8，E2→Task 9，G1→Task 10，G2→Task 11，I→Task 12，回归→Task 13，E2E 验收补全→Task 14。
