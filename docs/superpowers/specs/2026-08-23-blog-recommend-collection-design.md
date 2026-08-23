# 博客智能推荐 + 收藏夹 + 右栏统一 — 设计

日期：2026-08-23
状态：已确认（brainstorming 问答 + 用户授权全权实施）

## 背景

博客（Anthropic 博客）文章越积越多，用户无法判断哪些值得读。写作仓库（`writing/`）里有用户当前境况的上下文。需求：博客基于写作上下文自动推荐"既至关重要、又切合当前认知缺口"的本地已导入文章，推荐结果挂载进一个内置收藏夹；推荐时先用网络搜索探明"哪些 Anthropic 系文章至关重要"，再在本地文章里匹配。同时把写作的「对照文」交互推广到博客/前沿/求职栏目，统一三栏目的右栏为「导读 | 助手 | 对照」。

## 已确认约束（用户问答）

1. **候选池 = 已导入本地的文章**（`<lib>/Anthropic博客/**/*.md`，`type: anthropic-article`）。不推荐未导入的网络文章；网络搜索只用于提高本地匹配质量，未导入的命中直接丢弃。
2. **上下文 = 仅 `writing/` 根**（不读 repository）：catalog 摘要 + 最近修改的若干篇正文原文。不读学习报告、不读 profile。
3. **收藏夹 = 推荐自动进夹 + 可手动 ☆ 加入**；推荐刷新只替换推荐条目，手动条目不动。
4. **推荐触发 = 手动按钮**（「为我推荐」），不做自动/定时刷新。
5. **阶段一 LLM 先输出用户画像**（基于 writing 扫描结果），画像与推荐结果都持久化，任何时候可在收藏夹 UI 查看推荐依据。
6. **两个模块合成一份 spec**，实施分两阶段：先模块 1（推荐+收藏夹），后模块 2（右栏统一+对照推广）。
7. **UI 对齐现有设计语言**：收藏夹语义对齐精选集的 ☆/★；区块样式对齐 AnthropicBlogPanel 现有 chip/折叠区；夜色配色（parchment/ember）。

## 目标 / 非目标

**目标**

- 模块 1：三段式推荐链路（画像+检索词 → Tavily 搜索 → 本地池精排），结果持久化到 `<lib>/Anthropic博客/.collection.json`；博客面板顶部收藏夹区（推荐按钮、画像/理由查看、手动 ☆/★、移除、dismiss 不再推荐）。
- 模块 2：博客/前沿/求职右栏统一为「导读 | 助手 | 对照」三 tab；对照 tab 下点击该栏目列表文章 = 切换对照文、主文阅读器正文不变；对照文 md 可编辑（autosave）、html 只读；求职栏目获得导读。

**非目标（防范围蔓延）**

- 推荐的自动/定时触发；推荐未导入文章（含"一键导入未导入建议"）。
- 写作页本身的改动（对照文已存在，原样不动）；digest 源不动。
- 对照文的独立 AI 助手会话；toolbar 焦点路由（沿 companion-pane spec 的 deferred 决策）。
- 收藏夹的多级分组/排序/导出。
- 推荐批次历史保留多份（只保留 lastBatch 最近一批的画像与检索词）。

## 模块 1：推荐 + 收藏夹

### 数据模型（`<lib>/Anthropic博客/.collection.json`）

新文件 `electron/lib/blog-collection.ts` 负责读写（原子写 + JSON 校验 + version 检查，失败回退默认空，参照 `writing-catalog.ts` 与 library-data 模式）：

```ts
interface BlogCollectionFile {
  version: 1
  entries: BlogCollectionEntry[]
  dismissed: string[]                 // 用户移除过的推荐 sourceUrl，后续批次不再推荐
  lastBatch: BlogRecommendBatch | null
}
interface BlogCollectionEntry {
  sourceUrl: string                   // 主键（去重依据）
  filePath: string                    // 相对学习库路径
  title: string
  addedAt: string                     // ISO
  origin: 'recommend' | 'manual'
  reason?: string                     // 推荐理由（仅 recommend）
  gap?: string                        // 补上的认知缺口（仅 recommend）
  batch?: number                      // 批次号（仅 recommend）
}
interface BlogRecommendBatch {
  batch: number
  generatedAt: string
  profile: string                     // 用户画像（阶段一 LLM 输出）
  gaps: string[]                      // 认知缺口
  queries: string[]                   // 本次检索词
  searchUsed: boolean                 // Tavily 是否可用（false = 降级为纯本地匹配）
}
```

语义：
- 手动 ☆：`origin: 'manual'`，无 reason/gap，推荐刷新永不替换；手动收藏一个 dismissed URL 会将其从 `dismissed` 剔除。
- 移除推荐条目 → URL 进 `dismissed`；移除手动条目 → 不进 dismissed。
- 新一批推荐：entries = 保留 manual + 全量替换 recommend；`batch` 递增。

### 推荐链路（`electron/lib/blog-recommend.ts`）

`runBlogRecommend({ signal, onStage })` 三段式，复刻 `guide-v2-pipeline.ts` 的"规划→搜索→合成"模式与 `llm-tasks.ts` 的 extractJson/重试/debug 落盘约定：

1. **收集上下文** `collectWritingContext()`：`loadCatalog(lib, 'writing')`（仅 writing 根），条目按 `updatedAt ?? mtimeMs` 倒序取至多 40 条 `{title, summary}`（总字符 ≤ 8k 截断）；另取最近修改的 5 篇读正文前 2000 字（strip frontmatter，标 `[近期原文]`）。catalog 空/无条目 → 返回错误码 `NO_WRITING_CONTEXT`。
2. **阶段一 · 画像与检索词**（chatNonStream，prompt `electron/prompts/blog-profile-queries-v1.md`）：输入上下文 → 输出 `{profile, gaps[], queries[]}`（queries 2~3 条英文，面向 Anthropic 系博客）。extractJsonObject + shape check + 失败重试一次。
3. **阶段二 · Tavily 搜索**：每条 query 调 `searchWeb`（限定 anthropic.com / transformer-circuits.pub / claude.com），取 title+snippet 至多 10 条。Tavily key 缺失或全部失败 → `searchUsed=false` 继续（降级不阻断）。
4. **候选池** `collectLocalPool()`：walk `<lib>/Anthropic博客/**/*.md`，frontmatter `type === 'anthropic-article'` 且有 `source_url` 者入池 `{sourceUrl, title, summary, section, filePath}`；剔除 `dismissed`；超 80 篇按 `imported_at` 近优先截断。池空 → `NO_LOCAL_ARTICLES`。
5. **阶段三 · 精排**（chatNonStream，prompt `blog-recommend-pick-v1.md`）：输入 画像+gaps+搜索命中+候选池编号清单（title+summary+url）→ 输出至多 5 条 `[{source_url, reason, gap}]`。校验 `source_url` 必须在池内，非法丢弃；JSON 失败重试一次，仍败 → `LLM_PARSE_ERROR` + `~/.studyparlor/debug/` 落盘。
6. **写回**：替换 recommend 条目、更新 lastBatch、保存 `.collection.json`，事件推送新 collection。

### IPC 与错误码（ipc-state §1/§2）

错误码联合类型入 `src/types/index.ts`：
`BlogRecommendErrorCode = 'NO_WRITING_CONTEXT' | 'NO_LOCAL_ARTICLES' | 'LLM_ERROR' | 'LLM_PARSE_ERROR' | 'ABORTED'`

落在 `electron/ipc/anthropic.ts`（博客域不新建 IPC 文件），同步 types → handler → preload → facade → store：

- `anthropic:collectionRead` → `{ ok: true; collection: BlogCollectionFile }`
- `anthropic:collectionAdd` `{sourceUrl, filePath, title}` → `{ ok: true; collection }`
- `anthropic:collectionRemove` `{sourceUrl}` → `{ ok: true; collection }`（推荐条目自动记 dismissed）
- `anthropic:recommendStart` → 立即返回 `{ ok: true }`；进度经事件 `anthropic:recommendStage`（`{stage: 'context'|'profile'|'search'|'pick'}`），结束经 `anthropic:recommendDone`（`{ ok: true; collection } | { ok: false; code }`）
- `anthropic:recommendCancel` → abort 当前推荐（AbortController；running guard 防重入，stale 响应丢弃）

### Store 与 UI（对齐现有博客面板语言）

store 新增（运行时，不入 state.json）：`blogCollection`、`recommendRunning`、`recommendStage`；actions：`loadBlogCollection` / `toggleBlogCollection(article)` / `startBlogRecommend` / `cancelBlogRecommend`。事件监听随 `registerAnthropic*` 既有模式注册。

UI（`AnthropicBlogPanel` 列表栏，搜索框之下、文章列表之上）：

- **收藏夹区**（可折叠，默认展开，`data-testid="blog-collection-section"`）：
  - 头部：`★ 收藏夹 (n)` + 折叠箭头 + **「为我推荐」按钮**（ember 强调小按钮，`data-testid="blog-recommend-button"`；推荐中显示阶段文案 + spinner + ✕ 取消）。
  - 推荐依据行（有 lastBatch 时）：「基于你的写作画像 · N 个缺口 · M 个检索方向」点击展开显示 **profile + gaps + queries**（`data-testid="blog-recommend-basis"`）；`searchUsed=false` 时标注"本次未使用网络搜索"。
  - 条目行：推荐条目带 💡 与一行理由摘要，点击展开 **reason + gap**；手动条目无标记。hover 显示 × 移除。点击条目 → `openAnthropicReader(filePath)`；打开前 `fs.existsSync` 校验（经 IPC 结果体现），文件已删 → toast + 从夹移除（feature-dev §8）。
- **手动收藏**：`AnthropicArticleRow` 行尾 ☆/★（对齐精选集语义：☆ 收入 / ★ 已在夹，ember 色，`data-testid="blog-fav-toggle"`）。
- 空态：「尚无收藏——点「为我推荐」生成第一批，或点文章行的 ☆ 手动收藏」。
- 错误 toast 按错误码映射中文文案（不用 message 子串匹配）。

### 模块 1 测试

- 单元 `tests/blog-collection.test.ts`：缺文件→默认空；version 不符→重置；add 去重；remove 推荐→dismissed、remove 手动→不记；手动收藏 dismissed URL→剔除；推荐替换只动 recommend 条目。
- 单元 `tests/blog-recommend.test.ts`（mock chatNonStream/searchWeb/fs）：上下文截断与近期原文选取；pool 过滤（type、dismissed、80 上限）；精排 URL 校验丢弃非法；parse 失败重试；Tavily 缺失降级 searchUsed=false；`NO_WRITING_CONTEXT`/`NO_LOCAL_ARTICLES`。
- E2E `e2e/specs/blog-collection.spec.ts`：收藏夹区渲染（UI 出口断言）、手动 ☆/★ 往返、移除、dismiss 后下批不再推荐（E2E 下 recommend IPC 走确定性 mock 分支，沿用 `E2E_ANTHROPIC_OFFLINE` 同款 env gate）、跨重启持久化。同步 `e2e/source-map.json`。

## 模块 2：右栏统一 + 对照推广

### 交互模型

博客 / 前沿 / 求职右栏统一为 tab 槽位：**导读 | 助手 | 对照**（复刻写作 `WritingAssistantPanel` 的互斥 tab 模式）：

- 博客/前沿：现 `ArticleAssistantPanel`（导读+聊天上下排布）改为 tab 结构，导读/助手内容不变只改承载方式；新增对照 tab。
- 求职：`JobAssistantPanel` 改为同一 tab 壳；**新增导读 tab**（`GuideSidebar` + 打开 assistantSession 时传 `autoGenerateGuide`；guide-v2 管线对 job briefing 正文的适配在实施计划中验证，若需 keying 调整则按 briefing 日期作 key）。
- **对照 tab 下左键情境化**（复刻 companion-pane spec §交互模型）：右栏展开且处于对照 tab 时，点击该栏目文章列表项（博客行 / 前沿文章行 / 求职日期项）= 切换对照文，主文阅读器正文不变；否则 = 现状（打开主文）。点击当前主文 → 忽略 + toast。
- 对照文分派复用 `WritingBoard` 逻辑：md → `WritingEditor`（不注册全局 toolbar）+ 1.5s autosave + 保存状态；html → `HtmlPreview` 只读。**求职对照例外**：简报是生成物，对照槽只读渲染（`MarkdownRenderer`），不可编辑、不写盘。
- 切主文时按映射自动恢复该主文的对照文；列表行双高亮（主文现状高亮 + 对照文第二标识，语义复刻 WritingTree `data-companion`）。

### 状态与持久化（ipc-state §3：新字段带默认值）

| 字段 | 位置 | 持久化 | 默认 |
|---|---|---|---|
| `articlePanelMode: Record<'anthropic'\|'scout'\|'job', 'guide'\|'assistant'\|'companion'>` | store + `StateJson` | ✅ patchState | `{anthropic:'guide', scout:'guide', job:'assistant'}`（对齐现状：博客/前沿默认展示导读，求职默认助手） |
| `articleCompanionMap: Record<string, string>` | store + `StateJson` | ✅ patchState | `{}` |
| `articleSidePanelOpen: boolean` / `articleSidePanelWidth: number` | store + `StateJson` | ✅ patchState | `true` / `320`（博客/前沿/求职共用一个右槽开关与宽度） |
| `articleCompanion: { key, filePath, kind, body, readonly, dirty, saving } \| null` | store 运行时 | ❌ | `null` |

`articleCompanionMap` 的 key = `${source}:${主文标识}`（博客/前沿用 filePath，求职用 briefing 日期）。

### 正文读写 IPC

- 读：复用现有 reader 的正文读取路径（实施计划确认具体 hook/IPC，必要时抽共用）。
- 写：新增 `anthropic:writeArticleBody { filePath, body }`——路径必须位于 `<lib>/Anthropic博客/` 或 `<lib>/拾贝/` 之内（resolve 后前缀校验），gray-matter 保留 frontmatter 只替换正文，原子写。返回 `{ ok } | { ok: false; code: 'PATH_FORBIDDEN' | 'WRITE_ERROR' }`。

### 模块 2 测试

- 单元：`writeArticleBody` 路径越界拒绝、frontmatter 保留；companion map 恢复逻辑；旧 state.json 无新字段的默认合并。
- E2E `e2e/specs/article-side-panel.spec.ts`：三栏目 tab 壳渲染（UI 出口断言 `data-testid="article-panel-tab-*"`）、博客对照切换且主文不变、切主文恢复映射、求职导读 tab 出现。同步 `e2e/source-map.json`。

## 错误处理总表

| 场景 | 行为 |
|---|---|
| writing catalog 为空 | `NO_WRITING_CONTEXT` → toast「先在写作里写几篇文章，推荐才有依据」 |
| 本地候选池为空 | `NO_LOCAL_ARTICLES` → toast「先从博客列表导入几篇文章」 |
| Tavily 未配置/失败 | 降级 searchUsed=false，UI 标注，不报错 |
| LLM 调用失败 | `LLM_ERROR` toast + 可重试 |
| LLM 输出解析失败（重试后） | `LLM_PARSE_ERROR` + debug 落盘 |
| 推荐中途取消 | `ABORTED` 静默复位，不toast |
| 收藏条目文件被外部删除 | 打开时 toast + 自动移除条目 |
| writeArticleBody 越界 | `PATH_FORBIDDEN`，不写盘 |

## 验收清单（feature-dev §11）

- 空数据：无 catalog / 无本地文章 / 空收藏夹 / 无 lastBatch
- 失败：LLM 失败、解析失败、Tavily 失败、写盘失败、文件被外部删除
- 部分成功：搜索失败但本地匹配成功（searchUsed=false）
- 旧数据兼容：无 `.collection.json`、旧 state.json 无新字段
- 跨重启持久化：收藏夹、dismissed、lastBatch、articlePanelMode、articleCompanionMap
- 取消/重入：推荐中取消、推荐中重复点击
- UI 出口：收藏夹区、为我推荐按钮、☆/★、三 tab 均有 data-testid 且有 e2e 断言
