# Anthropic 博客多栏目扩展 + 博客导读 v2 设计

日期：2026-08-07
状态：已确认（用户批准方案与布局）

## 背景与目标

「博客」是夜航简报（Briefing）左栏的子源，当前唯一来源是 `anthropic.com/engineering`，导读停留在 v1 单次调用。本设计做两件事：

1. **博客源从 engineering 单栏目扩展为三栏目**（engineering + institute + research），全用户周期链路（发现→导入→阅读→导读→旁注→删除）逐栏目复用，组件零分叉。
2. **博客导读升级为 v2**：借鉴前沿（digest）导读 v2 的「检索规划→并行搜索→流式撰写」管线，但**保留 v1 的 per-chunk 章节总结**（博客文章长，总结有价值；前沿条目短，总结=复述才被 v2 移除）。

**成功标准（用户原话）**：像读 engineering 一样读其他有帮助的 Anthropic 博客——链路全通、渲染正常、可正常生成导读 + 旁注。

**非目标**：policy / news / economic-index 等栏目（见「栏目选型」）；通用博客源插件框架（YAGNI）；`__NEXT_DATA__` JSON 解析新路线（站点是 App Router，无此数据块，实测见下）。

## 栏目选型（2026-08-07 实测验证）

证据等级：engineering = 应用生产环境实证；institute = 用户现场报告 + 本探测证实；research = 本探测证实。

实测方法：node fetch 探测 4 个候选索引页 + 3 个栏目各 1 篇文章页 + Tavily 搜索（`include_domains: ['anthropic.com']`）交叉验证。

| 栏目 | 实测结果 | 判定 |
|---|---|---|
| `/engineering` | 200，25 篇文章链接，现有链路生产中 | ✅ 保留 |
| `/institute` | 200，标题 "The Anthropic Institute"；官宣文 `/news/the-anthropic-institute`（Tavily 交叉证实）；现有 1 篇正式文 `/institute/recursive-self-improvement`（即用户读过的《When AI builds itself》）；链接在原始 HTML 中，无需 JS 渲染 | ✅ 选入（新栏目，文章会增长） |
| `/research` | 200，15 个链接 = 11 篇研究博文 + 4 个 `/research/team/*` 团队页；文章直接挂 `/research/<slug>` | ✅ 选入（过滤 `/team/*`） |
| `/news` `/policy` `/economic-index` | 存在 | ❌ v1 不选：news 为产品通稿（浅，前沿 digest 已覆盖行业动态）；policy 为风控/治理内容（用户明确排除）；economic-index 为报告型 |

文章页结构指纹三栏目**完全一致**：`<article>` 容器、`class="body"`、`h1`、`og:image` 均在；`<time datetime>` 与 JSON-LD 均无（与 engineering 相同）→ 现有 `ARTICLE_SCRIPT` 多选择器回退正文提取**零改动复用**。

链路结论：裸 HTTP 即 200 无反爬；生产链路（Electron 隐藏 BrowserWindow）更强，两条都通。维持现有 DOM 抓取路线。

## 架构总览

方案：配置化多栏目 + 全链路复用。栏目是声明式配置；抓取/正文提取/阅读器/导读/旁注全部走现有链路参数化。

```
anthropic-sections.ts (栏目配置)
        │
discoverArticles ── 按栏目顺序抓索引页（独立失败域）──► anthropicBlogCache (合并列表 + sectionStatus)
        │
importArticle ── ARTICLE_SCRIPT 零改动 ──► .md (frontmatter + section) ──► Anthropic博客/YYYY-MM/
        │
阅读器 ArticleBodyChunks │ 导读 runBlogGuideV2 (新) │ 旁注 ArticleAnnotations │ 助手 ChatWindow
        │
AnthropicBlogPanel：合并时间线 + 栏目色签 + 多选过滤（C 布局）
```

## 详细设计

### 1. 栏目配置

新文件 `electron/lib/anthropic-sections.ts`：

```ts
export interface AnthropicSection {
  key: string;            // 'engineering' | 'institute' | 'research'
  label: string;          // 显示名
  indexUrl: string;       // 索引页 URL
  linkPrefix: string;     // 文章链接前缀，如 '/engineering/'
  excludePrefixes?: string[]; // research: ['/research/team/']
  color: string;          // 色签颜色
}

export const ANTHROPIC_SECTIONS: AnthropicSection[] = [
  { key: 'engineering', label: 'Engineering', indexUrl: 'https://www.anthropic.com/engineering', linkPrefix: '/engineering/', color: '#d97757' },
  { key: 'institute',   label: 'Institute',   indexUrl: 'https://www.anthropic.com/institute',   linkPrefix: '/institute/',   color: '#8a9a5b' },
  { key: 'research',    label: 'Research',    indexUrl: 'https://www.anthropic.com/research',    linkPrefix: '/research/',    excludePrefixes: ['/research/team/'], color: '#6b8fa3' },
];
```

渲染层经 IPC（`anthropic:getSections`）获取同一份配置，避免两处维护。

### 2. 数据契约（五层同步：types → IPC → preload → facade → store → 组件/测试）

1. `AnthropicArticleMeta`（`src/types/index.ts:48-58`）加 `section: string`。
2. **frontmatter** 新字段 `section: string`；读取缺省 = `'engineering'`（存量零迁移）。`tags` 从恒 `['anthropic','engineering']` 变为 `['anthropic', section]`。`type` 恒 `'anthropic-article'` **不变**（导读/旁注/助手按 type 路由的逻辑全部不动）。
3. `AnthropicBlogCache`（`src/types/index.ts:73-78`）：`articles` 为合并列表（每条带 `section`）；新增 `sectionStatus: Record<string, { fetchedAt: string; error?: string }>`，缺省 `{}`。旧缓存中无 `section` 的文章归入 engineering。
4. 已存文章 section 判定三层回退：frontmatter `section` → `source_url` 前缀回推（`anthropic.com/<section>/`）→ `'engineering'`。
5. 存储目录仍 `Anthropic博客/YYYY-MM/`，**不按栏目分目录**（删除/去重/扫描逻辑零改动）。

### 3. 抓取链路（`electron/lib/anthropic-scraper.ts` + `electron/ipc/anthropic.ts`）

- `discoverArticles`：从「抓单个 /engineering」改为按 `ANTHROPIC_SECTIONS` 顺序逐栏目抓取（隐藏窗单例串行复用）。每栏目独立 try/catch：失败仅记录 `sectionStatus[key].error`，其他栏目正常返回。全部失败才整体报错（沿用现有 parse-error 路径）。
- `LISTING_SCRIPT`：参数化 `linkPrefix` 与 `excludePrefixes`（原硬编码 `a[href^="/engineering/"]`）；卡片容器提取（标题/摘要/日期/封面图）逻辑不动。抽取后按 `excludePrefixes` 过滤。
- `importArticle`：`ARTICLE_SCRIPT` **零改动**（实测三栏目同模板）；frontmatter 写入 `section`；`tags: ['anthropic', section]`。
- 新文章检测 `findNewArticleUrls` 按 URL 比对，天然跨栏目，不动。
- `anthropic:cancelImport` / 删除逻辑不动。

### 4. 博客导读 v2

- **管线**：`electron/lib/guide-v2-pipeline.ts` 抽出可配项（prompt 路径 + 输出校验器），`runDigestGuideV2` 与新增 `runBlogGuideV2` 共用三阶段骨架（检索规划 `chatNonStream` → 并行 Tavily `searchWeb` → 流式撰写 `chatStream`）。规划失败重试 1 次后降级无搜索、单查询失败仅置空对应资料夹、坏输出落盘 `~/.studyparlor/debug/` 等行为全部沿用。
- **新 prompt** `electron/prompts/blog-guide-v2.md`（改编自 `digest-guide-v2.md`）：产物 = `{ background, chunks: [{ heading, summary, terms }] }`——
  - `background`：搜索增强的背景铺陈（带引用资料）；
  - per-chunk `summary`：**保留 v1 章节总结**（这是与 digest v2 的核心差异；不要 per-chunk `context`）；
  - `terms`：沿用。
- **路由**：`articleAssistant:generateGuide`（`electron/ipc/article-assistant.ts:334-353`）目前仅 `articleType === 'briefing'` 走 v2；扩展 `'anthropic-article'` 走 blog v2 管线。
- **版本与失效**：blog v2 写 `guide_version: 2`；`isGuideCacheCurrent`（`src/lib/guide-progress.ts:14-20`）扩展为 `'anthropic-article'` 同样要求 `guide_version >= 2`。旧 v1 导读（无版本字段）打开时自动失效重生成（与 digest 同策略）。
- **UI**：`GuideSidebar` 已兼容 `context ?? summary`，三态进度痕、正文↔导读互跳（`data-chunk-index`）全部零改动。`autoGenerateGuide` 保持自动触发，与两源一致。

### 5. UI（C 布局：合并时间线 + 色签过滤）

- `AnthropicBlogPanel`：文章列表合并为一条时间线，按 `publishedAt` 倒序；顶部一排栏目色签为**多选过滤器**（默认全开，会话内存态，不持久化）。
- `AnthropicArticleRow`：行内加栏目色签（颜色/标签来自 sections 配置）。
- 栏目抓取失败：面板顶部一条提示（哪个栏目 + 错误 + 重试按钮），不阻塞其他栏目渲染。
- 搜索过滤、宪法报告置顶条目、新文章徽标、删除按钮全部不动。
- 阅读器（`AnthropicArticleReader`）、旁注（`ArticleAnnotations`）、助手面板（`ArticleAssistantPanel`）零改动。

### 6. 错误处理与向后兼容

- 栏目级失败隔离（单栏目 parse 失败 ≠ 面板不可用）。
- 导读 JSON 失败沿用 `GUIDE_JSON_ERROR`；导入失败沿用现有错误路径。
- 所有新持久化字段（`section`、`sectionStatus`、`guide_version`）带缺省值；旧 state.json、旧文章 frontmatter、旧 v1 导读缓存平滑过渡，无需迁移脚本。

## 测试计划（定向，不全量）

**单元/组件**：
- 栏目配置与前缀过滤（含 `/research/team/` 排除、空排除列表）
- discover 多栏目合并 + 单栏目失败隔离 + 全失败报错
- frontmatter `section` 缺省回退（无字段旧文章 → engineering；URL 回推）
- blog-guide-v2：prompt 装配、输出解析/校验（保留 summary、无 context）、规划失败降级
- `isGuideCacheCurrent` 对 `anthropic-article` 的版本失效
- 时间线合并排序 + 色签多选过滤（组件测试）；`sectionStatus` 缺省值

**E2E**：
- `anthropic-blog*.spec` 扩展多栏目 mock fixture（三栏目合并时间线、色签过滤、单栏目失败提示）
- 博客导读 v2：沿用 `article-assistant-guide.spec.ts` 三态进度模式加博客变体
- 同步 `e2e/source-map.json`

**真实 API 冒烟**（不进 CI）：沿用 `guide-v2-real.test.ts` 模式加博客导读变体。

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| Anthropic 改版导致某栏目选择器失效 | 栏目级失败隔离 + 面板顶部明确错误提示 + 重试 |
| institute 文章量长期只有个位数 | 时间线合并后无感；栏目配置可一行增删 |
| 导读 v2 成本上升（搜索 + 三阶段） | 与 digest 已验证的成本模型一致；缓存命中后不重复生成 |
| research 部分文章偏论文风、导读质量波动 | prompt 改编自已验证的 digest v2；真实 API 冒烟把关 |
