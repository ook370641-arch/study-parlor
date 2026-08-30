# 博客推荐功能迭代：推荐理由可读化 + 字号跟随 + 已读文件夹

- 日期：2026-08-30
- 状态：已批准（用户确认）
- 涉及模块：`electron/lib/blog-recommend.ts`、`electron/lib/blog-collection.ts`、`electron/ipc/anthropic.ts`、`electron/preload.ts`、`src/types/index.ts`、`src/store/index.ts`、`src/components/anthropic/BlogCollectionSection.tsx`、`src/components/anthropic/AnthropicArticleRow.tsx`、`src/lib/briefing-font-size.ts`

## 背景与用户反馈

用户试用「为我推荐」后反馈：

1. **推荐理由看不懂**：历史卡片只平铺阶段一原始输出（80-120 字画像散文 + gaps + queries），没有一句统领性的核心需求归纳，也没有记录"这五篇各自为什么入选"——`reason`/`gap` 只存在收藏夹条目里，而收藏夹会被下一批整批替换（`applyRecommend` 只保留 manual 条目），历史无处回看逐篇理由。
2. **字体太小且不受调配**：`BlogCollectionSection.tsx` 全部硬编码 `text-[10px]`/`text-[11px]`/`text-xs`，不消费 `briefingFontSize`（面板顶部 ± 按钮只影响文章列表，经 `Briefing.tsx` 的 `--briefing-list-*` CSS 变量）。
3. **缺已读管理**：想要手动「已读」按钮 + 收藏夹上方可折叠的「已读」文件夹。

已确认的产品决策（用户逐项选择）：

- 推荐理由形态 = **核心需求总结 + 逐篇挂钩**
- 已读触发 = **手动按钮 + 打开阅读器自动标记**
- 已读夹范围 = **所有已读文章**（不限收藏夹内）
- 字号 = **跟随面板 ± 按钮（briefingFontSize）**，同时抬基础字号
- 已读文章 **不再被后续批次推荐**

## 功能 A：推荐理由升级——核心需求总结 + 逐篇挂钩

### 数据契约变更（`src/types/index.ts`）

```ts
export type BlogRecommendPick = {
  sourceUrl: string
  title: string
  filePath: string   // 与收藏夹条目同格式（推荐流程存 absPath），供历史卡片直接打开
  reason: string   // 一句话：为什么推这篇
  gap: string      // 补上的认知缺口
}

export type BlogRecommendBatch = {
  batch: number
  generatedAt: string
  profile: string
  gaps: string[]
  queries: string[]
  searchUsed: boolean
  focus?: string              // 新增：20-40 字核心需求方向一句话；旧批次无此字段
  picks?: BlogRecommendPick[] // 新增：本批挑选快照；旧批次无此字段
}
```

`focus`/`picks` 均为可选字段——旧 `.collection.json` 的 history 条目无需迁移，渲染层降级处理。

### 生成端变更

1. **阶段一 prompt 升级**：`blog-profile-queries-v1.md` → 新文件 `blog-profile-queries-v2.md`（输出 schema 变更，按命名惯例升版本号），增加字段：
   ```
   "focus": "一句话（20-40字）点明用户当前的核心需求方向，要具体可命名，不做抽象延伸"
   ```
   `stageProfile` 返回类型加 `focus: string`；校验时 `focus` 缺失按 `LLM_PARSE_ERROR` 重试（与现有 extractObjectWithRetry 一致，重试 2 次后报错）。

2. **批次快照 picks**：`runBlogRecommend` 在 `stagePick` 返回后，用 `pool` 反查 title/filePath，组装 `batch.picks` 与 `batch.focus`（blog-recommend.ts:222-229 的 batch 构造处）。`applyRecommend` 无需改动（batch 原样入 history）。

3. **E2E mock 同步**：`electron/ipc/anthropic.ts:190-218` 的 E2E mock 分支构造的 batch 补 `focus`/`picks` 字段，保证 E2E 覆盖新渲染路径。

### 渲染端变更（`BlogCollectionSection.tsx` 历史卡片）

新批次（有 `focus`）卡片结构：

```
第 N 批 · 2026/8/30 00:15 · 未使用网络搜索        ← meta 行（弱化）
◆ 核心方向：构建 coding agent 评测集的原则与指标   ← focus，font-serif + text-ember，醒目
  1. 文章标题 —— 一句 reason（挂上：缺口X）        ← 逐篇挂钩，可点开阅读器
  2. ...
认知缺口：… · 检索方向：…                         ← 合并为一行次要信息
```

- 逐篇条目带 `data-testid="blog-history-pick-<sourceUrl>"`，点击用快照内的 filePath 调 `ipc.readMd` + `openAnthropicReader`；文件已删则 toast 提示（历史是快照，不做自动移除）。
- 旧批次（无 `focus`）保持现有渲染（profile + gaps + queries），不报错。

**取舍说明**：曾考虑"渲染时从收藏夹反查 reason/gap"的极简方案，否决——收藏夹 recommend 条目会被下一批替换或手动删除，历史断链。快照进 batch 是唯一可靠路径。

## 功能 B：字号跟随面板 ± 按钮

- `BlogCollectionSection` 从 store 读 `briefingFontSize`，用现有 `BRIEFING_LIST_STYLES[fontSize]` 映射（`src/lib/briefing-font-size.ts:68-79`）inline style 驱动：
  - 收藏条目标题、已读条目标题、历史逐篇条目 → `title` 档（base=14px，现为 12px，抬一档）
  - 历史 meta 行、理由展开区、gaps/queries 行 → `meta` 档（base=11px）
  - 「★ 收藏夹」标题、`为我推荐` 按钮、折叠箭头同步缩放（复用 `meta`/`title` 档，不新增常量）
- **不新增设置项、不新增字号常量**（遵循 ui-styling §6 / ipc-state §4：复用 `BriefingFontSize` 枚举与既有映射）。
- 不依赖 `--briefing-list-*` CSS 变量的作用域（变量由 Briefing 页面容器设置，收藏夹区域直接读 store 更稳）。

## 功能 C：已读标记 + 已读文件夹

### 数据契约

```ts
export type BlogReadEntry = {
  sourceUrl: string   // 主键
  title: string
  filePath: string
  readAt: string      // ISO
}

export type BlogCollectionFile = {
  version: 1
  entries: BlogCollectionEntry[]
  dismissed: string[]
  history: BlogRecommendBatch[]
  read: BlogReadEntry[]   // 新增；loadCollection 缺省 []（旧文件无损兼容）
}
```

`version` 保持 1——新增字段靠缺省值兼容，不改版本号（与 `dismissed`/`history` 的既有兼容模式一致，blog-collection.ts:11-20）。

### 主进程（`blog-collection.ts`）

- `markRead(c, { sourceUrl, title, filePath })`：幂等（已存在则更新 readAt？——不更新，首次已读为准，直接返回原对象）；同时从 `dismissed` 语义外的推荐池排除靠 `runBlogRecommend` 过滤（见下）。
- `removeRead(c, sourceUrl)`：从 read 列表移除（× 按钮）。
- `loadCollection` 补 `read: Array.isArray(raw.read) ? raw.read : []`。

### 推荐排除（`blog-recommend.ts:214-217`）

候选池过滤加一条：

```ts
.filter(a => !col.dismissed.includes(a.sourceUrl))
.filter(a => !col.read.some(r => r.sourceUrl === a.sourceUrl))
```

已读永不复推。已读**不**进 `dismissed`（两者语义不同：dismissed="别再推"，read="读过了"），但效果等价于排除。

### IPC 链路（遵循 ipc-state §1 四层同步）

- 新增 `anthropic:collectionMarkRead`（args: `{ sourceUrl, title, filePath }` → `{ ok, collection }`）与 `anthropic:collectionRemoveRead`（args: `{ sourceUrl }` → `{ ok, collection }`）。
- 同步点：types（IpcApi）→ handler（anthropic.ts）→ preload → facade（`src/lib/ipc.ts`）→ store action（`markBlogRead` / `removeBlogRead`）→ 组件。

### 触发点

1. **手动**：`AnthropicArticleRow` 在 ☆ 收藏按钮旁加「已读」按钮（已读态显示 ✓ 置灰，`data-testid="blog-read-mark"`，与 blog-fav-toggle 同为固定 testid）。点击调 `markBlogRead({ sourceUrl, title, filePath })`。
2. **自动**：store `openAnthropicReader`（src/store/index.ts:1447）在 set 之后，用 filePath 从 `blogCollection.entries` → `anthropicBlogCache.articles` 反查 sourceUrl/title；查到且未读则调 `markBlogRead`。两处都查不到（极少见：文章不在缓存也不在收藏夹）则跳过自动标记——不为此加 frontmatter 回读。

### 已读文件夹 UI（`BlogCollectionSection` 顶部）

- 位置：收藏夹标题行**上方**，独立折叠区「✓ 已读 (n) ▾」（`data-testid="blog-read-section"` / `blog-read-toggle`），**默认折叠**，空列表不渲染。
- 条目：标题按钮（点击 `ipc.readMd` 成功后 `openAnthropicReader`，文件已删则 toast「该文件已被删除，已从已读移除」+ 自动 `removeBlogRead`，复用收藏夹 onOpen 模式）+ × 移出已读（`data-testid="blog-read-remove-<sourceUrl>"`）。条目无收藏按钮、无 💡。
- 已读与收藏夹**互相独立**：标已读不动收藏夹，收藏不动已读。

## 验收清单（feature-development §11）

- [ ] 空数据：无 read 字段的旧 `.collection.json` 正常加载；无 history 时不渲染历史入口；已读为空不渲染已读区
- [ ] 旧数据兼容：旧批次（无 focus/picks）按原样渲染不报错；旧 collection 文件 version=1 无 read 字段加载后 read=[]
- [ ] 推荐排除：已读 sourceUrl 不出现在 stagePick 候选池；dismissed 行为不变
- [ ] 幂等：重复 markRead 同 sourceUrl 不产生重复条目
- [ ] 自动标记：从文章行/收藏夹/已读夹打开阅读器均能标记；已读后再打开 readAt 保持首次标记值不变
- [ ] 文件已删：已读/收藏条目打开失败 toast + 自动移出
- [ ] 字号：± 按钮切换后收藏夹/已读/历史区域字号同步变化
- [ ] E2E：mock 批次含 focus/picks，历史卡片渲染核心方向与逐篇条目；已读按钮标记 → 已读夹出现条目 → × 移出
- [ ] LLM 契约：v2 prompt 缺 focus 字段时按 LLM_PARSE_ERROR 重试/报错（llm.md §4 提取-校验链不变）

## 单元测试计划

- `tests/blog-collection.test.ts`（新建或并入现有）：read CRUD、loadCollection 旧格式兼容、markRead 幂等、removeEntry 不影响 read
- 推荐池过滤：构造含 read 的 collection，断言候选池排除（blog-recommend 的过滤逻辑抽为可测纯函数或直接测 collectLocalArticles + filter 组合）

## 明确不做（YAGNI）

- 已读夹不做搜索/排序/分组
- 已读不移出收藏夹，两者独立
- 不改动推荐触发频率、批次上限（history 仍截断 20 批）
- 不为"文章不在缓存也不在收藏夹"的边缘场景加 frontmatter 回读
