# 博客面板升级（七项打磨）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 `docs/superpowers/specs/2026-09-18-blog-panel-upgrade-design.md` 落地博客面板七项打磨：博客图标实体化、已读/收藏抽屉统一、「更新于」降级、灯泡自我解释、推荐记录固定入口、已读/收藏数据层互斥、阅读器顶部 ★/✓。

**Architecture:** 互斥在 `electron/lib/blog-collection.ts` 数据层强制（markRead 出 entries、addManualEntry 出 read），store/UI 无感；UI 改动集中在 `BriefingSourceSidebar`、`BlogCollectionSection`、`AnthropicBlogPanel`、`AnthropicArticleReader` 四个组件。

**Tech Stack:** Electron + React + Zustand + Vitest + Playwright E2E。

## Global Constraints

- 只跑定向测试：`npx vitest run tests/<file>.test.ts`；E2E 用 `node scripts/e2e-changed.js --run --no-retries`（自动先构建）。禁止全量。
- 新增可交互元素必须有 `data-testid`，并出现在至少一个 E2E 断言中（feature-development §12）。
- 设计语言：ember `#d97757` 只做点睛/源标识；动效克制（ui-styling §11）。
- 组件文件只导出组件（ui-styling §10）。
- **并行会话约束**：工作区存在其他会话的未提交改动（writing 相关）。每个任务 commit 时只 `git add` 本任务触及的文件，禁止 `git add -A` / `git stash`。

---

### Task 1: 数据层互斥（blog-collection.ts）

**Files:**
- Modify: `electron/lib/blog-collection.ts`（`markRead` 62-74 行、`addManualEntry` 27-40 行）
- Test: `tests/blog-collection.test.ts`

**Interfaces:**
- Consumes: 既有 `BlogCollectionFile` / `BlogReadEntry` / `BlogCollectionEntry` 类型（`src/types/index.ts`）。
- Produces: `markRead(c, args)` 搬家语义（出 entries、recommend 记 dismissed）；`addManualEntry(c, args)` 搬家语义（出 read）。签名不变，Task 5 的阅读器按钮和既有列表行/推荐页按钮自动继承互斥。

- [ ] **Step 1: 写失败测试**

在 `tests/blog-collection.test.ts` 末尾追加：

```ts
describe('已读/收藏互斥', () => {
  it('markRead 将手动收藏条目搬出收藏夹', () => {
    const c: BlogCollectionFile = {
      ...empty(),
      entries: [{ sourceUrl: 'u1', filePath: 'a.md', title: 'A', addedAt: 'x', origin: 'manual' }],
    }
    const c2 = markRead(c, { sourceUrl: 'u1', filePath: 'a.md', title: 'A' })
    expect(c2.entries).toHaveLength(0)
    expect(c2.read.map(r => r.sourceUrl)).toEqual(['u1'])
  })

  it('markRead 将 recommend 条目搬出并记 dismissed', () => {
    const c: BlogCollectionFile = {
      ...empty(),
      entries: [{ sourceUrl: 'u1', filePath: 'a.md', title: 'A', addedAt: 'x', origin: 'recommend', reason: 'r', batch: 1 }],
    }
    const c2 = markRead(c, { sourceUrl: 'u1', filePath: 'a.md', title: 'A' })
    expect(c2.entries).toHaveLength(0)
    expect(c2.dismissed).toEqual(['u1'])
    expect(c2.read).toHaveLength(1)
  })

  it('markRead 未收藏时不影响 dismissed', () => {
    const c2 = markRead(empty(), { sourceUrl: 'u1', filePath: 'a.md', title: 'A' })
    expect(c2.dismissed).toEqual([])
  })

  it('addManualEntry 将已读条目搬出已读', () => {
    const c: BlogCollectionFile = {
      ...empty(),
      read: [{ sourceUrl: 'u1', filePath: 'a.md', title: 'A', readAt: 'x' }],
    }
    const c2 = addManualEntry(c, { sourceUrl: 'u1', filePath: 'a.md', title: 'A' })
    expect(c2.read).toEqual([])
    expect(c2.entries).toHaveLength(1)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/blog-collection.test.ts`
Expected: 4 个新用例 FAIL（entries/read 未被联动清理）。

- [ ] **Step 3: 实现互斥**

`electron/lib/blog-collection.ts` 两处修改：

```ts
export function addManualEntry(
  c: BlogCollectionFile,
  args: { sourceUrl: string; filePath: string; title: string }
): BlogCollectionFile {
  if (c.entries.some(e => e.sourceUrl === args.sourceUrl)) return c
  const entry: BlogCollectionEntry = {
    sourceUrl: args.sourceUrl,
    filePath: args.filePath,
    title: args.title,
    addedAt: new Date().toISOString(),
    origin: 'manual',
  }
  // 互斥：收藏即出已读
  return {
    ...c,
    entries: [...c.entries, entry],
    dismissed: c.dismissed.filter(d => d !== args.sourceUrl),
    read: c.read.filter(r => r.sourceUrl !== args.sourceUrl),
  }
}
```

```ts
/** 标记已读：幂等（已存在直接返回原对象），新条目插到最前；互斥：已读即出收藏夹 */
export function markRead(
  c: BlogCollectionFile,
  args: { sourceUrl: string; filePath: string; title: string }
): BlogCollectionFile {
  if (c.read.some(r => r.sourceUrl === args.sourceUrl)) return c
  const entry: BlogReadEntry = {
    sourceUrl: args.sourceUrl,
    filePath: args.filePath,
    title: args.title,
    readAt: new Date().toISOString(),
  }
  // 互斥：出收藏夹；recommend 来源记 dismissed（同 removeEntry）
  const target = c.entries.find(e => e.sourceUrl === args.sourceUrl)
  const dismissed = target?.origin === 'recommend'
    ? Array.from(new Set([...c.dismissed, args.sourceUrl]))
    : c.dismissed
  return {
    ...c,
    entries: c.entries.filter(e => e.sourceUrl !== args.sourceUrl),
    dismissed,
    read: [entry, ...c.read],
  }
}
```

- [ ] **Step 4: 跑测试确认通过（含旧用例无回归）**

Run: `npx vitest run tests/blog-collection.test.ts`
Expected: 全部 PASS（既有用例不受影响：`removeEntry`/`removeRead` 未动）。

- [ ] **Step 5: Commit**

```bash
git add electron/lib/blog-collection.ts tests/blog-collection.test.ts
git commit -m "feat(blog): 已读/收藏数据层互斥——markRead 出收藏夹、addManualEntry 出已读"
```

---

### Task 2: 博客图标实体化（BriefingSourceSidebar）

**Files:**
- Modify: `src/components/BriefingSourceSidebar.tsx`（`AnthropicIcon` 32-49 行）

**Interfaces:**
- Consumes: 无。
- Produces: `data-testid="briefing-source-icon-anthropic"` 保留（E2E 选择器不变），icon 实体填充 `#d97757`。

- [ ] **Step 1: 重绘 AnthropicIcon**

替换 `AnthropicIcon` 为实体填充字标（A 形 + 镂空三角 counter，ember 一色两用：点睛色 + Anthropic 品牌铜色源标识，spec §1 已声明例外色）：

```tsx
function AnthropicIcon() {
  return (
    <svg
      data-testid="briefing-source-icon-anthropic"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
    >
      <path
        fill="#d97757"
        fillRule="evenodd"
        d="M12 3 21 21h-4.2l-1.6-3.8H8.8L7.2 21H3L12 3Zm0 5.6 1.7 5h-3.4l1.7-5Z"
      />
    </svg>
  )
}
```

（路径可在实现时目检微调，要求：实心 A 字标、中央镂空三角清晰、20px 下不糊。两主题共用同一实体色，不随主题退化。）

- [ ] **Step 2: 验证构建通过**

Run: `npx electron-vite build`
Expected: 构建成功。图标视觉在 Task 6 的 E2E 中统一断言。

- [ ] **Step 3: Commit**

```bash
git add src/components/BriefingSourceSidebar.tsx
git commit -m "feat(blog): 来源栏博客图标实体化——ember 实心 A 字标（源标识例外色）"
```

---

### Task 3: 抽屉统一 + 灯泡占位 + 记录入口（BlogCollectionSection）

**Files:**
- Modify: `src/components/anthropic/BlogCollectionSection.tsx`

**Interfaces:**
- Consumes: store `openRecommendView(batch: number)`（`src/store/index.ts:1536`）、`collection.history`（最新在前）。
- Produces: `data-testid="blog-rec-history"`（推荐记录固定入口，Task 6 E2E 断言）；`blog-read-toggle` / `blog-collection-collapse` testid 不变；💡 按钮加 `title="推荐理由"`。

- [ ] **Step 1: 统一已读抽屉标题行**

将已读区块的 toggle（现 `✓ 已读（N） ▾` 单行按钮，箭头在尾、meta 字号）改为与收藏夹同构：箭头在行首、label 用 title 字号、font-serif。testid 保持在含文本的按钮上（既有 E2E 断言 `toContainText('已读（1）')` 不破）：

```tsx
{readList.length > 0 && (
  <div data-testid="blog-read-section" className="mb-1.5">
    <button
      type="button"
      data-testid="blog-read-toggle"
      onClick={() => setShowRead(s => !s)}
      className={`flex items-center gap-2 w-full text-left ${muted} hover:text-ember`}
    >
      <span style={{ fontSize: listStyles.meta }}>{showRead ? '▾' : '▸'}</span>
      <span
        className={`font-serif ${isAcademic ? 'text-ember' : 'text-[#6b5d52]'}`}
        style={{ fontSize: listStyles.title }}
      >
        ✓ 已读（{readList.length}）
      </span>
    </button>
    {showRead && (
      <div className="mt-1.5 space-y-1.5 max-h-40 overflow-y-auto">
        {/* ReadRow 列表保持不变 */}
      </div>
    )}
  </div>
)}
```

（收藏夹标题行的箭头按钮 `blog-collection-collapse` + `★ 收藏夹 (N)` label 已是此结构，不动；两个箭头同行首、同 meta 字号，label 同 title 字号。）

- [ ] **Step 2: 加「记录」固定入口**

组件顶部补 store hook：

```tsx
const openRecommendView = useStore((s) => s.openRecommendView)
```

收藏夹标题行右侧、「重新推荐」按钮前插入（history 为空不渲染）：

```tsx
{collection.history.length > 0 && (
  <button
    type="button"
    data-testid="blog-rec-history"
    onClick={() => openRecommendView(collection.history[0].batch)}
    style={{ fontSize: listStyles.meta }}
    className={`px-2 py-1 rounded border transition-colors ${
      isAcademic
        ? 'border-ember/40 text-ember hover:bg-ember/10'
        : 'border-[#6b5d52]/40 text-[#6b5d52] hover:bg-[#6b5d52]/10'
    }`}
  >
    记录
  </button>
)}
```

- [ ] **Step 3: 灯泡自我解释（CollectionRow）**

`CollectionRow` 中灯泡分支改为三元（手动收藏给暗色占位 ★ 保持对齐；💡 加 title）：

```tsx
{entry.origin === 'recommend' ? (
  <button type="button" data-testid={`blog-collection-reason-${entry.sourceUrl}`} onClick={onToggleReason} className="shrink-0" style={{ fontSize: titleSize }} title="推荐理由">💡</button>
) : (
  <span aria-hidden="true" className={`shrink-0 ${isAcademic ? 'text-parchment/20' : 'text-[#6b5d52]/30'}`} style={{ fontSize: titleSize }}>★</span>
)}
```

- [ ] **Step 4: 验证构建通过**

Run: `npx electron-vite build`
Expected: 构建成功。

- [ ] **Step 5: Commit**

```bash
git add src/components/anthropic/BlogCollectionSection.tsx
git commit -m "feat(blog): 已读/收藏抽屉统一行结构，新增推荐记录固定入口，灯泡差异自我解释"
```

---

### Task 4: 「更新于」降级为 tooltip（AnthropicBlogPanel）

**Files:**
- Modify: `src/components/anthropic/AnthropicBlogPanel.tsx`（288-292 行常显块、294-307 行新文章 prompt）

**Interfaces:**
- Consumes: 既有 `lastFetchedAt` / `pendingLastFetchedAt` state。
- Produces: 无新 testid；`anthropic-new-articles-prompt` 保持原样（仅加 title）。

- [ ] **Step 1: 删除常显行，tooltip 挂到新文章按钮**

删除：

```tsx
{lastFetchedAt && (
  <p className={`px-4 pt-3 text-[10px] ${themeClasses.muted}`}>
    更新于 {new Date(lastFetchedAt).toLocaleString('zh-CN')}
  </p>
)}
```

给「发现 N 篇新文章」按钮加 title（该 prompt 仅在 pendingArticles 非空时渲染，此时 pendingLastFetchedAt 必非空）：

```tsx
<button
  type="button"
  data-testid="anthropic-new-articles-prompt"
  title={pendingLastFetchedAt ? `更新于 ${new Date(pendingLastFetchedAt).toLocaleString('zh-CN')}` : undefined}
  onClick={handleRefresh}
  disabled={loading}
  className={`w-full text-left text-xs px-3 py-2 rounded flex items-center justify-between disabled:opacity-60 ${themeClasses.button}`}
>
```

注意：`lastFetchedAt` 变量若删除后无其他消费，同步移除其解构（只清理本次改动造成的孤儿）。

- [ ] **Step 2: 验证构建通过**

Run: `npx electron-vite build`
Expected: 构建成功。

- [ ] **Step 3: Commit**

```bash
git add src/components/anthropic/AnthropicBlogPanel.tsx
git commit -m "feat(blog): 「更新于」常显行下线，降级为新文章 prompt 的 tooltip"
```

---

### Task 5: 阅读器顶部 ★/✓（AnthropicArticleReader）

**Files:**
- Modify: `src/components/anthropic/AnthropicArticleReader.tsx`（store hooks 区 80-87 行附近、header 操作行 289-298 行）

**Interfaces:**
- Consumes: store `blogCollection` / `toggleBlogCollection` / `toggleBlogRead`（Task 1 已保证互斥）；frontmatter `source_url` / `type`。
- Produces: `data-testid="blog-reader-fav"` / `blog-reader-read`（带 `aria-pressed`，Task 6 E2E 断言）。仅 `type === 'anthropic-article'` 且有 `source_url` 时渲染。

- [ ] **Step 1: 接 store 与派生状态**

组件 hooks 区追加：

```tsx
const blogCollection = useStore((s) => s.blogCollection)
const toggleBlogCollection = useStore((s) => s.toggleBlogCollection)
const toggleBlogRead = useStore((s) => s.toggleBlogRead)
```

`const section = ...` 附近追加派生：

```tsx
const articleSourceUrl = frontmatter?.type === 'anthropic-article' ? frontmatter.source_url : undefined
const inCollection = articleSourceUrl != null && blogCollection.entries.some(e => e.sourceUrl === articleSourceUrl)
const isRead = articleSourceUrl != null && blogCollection.read.some(r => r.sourceUrl === articleSourceUrl)
```

- [ ] **Step 2: header 操作行加按钮**

`mt-4 flex items-center gap-2` 容器内、`AnnotationListButton` 之后插入：

```tsx
{articleSourceUrl && (
  <>
    <button
      type="button"
      data-testid="blog-reader-fav"
      aria-pressed={inCollection}
      title={inCollection ? '取消收藏' : '收藏'}
      onClick={() => void toggleBlogCollection({ sourceUrl: articleSourceUrl, filePath, title: frontmatter.title ?? '' })}
      className={`text-sm leading-none transition-colors ${inCollection ? 'text-ember' : `${themeClasses.meta} hover:text-ember`}`}
    >
      {inCollection ? '★' : '☆'}
    </button>
    <button
      type="button"
      data-testid="blog-reader-read"
      aria-pressed={isRead}
      title={isRead ? '已读（点击取消）' : '标为已读'}
      onClick={() => void toggleBlogRead({ sourceUrl: articleSourceUrl, filePath, title: frontmatter.title ?? '' })}
      className={`text-sm leading-none transition-colors ${isRead ? 'text-ember' : `${themeClasses.meta} hover:text-ember`}`}
    >
      {isRead ? '✓' : '○'}
    </button>
  </>
)}
```

（此处位于 `!loading && frontmatter &&` 分支内，frontmatter 已收窄非空。）

- [ ] **Step 3: 验证构建通过**

Run: `npx electron-vite build`
Expected: 构建成功。

- [ ] **Step 4: Commit**

```bash
git add src/components/anthropic/AnthropicArticleReader.tsx
git commit -m "feat(blog): 阅读器顶部新增当前文章 ★/✓ 按钮，互斥由数据层保证"
```

---

### Task 6: E2E 扩展 + 定向验证

**Files:**
- Modify: `e2e/specs/blog-collection.spec.ts`

**Interfaces:**
- Consumes: Task 3 的 `blog-rec-history`、Task 5 的 `blog-reader-fav`/`blog-reader-read`、Task 2 的图标 fill。mock 推荐（`E2E_ANTHROPIC_RECOMMEND=1`）会真实写入 `e2e-recommend.md`（含 `type: anthropic-article` + `source_url` frontmatter），可从推荐页点进阅读器。

- [ ] **Step 1: 追加两个 E2E 用例**

在 `e2e/specs/blog-collection.spec.ts` describe 内追加：

```ts
test('推荐记录固定入口 + 已读/收藏互斥搬家', async ({ window }) => {
  const cover = new CoverPage(window)
  await cover.enterName('E2E 测试员')
  await cover.goToBriefing()
  await window.locator(SELECTORS.briefing.sourceAnthropicButton).click()

  // 博客图标实体色（源标识）
  await expect(
    window.locator('[data-testid="briefing-source-icon-anthropic"] path').first()
  ).toHaveAttribute('fill', '#d97757')

  // 推荐 mock → 右栏自动出推荐页；关闭后可通过固定入口回来
  await window.locator('[data-testid="blog-recommend-button"]').click()
  await expect(window.locator('[data-testid="blog-rec-view"]')).toBeVisible({ timeout: 15000 })
  await window.locator('[data-testid="blog-rec-close"]').click()
  await expect(window.locator('[data-testid="blog-rec-view"]')).toBeHidden()
  await window.locator('[data-testid="blog-rec-history"]').click()
  await expect(window.locator('[data-testid="blog-rec-view"]')).toBeVisible()

  // 互斥：pick 初始在收藏夹（推荐自动入夹）；标已读 → 出收藏夹、入已读
  await window.locator('[data-testid^="blog-rec-read-"]').first().click()
  await window.locator('[data-testid="blog-rec-close"]').click()
  await expect(window.locator('[data-testid="blog-read-toggle"]')).toContainText('已读（1）')
  await expect(window.locator('[data-testid="blog-collection-empty"]')).toBeVisible()
})

test('阅读器顶部 ★/✓ 标记当前文章并互斥', async ({ window }) => {
  const cover = new CoverPage(window)
  await cover.enterName('E2E 测试员')
  await cover.goToBriefing()
  await window.locator(SELECTORS.briefing.sourceAnthropicButton).click()

  await window.locator('[data-testid="blog-recommend-button"]').click()
  await expect(window.locator('[data-testid="blog-rec-view"]')).toBeVisible({ timeout: 15000 })

  // 从推荐页打开文章 → 阅读器出现 ★/✓；推荐已自动入夹 → ★ 激活
  await window.locator('[data-testid^="blog-rec-pick-"]').first().click()
  await expect(window.locator('[data-testid="anthropic-article-reader"]')).toBeVisible()
  await expect(window.locator('[data-testid="blog-reader-fav"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(window.locator('[data-testid="blog-reader-read"]')).toHaveAttribute('aria-pressed', 'false')

  // 点 ✓ → 搬家：✓ 激活、★ 退激活
  await window.locator('[data-testid="blog-reader-read"]').click()
  await expect(window.locator('[data-testid="blog-reader-read"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(window.locator('[data-testid="blog-reader-fav"]')).toHaveAttribute('aria-pressed', 'false')

  // 再点 ✓ 取消已读（不自动回收藏夹）
  await window.locator('[data-testid="blog-reader-read"]').click()
  await expect(window.locator('[data-testid="blog-reader-read"]')).toHaveAttribute('aria-pressed', 'false')
  await expect(window.locator('[data-testid="blog-reader-fav"]')).toHaveAttribute('aria-pressed', 'false')
})
```

- [ ] **Step 2: 检查 source-map 覆盖**

`e2e/source-map.json` 已覆盖本次全部改动文件（`src/components/anthropic/**`、`electron/lib/blog-collection.ts` 在 anthropic-blog 组；`BriefingSourceSidebar.tsx` 在 article-side-panel 组；`blog-collection.spec.ts` 已在两组 specs 中）。运行 `node scripts/e2e-changed.js`（不带 --run）确认无孤儿 spec WARNING；有则补齐。

- [ ] **Step 3: 跑定向 E2E**

Run: `node scripts/e2e-changed.js --run --no-retries`
Expected: blog-collection.spec.ts（含 2 个新用例 + 2 个旧用例）及受影响 spec 全部 PASS。若出现新 testid 找不到，先怀疑构建过期（规则 §11）——`e2e-changed --run` 已自动构建，仍失败则手动 `npx electron-vite build` 后重跑确认。

- [ ] **Step 4: Commit**

```bash
git add e2e/specs/blog-collection.spec.ts
git commit -m "test(blog): 推荐记录入口/互斥搬家/阅读器按钮 E2E + 博客图标实体色断言"
```

---

## Self-Review 记录

- **Spec 覆盖**：需求 1→Task 2；2→Task 3 Step 1；3→Task 4；4→Task 3 Step 3；5→Task 3 Step 2；6→Task 1；7→Task 5；UI 出口 E2E 断言→Task 6。全覆盖。
- **类型一致性**：`openRecommendView`、`toggleBlogCollection({sourceUrl,filePath,title})`、`toggleBlogRead({sourceUrl,filePath,title})` 签名与 store 一致；`collection.history[0].batch` 类型 number。
- **占位符**：无 TBD；图标 SVG 路径给了具体值并注明可目检微调（视觉项固有弹性）。
