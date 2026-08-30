# 博客推荐迭代 v2：推荐页独立右栏 + 收藏夹积累机制 + 导读摘要 + 纯手动已读

- 日期：2026-08-31
- 状态：已批准（用户确认；方案 A 经可视化 mockup 对比选定）
- 前置：`docs/superpowers/specs/2026-08-30-blog-recommend-iteration-design.md`（v1 已实现并合入 main，98a7bbb..0b9a0fa）
- 涉及模块：`electron/lib/blog-recommend.ts`、`electron/lib/blog-collection.ts`、`electron/ipc/anthropic.ts`、`electron/preload.ts`、`src/types/index.ts`、`src/store/index.ts`、`src/lib/anthropic-runtime.ts`、`src/components/anthropic/`（BlogCollectionSection / AnthropicBlogPanel / AnthropicArticleRow / 新增 BlogRecommendView）、`e2e/specs/blog-collection.spec.ts`

## 背景

v1 上线试用后反馈：

1. **已读误标**：用户点开文章即被自动标已读（v1 设计为「打开自动标记」），但"打开 ≠ 读完"。实测 `.collection.json`：两篇已读的 readAt 相隔 3 秒，均为打开触发。**决策：已读改纯手动标记**。
2. **推荐历史藏太深**：历史折叠在左栏收藏夹区的小字里，看不清也操作不了。**决策：推荐历史独立为右栏视图（方案 A：右栏推荐视图 + 批次切换），左栏不再显示推荐历史**。
3. **收藏夹积累机制需明确**：收藏夹 = 手动收藏 + 最新一次推荐；过往推荐未手动 ★ 的不保留。
4. **缺导读**：每篇推荐文章要有一句"这篇讲什么、为什么适合我现在读"的导读摘要，且持久化。

用户补充确认：
- 推荐页内容 = 画像分析 + 知识缺口分析 + 每篇推荐理由（含导读）
- 每个批次历史带删除按钮
- 文章列表行上，来自推荐的文章显示批号标记，点击切到右栏推荐页对应批次（选定「列表行批号标记」，阅读器内来源条不做）

## 功能 A：推荐页——右栏独立视图

### 状态与切换

- store 新增运行时状态 `recommendViewBatch: number | null`（不持久化）。右栏渲染优先级（AnthropicBlogPanel）：`constitutionReportOpen` > `recommendViewBatch != null`（推荐页）> `anthropicReaderFilePath`（阅读器）> 空态。
- 互斥规则：打开阅读器（`openAnthropicReader`）时 `recommendViewBatch = null`；进入推荐页时关闭阅读器与宪法报告（复用 `closeAnthropicReader` 的字段清空模式）。
- 新 action：`openRecommendView(batch: number)` / `closeRecommendView()`。
- **推荐完成自动切入**：`src/lib/anthropic-runtime.ts` 的 `onAnthropicRecommendDone` 成功分支追加 `recommendViewBatch = collection.history[0].batch`（若有 history）。

### 推荐页组件（新增 `src/components/anthropic/BlogRecommendView.tsx`）

按 `recommendViewBatch` 从 `blogCollection.history` 找批次渲染：

```
┌ ‹ 上一批   第 N 批 · 2026/8/30 00:15   下一批 ›        [🗑 删除本批] ┐
│ ◆ 核心方向：构建 coding agent 评测集的原则与指标                      │
│ 【画像分析】profile 全文                                              │
│ 【知识缺口】gaps 列表                                                 │
│ ┌ 文章标题              ☆ ○ ┐                                         │
│ │ 导读：2-3 句……            │  × 5                                   │
│ │ 推荐理由：reason（挂上：gap）│                                       │
│ └───────────────────────────┘                                         │
│ 检索方向：query1、query2（次要行）                                     │
└───────────────────────────────────────────────────────────────────────┘
```

- 批次切换：‹ › 在 history（最新在前）中移动；到边界置灰。
- **删除批次**：`🗑` 按钮（`data-testid="blog-rec-delete-batch"`），走新 IPC `anthropic:collectionRemoveBatch`（args: `{ batch: number }` → `{ ok, collection }`，主进程 `removeBatch(c, batch)` 只过滤 history）；不动收藏夹/已读；删除当前查看批次后切到相邻批次，无批次则回空态（显示「点左栏『重新推荐』生成第一批」引导）。
- 逐篇卡片：标题点击开阅读器（readMd 探活，文件已删 toast 不移除快照）；☆ = 收藏/转正（见功能 B）；○ = 已读标记。testid：`blog-rec-view`、`blog-rec-pick-<sourceUrl>`、`blog-rec-prev`/`blog-rec-next`。
- 旧批次（无 focus/picks）降级渲染：profile + gaps + queries 纯文本，可删除，无逐篇卡片。
- 字号：走 `BRIEFING_LIST_STYLES[briefingFontSize]`（title/meta 两档，与收藏夹区视觉一致），不新增字号常量。

### 左栏清理与入口

- `BlogCollectionSection` 移除「往期推荐历史」折叠块及其 testid（`blog-recommend-history`、`blog-history-pick-*` 废弃）；保留：已读文件夹、收藏夹列表、「重新推荐」按钮（由「为我推荐」改名，testid `blog-recommend-button` 不变）。
- **列表行批号标记**：`AnthropicArticleRow` 上，若 `article.url` 命中任意批次的 `picks[].sourceUrl`，标题旁显示琥珀小徽标 `◆N`（N=批次号，`data-testid="blog-rec-badge"`），点击（stopPropagation）→ `openRecommendView(N)`。lookup 逻辑放 `src/lib/blog-rec-lookup.ts` 纯函数 `findBatchForUrl(history, sourceUrl): number | null`。

## 功能 B：收藏夹积累机制（★ 语义修正）

- 收藏夹构成 = 手动收藏 + 最新一批推荐：`applyRecommend` 现有「保留 manual、整批替换 recommend」行为已满足，不变。
- **★ 转正**：`toggleBlogCollection` 改为三分支——
  - 条目不存在 → `addManualEntry`（现状）
  - 条目存在且 `origin === 'recommend'` → **转正**：`promoteEntry(c, sourceUrl)` 把 origin 改为 `'manual'`（保留 reason/gap/batch/addedAt），下批起永久留存
  - 条目存在且 `origin === 'manual'` → `removeEntry` 移除（现状；手动条目移除不进 dismissed——现状已如此）
- 推荐条目的 × 移除 → dismissed 逻辑不变。
- IPC 新增 `anthropic:collectionPromote`（args: `{ sourceUrl }` → `{ ok, collection }`），四层同步（types → handler → preload → facade → store）。

## 功能 C：导读摘要

- 阶段三 prompt 升 `blog-recommend-pick-v2.md`：输出字段加 `guide`——"2-3 句导读：这篇讲什么核心内容、为什么切合用户此刻的缺口"。仍是**一次调用产出全部 ≤5 篇**，不加 LLM 轮次。
- `PickedArticle` 与 `BlogRecommendPick`、`BlogCollectionEntry` 均加 `guide?: string`（可选——旧数据无此字段）。stagePick 校验 guide 为非空字符串，缺失按 LLM_PARSE_ERROR 重试链处理。
- 展示：推荐页逐篇卡片 + 收藏夹 💡 展开区（`为什么推荐` 上方加 `导读：` 行，无 guide 不显示该行）。
- E2E mock 分支 picks/pickEntries 补 `guide: 'E2E 导读摘要'`。

## 功能 D：已读改纯手动

- 移除 `openAnthropicReader` 内的自动标记段与 `AnthropicArticleRow` companion 分支的 `markBlogRead` 调用。
- `src/lib/blog-read-lookup.ts` 变为孤儿 → 连 `tests/blog-read-lookup.test.ts` 一起删除（本计划 v1 产生的文件，清理自有孤儿）。
- store `markBlogRead`/`removeBlogRead`/`toggleBlogRead` 保留；已读入口 = 文章行 ○ + 推荐页卡片 ○。推荐池排除已读逻辑保留。
- E2E 既有用例中「打开 pick → 自动已读」断言需改写：改为「推荐页卡片点 ○ → 已读夹出现」。

## 验收清单

- [ ] 推荐完成（含 E2E mock）后右栏自动切到推荐页，展示 focus/画像/知识缺口/逐篇导读+理由
- [ ] 批次 ‹ › 切换、边界置灰、删除批次（动 history 不动收藏夹/已读）、删空回引导空态
- [ ] 旧批次（v1 前无 focus/picks、v1 批次无 guide）降级渲染不报错
- [ ] 列表行批号徽标只在命中批次 picks 的文章上出现，点击切到对应批次
- [ ] ★ 三分支：新文章入夹 / recommend 转正 manual（下批不掉）/ manual 移除
- [ ] 收藏夹在重新推荐后 = manual（含转正）+ 最新批 recommend，过往未转正推荐掉出
- [ ] 已读纯手动：打开文章（主区/对照槽/收藏夹/已读夹/推荐页）均不产生已读
- [ ] 左栏不再出现「往期推荐历史」；`blog-recommend-button` 文案为「重新推荐」
- [ ] 字号：推荐页与收藏夹区随 ± 按钮缩放
- [ ] IPC 四层同步（`anthropic:collectionPromote`、`anthropic:collectionRemoveBatch`）+ 运行时断言经 E2E 覆盖

## 单元测试计划

- `tests/blog-collection.test.ts`：promoteEntry（转正保留字段/幂等/manual 不动）、removeBatch（删指定批次/序号不影响其他批）
- `tests/blog-recommend.test.ts`：stagePick mock 补 guide；缺 guide → LLM_PARSE_ERROR；batch.picks[].guide 落盘
- `tests/blog-rec-lookup.test.ts`（新）：findBatchForUrl 命中/未命中/多批命中取最新
- `tests/blog-recommend-view.test.tsx`（新）：推荐页渲染/批次切换/删除/旧批次降级/空态
- `tests/blog-collection-section.test.tsx`：移除历史相关断言，改验「重新推荐」文案 + 已读夹不变
- `tests/anthropic-blog-panel.test.tsx`：★ 转真链路（recommend 条目 ★ → promote IPC）；自动已读相关断言移除；批号徽标渲染与点击
- E2E `blog-collection.spec.ts`：推荐 → 右栏推荐页自动出现（核心方向/导读可见）→ 卡片 ○ 手动已读 → 已读夹出现 → 批次删除

## 明确不做（YAGNI）

- 推荐页不做搜索/编辑/导出；批次删除无二次确认
- 阅读器内「来自第 N 批推荐」来源条不做（用户选定仅列表行批号）
- 不为 v1 及更早批次回填导读
- `recommendViewBatch` 不持久化（刷新回空态/阅读器，可接受）
