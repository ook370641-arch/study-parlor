# 博客面板 UI 打磨批实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 spec `docs/superpowers/specs/2026-09-23-blog-panel-ui-polish-design.md` 落地五项：Mine 移出库按钮、列表字号/缩略图缩小、对照模式点击不可见 Bug 修复、博客列双滚动条、已读/收藏夹区图标化+卡片化。

**Architecture:** 纯渲染层改动（`AnthropicBlogPanel`/`AnthropicArticleRow`/`BlogCollectionSection`/`AnthropicArticleReader` + 字号常量），新增一个图标组件文件；数据层（`deleteAnthropicArticle`/`toggleBlogRead` 等 store actions）全部复用，不改 IPC。三处删除入口统一走 panel 级 `pendingDelete` ConfirmDialog（union 类型区分 mine/collection/read 三种文案与复合动作）。

**Tech Stack:** React 18 + Zustand + Tailwind + Vitest + Testing Library + Playwright E2E。

## Global Constraints

- **禁止触碰并行会话文件**：`electron/lib/anthropic-browser.ts`、`electron/lib/anthropic-scraper.ts`、`electron/ipc/anthropic.ts`、`electron/lib/run-queue.ts`、`tests/run-queue.test.ts`（工作树有未提交改动，属另一会话的 scraper 队列工作）。
- **禁止 `git stash`**；每个 Task 只 `git add` 本任务列出的文件后提交（多会话并行，快照差分式提交）。
- 图标一律内联 SVG（不引图标库）；stroke 1.8、24 viewBox；未激活 `parchment/30`（报纸 `#6b5d52`/40），激活 `#d97757`。
- 保留所有现有 `data-testid`（`blog-fav-toggle`/`blog-read-mark`/`blog-read-toggle`/`blog-collection-collapse`/`blog-rec-history`/`blog-recommend-button`/`blog-collection-open-*`/`blog-collection-remove-*`/`blog-collection-reason-*`/`blog-read-open-*`/`blog-read-remove-*`/`blog-reader-fav`/`blog-reader-read`）。
- 验证只跑受影响测试：`npx vitest run <改动对应测试文件>` + `node scripts/e2e-changed.js --run --no-retries`；**禁止全量** `npx vitest run` / `npm run test:e2e`。
- E2E 跑 `out/` 产物：`e2e-changed.js --run` 会自动先构建；手动 playwright 前必须 `npx electron-vite build`。
- 组件文件只导出组件（ui-styling §10）；helper 移 `src/lib/`。

## 根因记录（§3 Bug，调查已完成）

- **症状 1（点已导入文章完全无反应）**：用户 `~/.studyparlor/state.json` 中 `articlePanelMode.anthropic` 被持久化为 `"companion"`（已核实）。此时 `AnthropicArticleRow.handleClick` 把已保存文章的点击静默路由到右侧对照槽（`selectArticleCompanion`），主阅读区不变；若导读面板处于折叠态（`articleAssistantGuideCollapsed`，面板宽度 0），屏幕上** literally 无任何变化**。
- **症状 2（点未导入文章报「页面加载失败」）**：共享抓取窗口的导航竞态——页面挂载后自动 `discover` 新文章检测仍在跑，此刻点未导入文章触发 import，`loadURL` 互相打断，`did-fail-load` 触发 `ERR_ABORTED`，旧代码里 import 的 once 监听器捕获到这次 abort → `Load failed:` → `classifyError` 映射为 network-error「页面加载失败」。并行会话的 run-queue（抓取窗口串行化）正是修这一类竞态，本计划只做验证（Task 7），不重复修。

---

### Task 1: blog-icons 图标组件

**Files:**
- Create: `src/components/anthropic/blog-icons.tsx`
- Test: `tests/blog-icons.test.tsx`

**Interfaces:**
- Produces:
  - `BookIcon({ active?, size?, className? })` — 已读标记/已读区头；active=实心琥珀
  - `BookmarkIcon({ active?, size?, className? })` — 收藏标记/收藏夹区头
  - `HistoryIcon({ size?, className? })` — 推荐记录按钮
  - `RefreshIcon({ size?, className? })` — 重新推荐按钮
  - `UnimportIcon({ size?, className? })` — 移出/移出库（托盘上移箭头）
  - 共同 props：`active?: boolean`（仅 Book/Bookmark）、`size?: number`（默认 14）、`className?: string`

- [ ] **Step 1: 写失败测试**

```tsx
// tests/blog-icons.test.tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BookIcon, BookmarkIcon, HistoryIcon, RefreshIcon, UnimportIcon } from '@/components/anthropic/blog-icons'

describe('blog-icons', () => {
  it('五个图标都渲染 svg，带各自 testid', () => {
    render(<>
      <BookIcon /><BookmarkIcon /><HistoryIcon /><RefreshIcon /><UnimportIcon />
    </>)
    for (const id of ['blog-icon-book', 'blog-icon-bookmark', 'blog-icon-history', 'blog-icon-refresh', 'blog-icon-unimport']) {
      expect(screen.getByTestId(id)).toBeInTheDocument()
    }
  })
  it('Book/Bookmark 激活态用实心填充', () => {
    render(<><BookIcon active /><BookmarkIcon active /></>)
    expect(screen.getByTestId('blog-icon-book')).toHaveAttribute('fill', 'currentColor')
    expect(screen.getByTestId('blog-icon-bookmark')).toHaveAttribute('fill', 'currentColor')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/blog-icons.test.tsx`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现图标组件**

```tsx
// src/components/anthropic/blog-icons.tsx
// 博客面板统一图标族（spec: 2026-09-23-blog-panel-ui-polish-design.md §5）
// 内联 SVG，stroke 1.8；颜色由 className 传入（未激活 parchment/30，激活 text-ember）
interface BlogIconProps {
  active?: boolean
  size?: number
  className?: string
}

export function BookIcon({ active = false, size = 14, className }: BlogIconProps) {
  return (
    <svg data-testid="blog-icon-book" width={size} height={size} viewBox="0 0 24 24"
      fill={active ? 'currentColor' : 'none'} stroke="currentColor"
      strokeWidth={active ? 1.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 7v14" fill="none" />
      <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"
        opacity={active ? 0.4 : 1} />
    </svg>
  )
}

export function BookmarkIcon({ active = false, size = 14, className }: BlogIconProps) {
  return (
    <svg data-testid="blog-icon-bookmark" width={size} height={size} viewBox="0 0 24 24"
      fill={active ? 'currentColor' : 'none'} stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  )
}

export function HistoryIcon({ size = 14, className }: BlogIconProps) {
  return (
    <svg data-testid="blog-icon-history" width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </svg>
  )
}

export function RefreshIcon({ size = 14, className }: BlogIconProps) {
  return (
    <svg data-testid="blog-icon-refresh" width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  )
}

export function UnimportIcon({ size = 14, className }: BlogIconProps) {
  return (
    <svg data-testid="blog-icon-unimport" width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
      <path d="M12 3v6" />
      <path d="m9 6 3-3 3 3" />
    </svg>
  )
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/blog-icons.test.tsx`
Expected: PASS（2 个用例）

- [ ] **Step 5: Commit**

```bash
git add src/components/anthropic/blog-icons.tsx tests/blog-icons.test.tsx
git commit -m "feat(blog): 博客面板统一图标族（书/书签/历史/刷新/移出库）"
```

---

### Task 2: §3a 对照模式点击不可见修复（toast + 自动展开面板）

**Files:**
- Modify: `src/components/anthropic/AnthropicArticleRow.tsx`（handleClick 对照分支，第 72-81 行）
- Modify: `src/components/anthropic/AnthropicBlogPanel.tsx`（openOrImportArticle 对照分支，第 178-186 行）
- Test: `tests/anthropic-blog-panel.test.tsx`

**Interfaces:**
- Consumes: store 现有 `selectArticleCompanion`、`showToast`、`setArticleAssistantGuideCollapsed`（后者已在 `ArticleAssistantPanel.tsx:81` 使用，签名 `(collapsed: boolean) => void`）
- Produces: 无新接口

- [ ] **Step 1: 写失败测试**

追加到 `tests/anthropic-blog-panel.test.tsx`（文件内已有 `article()` 工厂与 store seed 模式，照抄既有用例的 seed 结构）：

```tsx
it('对照模式下点已保存文章：路由到对照槽，并 toast 提示 + 自动展开导读面板', async () => {
  const selectArticleCompanion = vi.fn()
  const showToast = vi.fn()
  const setArticleAssistantGuideCollapsed = vi.fn()
  useStore.setState({
    anthropicBlogCache: {
      lastFetchedAt: null,
      articles: [{ ...article('old-1', 'Old Article'), isSaved: true, filePath: 'lib/old-1.md' }],
      loading: false, error: null, sectionStatus: {},
    },
    anthropicReaderFilePath: 'lib/current.md',
    articlePanelMode: { anthropic: 'companion', scout: 'guide', job: 'guide' },
    selectArticleCompanion, showToast, setArticleAssistantGuideCollapsed,
  } as any)
  render(<AnthropicBlogPanel theme="academic" />)
  fireEvent.click(screen.getByTestId('anthropic-article-row'))
  await waitFor(() =>
    expect(selectArticleCompanion).toHaveBeenCalledWith('anthropic', 'lib/current.md', 'lib/old-1.md'))
  expect(setArticleAssistantGuideCollapsed).toHaveBeenCalledWith(false)
  expect(showToast).toHaveBeenCalledWith(expect.stringContaining('对照'))
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/anthropic-blog-panel.test.tsx`
Expected: 新用例 FAIL（未调用 setArticleAssistantGuideCollapsed / showToast）。若文件里已有对照路由的旧断言因此需要调整，一并更新但保留路由行为断言。

- [ ] **Step 3: 实现修复**

`AnthropicArticleRow.tsx` handleClick 对照分支（第 73-81 行）改为：

```tsx
    // 对照模式：已保存文章改为在右侧对照槽打开（主区正文不变）。
    // 路由必须可见：强制展开导读面板 + toast，否则面板折叠时点了像没反应（2026-09-23 根因）
    if (useStore.getState().articlePanelMode.anthropic === 'companion' && article.isSaved && article.filePath) {
      const st = useStore.getState()
      const main = st.anthropicReaderFilePath
      if (main === article.filePath) {
        st.showToast('该文章已在主区打开')
        return
      }
      st.setArticleAssistantGuideCollapsed(false)
      st.showToast('已在右侧对照区打开')
      await st.selectArticleCompanion('anthropic', main ?? 'anthropic-main', article.filePath)
      return
    }
```

`AnthropicBlogPanel.tsx` openOrImportArticle 对照分支（第 178-186 行）同样改为先 `setArticleAssistantGuideCollapsed(false)` + `showToast('已在右侧对照区打开')` 再 `selectArticleCompanion`（同一模式，两块代码保持逐字一致）。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/anthropic-blog-panel.test.tsx`
Expected: PASS（全新增用例 + 文件内旧用例）

- [ ] **Step 5: Commit**

```bash
git add src/components/anthropic/AnthropicArticleRow.tsx src/components/anthropic/AnthropicBlogPanel.tsx tests/anthropic-blog-panel.test.tsx
git commit -m "fix(blog): 对照模式点击路由补可见性——自动展开面板 + toast 提示"
```

---

### Task 3: §2 列表标题字号下调 + 缩略图缩小

**Files:**
- Modify: `src/lib/briefing-font-size.ts`（`BRIEFING_LIST_STYLES` title 列，第 68-79 行）
- Modify: `src/components/anthropic/AnthropicArticleRow.tsx`（缩略图/占位/gap，第 208-224 行）
- Test: `tests/briefing-typography.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: `BRIEFING_LIST_STYLES[size].title` 新值（消费方 `Briefing.tsx:186`、`BriefingDateColumn`、`BlogCollectionSection`、`BlogRecommendView` 自动跟随，无需改）

- [ ] **Step 1: 改测试断言（先红）**

`tests/briefing-typography.test.ts` 第 62-63 行：

```ts
expect(BRIEFING_LIST_STYLES.sm.title).toBe('11px')
expect(BRIEFING_LIST_STYLES['7xl'].title).toBe('20px')
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/briefing-typography.test.ts`
Expected: FAIL（13px/22px ≠ 11px/20px）

- [ ] **Step 3: 实现**

`src/lib/briefing-font-size.ts` 的 `BRIEFING_LIST_STYLES` title 每档 −2px（meta 不动）：

```ts
export const BRIEFING_LIST_STYLES: Record<BriefingFontSize, { title: string; meta: string }> = {
  sm: { title: '11px', meta: '10px' },
  base: { title: '12px', meta: '11px' },
  lg: { title: '13px', meta: '12px' },
  xl: { title: '14px', meta: '12px' },
  '2xl': { title: '15px', meta: '13px' },
  '3xl': { title: '16px', meta: '14px' },
  '4xl': { title: '17px', meta: '15px' },
  '5xl': { title: '18px', meta: '16px' },
  '6xl': { title: '19px', meta: '17px' },
  '7xl': { title: '20px', meta: '18px' },
}
```

`AnthropicArticleRow.tsx` 行布局（第 207-224 行区域）：

- `flex items-start gap-4` → `flex items-start gap-3`
- 三处缩略图/占位 `w-20 h-20` → `w-14 h-14`（img、constitution § 占位、无配图占位）
- § 占位字号 `text-3xl` → `text-2xl`

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/briefing-typography.test.ts tests/briefing-page.test.tsx`
Expected: PASS（briefing-page.test.tsx 断言引用常量本身，自动跟随）

- [ ] **Step 5: Commit**

```bash
git add src/lib/briefing-font-size.ts src/components/anthropic/AnthropicArticleRow.tsx tests/briefing-typography.test.ts
git commit -m "feat(blog): 列表标题字号每档 -2px，行缩略图 80→56px"
```

---

### Task 4: §1+§5a 文章行按钮图标化 + Mine 移出库按钮 + panel 删除弹窗 union

**Files:**
- Modify: `src/components/anthropic/AnthropicArticleRow.tsx`（按钮簇，第 174-205 行 + Props）
- Modify: `src/components/anthropic/AnthropicBlogPanel.tsx`（传 `showUnimport`、`pendingDelete` 改 union、弹窗文案）
- Modify: `src/components/anthropic/AnthropicArticleReader.tsx`（头部 ★/✓ → 图标，第 345-368 行）
- Test: `tests/anthropic-blog-panel.test.tsx`

**Interfaces:**
- Consumes: Task 1 的 `BookIcon`/`BookmarkIcon`/`UnimportIcon`
- Produces:
  - `AnthropicArticleRow` 新 prop `showUnimport?: boolean`
  - panel 内 `PendingDelete` union（Task 5 复用）：
    ```ts
    type PendingDelete =
      | { kind: 'mine'; article: AnthropicArticleMeta }
      | { kind: 'collection' | 'read'; sourceUrl: string; filePath: string; title: string }
    ```

- [ ] **Step 1: 写失败测试**

`tests/anthropic-blog-panel.test.tsx` 修改 + 新增：

```tsx
// 修改第 416 行附近旧断言：不再断言字符 ○
it('已保存文章行显示已读按钮，点击调用 markRead', async () => {
  // ...seed 同旧用例...
  const btn = screen.getByTestId('blog-read-mark')
  expect(btn).toHaveAttribute('aria-pressed', 'false')
  fireEvent.click(btn)
  // ...ipc 断言不变...
})

it('Mine 模式下已导入行显示移出库按钮；点击弹确认框，确认后删除', async () => {
  const deleteAnthropicArticle = vi.fn()
  useStore.setState({
    anthropicBlogCache: {
      lastFetchedAt: null,
      articles: [{ ...article('old-1', 'Old Article'), isSaved: true, filePath: 'lib/old-1.md' }],
      loading: false, error: null, sectionStatus: {},
    },
    blogCollection: { version: 1, entries: [], dismissed: [], history: [], read: [] },
    deleteAnthropicArticle,
  } as any)
  render(<AnthropicBlogPanel theme="academic" />)
  // 默认 all 模式：不显示
  expect(screen.queryByTestId('anthropic-row-unimport')).not.toBeInTheDocument()
  // 切到 Mine
  fireEvent.click(screen.getByTestId('anthropic-filter-mine'))
  const btn = screen.getByTestId('anthropic-row-unimport')
  fireEvent.click(btn)
  // 确认弹窗
  expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument()
  fireEvent.click(screen.getByTestId('confirm-dialog-confirm'))
  await waitFor(() => expect(deleteAnthropicArticle).toHaveBeenCalledWith('lib/old-1.md'))
})
```

注意：切 Mine 需要在同一 render 内重渲染（`fireEvent.click` 触发组件内 `setFilter` state，无需 rerender 调用）。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/anthropic-blog-panel.test.tsx`
Expected: 新用例 FAIL（无 `anthropic-row-unimport`）；改过的旧用例 FAIL（`○` 断言已移除但 aria-pressed 仍在——此用例应直接通过，若失败说明旧实现缺 aria-pressed，先看报错再动实现）

- [ ] **Step 3: 实现**

`AnthropicArticleRow.tsx`：

1. Props 加 `showUnimport?: boolean`；顶部 import `{ BookIcon, BookmarkIcon, UnimportIcon } from './blog-icons'`。
2. 收藏/已读两个 span（第 174-205 行）内容从字符换图标，结构/testid/aria 不变：

```tsx
        {onToggleCollection && (
          <span
            data-testid="blog-fav-toggle"
            role="button"
            aria-pressed={inCollection}
            title={inCollection ? '取消收藏' : '收藏'}
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onToggleCollection() }}
            className={`absolute top-2 right-7 z-10 leading-none transition-colors ${
              inCollection
                ? 'text-ember'
                : isAcademic ? 'text-parchment/30 hover:text-ember' : 'text-[#6b5d52]/40 hover:text-ember'
            }`}
          >
            <BookmarkIcon active={inCollection} />
          </span>
        )}

        {onToggleRead && (
          <span
            data-testid="blog-read-mark"
            role="button"
            aria-pressed={isRead}
            title={isRead ? '已读（点击取消）' : '标为已读'}
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onToggleRead() }}
            className={`absolute top-2 right-2 z-10 leading-none transition-colors ${
              isRead
                ? 'text-ember'
                : isAcademic ? 'text-parchment/30 hover:text-ember' : 'text-[#6b5d52]/40 hover:text-ember'
            }`}
          >
            <BookIcon active={isRead} />
          </span>
        )}

        {showUnimport && onRequestDelete && article.isSaved && article.filePath && !article.local && (
          <span
            data-testid="anthropic-row-unimport"
            role="button"
            title="取消导入（删除文章）"
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onRequestDelete(article) }}
            className={`absolute top-2 right-12 z-10 leading-none transition-colors ${
              isAcademic ? 'text-parchment/30 hover:text-red-400' : 'text-[#6b5d52]/40 hover:text-red-600'
            }`}
          >
            <UnimportIcon />
          </span>
        )}
```

（按钮簇左→右：移出库 right-12 → 收藏 right-7 → 已读 right-2；非 Mine 时移出库不渲染，其余位置不变。）

3. `AnthropicBlogPanel.tsx`：
   - `pendingDelete` state 改 union：

```ts
type PendingDelete =
  | { kind: 'mine'; article: AnthropicArticleMeta }
  | { kind: 'collection' | 'read'; sourceUrl: string; filePath: string; title: string }
const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
```

   - 行渲染处传 `showUnimport={filter.mode === 'mine'}`，`onRequestDelete={(a) => setPendingDelete({ kind: 'mine', article: a })}`。
   - ConfirmDialog 改动态文案：

```tsx
      <ConfirmDialog
        open={pendingDelete !== null}
        title={pendingDelete?.kind === 'collection' ? '移出收藏并删除' : pendingDelete?.kind === 'read' ? '移出已读并删除' : '取消导入'}
        icon="trash"
        confirmLabel="删除"
        confirmVariant="danger"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const target = pendingDelete
          setPendingDelete(null)
          if (!target) return
          if (target.kind === 'mine') {
            if (target.article.filePath) void deleteAnthropicArticle(target.article.filePath)
          } else {
            if (target.kind === 'collection') void removeBlogCollection(target.sourceUrl)
            else void removeBlogRead(target.sourceUrl)
            void deleteAnthropicArticle(target.filePath)
          }
        }}
      >
        <p>「{pendingDelete?.kind === 'mine' ? pendingDelete.article.title : pendingDelete?.title}」的文章文件将被删除。</p>
        <p className="mt-2">卡片回到待导入状态，其他标记保留；将同时删除该文章的旁注对话、标注与导读。</p>
      </ConfirmDialog>
```

   - store 取 `removeBlogCollection`/`removeBlogRead` 两个 action（第 80 行附近已取 toggle 系列，补这两个）。

4. `AnthropicArticleReader.tsx` 头部（第 347-367 行）：`{inCollection ? '★' : '☆'}` → `<BookmarkIcon active={inCollection} />`；`{isRead ? '✓' : '○'}` → `<BookIcon active={isRead} />`；import 图标组件。testid/aria-pressed/onClick 全保留。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/anthropic-blog-panel.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/anthropic/AnthropicArticleRow.tsx src/components/anthropic/AnthropicBlogPanel.tsx src/components/anthropic/AnthropicArticleReader.tsx tests/anthropic-blog-panel.test.tsx
git commit -m "feat(blog): 行按钮图标化 + Mine 移出库入口（确认弹窗 union 化）"
```

---

### Task 5: §5b BlogCollectionSection 卡片化重构 + 复合移出

**Files:**
- Modify: `src/components/anthropic/BlogCollectionSection.tsx`（整体重构）
- Modify: `src/components/anthropic/AnthropicBlogPanel.tsx`（传 `onRequestRemove` 给 section）
- Test: `tests/blog-collection-section.test.tsx`
- Test: `tests/anthropic-blog-panel.test.tsx`（复合删除确认流）
- E2E: `e2e/specs/blog-collection.spec.ts`（确认弹窗一步 + 计数 testid）

**Interfaces:**
- Consumes: Task 1 图标；Task 4 的 `PendingDelete` union
- Produces:
  - `BlogCollectionSection` 新必需 prop：`onRequestRemove: (t: { kind: 'collection' | 'read'; sourceUrl: string; filePath: string; title: string }) => void`
  - 新 testid：`blog-read-count`、`blog-collection-count`（区头计数，替代原文字标签断言点）

- [ ] **Step 1: 写失败测试**

`tests/blog-collection-section.test.tsx` 全量更新（render 一律传 `onRequestRemove={vi.fn()}`）：

```tsx
it('已读区默认折叠，展开后点移出按钮上抛 read 复合删除请求', async () => {
  const onRequestRemove = vi.fn()
  render(<BlogCollectionSection theme="academic" onRequestRemove={onRequestRemove} />)
  fireEvent.click(screen.getByTestId('blog-read-toggle'))
  fireEvent.click(screen.getByTestId('blog-read-remove-https://anthropic.com/r'))
  expect(onRequestRemove).toHaveBeenCalledWith({
    kind: 'read', sourceUrl: 'https://anthropic.com/r', filePath: 'lib/r.md', title: '已读文',
  })
  // 不再直接调 IPC
  expect(mockIpc.anthropicCollectionRemoveRead).not.toHaveBeenCalled()
})

it('区头为图标+计数（无「已读」文字标签）', () => {
  render(<BlogCollectionSection theme="academic" onRequestRemove={vi.fn()} />)
  expect(screen.getByTestId('blog-read-count')).toHaveTextContent('1')
  expect(screen.getByTestId('blog-read-toggle')).toHaveAttribute('title', '已读')
})

it('收藏夹排序：手动在前，推荐（💡）后置，组内保序', () => {
  useStore.setState({
    blogCollection: {
      version: 1, dismissed: [], history: [], read: [],
      entries: [
        { sourceUrl: 'u-r1', filePath: 'lib/r1.md', title: '推荐一', addedAt: 'a', origin: 'recommend' as const, batch: 1, reason: 'r', gap: 'g' },
        { sourceUrl: 'u-m1', filePath: 'lib/m1.md', title: '手动一', addedAt: 'b', origin: 'manual' as const },
        { sourceUrl: 'u-r2', filePath: 'lib/r2.md', title: '推荐二', addedAt: 'c', origin: 'recommend' as const, batch: 1, reason: 'r', gap: 'g' },
        { sourceUrl: 'u-m2', filePath: 'lib/m2.md', title: '手动二', addedAt: 'd', origin: 'manual' as const },
      ],
    },
  } as any)
  render(<BlogCollectionSection theme="academic" onRequestRemove={vi.fn()} />)
  const titles = screen.getAllByTestId(/^blog-collection-open-/).map((n) => n.textContent)
  expect(titles).toEqual(['手动一', '手动二', '推荐一', '推荐二'])
})

it('收藏夹卡片只有移出+已读两按钮；移出上抛 collection 复合删除请求', () => {
  const onRequestRemove = vi.fn()
  useStore.setState({
    blogCollection: {
      version: 1, dismissed: [], history: [], read: [],
      entries: [{ sourceUrl: 'u-m1', filePath: 'lib/m1.md', title: '手动一', addedAt: 'b', origin: 'manual' as const }],
    },
  } as any)
  render(<BlogCollectionSection theme="academic" onRequestRemove={onRequestRemove} />)
  fireEvent.click(screen.getByTestId('blog-collection-remove-u-m1'))
  expect(onRequestRemove).toHaveBeenCalledWith({
    kind: 'collection', sourceUrl: 'u-m1', filePath: 'lib/m1.md', title: '手动一',
  })
  // 卡片内有已读 toggle（书图标），无收藏 toggle
  expect(screen.getByTestId('blog-collection-read-u-m1')).toBeInTheDocument()
  expect(screen.queryByTestId('blog-fav-toggle')).not.toBeInTheDocument()
})
```

`tests/anthropic-blog-panel.test.tsx` 新增（panel 级复合确认流）：

```tsx
it('收藏夹移出 → 确认后：移出收藏 + 删除文章文件', async () => {
  const removeBlogCollection = vi.fn()
  const deleteAnthropicArticle = vi.fn()
  useStore.setState({
    anthropicBlogCache: {
      lastFetchedAt: null,
      articles: [{ ...article('u-m1', 'Manual'), isSaved: true, filePath: 'lib/m1.md' }],
      loading: false, error: null, sectionStatus: {},
    },
    blogCollection: {
      version: 1, dismissed: [], history: [], read: [],
      entries: [{ sourceUrl: 'u-m1', filePath: 'lib/m1.md', title: '手动一', addedAt: 'b', origin: 'manual' as const }],
    },
    removeBlogCollection, deleteAnthropicArticle,
  } as any)
  render(<AnthropicBlogPanel theme="academic" />)
  fireEvent.click(screen.getByTestId('blog-collection-remove-u-m1'))
  expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument()
  fireEvent.click(screen.getByTestId('confirm-dialog-confirm'))
  await waitFor(() => {
    expect(removeBlogCollection).toHaveBeenCalledWith('u-m1')
    expect(deleteAnthropicArticle).toHaveBeenCalledWith('lib/m1.md')
  })
})
```

`e2e/specs/blog-collection.spec.ts` 更新：

```ts
// 第 28-29 行（移除推荐条目 → 空态）改为带确认：
await window.locator('[data-testid^="blog-collection-remove-"]').first().click()
await window.locator('[data-testid="confirm-dialog-confirm"]').click()
await expect(window.locator('[data-testid="blog-collection-empty"]')).toBeVisible()

// 第 48、53、78 行三处：
//   toContainText('已读（1）') → 计数 testid
await expect(window.locator('[data-testid="blog-read-count"]')).toHaveText('1')
```

（E2E mock 推荐产出的 pick 文件真实落盘，复合删除会删该文件——mock 环境每测试隔离学习库，无跨界影响。）

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/blog-collection-section.test.tsx tests/anthropic-blog-panel.test.tsx`
Expected: FAIL（`onRequestRemove` prop 不存在、`blog-read-count` 不存在等）

- [ ] **Step 3: 实现**

`BlogCollectionSection.tsx` 重构要点（保留所有现有 testid；新增 `onRequestRemove` 必需 prop；store 取 `anthropicBlogCache.articles` 用于卡片的 imageUrl/publishedAt 兜底）：

```tsx
// 顶部新增
import { BookIcon, BookmarkIcon, HistoryIcon, RefreshIcon, UnimportIcon } from './blog-icons'

interface RemoveRequest { kind: 'collection' | 'read'; sourceUrl: string; filePath: string; title: string }

export function BlogCollectionSection({ theme = 'academic', onRequestRemove }: {
  theme?: BriefingTheme
  onRequestRemove: (t: RemoveRequest) => void
}) {
  // ...store hooks 保持，另取：
  const cacheArticles = useStore((s) => s.anthropicBlogCache.articles)
  const articleOf = (url: string) => cacheArticles.find((a) => a.url === url)

  // 排序：手动在前，推荐后置，组内保序（用户决策 2026-09-23）
  const sortedEntries = [...entries].sort(
    (a, b) => (a.origin === 'recommend' ? 1 : 0) - (b.origin === 'recommend' ? 1 : 0)
  )
```

区头（替换「✓ 已读（n）」「★ 收藏夹 (n)」文字）：

```tsx
  <button type="button" data-testid="blog-read-toggle" title="已读"
    onClick={() => setShowRead(s => !s)}
    className={`flex items-center gap-2 w-full text-left ${muted} hover:text-ember`}>
    <span style={{ fontSize: listStyles.meta }}>{showRead ? '▾' : '▸'}</span>
    <BookIcon active size={13} className={isAcademic ? 'text-ember' : 'text-[#6b5d52]'} />
    <span data-testid="blog-read-count" className="text-parchment" style={{ fontSize: listStyles.title }}>{readList.length}</span>
  </button>
```

收藏夹区头行（折叠钮 + 书签图标 + `blog-collection-count` + 右侧两图标按钮）：

```tsx
  <div className="flex items-center gap-2">
    <button type="button" data-testid="blog-collection-collapse" onClick={() => setCollapsed(c => !c)} className={`${muted} hover:text-ember`} style={{ fontSize: listStyles.meta }}>
      {collapsed ? '▸' : '▾'}
    </button>
    <BookmarkIcon active size={13} className={isAcademic ? 'text-ember' : 'text-[#6b5d52]'} />
    <span data-testid="blog-collection-count" className={isAcademic ? 'text-parchment' : 'text-[#1a1a1a]'} style={{ fontSize: listStyles.title }}>{entries.length}</span>
    <div className="flex-1" />
    {recommendRunning && (
      <span className={muted} style={{ fontSize: listStyles.meta }}>{STAGE_TEXT[recommendStage ?? 'context']}</span>
    )}
    {collection.history.length > 0 && (
      <button type="button" data-testid="blog-rec-history" title="推荐记录"
        onClick={() => openRecommendView(collection.history[0].batch)}
        className={`w-[26px] h-[26px] rounded border flex items-center justify-center transition-colors ${
          isAcademic ? 'border-ember/40 text-ember hover:bg-ember/10' : 'border-[#6b5d52]/40 text-[#6b5d52] hover:bg-[#6b5d52]/10'}`}>
        <HistoryIcon size={13} />
      </button>
    )}
    <button type="button" data-testid="blog-recommend-button"
      title={recommendRunning ? '取消推荐' : '重新推荐'}
      onClick={() => (recommendRunning ? cancelBlogRecommend() : startBlogRecommend())}
      className={`w-[26px] h-[26px] rounded border flex items-center justify-center transition-colors ${
        isAcademic ? 'border-ember/40 text-ember hover:bg-ember/10' : 'border-[#6b5d52]/40 text-[#6b5d52] hover:bg-[#6b5d52]/10'}`}>
      {recommendRunning ? '✕' : <RefreshIcon size={13} />}
    </button>
  </div>
```

卡片行（已读/收藏通用结构；48px 缩略图，`articleOf(url)?.imageUrl` 兜底「无配图」占位）：

```tsx
function CardThumb({ imageUrl, isAcademic }: { imageUrl?: string | null; isAcademic: boolean }) {
  if (imageUrl) {
    return <img src={imageUrl} alt="" className="shrink-0 w-12 h-12 object-cover rounded" loading="lazy" decoding="async" />
  }
  return (
    <div className={`shrink-0 w-12 h-12 rounded flex items-center justify-center text-[9px] ${isAcademic ? 'bg-parchment/10 text-parchment/40' : 'bg-[#e8e4de] text-[#6b5d52]/60'}`}>
      无配图
    </div>
  )
}
```

已读卡片（只放移出按钮；`blog-read-open-*` 是标题按钮；卡片容器加左边框 ember）：

```tsx
  <div className={`rounded border border-l-[3px] border-l-ember p-2 flex items-start gap-2 relative ${isAcademic ? 'bg-ink/30 border-parchment/10' : 'bg-white border-[#1a1a1a]/10'}`}>
    <CardThumb imageUrl={articleOf(entry.sourceUrl)?.imageUrl} isAcademic={isAcademic} />
    <div className="flex-1 min-w-0 pr-5">
      <button type="button" data-testid={`blog-read-open-${entry.sourceUrl}`} onClick={onOpen}
        className={`block w-full text-left truncate ${isAcademic ? 'text-parchment hover:text-ember' : 'text-[#1a1a1a] hover:text-ember'}`}
        style={{ fontSize: titleSize }}>
        {entry.title}
      </button>
      <p className={isAcademic ? 'text-parchment/50' : 'text-[#6b5d52]'} style={{ fontSize: metaSize }}>
        {formatDate(articleOf(entry.sourceUrl)?.publishedAt ?? entry.readAt)}
      </p>
    </div>
    <span data-testid={`blog-read-remove-${entry.sourceUrl}`} role="button" title="移出已读并删除文章"
      onClick={onRemove}
      className={`absolute top-1.5 right-1.5 ${isAcademic ? 'text-parchment/30 hover:text-red-400' : 'text-[#6b5d52]/40 hover:text-red-600'}`}>
      <UnimportIcon size={13} />
    </span>
  </div>
```

（`formatDate` 从 `AnthropicArticleRow` 同款逻辑抄入本文件私有函数——模块私有不 export，不违反 ui-styling §10。ReadRow 需要新增 `metaSize`、`imageUrl`、`dateIso` props 或在 map 处组装；组装方式自选，保持卡片结构如上。）

收藏卡片（💡 保留；只放移出+已读两按钮，移出在左、已读在右）：

```tsx
  <div className={`rounded border border-l-[3px] border-l-ember p-2 relative ${isAcademic ? 'bg-ink/30 border-parchment/10' : 'bg-white border-[#1a1a1a]/10'}`}>
    <div className="flex items-start gap-2">
      {entry.origin === 'recommend' && (
        <button type="button" data-testid={`blog-collection-reason-${entry.sourceUrl}`} onClick={onToggleReason} className="shrink-0 mt-0.5" style={{ fontSize: titleSize }} title="推荐理由">💡</button>
      )}
      <CardThumb imageUrl={imageUrl} isAcademic={isAcademic} />
      <div className="flex-1 min-w-0 pr-11">
        <button type="button" data-testid={`blog-collection-open-${entry.sourceUrl}`} onClick={onOpen}
          className={`block w-full text-left truncate ${isAcademic ? 'text-parchment hover:text-ember' : 'text-[#1a1a1a] hover:text-ember'}`}
          style={{ fontSize: titleSize }}>
          {entry.title}
        </button>
        <p className={isAcademic ? 'text-parchment/50' : 'text-[#6b5d52]'} style={{ fontSize: metaSize }}>
          {dateText}{entry.origin === 'recommend' ? ' · 推荐' : ''}
        </p>
      </div>
      <span className="absolute top-1.5 right-1.5 flex items-center gap-2.5">
        <span data-testid={`blog-collection-remove-${entry.sourceUrl}`} role="button" title="移出收藏并删除文章" onClick={onRemove}
          className={isAcademic ? 'text-parchment/30 hover:text-red-400' : 'text-[#6b5d52]/40 hover:text-red-600'}>
          <UnimportIcon size={13} />
        </span>
        <span data-testid={`blog-collection-read-${entry.sourceUrl}`} role="button" aria-pressed={isRead}
          title={isRead ? '已读（点击取消）' : '标为已读'} onClick={onToggleRead}
          className={isRead ? 'text-ember' : `${isAcademic ? 'text-parchment/30' : 'text-[#6b5d52]/40'} hover:text-ember`}>
          <BookIcon active={isRead} size={13} />
        </span>
      </span>
    </div>
    {/* expanded 推荐理由块保持现状不变 */}
  </div>
```

已读 toggle 处理：map 处计算 `isRead = collection.read.some(r => r.sourceUrl === e.sourceUrl)`，`onToggleRead={() => void toggleBlogRead({ sourceUrl: e.sourceUrl, filePath: e.filePath, title: e.title })}`。

`onRemove` 接线（两处）：`() => onRequestRemove({ kind: 'read' | 'collection', sourceUrl, filePath, title })`。原来直接调 `removeBlogRead`/`removeBlogCollection` 的代码删除（含 openFile 的 onGone 回调保留——文件消失自愈逻辑不变）。

空态文案改：`尚无收藏——点右侧 ↻ 生成第一批，或点文章行的书签手动收藏`（testid `blog-collection-empty` 保留）。

`AnthropicBlogPanel.tsx`：`<BlogCollectionSection theme={theme} />` → 传 `onRequestRemove={(t) => setPendingDelete(t)}`（Task 4 的 union 已含 collection/read 分支与复合 onConfirm，直接兼容）。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/blog-collection-section.test.tsx tests/anthropic-blog-panel.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/anthropic/BlogCollectionSection.tsx src/components/anthropic/AnthropicBlogPanel.tsx tests/blog-collection-section.test.tsx tests/anthropic-blog-panel.test.tsx e2e/specs/blog-collection.spec.ts
git commit -m "feat(blog): 已读/收藏夹区图标化+卡片化，移出=移出本区+删文件（确认弹窗）"
```

---

### Task 6: §4 博客列双滚动条

**Files:**
- Modify: `src/components/anthropic/AnthropicBlogPanel.tsx`（展开态列内容结构，第 264-429 行）
- Test: `tests/anthropic-blog-panel.test.tsx`

**Interfaces:**
- Consumes: `BriefingListColumn` 自带的整列滚动容器（`BriefingListColumn.tsx:51-55`，`flex-1 min-h-0 overflow-y-auto`）——本任务让内容长出来，使它成为「全局滚动条」
- Produces: 无新接口

- [ ] **Step 1: 写失败测试**

```tsx
it('文章列表容器限高自滚动（max-h + overflow），列内容不再锁 h-full', () => {
  useStore.setState({
    anthropicBlogCache: {
      lastFetchedAt: null,
      articles: [{ ...article('old-1', 'Old Article') }],
      loading: false, error: null, sectionStatus: {},
    },
    blogCollection: { version: 1, entries: [], dismissed: [], history: [], read: [] },
  } as any)
  const { container } = render(<AnthropicBlogPanel theme="academic" />)
  const list = container.querySelector('[data-testid="anthropic-article-list"]')
  expect(list).not.toBeNull()
  expect(list!.className).toContain('max-h-')
  expect(list!.className).toContain('overflow-y-auto')
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/anthropic-blog-panel.test.tsx`
Expected: FAIL（无 `anthropic-article-list` testid）

- [ ] **Step 3: 实现**

`AnthropicBlogPanel.tsx` 展开态分支：

1. 第 264 行 `<div className="flex flex-col h-full">` → `<div className="flex flex-col min-h-full">`（内容可超出列高，让 `BriefingListColumn` 的整列滚动容器接管 = 全局滚动条贴列最右缘）。
2. 文章列表滚动容器（第 376-379 行）改为限高 + 左右 margin（滚动条左移至列右缘内 16px，与已读/收藏夹展开列表的内滚动条 x 对齐——它们因 section `px-4` 天然停在 16px 处）：

```tsx
            <div
              data-testid="anthropic-article-list"
              className="mx-4 my-3 max-h-[55vh] overflow-y-auto overscroll-contain"
              style={{ willChange: 'transform', transform: 'translateZ(0)' }}
            >
```

   （去掉原 `flex-1 min-h-0 px-4 py-3`；内部 skeleton/empty/rows 结构不变。）
3. 各 shrink-0 区（错误条/新文章条/收藏夹区/搜索/筛选）保持原样。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/anthropic-blog-panel.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/anthropic/AnthropicBlogPanel.tsx tests/anthropic-blog-panel.test.tsx
git commit -m "feat(blog): 博客列全局滚动条 + 文章列表滚动条左移对齐收藏夹"
```

---

### Task 7: §3b scraper 竞态修复验证（verification-only）

**Files:**
- 无代码改动（除非验证失败 → 停下回报用户，不自行改并行会话文件）

- [ ] **Step 1: 确认并行会话的 run-queue 已提交**

Run: `git log --oneline -3 -- electron/lib/run-queue.ts`
判定：有提交记录 → 继续；没有（仍是未提交/不存在）→ 本 Task 挂起，告知用户「症状 2 的修复在并行会话未落地」，先做 Task 8 其余验证。

- [ ] **Step 2: 跑 anthropic 相关 E2E**

Run: `npx electron-vite build && npx playwright test e2e/specs/anthropic-blog-multi-source.spec.ts e2e/specs/blog-collection.spec.ts --config e2e/playwright.config.ts`
Expected: 全 PASS（import/discover 链路无回归）

- [ ] **Step 3: 手动复现确认（请用户操作）**

`npm run dev` → 夜航简报 → Anthropic 博客 → **立即**（自动新文章检测还在跑时）点一篇未导入文章：
- 导入成功并打开 → 症状 2 关闭；
- 仍报「页面加载失败」→ 记录控制台/主进程报错，回报用户协调并行会话的队列工作（不在本计划内修）。

---

### Task 8: 定向验证总跑

- [ ] **Step 1: 受影响单测全绿**

Run: `npx vitest run tests/blog-icons.test.tsx tests/anthropic-blog-panel.test.tsx tests/blog-collection-section.test.tsx tests/briefing-typography.test.ts tests/briefing-page.test.tsx`
Expected: 全 PASS

- [ ] **Step 2: 定向 E2E**

Run: `node scripts/e2e-changed.js --run --no-retries`
Expected: 受影响 spec 全 PASS（自动先构建 out/）

- [ ] **Step 3: 回归核查**

`git status` 确认只提交了本计划 Tasks 列出的文件；并行会话文件（`electron/lib/anthropic-*.ts`、`electron/ipc/anthropic.ts`、`electron/lib/run-queue.ts` 等）保持未提交原状。

## Self-Review 记录

- **Spec 覆盖**：§1→Task 4；§2→Task 3；§3→Task 2（根因 1 修复）+ Task 7（根因 2 验证）；§4→Task 6；§5→Task 1（图标）+ Task 4（行内/阅读器头部）+ Task 5（区重构）。无缺口。
- **Placeholder 扫描**：Task 7 为验证任务（决策规则明确，非占位）；其余任务代码完整。
- **类型一致性**：`PendingDelete` union（Task 4 定义）与 `BlogCollectionSection.onRequestRemove` 参数（Task 5）结构一致（`kind: 'collection' | 'read'` 分支字段相同）；`setPendingDelete(t)` 直接兼容。
