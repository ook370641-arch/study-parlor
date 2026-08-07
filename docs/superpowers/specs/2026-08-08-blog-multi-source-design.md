# Anthropic 博客五来源完整序列 + All 过滤器交互 设计

日期：2026-08-08
状态：已确认（用户批准方案 A 与全部六节设计）
前作：`2026-08-07-anthropic-blog-sections-design.md`（三栏目扩展 + 导读 v2），本文档取代其栏目配置与发现链路部分。

## 背景与目标

博客源上一轮扩展为 engineering/institute/research 三栏目后暴露四个问题：

1. **拉取不全**：research 索引页只展示最新 11 篇（全量 144 篇只在 sitemap）；部分 research 文章无标题（JS 渲染卡片 DOM 提取失效）。
2. **过滤器交互不完整**：无 All 按钮，"默认全开"是隐式状态。
3. institute 全站只有 1 篇文章，不值得占一个按钮。
4. **导读卡死**：生成停在"撰写导读中……"无终态，E2E 未覆盖该路径。

**目标（用户原话）**：一劳永逸完成博客建设——多来源完整博客序列 + 完整用户交互链路。

**成功标准**：应用面板时间线可见五来源全量文章（Engineering 25 + Research 144 + Alignment 30 + Interpretability 55 + Product 204 ≈ 458 篇），每篇有标题和日期；All/多选过滤器交互符合第 4 节状态机；导读生成必达终态（成功或可见错误）。

**非目标**：/news（255 篇产品通稿，太浅，前沿 digest 已覆盖）；policy / economic-index（上轮已排除）；通用博客源插件框架（YAGNI）；代理自动发现/配置 UI（跟随系统代理即可）。

## 来源选型（2026-08-07/08 实测验证）

实测方法：node fetch 探测 sitemap/索引页/RSS/文章页；product 源经系统代理（127.0.0.1:7892）验证。

| 源 | key | 全量 | 发现链路 | 元数据来源 | 证据 |
|---|---|---|---|---|---|
| anthropic.com/engineering | `engineering` | 25 | sitemap | 索引页 DOM（近期）+ og 回填（老文章） | 生产中 + 本次 sitemap 复核 |
| anthropic.com/research | `research` | 144（排除 5 个 team 页） | sitemap | 索引页 DOM + og:title 回填 | sitemap 实测 149-5=144；抽查 6 篇 200 且 og:title 均在 |
| alignment.anthropic.com | `alignment` | 30 | 静态列表（首页 HTML） | 列表自带标题/描述/月份；精确日期 import 时从文章页补 | 首页 `a.note` 结构实测 |
| transformer-circuits.pub | `interpretability` | 55 | RSS/Atom feed | feed 自带 title/link/updated/summary | feed.xml 实测 55 条 entry |
| claude.com/blog | `product` | 204（英文，已排除本地化前缀 ja/de/fr/ko/it 等） | sitemap | h1/og/JSON-LD `datePublished` | 经代理实测；sitemap 3389 URL 中英文 `/blog/<slug>` 204 条 |

被淘汰的候选：
- **Institute**：全站仅 1 篇正式文，移除出按钮（旧文章处理见第 4 节）。
- **独立 "product blog" on anthropic.com**：`/product` 307 → `/claude`，不存在；产品内容阵地是 claude.com/blog。
- **Sanity CMS 公开 API**：`4zrzovbb.api.sanity.io` 返回 200 但 dataset 查询结果为空（私有库），不可用作结构化来源。

实测发现的链路事实：

- 主站 research/engineering 文章页**无 `article:published_time`、无 `<time datetime>`、无 JSON-LD 日期**；og:title 必有。老文章日期来源：实现时验证 RSC payload（`self.__next_f`）是否含 `publishedOn`，否则回退 sitemap `lastmod`。
- sitemap 存在**跨栏目 307 重定向**（如 `/research/building-effective-agents` → `/engineering/building-effective-agents`）→ 元数据回填时跟随重定向，按最终 URL 规范化去重。
- alignment/circuits 是 Quarto 静态站，**无 `<article>`/`<main>` 标签**——现有 `ARTICLE_SCRIPT` 选择器链会落空，正文容器选择器必须按源参数化（Quarto: `#quarto-content` 类）。
- claude.com 文章页 og 标签属性顺序不固定（`content` 可在 `property` 前）——正则提取会漏，DOM querySelector 属性选择器不受影响；应用内提取必须用 DOM 方式。
- **claude.com 直连超时（DNS 污染/封锁）**，经系统代理可达。anthropic.com 主站与两个子站直连可达。

## 架构总览

栏目配置升级为**来源适配器**：每源声明发现策略 + 正文选择器。所有 HTTP 抓取（sitemap/RSS/元数据回填/图片）统一走 **Electron `net.fetch`**（Chromium 网络栈，自动跟随系统代理/VPN）——这是 product 源"其他可行链路"的答案：不新增代理配置项，VPN 开则五源全通，VPN 关则 product 显示可重试错误条、其余四源正常。

```
anthropic-sources.ts (来源配置：发现策略 + 正文选择器 + 色签)
        │
discoverArticles ── 每源独立失败域，按 discover 策略分派 ──► AnthropicBlogCache
        │  sitemap      → net.fetch(sitemapUrl) 全量 URL
        │                  ├─ 索引页 DOM（隐藏窗）近期富元数据（现状不动）
        │                  └─ 差集 URL → articleMetaCache 未命中 → net.fetch 文章页
        │                     解析 og/JSON-LD → 写缓存（并发 4-6，后台回填不阻塞 UI）
        │  static-list  → alignment 首页解析 a.note（标题/描述/月份）
        │  rss          → circuits feed.xml 解析 Atom entry（零回填）
        │
importArticle ── ARTICLE_SCRIPT 正文选择器按源参数化 ──► .md ──► Anthropic博客/YYYY-MM/
        │
阅读器 │ 导读 runBlogGuideV2（修复卡死）│ 旁注 │ 助手（全部零改动）
        │
AnthropicBlogPanel：All + 五源多选过滤器 + 合并时间线 + 色签
```

## 详细设计

### 1. 来源配置

改造 `electron/lib/anthropic-sections.ts`（保留文件名，概念升级为 source；渲染侧副本 `src/lib/anthropic-sections.ts` 同步）：

```ts
export interface AnthropicSource {
  key: 'engineering' | 'research' | 'alignment' | 'interpretability' | 'product'
  label: string
  color: string
  discover: 'sitemap' | 'static-list' | 'rss'
  indexUrl: string                 // sitemap/rss 策略下分别为索引页/feed URL
  sitemapUrl?: string              // discover === 'sitemap'
  linkPrefix?: string              // 主站: '/engineering/' 等；product: '/blog/'
  sitemapInclude?: RegExp          // product: 仅英文 ^https://claude\.com/blog/[^/]+$
  excludePrefixes?: string[]       // research: ['/research/team/']
  contentSelectors?: string[]      // 正文容器选择器，缺省用现有链；Quarto 两站加 '#quarto-content'
}
```

五源配置（色签）：engineering `#d97757`、research `#6b8fa3`、alignment `#b08d57`（金棕）、interpretability `#7d6b9e`（紫）、product `#c2613e`（赤陶）。均为暖色系，符合夜色设计语言，无需例外主色声明。

### 2. 数据契约（五层同步：types → IPC → preload → facade → store → 组件/测试）

1. `AnthropicSectionKey` 扩为五值。已存 frontmatter `section` 字段名与旧值不动（零迁移）。
2. `AnthropicBlogCache` 新增 **`articleMetaCache: Record<string, { title: string; publishedAt: string | null; summary: string | null; imageUrl: string | null }>`**（key 为规范化后 URL），持久化，缺省 `{}`。老文章元数据只回填一次。
3. `sectionStatus` 语义不变（每源 `{ fetchedAt, error }`），五源各一。
4. 已存文章 section 判定回退链不变：frontmatter `section` → URL 前缀回推 → engineering。`/institute/` 前缀回推保留（返回 `'institute'` 字面量，仅用于色签显示）。
5. frontmatter：`tags: ['anthropic', section]` 沿用；新源 `source_url` 为外站 URL，按 URL 去重天然兼容。存储目录仍 `Anthropic博客/YYYY-MM/` 不分源。
6. 缓存带格式版本字段；schema 变化时旧格式失效重抓（rules §8）。

### 3. 抓取链路

**HTTP 统一 `net.fetch`**：sitemap、RSS、元数据回填、图片下载全部从 node fetch/undici 改为 Electron `net.fetch`（Chromium 栈跟随系统代理）。隐藏 BrowserWindow 路径不变。

**discoverArticles**（`electron/lib/anthropic-scraper.ts`）：

- 按源顺序串行（隐藏窗单例复用），每源独立 try/catch → `sectionStatus[key].error`；全部失败才整体报错（沿用）。
- `sitemap` 策略：
  1. `net.fetch(sitemapUrl)` 解析 `<loc>`，按 `linkPrefix`/`sitemapInclude`/`excludePrefixes` 过滤出全量 URL。
  2. 索引页 DOM 抓取（现有 LISTING_SCRIPT 逻辑）拿近期文章富元数据。
  3. 差集 URL 查 `articleMetaCache`；未命中的进入**后台回填队列**：并发 4-6，`net.fetch` 文章页 → DOM 解析 og:title/og:description/JSON-LD 日期（解析器按源适配）→ 跟随重定向、按最终 URL 规范化 → 写缓存。
  4. 面板先渲染已有数据，回填完成一批推送一批（IPC 事件或轮询），不阻塞 UI。
- `static-list` 策略：解析 alignment 首页 `a.note` 卡片（h3 标题、`.description`、`.date` 月份）。日期月精度，import 时从文章页补精确日期。
- `rss` 策略：解析 Atom entry（title/link/updated/summary）。注意 entry URL 以 `/index.html` 结尾，规范化时保留原样（作为去重 key）。
- **重定向去重**：任何源内/跨源出现最终 URL 相同的文章，保留先发现者（按 ANTHROPIC_SOURCES 顺序），后者丢弃。

**importArticle**：`ARTICLE_SCRIPT` 内容选择器链按 `contentSelectors` 参数化；主站用现有链，alignment/circuits 前置 `#quarto-content`，product 用 `main` 链（实现时验证）。日期解析器按源适配（JSON-LD `datePublished` 支持 "Aug 12, 2025" 格式）。

**日期回退链**（sitemap 老文章）：RSC payload `publishedOn`（实现时验证是否存在）→ JSON-LD → og → sitemap `lastmod`。每篇文章必须最终有日期（验收要求）。

### 4. UI（AnthropicBlogPanel）

**过滤器：`[All] [Engineering] [Research] [Alignment] [Interpretability] [Product]`**

状态机（会话内存态，不持久化）：

- 初始态：All 亮。
- 点 All → 五源全排（日期倒序），All 亮、其他全熄。
- 点任一来源 → All 熄、该来源亮；来源按钮多选，时间线 = 选中来源并集（日期倒序）。
- 手动点亮全部五源 → 自动转为 All 亮（等价态收编）。
- 从 All 态点某来源 → 仅该来源单选。
- **空选择回退**：点灭最后一个亮着的来源 → 回退 All 亮（不允许空时间线）。
- 搜索框过滤与来源过滤叠加，逻辑不变。

**归类规则**：

- **宪法置顶条目算 engineering**（用户决定，暂时）：All 或 engineering 选中时显示；仅选其他源时隐藏。改掉现在 `a.local === 'constitution' ||` 无条件放行的逻辑。
- **旧 institute 文章**（仅《When AI builds itself》一篇）：过滤时按 research 参与（只选 research 或 All 时可见）；色签仍显示 "Institute"（尊重真实出处），无独立按钮。新抓取不再产生 institute。

**失败提示**：单源失败 → 面板顶部提示条（源名 + 错误 + 重试按钮），不阻塞其他源渲染。product 源 VPN 关时的标准形态。

阅读器、旁注、助手面板零改动。

### 5. 导读卡死修复 + E2E 补漏

**已锁定嫌疑**（`~/.studyparlor/debug/guide-v2-bad-shape-*.json`，2026-08-07 时段多个）：

```json
{"background":"bg","chunks":[{"heading":"一","context":"c1",...}]}
```

chunk 输出 `context` 字段，但 blog v2 校验器 `isValidGuideBlogV2` 要求 `summary` → `GUIDE_JSON_ERROR`；且错误未传导到渲染层进度态 → UI 永远停在"撰写导读中"。

**修复（两手都要）**：

1. **字段契约对齐**：blog-guide-v2 prompt 输出契约统一为 per-chunk `summary`，加负例约束（"禁止输出 context 字段"）；校验器维持 `summary` 要求。实现第一步用 systematic-debugging 复现确认（真实 API 生成一次 blog 导读）。
2. **错误传导兜底**：`articleAssistant:generateGuide` 任何异常 → store 必须退出 writing 态并显示可重试错误。这是卡死的直接原因，与 JSON 对错无关，必须先修。

**E2E 补漏**（当时缺的那颗牙）：

- mock 坏 JSON 输出 → 断言出现错误提示且进度态复位。
- mock 正常输出 → 断言导读渲染。
- 两路共同保证"终态必达"：不允许无限 writing。

### 6. 错误处理与向后兼容

- 源级失败隔离（单源失败 ≠ 面板不可用）；product 源不可达是预期内常态（VPN 关）。
- 导读 JSON 失败沿用 `GUIDE_JSON_ERROR`；抓取失败沿用 classifyError 路径。
- 新持久化字段（`articleMetaCache`、五源 `sectionStatus`）带缺省值；旧 state.json、旧 frontmatter、旧导读缓存平滑过渡。
- 外部数据防御（rules §1/§5）：sitemap/RSS/列表解析的每条记录视为可能缺字段，无效记录跳过不抛。

## 测试计划（定向，不全量）

**单元/组件**：

- sitemap 解析与前缀过滤（team 排除、本地化前缀排除、重定向规范化去重）
- 三种发现策略适配器，各带**真实页面 fixture 契约测试**（抓一份真 HTML/XML 存 `tests/fixtures/`，站点改版选择器失效时测试立即红）
- `articleMetaCache` 命中/回填/增量/旧格式失效
- 日期回退链（RSC/JSON-LD/og/lastmod 优先级）
- 过滤器状态机（All↔多选切换、全选收编、空选择回退 All、搜索叠加）
- constitution 归类（engineering/All 可见，其他源隐藏）；institute→research 映射
- `sectionForUrl` 旧数据兼容（含 `/institute/` 前缀）
- blog 导读：prompt 契约（禁 context）、错误传导复位

**E2E（同步 `e2e/source-map.json`）**：

- 五源合并时间线 + All/多选交互全状态机
- 单源失败提示条 + 重试
- 导读终态断言（成功/失败两路）
- 跨重启 `articleMetaCache` 持久化

**真实链路验收（`@real` 手动，不进 CI）**：

- 五源 discover：时间线文章数 = 25 + 144 + 30 + 55 + 204（product 需 VPN），每篇有标题和日期
- blog 导读真实生成一次到达成功终态

## 风险与缓解

| 风险 | 缓解 |
|---|---|
| 站点改版导致某源选择器失效 | 源级失败隔离 + 错误提示条 + 真实 fixture 契约测试立即报警 |
| product 源 VPN 关时不可用 | 预期内：错误条 + 重试；其余四源直连可达 |
| 首次回填 458 篇耗时 | 并发 4-6 + 持久化缓存 + 后台渐进渲染，仅首次 |
| research 老文章日期字段不存在 | 回退链最后一级 sitemap lastmod 兜底，保证每篇有日期 |
| alignment 与 research 双发文章重复 | 不同栏目各自保留（两边出处都真实）；跨源重定向到同一 URL 的才规范化去重 |
| Quarto 站正文提取结构差异 | 每源 contentSelectors 参数化 + fixture 契约测试 |

## 实现时待验证清单（阻塞项需在编码前确认）

1. research 老文章页 RSC payload 是否含 `publishedOn`（决定日期回退链第一级）。
2. claude.com/blog 正文容器选择器（`main` 链是否够）。
3. Quarto 两站 `#quarto-content` 选择器在 alignment/circuits 文章页均成立。
