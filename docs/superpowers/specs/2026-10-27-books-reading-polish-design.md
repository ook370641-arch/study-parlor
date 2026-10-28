---
status: current
verified: 2026-10-28
note: 2026-10-27 全部落地（6 项，含 hover 全展示）；2026-10-28 追加导读加载态改版与两处走查修正（§8、§9）
---

# 书籍来源体验打磨 — 设计稿（2026-10-27）

> 来源：用户对已上线书籍来源（域 14）的现场走查，按「影响 demo 可信度」排序：
> 1. 收起第二/第三列后内容仍被挤在 56px 窄栏里（写作页同类问题已修，书籍未跟进）
> 2. 章节导读生成过程只有「一行字 + 1px 进度条」，无法可视化呈现检索与撰写实况
> 3. PDF 抽取把正文挤成一坨：段落、页面孤行被拍平成一行行硬换行
> 4. 书籍「对照」tab 里找不到新建笔记入口（博客有「＋新建」，书籍没有）
> 5. 全书导读、章节标题、章节列表长期截断，无任何查看完整内容的途径
>
> 本次只做「可解释 + 可读 + 可操作」的打磨，**不新增来源、不引入新模型、不改导入数据模型**（唯一例外：给 `book.json` 加一个解析器版本号字段，用于旧书重解析提示）。

## 1. 背景

书籍来源是 2026-10-29 面试 demo 的主展示链路（见 `宣传文案/合合信息面试Demo准备-功能选型与八问.md`）。走查发现的 5 个问题都不是「功能缺失」，而是**同一个功能在不同状态下的表达失败**：

- 折叠态泄露内容 → 看起来像布局 bug，直接损害「这是个能演示的产品」的第一印象；
- 进度不可见 → 无法讲清「Agent 在做什么」，而这恰恰是面试里最重要的机制叙事；
- 文本挤成一坨 → 让「结构化文档」的主线叙事自相矛盾：明明宣称先结构化再 AI，正文却连段落都没有；
- 找不到新建笔记入口 → 砍断了「阅读 → 沉淀」闭环，而这正是产品价值主张的最后一跳；
- 标题截断 → 长书名/长章节名在 demo 里经常出现，观众看不清对象。

## 2. 问题与方案

### 2.1 折叠列内容泄露（P0）

**现状**：`BriefingListColumn`（`src/components/BriefingListColumn.tsx`）无论是否折叠都渲染 `children`，折叠时只是把 `<aside>` 收到 `w-14` + `overflow-hidden`。书籍面板里 `BookListColumn` / `ChapterListColumn` 的卡片仍是 `w-full`，于是被截成一条条碎片挤在 56px 里；`ChapterListColumn` 内层还自带 `overflow-y-auto`，会跟着 `aside` 的 `flex-1` 高度被压扁。

写作页 2026-10-22 已用「收起即空」修过同类问题（`WritingListColumn` 折叠时返回 `<div className="h-full" />`）。但书籍面板的折叠开关在**外层** `BriefingListColumn`，内层组件不知道自己被折叠，没法照抄。

**方案**：在 `BriefingListColumn` 内部统一处理——`collapsed` 时不渲染 `children`，只留头部（标题隐藏、只保留 `▶` 展开按钮），内容区渲染 `<div className="flex-1 min-h-0" />`。

- 这样 `BookPanel`、`Briefing.tsx`（写作）、`AnthropicBlogPanel` 三处同时受益，且不会再出现「内层组件忘了处理折叠」的新回归。
- 外层调用方不需要改：`WritingListColumn` 自己的 `collapsed` 分支保留（它是被折叠态下的空实现，无害；且写作页在别处也可能复用）。
- 头部按钮在 56px 栏里居中（已有 `justify-center` 分支），保持不动。

**测试**：`tests/briefing-list-column.test.tsx`（新增，渲染层单测）——折叠时不渲染 `children` 的 testid，展开时渲染；折叠态下 `guide`/列表 DOM 不存在。

**E2E**：`books.spec.ts` 增加断言：折叠书籍列 → `book-list-column` 不存在 → 展开后恢复。

### 2.2 导读生成过程可视化（P0）

**现状**：`GuideSidebar` 在 `guideLoading` 时只渲染一行文字（`guide-progress`）和一条 1px 进度痕。`GuideProgress` 三阶段：

```ts
| { stage: 'planning' }
| { stage: 'searching'; done: number; total: number }
| { stage: 'writing'; chars: number; entriesDone: number; entriesTotal: number }
```

面试 demo 需要「看得见的检索」：现在观众看不到检索了几个查询、命中了什么，只能看到 `1/3`。

**方案：一段自洽的 SVG「导读罗盘」**，用纯 SVG + CSS 动画（无第三方库）表达三阶段，且**只吃现有进度数字**，不伪造数据。

视觉结构（220×120 viewBox，`preserveAspectRatio="xMidYMid meet"`）：

```
        ┌──── 阶段 1 规划 ────┐   ┌──── 阶段 2 检索 ────┐   ┌──── 阶段 3 撰写 ────┐
  · 一页文档轮廓缓慢描边（dash-offset 呼吸）            →  查询脉冲点沿三条弧线飞出    →  图章/条目逐条点亮
```

- **阶段 1（planning）**：一个文档轮廓矩形（代表本章正文）自上而下扫描一条 ember 光线，配合一圈缓慢旋转的虚线环（`transform: rotate` + `animation-duration: 6s`），表达「AI 在读结构、规划要查什么」。文案：`正在拆解章节结构…`。
- **阶段 2（searching）**：文档右侧出现 `total` 个小节点（最多显示 8 个，超出折叠为「+N」），每个节点在对应检索完成时由灰变 ember，并从节点向右侧资料夹图标发出一条虚线弧，弧线上有一个沿路径运动的小圆点（`<animateMotion>` 或 CSS `offset-path`；**优先 CSS**，因为 E2E 与 `prefers-reduced-motion` 都要可控）。节点下方显示 `done/total`。文案：`正在检索 $total 条线索…`。
- **阶段 3（writing）**：左侧文档轮廓内按下标逐格填色（`entriesTotal` 格，最多 12 格），已填格从 `ember/20` → `ember`，当前格闪烁一次；右侧显示 `§done/§total` 与「已写 N 字」。
- **完成态**：三阶段全部收起，替换为一句 `导读已生成 · 用时 N 秒`（N 由 `guideLoading` 开始时间在 sidebar 内本地计算，**不作为持久化字段**）。

**降级与可访问性**：

- `prefers-reduced-motion: reduce` → 关闭所有位移动画与闪烁，只保留颜色状态；扫描线静止。
- 动画全部为装饰元素：`aria-hidden="true"`；实时文案放在带 `role="status"` + `aria-live="polite"` 的文本节点里（沿用 `guideProgressParts` 的 label/detail，不改文案口径，`tests/guide-progress.test.ts` 不需要改）。
- **保留 `data-testid="guide-progress"`，且保留文本节点**（现有 `tests/GuideSidebar.test.tsx` 的 4 条断言与 `e2e/specs/books.spec.ts` 的可见性断言依赖它）。SVG 作为 `guide-progress` 内部的兄弟节点插入。
- 新文件 `src/components/article-assistant/GuideCompass.tsx`（纯展示组件，props = `GuideProgress | null` + `theme`），`GuideSidebar` 只做条件渲染，方便单测。

**新增数据（可选、向后兼容）**：

为了「检索看得见」不至于只显示一行计数，`searching` 阶段增加两个可选字段：

```ts
| { stage: 'searching'; done: number; total: number; queries?: string[]; hits?: number[] }
```

- 主进程 `guide-v2-pipeline.ts` 在阶段 2 发起前就已拿到 `queries`（`parseGuidePlan` 的产出），带进进度事件；`hits[i]` = 该查询拿到的资料条数（失败为 0）。
- 渲染侧把 `queries[i]` 的前 12 个字作为节点旁的小字（仅 hover 展开，见 2.5 的 tooltip），`hits` 用于节点外圈大小（1 条 → 小圈，3 条 → 大圈）。
- 字段可选：旧事件没有 `queries` 时走「匿名节点」形态，不影响既有测试。

**明确不做**：不展示检索结果标题/URL（信息过载，且现场隐私）、不做百分比数字（现有 `guideProgressFraction` 只用于内部轨迹进度，不暴露）、不在完成态回放动画。

### 2.3 PDF 正文挤成一坨（P0）

**现状**：`electron/lib/books.ts` 的 `extractPagesText` 用「同 y 坐标的片段直接拼接」重建行：

```ts
lines[lines.length - 1] += text          // 片段之间不补空格
```

叠加 `buildChapterBody` 的 `pages.join('\n\n')`，结果（JTBD 实测）：

```text
Personas will always have their place. If you want to create an advertisement that attracts 21-year-
old men or 35-year-old professionals, personas will help create realistic representations of your
target audience.
5

6
```

四个具体缺陷：

1. **英文单词粘连**：pdfjs 同一行会切成多个 text item（字体/间距变化），直接 `+=` 会得到 `targetaudience`；跨行连字符 `21-year-\nold` 也不会还原。
2. **行内硬换行**：每一视觉行都是一个 `\n`，Markdown 渲染（remark-gfm，无 `remark-breaks`）把单换行当空格合并，于是整段变成巨型段落；同时诗句/列表项的分行被抹掉。
3. **页面孤行**：页眉页脚页码（`5` / `6`）成了独立段落，混进正文中间。
4. **双栏串行**：`y` 相同时左右栏片段被拼成一行（JTBD 单栏不受影响，年报双栏会串）。

**方案（分层，全部在 `book-parse.ts` 纯函数里完成，便于单测）**：

新增 `parse.ts` 侧的三个纯函数，`books.ts` 只负责 IO 与调用：

```ts
export interface RawTextItem { str: string; transform?: number[]; width?: number; height?: number }
/** 一页的 pdfjs items → 行数组；按 x/y 聚类，间距 > 0.35em 补空格 */
export function itemsToLines(items: RawTextItem[]): string[]
/** 行数组 → 段落数组：去页眉页脚页码、合并被折断的行、还原连字符 */
export function linesToParagraphs(lines: string[], opts?: { pageNo?: number }): string[]
/** 段落数组 → markdown 正文（段间空行） */
export function paragraphsToMarkdown(paras: string[]): string
```

规则细节：

- **补空格**：同一行相邻 item 的 `x_gap = cur.transform[4] - (prev.transform[4] + prev.width)`；`x_gap > 0.35 * fontHeight` 时插入 `' '`；`x_gap < -0.5 * fontHeight` 视为**换栏**，另起一行（按 x 排序后聚类）。
- **去页码**：独占一行、仅 1–4 位数字、且长度小于 6 的行丢弃（印刷页码）。目录页本身走 `parseTocPage` 前解析，不受影响（目录页不进入章节正文）。
- **合并折行**：上一行不以 `。！？.!?:"'”’)）]】` 结尾、且下一行首字符是小写字母或汉字时，合并为同一段（用单个空格连接；中文不加空格）。
- **连字符还原**：`/([A-Za-z])-\n([a-z])/g` → `$1$2`（`21-year-\nold` → `21-year-old`，`augment-\ned` → `augmented`）；行尾 `-` 后接大写字母时保留（可能是复合词换行，保守不动）。
- **标题识别**：`transform[3]`（字号）显著大于本页中位数（≥1.3×）的短行（≤60 字）视为标题，输出 `### 标题`；识别失败不影响段落合并（宁可不加标题，不伪造结构）。
- **段落输出**：段间 `\n\n`；标题前后各空一行。**不再保留视觉行换行**——这是本次唯一「宁可少、不要错」的取舍。

**旧书重解析**：

已导入的书是旧解析器产物。`book.json` 增加 `parserVersion?: number`（本次写 `2`）；`scanBooks` 时缺省视为 `1`。书籍列在 `parserVersion < 2` 的书卡上显示一条轻量提示「解析格式较旧」，点开书详情时给「重新解析」按钮 → 复用 `source.pdf` 重新走导入编排（**不重新弹选择器、不新建目录**），成功后覆盖 `chapters/`、清掉所有 `.guide.md` 侧车（正文变了，导读必须重生成），`bookGuide` 缓存也一并清除。

- 新 IPC：`books:reparse`，入参 `{ dir }`，返回 `{ ok: true, book } | { ok: false, error }`。
- **原子性**：先解析到 `.tmp-reparse-*`，成功后再换 `chapters/`（rename 两段：旧目录 → `.bak`，新目录 → 正式名，失败回滚）。
- 重解析期间 UI 显示「重新解析中…」并禁用重复点击（复用 `booksImporting` 同款 loading 语义，新增 `booksReparsing`）。

**不做**：不改导入数据模型（`toc` 结构不变）、不引入 OCR、不做双栏重排的高级版式还原（只做「不串行」的最低保障：同一 y 的两个 x 簇分成两行，顺序按 x 升序）。

### 2.4 书籍对照缺「新建笔记」入口（P1）

**现状**：博客对照的 `CompanionWritingPicker` 支持 `currentArticle`，命中时高亮，未命中时笔记段标题右侧出现「＋ 新建」→ `findOrCreateArticleNote` → 创建后直接放进对照槽。书籍面板传的是 `currentArticle={null}`（`BookPanel.tsx:45`），所以这段入口整段消失。

更关键的是：**书籍没有「与当前章节对应的笔记」这个概念**。`BookReader` 的「存为笔记」创建的是 `title = "<书名> · <章节标题>"`、`url: ''`、`source: 'book'`、`book: <书名>`。当前 `findOrCreateArticleNote` 只按 `meta.url` 去重，`url` 为空会导致所有书籍笔记互相命中，**不能直接复用**。

**方案**：

1. **store 泛化去重键**：`findOrCreateArticleNote` 接受可选 `source: 'anthropic' | 'book'` 与 `book?: string`；去重条件从「`meta.url === a.url`」改为：
   - `source === 'anthropic'`：仍按 `meta.url` 精确匹配（行为不变）；
   - `source === 'book'`：按 `meta.source === 'book' && meta.book === book && meta.title === title` 匹配（即「同一本书下同一章节标题的笔记」）。
2. **picker 泛化**：`CompanionWritingPicker` 的 `currentArticle` 类型改为通用的 `currentTarget?: { key: string; label: string; noteExists: boolean } | null`，并把「＋ 新建」的点击回调提升为 `onCreateNote?: () => Promise<string>`（返回笔记路径，picker 内部调用 `onPickFile(path)`）。博客侧传现有行为（`findOrCreateArticleNote` + `selectWritingFile` 语义不变），书籍侧传「按章节创建/复用」。
3. **书籍侧接线**（`BookPanel.tsx`）：`pickerOpen` 时传 `currentTarget`（`key = activeChapter.path`，`label = "<书名> · <章节标题>"`），`onCreateNote` 复用 `BookReader.createChapterNote` 的标题/正文规则，创建成功后 `selectArticleCompanion('book', chapter.path, notePath)` 放进对照槽。
4. **标题栏文案**：picker 顶部提示从「选择一篇文章放入对照」改为按上下文显示「选择一篇文章放入对照」/「为本章新建笔记，或选择已有内容放入对照」。

**边界**：未选章节时打开 picker（`BookPanel` 已 toast「请先选择一个章节」）——改为 picker 顶部提示「先选择章节，才能为本章新建笔记」并隐藏「＋ 新建」，不再 toast 抢焦点。

**测试**：`tests/companion-picker.test.ts` 增加「book 目标已有笔记 → 不显示新建」「book 目标无笔记 → 点击后创建并选中」；`tests/notes-book.test.ts` 增加去重键回归（两章同名不互相命中）。

### 2.5 长文本截断无查看路径（P1）

**现状**：三处截断，全无完整内容出口：

| 位置 | 截断方式 |
|---|---|
| 书卡书名 `BookListColumn.tsx:48` | `truncate`（单行省略） |
| 书卡全书导读 `BookListColumn.tsx:58` | `line-clamp-2` |
| 章节列表项 `ChapterListColumn.tsx:28` | `truncate`（`title` 属性已有，但原生 tooltip 延迟 1s+、不可选中、样式不可控） |

**方案：自建轻量 Tooltip（hover 全展示）**，不引第三方库：

- 新组件 `src/components/Tooltip.tsx`：包裹任意 `children`，`hover` 350ms / `focus` 立即触发；内容用 `createPortal` 渲染到 `document.body`，`position: fixed` 跟随触发元素（`getBoundingClientRect`），避免被 `overflow-hidden` 的列容器裁剪。
- **只在真正被截断时出现**：触发元素 `scrollWidth > clientWidth`（单行）或 `scrollHeight > clientHeight`（多行）时才算「被截断」，否则不弹——避免短标题也弹一个同样的气泡。
- 样式：`bg-ink/95 border border-parchment/20 rounded px-2 py-1 text-[11px] leading-relaxed max-w-xs`，换行展示全文（`whitespace-pre-wrap`）；newspaper 主题走浅底反色。
- 无障碍：`role="tooltip"` + `aria-describedby`；键盘 `focus` 也可触发；`Esc` 关闭。
- 应用点：书卡书名、书卡全书导读、章节列表项（**替换掉原生 `title`**，避免双 tooltip）。
- 导读侧栏的 `§N heading`（`GuideSidebar.tsx:95`）标题也包一层（长章节标题同样会被 JS 折行，但「全文可见」的诉求是一致的；此处理后它不再是截断态而是换行态，**不弹**，因此仅在 `line-clamp` 场景包 Tooltip——现有代码没有截断，故此处只记录判断，不实现）。

**明确不做**：不做「点击展开/收起」（列表项点击是选中语义，冲突）、不做 tooltip 富文本/链接。

## 3. 影响文件

| 文件 | 改动 |
|---|---|
| `src/components/BriefingListColumn.tsx` | 折叠不渲染 children |
| `src/components/article-assistant/GuideCompass.tsx` | 新增 SVG 阶段可视化 |
| `src/components/article-assistant/GuideSidebar.tsx` | 接入 GuideCompass，保留 `guide-progress` 文本 |
| `src/components/article-assistant/CompanionWritingPicker.tsx` | `currentTarget` / `onCreateNote` 泛化 |
| `src/components/books/BookPanel.tsx` | picker 传章节目标；折叠开关保持 |
| `src/components/books/BookListColumn.tsx` | Tooltip + 旧解析提示 + 重新解析按钮 |
| `src/components/books/ChapterListColumn.tsx` | Tooltip 替换 title |
| `src/components/Tooltip.tsx` | 新增 |
| `src/store/index.ts` | `findOrCreateArticleNote` 泛化；`booksReparsing`；`reparseBook` |
| `src/types/index.ts` | `GuideProgress.searching.queries/hits`；`BookEntry.parserVersion` |
| `electron/lib/book-parse.ts` | `itemsToLines` / `linesToParagraphs` / `paragraphsToMarkdown` |
| `electron/lib/books.ts` | 抽取改用新管线；`parserVersion` 写入；`reparseBook` 编排 |
| `electron/ipc/books.ts` | `books:reparse` |
| `electron/lib/guide-v2-pipeline.ts` | searching 事件带 queries/hits |
| `electron/preload.ts` | `booksReparse` 透传 |
| `tests/…`、`e2e/specs/books.spec.ts`、`e2e/source-map.json` | 定向回归与映射维护 |

## 4. 验收清单

- [ ] 折叠书籍列 / 章节列后，栏内没有任何列表内容（只有 `▶`），展开后完整恢复。
- [ ] 导读生成过程中：三个阶段各有可辨识的 SVG 状态；`guide-progress` 文本仍存在且文案不变；`prefers-reduced-motion` 下无位移动画。
- [ ] JTBD 章节重新解析后：无 `21-year-\nold`、无孤立页码行、段落数显著下降且每段是完整句子；同一本书重解析后导读缓存被清除并自动重新生成。
- [ ] 书籍对照 tab：选中章节后打开 picker，笔记段有「＋ 新建」；创建后笔记出现在对照槽；同一章二次打开不重复创建。
- [ ] 三处截断内容：hover 350ms 后出现完整文本气泡；未截断时不出现；newspaper 主题配色正确。
- [ ] `npx vitest run`（定向）与 `node scripts/docs-status.cjs` 通过；书籍 E2E 定向通过。

## 5. 已知取舍

- **不在本次做**：导入进度条（当前只有「导入中…」文案）、章节内目录/书签跳转、双栏 PDF 的重排、SVG 动画的资源开销测量（纯 CSS，预计 <1% CPU）。
- **重解析会丢导读**：正文变化后旧导读必然失配，宁可清缓存重生成，不做「保留旧导读」的伪兼容。
- **Tooltip 用 portal 而非纯 CSS**：列容器 `overflow-hidden` 会裁掉气泡，纯 CSS 方案在书籍列不可用。

## 6. 实现记录（2026-10-27 落地，与上文的差异）

实现中修正了本文两处设计缺陷，并新增一处必要的兼容口：

### 6.1 双栏判定（修 §2.3 的规则错误）

原文写「`gap < -0.5 * fontHeight` 视为换栏」——按 x 升序排列后 gap 恒为正，这条规则**永远不触发**。实现改为：

- 先取每行首个 item 的 x 作为候选栏起点，按 2 字高容差聚成「栏」；
- 行内 `gap > 2 * row.h` **且**该 item 落在另一栏起点上，才拆行；否则只补一个空格。

代价：单栏排版里的超大间距（表格列对齐）只会补空格，不会误拆成两行——这是更安全的失败方向。

### 6.2 目录页必须用原始行解析（修 §2.3 的管线缺口）

段落化会丢弃页码孤行、把目录标题连成一行，`parseTocPage` 对「标题块 + 页码块」布局会直接返回 null → **所有带目录的书都会退化成整书单章**。

实现：`extractPagesTextWithStructure` 同时返回 `{ pages, rawPages }`（段落化正文 / 原始视觉行）。`writeChaptersFromPages` 新增可选 `rawPages`，**目录解析与页码偏移校准用 rawPages，章节正文用 pages**；`__test__importFromPages` 同步加可选第 5 参数，既有测试契约不变（缺省回退到 pages）。

### 6.3 折叠列需要逃生口（补 §2.1）

`BriefingListColumn` 新增 `renderWhenCollapsed?: boolean`（默认 false）。博客列折叠态本来就要显示缩略图 rail，是**有意设计**，不是本次要修的内容泄露；`AnthropicBlogPanel` 显式传 `renderWhenCollapsed`。书籍、写作、博客正文列表保持默认（折叠即卸载）。

### 6.4 验证结果

- 单元测试：书籍链路 47 项（import / reparse / parse / text-lines）+ 新增 42 项（折叠 / 罗盘 / tooltip / picker / 书籍笔记去重）全绿。
- 全量：193/194 文件通过。唯一失败 `tests/blog-guide-v2-real.test.ts` 为既有问题（回放 fixture 里模型输出含未转义引号，与本次改动无关）。
- `tsc --noEmit` 双 tsconfig 通过；`node scripts/docs-status.cjs` 通过。


## 7. 解析器 v3（2026-10-28 追加）

现场反馈「重解析后只剩一章」+「正文仍没有原 PDF 的分段和标题层级」，定位到两个独立问题：

### 7.1 目录页「页码 标题」布局未被识别（重解析退化单章的直接原因）

JTBD 的目录页抽取结果是 `3 Foreword` / `4 Introduction`（页码列在左），而 `parseTocPage` 只认「标题 页码」与「标题块 + 页码块」两种布局 → 返回 null → `hasToc: false` → 整书单章，且旧章节被删除。

修复：新增模式 A2 `^(\d{1,4})\s+(.+)$`，与既有两种布局并存。

### 7.2 段落与标题只用标点判定（排版信号被丢弃）

v2 的 `itemsToLines` 只返回文本，`linesToParagraphs` 只能靠行尾标点猜段落；页首章名被并进正文第一段。

修复（`electron/lib/book-parse.ts`）：

- `itemsToRows` 在 v2 行聚合基础上保留 `y / h / x0 / x1`；`itemsToLines` 保持原签名，向后兼容。
- `rowsToBlocks` 新增三类版面信号：
  - 行距：`gap > max(1.4 × 页内常规行距, 1.5 × 行高)` → 新段；
  - 字号：`≥ 1.45 × 正文字号` → `##`，`≥ 1.2 ×` → `###`（正文页首章名因此成为标题）；
  - 首行缩进 / 短行回到左边距 → 新段。
  - 无有效行距时退回标点判段，避免整页并成一段。
- 页顶/页底 6% 区域内的短行按页眉页脚丢弃；纯数字孤行仍按页码丢弃。
- 多行长标题（同一字号连续视觉行、正常行距）续成一个标题，不拆成多个 `###`。
- `blocksToMarkdown` 负责输出标题层级；`rowsToBlocks` 的已知边界：表格单元格仍会拍平，双栏页左右栏按 y 交替、段落顺序可能不等于阅读顺序。

### 7.3 重解析不再无条件删除导读

旧逻辑在 reparse 时删除全部 `*.guide.md` 与 `book.json.bookGuide`。现在：

- 章节导读按「章节文件同名 → 标题同名」保守对齐后搬到新章节；对不上的才丢弃；
- 全书导读在目录标题序列不变时保留。

v2 那次重解析已经删掉的导读无法恢复，需重新生成。

### 7.4 章节正文去重标题

章节 md 开头若已是 `## 章名`（与 frontmatter.title 相同），写入时剥离——阅读器用 frontmatter.title 渲染 h1，否则会显示两遍。

### 7.5 验证

- 书籍链路单测 96 项通过（10 个 `tests/book*.test.ts`），新增覆盖：页码在左的目录、行距判段、字号分级、缩进判段、页眉页脚过滤、多行长标题合并、标题去重、导读保留。
- 真实样本《Intercom on Jobs-to-be-Done》：12 章全部恢复；第 2 章正文 8 处空行分段；第 3/10 章识别出 `###` 小节。
- `tsc --noEmit` 双 tsconfig 通过。

## 8. 导读加载态改版（2026-10-28 追加）

用户走查后提出的三点，都在 `GuideSidebar` 的加载分支内解决：

### 8.1 版面：空白让给动画

加载时侧栏没有任何正文，原实现只有一条 84px 的紧凑罗盘 + 左对齐状态行，上半栏空着。改为**罗盘占满剩余空间 + 居中状态行**：

1. 罗盘（`flex-1` 居中，方形构图按栏宽放大）；
2. 居中的状态行，底部一行小字 `READING · REMEMBERING`。

**画作与语录不在这里**。第一版曾把「画作 → 语录 → 罗盘」整组放进侧栏，把两件事做错了（2026-10-28 用户走查纠正）：

- **位置错了**：画作 + 语录是「阅读区」的语言（`AnthropicArticleReader` / `NoteBoard` / `WritingBoard` 都在正文顶部），侧栏是工具区；
- **开关错了**：当时为了让等待态有画，给 `PaintingPlate` 加了 `ignoreToggle` 绕过左下角「并置画框」开关，等于让一个开关对某处失效。

正确做法：**书籍章节正文补上画作 + 语录**（`BookReader`，与此前的文章 / 笔记一致），画作统一受 `paintingPlateEnabled` 控制；`ignoreToggle` 与 `Quote.compact` 一并删除，不留死代码。

### 8.1.1 书籍章节正文的阅读轴

`BookReader` 原来没有统一的阅读宽度：画作撑满面板、正文却挤在左半边。改为整块 `maxWidth: 760` 居中（画作、标题、页码、语录、工具行、正文、旁注共用一条轴），画作宽度即 `760 - 2×24` 的展板宽，与文章阅读器视觉权重一致。

### 8.2 罗盘改为方形构图

原 viewBox `220×120` 在 287px 宽的栏里只能放大到 149px 高，画面偏小且偏右。改为**方形 `200×200`**：文档 78×104 居中偏左，8 个检索节点沿弧从文档右下角展开到右上，资料夹落在弧线末端。宽度即尺寸——287px 宽时画面约 287px 高，是原来的 1.9 倍。检索阶段也补画了文档轮廓（线索是从这一章里长出来的，不是悬浮的点）。

`GuideCompass` 的 `height` 增加 `'auto'`：按 viewBox 比例自适应，不留上下黑边（默认仍是 84px 紧凑条，文章内其它调用点不受影响）。

### 8.3 进度文案改为「夜读」语气

`guideProgressParts` 的 label 从工程词换成三段动作，detail 保留数字可核对：

| 阶段 | 旧 | 新 |
|---|---|---|
| planning | 规划检索中… | **展卷定章…** |
| searching | 检索背景资料中… 1/2 | **循迹访书…** 1 / 2 处 |
| writing | 撰写导读中… §2/§14 · 已写 860 字 | **落笔成文…** 第 3 节，共 14 节 · 已落 860 字 |

`§n/§m` 对读者没有意义，改为「第 n 节，共 m 节」；字数从「已写」改为「已落」，与「落笔」呼应。字数未起、条目总数为 0 时 detail 自动省略，不显示 `第 1 节，共 0 节` 这类占位。

### 8.4 验证

- `tests/GuideSidebar.test.tsx` / `guide-progress.test.ts` / `guide-compass.test.tsx` 共 29 项通过（含新增的零进度 detail 断言与方形 viewBox 断言）。
- E2E `article-assistant-guide` + `blog-guide-terminal` 10/10 通过（文案断言同步更新）。
- 全量单测 197 文件 / 1564 项通过；`tsc --noEmit` 双 tsconfig 通过。
- 截图核对：287px 栏内画作 ~172px 高、语录两行不溢出、罗盘 ~287px 见方居中。

## 9. 走查修正二：空笔记按钮与罗盘构图（2026-10-28 追加）

### 9.1 删除章节级「存为笔记」

`BookReader` 工具行原有「标注 (n)」与「存为笔记」两个入口。后者调用
`notes:create({ title: "<书名> · <章节标题>", body: '' })`——**只建一条空笔记**：
不落正文、不带走旁注、建完也不跳转，只有一句 toast。用户走查时的第一反应是
「这个按钮是干嘛的」；更糟的是面试稿 §1.2 恰好推荐点它，等于用一个叫「存为笔记」
的按钮做了最没有沉淀价值的动作。

删除而不是改写。可选替代「把整章正文写进笔记」只是把复制粘贴包装成功能，
既不是用户的笔记、也会让笔记书架里出现大量书稿副本。删掉后剩下两个入口，
产生的内容不同、职责不重叠：

| 入口 | 产生什么 | 什么时候用 |
|---|---|---|
| 旁注列表里的「存」（`annotation-note-create`） | 笔记正文 = 原文摘录 + 自己的备注 | 读到某一句想把它带走 |
| 对照挑选器的「＋ 新建」（`picker-note-create`） | 按 `source=book + book + title` 建/复用笔记，并直接放进对照槽 | 边读边写、对照自己的旧文 |

实现：`createChapterNote` 只保留旁注分支（标题带 `· 标注`），重入保护由 state
改为 ref（不再需要「创建中…」按钮态）；工具行容器加 `empty:mb-0`，无旁注时
整行不占垂直空间。E2E 的「笔记落到书架」断言从正文按钮挪到对照新建路径
（`books.spec.ts` 第 3 个用例），最后一跳仍有覆盖。

### 9.2 罗盘按阶段居中

200×200 视口里，三个阶段的构图重心都不在 (100,100)：

| 阶段 | 内容 | 包围盒中心 |
|---|---|---|
| planning | 文档 + 旋转虚线环 | (69, 100) |
| searching | 文档 + 节点外圈 + 资料夹 | (115, 115.5) |
| writing | 只有文档 | (69, 100) |

侧栏是 287px 的窄栏，撰写阶段又最长，于是等待时画面明显贴在左侧（走查：
「应该在正中、居中，目前偏左侧」）。修复：`STAGE_SHIFT` 按阶段给整组内容一个
`translate`，把包围盒中心拉回视口中心（planning / writing `+31`，searching
`-15 -15.5`）。三段是各自独立的画面，平移不共享元素，因此不存在「文档在两段之间跳动」
的问题；视口与 `preserveAspectRatio` 不变，默认 84px 紧凑条的其它调用点也不受影响。

### 9.3 验证

- `tests/guide-compass.test.tsx` 新增每阶段 `transform` 断言，11 项通过。
- `tsc --noEmit` 双 tsconfig 通过。
- E2E `books.spec.ts` 3/3 通过；截图核对 planning / searching / writing 三阶段的
  文档矩形都落在侧栏水平中线上，且章节题下不再有「存为笔记」。

