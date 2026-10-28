# docs 文档库索引（阅读与维护协议）

> **默认历史原则**：本库 220+ 份文档是**时间点快照**，记录当时的设计与实施意图，**不保证与当前代码一致**。
> 当前代码库状态的唯一权威 = `AGENTS.md`（架构现状）+ `.claude/rules/`（提炼后的规则，按路径自动加载）+ 代码本身。
> 找现状的正确姿势：**在本文件按功能域定位 → 只精读 `current` 或域内最新文档 → 需要追溯决策时再进历史链**，不通读。
> frontmatter 带 `status` 的文档按标记解读；**无标记 = historical**。

## 状态标记

| status | 含义 | 伴生字段 | 示例 |
|---|---|---|---|
| `current` | 与当前代码一致，可当事实源读 | `verified`（最近核实日期） | `specs/2026-08-11-writing-paste-and-formatting-design.md` |
| `planned` | 已定稿、**尚未动工** | 可选 `note` | 新设计尚未实现的 spec |
| `removed` | 功能已从代码库移除 | `removal`（移除计划/墓碑路径） | `specs/2026-07-11-job-briefing-design.md` |
| `superseded` | 被后续文档取代 | `superseded-by`（新文档路径） | `specs/2026-06-21-writer-quotes-design.md` |
| `historical` | 已按本文档实施的历史记录（**默认值，可省略**） | — | 其余全部 |

校验：`npm run docs:check`（frontmatter 合法性 / 指针存在性 / 索引可达性 / **历史链全量覆盖** / AGENTS.md 与 rules 的文档引用完整性）。加 `--strict` 连警告也算失败。

---

## 功能域索引

> 每域给出：**现状**一句话 + 需要显式关注的指针（current / removed / planned / superseded）+ **历史链**（旧→新，日期为文件名前缀，plans/ 与 specs/ 按同名配对）。历史链内未标注的文档一律 historical。

### 1. 夜话会话与归档

**现状**：progress 模式归档写新 `.md` + review 模式追加复习记录在用（AGENTS.md「会话生命周期」）。
**历史链**：05-03 study-parlor（项目起点 spec/plan）→ 05-09 study-parlor-v2-redesign → 05-09 archive-trigger-redesign → 05-10 session-archive-redesign → 06-05 custom-old-topic-session

### 2. 学习库管理

**现状**：学习库扫描/分组/分页在用（AGENTS.md「文件系统」）；目录重构与记忆迁移已落地。
**历史链**：05-10 study-library-grouping → 05-30 study-library-pagination → 08-11 study-library-directory-restructure → 08-16 library-memory-migration

### 3. 推荐与灵感

**现状**：续谈推荐 + 分组灵感 + 随机卡在用（`electron/lib/llm-tasks.ts`；`WildCardRecCard` / `GroupRecCard` 组件）。
**历史链**：05-11 recommend-cards-and-delete-confirm → 05-27 group-inspiration-redesign → 06-03 continue-topic-suggestions → 06-05 continue-topic-recommendations-unification → 06-21 wild-card-recommendation

### 4. 报告、渲染与个人页

**现状**：MD 渲染（`src/components/md/`）、报告 frontmatter 展示、学习报告流程图（`electron/lib/diagram.ts` + `SVGRenderer`）、Profile 页在用。
**历史链**：05-27 md-renderer → 05-27 report-frontmatter-display → 06-03 learning-report-diagram → 06-04 profile-page-redesign

### 5. 寓言对话

**现状**：fable 风格对话在用（`FableStyleDialog`；本地 `.agents/skills/fable` 与此联动）。
**历史链**：05-31 fable-generation → 05-31 fable-style-dialog

### 6. 夜航简报 — 框架与双来源

**现状**：三来源 = 写作 + Anthropic 博客 + 书籍（`BriefingSourceId = 'writing' | 'anthropic' | 'book'`）。求职/前沿/拾贝 2026-10-12 移除（域 8），健身来源 2026-10-22 移除（域 9）。核心组件 `Briefing.tsx` + `BriefingSourceSidebar` + `BriefingListColumn`，书籍具体实现见域 14。
**历史链**：06-21 night-briefing → 06-22 night-briefing → 06-27 briefing-entry-and-loading → 06-27 briefing-ui-upgrade → 07-06 night-briefing-optimization → 07-14 briefing-polish → 07-15 renderer-buffer-and-startup-timing → 07-21 briefing-debug-fixes → 07-23 briefing-ui → 07-23 briefing-loop-closure → 07-25 pre-launch-briefing-fixes → 07-26 briefing-polish-batch → 08-01 briefing-background-generation

### 7. 简报来源 — Anthropic 博客（含精选集与推荐流）

**现状**：在用。博客面板 `AnthropicBlogPanel` + 发现/抓取链 `electron/lib/anthropic-*`（`ipc/anthropic.ts`）；导读走 guide-v2 管线。**精选集**（`BlogCollectionSection` + `blog-collection.ts`）与**推荐流**（`blog-recommend.ts`）保留——注意「收入精选集」按钮随三来源移除一并删除（10-08），博客侧精选集不受影响。
- superseded：`specs/2026-08-07-anthropic-blog-sections-design.md`（栏目配置与发现链路被 08-08 blog-multi-source 取代）
**历史链**：07-10 anthropic-blog-briefing → 07-10 briefing-blog-reader-ui-fixes → 07-11 briefing-blog-reader-ui-fixes → 07-11 briefing-blog-reader-ui-redesign → 07-11 anthropic-blog-ui-redesign → 07-15 briefing-blog-polish → 07-15 briefing-blog-polish-v2 → 08-07 anthropic-blog-sections（plan；spec 已标 superseded）→ 08-08 blog-multi-source → 08-23 blog-recommend-collection → 08-30 blog-recommend-iteration → 08-31 blog-recommend-page → 09-16 source-sidebar-order-and-blog-typography → 09-18 blog-panel-upgrade → 09-23 blog-panel-ui-polish

### 8. 简报来源 — 求职/前沿/拾贝（已移除）

**现状**：**已移除（2026-10-12 merge，spec 10-08 定稿）**——三来源连同 store 字段、IPC、学习库数据整体删除，写作与博客不受影响。**禁止依据下列 spec 复活已删功能**；如需了解删除了什么、为什么，读墓碑文档。
- 墓碑：`plans/2026-10-08-remove-three-sources.md` + `specs/2026-10-08-remove-three-sources-design.md`
- 已标 removed（plans/specs 各一份，`removal` 指针指向墓碑）：07-11 job-briefing、07-19 job-briefing-upgrade、07-25 job-briefing-optimization、08-02 scout-source + scout-source-fixes、08-04 frontier-collection、08-04 digest-guide-v2、08-06 digest-iteration-fixes

### 9. 简报来源 — 健身跟踪（已移除）

**现状**：**已移除（2026-10-22 执行，计划 10-20 定稿）**——曾作为简报第三来源上线（计划管理/逐组记录/尺寸/趋势图，merge `4e42f8e`），后整体拆除（组件/IPC/store/测试全删）。原始 spec/plan 已随移除删除，历史在 git；移除决策与拆除范围看墓碑。
- 墓碑：`plans/2026-10-20-remove-fitness-source.md`

### 10. 文章阅读 / 导读 / 助手 / 旁注

**现状**：导读 v2 管线（`guide-v2.ts` / `guide-v2-pipeline.ts`）+ 对照右栏 + AI 助手 + 旁注在用（`ipc/article-assistant.ts`、`ipc/annotations.ts`、`article-assistant-prompt.ts`），服务博客与写作两来源。
**历史链**：07-11 article-assistant → 07-11 article-assistant-guide-improvements → 07-11 briefing-assistant → 07-19 annotation-iteration → 07-22 briefing-ai-chat-enhancement → 08-02 agent-article-pipeline → 09-29 reading-position-companion-and-hr

### 11. 网络搜索与外部资料

**现状**：Tavily 网络搜索在用（`electron/lib/search.ts` + `ipc/search.ts` + `credentials.ts`），供简报/写作助手调用；外部资料摘要面板（`ExternalSummaryPanel`）在用。
**历史链**：06-21 web-search → 07-06 external-materials-summary-panel → 07-28 two-round-search

### 12. 写作功能

**现状**：Typora 式 WYSIWYG 编辑 + 目录树 + AI 写作助手全链在用（AGENTS.md「写作功能」）。
- current：`specs/2026-08-11-writing-paste-and-formatting-design.md`（**编辑器行为设计基准**，改编辑器前必读，rules feature-development §13）
**历史链**：07-19 writing-feature → 07-26 job-writing-assistant（求职半边已随三来源移除，写作助手 UI 统一半边仍在）→ 08-08 writing-ux-fixes → 08-09 writing-table-ui → 08-09 writing-tree-inline → 08-09 writing-list-behavior → 08-10 writing-assistant-agent-loop → 08-11 writing-paste-and-formatting（=current）→ 08-12 writing-repository-ux → 08-12 non-md-preview → 08-12 writing-format-fixes → 08-17 writing-daily-backup → 08-20 writing-companion-pane → 08-20 writing-html-preview → 08-23 writing-codeblock → 08-24 writing-html-delete-mode → 09-16 writing-html-file-display → 09-16 blog-companion-writing-picker

### 13. 笔记系统（书架/专辑墙）

**现状**：在用（2026-10-22 上线）——书架（分组/星标/排序/导入）+ 专辑墙 + 阅读室（`ipc/notes.ts`、`src/components/notes/`），笔记来源四类归类。
**历史链**：10-20 notes-bookshelf → 10-20 notes-bookshelf-requirements → 10-22 notes-album-wall → 10-26 blog-notes-album-wall-and-note-creation（博客↔笔记联动）

### 14. 简报来源 — 书籍

**现状**：**已实现（2026-10-27）**——简报第三来源「书籍」支持仅 PDF 导入、复制到 `<学习库>/books/`、按目录拆分章节、章节阅读、章节导读、全书导读、对照、旁注，以及关联书籍创建笔记。实现入口为 `electron/lib/books.ts` + `electron/ipc/books.ts` + `src/components/books/`。
- **体验打磨（2026-10-27 已落地）**：折叠列即卸载内容（`BriefingListColumn.renderWhenCollapsed` 为博客 rail 保留逃生口）、导读 SVG 三阶段罗盘（`GuideCompass`）、书籍对照「＋ 新建笔记」、截断文本 hover 全展示（`Tooltip`）。
- **解析器 v3（2026-10-28）**：`itemsToRows → rowsToBlocks → blocksToMarkdown`（行距 / 字号 / 缩进判段 + `##`/`###` 标题层级 + 页眉页脚过滤）；目录页新增「页码 标题」布局；重解析按章节对齐保留旧导读，目录未变时保留全书导读；`BOOK_PARSER_VERSION = 3`。已知边界：表格仍拍平、双栏段落顺序可能不等于阅读顺序。
- current：`specs/2026-10-27-books-reading-polish-design.md`（设计 + 实现记录；§6 记了三处实现期修正）
- historical：`specs/2026-10-27-books-source-design.md` + `plans/2026-10-27-books-source.md`（设计与实施记录；当前事实以代码和 AGENTS.md 为准）
- 验证：书籍单测 96/96 通过（10 个 `tests/book*.test.ts`，2026-10-28 复核实跑）；E2E 3 用例（books + books-import spec，source-map 已登记 books group，实现者报告通过）；`tsc --noEmit` 双 tsconfig 通过
- **历史链**：10-27 books-source → 10-27 books-reading-polish

### 15. 迭代记事板

**现状**：条目化双 tab 面板在用（AGENTS.md「迭代记事板」）；接单/归档流程见 `.agents/skills/notepad-triage/SKILL.md`。
**历史链**：10-19 notepad-upgrade-design（条目化改造，已实施）

### 16. 设置 / 向导 / LLM 配置

**现状**：首次配置向导（`SetupWizard`）+ Settings 页 + 多 LLM 配置切换（`electron/lib/llm-configs.ts`）在用。
**历史链**：06-05 setup-wizard → 06-14 settings → 06-14 settings-page → 09-19 llm-config-switch

### 17. DIY 术语

**现状**：术语面板在用（`TerminologyPanel`）。
**历史链**：06-22 diy-terminology-design → 06-27 diy-terminology

### 18. 语录

**现状**：`Quote` 组件与语录资产在用（ui-styling §11 诗意资产登记制）。
- superseded：`specs/2026-06-21-writer-quotes-design.md`（Quote 展示决策被 06-25 quote-display-refinement 取代）
- 素材清单：`plans/quotes-collection-draft-2026-06-22.md`（196 条筛选草案）
**历史链**：06-21 writer-quotes → 06-25 quote-display-refinement

### 19. 交互与 UI 打磨

**现状**：设计语言与动效协议已沉淀为规则（`.claude/rules/ui-styling.md` §11）；主题切换在用。
**历史链**：05-11 interaction-design → 05-11 interaction-design-part1 → 05-11 interaction-design-part2 → 05-11 interaction-deferred（当时推迟项，均已过期）→ 05-31 loading-screen → 07-24 ui-polish-batch → 07-24 ui-polish-fix-batch → 07-24 ui-polish-layout-batch → 07-25 briefing-aesthetic-elevation → 07-25 aesthetic-elevation → 07-26 study-theme-toggle

### 20. 画作策展与封面

**现状**：画作库 + 焦点裁剪（`PaintingCropButton`）+ 换画（`SwapPaintingButton`）+ 删画（`DeletePaintingButton`）在用（`ipc/paintings.ts`、`painting-focus.ts`）；策展流水线规则 = `.claude/rules/paintings-curation.md`。
- current：`plans/paintings-collection-draft-2026-09-28.md`（**策展事实源**：图源坑/批次史/风格总结）
**历史链**：05-11 art-backgrounds → 09-28 paintings-collection → 09-28 painting-delete-button → 10-07 cover-painting-crop → 10-08 cover-painting-crop

### 21. 扩展页与分组导览

**现状**：Extension 页（`Extension.tsx`）与分组导览（`GuidePopover`）在用。
**历史链**：06-05 extension-page → 06-05 group-guide-button

### 22. E2E 与工程基建

**现状**：定向测试为日常门禁（`e2e-changed.js` + `e2e/source-map.json` 孤儿检测，AGENTS.md「E2E 定向测试」）；启动看门狗在用。
- 长期跟踪：`plans/2026-07-10-fix-dev-hang-and-orphan-processes.md`（历次启动问题根因档案，AGENTS.md 指定排查入口）
**历史链**：06-24 e2e-automation → 06-27 e2e-full-coverage → 07-02 e2e-coverage-expansion → 07-10 claude-rules-from-project-history（规则体系起源）→ 07-11 silent-e2e → 07-22 writing-e2e-coverage → 07-25 e2e-targeted-testing

### 23. 项目级历史规划

- historical（显式标记）：`docs/6.27 V2 OKR.md` + `docs/6.27 V2 OKR Implementation.md` —— 2026-06-27 项目路线图，已被实际演进超越，仅作历史参考，**不代表任何现状**。

### 24. 规则挖掘草稿

`docs/superpowers/rule-mining-drafts/` —— 2026-07-10 规则体系建立时的中间产物，**不入任何阅读路径**；最终规则以 `.claude/rules/*.md` 为准。

---

## 维护协议（功能交付的一部分）

功能落地 / 设计推翻 / 功能移除后，**必须**同步本文件与相关 frontmatter（强制规则见 `.claude/rules/feature-development.md` §14；2026-10-27 用户定调：开发完代码必须维护本 README）：

| 事件 | 动作 |
|---|---|
| 功能落地 | 本文件对应域更新「现状」与历史链；spec/plan 默认 historical 免标 |
| 设计被后续文档推翻 | 旧 spec 标 `status: superseded` + `superseded-by` 指向新 spec |
| 功能移除 | 保留/补写移除计划作**墓碑**；相关旧 spec/plan 标 `status: removed` + `removal` 指向墓碑；**禁止裸删 spec** |
| 新设计未动工 | spec + plan 标 `status: planned`，防止被当成已实现 |
| 文档被钦定为设计基准 | 标 `status: current` + `verified`（随大版本复核日期） |
| 新建功能域 | 本文件新增一节：现状一句话 + 指针 + 历史链 |

**历史链写法约定**（`docs:check` 的 E6 按此校验全量覆盖）：每段为 `MM-DD slug`——slug = 文件名去掉 `YYYY-MM-DD-` 前缀、去掉尾部 `-design`/`-plan`（保留 `-v2` 等）；同日多条各自带日期；无日期前缀的文件（OKR/草稿）在索引中写完整文件名。

提交前跑 `npm run docs:check`，错误清零才算交付完成；`--strict` 时连警告也算失败。
