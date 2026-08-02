# 拾贝（Scout）来源设计 — Agent 驱动的文章抓取来源

日期：2026-08-02
状态：已评审（头脑风暴五节全部确认）

## 背景与目标

夜航简报现有四个来源：前沿（digest）、Anthropic、求职（job-briefing）、写作（writing）。用户希望能「与 Agent 对话对齐需求，由 Agent 自动抓取文章原文进文章列表」，覆盖《可靠信息源.md》中 Anthropic 之外的 11 个一手信源（Lil'Log、Karpathy、Chip Huyen、LMSYS、OpenAI 等）。

抓取链路可行性已于 2026-08-02 探索验证（见附录 A）：Tavily Extract、裸 fetch+turndown、scraper 窗口三级管线覆盖全部目标站点。

**Goal**：新增第五来源「拾贝」（id: `scout`），内含 Agent 聊天助手 + 文章列表。用户与 Agent 对话（给主题或丢 URL），Agent 搜索、列候选、经用户确认后抓取全文入库；文章阅读体验与 Anthropic 博客源完全一致（摘要栏 + 旁注助手）。

**非目标（YAGNI）**：
- 研究偏好长期记忆（③）——明确不做，等真实需求出现
- Agent 自主定时巡检/订阅更新——不做
- 对话导出为学习笔记——不做（对话是运行时状态）

## 交互模式

混合模式，Agent 自然容纳两种输入：

- **给主题**：Agent 对齐需求 → `web_search` → 列候选（候选确认制）→ 用户确认 → 抓取入库
- **丢 URL**：跳过候选确认，直接 `fetch_and_save`

**候选确认制**：Agent 提出候选后不直接抓，等用户点头或圈选。抓取消耗 Tavily 配额且耗时，先确认再执行；圈选候选本身是对齐需求的一部分。

## 命名与入口（UI 出口声明）

- 中文名「拾贝」，代码 id `scout`
- `BriefingSourceSidebar` 新增第 5 个来源项，图标为贝壳/信笺类线条图标，`data-testid="briefing-source-scout"`
- `briefingSource: 'scout'` 持久化到 state.json，重启回到上次来源
- 第二列顶部双 Tab「💬 聊天 | 📄 文章」，默认落在「聊天」Tab
- 页面级元素（背景插画、换画按钮、字号控制、烛光、主题切换）对该来源全覆盖；不声明例外主色，沿用琥珀；academic/newspaper 双版式配色与全站一致

## 布局与组件通用化

`ScoutPanel` 镜像 `AnthropicBlogPanel` 结构（含双主题 class 表）：

```
BriefingListColumn（第二列，可折叠）
├─ 顶部双 Tab：💬 聊天 | 📄 文章（沿用 WritingListColumn 的 tab 样式）
│   ├─ 聊天 Tab：＋新建对话 按钮 + 对话列表
│   │     · 对话名默认创建日期（如「2026-08-02 15:04」）
│   │     · 点击名称行内改名；悬停出删除（ConfirmDialog）
│   └─ 文章 Tab：文章行列表（通用化 ArticleRow）
└─ 右屏（主区，随 Tab 切换）
    ├─ 聊天 Tab → ScoutChatView
    │     消息流 + 候选卡片 + 抓取进度 + 底部输入框（无摘要/旁注）
    └─ 文章 Tab → 与 Anthropic 博客完全一致：
          通用 ArticleReader（filePath 驱动）
          + ArticleAssistantPanel（GuideSidebar 摘要栏 + 浮动旁注窗，挂在摘要列左侧）
```

组件通用化改动清单（只动这三处）：

| 组件 | 现状 | 改动 |
|---|---|---|
| `ArticleAssistantPanel` | 已通用（props: `articleType/parentPath/articleContent`） | `articleType` 联合类型加 `'web-article'`，零逻辑改动 |
| `AnthropicArticleReader` | 名为 Anthropic，实际只吃 `filePath` | 泛化为 `ArticleReader`；Anthropic 特有分支（作者行、`AnthropicErrorMessage`）按 frontmatter `type` 条件渲染；`web-article` 走通用头（标题/来源链接/日期） |
| `AnthropicArticleRow` | 耦合 `importAnthropicArticle` 等 store action | 拆成纯展示 `ArticleRow`（标题/摘要/日期/已存态/删除）+ Anthropic 容器保留原导入逻辑；拾贝直接用 `ArticleRow`（文章总是已入库，无导入中状态） |

Store：新增 `scout` slice（对话列表/当前对话 id/消息/agent 阶段/候选/文章缓存/reader filePath），不碰 anthropic slice。

## Agent 工具协议

照搬写作助手模式（方案 1：抄模式不抄代码）：SSE 流式输出，正文嵌 ` ```tool ` 块，主进程解析执行，`MAX_TOOL_CALLS = 3`。工具协议代码是写作助手的"孪生"实现，不抽象共享框架、不动写作助手。

| 工具 | 作用 | 说明 |
|---|---|---|
| `web_search` | Tavily 搜索 | 复用现有 `searchWeb`，含错误码映射 |
| `propose_candidates` | 列出候选文章 | 输出候选 JSON（标题/URL/来源/一句推荐理由），不直接抓 |
| `fetch_and_save` | 抓取入库 | 仅在用户确认后调用，入参为确认的 URL 列表 |
| `read_article` | 读已入库文章全文 | 全文进上下文，超长 truncate 保护 |

**候选确认交互**（协议唯一 UI 特异点）：

1. Agent 发出 `propose_candidates` → 前端渲染可勾选卡片（标题/来源/推荐理由）
2. **候选预检**：呈现前主进程对每个候选 URL 跑完整三级抓取管线预检（tier-1 Tavily Extract → tier-2 裸 fetch 探测 → 均失败时 tier-3 scraper 窗口串行兜底；LMSYS/OpenAI 这类站点只能靠 tier-3，跳过会误杀可抓取候选），任一级别成功即缓存内容；三级全失败的候选灰显标记「无法抓取」、不可选。**保证呈现给用户的候选都是确定可抓取的**
3. 用户确认 → 选中项作为结构化用户消息送回对话（记录里可见：「抓取 1、3、4」）；`fetch_and_save` 优先消费预检缓存，秒级落库
4. 用户也可不点卡片、自然语言回复（「只要第一篇」），Agent 自行理解——卡片是快捷路径，不是唯一路径

**中断与并发**：沿用写作助手 abort 机制 + `sendOrInterrupt`；每对话独立 AbortController；抓取中发新消息 → 中断当前抓取，已入库文章保留，候选卡片状态保留。

## 存储与存档机制

统一根目录 `<学习库>/拾贝/`（与 `Anthropic博客`、`夜航简报` 平级系统文件夹）：

```
<学习库>/拾贝/
├── 文章/YYYY-MM/<标题>.md              ← 按月分文件夹（照抄 Anthropic博客 结构）
│   └── .assets/                        ← 图片本地化
└── 对话/<YYYY-MM-DD-HHMM>-<短id>.json  ← 对话存档
```

**文章**：
- 新 DocType `'web-article'`，frontmatter 字段：`title / source_url / source_name / published_at / imported_at / authors / summary`
- 按 ipc-state 规则 §11 全链路同步：类型枚举 → 序列化扩展字段 → 文件名推断 → 渲染类型映射 → ReportHeader → 扫描识别 → 测试
- 重名：`safeFileName` + 序号后缀；同 `source_url` 已入库 → 不重复抓，聊天提示「已在库中」并指向已有文件
- 删除文章（文章 Tab 悬停删除 + ConfirmDialog）同时删旁注对话/标注/导读——照抄 Anthropic 删除语义

**对话**：
- 结构化 `.json`（角色/工具调用/候选卡片状态完整还原，重启续聊）；文件名含日期+短 id 保序唯一；对话名存文件内部，改名不动文件名
- 选 `.json` 而非 `.md`：对话是运行时状态不是学习笔记，工具调用与候选状态无法可靠 markdown 往返
- 删除对话不删已抓文章（文章入库即独立资产）

**点亮灯火排除**：`electron/ipc/files.ts` 扫描排除清单（当前含 `writing / repository / 夜航简报 / 求职简报 / Anthropic博客`）加 `'拾贝'`。首页点亮灯火、续谈推荐、分组灵感等所有 `files:scan` 消费者自动看不到此文件夹；`.json` 对话文件也不会被 `.md` 扫描命中（双保险）。

## 错误处理

错误码在 `src/types/index.ts` 统一定义，三层同步；区分「失败」与「空」。

| 码 | 场景 | 呈现 |
|---|---|---|
| `NETWORK_ERROR` | 网络层失败 | 聊天内 Agent 消息说明 + 可重试 |
| `TAVILY_ERROR` | 搜索/Extract API 失败 | 同上 |
| `FETCH_BLOCKED` | 403 反爬，scraper 窗口兜底也失败 | 聊天说明该站抓不了，附原文链接 |
| `NO_CONTENT` | 页面抓到但正文提取为空 | 同上 |
| `LLM_ERROR` | Agent 循环异常 | 聊天内错误条，对话状态不丢 |
| `ALREADY_SAVED` | URL 已在库 | 不算错误，提示并指向已有文章 |

- **部分成功**：批量抓取按 URL 逐个汇报，聊天总结「3 成功 / 1 失败（FETCH_BLOCKED）」，失败项可一键重试
- **超时**：搜索 15s（沿用）、单篇抓取 30s、scraper 窗口 60s
- **全局 Chrome**：字号/换画/背景在空态/加载/错误下常驻（ui-styling §2/§8）
- **旧数据兼容**：state.json 新字段全部带默认值；`briefingSource` 联合类型加 `'scout'`；旧 state 缺字段走默认

## 测试策略

定向测试，不跑全量。

- **单元**：tool 协议解析（含 `propose_candidates`）；三级抓取管线 fallback 顺序（mock 三层）；候选预检（成功缓存/失败灰显）；`web-article` frontmatter 序列化/解析；对话 JSON 存档（建/改名/删/列 + 损坏文件容错）；`files:scan` 排除「拾贝」断言；重名冲突与 `source_url` 去重
- **组件**：双 Tab 切换；对话列表（默认名/行内改名/删除）；候选卡片（全选/部分选/灰显不可选/自然语言绕过）；文章模式渲染 = Reader + 摘要栏 + 旁注；空态
- **E2E**：新建 spec + `e2e/source-map.json` 新 group；mock LLM + 复用 `e2e/helpers/mock-tavily-server.ts`；覆盖：sidebar 出现拾贝、新建对话、候选确认、文章入列、打开文章带旁注、重启持久化
- **真实 API 回归**：`scripts/` 留手动脚本打真实 Tavily + 抓取链（与 `test-real-apis.js` 同款）

## 验收清单

- [ ] 空数据：无对话/无文章时的双 Tab 空态
- [ ] 失败：搜索失败/抓取失败/LLM 失败均有聊天内呈现与重试路径
- [ ] 部分成功：批量抓取部分失败，成功项正常入库
- [ ] 候选预检：不可抓取候选灰显不可选，可选候选确认后全部成功入库
- [ ] 旧数据兼容：旧 state.json（无 scout 字段）启动正常
- [ ] 跨重启持久化：对话列表/对话内容/文章列表/当前来源重启后保留
- [ ] 点亮灯火：拾贝文件夹不出现在首页与任何推荐逻辑
- [ ] 双版式：academic/newspaper 配色均正确
- [ ] UI 出口：`briefing-source-scout` 在 e2e 断言中渲染

## 附录 A：抓取链路可行性探索（2026-08-02）

12 个目标信源探测结果：

| 站点 | 裸 fetch | 结论 |
|---|---|---|
| Anthropic / MSR / Lil'Log / DeepMind / ysymyth | 200 有正文 | tier-1/2 即可 |
| Karpathy / Chip Huyen / Stanford HAI | 200 有文本无 `<article>` | tier-2 + 通用提取器 |
| LMSYS | 200 但正文 82 字（JS 渲染 SPA） | tier-3 scraper 窗口 |
| OpenAI | 403 反爬 | tier-3 scraper 窗口 |
| Meta / HuggingFace | 连接失败 | 网络层问题，视用户代理环境 |

三级抓取管线：

```
URL → 1. Tavily Extract（零新依赖，返回干净 markdown，已验证）
    → 2. 裸 fetch + turndown（turndown 已是依赖，已验证 15.8KB 干净正文）
    → 3. scraper 窗口（复用 runScriptInScraperWindow，JS 渲染/403 兜底）
    → 失败 → 类型化错误码
```
