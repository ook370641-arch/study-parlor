---
status: planned
---

# 博客我的分组与共享排序 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Anthropic 博客的第二列与专辑墙改造成独立筛选的「我的 / 全部」视图，并为已保存、已读、收藏提供折叠、共享分组排序和组内文章排序。

**Architecture:** 使用 `src/lib/blog-groups.ts` 作为跨进程纯逻辑核心，继续以 `.collection.json` 保存集合并扩展共享顺序。主进程负责校验和落盘，Zustand 提供统一排序 action；第二列与专辑墙只保留各自筛选、折叠和高度状态。

**Tech Stack:** Electron 30、React 18、TypeScript、Zustand、Tailwind CSS、Vitest、Testing Library、Playwright。

**Spec:** `docs/superpowers/specs/2026-11-13-blog-my-groups-and-ordering-design.md`

## Global Constraints

- 在 `codex/blog-my-groups` 的独立 worktree 实施，不修改主工作区，不启动第二个应用实例。
- `.collection.json` 继续是收藏、已读和顺序的唯一事实源；不得把顺序另存到 `state.json`。
- 两侧的「我的 / 全部」、来源、搜索、折叠和高度状态独立；分组顺序与组内文章顺序共享并持久化。
- 我的三组固定为 `saved | read | favorite`；已读与收藏的新操作互斥，旧重叠数据不自动迁移。
- 只有拖拽手柄可移动文章，只有分组标题拖拽区可移动分组；卡片其他区域继续打开／导入。
- 不允许跨组拖文章，不给「全部」加手动排序。
- 保留推荐记录、重新推荐、推荐理由、推荐进度与取消、dismissed、导入取消、删除确认、文件丢失恢复、阅读器标记、对照、内置报告和两种主题。
- 单元测试只运行受影响文件；E2E 只在用户明确确认后运行定向 spec，不运行全量 E2E。

---

### Task 1: 分组与顺序纯逻辑

**Files:**
- Create: `src/lib/blog-groups.ts`
- Create: `tests/blog-groups.test.ts`
- Modify: `src/types/index.ts:93`

**Interfaces:**
- Consumes: 现有 `AnthropicArticleMeta`、`BlogCollectionFile`、`BlogCollectionEntry`、`BlogReadEntry`。
- Produces:

```ts
export type BlogMineGroup = 'saved' | 'read' | 'favorite'
export type BlogOrder = {
  groups: BlogMineGroup[]
  saved: string[]
  read: string[]
  favorite: string[]
}
export type BlogOrderChange = {
  sourceUrl: string
  to: BlogMineGroup | null
  position?: 'prepend' | 'append'
}
export type BlogReorderRequest =
  | { kind: 'group'; source: BlogMineGroup; target: BlogMineGroup; placement: 'before' | 'after' }
  | { kind: 'article'; group: BlogMineGroup; sourceUrl: string; targetUrl: string; placement: 'before' | 'after' }

export const DEFAULT_BLOG_GROUP_ORDER: readonly BlogMineGroup[]
export function reconcileBlogOrder(
  collection: BlogCollectionFile,
  articles: AnthropicArticleMeta[],
  change?: BlogOrderChange
): BlogOrder
export function reorderBlog(order: BlogOrder, request: BlogReorderRequest): BlogOrder
export function deriveBlogMineGroups(
  articles: AnthropicArticleMeta[],
  collection: BlogCollectionFile
): Record<BlogMineGroup, AnthropicArticleMeta[]>
```

- [ ] **Step 1: 写旧数据派生、互斥流转和过滤顺序测试**

在 `tests/blog-groups.test.ts` 至少加入以下具体用例：

```ts
import { describe, expect, it } from 'vitest'
import { deriveBlogMineGroups, reconcileBlogOrder, reorderBlog } from '@/lib/blog-groups'
import type { AnthropicArticleMeta, BlogCollectionFile } from '@shared/index'

const articles: AnthropicArticleMeta[] = [
  { url: 'saved', title: 'Saved', summary: null, publishedAt: '2026-01-01', imageUrl: null, isSaved: true, filePath: 'saved.md' },
  { url: 'read', title: 'Read', summary: null, publishedAt: '2026-01-02', imageUrl: null, isSaved: true, filePath: 'read.md' },
  { url: 'favorite', title: 'Favorite', summary: null, publishedAt: '2026-01-03', imageUrl: null, isSaved: true, filePath: 'favorite.md' },
]
const collection: BlogCollectionFile = {
  version: 1,
  entries: [{ sourceUrl: 'favorite', filePath: 'favorite.md', title: 'Favorite', addedAt: 'x', origin: 'manual' }],
  dismissed: [], history: [],
  read: [{ sourceUrl: 'read', filePath: 'read.md', title: 'Read', readAt: 'x' }],
}

it('旧数据派生三组与默认顺序', () => {
  const order = reconcileBlogOrder(collection, articles)
  expect(order).toEqual({ groups: ['saved', 'read', 'favorite'], saved: ['saved'], read: ['read'], favorite: ['favorite'] })
  const groups = deriveBlogMineGroups(articles, { ...collection, order })
  expect(groups.saved.map(a => a.url)).toEqual(['saved'])
})

it('标已读后从 saved 移到 read 首位', () => {
  const readSavedCollection: BlogCollectionFile = {
    ...collection,
    read: [{ sourceUrl: 'saved', filePath: 'saved.md', title: 'Saved', readAt: 'x' }, ...collection.read],
  }
  const order = reconcileBlogOrder(readSavedCollection, articles, { sourceUrl: 'saved', to: 'read', position: 'prepend' })
  expect(order.saved).toEqual([])
  expect(order.read).toEqual(['saved', 'read'])
})

it('过滤视图只按可见目标改变相对顺序', () => {
  const base = reconcileBlogOrder(collection, articles)
  const order = { ...base, saved: ['a', 'hidden', 'b', 'c'] }
  expect(reorderBlog(order, { kind: 'article', group: 'saved', sourceUrl: 'a', targetUrl: 'b', placement: 'after' }).saved)
    .toEqual(['hidden', 'b', 'a', 'c'])
  expect(reorderBlog(order, { kind: 'article', group: 'saved', sourceUrl: 'a', targetUrl: 'a', placement: 'after' })).toBe(order)
})
```

另补两组测试：收藏／已读条目不在文章缓存时仍生成可显示的 fallback meta；非法 URL、重复 URL、非法分组名被清理且其他数组不变。

- [ ] **Step 2: 运行测试并确认失败**

Run: `npx vitest run tests/blog-groups.test.ts`

Expected: FAIL，提示无法解析 `@/lib/blog-groups`。

- [ ] **Step 3: 实现最小纯逻辑**

`src/lib/blog-groups.ts` 不导入 Electron、React 或 Node API。实现时遵守：

```ts
export const DEFAULT_BLOG_GROUP_ORDER = ['saved', 'read', 'favorite'] as const

export function reorderBlog(order: BlogOrder, request: BlogReorderRequest): BlogOrder {
  if (request.kind === 'group') {
    if (request.source === request.target) return order
    const groups = order.groups.filter(group => group !== request.source)
    const target = groups.indexOf(request.target)
    if (target < 0) return order
    groups.splice(target + (request.placement === 'after' ? 1 : 0), 0, request.source)
    return { ...order, groups }
  }
  const next = order[request.group].filter(url => url !== request.sourceUrl)
  const target = next.indexOf(request.targetUrl)
  if (target < 0) return order
  next.splice(target + (request.placement === 'after' ? 1 : 0), 0, request.sourceUrl)
  return { ...order, [request.group]: next }
}
```

`reconcileBlogOrder` 先按当前 entries/read/cache 求合法成员，再保留旧顺序、去重并补齐缺失项；`change.to` 只有在校验目标组确实包含该 URL 时才执行 prepend/append。`deriveBlogMineGroups` 用顺序数组映射，收藏和已读优先使用缓存 meta，缓存缺失时用 entry 的 `sourceUrl/title/filePath` 构造 meta。

- [ ] **Step 4: 运行测试并确认通过**

Run: `npx vitest run tests/blog-groups.test.ts`

Expected: 全部 PASS。

- [ ] **Step 5: 提交纯逻辑**

```bash
git add src/types/index.ts src/lib/blog-groups.ts tests/blog-groups.test.ts
git commit -m "feat: add blog group ordering primitives"
```

---

### Task 2: collection 持久化、排序 IPC 与 store action

**Files:**
- Modify: `electron/lib/blog-collection.ts`
- Modify: `electron/ipc/anthropic.ts:160`
- Modify: `electron/preload.ts:124`
- Modify: `src/types/index.ts:818`
- Modify: `src/lib/ipc.ts:84`
- Modify: `src/store/index.ts:1606`
- Modify: `tests/blog-collection.test.ts`
- Create: `tests/blog-order-store.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `BlogOrder`、`BlogOrderChange`、`BlogReorderRequest`、`reconcileBlogOrder`、`reorderBlog`。
- Produces:

```ts
saveCollection(
  lib: string,
  collection: BlogCollectionFile,
  change?: BlogOrderChange,
  articles?: AnthropicArticleMeta[]
): void
ipc.anthropicCollectionReorder(request: BlogReorderRequest): Promise<
  { ok: true; collection: BlogCollectionFile } | { ok: false; message: string }
>
useStore.getState().reorderBlog(request: BlogReorderRequest): Promise<void>
```

- [ ] **Step 1: 写旧文件兼容和持久化失败回滚测试**

在 `tests/blog-collection.test.ts` 增加：

```ts
it('旧文件无 order 时按当前集合并派生，保存后可读回', () => {
  fs.mkdirSync(path.join(dir, 'Anthropic博客'), { recursive: true })
  fs.writeFileSync(collectionPath(dir), JSON.stringify({ version: 1, entries: [], dismissed: [], history: [], read: [] }))
  const loaded = loadCollection(dir)
  expect(loaded.order?.groups).toEqual(['saved', 'read', 'favorite'])
  saveCollection(dir, loaded)
  expect(loadCollection(dir).order).toEqual(loaded.order)
})
```

同时把现有 `empty()` fixture 改为包含空顺序：`order: { groups: ['saved', 'read', 'favorite'], saved: [], read: [], favorite: [] }`，确保缺文件、损坏文件与版本重置断言检查新的默认形状。

在 `tests/blog-order-store.test.ts` mock `ipc.anthropicCollectionReorder`，分别验证成功时使用返回的完整 collection，失败时恢复拖拽前的 `blogCollection` 并调用 `showToast('排序保存失败，请重试')`。

- [ ] **Step 2: 运行测试并确认失败**

Run: `npx vitest run tests/blog-collection.test.ts tests/blog-order-store.test.ts`

Expected: FAIL，旧断言没有 `order`，store 没有 `reorderBlog`。

- [ ] **Step 3: 接入主进程读写与 IPC**

在 `blog-collection.ts` 引入 `loadBlogCache` 和纯逻辑：

```ts
import { loadBlogCache } from './library-data'
import { reconcileBlogOrder, reorderBlog } from '../../src/lib/blog-groups'

export function saveCollection(
  lib: string,
  collection: BlogCollectionFile,
  change?: BlogOrderChange,
  articles = loadBlogCache(lib).cache.articles
): void {
  safeWriteJson(collectionPath(lib), { ...collection, order: reconcileBlogOrder(collection, articles, change) })
}
```

`loadCollection` 同样用 cache 校正 raw order，但不写盘。新增 IPC 时先按请求调用 `reorderBlog(current.order!, request)`，再 `saveCollection`；非法请求或写入异常返回 `{ ok: false, message }`。在 `IpcApi`、preload 和 renderer facade 使用同一 `BlogReorderRequest` 类型。

- [ ] **Step 4: 实现 store 的乐观更新与回滚**

```ts
reorderBlog: async (request) => {
  const previous = get().blogCollection
  if (!previous.order) return
  set({ blogCollection: { ...previous, order: reorderBlog(previous.order, request) } })
  const result = await ipc.anthropicCollectionReorder(request)
  if (result.ok) set({ blogCollection: result.collection })
  else {
    set({ blogCollection: previous })
    get().showToast('排序保存失败，请重试')
  }
}
```

- [ ] **Step 5: 运行测试并确认通过**

Run: `npx vitest run tests/blog-groups.test.ts tests/blog-collection.test.ts tests/blog-order-store.test.ts`

Expected: 全部 PASS。

- [ ] **Step 6: 提交持久化边界**

```bash
git add electron/lib/blog-collection.ts electron/ipc/anthropic.ts electron/preload.ts src/types/index.ts src/lib/ipc.ts src/store/index.ts tests/blog-collection.test.ts tests/blog-order-store.test.ts
git commit -m "feat: persist blog group ordering"
```

---

### Task 3: 两侧独立筛选与共用标签组件

**Files:**
- Modify: `src/lib/section-filter.ts`
- Create: `src/components/anthropic/BlogFilterTabs.tsx`
- Modify: `src/components/anthropic/AnthropicBlogPanel.tsx:96`
- Modify: `tests/section-filter.test.ts`
- Create: `tests/blog-filter-tabs.test.tsx`

**Interfaces:**
- Consumes: `ANTHROPIC_SOURCES`、`BlogWallSort`、`sortBlogArticles`。
- Produces:

```ts
export type BlogView = 'mine' | 'all'
export type BlogSourceFilter = 'all' | AnthropicSectionKey
export type BlogViewFilter = { view: BlogView; source: BlogSourceFilter }
export const DEFAULT_BLOG_FILTER: BlogViewFilter

interface BlogFilterTabsProps {
  area: 'list' | 'wall'
  value: BlogViewFilter
  onChange: (next: BlogViewFilter) => void
  theme?: BriefingTheme
}
```

- [ ] **Step 1: 写筛选状态和双侧独立性测试**

替换旧的 Mine/All/多源互斥测试，至少覆盖：

```ts
it('我的视图也保留来源筛选', () => {
  expect(selectBlogSource({ view: 'mine', source: 'all' }, 'research'))
    .toEqual({ view: 'mine', source: 'research' })
})

it('切换我的或全部不清空来源', () => {
  expect(selectBlogView({ view: 'mine', source: 'engineering' }, 'all'))
    .toEqual({ view: 'all', source: 'engineering' })
})
```

在 `tests/blog-filter-tabs.test.tsx` 渲染两个受控 `BlogFilterTabs`，点击 wall 的「全部」后断言 list 仍显示「我的」激活；点击 list 的 Research 后断言 wall 的来源不变。

- [ ] **Step 2: 运行测试并确认失败**

Run: `npx vitest run tests/section-filter.test.ts tests/blog-filter-tabs.test.tsx`

Expected: FAIL，新函数和组件不存在。

- [ ] **Step 3: 实现单来源筛选和标签组件**

```ts
export const DEFAULT_BLOG_FILTER: BlogViewFilter = { view: 'mine', source: 'all' }
export const selectBlogView = (filter: BlogViewFilter, view: BlogView): BlogViewFilter => ({ ...filter, view })
export const selectBlogSource = (filter: BlogViewFilter, source: BlogSourceFilter): BlogViewFilter => ({ ...filter, source })
```

`BlogFilterTabs` 始终渲染来源二级标签；一级只有「我的 / 全部」。使用 `data-testid="${area}-view-${view}"` 与 `data-testid="${area}-source-${source}"`，两种主题沿用现有边框、文字和 option 配色。

- [ ] **Step 4: 将 panel 改为两套状态**

```ts
const [listFilter, setListFilter] = useState<BlogViewFilter>(DEFAULT_BLOG_FILTER)
const [wallFilter, setWallFilter] = useState<BlogViewFilter>(DEFAULT_BLOG_FILTER)
```

第二列查询只过滤 list；wall 继续使用自己的 `wallSort` 和 `sortBlogArticles`，内置报告在全部来源下置顶。移除共享 `filter` 以及旧的 `toggleMineChip/toggleSourceChip` 调用。

- [ ] **Step 5: 运行测试并确认通过**

Run: `npx vitest run tests/section-filter.test.ts tests/blog-filter-tabs.test.tsx tests/anthropic-blog-panel.test.tsx`

Expected: 全部 PASS；旧多源断言已由新单源状态机取代。

- [ ] **Step 6: 提交筛选边界**

```bash
git add src/lib/section-filter.ts src/components/anthropic/BlogFilterTabs.tsx src/components/anthropic/AnthropicBlogPanel.tsx tests/section-filter.test.ts tests/blog-filter-tabs.test.tsx tests/anthropic-blog-panel.test.tsx
git commit -m "feat: separate blog list and wall filters"
```

---

### Task 4: 共享分组标题与推荐工具

**Files:**
- Create: `src/components/anthropic/BlogMineGroupSection.tsx`
- Create: `src/components/anthropic/BlogRecommendationTools.tsx`
- Create: `tests/blog-mine-group-section.test.tsx`
- Modify: `tests/blog-collection-section.test.tsx`

**Interfaces:**
- Consumes: 现有 `BlogRecommendDialog`、推荐 store actions、`RecommendStage`。
- Produces:

```tsx
interface BlogMineGroupSectionProps {
  area: 'list' | 'wall'
  group: BlogMineGroup
  label: string
  count: number
  collapsed: boolean
  onToggle: () => void
  onGroupDragStart: (event: React.DragEvent<HTMLElement>) => void
  onGroupDragOver: (event: React.DragEvent<HTMLElement>) => void
  onGroupDrop: (event: React.DragEvent<HTMLElement>) => void
  recommendationTools?: React.ReactNode
  children: React.ReactNode
}
```

- [ ] **Step 1: 写推荐位置、折叠和手柄可见性测试**

```tsx
it('推荐工具紧跟收藏标题并位于卡片之前', () => {
  render(<BlogMineGroupSection {...props} group="favorite" recommendationTools={<div data-testid="tools" />}><div data-testid="cards" /></BlogMineGroupSection>)
  const header = screen.getByTestId('wall-group-header-favorite')
  const tools = screen.getByTestId('tools')
  const cards = screen.getByTestId('cards')
  expect(header.compareDocumentPosition(tools)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  expect(tools.compareDocumentPosition(cards)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
})

it('收藏折叠时工具和内容一起隐藏', () => {
  render(<BlogMineGroupSection {...props} group="favorite" collapsed recommendationTools={<div data-testid="tools" />}><div data-testid="cards" /></BlogMineGroupSection>)
  expect(screen.queryByTestId('tools')).not.toBeInTheDocument()
  expect(screen.queryByTestId('cards')).not.toBeInTheDocument()
})
```

另测手柄类名为 `opacity-0 group-hover/header:opacity-100`，折叠按钮点击只调用 `onToggle`，不调用拖拽回调。

- [ ] **Step 2: 运行测试并确认失败**

Run: `npx vitest run tests/blog-mine-group-section.test.tsx`

Expected: FAIL，组件不存在。

- [ ] **Step 3: 实现分组结构**

```tsx
<section data-group-section={group}>
  <div data-testid={`${area}-group-header-${group}`} draggable onDragStart={onGroupDragStart} onDragOver={onGroupDragOver} onDrop={onGroupDrop} className="group/header">
    <span className="opacity-0 group-hover/header:opacity-100" data-testid={`${area}-group-handle-${group}`}>⠿</span>
    <button type="button" onClick={onToggle} aria-label={`${collapsed ? '展开' : '收起'}${label}`}>{collapsed ? '▸' : '▾'}</button>
    <h3>{label}</h3><span>{count}</span>
  </div>
  {!collapsed && <>{recommendationTools}<div data-testid={`${area}-group-content-${group}`}>{children}</div></>}
</section>
```

- [ ] **Step 4: 提取推荐工具并保留现有行为**

`BlogRecommendationTools` 直接使用现有 store：`openRecommendView(history[0].batch)`、`startBlogRecommend(note)`、`cancelBlogRecommend()`。保留推荐备注对话框、阶段文案、生成中取消和空历史时不显示记录按钮。不得复制一套推荐请求逻辑。

- [ ] **Step 5: 运行测试并确认通过**

Run: `npx vitest run tests/blog-mine-group-section.test.tsx tests/blog-collection-section.test.tsx tests/blog-recommend-view.test.tsx`

Expected: 全部 PASS。

- [ ] **Step 6: 提交共享组件**

```bash
git add src/components/anthropic/BlogMineGroupSection.tsx src/components/anthropic/BlogRecommendationTools.tsx tests/blog-mine-group-section.test.tsx tests/blog-collection-section.test.tsx
git commit -m "feat: add shared blog group sections"
```

---

### Task 5: 第二列三组、生命周期与现有操作平移

**Files:**
- Modify: `src/components/anthropic/BlogCollectionSection.tsx`
- Modify: `src/components/anthropic/AnthropicBlogPanel.tsx`
- Modify: `src/components/anthropic/AnthropicArticleRow.tsx`
- Modify: `electron/ipc/anthropic.ts`
- Modify: `electron/lib/blog-collection.ts`
- Modify: `tests/blog-collection-section.test.tsx`
- Modify: `tests/anthropic-article-row.test.tsx`
- Modify: `tests/anthropic-delete.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `deriveBlogMineGroups`、Task 2 的 `saveCollection(..., change?, articles?)`、Task 4 的分组与推荐组件。
- Produces: `BlogCollectionSection` 接收当前第二列过滤后的 `groups`、`collapsedGroups`、`onToggleGroup`、`onReorder`、`onOpenArticle`、`onRequestDelete`；全部视图仍由 `AnthropicArticleRow` 渲染。

- [ ] **Step 1: 写三组归属和按钮语义测试**

```tsx
it('已保存未读未收藏文章进入 saved，并保留收藏/已读/取消导入按钮', () => {
  render(<BlogCollectionSection {...props} groups={{ ...emptyGroups, saved: [savedArticle] }} />)
  expect(screen.getByTestId('blog-saved-card-saved')).toBeInTheDocument()
  expect(screen.getByTitle('收藏')).toBeInTheDocument()
  expect(screen.getByTitle('标为已读')).toBeInTheDocument()
  expect(screen.getByTitle('取消导入（删除文章）')).toBeInTheDocument()
  fireEvent.click(screen.getByTitle('取消导入（删除文章）'))
  expect(props.onRequestDelete).toHaveBeenCalledWith({ kind: 'mine', article: savedArticle })
})

it('已读与收藏继续使用不同删除请求', () => {
  render(<BlogCollectionSection {...props} groups={{ ...emptyGroups, read: [readArticle], favorite: [favoriteArticle] }} />)
  fireEvent.click(screen.getByTestId('blog-read-remove-read'))
  expect(props.onRequestDelete).toHaveBeenCalledWith(expect.objectContaining({ kind: 'read' }))
  fireEvent.click(screen.getByTestId('blog-collection-remove-favorite'))
  expect(props.onRequestDelete).toHaveBeenCalledWith(expect.objectContaining({ kind: 'collection' }))
})
```

保留推荐理由展开、推荐徽标、缺失文件打开、分组高度调整和空态测试；新增测试确认收藏折叠时推荐工具消失。

- [ ] **Step 2: 运行测试并确认失败**

Run: `npx vitest run tests/blog-collection-section.test.tsx tests/anthropic-article-row.test.tsx`

Expected: FAIL，saved 分组和新 props 尚未实现。

- [ ] **Step 3: 平移第二列并新增已保存卡片**

按 `collection.order.groups` 渲染三组；每组使用 Task 4 标题。`saved` 卡片提供收藏、已读、取消导入；`read` 沿用 ReadCard；`favorite` 沿用 CollectionCard。只有手柄设置 `draggable`，卡片主体 `onClick={() => onOpenArticle(article)}`。

第二列保留每组高度调节 ref 与 pointer handler；整体折叠 rail、更新提示、来源错误和搜索继续留在 `AnthropicBlogPanel`。

- [ ] **Step 4: 将现有状态变更接到顺序校正**

给 `saveCollection` 增加可选 articles 快照，避免导入／删除时读到旧磁盘缓存：

```ts
saveCollection(lib, next, { sourceUrl, to: 'favorite', position: 'prepend' }, articles)
saveCollection(lib, next, { sourceUrl, to: 'read', position: 'prepend' }, articles)
saveCollection(lib, next, { sourceUrl, to: 'saved', position: 'prepend' }, articles)
```

在 collectionAdd、markRead 使用对应目标；remove／removeRead 使用 `to: 'saved'`，由纯逻辑判断文章是否确实符合 saved。推荐完成只 normalize，新推荐在 favorite 末尾追加。

导入成功时构造 `isSaved: true, filePath` 的 articles 快照并转入 saved；删除成功时构造 `isSaved: false` 的快照并 normalize，从 saved 删除但保留其他标记。复用现有删除确认，不新增第二套删除入口。

- [ ] **Step 5: 运行测试并确认通过**

Run: `npx vitest run tests/blog-groups.test.ts tests/blog-collection.test.ts tests/blog-collection-section.test.tsx tests/anthropic-article-row.test.tsx tests/anthropic-delete.test.ts`

Expected: 全部 PASS。

- [ ] **Step 6: 提交第二列与生命周期**

```bash
git add src/components/anthropic/BlogCollectionSection.tsx src/components/anthropic/AnthropicBlogPanel.tsx src/components/anthropic/AnthropicArticleRow.tsx electron/ipc/anthropic.ts electron/lib/blog-collection.ts tests/blog-collection-section.test.tsx tests/anthropic-article-row.test.tsx tests/anthropic-delete.test.ts
git commit -m "feat: add saved read and favorite blog groups"
```

---

### Task 6: 专辑墙三组与手柄拖拽

**Files:**
- Modify: `src/components/anthropic/BlogWall.tsx`
- Modify: `src/components/anthropic/AnthropicBlogPanel.tsx`
- Modify: `tests/blog-wall.test.tsx`
- Modify: `tests/anthropic-blog-panel.test.tsx`

**Interfaces:**
- Consumes: Task 1 的 `BlogReorderRequest`、Task 2 的 `reorderBlog`、Task 3 的独立 filter、Task 4 的分组与推荐组件、Task 5 的三组数据。
- Produces: `BlogWall` 接收 `filter`、`groups`、`order`、`collapsedGroups`、`onToggleGroup`、`onReorder`；`onOpenArticle` 和现有删除／标记回调保持原语义。

- [ ] **Step 1: 写手柄与正文点击分离测试**

在 `tests/blog-wall.test.tsx` 增加：

```tsx
function readDataTransfer(group: string, sourceUrl: string): DataTransfer {
  const values: Record<string, string> = {
    'application/x-blog-article': JSON.stringify({ group, sourceUrl }),
  }
  return {
    getData: (type: string) => values[type] ?? '',
    types: Object.keys(values),
  } as unknown as DataTransfer
}

it('只有手柄可拖拽，正文点击仍打开文章', () => {
  const current = wallProps()
  render(<BlogWall {...current} filter={{ view: 'mine', source: 'all' }} />)
  const card = screen.getByTestId('blog-wall-card-saved')
  const handle = screen.getByTestId('blog-wall-article-handle-saved')
  expect(card).not.toHaveAttribute('draggable')
  expect(handle).toHaveAttribute('draggable', 'true')
  fireEvent.click(card)
  expect(current.onOpenArticle).toHaveBeenCalledWith(expect.objectContaining({ url: 'saved' }))
  fireEvent.keyDown(card, { key: 'Enter' })
  fireEvent.keyDown(card, { key: ' ' })
  expect(current.onOpenArticle).toHaveBeenCalledTimes(3)
  expect(current.onReorder).not.toHaveBeenCalled()
})

it('拖到其他分组不发送排序请求', () => {
  const current = wallProps()
  render(<BlogWall {...current} filter={{ view: 'mine', source: 'all' }} />)
  fireEvent.drop(screen.getByTestId('blog-wall-group-content-read'), { dataTransfer: readDataTransfer('saved', 'saved') })
  expect(current.onReorder).not.toHaveBeenCalled()
})
```

另测三组同屏、组名顺序来自 `order.groups`、收藏推荐工具位置、折叠独立，以及全部视图仍渲染日期排序而不渲染手柄。

- [ ] **Step 2: 运行测试并确认失败**

Run: `npx vitest run tests/blog-wall.test.tsx tests/anthropic-blog-panel.test.tsx`

Expected: FAIL，旧 BlogWall props 与新拖拽结构不一致。

- [ ] **Step 3: 实现专辑墙分组与卡片操作**

我的视图按 `order.groups` 渲染 `BlogMineGroupSection`；收藏组的 `recommendationTools` 使用共享组件。每组卡片按对应 URL 顺序显示，过滤只改变可见集合。

卡片结构必须保持：

```tsx
<article
  data-testid={`blog-wall-card-${article.url}`}
  role="button"
  tabIndex={0}
  onClick={() => onOpenArticle(article)}
  onKeyDown={event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onOpenArticle(article)
    }
  }}
>
  <span
    data-testid={`blog-wall-article-handle-${article.url}`}
    draggable
    onClick={event => event.stopPropagation()}
    onDragStart={event => startArticleDrag(event, group, article.url)}
    className="opacity-0 group-hover:opacity-100"
  >⠿</span>
  <div onClick={event => event.stopPropagation()}>{articleActions}</div>
  {articleCoverAndTitle}
</article>
```

- [ ] **Step 4: 实现分组和文章放置规则**

拖拽 dataTransfer 分别写入 `application/x-blog-group` 与 `application/x-blog-article`。drop 时生成 Task 1 已定义的请求：

```ts
onReorder({ kind: 'article', group, sourceUrl, targetUrl, placement })
onReorder({ kind: 'group', source, target, placement })
```

只有 payload 类型和目标组匹配时才 `preventDefault` 并接受 drop；没有可见目标文章时不调用排序。专辑墙以目标卡片水平中线计算 before/after，第二列以列表行垂直中线计算。操作按钮和手柄事件停止冒泡，拖拽后的 click 不得再次打开文章。

- [ ] **Step 5: 接入统一 store action**

第二列与专辑墙的 `onReorder` 都调用 `void useStore.getState().reorderBlog(request)`。成功返回完整 collection 后两侧一起刷新；失败由 Task 2 的回滚处理。不得分别维护两份文章顺序。

- [ ] **Step 6: 运行测试并确认通过**

Run: `npx vitest run tests/blog-wall.test.tsx tests/anthropic-blog-panel.test.tsx tests/blog-mine-group-section.test.tsx tests/blog-order-store.test.ts`

Expected: 全部 PASS。

- [ ] **Step 7: 提交专辑墙与拖拽**

```bash
git add src/components/anthropic/BlogWall.tsx src/components/anthropic/AnthropicBlogPanel.tsx tests/blog-wall.test.tsx tests/anthropic-blog-panel.test.tsx
git commit -m "feat: add interactive blog album groups"
```

---

### Task 7: 定向回归、文档与交付

**Files:**
- Modify: `e2e/specs/blog-collection.spec.ts`
- Modify: `e2e/specs/blog-album-wall.spec.ts`
- Modify: `e2e/specs/anthropic-blog-multi-source.spec.ts`
- Modify: `e2e/specs/anthropic-blog-ui.spec.ts`
- Modify: `e2e/source-map.json:120`
- Modify: `docs/README.md:53`
- Modify: `docs/superpowers/specs/2026-11-13-blog-my-groups-and-ordering-design.md`
- Modify: `docs/superpowers/plans/2026-11-13-blog-my-groups-and-ordering.md`

**Interfaces:**
- Consumes: 前六个任务的全部 UI、IPC 和持久化行为。
- Produces: 可审查的完整功能、更新后的现状文档和可重复运行的定向验证命令。

- [ ] **Step 1: 更新定向 E2E 覆盖最终交互**

在现有 spec 中更新旧 Mine/All 选择器，并增加以下场景，不新建重复 spec：

```ts
test('我的三组独立筛选、手柄排序与重启持久化', async ({ window, testLibraryPath, testConfigDir }) => {
  const { aUrl, bUrl } = seedArticles(testLibraryPath, testConfigDir)
  await gotoBlog(window)
  await window.getByTestId('wall-view-all').click()
  await expect(window.getByTestId('list-view-mine')).toHaveAttribute('aria-pressed', 'true')
  await window.getByTestId('wall-source-research').click()
  await expect(window.getByTestId('list-source-all')).toHaveAttribute('aria-pressed', 'true')

  await window.getByTestId('wall-source-all').click()
  await window.getByTestId('wall-view-mine').click()
  const handle = window.getByTestId(`blog-wall-article-handle-${aUrl}`)
  const target = window.getByTestId(`blog-wall-card-${bUrl}`)
  await handle.dragTo(target, { targetPosition: { x: 20, y: 20 } })
  const expectedOrder = `${bUrl},${aUrl}`
  await expect(window.getByTestId('blog-list-saved-order')).toHaveAttribute('data-order', expectedOrder)
  await window.reload()
  await gotoBlog(window)
  await window.getByTestId('wall-view-mine').click()
  await expect(window.getByTestId('blog-wall-saved-order')).toHaveAttribute('data-order', expectedOrder)
})
```

把 `seedArticles` 的返回值扩展为 `{ aUrl, bUrl, aPath, aTitle }`；两个分组容器的 `data-order` 均使用当前完整组内 URL 顺序 `join(',')`。另覆盖：三组折叠、推荐工具随收藏折叠、分组拖拽、取消已读回 saved、推荐移出写 dismissed、删除批次不改 read、全部日期排序、内置报告置顶和报纸版控件。

- [ ] **Step 2: 更新 source-map 并先运行所有受影响单元测试**

在 `anthropic-blog.sources` 添加 `src/lib/blog-groups.ts`；组件已由 `src/components/anthropic/**` 覆盖。

Run:

```bash
npx vitest run tests/blog-groups.test.ts tests/blog-collection.test.ts tests/blog-order-store.test.ts tests/section-filter.test.ts tests/blog-filter-tabs.test.tsx tests/blog-mine-group-section.test.tsx tests/blog-collection-section.test.tsx tests/blog-wall.test.tsx tests/anthropic-blog-panel.test.tsx tests/anthropic-article-row.test.tsx tests/anthropic-delete.test.ts tests/blog-recommend-view.test.tsx
```

Expected: 所有指定文件 PASS，无未处理异常。

- [ ] **Step 3: 构建并检查文档**

Run: `npm run build`

Expected: renderer、main、preload TypeScript 与 electron-vite build 全部成功。

Run: `npm run docs:check`

Expected: 文档引用、frontmatter 和索引检查全部通过。

- [ ] **Step 4: 经用户明确确认后运行定向 E2E**

先列出受影响 spec：

Run: `node scripts/e2e-changed.js`

用户确认允许启动 Electron E2E 后：

Run: `node scripts/e2e-changed.js --run --no-retries`

Expected: 受影响 spec 全部 PASS；若出现失败，只处理本次改动导致的问题，不扩大范围。

- [ ] **Step 5: 更新现状文档与完成记录**

将 `docs/README.md` 域 7 的现状改为「我的三组 + 独立筛选 + 共享排序」，移除 planned 指针并保留历史链。功能落地后把本 spec 和 plan 标为 `status: historical`；不得把计划文档描述成未完成的当前设计。

再次运行 `npm run docs:check`，Expected: 全部通过。

- [ ] **Step 6: 提交最终回归与文档**

```bash
git add e2e/specs/blog-collection.spec.ts e2e/specs/blog-album-wall.spec.ts e2e/specs/anthropic-blog-multi-source.spec.ts e2e/specs/anthropic-blog-ui.spec.ts e2e/source-map.json docs/README.md docs/superpowers/specs/2026-11-13-blog-my-groups-and-ordering-design.md docs/superpowers/plans/2026-11-13-blog-my-groups-and-ordering.md
git commit -m "test: cover blog groups and ordering"
```

- [ ] **Step 7: 按项目协议收尾**

确认 worktree 无未提交改动，向用户汇报修改、测试、分支和 worktree，询问是否合并。未经明确授权不合并主工作区。需求归档遵循 notepad-triage：app 运行时让用户点击 ✓，app 关闭后才可移动条目并释放 `codex/blog-my-groups` 认领。
