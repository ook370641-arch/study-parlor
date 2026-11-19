# Learning Source Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把旧「点亮灯火」学习首页完整重组为夜航简报首位「学习」来源，以分组树、主题专辑墙、主题主页和双列正式学习承载全部既有能力，且不因删除旧页面而丢功能。

**Architecture:** 沿用现有 Zustand、学习库扫描、分组 IPC、会话运行时和归档格式，只在渲染层新增学习来源与共享运行时选择状态。`study-wall.ts` 从同一份 `library + pendingArchives + unsavedSessions` 派生树和墙；`StudySourcePanel` 同时挂载于简报与正式学习；`StudyTopicBoard` 用页内文件视图替代普通 `SessionViewer` 弹窗；卫星拖拽与推荐卡直接复用现有行为。

**Tech Stack:** Electron 30、React 18、TypeScript、Tailwind CSS、Zustand、Vitest、Testing Library、Playwright、electron-vite。

**Spec:** `docs/superpowers/specs/2026-11-17-learning-source-restructure-design.md`，特别是第 11 章全界面清单与第 16 章功能保全矩阵。

## Global Constraints

- 新来源 id 为 `study`，展示名为「学习」，位于写作之前；一张学习卡代表一个 `TopicMeta`，不是一个 session。
- 第二列固定为「分组 → 主题 → 展开后的第 N 次学习」；分组仍是主题级，`TopicMeta`、`GroupMapping` 与学习库目录不迁移。
- 来源列沿用现有展开／收起；学习第二列也可收起并保留 56px 窄栏；两列在正式学习中常驻挂载，运行时状态跨学习墙、主题主页和正式学习共享。
- 来源折叠状态不写入 `state.json`；`briefingSource` 继续持久化，无合法历史时回退 `writing`。
- 学习墙推荐区最多 3 张卡；推荐策略、独立刷新、缓存、5 秒自动加载防抖与错误重试不变；主题列表不得再按 9 条截断。
- 分组语境的「全部」入口保留；不得新增归档视图、学习状态「全部／待复习」筛选、session 级分组或学习卡 AI 封面。
- `GravityField`、6px 拖拽激活、72px 吸附和 `moveTopicToGroup` 保留；不得用树内拖框替代。
- 封面布局不变；「点亮灯火」保留原样式但不可激活；「夜航简报」恢复上次来源。
- 设置中心不做视觉改造，只修正旧首页返回落点；设置中的归档主题恢复能力必须保留。
- 正式学习保留单 live session 后台契约。普通浏览先保存再切换且不中止后台工作；显式开始或恢复另一段会话时，无论当前在学习页还是简报都先保存最新快照，再由 `startSession`／`restoreSession` 中止被替换旧流。
- 外部资料资产卡与卡片内展开保留；「摘要 →」打开第三列工作区页签，不重新请求资料，不再使用固定右侧摘要面板。
- 旧版没有独立删除主题入口，本次不新增主题删除 IPC；主题归档与设置恢复、session 删除确认是两套不同语义。
- 不直接编辑主工作区，不启动第二个 Electron，不占用开发端口；E2E 仅在用户明确确认后运行定向集合，不跑全量。

## File Structure

- `src/lib/briefing-source.ts`：合法来源归一化与默认来源。
- `src/lib/study-wall.ts`：pending 合并、最近 session、分组／搜索过滤、推荐组选择与推荐去重。
- `src/lib/study-artifacts.ts`：产物 key、frontmatter 剥离与寓言 prompt 纯逻辑。
- `src/lib/study-navigation.ts`：正式学习中保存成功后导航、保存失败留在原页的守护。
- `src/components/study/StudySourcePanel.tsx`：可收起第二列、新学习、搜索、进行中、分组／主题／session 树与分组指南。
- `src/components/study/StudyWall.tsx`：旧首页问候、Quote、说明、推荐、未完成会话与专辑墙。
- `src/components/study/StudyTopicCard.tsx`：主题排版卡、状态、快捷操作与拖拽起点。
- `src/components/study/useStudyGravityDrag.ts`：卫星场拖拽生命周期。
- `src/components/study/useStudyTopicActions.ts`：继续、复习、重命名、归档和 pending 报告动作。
- `src/components/study/StudyTopicBoard.tsx`：session 时间线、五类产物页签、删除确认、ReviewFlash 与寓言风格弹层。
- `src/components/study/SessionFileContent.tsx`：页内 Markdown／SVG／图片读取、错误和重试。
- `src/components/study/ExternalSummaryWorkspace.tsx`：外部资料工作区页签正文与说明入口。
- `src/pages/Briefing.tsx`：学习来源三栏集成，其他来源显式分支不变。
- `src/pages/Study.tsx`：共享双列、对话／外部资料页签、后台切换与既有归档状态。
- `src/store/index.ts`：运行时选择／折叠／产物任务状态与导航落点；不新增持久化字段。
- `e2e/source-map.json`：新学习组件与迁移 spec 的定向映射。

---

### Task 1: 来源类型、共享折叠状态与旧入口落点

**Files:**
- Create: `src/lib/briefing-source.ts`
- Modify: `src/types/index.ts`
- Modify: `src/store/index.ts`
- Modify: `src/pages/Cover.tsx`
- Modify: `src/pages/Settings.tsx`
- Test: `tests/briefing-source.test.ts`
- Test: `tests/briefing-sidebar.test.tsx`
- Test: `tests/store.test.ts`

**Interfaces:**
- Consumes: 现有 `BriefingSourceId`、`briefingSource`、`setBriefingSource`、`settingsReturnTo`。
- Produces: `normalizeBriefingSource(value: unknown): BriefingSourceId`；`StudyTopicTab = 'report' | 'transcript' | 'diagram' | 'fable' | 'review'`；`StudyWorkspaceTab = 'conversation' | 'external-summary'`；共享运行时折叠、选择和展开状态。

- [ ] **Step 1: 写来源恢复与运行时折叠的失败测试**

```ts
import { describe, expect, it } from 'vitest'
import { normalizeBriefingSource } from '@/lib/briefing-source'

describe('normalizeBriefingSource', () => {
  it.each(['study', 'writing', 'anthropic', 'book'])('accepts %s', value => {
    expect(normalizeBriefingSource(value)).toBe(value)
  })

  it.each([undefined, null, 'home', 'digest', 42])('falls back for %s', value => {
    expect(normalizeBriefingSource(value)).toBe('writing')
  })
})
```

在 `tests/store.test.ts` 增加运行时折叠不持久化的断言：

```tsx
it('toggles the source rail without adding a persisted state field', () => {
  const patchState = vi.mocked(ipc.patchState)
  patchState.mockClear()
  useStore.setState({ briefingSidebarCollapsed: false })
  useStore.getState().toggleBriefingSidebar()
  expect(useStore.getState().briefingSidebarCollapsed).toBe(true)
  expect(patchState).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: 运行测试并确认因缺少新来源而失败**

Run: `npx vitest run tests/briefing-source.test.ts tests/briefing-sidebar.test.tsx tests/store.test.ts`

Expected: FAIL，提示找不到 `@/lib/briefing-source`，共享折叠动作尚未定义。

- [ ] **Step 3: 增加来源归一化与共享运行时状态**

```ts
import type { BriefingSourceId } from '@shared/index'

export function normalizeBriefingSource(value: unknown): BriefingSourceId {
  return value === 'study' || value === 'writing' || value === 'anthropic' || value === 'book'
    ? value
    : 'writing'
}
```

在共享类型中加入：

```ts
export type BriefingSourceId = 'study' | 'writing' | 'anthropic' | 'book'
export type StudyTopicTab = 'report' | 'transcript' | 'diagram' | 'fable' | 'review'
export type StudyWorkspaceTab = 'conversation' | 'external-summary'
export type PendingArchive = {
  dirName: string
  topic: string
  sessionNumber: number
  mode: Mode
  date: string
}
```

`store.init` 中原有的三来源条件判断替换为 `briefingSource: normalizeBriefingSource(state.briefingSource)`，并导入该 helper；其它持久化字段初始化不变。

在 `AppStore` 添加以下运行时字段和动作；默认值分别为 `false`、`false`、`null`、`null`、`'report'`、`'conversation'`、`''`、`{}`、`{}`。这些字段不加入 `StateJson` 或 `ipc.patchState`。

```ts
briefingSidebarCollapsed: boolean
studyListCollapsed: boolean
studySelectedDirName: string | null
studySelectedSessionNumber: number | null
studyTopicTab: StudyTopicTab
studyWorkspaceTab: StudyWorkspaceTab
studySearchQuery: string
studyExpandedGroups: Record<string, boolean>
studyExpandedTopics: Record<string, boolean>
toggleBriefingSidebar: () => void
toggleStudyList: () => void
setStudySearchQuery: (query: string) => void
toggleStudyGroup: (groupId: string) => void
toggleStudyTopic: (dirName: string) => void
openStudyWall: () => void
openStudyTopic: (dirName: string, sessionNumber?: number) => void
setStudyTopicTab: (tab: StudyTopicTab) => void
setStudyWorkspaceTab: (tab: StudyWorkspaceTab) => void
```

`openStudyWall` 只清空选择的 dirName／session 并把主题页签重置为 `report`；`openStudyTopic` 设置 dirName、`studySelectedSessionNumber: sessionNumber ?? null` 和 `report` 页签，但不清空分组展开、主题展开、搜索或折叠状态。`toggleStudyGroup` 以 `当前值 ?? true` 为展开初值再取反，`toggleStudyTopic` 以 `当前值 ?? false` 为初值再取反。

- [ ] **Step 4: 修正封面与设置落点**

本任务不提前显示学习导航；可见入口在 Task 10 与完整页面分支一起加入，避免中间提交出现点击后落到错误来源的按钮。保留 `BriefingSourceSidebar` 现有写作对照挑选器与 HTML flush。

封面对已有资料的「点亮灯火」保留 `Button` 和原 class，但删除 `onClick`，添加 `aria-disabled="true"` 与 `onKeyDown` 阻止 Enter／Space 激活；首次命名后的 `onEnter` 改为 `await goto('briefing')`。设置的返回按钮改为：

```tsx
onClick={() => void goto(settingsReturnTo && settingsReturnTo !== 'home' ? settingsReturnTo : 'briefing')}
```

`home` 暂时仍留在 `Page` 类型，直到旧路由最终退役；`SurfaceBackground surface="home"` 与设置页画作控制不得删除。

- [ ] **Step 5: 验证并提交**

Run: `npx vitest run tests/briefing-source.test.ts tests/briefing-sidebar.test.tsx tests/store.test.ts tests/settings.test.tsx`

Expected: PASS；旧合法来源仍原样恢复，非法旧值回退写作。

```bash
git add src/lib/briefing-source.ts src/types/index.ts src/store/index.ts src/pages/Cover.tsx src/pages/Settings.tsx tests/briefing-source.test.ts tests/store.test.ts
git commit -m "feat: add study source state and safe entry points"
```

### Task 2: 学习树与专辑墙共享纯视图模型

**Files:**
- Create: `src/lib/study-wall.ts`
- Test: `tests/study-wall.test.ts`

**Interfaces:**
- Consumes: `TopicMeta`、`SessionMeta`、`Group`、`PendingArchive`。
- Produces: `mergePendingArchives`、`latestSession`、`pendingSessionNumbers`、`filterStudyTopics`、`selectRecommendationGroups`、`recommendationExistsInLibrary`。

- [ ] **Step 1: 写 pending、全量可达、过滤和推荐上限的失败测试**

```ts
import { describe, expect, it } from 'vitest'
import type { TopicMeta } from '@shared/index'
import { filterStudyTopics, latestSession, mergePendingArchives, selectRecommendationGroups } from '@/lib/study-wall'

const topic: TopicMeta = {
  dirName: 'memory', title: '记忆', sessionCount: 1, last_studied: '2026-11-01', last_studied_days: 1, groupId: 'default',
  sessions: [{ sessionNumber: 1, date: '2026-11-01', hasReport: true, hasTranscript: true, hasReview: false, hasFable: false, fableCount: 0, hasDiagram: false, reportFile: '学习报告.md' }],
}

describe('study wall model', () => {
  it('merges one pending session without duplicating an existing session', () => {
    const pending = [{ dirName: 'memory', topic: '记忆', sessionNumber: 2, mode: 'progress' as const, date: '2026-11-20' }]
    const merged = mergePendingArchives([topic], pending)
    expect(merged[0].sessionCount).toBe(2)
    expect(latestSession(merged[0])?.sessionNumber).toBe(2)
    expect(mergePendingArchives(merged, pending)[0].sessions).toHaveLength(2)
  })

  it('does not paginate or silently drop topics after the ninth item', () => {
    const topics = Array.from({ length: 12 }, (_, index) => ({ ...topic, dirName: `t${index}`, title: `主题 ${index}` }))
    expect(filterStudyTopics(topics, null, '')).toHaveLength(12)
    expect(filterStudyTopics(topics, null, '主题 11').map(t => t.dirName)).toEqual(['t11'])
  })

  it('caps only globally visible recommendation groups, not theme cards', () => {
    const groups = [
      { id: 'default', name: '默认', color: '#d97757' },
      { id: 'g2', name: '二', color: '#7c9cb5' },
      { id: 'g3', name: '三', color: '#6b8f71' },
    ]
    const topics = groups.map(group => ({ ...topic, dirName: group.id, groupId: group.id }))
    expect(selectRecommendationGroups(groups, topics, null).map(group => group.id)).toEqual(['default', 'g2'])
    expect(selectRecommendationGroups(groups, topics, 'g3').map(group => group.id)).toEqual(['g3'])
    expect(filterStudyTopics(topics, null, '')).toHaveLength(3)
  })
})
```

- [ ] **Step 2: 运行纯逻辑测试并确认失败**

Run: `npx vitest run tests/study-wall.test.ts`

Expected: FAIL，模块 `src/lib/study-wall.ts` 尚不存在。

- [ ] **Step 3: 实现无 IPC、无 DOM 的视图模型**

```ts
import type { Group, PendingArchive, SessionMeta, TopicMeta } from '@shared/index'

export function latestSession(topic: TopicMeta): SessionMeta | undefined {
  return [...topic.sessions].sort((a, b) => b.sessionNumber - a.sessionNumber)[0]
}

export function mergePendingArchives(library: TopicMeta[], pending: PendingArchive[]): TopicMeta[] {
  const result = library.map(topic => ({ ...topic, sessions: topic.sessions.map(session => ({ ...session })) }))
  for (const item of pending) {
    let target = result.find(topic => topic.dirName === item.dirName)
    if (!target) {
      target = { dirName: item.dirName, title: item.topic, sessionCount: 0, sessions: [], last_studied: item.date, last_studied_days: 0, groupId: 'default' }
      result.push(target)
    }
    if (!target.sessions.some(session => session.sessionNumber === item.sessionNumber)) {
      target.sessions.push({ sessionNumber: item.sessionNumber, date: item.date, hasReport: false, hasTranscript: false, hasReview: false, hasFable: false, fableCount: 0, hasDiagram: false })
    }
    target.sessionCount = target.sessions.length
    target.last_studied = item.date
    target.last_studied_days = 0
  }
  return result
}

export function pendingSessionNumbers(pending: PendingArchive[], dirName: string): ReadonlySet<number> {
  return new Set(pending.filter(item => item.dirName === dirName).map(item => item.sessionNumber))
}

export function filterStudyTopics(library: TopicMeta[], activeGroupId: string | null, query: string): TopicMeta[] {
  const needle = query.trim().toLocaleLowerCase()
  return library.filter(topic => {
    if (activeGroupId && topic.groupId !== activeGroupId) return false
    return !needle || `${topic.title}\n${topic.dirName}`.toLocaleLowerCase().includes(needle)
  })
}

export function selectRecommendationGroups(groups: Group[], library: TopicMeta[], activeGroupId: string | null): Group[] {
  const nonEmpty = groups.filter(group => library.some(topic => topic.groupId === group.id))
  return activeGroupId ? nonEmpty.filter(group => group.id === activeGroupId) : nonEmpty.slice(0, 2)
}

export function recommendationExistsInLibrary(recommendationTopic: string, library: TopicMeta[]): boolean {
  const normalized = recommendationTopic.trim().toLocaleLowerCase()
  return library.some(topic => topic.title.trim().toLocaleLowerCase() === normalized || topic.dirName.toLocaleLowerCase() === normalized)
}
```

树和墙都必须先调用 `mergePendingArchives`，再分别应用展示过滤；不得各自复制 pending 合并逻辑。归档主题继续由 `store.library` 过滤，本函数不读取或展示 `archivedTopics`。

- [ ] **Step 4: 增加推荐归档去重与 pending key 测试**

```ts
it('hides a recommendation only after its topic is present and reports pending keys per topic', () => {
  expect(recommendationExistsInLibrary(' 记忆 ', [topic])).toBe(true)
  expect(recommendationExistsInLibrary('陌生主题', [topic])).toBe(false)
  const pending = [{ dirName: 'memory', topic: '记忆', sessionNumber: 2, mode: 'progress' as const, date: '2026-11-20' }]
  expect([...pendingSessionNumbers(pending, 'memory')]).toEqual([2])
  expect([...pendingSessionNumbers(pending, 'other')]).toEqual([])
})
```

为上述断言补齐 import，再运行 `npx vitest run tests/study-wall.test.ts`，Expected: PASS。

- [ ] **Step 5: 提交纯模型**

```bash
git add src/lib/study-wall.ts tests/study-wall.test.ts src/types/index.ts
git commit -m "feat: derive study tree and wall from shared topic models"
```

### Task 3: 页内 Session 文件读取与失败重试

**Files:**
- Create: `src/components/study/SessionFileContent.tsx`
- Test: `tests/session-file-content.test.tsx`

**Interfaces:**
- Consumes: 现有 `ipc.readSessionFile`、`MarkdownRenderer`、`SVGRenderer`。
- Produces: `SessionFileContent(props: { dirName: string; sessionNumber: number; fileName: string; title: string; version?: number }): JSX.Element`。

- [ ] **Step 1: 写成功渲染、切换文件与失败重试测试**

```tsx
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ipc } from '@/lib/ipc'
import { SessionFileContent } from '@/components/study/SessionFileContent'

vi.mock('@/lib/ipc', () => ({ ipc: { readSessionFile: vi.fn() } }))
vi.mock('@/components/md/MarkdownRenderer', () => ({ MarkdownRenderer: ({ content }: { content: string }) => <div data-testid="markdown">{content}</div> }))
vi.mock('@/components/SVGRenderer', () => ({ SVGRenderer: ({ source }: { source: string }) => <div data-testid="svg">{source}</div> }))

const props = { dirName: 'memory', sessionNumber: 2, fileName: '学习报告.md', title: '第 2 次报告' }

describe('SessionFileContent', () => {
  beforeEach(() => { cleanup(); vi.mocked(ipc.readSessionFile).mockReset() })

  it('keeps a read failure in the workspace and retries the same file', async () => {
    vi.mocked(ipc.readSessionFile)
      .mockRejectedValueOnce(new Error('磁盘暂不可用'))
      .mockResolvedValueOnce({ content: '# 恢复后的报告', mimeType: 'text/markdown' })
    render(<SessionFileContent {...props} />)
    expect(await screen.findByText('磁盘暂不可用')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('session-file-retry'))
    await waitFor(() => expect(screen.getByTestId('markdown')).toHaveTextContent('恢复后的报告'))
    expect(ipc.readSessionFile).toHaveBeenNthCalledWith(2, { dirName: 'memory', sessionNumber: 2, fileName: '学习报告.md' })
  })

  it('renders SVG in the existing safe renderer', async () => {
    vi.mocked(ipc.readSessionFile).mockResolvedValue({ content: '<svg />', mimeType: 'image/svg+xml' })
    render(<SessionFileContent {...props} fileName="学习图表.svg" />)
    expect(await screen.findByTestId('svg')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 运行测试并确认组件缺失**

Run: `npx vitest run tests/session-file-content.test.tsx`

Expected: FAIL，无法加载 `SessionFileContent`。

- [ ] **Step 3: 实现带取消守卫的页内读取**

```tsx
import { useCallback, useEffect, useState } from 'react'
import { ipc } from '@/lib/ipc'
import { MarkdownRenderer } from '@/components/md/MarkdownRenderer'
import { SVGRenderer } from '@/components/SVGRenderer'

type Props = { dirName: string; sessionNumber: number; fileName: string; title: string; version?: number }

export function SessionFileContent({ dirName, sessionNumber, fileName, title, version = 0 }: Props) {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<{ loading: boolean; content: string | null; mimeType: string; error: string | null }>({ loading: true, content: null, mimeType: 'text/markdown', error: null })
  const retry = useCallback(() => setAttempt(value => value + 1), [])

  useEffect(() => {
    let cancelled = false
    setState(previous => ({ ...previous, loading: true, error: null }))
    ipc.readSessionFile({ dirName, sessionNumber, fileName })
      .then(result => {
        if (!cancelled) setState({ loading: false, content: result.content, mimeType: result.mimeType ?? 'text/markdown', error: null })
      })
      .catch(error => {
        if (!cancelled) setState(previous => ({ ...previous, loading: false, error: String(error?.message ?? error ?? '读取失败') }))
      })
    return () => { cancelled = true }
  }, [dirName, sessionNumber, fileName, attempt, version])

  if (state.loading) return <div data-testid="session-file-loading">正在读取记忆…</div>
  if (state.error) return <div role="alert"><p>{state.error}</p><button type="button" data-testid="session-file-retry" onClick={retry}>重试</button></div>
  if (!state.content) return <div data-testid="session-file-empty">这份文件没有正文。</div>
  if (fileName.endsWith('.svg')) return <SVGRenderer source={state.content} />
  if (state.mimeType.startsWith('image/')) return <img src={`data:${state.mimeType};base64,${state.content}`} alt={title} />
  return <MarkdownRenderer content={state.content} fileName={fileName} />
}
```

保留旧内容直到新读取成功，但读取中用明确的 loading 状态遮挡正文；失败不得清空其他页签、来源列或第二列。`version` 只用于寓言等异步产物完成后的强制刷新。

- [ ] **Step 4: 验证读取与主题适配**

Run: `npx vitest run tests/session-file-content.test.tsx tests/study-theme.test.tsx`

Expected: 新测试 PASS；旧正式学习测试尚未接新组件也应保持 PASS。

- [ ] **Step 5: 提交**

```bash
git add src/components/study/SessionFileContent.tsx tests/session-file-content.test.tsx
git commit -m "feat: add inline session file reader with retry"
```

### Task 4: 常驻学习第二列、分组树与进行中会话

**Files:**
- Create: `src/lib/study-navigation.ts`
- Create: `src/components/study/StudySourcePanel.tsx`
- Modify: `src/components/GuidePopover.tsx`
- Test: `tests/study-navigation.test.ts`
- Test: `tests/study-source-panel.test.tsx`
- Test: `tests/components/GuidePopover.test.tsx`

**Interfaces:**
- Consumes: Task 1 共享状态与动作、Task 2 视图模型、现有 `BriefingListColumn`、`ConfirmDialog`、`GuidePopover` 和分组 store actions。
- Produces: `withStudySaved(navigate): Promise<boolean>` 用于普通浏览；`withSessionReplaced(replace): Promise<boolean>` 用于新会话／恢复另一会话；`openStudyTopicFromTree(dirName: string, sessionNumber?: number): Promise<boolean>` 统一树与墙的主题导航；`StudySourcePanel(): JSX.Element` 供 `Briefing` 与 `Study` 同时复用。

- [ ] **Step 1: 写保存失败守护与树操作测试**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '@/store'
import { withSessionReplaced, withStudySaved } from '@/lib/study-navigation'

describe('withStudySaved', () => {
  beforeEach(() => { useStore.setState({ currentPage: 'study', toast: null }) })

  it('does not navigate when snapshot saving fails', async () => {
    const navigate = vi.fn()
    useStore.setState({ saveCurrentSession: vi.fn().mockRejectedValue(new Error('只读磁盘')), showToast: vi.fn() })
    await expect(withStudySaved(navigate)).resolves.toBe(false)
    expect(navigate).not.toHaveBeenCalled()
    expect(useStore.getState().showToast).toHaveBeenCalledWith(expect.stringContaining('只读磁盘'))
  })

  it('saves once before ordinary navigation', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const navigate = vi.fn()
    useStore.setState({ saveCurrentSession: save })
    await expect(withStudySaved(navigate)).resolves.toBe(true)
    expect(save).toHaveBeenCalledOnce()
    expect(navigate).toHaveBeenCalledOnce()
  })
})

it('saves a background session before replacing it from the briefing', async () => {
  const saveCurrentSession = vi.fn().mockResolvedValue(undefined)
  const replace = vi.fn()
  useStore.setState({ currentPage: 'briefing', saveCurrentSession })
  await expect(withSessionReplaced(replace)).resolves.toBe(true)
  expect(saveCurrentSession).toHaveBeenCalledOnce()
  expect(replace).toHaveBeenCalledOnce()
})
```

第二列组件测试至少包含：

```tsx
it('keeps collapse, expansion and selection as independent state', () => {
  render(<StudySourcePanel />)
  fireEvent.click(screen.getByTestId('study-group-toggle-default'))
  fireEvent.click(screen.getByTestId('study-topic-row-memory'))
  expect(useStore.getState().studyExpandedGroups.default).toBe(false)
  expect(useStore.getState().studySelectedDirName).toBe('memory')
  fireEvent.click(screen.getByTestId('briefing-list-column-toggle'))
  expect(useStore.getState().studyListCollapsed).toBe(true)
  expect(useStore.getState().studySelectedDirName).toBe('memory')
  expect(useStore.getState().studyExpandedGroups.default).toBe(false)
})

it('keeps the existing new-study and unfinished-session actions', () => {
  const openPreStudy = vi.fn()
  const restoreSession = vi.fn()
  useStore.setState({ openPreStudy, restoreSession })
  render(<StudySourcePanel />)
  fireEvent.click(screen.getByTestId('new-topic-button'))
  expect(openPreStudy).toHaveBeenCalledWith({ mode: 'progress', topic: '' })
  fireEvent.click(screen.getByTestId('continue-unsaved-button'))
  expect(restoreSession).toHaveBeenCalledWith(expect.objectContaining({ id: 'unfinished-1' }))
})
```

测试 fixture 必须含默认分组、`memory` 主题、两个 session 和 id 为 `unfinished-1` 的 `unsavedSessions`；对 IPC 的 mock 沿用 `tests/study-theme.test.tsx` 的完整基础 mock，避免初始化副作用。

- [ ] **Step 2: 运行测试并确认失败**

Run: `npx vitest run tests/study-navigation.test.ts tests/study-source-panel.test.tsx tests/components/GuidePopover.test.tsx`

Expected: FAIL，新导航helper与第二列组件尚不存在。

- [ ] **Step 3: 实现保存守护与导航目标函数**

```ts
import { useStore } from '@/store'

export async function withStudySaved(navigate: () => void | Promise<void>): Promise<boolean> {
  const state = useStore.getState()
  if (state.currentPage === 'study' && !(await saveStudySnapshot())) return false
  await navigate()
  return true
}

async function saveStudySnapshot(): Promise<boolean> {
  const state = useStore.getState()
  try {
    await state.saveCurrentSession()
    return true
  } catch (error) {
    state.showToast(`保存会话失败：${error instanceof Error ? error.message : String(error)}`)
    return false
  }
}

export async function withSessionReplaced(replace: () => void | Promise<void>): Promise<boolean> {
  if (!(await saveStudySnapshot())) return false
  await replace()
  return true
}

export async function openStudyTopicFromTree(dirName: string, sessionNumber?: number): Promise<boolean> {
  return withStudySaved(async () => {
    const state = useStore.getState()
    state.openStudyTopic(dirName, sessionNumber)
    await state.setBriefingSource('study')
    if (useStore.getState().currentPage !== 'briefing') await useStore.getState().goto('briefing')
  })
}
```

来源栏和返回按钮在后续任务也使用 `withStudySaved`，不得各自另写 catch 后继续导航的逻辑。

- [ ] **Step 4: 实现第二列并保留分组与进行中操作**

组件外壳固定为：

```tsx
<BriefingListColumn collapsed={studyListCollapsed} onToggle={toggleStudyList} theme={theme} width={80} title="学习">
  <button data-testid="new-topic-button" onClick={() => openPreStudy({ mode: 'progress', topic: '' })}>新学习</button>
  <input data-testid="study-topic-search" value={studySearchQuery} onChange={event => setStudySearchQuery(event.target.value)} placeholder="搜索主题……" />
  <StudyUnsavedSessions />
  <StudyGroupTree />
</BriefingListColumn>
```

`StudyUnsavedSessions` 和 `StudyGroupTree` 可以是同文件内的非导出组件。树使用 `mergePendingArchives(library, pendingArchives)`，对每个分组按以下规则派生可见主题：组名命中搜索时展示该组全部主题，否则调用 `filterStudyTopics(merged, group.id, studySearchQuery)`；组名和主题均不命中时隐藏该组，空搜索仍展示真实空组。

每行操作固定为：

```tsx
<button data-testid={`study-group-toggle-${group.id}`} aria-label={`${expanded ? '收起' : '展开'}${group.name}`} onClick={() => toggleStudyGroup(group.id)}>{expanded ? '▾' : '▸'}</button>
<button data-testid={`group-tab-${group.id}`} onClick={() => { setActiveGroup(group.id); openStudyWall() }}>{group.name}</button>
<button data-testid={`study-topic-toggle-${topic.dirName}`} onClick={() => toggleStudyTopic(topic.dirName)}>会话</button>
<button data-testid={`study-topic-row-${topic.dirName}`} onClick={() => void openStudyTopicFromTree(topic.dirName)}>{topic.title}</button>
```

「全部」按钮保留 `data-testid="group-tab-all"`，点击 `setActiveGroup(null)` 并 `openStudyWall()`。Session 行点击 `openStudyTopicFromTree(topic.dirName, session.sessionNumber)`，显示第 N 次、日期与 pending／review 状态。

分组的创建、重命名、解散直接调用 `createGroup`、`renameGroup`、`deleteGroup`；保留 `group-rename-input`、`create-group-button`、`group-delete-button` 选择器和原确认文案。`GuidePopover` 继续复用两张演示图，只把「左侧新主题推荐」「长按主题卡片」更新为新学习墙语境；Esc、resize、外部点击逻辑不改。

进行中卡片的继续通过 `withSessionReplaced(() => restoreSession(unsaved))`，确保从简报恢复另一会话时也先保存后台最新内容；焚毁保持：

```ts
burnLiveSession(unsaved.id)
removeUnsavedSession(unsaved.id)
```

- [ ] **Step 5: 验证第二列与既有分组纯逻辑**

Run: `npx vitest run tests/study-navigation.test.ts tests/study-source-panel.test.tsx tests/components/GuidePopover.test.tsx tests/state-library.test.ts`

Expected: PASS；折叠不重置展开和选择，全部／组名／chevron 不相互误触。

- [ ] **Step 6: 提交**

```bash
git add src/lib/study-navigation.ts src/components/study/StudySourcePanel.tsx src/components/GuidePopover.tsx tests/study-navigation.test.ts tests/study-source-panel.test.tsx tests/components/GuidePopover.test.tsx
git commit -m "feat: add persistent study tree and safe navigation"
```

### Task 5: 学习专辑墙与推荐／旧首页控制迁移

**Files:**
- Create: `src/components/study/StudyTopicCard.tsx`
- Create: `src/components/study/StudyWall.tsx`
- Modify: `src/components/album-wall/AlbumWall.tsx`
- Test: `tests/study-wall-view.test.tsx`
- Test: `tests/study-recommendations.test.tsx`
- Test: `tests/strategy-toggle-theme.test.tsx`
- Test: `tests/components/Quote.test.tsx`

**Interfaces:**
- Consumes: Task 2 视图模型、Task 4 `openStudyTopicFromTree`、`AlbumWall`、`AlbumGrid`、`AlbumGroupSection`、`AlbumCard`、`Quote`、`StudyControlsGroup`、既有推荐组件。
- Produces: `StudyTopicCard` 主题卡；`StudyWall` 学习墙。保留第二列唯一的 `new-topic-button`，并保留 `home-greeting`、`quote-*`、`demo-info-*`、`wild-card-*`、`group-rec-*`、`topic-card` 选择器。

- [ ] **Step 1: 写推荐刷新与旧首页能力迁移测试**

```tsx
it('refreshes a wildcard without opening its recommendation', () => {
  const refreshWildcardInspiration = vi.fn()
  const onClickTopic = vi.fn()
  useStore.setState({
    briefingTheme: 'academic',
    wildcardInspiration: { topic: '量子烹饪学', hook: '粒子对撞机' },
    wildcardLoading: false,
    wildcardError: null,
    refreshWildcardInspiration,
  })
  render(<WildCardRecCard onClickTopic={onClickTopic} />)
  fireEvent.click(screen.getByTestId('wild-card-refresh'))
  expect(refreshWildcardInspiration).toHaveBeenCalledOnce()
  expect(onClickTopic).not.toHaveBeenCalled()
})

it('uses the selected strategy on manual group refresh and skips auto debounce', async () => {
  vi.mocked(ipc.llmGroupInspiration).mockResolvedValue({ topic: '新联结', hook: '新钩子' })
  const onClickTopic = vi.fn()
  useStore.setState({ inspirationStrategy: 'v3', groupInspirations: { default: { topic: '旧联结', hook: '旧钩子' } } })
  render(<GroupRecCard group={{ id: 'default', name: '默认', color: '#d97757' }} topics={[{ dirName: 'memory', title: '记忆' }]} onClickTopic={onClickTopic} />)
  fireEvent.click(screen.getByTestId('group-rec-refresh'))
  await waitFor(() => expect(ipc.llmGroupInspiration).toHaveBeenCalledWith({ groupName: '默认', topics: [{ dirName: 'memory', title: '记忆' }], strategy: 'v3' }))
  expect(onClickTopic).not.toHaveBeenCalled()
})
```

在 `strategy-toggle-theme.test.tsx` 添加真实 store 的 `v1 → v2 → v3 → v1` 点击测试，并断言 `ipc.patchState({ inspirationStrategy: next })`。在 `study-wall-view.test.tsx` 断言问候、`Quote`、两个说明按钮、推荐区与 12 张主题卡同时存在；搜索和分组过滤只改变显示集合，不得出现分页按钮。

- [ ] **Step 2: 运行测试并确认学习墙尚未实现**

Run: `npx vitest run tests/study-wall-view.test.tsx tests/study-recommendations.test.tsx tests/strategy-toggle-theme.test.tsx tests/components/Quote.test.tsx`

Expected: FAIL，学习墙组件与新增断言尚未满足。

- [ ] **Step 3: 实现主题排版卡和专辑墙结构**

把 `AlbumWall.domain` 联合类型增加 `'study'`，不改变现有四种 domain。主题卡使用：

```tsx
<AlbumCard
  testId="topic-card"
  title={topic.title}
  onOpen={() => onOpen(topic)}
  fallback={<div aria-hidden="true" className="absolute inset-0" style={{ background: `linear-gradient(145deg, ${group.color}55, #17110d)` }}><div className="absolute left-[18%] top-[16%] h-24 w-24 rounded-full border border-parchment/25"><span className="absolute -right-1 top-8 h-2 w-2 rounded-full" style={{ backgroundColor: group.color }} /></div></div>}
  topLeft={<span>{group.name}</span>}
  topRight={isLive ? <span>进行中</span> : !latest ? <span>暂无记录</span> : latest.hasReview ? <span>已复习</span> : <span>待复习</span>}
  meta={<span>{topic.sessionCount} 次 · {topic.last_studied_days === 0 ? '今天' : `${topic.last_studied_days} 天前`}</span>}
  hoverMeta={<span>继续学习或打开最近报告</span>}
/>
```

`StudyTopicCard` 的外层 `div` 保留 `data-testid="topic-card"` 的唯一归属：若 `AlbumCard` 已输出该 test id，外层只附加 `data-topic-dir={topic.dirName}`，避免重复选择器。卡片快捷按钮调用 `openPreStudy`：继续使用 `mode: 'progress'`，复习使用 `mode: 'review'`，均带 `topic.title` 与 `dirName`。pending session 存在时卡片显示「归档中」，但不屏蔽打开主题主页。

学习墙固定结构：

```tsx
<AlbumWall domain="study" testId="study-wall" toolbar={<StudyWallHeader />}>
  <StudyRecommendationSection />
  <StudyUnsavedBanner />
  {visibleGroups.map(group => (
    <AlbumGroupSection key={group.id} groupKey={group.id} testIdPrefix="study" label={group.name} count={groupTopics.length} collapsed={!(studyExpandedGroups[group.id] ?? true)} onToggle={() => toggleStudyGroup(group.id)}>
      <AlbumGrid minWidth={190} testId={`study-group-grid-${group.id}`}>
        {groupTopics.map(topic => <StudyTopicCard key={topic.dirName} topic={topic} group={group} onOpen={selected => void openStudyTopicFromTree(selected.dirName)} />)}
      </AlbumGrid>
    </AlbumGroupSection>
  ))}
</AlbumWall>
```

`StudyWallHeader` 包含 `home-greeting`、`StudyControlsGroup surface="home"`、复习说明和图表说明；正文顶部渲染 `Quote surface="home"`，因此 original、作者／来源和换一句逻辑不需要重写。两个 Demo 弹层沿用 `openNote` 与 `anchorRef` 模式。

`StudyRecommendationSection` 包含 `StrategyToggle`、一张 `WildCardRecCard` 和 `selectRecommendationGroups` 返回的 `GroupRecCard`。全局最多两组，当前组最多一组；点击均打开准备弹层并带当前分组。若 `wildcardInspiration` 或 `groupInspirations[group.id]` 已经 `recommendationExistsInLibrary`，当前推荐位不渲染该卡，但不得删除缓存或过滤正式主题卡。

- [ ] **Step 4: 实现空库、空组、无结果与推荐失败隔离**

空库和空组仍在 `StudyWall` 内渲染推荐与说明，并显示 `study-wall-new-topic-button`；第二列的 `new-topic-button` 始终唯一存在，两个按钮调用相同 `openPreStudy` 参数。搜索无结果显示「清除搜索」按钮并调用 `setStudySearchQuery('')`。推荐组件自己的 loading／error 只占推荐区，不在外层用 early return 隐藏主题墙。

从分组或推荐发起时，`activeGroupId` 已经是 `PreStudyModal` 的既有默认来源；不要另写 `groupId` 持久字段。全局推荐在没有当前组时由准备弹层使用 `default`。

- [ ] **Step 5: 验证推荐与 Quote 回归**

Run: `npx vitest run tests/study-wall-view.test.tsx tests/study-recommendations.test.tsx tests/strategy-toggle-theme.test.tsx tests/group-rec-card-theme.test.tsx tests/components/Quote.test.tsx tests/quotes.test.ts tests/store.test.ts`

Expected: PASS，包括 wildcard 并发 request guard、策略持久化、Quote 排除当前 id 与推荐 refresh 不冒泡。

- [ ] **Step 6: 提交**

```bash
git add src/components/study/StudyTopicCard.tsx src/components/study/StudyWall.tsx src/components/album-wall/AlbumWall.tsx tests/study-wall-view.test.tsx tests/study-recommendations.test.tsx tests/strategy-toggle-theme.test.tsx tests/components/Quote.test.tsx
git commit -m "feat: build study album wall without losing recommendations"
```

### Task 6: 保留 GravityField 的主题卡拖拽

**Files:**
- Create: `src/components/study/useStudyGravityDrag.ts`
- Modify: `src/components/study/StudyWall.tsx`
- Modify: `src/components/study/StudyTopicCard.tsx`
- Test: `tests/study-gravity-drag.test.tsx`

**Interfaces:**
- Consumes: 现有 `groups`、`library`、`gravityFieldOpen`、`setGravityFieldOpen`、`setDraggingTopic`、`moveTopicToGroup`。
- Produces: `useStudyGravityDrag(): { dragState: StudyDragState | null; beginDrag: (topic: TopicMeta, x: number, y: number) => void }`。

- [ ] **Step 1: 写 6px 激活、吸附、取消和失败回滚测试**

```tsx
it('activates only after six pixels and moves only near a satellite', async () => {
  window.innerWidth = 1000
  window.innerHeight = 800
  const moveTopicToGroup = vi.fn().mockResolvedValue(undefined)
  useStore.setState({ groups: [{ id: 'default', name: '默认', color: '#d97757' }], moveTopicToGroup, gravityFieldOpen: false })
  const { result } = renderHook(() => useStudyGravityDrag())
  act(() => result.current.beginDrag(topic, 100, 100))
  fireEvent.mouseMove(window, { clientX: 105, clientY: 100 })
  expect(useStore.getState().gravityFieldOpen).toBe(false)
  fireEvent.mouseMove(window, { clientX: 107, clientY: 100 })
  expect(useStore.getState().gravityFieldOpen).toBe(true)
  fireEvent.mouseUp(window, { clientX: 500, clientY: 160 })
  await waitFor(() => expect(moveTopicToGroup).toHaveBeenCalledWith('memory', 'default'))
})

it.each(['Escape', 'far-away', 'write-failure'])('leaves mapping unchanged for %s', async scenario => {
  const moveTopicToGroup = vi.fn().mockRejectedValue(new Error('只读分组文件'))
  useStore.setState({ groupMapping: { memory: 'old' }, moveTopicToGroup, showToast: vi.fn() })
  const { result } = renderHook(() => useStudyGravityDrag())
  act(() => result.current.beginDrag(topic, 100, 100))
  fireEvent.mouseMove(window, { clientX: 120, clientY: 120 })
  if (scenario === 'Escape') fireEvent.keyDown(window, { key: 'Escape' })
  else if (scenario === 'far-away') fireEvent.mouseUp(window, { clientX: 20, clientY: 780 })
  else fireEvent.mouseUp(window, { clientX: 500, clientY: 160 })
  expect(useStore.getState().groupMapping.memory).toBe('old')
  if (scenario !== 'write-failure') expect(moveTopicToGroup).not.toHaveBeenCalled()
})
```

每组几何仍用 `center=(window.innerWidth/2, window.innerHeight/2)`、`radius=min(width,height)*0.3`、`angle=2πi/count-π/2`；测试中的单组目标是 `(500,160)`，即 `center=(500,400)` 向上偏移 `radius=240`。

- [ ] **Step 2: 运行拖拽测试并确认失败**

Run: `npx vitest run tests/study-gravity-drag.test.tsx`

Expected: FAIL，hook 尚不存在。

- [ ] **Step 3: 从旧 StudyLibrary 原样提取拖拽算法**

```ts
export type StudyDragState = {
  topic: TopicMeta
  startX: number
  startY: number
  currentX: number
  currentY: number
  active: boolean
}

function nearestGroupAt(x: number, y: number, groups: Group[]): { id: string; distance: number } | null {
  if (groups.length === 0) return null
  const centerX = window.innerWidth / 2
  const centerY = window.innerHeight / 2
  const radius = Math.min(window.innerWidth, window.innerHeight) * 0.3
  return groups.map((group, index) => {
    const angle = (2 * Math.PI * index) / groups.length - Math.PI / 2
    const groupX = centerX + radius * Math.cos(angle)
    const groupY = centerY + radius * Math.sin(angle)
    return { id: group.id, distance: Math.hypot(x - groupX, y - groupY) }
  }).sort((a, b) => a.distance - b.distance)[0]
}
```

Hook 在 mousemove 满足 `Math.hypot(event.clientX - startX, event.clientY - startY) > 6` 时打开场并设置 dragging topic；mouseup 时先关闭场和清除 dragging topic，再仅在 `nearest.distance < 72` 时 `await moveTopicToGroup`。捕获写回异常并 `showToast(\`换组失败：${message}\`)`，不做乐观 mapping 修改。Esc、resize 和 unmount 都走同一个 cancel cleanup，移除 window listeners。

- [ ] **Step 4: 把卡片和墙接回同一个 GravityField**

卡片外层 `onMouseDown` 只接受主键且忽略 `button/input` 原点，调用 `beginDrag(topic,event.clientX,event.clientY)`。墙在场打开时渲染：

```tsx
<GravityField groups={groups} topics={library} draggingTopic={dragState?.topic ?? null} dragPosition={dragState ? { x: dragState.currentX, y: dragState.currentY } : null} />
```

`topics={library}` 继续排除归档主题；不要在第二列加第二套拖拽。

- [ ] **Step 5: 验证并提交**

Run: `npx vitest run tests/study-gravity-drag.test.tsx tests/study-wall-view.test.tsx tests/state-library.test.ts`

Expected: PASS；无效目标、Esc、resize、空分组和写回失败均不改 `groupMapping`。

```bash
git add src/components/study/useStudyGravityDrag.ts src/components/study/StudyWall.tsx src/components/study/StudyTopicCard.tsx tests/study-gravity-drag.test.tsx
git commit -m "feat: preserve satellite gravity drag on study cards"
```

### Task 7: 主题继续、内联重命名、归档与新报告补看

**Files:**
- Create: `src/components/study/useStudyTopicActions.ts`
- Modify: `src/components/study/StudyTopicCard.tsx`
- Modify: `src/components/study/StudySourcePanel.tsx`
- Modify: `src/store/index.ts`
- Test: `tests/study-topic-actions.test.tsx`
- Test: `tests/settings.test.tsx`

**Interfaces:**
- Consumes: 现有 `openPreStudy`、`renameTopic`、`archiveTopic`、`pendingReports`、`dismissPendingReport`、`showToast`。
- Produces: `useStudyTopicActions(topic: TopicMeta)`，返回继续、复习、重命名状态与提交／取消、归档、pending report viewer 的完整动作。

- [ ] **Step 1: 写旧交互语义的失败测试**

```tsx
it('keeps Enter, Escape, blur and empty rename behavior', async () => {
  const renameTopic = vi.fn().mockResolvedValue(undefined)
  useStore.setState({ renameTopic, showToast: vi.fn() })
  render(<StudyTopicCard topic={topic} group={defaultGroup} onOpen={vi.fn()} />)
  fireEvent.click(screen.getByTestId('topic-rename-action'))
  const input = screen.getByTestId('topic-rename-input')
  fireEvent.change(input, { target: { value: '  新名字  ' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  await waitFor(() => expect(renameTopic).toHaveBeenCalledWith('memory', '新名字'))

  fireEvent.click(screen.getByTestId('topic-rename-action'))
  fireEvent.change(screen.getByTestId('topic-rename-input'), { target: { value: '不会提交' } })
  fireEvent.keyDown(screen.getByTestId('topic-rename-input'), { key: 'Escape' })
  expect(renameTopic).toHaveBeenCalledOnce()

  fireEvent.click(screen.getByTestId('topic-rename-action'))
  fireEvent.change(screen.getByTestId('topic-rename-input'), { target: { value: '   ' } })
  fireEvent.blur(screen.getByTestId('topic-rename-input'))
  expect(renameTopic).toHaveBeenCalledOnce()
})

it('opens and dismisses only the selected pending report', () => {
  const dismissPendingReport = vi.fn()
  useStore.setState({ pendingReports: { memory: report, other: otherReport }, dismissPendingReport })
  render(<StudyTopicCard topic={topic} group={defaultGroup} onOpen={vi.fn()} />)
  fireEvent.click(screen.getByTestId('topic-pending-report-badge'))
  expect(screen.getByTestId('archive-report-modal')).toBeInTheDocument()
  fireEvent.click(screen.getByTestId('archive-report-close'))
  expect(dismissPendingReport).toHaveBeenCalledWith('memory')
  expect(useStore.getState().pendingReports.other).toBe(otherReport)
})
```

补充归档成功／失败 Toast 和继续学习参数断言；不得新增「删除主题」按钮。

- [ ] **Step 2: 运行测试并确认失败**

Run: `npx vitest run tests/study-topic-actions.test.tsx tests/settings.test.tsx`

Expected: FAIL，主题动作 hook 与新报告入口尚未接入。

- [ ] **Step 3: 实现共享主题动作 hook**

```ts
export function useStudyTopicActions(topic: TopicMeta) {
  const openPreStudy = useStore(state => state.openPreStudy)
  const renameTopic = useStore(state => state.renameTopic)
  const archiveTopic = useStore(state => state.archiveTopic)
  const dismissPendingReport = useStore(state => state.dismissPendingReport)
  const showToast = useStore(state => state.showToast)
  const pendingReport = useStore(state => state.pendingReports[topic.dirName] ?? topic.pendingReport)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [reportOpen, setReportOpen] = useState(false)

  const continueStudy = () => openPreStudy({ mode: 'progress', topic: topic.title, dirName: topic.dirName })
  const reviewTopic = () => openPreStudy({ mode: 'review', topic: topic.title, dirName: topic.dirName })
  const startRename = () => { setRenameValue(topic.title); setRenaming(true) }
  const cancelRename = () => setRenaming(false)
  const submitRename = async () => {
    const nextName = renameValue.trim()
    setRenaming(false)
    if (!nextName || nextName === topic.title) return
    try {
      await renameTopic(topic.dirName, nextName)
      showToast(`已更名为「${nextName}」`)
    } catch (error) {
      showToast(`重命名失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }
  const archive = async () => {
    try {
      await archiveTopic(topic.dirName)
      showToast(`「${topic.title}」已归档，可在设置中恢复`)
    } catch (error) {
      showToast(`归档失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }
  const closePendingReport = () => { dismissPendingReport(topic.dirName); setReportOpen(false) }
  return { continueStudy, reviewTopic, renaming, renameValue, setRenameValue, startRename, cancelRename, submitRename, archive, pendingReport, reportOpen, openPendingReport: () => setReportOpen(true), closePendingReport }
}
```

保留 `renameTopic` 内部原有目录改名、frontmatter 更新、分组映射与推荐缓存迁移，不在 hook 重复实现。

`renameTopic` 成功后若 `studySelectedDirName === dirName`，同步把选择改为 `newName`，保留选中的 sessionNumber；这样主题主页不会因目录键变化被误送回墙。原 IPC 与推荐缓存迁移逻辑不变。

- [ ] **Step 4: 接入主题卡和第二列**

主题卡「更多」菜单保留 `topic-continue-button`、`topic-rename-action`、`topic-archive-action` 与 `topic-pending-report-badge`。重命名输入 Enter 调 `submitRename`，Esc 和 blur 调 `cancelRename`；鼠标事件 `stopPropagation`，不得触发开卡或拖拽。

`pendingReport && reportOpen` 时渲染原 `ArchiveReportModal`，关闭只调用 `closePendingReport`。第二列对应主题行也显示同一个新报告徽标，点击先选择该主题，再由主题卡／主页查看报告；不能自动 dismiss。

归档后 `rescanLibrary` 继续依据 `archivedTopics` 过滤，墙与树自然消失；设置页 `restoreTopic` 不做任何改动。

- [ ] **Step 5: 验证并提交**

Run: `npx vitest run tests/study-topic-actions.test.tsx tests/settings.test.tsx tests/state-library.test.ts tests/study-wall-view.test.tsx`

Expected: PASS；归档恢复、重命名键行为、pending 报告隔离与继续学习均符合旧语义。

```bash
git add src/components/study/useStudyTopicActions.ts src/components/study/StudyTopicCard.tsx src/components/study/StudySourcePanel.tsx src/store/index.ts tests/study-topic-actions.test.tsx tests/settings.test.tsx
git commit -m "feat: preserve topic rename archive and report actions"
```

### Task 8: 主题主页、历史 Session、复习与删除确认

**Files:**
- Create: `src/components/study/StudyTopicBoard.tsx`
- Modify: `src/store/index.ts`
- Test: `tests/study-topic-board.test.tsx`
- Test: `tests/session-file-content.test.tsx`

**Interfaces:**
- Consumes: Task 1 选择状态、Task 2 `latestSession`／pending 合并、Task 3 文件视图、Task 7 主题动作、现有 `ReviewFlash`、`ConfirmDialog`、`FableStyleDialog`。
- Produces: `StudyTopicBoard(): JSX.Element`；五页签文件解析与 session 选择契约。

- [ ] **Step 1: 写默认最近报告、历史切换和删除范围测试**

```tsx
it('defaults to the latest session and synchronizes historical selection with tabs', async () => {
  useStore.setState({ studySelectedDirName: 'memory', studySelectedSessionNumber: null, studyTopicTab: 'report' })
  render(<StudyTopicBoard />)
  expect(screen.getByTestId('study-session-row-2')).toHaveAttribute('aria-current', 'true')
  expect(screen.getByTestId('study-topic-tab-report')).toHaveAttribute('aria-selected', 'true')
  fireEvent.click(screen.getByTestId('study-session-row-1'))
  expect(useStore.getState().studySelectedSessionNumber).toBe(1)
  fireEvent.click(screen.getByTestId('study-topic-tab-transcript'))
  expect(useStore.getState().studyTopicTab).toBe('transcript')
})

it('deletes only the selected session after listing its attachments', () => {
  const deleteArchivedSession = vi.fn().mockResolvedValue(undefined)
  useStore.setState({ deleteArchivedSession, studySelectedDirName: 'memory', studySelectedSessionNumber: 1 })
  render(<StudyTopicBoard />)
  fireEvent.click(screen.getByTestId('delete-session-button'))
  expect(screen.getByText(/学习报告\.md/)).toBeInTheDocument()
  expect(screen.getByText(/寓言\.md/)).toBeInTheDocument()
  fireEvent.click(screen.getByText('确认注销'))
  expect(deleteArchivedSession).toHaveBeenCalledWith('memory', 1)
})
```

还需断言：pending session 默认显示「整理中」而不是读取空报告；读取失败显示 Task 3 重试；有复习文件时显示记录，无文件时显示复习入口；没有独立删除主题操作。

- [ ] **Step 2: 运行测试并确认主题主页缺失**

Run: `npx vitest run tests/study-topic-board.test.tsx tests/session-file-content.test.tsx`

Expected: FAIL，`StudyTopicBoard` 尚不存在。

- [ ] **Step 3: 实现 session 解析与五类文件映射**

```ts
const tabFileName = (tab: StudyTopicTab, session: SessionMeta): string | undefined => {
  if (tab === 'report') return session.reportFile
  if (tab === 'transcript') return session.transcriptFile
  if (tab === 'diagram') return session.diagramFile
  if (tab === 'fable') return session.fableFile
  return session.reviewFile
}

const selectedSession = topic.sessions.find(session => session.sessionNumber === studySelectedSessionNumber) ?? latestSession(topic)
```

若 `studySelectedDirName` 指向已归档／不存在的主题，先渲染可恢复的空态，并在 `useEffect` 中调用 `openStudyWall`，不得在 render 期间写 store。Session 时间线与第二列都调用 `openStudyTopic(dirName, sessionNumber)`；主题卡／名称默认 `sessionNumber` 缺省，因此总是最近 session。

页签使用 `role="tablist"`，每个按钮 `role="tab"`、`aria-selected`、`data-testid="study-topic-tab-${tab}"`。有文件时：

主题主页根节点固定 `data-testid="study-topic-board"`，文件与空态共同容器固定 `data-testid="study-topic-content"`，供迁移后的 E2E 使用。

```tsx
<div data-testid="study-topic-content"><SessionFileContent dirName={topic.dirName} sessionNumber={selectedSession.sessionNumber} fileName={fileName} title={`${topic.title} · 第 ${selectedSession.sessionNumber} 次`} /></div>
```

无文件时保留双列和页签，在正文显示对应空态；pending 报告不调用 `readSessionFile`。

- [ ] **Step 4: 接入复习、ReviewFlash 与 session 删除**

复习按钮先设置 `reviewFlash={title,date,topic,dirName}`，`ReviewFlash.onComplete` 再执行：

```ts
openPreStudy({ mode: 'review', topic: topic.title, dirName: topic.dirName })
setReviewFlash(null)
```

删除附件列表按旧顺序生成：`hasReport` 加 `学习报告.md`，`hasFable` 加 `寓言.md` 或 `寓言(×N).md`，`hasDiagram` 加 `学习图表.svg`。`ConfirmDialog` 标题「注销谈话记录」、确认「确认注销」、危险文案「不可撤销。没有副本。没有备份。」保持不变。确认后 `await deleteArchivedSession(dirName, sessionNumber)`，关闭弹层；若删除的是当前选择，清空 session 选择并回退最近仍存在的 session。

主题头部继续、复习、重命名、归档和 pending 报告复用 Task 7 hook，不复制一套 IPC 行为。

- [ ] **Step 5: 验证并提交**

Run: `npx vitest run tests/study-topic-board.test.tsx tests/session-file-content.test.tsx tests/study-topic-actions.test.tsx tests/study-source-panel.test.tsx`

Expected: PASS；主题与 session 选择同步，五页签可读取，复习和删除语义不混淆。

```bash
git add src/components/study/StudyTopicBoard.tsx src/store/index.ts tests/study-topic-board.test.tsx tests/session-file-content.test.tsx
git commit -m "feat: add study topic workspace and session history"
```

### Task 9: 图表与寓言的共享后台任务

**Files:**
- Create: `src/lib/study-artifacts.ts`
- Modify: `src/store/index.ts`
- Modify: `src/components/study/StudyTopicBoard.tsx`
- Modify: `src/lib/finalize.ts`
- Test: `tests/study-artifacts.test.ts`
- Test: `tests/study-artifact-tasks.test.ts`
- Test: `tests/study-topic-board.test.tsx`

**Interfaces:**
- Consumes: `readSessionFile`、`llmGenerateDiagram`、`llmGenerateFableFromReport`、`writeFable`、`rescanLibrary`、`FableStyleDialog`。
- Produces: `studyArtifactKey`、`buildFableUserPrompt`；store 的 `studyDiagramTasks`、`studyFableTasks`、`studyArtifactVersions`、`generateStudyDiagram`、`generateStudyFable`。

- [ ] **Step 1: 写纯 prompt、任务防重入和跨页面完成测试**

```ts
describe('study artifact helpers', () => {
  it('builds the same fable prompt combinations as the old library', () => {
    expect(buildFableUserPrompt(['寓言', '讽刺'], '主角是图书管理员')).toBe('风格：寓言、讽刺。主角是图书管理员')
    expect(buildFableUserPrompt(['寓言'], '   ')).toBe('风格：寓言')
    expect(buildFableUserPrompt([], '主角是图书管理员')).toBe('主角是图书管理员')
    expect(buildFableUserPrompt([], '   ')).toBeUndefined()
  })
})

it('keeps a diagram task visible while another topic is selected', async () => {
  let finish!: (value: void) => void
  vi.mocked(ipc.llmGenerateDiagram).mockImplementation(() => new Promise<void>(resolve => { finish = resolve }))
  vi.mocked(ipc.readSessionFile).mockResolvedValue({ content: '# 报告', mimeType: 'text/markdown' })
  const promise = useStore.getState().generateStudyDiagram('memory', 2)
  expect(useStore.getState().studyDiagramTasks['memory:s2']).toBe(true)
  useStore.getState().openStudyTopic('other', 1)
  finish()
  await promise
  expect(useStore.getState().studyDiagramTasks['memory:s2']).toBeUndefined()
  expect(useStore.getState().studyArtifactVersions['memory:s2']).toBe(1)
})
```

另写重复点击只调用一次 IPC、无报告 Toast、读取／生成失败清 task 但不增加 version、寓言成功保存上次标签与刷新版本的测试。`rescanLibrary` mock 必须保留当前测试 fixture，避免异步完成后 library 被意外清空。

- [ ] **Step 2: 运行测试并确认失败**

Run: `npx vitest run tests/study-artifacts.test.ts tests/study-artifact-tasks.test.ts tests/study-topic-board.test.tsx`

Expected: FAIL，helper 和共享任务 action 尚不存在。

- [ ] **Step 3: 实现纯 helper 与 store 任务状态**

```ts
export function studyArtifactKey(dirName: string, sessionNumber: number): string {
  return `${dirName}:s${sessionNumber}`
}

export function stripFrontmatter(content: string): string {
  const match = content.match(/^---\n[\s\S]*?\n---\n?/)
  return match ? content.slice(match[0].length) : content
}

export function buildFableUserPrompt(tags: string[], description: string): string | undefined {
  const tagsText = tags.join('、')
  const detail = description.trim()
  if (tagsText && detail) return `风格：${tagsText}。${detail}`
  if (tagsText) return `风格：${tagsText}`
  return detail || undefined
}
```

在 store 增加：

```ts
studyDiagramTasks: Record<string, true>
studyFableTasks: Record<string, true>
studyArtifactVersions: Record<string, number>
generateStudyDiagram: (dirName: string, sessionNumber: number) => Promise<void>
generateStudyFable: (args: { dirName: string; sessionNumber: number; selectedTags: string[]; description: string }) => Promise<void>
```

`generateStudyDiagram` 的完整顺序为：key 防重入；从当前 `library` 找 reportFile，无报告则 Toast 并返回；设置 task；`readSessionFile`；`llmGenerateDiagram`；`await rescanLibrary()`；对应 version 加 1；catch 只 Toast「图表生成失败」；finally 删除同一个 key。

`generateStudyFable` 的顺序为：key 防重入；`setLastFableTags(selectedTags)`；找 reportFile；设置 task；读取并 `stripFrontmatter`；以 `session.title || dirName` 为 topic、`buildFableUserPrompt` 为 userPrompt 调 `llmGenerateFableFromReport({ reportBody, topic, userPrompt })`；`writeFable`；`rescanLibrary`；version 加 1；成功 Toast 使用寓言标题；失败 Toast 带真实错误；finally 删除 key。失败路径不写空文件、不增加 version。`writeFable` 继续使用现有 `寓言.md` 覆写通道，成功后按重扫后的 `fableFile` 和 version 重新读取。

- [ ] **Step 4: 接入主题页签与风格弹层**

图表页签在 task 为 true 时显示「生成中…」并禁用重复按钮；有旧图时仍渲染旧图，等待标记不删除内容。无图且有报告时显示 `generate-diagram-button`。寓言页签同样区分空态、生成中和已有寓言；生成／重新生成打开原 `FableStyleDialog`，传入：

```tsx
<FableStyleDialog
  open={styleDialogOpen}
  tags={fableStyleTags}
  defaultSelected={lastFableTags}
  onClose={() => setStyleDialogOpen(false)}
  onConfirm={(selectedTags, description) => {
    setStyleDialogOpen(false)
    void generateStudyFable({ dirName: topic.dirName, sessionNumber: selectedSession.sessionNumber, selectedTags, description })
  }}
/>
```

保留自定义标签增删、补充描述、取消与遮罩点击；生成中按钮不再提供只隐藏 spinner 的伪取消。`SessionFileContent.version={studyArtifactVersions[studyArtifactKey(topic.dirName, selectedSession.sessionNumber)] ?? 0}` 确保当前打开的寓言／图表成功后刷新。

- [ ] **Step 5: 让归档后的自动图表进入同一任务状态**

在 `finalize.ts` 的 progress 分支中，把直接 fire-and-forget `ipc.llmGenerateDiagram` 移到首次 `await rescanLibrary()` 之后，并改为：

```ts
void useStore.getState().generateStudyDiagram(dirName, sessionNumber)
```

这样 action 能从重扫后的 library 找到新 reportFile，图表失败仍不阻塞报告归档；不得 await 它而拖慢 `ArchiveReportModal`。

- [ ] **Step 6: 验证并提交**

Run: `npx vitest run tests/study-artifacts.test.ts tests/study-artifact-tasks.test.ts tests/study-topic-board.test.tsx tests/archive.test.ts tests/store.test.ts`

Expected: PASS；跨主题任务状态、旧版本保留、寓言 prompt 与归档自动图表均无回归。

```bash
git add src/lib/study-artifacts.ts src/store/index.ts src/components/study/StudyTopicBoard.tsx src/lib/finalize.ts tests/study-artifacts.test.ts tests/study-artifact-tasks.test.ts tests/study-topic-board.test.tsx
git commit -m "feat: preserve background diagram and fable generation"
```

### Task 10: 简报学习来源集成与准备流程衔接

**Files:**
- Modify: `src/pages/Briefing.tsx`
- Modify: `src/components/BriefingSourceSidebar.tsx`
- Modify: `src/components/PreStudyModal.tsx`
- Modify: `src/store/index.ts`
- Test: `tests/briefing-study-source.test.tsx`
- Test: `tests/store.test.ts`
- Test: `tests/briefing-sidebar.test.tsx`

**Interfaces:**
- Consumes: Task 4 `StudySourcePanel`／`withSessionReplaced`、Task 5 `StudyWall`、Task 8 `StudyTopicBoard`。
- Produces: `source === 'study'` 的完整三栏分支；开始 session 时持久化 `briefingSource: 'study'`。

- [ ] **Step 1: 写学习来源渲染与新会话来源恢复测试**

```tsx
it('renders the shared study tree and wall for the study source', () => {
  useStore.setState({ briefingSource: 'study', studySelectedDirName: null })
  render(<Briefing />)
  expect(screen.getByTestId('briefing-source-sidebar')).toBeInTheDocument()
  expect(screen.getByTestId('study-topic-search')).toBeInTheDocument()
  expect(screen.getByTestId('study-wall')).toBeInTheDocument()
})

it('renders the selected topic workspace without remounting the source tree', () => {
  useStore.setState({ briefingSource: 'study', studySelectedDirName: 'memory', studySelectedSessionNumber: 2 })
  const { rerender } = render(<Briefing />)
  const tree = screen.getByTestId('study-topic-search')
  expect(screen.getByTestId('study-topic-board')).toBeInTheDocument()
  rerender(<Briefing />)
  expect(screen.getByTestId('study-topic-search')).toBe(tree)
})
```

在 `tests/store.test.ts` 添加：`startSession` 后 `briefingSource === 'study'`，`ipc.patchState` 同时收到 session_count 和来源；已有「清理外部资料／中止旧流」断言不得删除。

在 `tests/briefing-sidebar.test.tsx` 增加学习位于首位及收起仍有图标的断言：

```tsx
it('puts study first and keeps its rail entry when collapsed', () => {
  const { rerender } = render(<BriefingSourceSidebar theme="academic" collapsed={false} onToggle={vi.fn()} />)
  const nav = screen.getByRole('navigation')
  expect(nav.firstElementChild).toHaveAttribute('data-testid', 'briefing-source-study')
  rerender(<BriefingSourceSidebar theme="academic" collapsed onToggle={vi.fn()} />)
  expect(screen.getByTestId('briefing-source-study')).toHaveAttribute('title', '学习')
  expect(screen.queryByText('学习')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: 运行集成测试并确认失败**

Run: `npx vitest run tests/briefing-study-source.test.tsx tests/store.test.ts tests/briefing-sidebar.test.tsx`

Expected: FAIL，`Briefing` 尚未显式处理 study 分支。

- [ ] **Step 3: 把 Briefing 改为显式四来源分支**

在 `BriefingSourceSidebar.navItems` 首部添加以下项目，保留 `handleNavClick` 的写作 picker 与 HTML flush：

```tsx
{ id: 'study', label: '学习', icon: () => <span aria-hidden="true">✦</span>, testId: 'briefing-source-study' }
```

用 store 的 `briefingSidebarCollapsed`／`toggleBriefingSidebar` 替代本地 `sidebarCollapsed`；`dateColumnCollapsed` 仍只服务写作。第二列区域添加：

```tsx
{source === 'study' && <StudySourcePanel />}
```

工作区不得再用「非写作、非书就默认博客」的 catch-all：

```tsx
{source === 'study' ? (
  <main data-testid="study-source-workspace" className="relative z-[5] flex-1 min-h-0 min-w-0">
    {studySelectedDirName ? <StudyTopicBoard /> : <StudyWall />}
  </main>
) : source === 'writing' ? (
  <main className="relative z-[5] flex-1 min-h-0">
    <BriefingReaderControls
      theme={theme}
      fontSize={writingUISize}
      onDecrease={() => void decreaseWritingUI()}
      onIncrease={() => void increaseWritingUI()}
      swapTestId="briefing-swap-painting-button"
      fontTestIdPrefix="writing-ui"
      disabled={htmlDeleteMode}
      disabledTitle="删除模式下不可调整字号"
      label="界面字号"
    />
    {(() => {
      const openRoot = writingFilePath ? writingRootOf(writingFilePath) : null
      const tabRoot = writingTab === 'articles' ? 'writing' : writingTab === 'repository' ? 'repository' : 'notes'
      const hasMatchingDocument = openRoot === tabRoot
      if (tabRoot === 'notes') return hasMatchingDocument ? <NoteBoard /> : <NotesWall />
      return hasMatchingDocument && !writingWallVisible[tabRoot] ? <WritingBoard /> : <WritingWall root={tabRoot} theme={theme} />
    })()}
  </main>
) : source === 'book' ? (
  <BookPanel theme={theme} />
) : source === 'anthropic' ? (
  <AnthropicBlogPanel theme={theme} />
) : (
  null
)}
```

写作 main 内容完整保留在当前分支，不提取单用途抽象；`WritingAssistantPanel` 仍只在写作来源挂载。

- [ ] **Step 4: 开始新学习前保存旧会话并记录学习来源**

`PreStudyModal.onConfirm` 计算原参数后，将同步 `startSession` 调用包在：

```ts
await withSessionReplaced(() => startSession({
  mode: args.mode,
  topic: finalTopic,
  dirName: args.dirName,
  file_path: args.file_path,
  difficulty,
  temperature,
  userRequirement: userRequirement.trim() || undefined,
  selectedTopic,
  enableExternalMaterials: args.mode === 'progress' ? enableExternalMaterials : undefined,
  localMaterials: args.mode === 'progress' && localMaterials.length > 0 ? localMaterials : undefined,
  groupId: selectedGroupId,
}))
```

`withSessionReplaced` 不只看 `currentPage`，因此后台 session 在简报继续收到 chunk 后也会先保存。保存失败时 modal 保持打开，旧会话仍可用；保存成功后 `startSession` 继续执行现有旧流中止语义。`startSession` 的 set 中加入 `briefingSource: 'study'`，持久化调用改为：

```ts
void ipc.patchState({ ui: { session_count: nextCount }, briefingSource: 'study' } as Partial<StateJson>)
```

新 session 同时重置 `studyWorkspaceTab: 'conversation'`，但保留学习树展开和折叠状态。

- [ ] **Step 5: 验证其他来源与准备流程**

Run: `npx vitest run tests/briefing-study-source.test.tsx tests/store.test.ts tests/briefing-sidebar.test.tsx tests/companion-picker.test.ts tests/writing-store.test.ts tests/books-store.test.ts tests/study-source-panel.test.tsx`

Expected: PASS；写作 flush／对照挑选器、书籍恢复与学习准备流程无回归。

- [ ] **Step 6: 提交**

```bash
git add src/pages/Briefing.tsx src/components/BriefingSourceSidebar.tsx src/components/PreStudyModal.tsx src/store/index.ts tests/briefing-study-source.test.tsx tests/store.test.ts tests/briefing-sidebar.test.tsx
git commit -m "feat: integrate study source into briefing workspace"
```

### Task 11: 正式学习双列、后台切换与归档落点

**Files:**
- Modify: `src/pages/Study.tsx`
- Modify: `src/components/BriefingSourceSidebar.tsx`
- Modify: `src/store/index.ts`
- Modify: `src/lib/session-runtime.ts`
- Test: `tests/study-theme.test.tsx`
- Test: `tests/study-navigation.test.ts`
- Test: `tests/session-runtime.test.ts`
- Test: `tests/store.test.ts`

**Interfaces:**
- Consumes: 共享来源栏、`StudySourcePanel`、`withStudySaved`、现有 `session-runtime`、归档 overlay／modal。
- Produces: 正式学习双列骨架；保存失败不导航；普通切换不 abort；`resetSession` 返回学习简报。

- [ ] **Step 1: 写双列共享、后台保留与归档返回测试**

```tsx
it('keeps both rails mounted and shares their collapse state', () => {
  useStore.setState({ briefingSidebarCollapsed: false, studyListCollapsed: false })
  render(<Study />)
  expect(screen.getByTestId('briefing-source-sidebar')).toBeInTheDocument()
  expect(screen.getByTestId('study-topic-search')).toBeInTheDocument()
  fireEvent.click(screen.getByTestId('briefing-list-column-toggle'))
  expect(useStore.getState().studyListCollapsed).toBe(true)
  expect(screen.getByTestId('message-list')).toBeInTheDocument()
})

it('does not abort a background stream for ordinary source navigation', async () => {
  const saveCurrentSession = vi.fn().mockResolvedValue(undefined)
  useStore.setState({ currentPage: 'study', session: streamingSession, saveCurrentSession })
  render(<BriefingSourceSidebar theme="academic" collapsed={false} onToggle={vi.fn()} />)
  fireEvent.click(screen.getByTestId('briefing-source-anthropic'))
  await waitFor(() => expect(useStore.getState().currentPage).toBe('briefing'))
  expect(saveCurrentSession).toHaveBeenCalledOnce()
  expect(ipc.llmAbort).not.toHaveBeenCalled()
  expect(useStore.getState().session?.abortId).toBe(streamingSession.abortId)
})
```

另加保存失败仍 `currentPage === 'study'`、`resetSession()` 后 `currentPage === 'briefing' && briefingSource === 'study'`、归档报告关闭不误清新 abortId 的测试。还在 `session-runtime.test.ts` 用 deferred `readAnchorFile`／`saveSession` 验证：await 返回时 abortId 已变化，不得把旧 streaming、reviewFileBody 或 llmStart 写入新 session。

- [ ] **Step 2: 运行测试并确认旧单栏行为失败**

Run: `npx vitest run tests/study-theme.test.tsx tests/study-navigation.test.ts tests/session-runtime.test.ts tests/store.test.ts`

Expected: FAIL，正式学习还没有双列，resetSession 仍指向 home。

- [ ] **Step 3: 重排 Study 外壳而不改会话运行时**

```tsx
<div data-testid="study-shell" className={`relative h-full flex overflow-hidden ${isAcademic ? 'gap-2 p-2' : 'bg-white'}`}>
  <SurfaceBackground surface="study" />
  <BriefingSourceSidebar theme={theme} collapsed={briefingSidebarCollapsed} onToggle={toggleBriefingSidebar} />
  <StudySourcePanel />
  <div data-testid="study-page" className={`relative z-[5] flex-1 min-w-0 min-h-0 flex flex-col ${isExiting ? 'study-exit' : ''}`}>
    <StudyConversationHeader />
    <StudyConversationBody />
  </div>
</div>
```

`StudyConversationHeader`／`StudyConversationBody` 是同文件非导出提取或保留的 JSX 区域，必须继续包含原字号、术语、模式、主题／画作控制、`ExternalMaterialsCard`、stream error、Quote、ChatBubble、等待、archive banner 与 `ChatInput`。`ChatInput` 和 IME 逻辑不改；`session-runtime` 只允许增加下述 abortId 竞争守卫，不改变消息截断、发送中断或 SSE 契约。

第二列自身滚动；工作区设置 `min-w-[420px]`，外层在空间不足时 `overflow-x-auto`，不得自动改用户折叠选择。深色与报纸根类保持现有行为。

- [ ] **Step 4: 让来源切换与返回统一经过保存守护**

`BriefingSourceSidebar.handleNavClick` 保留写作 picker 的所有提前 return；最终来源切换改为：

```ts
await withStudySaved(async () => {
  await setSource(id as BriefingSourceId)
  if (useStore.getState().currentPage === 'study') await useStore.getState().goto('briefing')
})
```

不要在 `setBriefingSource` 内隐式保存，以免改变文章／书籍内部调用。普通返回在 `withStudySaved` 成功后播放原退出动画，700ms 后 `openStudyWall()` 并 `goto('briefing')`；保存失败不设置 `isExiting`。

把 `streamError` 从 `Study` 局部 state 提升为运行时 `studyStreamError`／`setStudyStreamError`，这样浏览后恢复同一 session 仍能重递或合上；`onLlmError` 仍按 abortId 过滤。

`kickoffSession` 和 `sendOrInterrupt` 在进入时捕获 `const sessionId = s.session.abortId`，每次 `await` 后先确认 `useStore.getState().session?.abortId === sessionId` 再 set state 或调用 `llmStart`。`prepareExternalMaterials` 同样捕获 owner abortId，搜索／摘要成功或失败只有在 owner 仍是当前 session 时才写 `externalMaterials` 和 Toast；普通切来源不改变 owner，因此后台结果仍保留，显式新 session 则丢弃旧结果，避免串主题。

- [ ] **Step 5: 修正 reset、归档返回与报告关闭**

```ts
resetSession: () => set({
  session: null,
  currentPage: 'briefing',
  briefingSource: 'study',
  externalMaterials: null,
  isExternalSummaryOpen: false,
  studyWorkspaceTab: 'conversation',
  studyStreamError: null,
})
```

不得在这里清空学习树展开／折叠。归档中返回不重复 save；沿用 abortId 捕获，700ms 后只有当前 abortId 未变才 `openStudyWall(); resetSession()`。归档报告关闭先 `dismissPendingReport(dirName)` 与 `openStudyTopic(dirName)`，再做相同 abortId 守卫和 reset；旧报告不得关闭新前台 session。

`restoreSession` 的两个分支都把 `briefingSource` 设为 `study`，并持久化该来源；同一 live session 的存活守卫仍只恢复页面，不用磁盘旧快照覆盖内存。恢复到不同 abortId 时，调用方已通过 `withSessionReplaced` 保存旧快照，`restoreSession` 在替换前对仍在 streaming 的旧 abortId 调用 `ipc.llmAbort`，保持单 live 契约。这样既不丢后台新 chunk，也让来源栏与封面恢复值正确。

- [ ] **Step 6: 验证流式、IME 前置条件与归档**

Run: `npx vitest run tests/study-theme.test.tsx tests/study-navigation.test.ts tests/session-runtime.test.ts tests/store.test.ts tests/quote-band.test.tsx`

Expected: PASS；双列折叠不卸载消息状态，普通切换无 abort，归档失败与自动保存测试保持原语义。

- [ ] **Step 7: 提交**

```bash
git add src/pages/Study.tsx src/components/BriefingSourceSidebar.tsx src/store/index.ts src/lib/session-runtime.ts tests/study-theme.test.tsx tests/study-navigation.test.ts tests/session-runtime.test.ts tests/store.test.ts
git commit -m "feat: keep study rails and background sessions during navigation"
```

### Task 12: 外部资料资产卡与工作区摘要页签

**Files:**
- Create: `src/components/study/ExternalSummaryWorkspace.tsx`
- Modify: `src/components/ExternalMaterialsCard.tsx`
- Modify: `src/pages/Study.tsx`
- Modify: `src/store/index.ts`
- Delete: `src/components/ExternalSummaryPanel.tsx`
- Test: `tests/external-summary-workspace.test.tsx`
- Test: `tests/study-theme.test.tsx`
- Test: `tests/external-materials.test.ts`

**Interfaces:**
- Consumes: `studyWorkspaceTab`、`setStudyWorkspaceTab`、现有 `externalMaterials`、`ExternalSummaryContent`、学习字号与 Demo 说明组件。
- Produces: 「对话／外部资料」工作区页签；资产卡内展开不变；旧 `isExternalSummaryOpen` 面板状态退役。

- [ ] **Step 1: 写页签、无重复请求、来源锚点与 Esc 测试**

```tsx
it('opens the full summary in a workspace tab without preparing materials again', () => {
  useStore.setState({ session, externalMaterials: { summary: '纠缠是关联[1]。', sources: [{ title: '来源一', url: 'https://example.com/1' }], loading: false, error: null }, studyWorkspaceTab: 'conversation' })
  render(<Study />)
  fireEvent.click(screen.getByTestId('external-summary-open'))
  expect(screen.getByTestId('study-workspace-tab-external-summary')).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByTestId('external-summary-workspace')).toHaveTextContent('纠缠是关联')
  expect(ipc.searchPrepare).not.toHaveBeenCalled()
  expect(screen.getByRole('link', { name: '[1]' })).toHaveAttribute('href', '#external-source-1')
  fireEvent.click(screen.getByTestId('study-workspace-tab-conversation'))
  expect(screen.getByTestId('message-list')).toBeInTheDocument()
  expect(screen.getByTestId('external-materials-card')).toBeInTheDocument()
})

it('uses Escape in layers: note, summary tab, then saved return', () => {
  useStore.setState({ studyWorkspaceTab: 'external-summary' })
  render(<Study />)
  fireEvent.click(screen.getByTestId('demo-info-external-materials'))
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(screen.queryByTestId('demo-note-popover-external-materials')).not.toBeInTheDocument()
  expect(useStore.getState().studyWorkspaceTab).toBe('external-summary')
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(useStore.getState().studyWorkspaceTab).toBe('conversation')
  expect(screen.getByTestId('study-page')).toBeInTheDocument()
})
```

保留资产卡标题行展开／收起的原测试，并新增「页签切换不卸载外部资料资产、不改变 loading／error／sources」断言。

- [ ] **Step 2: 运行测试并确认旧面板实现不满足**

Run: `npx vitest run tests/external-summary-workspace.test.tsx tests/study-theme.test.tsx tests/external-materials.test.ts`

Expected: FAIL，当前 `摘要 →` 仍打开固定右侧面板。

- [ ] **Step 3: 实现摘要工作区并迁移说明入口**

```tsx
export function ExternalSummaryWorkspace() {
  const theme = useStore(state => state.briefingTheme)
  const fontSize = useStore(state => state.studyFontSize)
  const materials = useStore(state => state.externalMaterials)
  const infoRef = useRef<HTMLSpanElement>(null)
  const [openNote, setOpenNote] = useState<DemoNote['id'] | null>(null)
  return (
    <section data-testid="external-summary-workspace" className="flex-1 min-h-0 overflow-y-auto" style={{ fontSize: STUDY_FONT_STYLES[normalizeStudyFontSize(fontSize)] }}>
      <div className="flex justify-end"><span ref={infoRef}><DemoInfoButton noteId="external-materials" testId="demo-info-external-materials" size="icon" label="这些外部资料是怎么找来的" theme={theme} active={openNote === 'external-materials'} onClick={() => setOpenNote(value => value ? null : 'external-materials')} /></span></div>
      {materials?.summary ? <ExternalSummaryContent summary={materials.summary} sources={materials.sources} theme={theme} /> : <div>暂无摘要</div>}
      <DemoNotePopover noteId={openNote} anchorRef={infoRef} onClose={() => setOpenNote(null)} theme={theme} />
    </section>
  )
}
```

`ExternalSummaryContent` 不改，因此编号替换、`#external-source-N`、外链、代码和表格渲染保持原实现。说明按钮样式可提取 className，但 noteId、testId 和弹层行为不变。

- [ ] **Step 4: 改资产卡动作与 Study 页签**

`ExternalMaterialsCard` 保留自己的 `expanded` state 和卡片内 `ExternalSummaryContent`；只把「摘要 →」的 click 改为：

```ts
setStudyWorkspaceTab('external-summary')
```

在 Study 的资产卡上方或下方放置非模态页签，外部资料存在时才显示第二个页签：

```tsx
<div role="tablist" aria-label="学习工作区">
  <button role="tab" data-testid="study-workspace-tab-conversation" aria-selected={studyWorkspaceTab === 'conversation'} onClick={() => setStudyWorkspaceTab('conversation')}>对话</button>
  {externalMaterials && <button role="tab" data-testid="study-workspace-tab-external-summary" aria-selected={studyWorkspaceTab === 'external-summary'} onClick={() => setStudyWorkspaceTab('external-summary')}>外部资料</button>}
</div>
<ExternalMaterialsCard />
{studyWorkspaceTab === 'external-summary' && externalMaterials ? <ExternalSummaryWorkspace /> : <StudyConversationBody />}
```

资产卡放在两个页签正文共同的上方且只挂载一次；不得让 `StudyConversationBody` 再次包含它。聊天 pageShift、`ExternalSummaryPanel` 固定定位、外部点击关闭与 `aria-modal` 全部移除。

- [ ] **Step 5: 保留 Esc 优先级并清理旧状态**

Study 的 keydown 顺序固定为：已有 DemoNote 弹层则交给弹层；`modal !== null` 或归档报告打开则不执行返回；外部摘要页签则切回对话；最后才调用保存守护返回。删除 store 的 `isExternalSummaryOpen`、`openExternalSummary`、`closeExternalSummary`、`toggleExternalSummary`，并清理 reset／startSession 中对应字段；`clearExternalMaterials` 同时将工作区重置为 conversation。

完成全仓引用搜索后删除 `ExternalSummaryPanel.tsx`。`files:readExternalMaterials`、`files:writeExternalMaterials`、`SessionMeta` 均不改。

- [ ] **Step 6: 验证并提交**

Run: `npx vitest run tests/external-summary-workspace.test.tsx tests/study-theme.test.tsx tests/external-materials.test.ts tests/components/GuidePopover.test.tsx`

Expected: PASS；摘要无重复请求，来源锚点与说明保留，Esc 不一次关闭多层。

```bash
git add src/components/study/ExternalSummaryWorkspace.tsx src/components/ExternalMaterialsCard.tsx src/pages/Study.tsx src/store/index.ts src/components/ExternalSummaryPanel.tsx tests/external-summary-workspace.test.tsx tests/study-theme.test.tsx
git commit -m "feat: move external summary into study workspace tabs"
```

### Task 13: 退役旧页面并迁移而非删除 E2E 覆盖

**Files:**
- Delete: `src/pages/Home.tsx`
- Delete: `src/components/StudyLibrary.tsx`
- Delete: `src/components/SessionViewer.tsx`
- Delete: `src/components/GroupRibbon.tsx`
- Modify: `src/App.tsx`
- Modify: `src/store/index.ts`
- Modify: `e2e/pages/CoverPage.ts`
- Modify: `e2e/pages/HomePage.ts`
- Modify: `e2e/pages/LibraryPage.ts`
- Modify: `e2e/pages/StudyPage.ts`
- Modify: `e2e/helpers/selectors.ts`
- Rename: `e2e/specs/home.spec.ts` → `e2e/specs/study-source.spec.ts`
- Rename: `e2e/specs/library-pagination.spec.ts` → `e2e/specs/study-wall-all-topics.spec.ts`
- Rename: `e2e/specs/external-materials-summary-panel.spec.ts` → `e2e/specs/external-materials-workspace.spec.ts`
- Create: `e2e/specs/study-source-layout.spec.ts`
- Create: `e2e/specs/study-background-navigation.spec.ts`
- Modify: `e2e/specs/cover.spec.ts`, `e2e/specs/smoke.spec.ts`, `e2e/specs/onboarding-journey.spec.ts`, `e2e/specs/archive-edge.spec.ts`, `e2e/specs/continue-suggestions.spec.ts`, `e2e/specs/continue-topic.spec.ts`, `e2e/specs/new-topic-progress.spec.ts`, `e2e/specs/review-topic.spec.ts`, `e2e/specs/pre-study.spec.ts`, `e2e/specs/study.spec.ts`, `e2e/specs/terminology.spec.ts`, `e2e/specs/wild-card.spec.ts`, `e2e/specs/group-guide.spec.ts`, `e2e/specs/diagram-generation.spec.ts`, `e2e/specs/fable-generation.spec.ts`, `e2e/specs/quote-display.spec.ts`, `e2e/specs/library-management.spec.ts`, `e2e/specs/library-drag-and-delete.spec.ts`, `e2e/specs/library-topic-archive.spec.ts`, `e2e/specs/settings.spec.ts`, `e2e/specs/profile.spec.ts`, `e2e/specs/extension-page.spec.ts`, `e2e/specs/demo-notes.spec.ts`, `e2e/specs/painting-delete.spec.ts`
- Modify: `e2e/specs/external-materials.spec.ts`, `e2e/specs/external-materials-error.spec.ts`, `e2e/specs/external-materials-real-api.spec.ts`, `e2e/specs/external-materials-real-search.spec.ts`
- Modify: `e2e/source-map.json`
- Modify: `e2e/README.md`

**Interfaces:**
- Consumes: Tasks 1–12 的新入口和选择器。
- Produces: 无 `home` 页面路由的应用；原首页、分页、库管理、摘要面板 spec 的等价或加强版学习来源覆盖。

- [ ] **Step 1: 先迁移页面对象，保留旧断言意图**

`CoverPage.enterIfNeeded` 不再点击「点亮灯火」：已有 profile 时点击 `cover-briefing-button`，首次进入仍点 `cover-enter-button`，后者已在 Task 1 改为进入简报。`HomePage` 文件名暂时保留以避免无关的大范围 import 改名，但其 `waitForLoaded` 必须先确保 `briefing-page` 可见、点击 `briefing-source-study`，再等待 `study-wall`；`librarySection` 改定位 `study-wall`，`settingsButton` 改定位 `briefing-settings-button`。

`LibraryPage` 的旧动作按以下规则迁移：

```ts
async openFable(topicIndex = 0) {
  await this.page.locator(SELECTORS.home.topicCard).nth(topicIndex).click()
  await this.page.getByTestId('study-topic-tab-fable').click()
  await this.page.getByTestId('study-topic-content').waitFor({ state: 'visible' })
}

async openDiagram(topicIndex = 0) {
  await this.page.locator(SELECTORS.home.topicCard).nth(topicIndex).click()
  await this.page.getByTestId('study-topic-tab-diagram').click()
  await this.page.getByTestId('study-topic-content').waitFor({ state: 'visible' })
}
```

实际 helper 需要按 `dirName` 过滤主题而非依赖排序的，沿用现有 dirName 方法并采用同样两步导航。生成图表／寓言、复习、删除都先进入相应主题和 session；原生成按钮 test id、风格弹层、确认弹层与结果断言保留。`closeSessionViewer` 改为关闭当前文件页签不是需求，应删除该 helper 调用并直接断言页内内容；不要再用全屏弹窗可见性作为成功标准。

`StudyPage.externalSummaryPanel` 改为 `externalSummaryWorkspace`，`closeExternalSummary` 点击对话页签；原「点外部关闭」测试改为「切回对话且资产卡与摘要状态保留」，不是删除测试。

- [ ] **Step 2: 把分页测试改成全量主题可达测试**

```ts
test('all twelve topics remain reachable without pagination', async ({ window, testLibraryPath }) => {
  for (let index = 0; index < 12; index++) seedNewTopic(testLibraryPath, `topic-${index}`, `主题 ${index}`)
  const cover = new CoverPage(window)
  await cover.enterIfNeeded()
  const home = new HomePage(window)
  await home.waitForLoaded()
  await expect(window.locator(SELECTORS.home.topicCard)).toHaveCount(12)
  await expect(window.locator('[data-testid^="pagination-"]')).toHaveCount(0)
  await window.getByTestId('study-topic-search').fill('主题 11')
  await expect(window.locator(SELECTORS.home.topicCard)).toHaveCount(1)
  await window.locator(SELECTORS.home.topicCard).click()
  await expect(window.getByTestId('study-topic-board')).toContainText('主题 11')
})
```

原分页 spec 只有一个「出现分页圆点」断言；迁移后的断言更强，覆盖第 10–12 条主题、搜索与打开报告。不得保留 9 条上限或把主题数量改小来通过。

- [ ] **Step 3: 把摘要面板 spec 改成工作区页签 spec**

```ts
test('summary tab preserves citations, notes and the materials asset', async ({ window }) => {
  const cover = new CoverPage(window)
  await cover.enterIfNeeded('摘要工作区测试')
  const home = new HomePage(window)
  await home.waitForLoaded()
  await home.startNewTopic()
  const preStudy = new PreStudyPage(window)
  await preStudy.waitForVisible()
  await preStudy.fillTopic('量子纠缠')
  await preStudy.clickStart()
  const study = new StudyPage(window)
  await study.waitForLoaded()
  await study.setMockExternalMaterials('核心概念：纠缠描述两个粒子的关联[1][2]。', [
    { title: 'Source 1', url: 'https://example.com/1' },
    { title: 'Source 2', url: 'https://example.com/2' },
  ])
  await study.openExternalSummary()
  await expect(study.externalSummaryWorkspace).toContainText('核心概念')
  await study.externalSummaryWorkspace.locator('a[href="#external-source-2"]').first().click()
  await expect(study.externalSummarySource(2)).toBeVisible()
  await window.getByTestId('demo-info-external-materials').click()
  await expect(window.getByTestId('demo-note-popover-external-materials')).toBeVisible()
  await window.keyboard.press('Escape')
  await expect(window.getByTestId('demo-note-popover-external-materials')).toHaveCount(0)
  await expect(study.externalSummaryWorkspace).toBeVisible()
  await study.closeExternalSummary()
  await expect(study.externalMaterialsCard).toBeVisible()
})
```

以上步骤完整保留原来的 Cover → 学习来源 → 新学习 → 准备弹层 → mock 资料链路，不使用真实网络。原「面板不覆盖聊天」改为「外部资料页签隐藏消息列表，切回对话后原消息仍存在」，断言同一条 assistant 内容而不是几何避让。

- [ ] **Step 4: 增加双列与后台导航 E2E**

`study-source-layout.spec.ts` 至少覆盖：学习首位；来源和第二列独立收起；两列同时收起；主题主页保持第二列状态；正式学习保持同一状态；1280×720 与窄窗口中正文最小宽度／横向滚动；深色和报纸两种主题；记事板与 Toast 不被页签或 GravityField 遮挡。

`study-background-navigation.spec.ts` 使用现有 mock LLM 流，从正式学习收到首个 chunk 后切到博客，再切回学习并点击同一「进行中」：

```ts
await expect(window.getByTestId('message-list')).toContainText(firstChunk)
await window.getByTestId('briefing-source-anthropic').click()
await expect(window.getByTestId('briefing-page')).toBeVisible()
await window.getByTestId('briefing-source-study').click()
await window.getByTestId('continue-unsaved-button').click()
await expect(window.getByTestId('message-list')).toContainText(firstChunk)
await expect(window.getByTestId('message-list')).toContainText(finalChunk)
```

再加保存失败注入用例：使 `saveSession` reject 后点来源，仍在 `study-page`，历史不丢，Toast 可见。既有 `study.spec.ts` 的中断、错误重试、归档等待／失败和 IME 断言全部保留，只更新进入学习来源的导航。

- [ ] **Step 5: 删除旧路由与孤儿组件**

执行引用审计：

```bash
rg -n "StudyLibrary|SessionViewer|GroupRibbon|ExternalSummaryPanel" src tests e2e
rg -n "goto\('home'\)|currentPage: 'home'|page === 'home'|settingsReturnTo \?\? 'home'" src
```

第一条只允许出现待删除文件本身；第二条必须无输出。随后删除四个旧组件，`App.tsx` 移除 Home lazy import、prefetch 和 `page === 'home'` 渲染，`Page` 联合类型移除 `'home'`。不得删除 `currentPaintings.home`、`Quote surface="home"`、设置页 `SurfaceBackground surface="home"` 或术语 `homeGreeting`。

封面测试改为：点亮灯火具有 `aria-disabled=true`，点击和键盘后仍封面；夜航简报恢复 `writing／anthropic／book／study`；首次命名进入持久化来源。设置、profile、extension、smoke、onboarding 只更新返回落点，不归档恢复等原断言。

- [ ] **Step 6: 更新定向测试映射**

`e2e/source-map.json`：

- `demo-notes.sources` 用 `src/components/study/StudyWall.tsx`、`src/components/study/ExternalSummaryWorkspace.tsx` 替换 `Home.tsx` 和 `ExternalSummaryPanel.tsx`。
- `study.sources` 增加 `src/components/study/**`、`src/lib/study-*.ts`、`src/lib/briefing-source.ts`、`src/pages/Briefing.tsx`、`src/components/BriefingSourceSidebar.tsx`、三张推荐／策略组件与 Quote。
- `study.specs` 加入 `study-source.spec.ts`、`study-source-layout.spec.ts`、`study-background-navigation.spec.ts`、`study-wall-all-topics.spec.ts`、`wild-card.spec.ts`、`library-*.spec.ts`；移除 `home.spec.ts` 与旧分页文件名。
- `library.sources` 移除 `StudyLibrary.tsx`，加入 `src/components/study/StudyTopicBoard.tsx`、`StudyTopicCard.tsx`、`useStudyTopicActions.ts`、`useStudyGravityDrag.ts`。
- `cover-home` 改名为 `cover-study-source`，移除 `Home.tsx` 和 `home.spec.ts`，保留封面、记事板、profile、smoke 等真实映射。
- 外部资料五个 spec 仍由 `external-materials*.spec.ts` 覆盖，新文件名不会成为孤儿。

Run: `node scripts/e2e-changed.js`

Expected: 输出包含全部受影响学习 spec，且无 orphan spec WARNING；此命令只列出，不启动 Electron。

- [ ] **Step 7: 静态验证并提交**

Run: `npx vitest run tests/briefing-study-source.test.tsx tests/study-theme.test.tsx tests/study-wall-view.test.tsx tests/study-topic-board.test.tsx tests/study-source-panel.test.tsx tests/study-topic-actions.test.tsx tests/external-summary-workspace.test.tsx`

Expected: PASS。

Run: `npm run build`

Expected: 构建成功，无 Home／SessionViewer／旧摘要面板引用或 Page 类型错误。

```bash
git add src/App.tsx src/store/index.ts src/pages/Home.tsx src/components/StudyLibrary.tsx src/components/SessionViewer.tsx src/components/GroupRibbon.tsx e2e
git commit -m "refactor: retire old home after migrating all study coverage"
```

### Task 14: 功能保全审计、定向验证与文档落地

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/README.md`
- Modify: `docs/superpowers/specs/2026-11-17-learning-source-restructure-design.md`
- Modify: `docs/superpowers/plans/2026-11-17-learning-source-restructure.md`
- Modify: `e2e/README.md`

**Interfaces:**
- Consumes: Tasks 1–13 的代码与测试证据。
- Produces: 与代码一致的 current 设计、四来源架构说明、可复核的功能保全验收记录。

- [ ] **Step 1: 按设计第 16 章做代码与测试双重审计**

逐项检查下表，不得只用「组件已创建」代替行为证据：

| 保全域 | 代码证据 | 最低测试证据 |
|---|---|---|
| 入口、问候、Quote、说明、设置、画作 | Tasks 1／5／10／13 | `briefing-source`、`briefing-sidebar`、`Quote`、`study-source-layout`、`cover` |
| 策略、随机／分组推荐、续谈建议、完整准备弹层 | Tasks 1／5／10 | `strategy-toggle`、`study-recommendations`、`store`、`wild-card`、`continue-suggestions`、`pre-study` |
| 全部／分组筛选、增改删组、指南、卫星拖拽 | Tasks 2／4／6 | `study-wall`、`study-source-panel`、`study-gravity-drag`、`group-guide`、`library-drag-and-delete` |
| 继续、重命名、归档恢复、新报告 | Task 7 | `study-topic-actions`、`settings`、`library-topic-archive` |
| 全量主题、五页签、复习、session 删除 | Tasks 2／3／8 | `study-wall-all-topics`、`session-file-content`、`study-topic-board`、`library-management` |
| 图表、寓言与后台生成 | Task 9 | `study-artifacts`、`study-artifact-tasks`、`diagram-generation`、`fable-generation` |
| 流式、中断、错误、后台恢复、归档与暂存 | Tasks 10／11 | `session-runtime`、`store`、`study`、`archive-edge`、`study-background-navigation` |
| 外部资料资产、摘要、来源、说明、Esc | Task 12 | `external-summary-workspace`、`external-materials-workspace`、`external-materials-error` |

为每个 E2E 对应关系检查原 spec 的断言数量与意图；允许因弹窗改页内而更换定位器，不允许删除刷新、错误、取消、确认、恢复、原格式写回等断言。

- [ ] **Step 2: 运行全部受影响单元测试，不跑无关全量**

Run:

```bash
npx vitest run tests/briefing-source.test.ts tests/briefing-sidebar.test.tsx tests/state-library.test.ts tests/study-wall.test.ts tests/session-file-content.test.tsx tests/study-navigation.test.ts tests/study-source-panel.test.tsx tests/study-wall-view.test.tsx tests/study-recommendations.test.tsx tests/study-gravity-drag.test.tsx tests/study-topic-actions.test.tsx tests/study-topic-board.test.tsx tests/study-artifacts.test.ts tests/study-artifact-tasks.test.ts tests/briefing-study-source.test.tsx tests/external-summary-workspace.test.tsx
```

Expected: 全部 PASS。

Run:

```bash
npx vitest run tests/store.test.ts tests/session-runtime.test.ts tests/settings.test.tsx tests/strategy-toggle-theme.test.tsx tests/group-rec-card-theme.test.tsx tests/components/Quote.test.tsx tests/components/GuidePopover.test.tsx tests/quotes.test.ts tests/quote-band.test.tsx tests/archive.test.ts tests/writing-store.test.ts tests/companion-picker.test.ts tests/books-store.test.ts
```

Expected: 全部 PASS；任何旧测试失败都先判断迁移是否丢行为，不得通过放宽断言消除失败。

- [ ] **Step 3: 构建、文档与旧引用静态门禁**

Run: `npm run build`

Expected: electron-vite 构建成功。

Run:

```bash
rg -n "goto\('home'\)|currentPage: 'home'|page === 'home'|StudyLibrary|ExternalSummaryPanel|isExternalSummaryOpen" src tests e2e
rg -n "pagination-(prev|next|dot)" src
git diff --check
```

Expected: 前两条无旧路由、旧组件、旧面板状态或分页 UI 引用；`git diff --check` 无空白错误。`homeGreeting`、`currentPaintings.home` 和设置页 `surface="home"` 是合法保留，不按单词 `home` 粗暴删除。

- [ ] **Step 4: 更新 AGENTS 与文档索引**

`AGENTS.md` 增加「学习来源」现状段，明确：

```text
夜航简报当前四来源 = 学习 / 写作 / Anthropic 博客 / 书籍。
学习来源第二列 = 分组 → 主题 → session；学习墙与主题主页共享同一视图模型。
正式学习常驻来源列与学习第二列；普通切换保存快照并保留单 live session 后台工作。
GravityField、主题归档／设置恢复、图表／寓言任务与外部资料工作区页签保持现有文件格式。
页面路由：cover → briefing（学习墙／主题主页）→ study；settings 为独立页；preStudy 为模态层；旧 home 已退役。
```

同时把写作段「当前三来源」改为「其他三来源之一」，并保留书籍、写作、设置现有说明。`docs/README.md` 学习库域去掉「分页在用」，夜航简报域改为四来源 current，并把本 spec 从 planned 指针改为 current 指针；历史计划仍作迁移记录，不裸删。

本步只更新结构说明与索引草稿。spec frontmatter 在 Step 6 定向验证通过后再改为 `status: current`，`verified` 使用实际完成验证的 ISO 日期，`note` 简述学习来源已落地及验证范围。若定向 E2E 尚未获准运行，保持 `planned`，不得写成已验证完成。

- [ ] **Step 5: 运行文档校验和定向 E2E 列表**

Run: `npm run docs:check`

Expected: frontmatter、索引可达性、指针和文档引用错误为 0。

Run: `node scripts/e2e-changed.js`

Expected: 学习、封面、设置、写作 flush、书籍／博客来源、外部资料、startup-health 等受影响 spec 被列出，无 orphan WARNING。真实 `@real` API spec 单独标记，不在未获明确同意时消耗真实 API。

- [ ] **Step 6: 经用户确认后运行定向 E2E**

先明确告知会启动隔离的 Electron 测试实例并让用户保存工作，获得确认后运行：

```bash
node scripts/e2e-changed.js --run --no-retries
```

Expected: 所有受影响的非 real spec PASS。若 dry-run 列表包含 `@real`，先取得真实 API 测试授权；未授权时用同一 dry-run 列表构造显式 Playwright 文件列表并加 `--grep-invert @real --retries=0`，同时如实报告 real spec 未运行。不得运行 `npm run test:e2e` 全量。

失败时按根因修复并重跑失败 spec 与其所属任务单元测试；不得删除旧功能断言、增加任意 timeout 或重试来掩盖失败。

- [ ] **Step 7: 完成文档提交与交付审计**

```bash
git add AGENTS.md docs/README.md docs/superpowers/specs/2026-11-17-learning-source-restructure-design.md docs/superpowers/plans/2026-11-17-learning-source-restructure.md e2e/README.md
git commit -m "docs: record verified learning source restructure"
git status --short
```

Expected: worktree 干净。最终汇报测试实际运行集合、未运行的 real E2E、分支与 worktree 路径；按仓库协议先询问再合并，不自行重启主工作区应用。

## Spec Coverage Index

| Spec 要求 | 实现任务 | 验证任务 |
|---|---|---|
| 1–3：重组目标、范围与非目标 | Global Constraints、1–13 | 13、14 |
| 4–5：来源恢复、三栏、两列折叠与共享树 | 1、4、10、11 | 13、14 |
| 6：推荐、主题专辑卡、空态、全量主题 | 2、5、7 | 5、13、14 |
| 7：分组 CRUD、指南与 GravityField | 4、6、7 | 6、13、14 |
| 8：主题主页、五页签、pending 报告 | 3、7、8、9 | 8、9、13、14 |
| 9：正式学习双列、后台会话与所有流式状态 | 10、11 | 11、13、14 |
| 10：三种准备、产物生成、删除与复习 | 8、9、10 | 9、13、14 |
| 11：S／W／T／L 全界面、深色／报纸／小窗口 | 1–12 | 13、14 |
| 12：组件职责、运行时状态与 IPC 边界 | File Structure、1–4、8–12 | 13、14 |
| 13：错误、竞争、保存失败与后台归位 | 3、4、6、9、11、12 | 11、13、14 |
| 14：单元、定向 E2E 与完成标准 | 1–13 | 14 |
| 16.1：入口与旧首页控制 | 1、5、10、13 | 5、13、14 |
| 16.2：推荐与准备 | 1、5、10 | 5、13、14 |
| 16.3：分组、主题管理与拖拽 | 2、4、6、7 | 6、7、13、14 |
| 16.4：session 与产物 | 2、3、8、9 | 8、9、13、14 |
| 16.5：正式学习、归档与恢复 | 10、11 | 11、13、14 |
| 16.6：外部资料页签 | 12 | 12、13、14 |
| 15：AGENTS、索引、source-map 与历史维护 | 13、14 | 14 |
