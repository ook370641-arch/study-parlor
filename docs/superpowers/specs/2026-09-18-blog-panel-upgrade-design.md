# 博客面板升级（七项打磨）设计稿

日期：2026-09-18
状态：已确认（用户逐条敲定语义）
范围：Anthropic 博客面板（`src/components/anthropic/` + `BriefingSourceSidebar` + `electron/lib/blog-collection.ts`）

## 动机（用户感知主线）

七条需求归为四类感知优化：

1. **精致感/一致性**（需求 1、2）：来源图标与抽屉控件不成体系 → 产品显得半成品。
2. **信噪比**（需求 3）：「更新于」是正常状态的系统自言自语（ui-styling §3：状态指示器只暴露异常）。
3. **可解释性/可发现性**（需求 4、5）：灯泡规则无自我解释；推荐记录唯一入口是文章行 ◆N 徽标，徽标不在即功能失踪（feature-development §12）。
4. **心智模型 + 操作就近**（需求 6、7）：已读/收藏语义冲突（同文可同时在两个清单）；标记动作只能在列表行完成，正文打开后无法操作当前文章。

## 架构决策：互斥放主进程数据层

已读/收藏互斥在 `electron/lib/blog-collection.ts` 强制，而非 store 联动：

- `markRead`：插入 read 的同时，将该 sourceUrl 从 `entries` 移除；若被移除条目 `origin === 'recommend'`，走与 `removeEntry` 相同的 dismissed 逻辑（加入 dismissed，后续推荐不再推）。
- `addManualEntry`：插入 entries 的同时，将该 sourceUrl 从 `read` 移除。
- `applyRecommend` / `promoteEntry` / `removeEntry` / `removeRead` 不变。

理由：所有入口（列表行、推荐页、阅读器）自动遵守，单一权威。store 的 `toggleBlogCollection` / `toggleBlogRead` 无需改动——返回的 collection 已反映搬家结果，UI 重渲染即可。

前置事实：自动标已读已在 0831 迭代移除（纯手动动作），互斥不会被后台流程误触发。

### 互斥行为表

| 当前状态 | 点 ★ | 点 ✓ |
|---|---|---|
| 都不在 | 入收藏夹 | 入已读 |
| 在收藏夹 | 出收藏夹（取消） | 搬家：出收藏夹 → 入已读 |
| 在已读 | 搬家：出已读 → 入收藏夹 | 出已读（取消） |

无确认弹窗；撤销路径 = 再点一次反向按钮。

## 逐项方案

### 1. 来源列博客图标实体化

- 重绘 `BriefingSourceSidebar.tsx` 的 `AnthropicIcon`：描边三角形 → ember（`#d97757`）实体填充 + 内部镂空细节。
- ember 一色两用：设计语言点睛色 + 贴近 Anthropic 品牌铜色（符合 ui-styling §11 源标识性例外色登记方式，本稿即声明）。
- 学术/报纸两主题都给实体色，不随主题退化为描边。
- 范围只动博客图标；写作/前沿/求职/拾贝不动。
- `data-testid="briefing-source-icon-anthropic"` 保留。

### 2. 已读/收藏夹抽屉样式统一

`BlogCollectionSection.tsx` 两个抽屉统一为同一标题行结构：

```
[▸/▾ 箭头（行首固定位）] [图标] 名称 (N) ...... [右侧操作]
```

- 箭头固定在行首、标题同用 `listStyles.title` 字号、同行高。
- 已读行右侧无操作；收藏夹行右侧保留「重新推荐」（+ 新增的「记录」，见需求 5）。
- 默认展开状态保持现状：收藏夹展开、已读折叠——只统一控件语言，不改信息层级。

### 3. 「更新于」默认隐藏

- 删除 `AnthropicBlogPanel.tsx` 的常显行（`更新于 {lastFetchedAt}`）。
- `lastFetchedAt` 降级为「发现 N 篇新文章」按钮的 `title` tooltip（无新文章时完全不可见）。
- **「发现 N 篇新文章」prompt 本体一行不动。**

### 4. 灯泡自我解释

- 规则不变：`origin === 'recommend'` 才有 💡（可展开推荐理由/导读/缺口）。
- 手动收藏项在灯泡位放暗色占位符（低透明 ★），保持标题左对齐。
- 💡 加 `title="推荐理由"`。

### 5. 推荐记录固定入口

- 收藏夹标题行右侧、「重新推荐」旁加「记录」按钮（`data-testid="blog-rec-history"`）。
- 点击 `openRecommendView(history[0].batch)`（最新一批），进入既有 `BlogRecommendView`（上一批/下一批翻阅已存在）。
- `collection.history.length === 0` 时不渲染该按钮。
- 文章行 ◆N 徽标入口保留，双入口并存。

### 6. 已读/收藏互斥

见上方架构决策与行为表。数据层强制，store/UI 无感。

### 7. 阅读器顶部已读/收藏按钮

- `AnthropicArticleReader` 标题区加 ★/✓ 两枚按钮（`data-testid="blog-reader-fav"` / `blog-reader-read`），带 `aria-pressed`。
- sourceUrl 从已解析的 frontmatter `source_url` 取；filePath/title 用 reader 现有 props/状态。
- 仅 `frontmatter.type === 'anthropic-article'` 且有 `source_url` 时渲染。
- 点击调既有 store action `toggleBlogCollection` / `toggleBlogRead`；互斥由数据层保证。

## UI 出口声明（feature-development §12）

| 功能 | 入口 | 收起态 |
|---|---|---|
| 推荐记录 | 收藏夹标题行「记录」按钮（`blog-rec-history`） | history 为空时不渲染 |
| 当前文章已读/收藏 | 阅读器标题区 ★/✓（`blog-reader-fav`/`blog-reader-read`） | 非 anthropic-article 或无 source_url 不渲染 |

两个入口均需出现在至少一个 E2E 断言中。

## 验收清单

- **互斥**：搬家两个方向 + 两个取消方向，单测覆盖；recommend-origin 被搬出时 dismissed 正确追加。
- **旧数据兼容**：已有 `.collection.json`（同文同时在 entries 和 read）加载不报错；UI 各自正常显示（互斥只约束新操作，不做启动时数据迁移）。
- **空态**：history 为空 → 「记录」按钮不渲染；收藏夹空 → 占位提示不变。
- **持久化**：搬家操作跨重启保持（走既有 saveCollection 路径）。
- **主题**：图标实体色、统一抽屉行在 academic/newspaper 两主题下都检查。
- **回归**：「发现 N 篇新文章」prompt 仍在（E2E 断言 `anthropic-new-articles-prompt` 存在性已有覆盖，需确认不被本次改动破坏）。

## 测试计划

- 单测：`tests/blog-collection.test.ts` 加互斥用例（markRead 搬家、addManualEntry 搬家、recommend-origin dismissed、幂等）。
- 定向 E2E：`e2e/specs/blog-collection.spec.ts` 扩展（阅读器顶部按钮、记录入口、搬家 UI 反映）；同步 `e2e/source-map.json`。
- 不跑全量；按 `node scripts/e2e-changed.js --run` 定向。

## 变更记录

- 2026-09-18 最终审查后用户裁决：`toggleBlogCollection` 改为全局真 toggle（任何入口点已激活 ★ = 出收藏夹），promote 转正机制废弃（IpcApi/preload/facade/store/handler/`promoteEntry` 全层移除）。推荐条目的长期保留由「记录」页历史批次兜底。覆盖上文行为表的所有入口。

## 明确不做（本轮出界）

- 推荐页 pick 的原文外链（anthropic.com 回链）。
- 本地文件丢失后的重新导入路径。
- 手动收藏补写推荐理由。
- 其他来源图标（前沿/求职/拾贝）的实体化。
