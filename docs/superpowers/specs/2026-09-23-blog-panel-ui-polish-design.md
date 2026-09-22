# 博客面板 UI 打磨批：移出入口、字号、双滚动条、图标化 + 列表点击失效 Bug

日期：2026-09-23
状态：已确认（visual companion 两轮 mock 确认）
范围：`AnthropicBlogPanel` 列表列（来源列右侧），含 `AnthropicArticleRow`、`BlogCollectionSection`、`AnthropicArticleReader` 头部按钮、`briefing-font-size.ts`

## 背景

博客列五个问题：删除入口只藏右键菜单、文章名截断严重、读已读/收藏夹文章时列表点击失效、列内滚动条错位、已读/收藏夹区文字+字符符号（★○✓）视觉粗糙。

图标选型已由用户在 visual companion 中确认：**已读=翻开的书、收藏=书签、记录=回拨时钟、重新推荐=循环刷新、移出/移出库=托盘上移箭头**（内联 SVG，stroke 1.8，未激活 `parchment/30`，激活 `#d97757` 实心/描边加粗；报纸主题对应换成 `#6b5d52`/`#1a1a1a` 色系）。

---

## §1 Mine 行内「取消导入」按钮（删除可见入口）

- 仅 `filter.mode === 'mine'` 且 `article.isSaved && !article.local` 时显示。
- 行右上角按钮簇顺序（左→右）：**移出库 → 收藏 → 已读**（即已读 right-2、收藏 right-7、移出库 right-12；非 Mine 时移出库不渲染，其余位置不变）。
- 图标=托盘上移箭头，`title="取消导入（删除文章）"`，`data-testid="anthropic-row-unimport"`。
- 点击 → 复用 `AnthropicBlogPanel` 现有 `pendingDelete` → ConfirmDialog → `deleteAnthropicArticle(filePath)`。不新造删除逻辑。
- **行为确认**：取消导入后卡片不从主列表消失，`isSaved=false` 回到待导入态（左边框变淡）；在 Mine 过滤下因不满足 `isSaved` 自然离开当前视图。已读/收藏标记数据不主动清除（现有自愈：打开失败时 toast + 自动移出）。
- 右键菜单保留为辅助路径。

## §2 文章名缩字号 + 缩略图缩小

- `BRIEFING_LIST_STYLES.title` 每档 −2px：sm 11 / base 12 / lg 13 / xl 14 / 2xl 15 / 3xl 16 / 4xl 17 / 5xl 18 / 6xl 19 / 7xl 20（px）。`meta` 不动。
- 单一常量下调，`BriefingDateColumn`、收藏夹区、推荐页同步缩（视觉一致，见 ui-styling §6）。
- `AnthropicArticleRow` 缩略图 `w-20 h-20` → `w-14 h-14`（80→56px），行 `gap-4` → `gap-3`；「无配图」「§」占位同尺寸跟随。
- 同步更新 `tests/briefing-typography.test.ts` 断言（13px→11px、22px→20px）。

## §3 Bug：读已读/收藏夹文章时，点文章列表失效

**症状**（用户确认）：阅读器正显示一篇从已读/收藏夹打开的文章时——
- 点列表里**已导入**文章卡片：完全无反应（阅读器不切换）；
- 点**未导入**文章卡片：报「页面加载失败」（scraper `network-error`）。

**方法**：实施第一步调用 superpowers:systematic-debugging 复现定位，不预设修复方案。领先假设：
- H1：`articlePanelMode.anthropic` 被持久化为 `'companion'`（state.json 字段），已导入文章点击被路由到右侧对照槽，主阅读区不变 → 看似无反应。
- H2：未导入文章的导入在「阅读器已打开」状态下走了失效的 browser session（注意工作树 `anthropic-browser.ts`/`anthropic-scraper.ts` 有未提交改动），返回 network-error。

**验收**：E2E 回归——打开收藏夹文章 → 点列表已导入文章 → 阅读器切换到该文章；点未导入文章 → 导入成功并打开。

## §4 博客列双滚动条

- 整列改为**一个全局滚动容器**（滚动条贴列最右缘）：已读/收藏夹 + 搜索 + 筛选 chips + 文章列表全部在内。
- 文章列表保留**自己的滚动**（限高，如 `max-h-[55vh]`），其滚动容器加右外边距，使**列表滚动条左移，与已读/收藏夹展开列表的内滚动条 x 对齐**（列右缘内 ~16px）；最右缘留给全局滚动条。
- 已读/收藏夹展开区保留现有 max-h 内滚动（作为对齐基准，位置不动）。

## §5 已读/收藏夹区图标化 + 卡片化

### 区头

- 「✓ 已读（n）」→ 折叠三角 + **书图标**（琥珀）+ 数量；「★ 收藏夹 (n)」→ 折叠三角 + **书签图标** + 数量。文字标签去掉，图标带 `title` tooltip（「已读」「收藏夹」）。
- 「记录」→ 回拨时钟图标按钮（26px，border ember/40，`title="推荐记录"`）；「重新推荐」→ 循环刷新图标按钮（`title="重新推荐"`）。推荐运行中：图标按钮变 ✕（取消），阶段文案以 muted 小字保留在按钮左侧。
- 保留全部现有 `data-testid`（`blog-read-toggle`/`blog-collection-collapse`/`blog-rec-history`/`blog-recommend-button` 等）。

### 行内标记（主列表 + 阅读器头部）

- ☆/★ → 书签 SVG（空心/实心）；○/✓ → 书 SVG（描边/实心琥珀）。阅读器头部 `blog-reader-fav`/`blog-reader-read` 同步换，testid 不变。

### 已读区行 → 卡片式

- 与文章列同款卡片（缩略图 48px + 标题 + 日期，左边框 ember），点卡片打开阅读器。
- **不放**收藏/已读/移出库三个功能按钮；右上角只放一个**移出按钮**（托盘上移箭头图标，替换现有 ×）：
  - 动作 = **移出已读 + 删除已导入文件**（弹 ConfirmDialog），其他状态（收藏标记）不变；主列表卡片变待导入。
  - `data-testid="blog-read-remove-<sourceUrl>"` 保留（语义升级为复合动作，相关 E2E 需加确认弹窗一步）。

### 收藏夹区行 → 卡片式

- 同款卡片（48px 缩略图 + 标题 + 日期；推荐来源的 meta 行追加「· 推荐」）。
- 只放**两个按钮**（左→右）：**移出 + 已读**。
  - 移出 = **移出收藏 + 删除已导入文件**（弹 ConfirmDialog），已读等其他状态不变；主列表卡片变待导入。
  - `data-testid="blog-collection-remove-<sourceUrl>"` 保留（语义同上升级，E2E 同步改）。
  - 已读 = 书图标 toggle（同主列表标记）。
- 💡 推荐理由保留：推荐来源卡片标题行左侧 💡 图标按钮，点击展开理由（现有交互不变，`blog-collection-reason-*` testid 保留）。
- **排序：手动收藏在前，推荐来源（💡）后置**，组内保持原顺序（用户决策「默认五篇灯泡文章后置」）。

### 确认弹窗复用

- 三处移出/取消导入统一走 `AnthropicBlogPanel` 的 `pendingDelete` ConfirmDialog：`BlogCollectionSection` 通过回调 prop 上抛删除请求，弹窗文案按来源区分（Mine 行=「取消导入」、收藏夹=「移出收藏并删除文章」、已读=「移出已读并删除文章」），均说明「卡片将回到待导入状态，其他标记保留」。

---

## 测试与验收

- **单测**：`briefing-typography.test.ts` 新字号断言；`anthropic-blog-panel.test.tsx` 行内按钮（Mine 限定显示、顺序、确认流）、收藏夹排序（手动在前推荐在后）、两区卡片渲染与复合移出动作。
- **E2E**：§3 回归（见上）；收藏夹移出 → 确认 → 文件删除 + 卡片待导入 + 已读标记保留。受影响 spec：`anthropic-blog-multi-source.spec.ts`（remove-* testid 语义变化）按 `e2e/source-map.json` 定向跑，不跑全量。
- **边界**：文件已被外部删除时走现有自愈（toast + 移出条目）；报纸主题下图标色系同步；`prefers-reduced-motion` 不涉及（无新动画）。

## 明确不做

- 不改删除的数据层行为（`deleteAnthropicArticle` 已满足「卡片变待导入」）。
- 不为已读/收藏夹加分页或虚拟滚动。
- 不改推荐生成逻辑本身。
