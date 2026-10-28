---
status: historical
note: 设计已于 2026-10-27 落地；当前事实以代码、AGENTS.md 与 docs/README.md 为准
---

# 书籍来源（第三来源）— 设计稿

> 决策已与用户确认（2026-10-27 对话）：
> - 文章列改为**两列**：先选书、再选章节；导读/对照随章节切换
> - 支持从书籍**新建笔记**，笔记关联书籍（`NoteSource` 已有 `'book'` 值）
> - **全书导读要**，但只传目录、不传正文
> - 存储：导入即复制到 `<学习库>/books/`，与原文件解耦
> - 格式：**仅 PDF**（EPUB 官方渠道经多轮查证确认不可得，不做预留、不立项）

---

## 1. 背景与目标

书籍是导读/对照体系的第三个内容来源（前两个：写作、Anthropic 博客）。目标用户场景：读长篇 PDF 书读不完、读完无沉淀、无法与自己的笔记/写作连接。

本功能同时作为"AI 产品设计面试八问"的回答案例，设计决策需能直接映射到八问答案（见 §9）。

## 2. 现状与约束

### 2.1 复用资产（已核实）

| 资产 | 位置 | 复用方式 |
|---|---|---|
| 导读管线 | `electron/lib/guide-v2.ts` / `guide-v2-pipeline.ts` + `electron/prompts/blog-guide-v2.md` | 章节导读直接走此管线，prompt 派生书籍变体 |
| 导读/对照右栏 | `src/components/article-assistant/ArticleGuideTabs.tsx`（`GuideSidebar` + `ArticleCompanionBoard`） | tab 结构不变，`ArticleSideSource` 加 `'book'` |
| 旁注 | `electron/ipc/annotations.ts` + `ArticleAnnotations.tsx` | 零改动：旁注按 `articlePath` 存同名 `.annotations.md` 边车文件，章节是真实 md 文件即天然兼容 |
| 笔记 | `electron/ipc/notes.ts`（`notes:create` 已接受 `source`）、`NoteMeta.source` 已含 `'book'` | 新建笔记传 `source: 'book'` |
| PDF 解析 | `pdfjs-dist@4.10.38` 已是依赖 | 主进程 legacy build 直接可用 |

### 2.2 Spike 结论（2026-10-27 实测）

- `Intercom_on_Jobs-to-be-Done.pdf`：51 页，**无 PDF 书签**，但第 3 页是干净的文字版目录页（章节标题 + 印刷页码两列），全文文字层干净。→ 章节切分走"目录页解析 + 页码偏移映射"。
- `余浩洋-AI产品经理-南京大学.pdf`：实为 1 页简历（非书），可用于解析冒烟测试，不作为书籍场景。
- Intercom 官网书籍页可访问，EPUB 渠道经多轮查证（官网页面源码无 epub/mobi/pdf 资源链接、候选下载 URL 全部 404）**确认不可得**；Kindle 版为 Amazon 付费渠道。结论：仅支持 PDF，不留 EPUB 接口。

## 3. 架构总览

核心映射：**书 = 来源，章 = "文章"**。导入时把 PDF 按章拆成真实 md 文件，之后每一章完整复用导读/对照/旁注，不为它们写新 UI。

```
<学习库>/books/
└── Intercom on Jobs-to-be-Done/
    ├── source.pdf              # 导入时复制的原件（与桌面原文件解耦）
    ├── book.json               # 元数据 + 目录 + 全书导读缓存
    └── chapters/
        ├── 01-foreword.md      # frontmatter: title / chapter_index / page_range
        ├── 02-introduction.md
        └── ...
```

- `book.json`：`{ title, importedAt, sourceFile: "source.pdf", toc: [{ title, chapterFile, pageStart, pageEnd }], bookGuide?: { content, generatedAt } }`
- 章节 md frontmatter：`{ title, chapter_index, page_range: [start, end] }`（印刷页码）

## 4. PDF 解析管线（`electron/lib/book-parse.ts`）

导入流程（`books:import` 触发）：

1. 弹文件对话框选 PDF → 复制到 `books/<清洗书名>/source.pdf`
2. pdfjs 加载，逐页抽文本；**无文字层（扫描版）→ 明确报错"扫描版 PDF 暂不支持"，不入架**
3. 目录获取回退：
   - a. 目录页文本解析：定位含 "Table of Contents" / "目录" 的页，支持两种抽取布局（行内"标题 页码" / 标题块+页码块）
   - b. 无目录页 → 整书作为单章导入，书架卡片标"无目录"角标
   - （PDF 书签 `getOutline()` 本期不实现：JTBD 实测无书签、无测试样本；遇到"有书签但无目录页"的书再补，见 §11）
4. 页码偏移：目录页印刷页码 → PDF 物理页索引（用正文首页抽样校准偏移量）
5. 按页区间切章，写 `chapters/NN-<slug>.md`
6. 幂等：`book.json` 存在且 `source.pdf` mtime 未变 → 跳过解析直接复用

纯函数（可单测）：目录页文本解析、页码偏移映射、章节切分。pdfjs IO 与纯逻辑分离。

## 5. 导读设计

- **全书导读**：首次展示书架卡片时懒生成（`books:bookGuide` 命中缓存则直接返回），**只传目录（章节标题列表）+ 书名，不传正文**。产出"这本书讲什么 / 适合谁 / 建议读法"卡片，缓存进 `book.json.bookGuide`，书架卡片展示。
- **章节导读**：打开章节时懒生成，复用 guide-v2 管线。输入 = **本章正文 + 全书目录（定位上下文）+ 前一章导读摘要（如已缓存）**。目录让导读知道本章在全书的位置，前章摘要提供连续性。
- prompt：`electron/prompts/book-guide-v2.md` 从 `blog-guide-v2.md` 派生，新增"全书目录"与"前章摘要"两个注入段。

## 6. 对照、旁注与笔记

- **对照**：复用 `ArticleCompanionBoard`（挑写作与当前章节对照），章节切换时对照目标随之切换。
- **旁注**：复用 `ArticleAnnotations`，锚定键 = 章节 md 路径，边车文件落在 `chapters/` 内。
- **新建笔记**：章节阅读页与旁注卡片提供"存为笔记"入口 → `notes:create({ title: "<书名> · <章节标题>", source: 'book' })`；`NoteMeta` 增加可选字段 `book?: string`（书名），便于笔记书架按书聚合展示。

## 7. UI 设计

### 7.1 布局（source === 'books' 时，两列列表）

```
┌──────┬───────────┬───────────┬──────────────────────────────┐
│ 来源栏 │ 书籍列     │ 章节列     │ 主区                          │
│      │ ┌───────┐ │ ┌───────┐ │ ┌──────────────────────┐ │
│ 写作  │ │书卡 A  │ │ │章节 1  │ │ │ 章节正文（只读 md 渲染）  │ │
│ A社  │ │书卡 B ▾│ │ │章节 2 ▾│ │ │  + 旁注锚点            │ │
│ 书籍 ▾│ └───────┘ │ └───────┘ │ ├──────────────────────┤ │
│      │ [+ 导入]  │           │ │ 右栏：导读 / 对照 tab     │ │
└──────┴───────────┴───────────┴──────────────────────────────┘
```

- `BriefingSourceSidebar` 加第三个图标 `book`（`briefingSource` 联合类型加 `'book'`，与 `NoteSource`/`ArticleSideSource` 命名一致）。
- 书籍列：书卡（书名 / 章节数 / 全书导读摘要 / "无目录"角标），底部"导入书籍"按钮。
- 章节列：选中书的章节列表，复用 `BriefingListColumn` 折叠行为。
- 主区：章节正文用 `MarkdownRenderer` 只读渲染 + `ArticleAnnotations` + "存为笔记"按钮；右栏 `ArticleGuideTabs source="book"`。

### 7.2 状态

- store 新增：`booksList`、`activeBook`、`activeChapter`、`articlePanelMode` 键扩展 `'book'`。
- state.json 新增：`booksLastBook?: string`（恢复上次打开的书）。

## 8. IPC 面（`electron/ipc/books.ts`）

| channel | 入参 | 返回 | 说明 |
|---|---|---|---|
| `books:list` | — | `BookEntry[]` | 扫 `books/*/book.json` |
| `books:import` | — | `{ book } \| { error }` | 对话框选 PDF → 复制 → 解析入架（全书导读不在此生成，保持导入快） |
| `books:chapters` | `{ bookDir }` | `ChapterMeta[]` | 读 book.json 的 toc |
| `books:readChapter` | `{ chapterPath }` | `{ content, meta }` | 读章节 md（frontmatter + body） |
| `books:bookGuide` | `{ bookDir }` | `{ content }` | 全书导读；有缓存直接返回，无则生成（仅目录入 prompt） |
| `books:delete` | `{ bookDir }` | — | 确认后整目录删（沿用写作区约定） |

路径安全复用 `assertInsideLibrary` 同款校验（`books/` 在库内即合法）。

## 9. 面试八问映射

| 问 | 本设计的答案锚点 |
|---|---|
| 1 解决谁的问题 | 读长篇 PDF 书的知识工作者：读不完、读完无沉淀 |
| 2 为什么值得 | 书籍是深度学习主载体，但读完留存率极低，笔记散落各处 |
| 3 现状替代方案 | 微信读书（不持本地 PDF）、NotebookLM（无个人知识库连接）、手动摘抄 |
| 4 为什么必须 AI | 目录感知的章节导读、前章连续性摘要——不是规则/模板能生成的 |
| 5 砍了什么 | §11 四条 |
| 6 什么时候失败 | §10 失败场景清单 |
| 7 核心指标 | 章节导读完成率 / 旁注+笔记产生率 / 章节 7 日后复习回访率 |
| 8 再给 2 周验证什么 | 先拿 JTBD 一本书走通"导入→章节导读→旁注→笔记"全链路验证价值，而不是补 EPUB/问答 |

## 10. 边界与失败场景

- **扫描版 PDF**（无文字层）：导入即检测、明确报错，不入架 —— 诚实失败优于硬上 OCR。
- **无目录且无书签**：整书单章 + "无目录"角标，不阻塞使用。
- **目录页解析模式不匹配**：回退到上一策略；三级全失败 = 单章。
- **页码偏移校准失败**：按目录页码直接当物理页索引用，章节边界可能漂移 —— 可接受，导读不受影响。
- **大文件**：实测 51 页解析 < 1s；百页级书籍解析期间给进度提示。

## 11. 明确不在本期

- EPUB / MOBI 等其他电子书格式（官方渠道确认不可得，未来若来源变化另行立项）
- PDF 书签（`getOutline()`）目录提取（本期无测试样本；遇到相关书籍再补）
- PDF 原版页面渲染 / 双栏页码对照视图
- 全书自由问答（chat-with-book）
- OCR 支持扫描版

## 12. 测试

- `tests/book-parse.test.ts`：目录页文本解析（JTBD 真实目录页 fixture）、页码偏移映射、章节切分。
- `tests/books.test.ts` / `tests/books-import.test.ts`：book.json 读写、书架扫描、导入编排（切章/单章回退/无文字层报错/重名后缀）。
- `tests/book-guide.test.ts`：章节导读上下文块（书名+目录+前章摘要）装配断言。
- `e2e/source-map.json` 新增 `books` group（导入/章节切换/导读 tab/存为笔记）。

## 13. 落地顺序（供 writing-plans 参考）

1. `book-parse.ts` 纯逻辑 + 单测（目录页解析/偏移/切分）
2. `books:import` + `books:list` + 书籍列 UI（能导入、能上架）
3. 章节列 + 章节正文渲染（能读）
4. 章节导读接入 guide-v2 + book-guide prompt（能导读）
5. 对照/旁注接线（`ArticleSideSource` 扩展）
6. 存为笔记 + `NoteMeta.book` 字段
7. 全书导读生成 + 书卡展示
8. E2E + source-map 登记
