---
description: 夜航简报与 Anthropic 博客阅读器 UI 升级设计：统一三栏架构、来源/日期侧栏、学术思维碎片/报纸分栏双主题、博客极简结构优化。
paths:
  - src/pages/Briefing.tsx
  - src/components/BriefingHeader.tsx
  - src/components/BriefingSourceSidebar.tsx
  - src/components/briefing/*
  - src/components/anthropic/*
  - e2e/specs/briefing-ux-optimization.spec.ts
  - e2e/specs/anthropic-blog.spec.ts
  - tests/briefing-sidebar.test.tsx
  - docs/superpowers/specs/2026-07-11-briefing-blog-reader-ui-redesign-design.md
---

# 夜航简报 & Anthropic 博客阅读器 UI 升级设计

> 日期：2026-07-11
> 状态：已批准，待实现计划
> 前置/相关 spec：
> - `2026-07-10-briefing-blog-reader-ui-fixes-design.md`（侧边栏主题化、查收日报入口、博客主题化）
> - `2026-07-11-anthropic-blog-ui-redesign-design.md`（博客列表可收起、新文章提示）

## 1. 问题概述

当前 Briefing 页面存在三套不统一的交互/视觉语言：

1. **AI 日报用 Header 按钮切换往期**，博客用中间列；同一块屏幕里同时存在「右上角按钮抽屉」和「左侧可收起列表」两种历史/目录入口。
2. **博客列表收起后只剩一条 2px 竖边**，既不可点击又无明确 affordance，与左侧来源栏 `w-14` 的可点击 rail 不一致。
3. **博客阅读器顶部冗余「返回列表」行**，仅一行文字按钮，占用垂直空间且与左侧来源栏/中间列表重复。
4. **AI 日报仍保留「重新生成」按钮**，但当前网络失败已有自动重试，手动重生成需求极低，反而在 Header 制造噪音。
5. **AI 日报内容呈现仍是连续 markdown**，用户明确希望「看到一块一块的消息排列」，且原始来源链接需要更可视化的呈现。
6. **博客长文阅读器只有基础主题色**，缺乏结构化的视觉层次（来源胶囊、章节分隔、图片说明、风险/引用强调块）。

## 2. 设计目标

- 统一「来源栏 + 列表/日期栏 + 阅读区」三栏架构，AI 日报与博客共用同一套折叠/展开逻辑。
- 学术主题呈现为「思维碎片式」；报纸主题呈现为「报纸分栏式」。
- 博客阅读器采用「极简结构优化」方案：纯排版升级，不引入任何大模型生成功能，不与文章助手/导读面板重叠。
- 移除冗余控件（返回列表、重新生成、Header 往期按钮）。
- 同步更新 E2E 与组件测试。

## 3. 非目标

- 不新增 LLM 调用、边注、 skill shards、自动摘要、概念关联图等会与大模型生成功能重叠的能力。
- 不替换现有的文章助手（ArticleAssistantPanel）和导读面板。
- 不引入第三种主题。
- 不修改数据来源、导入逻辑、LLM prompt、生成 pipeline。
- 不改动 `MarkdownRenderer` 的核心 markdown 解析，只通过 CSS/布局调整视觉呈现。

## 4. 关键决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| AI 日报往期入口 | 与博客共用中间日期列 | 统一三栏架构，Header 仅保留字号/主题/返回 |
| 博客列表折叠 | 改为 `w-14` icon rail + 反向箭头 toggle | 与来源栏行为一致，保留可点击缩略图/日期快速导航 |
| 博客阅读器返回 | 删除顶部「返回列表」行 | 左侧列表始终可见或可一键展开，无需冗余关闭按钮 |
| AI 日报重新生成 | 删除 Header 按钮 | 自动重试已覆盖；需要时可通过刷新页面/切换日期重走生成 |
| 学术主题排版 | 思维碎片式（shards） | 每块内容独立成卡片，符合日报「短块」特征；来源以标签形式可视化 |
| 报纸主题排版 | 报纸分栏式（columns） | 利用宽屏横向空间，呈现报纸头版/多栏版面；来源以脚注/标签呈现 |
| 博客优化方案 | B：极简结构优化 | 仅调整字体、间距、来源胶囊、章节分隔、图片说明、风险强调块；无生成内容 |
| 正文宽度 | 占可用正文区域的 90%，max 1250px | 相对于「来源栏 + 列表栏 + 正文区 + 导读栏（320px）」之间的正文区域计算，不是全屏宽度 |

## 5. 布局总览

```
┌─────────┬─────────────┬──────────────────────────────┬─────────────┐
│ 来源栏  │ 列表/日期栏 │        阅读/内容区           │   导读栏    │
│ (可折叠)│  (可折叠)   │                              │  (固定 320) │
│         │             │   · AI 日报：碎片/分栏布局   │             │
│ 日  A   │  ▶ 缩略图   │   · 博客：极简排版阅读器     │             │
│         │  ▶ 日期     │   宽度 = 正文区 90%,        │             │
│         │             │   max 1250px                 │             │
└─────────┴─────────────┴──────────────────────────────┴─────────────┘
```

- 来源栏：`BriefingSourceSidebar`，折叠为 `w-14` icon rail，按钮反向（展开时 `◀`，折叠时 `▶`）。
- 列表/日期栏：共享折叠容器 `BriefingListColumn`（负责 toggle、宽度、主题色），内部根据 source 渲染博客列表或 `BriefingDateColumn`；折叠后同样为 `w-14` rail。
- 阅读/内容区：根据 source 和 theme 渲染对应布局。

## 6. 详细改动

### 6.1 统一折叠侧栏组件

**新增文件**：`src/components/BriefingListColumn.tsx`（折叠容器）、`src/components/BriefingDateColumn.tsx`（日期内容）

- `BriefingListColumn` 复用 `BriefingSourceSidebar` 的折叠行为：
  - `collapsed: boolean` / `onToggle: () => void` / `width: 64 | 80`（博客列表用 `80`，日期列用 `64`）。
  - 折叠宽度统一 `w-14`，展开宽度由 `width` prop 决定。
  - toggle 按钮箭头方向与来源栏一致：展开时 `◀`，折叠时 `▶`。
  - 负责 header、边框、背景、主题色；内容通过 `children` 注入。
- `BriefingDateColumn` 渲染在 `BriefingListColumn` 内部：
  - 展开时显示历史日期列表（来自 `briefingHistory.list`），当前日期高亮。
  - 折叠后 rail 显示一个日历图标 + 最近日期小标签。
  - 点击日期调用 `generateBriefing(date)`；点击「查收日报」行为等价于点击今日。
- 主题化：与 `BriefingSourceSidebar` 共享 tailwind token，学术/报纸配色一致。
- 折叠后的 rail：
  - **博客 rail**：由 `AnthropicBlogPanel` 内部渲染缩略图列表，不通过 `BriefingListColumn` children；`BriefingListColumn` 只提供可折叠容器。
  - **AI 日报 rail**：`BriefingDateColumn` 负责渲染折叠后的日期标签。

### 6.2 博客列表折叠改造

**文件**：`src/components/anthropic/AnthropicBlogPanel.tsx`

- 将现有 `listVisible` + 2px expand handle 替换为 `BriefingListColumn width={80}` 容器。
- 折叠后 rail 显示缩略图列表；缩略图来自 `article.thumbnailUrl` 或首图；无图显示几何占位。
- 保留标题栏、搜索框、新文章提示条在展开面板内。
- 保留 `newArticleCount` 徽标逻辑，但徽标位置移到折叠 rail 的顶部或对应缩略图上。

### 6.3 博客阅读器删除返回列表

**文件**：`src/components/anthropic/AnthropicArticleReader.tsx`

- 删除 `onClose` prop 及顶部 `← 返回列表` 按钮。
- 阅读器始终占满右侧区域；用户通过左侧列表/来源栏切换文章或返回 AI 日报。
- 标题、元信息、正文配色继续跟随 `briefingTheme`。

### 6.4 AI 日报 Header 精简

**文件**：`src/components/BriefingHeader.tsx`

- 删除 `onRegenerate` / `regenerating` / `showRegenerate` props 及「重新生成」按钮。
- 删除 `onHistory` /「往期」按钮；历史入口改到中间日期列。
- Header 仅保留：返回封面、标题/日期、字号 -/+、主题切换。
- 字号按钮在所有状态（空态、loading、error、success）下可见且可用。

### 6.5 AI 日报新增日期列

**文件**：`src/pages/Briefing.tsx`、新增 `src/components/BriefingDateColumn.tsx`

- `BriefingDateColumn` 作为 `BriefingListColumn width={64}` 的内容子组件：
  - 展开时显示历史日期列表（来自 `briefingHistory.list`），当前日期高亮。
  - 折叠后 rail 显示一个日历图标 + 最近日期的小标签。
  - 点击日期调用 `generateBriefing(date)`；点击「查收日报」行为等价于点击今日。
- 在 `Briefing.tsx` 中：
  - 当 `source === 'digest'` 时，中间列渲染 `<BriefingListColumn width={64}><BriefingDateColumn ... /></BriefingListColumn>`。
  - 当 `source === 'anthropic'` 时，中间列渲染 `<BriefingListColumn width={80}><博客列表 /></BriefingListColumn>`。
  - 两列折叠状态各自独立（`dateColumnCollapsed`、`blogListCollapsed`），避免切换 source 时状态混乱。

### 6.6 AI 日报内容视觉升级

**文件**：`src/components/briefing/AcademicBriefingLayout.tsx`、`NewspaperBriefingLayout.tsx`

#### 学术主题 → 思维碎片式

- 每个 `section` 渲染为独立「碎片」卡片：
  - 背景 `#e8d5b7`（羊皮纸色），文字 `#2a1f1a`。
  - 边框/圆角不规则：2px 圆角 + 轻微旋转 `rotate(-0.3deg)` 或 `rotate(0.3deg)`，相邻卡片方向交替。
  - 顶部带小标签：章节序号 + 章节标题（如 `01 · X / Twitter`）。
  - 来源链接可视化：正文中的 markdown 链接和裸 URL 解析为「证据标签」pill（` BriefingSourceItem ` 已支持解析，需要新增 pill 样式变体）。
- 全局标题保持居中，`displayDate` 放在标题下方小字。
- 原始来源区改为可横向滚动的标签带或折叠卡片，不再展开为大段列表。

#### 报纸主题 → 报纸分栏式

- 头版区域：
  - 报头 `夜航简报` + 日期分割线（双下划线）。
  - 主标题使用更大字号、居中。
- 每个 `section` 渲染为报纸栏目：
  - 小标题全部大写、带 `tracking-wider`。
  - 正文使用 CSS `columns-2`（宽屏）或 `columns-1`（窄屏），真正呈现报纸分栏。
  - section 之间用 `* * *` 或细线分隔。
- 来源链接以脚注形式出现在每个 section 底部，或集中为「References」栏。

### 6.7 博客阅读器极简结构优化

**文件**：`src/components/anthropic/AnthropicArticleReader.tsx`

- 标题区：增大标题字重与行高，日期/作者/来源排成一行或紧凑 meta 行。
- 引言/摘要块：
  - 学术主题：左侧 3px ember 边框 + 半透明背景。
  - 报纸主题：左侧 4px wine 边框 + 白色背景 + 细阴影。
- 章节标题：
  - 增加上下 margin 与下划线分隔。
  - 报纸主题使用更紧凑的字号层级。
- 来源链接：
  - 正文中的外链解析为「来源胶囊」按钮（pill + ↗ 图标）。
  - 胶囊颜色跟随主题。
- 图片：
  - 增加图片容器边框、圆角、阴影（报纸）。
  - 增加图片说明占位样式（基于 `![alt](url)` 的 alt 文本）。
- 风险/引用强调块：
  - 对 markdown blockquote（`> ...`）应用强调样式：左侧彩色边框 + 背景色。
  - 学术主题：wine 色左边框 + 半透明暗红背景。
  - 报纸主题：wine 色左边框 + 白色背景 + 细阴影。
- 行首缩进：报纸主题下正文段落首行缩进 2em，首段不缩进。

### 6.8 正文区宽度规则

**适用文件**：`AcademicBriefingLayout.tsx`、`NewspaperBriefingLayout.tsx`、`AnthropicArticleReader.tsx`

- 正文容器宽度 = 可用正文区域宽度的 **90%**，最大 **1250px**，最小 **520px**。
- 「可用正文区域」指：窗口宽度 − 来源栏（56px 或 14 折叠）− 列表/日期栏（展开宽度或 14 折叠）− 导读栏（320px）。
- 在 Tailwind 中表达为：`w-[90%] max-w-[1250px] min-w-[520px]`，或等价的 flex 子项 + percentage 宽度。
- 当窗口过窄导致 90% 小于 520px 时，以 520px 为准，允许水平滚动。
- 该规则同时适用于 AI 日报（学术/报纸主题）和博客阅读器，保证两者在全屏下文字占比更高。
- 不覆盖左侧来源栏、中间列表栏、右侧导读栏的固定/折叠宽度。

## 7. 组件变更清单

| 组件/文件 | 变更 |
|-----------|------|
| `src/components/BriefingListColumn.tsx` | 新增：统一的可折叠中间列 shell，支持博客缩略图 rail 和 AI 日报日期 rail |
| `src/components/BriefingDateColumn.tsx` | 新增：AI 日报日期列表，展开/折叠、当前日期高亮、点击切换日期 |
| `src/components/BriefingSourceSidebar.tsx` | 无需改动；作为折叠行为参考 |
| `src/components/BriefingHeader.tsx` | 删除「重新生成」和「往期」按钮；仅保留返回、标题 meta、字号、主题切换 |
| `src/pages/Briefing.tsx` | 接入 `BriefingListColumn`/`BriefingDateColumn`；删除 Header 的 regenerate/history 回调；学术/报纸主题下始终渲染 `SurfaceBackground` 与换画按钮 |
| `src/components/briefing/AcademicBriefingLayout.tsx` | 改为「思维碎片式」卡片布局；来源链接 pill 化 |
| `src/components/briefing/NewspaperBriefingLayout.tsx` | 改为「报纸分栏式」；头版报头、分栏正文、脚注来源 |
| `src/components/anthropic/AnthropicBlogPanel.tsx` | 列表收起改为 `BriefingListColumn` 风格；rail 显示缩略图；新文章徽标位置调整 |
| `src/components/anthropic/AnthropicArticleReader.tsx` | 删除「返回列表」按钮；标题/meta/正文/来源胶囊/图片说明/强调块视觉优化 |
| `src/components/anthropic/AnthropicArticleRow.tsx` | 保留；折叠 rail 的 mini 版可复用其渲染逻辑 |
| `src/components/briefing/BriefingSourceItem.tsx` | 新增 `variant="pill"` 样式，用于碎片/分栏中的来源标签 |

## 8. 状态与数据流

- `briefingTheme`、`briefingFontSize`、`briefingSource` 继续由 store 提供。
- 新增本地状态：
  - `blogListCollapsed`：博客列表列折叠状态（不持久化）。
  - `dateColumnCollapsed`：AI 日报日期列折叠状态（不持久化）。
- 日期列数据来源：`briefingHistory.list` + `formatBriefingDate(new Date())`。
- 点击日期调用 `generateBriefing(date)`；今日日期等价于「查收日报」。

## 9. 边界与错误处理

- 历史列表为空时，日期列仍显示「今日」条目，保证用户可触发生成。
- 博客列表折叠且无文章选中时，阅读器占位提示保留。
- 主题值异常时回退到 `academic`。
- 图片加载失败时显示占位，不破坏布局。
- 来源链接解析失败时回退为纯文本。

## 10. 测试计划

### 10.1 组件测试

| 测试项 | 文件 |
|--------|------|
| `BriefingHeader` 不再渲染「重新生成」「往期」按钮 | `tests/briefing-header.test.tsx` |
| `BriefingDateColumn` 渲染日期列表、高亮当前、点击触发回调 | `tests/briefing-date-column.test.tsx` |
| `AnthropicArticleReader` 不渲染「返回列表」按钮 | `tests/anthropic-reader-images.test.tsx`（扩展）或新建 |
| `AnthropicBlogPanel` 折叠后显示缩略图 rail、点击展开 | `tests/anthropic-blog-panel.test.tsx` |
| 学术布局渲染碎片卡片、pill 来源 | `tests/briefing-layout.test.tsx` |
| 报纸布局渲染分栏、报头 | `tests/briefing-layout.test.tsx` |

### 10.2 E2E 测试更新

| 测试项 | 文件 |
|--------|------|
| Header 按钮精简后仅保留字号/主题/返回 | `e2e/specs/briefing-ux-optimization.spec.ts` |
| 删除 `historyButton` 断言，改为 `dateColumn` 点击打开日期 | `e2e/specs/briefing-ux-optimization.spec.ts` |
| 博客列表折叠/展开通过新 toggle 验证 | `e2e/specs/anthropic-blog.spec.ts` |
| 博客阅读器不存在「返回列表」按钮 | `e2e/specs/anthropic-blog.spec.ts` |

### 10.3 选择器更新

- `SELECTORS.briefing.historyButton`：可选保留用于 drawer 内部，但 Header 不再使用。
- 新增 `SELECTORS.briefing.dateColumn` / `SELECTORS.briefing.dateColumnToggle`。
- 新增 `SELECTORS.briefing.blogListToggle` / `SELECTORS.briefing.blogListRail`。
- 删除或注释 `SELECTORS.briefing.regenerateButton`。

## 11. 验收标准

- [ ] `BriefingHeader` 仅包含返回、标题/日期、字号 -/+、主题切换。
- [ ] AI 日报中间列显示日期列表，折叠为 icon rail，点击日期可切换简报。
- [ ] 博客中间列折叠为 `w-14` 缩略图 rail，toggle 按钮箭头方向与来源栏一致。
- [ ] 博客阅读器顶部无「返回列表」行。
- [ ] 学术主题下 AI 日报呈现为独立碎片卡片，来源链接为 pill 标签。
- [ ] 报纸主题下 AI 日报呈现为头版 + 分栏布局，来源链接为脚注/标签。
- [ ] 博客阅读器标题、meta、章节、来源胶囊、图片说明、强调块视觉层次清晰。
- [ ] AI 日报与博客阅读器的正文宽度 = 可用正文区域 90%，max 1250px，min 520px。
- [ ] 空态 / loading / error / success 下 Header 字号与主题切换均可见。
- [ ] 所有相关单元/组件/E2E 测试通过。

## 12. 规则沉淀

本次升级强化两条现有规则：

- **全局 Chrome 必须与内容状态解耦**（`.claude/rules/ui-styling.md` §8）：Header 按钮精简后更稳定，日期列作为页面级元素始终挂载。
- **新增页面模式/子源时必须同步检查页面级元素**（`.claude/rules/ui-styling.md` §9）：新增 `BriefingDateColumn` 后，需确认 `SurfaceBackground`、换画按钮、字号控制对 AI 日报和 Anthropic 源均生效。

## 13. 参考

- 视觉原型：
  - `C:\Users\86468\Desktop\project\study-parlor\.superpowers\brainstorm\1962-1783777323\content\briefing-visual-prototype.html`（AI 日报三方案对比）
  - `C:\Users\86468\Desktop\project\study-parlor\.superpowers\brainstorm\1962-1783777323\content\blog-ui-visual-only.html`（博客 A/B 方案，已选 B）
  - `C:\Users\86468\Desktop\project\study-parlor\.superpowers\brainstorm\1962-1783777323\content\briefing-and-blog-direction.html`（方向确认）
  - `C:\Users\86468\Desktop\project\study-parlor\.superpowers\brainstorm\1962-1783777323\content\width-comparison.html`（正文宽度对比，已选 B：90% / max 1250px）
- 项目规则：`.claude/rules/ui-styling.md` §2 / §4 / §6 / §8 / §9
