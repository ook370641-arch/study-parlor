# UI 打磨批次设计：性能、布局、列表列、字体、写作助手等 9 组

日期：2026-07-24
状态：已批准（经视觉原型迭代与逐项澄清）
原型资产：`.superpowers/brainstorm/914-1784827483/content/`（layout-real-v3.html、collapsed-columns.html、digest-final.html）

## 背景

用户集中反馈了一批 UI/交互问题（最初 9 项 + 两轮补充共 5 项），经合并为 9 个需求组（A–I）。所有方案已通过浏览器高保真原型（真实画作 + 真实 UI 字段）逐项确认。

**跨组铁律（每一项都适用）：**
- 每项需求带「改动清单 / 保护清单」两栏；**清单之外的元素默认不动**。
- 所有现有 `data-testid` 必须保留（e2e 依赖）；控件迁移位置时 testid 随迁。
- Surgical changes：不"顺手"重构相邻代码。

## 决策总表（已锁定）

| 项 | 决策 |
|---|---|
| 整体布局 | B+ 竖轨方案：移除顶栏，控件入左侧竖轨底部；容器玻璃材质 |
| 摘要/旁注 | 位置、样式、交互**一律不动**（仅容器边框材质让画作透入） |
| 删除 | 统一收进右键菜单；博客加右键删除并级联；确认弹窗统一 ConfirmDialog |
| 博客收起列 | ③ 密排填满（取消 10 个上限）+ 已保存图标橙色边框 |
| 写作收起列 | ③ 极简计数（▶ + 竖排「文章 n / 仓库 m」） |
| 日报来源样式 | A 铭牌方案；§ 换为 **❧**（fleuron）+ 编号，如 `❧1` |
| 转入写作 | 结构化分区（标注摘录 / 旁注对话），不带全文 |
| 写作快照 | 每次向 AI 提问时快照嵌入聊天记录（不落独立文件） |
| 字体 | 两套 key：简报 key（三界面）+ 写作 UI key（写作页）；语录 3+1 分配 |

---

## A. 性能卡顿

### A1 博客页展开列卡顿 + 文章滚动卡顿

**改动清单**
- `src/components/article-assistant/ArticleAnnotations.tsx`：`applyMarkers` 目前每次渲染后经 `setTimeout(100)` 对全文做 TreeWalker（L66-157, L159-166）。改为仅在标注集合或文章内容变化时执行（加依赖/版本号），并避免重复扫描已标记节点。
- `src/components/anthropic/AnthropicArticleRow.tsx`：行内 `hovered` React state（L26, L103-104）改为纯 CSS `:hover`；行组件 `React.memo` 化。
- `AnthropicBlogPanel.tsx` 展开列表（L257-261）：配合 memo 减少整列重渲染（暂不引入虚拟化，行数量级不需要）。

**保护清单**：标注 ✎ 外观与交互、行结构、橙色已保存边框、shimmer/pulse 动画语义。

**验证**：展开 engineering 列与滚动文章无明显掉帧；标注 e2e（含 reload 持久化测试）全绿。

### A2 博客页导读拖拽卡顿

**改动清单**
- 博客导读与日报导读实现有差异（高度不同、手感不同）。统一为同一分隔条组件（`ArticleDivider` 模式），博客导读宽度同样持久化。
- 拖拽卡顿随统一排查（重点：拖拽期间是否触发高频 store 写入/全树渲染）。

**保护清单**：导读内容、AI 功能、宽度持久化 key 语义。

**验证**：两个界面导读拖拽手感一致、无顿挫。

---

## B. 布局与材质

### B1 B+ 竖轨布局

**改动清单**
- 移除 `BriefingHeader` 顶栏（`src/components/BriefingHeader.tsx`）。
- A−/A＋（`briefing-font-size-decrease/increase` testid 保留）移入左侧竖轨底部（左下角）；顶栏其余控件如有则随迁，**不新增顶栏没有的控件**。
- 顶栏中的展示性内容（页面标题等）直接移除，不另设展示位（当前来源由竖轨激活态指示）。
- `BriefingSourceSidebar` 改为纯图标竖轨（≈w-14），来源项保留 ember 左边框激活态（job 用 #7fa8d9）。
- 竖轨 / 列表列 / 正文容器材质：玻璃（`bg-ink/45` + `backdrop-blur` + 圆角 + `border` parchment/16），让画作从缝隙透入。

**保护清单**：摘要与旁注的位置/样式/交互；橙色已保存边框与「已保存」文案；◀▶ 折叠按钮及交互；文章行结构与图标；hover 效果；↻换画按钮；标注 ✎ 样式；路由结构；zustand store key；全部 data-testid。

**验证**：briefing 相关 e2e 全绿（testid 随迁后）；目视对比原型 layout-real-v3。

### B2 导读高度统一

**改动清单**：顶栏移除后，日报与博客导读同高、同组件、同 UI（见 A2）。

**保护清单**：导读既有功能。

---

## C. 删除统一（右键菜单）

**改动清单**
- 博客文章行（`AnthropicArticleRow`）加右键菜单「删除」→ `ConfirmDialog` → 删除卡片并级联删除 `.assistant.md` / `.annotations.md` / `.guide.md`（复用 briefing 级联删除机制，`electron/lib/sibling-files.ts`）。
- 日报/求职：撤掉日期列右上角 🗑 删除模式（`BriefingDateColumn.tsx` L141-152 及复选模式 L91-137），日期项改为右键「删除」→ ConfirmDialog。
- 写作树右键删除的 `window.confirm`（`WritingTree.tsx` L60-65, 183-188）统一换成 ConfirmDialog。
- 学习库 ✕、标注卡片删除等上下文删除保持原位不动。

**保护清单**：删除前必须有确认；级联删除的语义与现有 briefing 一致；`briefing-delete-mode-toggle` 等被移除 testid 对应的 e2e 同步更新。

**验证**：博客右键删除后卡片消失且旁注/标注/导读文件一并删除；日报/求职右键删除当日简报；写作右键删除走 ConfirmDialog。

---

## D. 列表列

### D1 博客收起列：密排填满 + 已保存橙框

**改动清单**（`AnthropicBlogPanel.tsx` L143-179）
- 取消 `filtered.slice(0, 10)` 上限，图标从顶部密排填满整列，超出可滚。
- 已保存文章的缩略图标加 2px `border-ember`（与展开态 `border-l-ember` 同一语义）。
- ▶ 展开按钮与新文章计数徽章保留。

**保护清单**：图标点击跳转行为、缩略图 lazy 加载、徽章样式语义。

### D2 写作收起列：极简计数

**改动清单**（`WritingListColumn.tsx` / `BriefingListColumn.tsx`）
- 写作列折叠时不再渲染堆叠文字，改为：▶ + 竖排「文章」+ 计数徽章 n；底部竖排「仓库」+ 计数徽章 m（见原型 collapsed-columns.html writing-min）。

**保护清单**：展开态完整不变；折叠/展开交互。

### D3 写作文章上下拖拽排序

**改动清单**（`WritingTree.tsx` L108-127）
- 目前 drop 目标仅目录（`isDir` 门控）。增加同级排序 drop（拖到某篇上/下边缘插入），顺序持久化到 state.json（不用 frontmatter，避免污染用户文档）。

**保护清单**：现有"拖进文件夹"移动功能、右键菜单。

### D4 「仓库」改名 + 文章/仓库 switch

**改动清单**（`WritingListColumn.tsx` L83-113）
- 「repository」标签改「仓库」。
- 文章/仓库合并为一列（现已是同列双 tab），顶部改为 switch 分段控件样式切换。

**保护清单**：`writing-list-tab-repository` testid 保留（可改文案不改 id）；存储根目录结构（writing/ vs repository/）不动。

### D5 写作页文章列配色修正

**改动清单**：写作页文章列白底浅字改为全局 ink/parchment 体系（与 B1 玻璃材质一致）。

**保护清单**：列结构、tab、按钮字段。

---

## E. 字体体系（两套持久化 key）

**E1 简报字体 key（现有 `briefingFontSize`）**
- 三来源界面（日报/博客/求职简报）共用此 key；+- 控件在三个界面都可调（B1 后位于左下角竖轨）。
- 管控范围扩展：正文（已有）+ **文章列文字**（Anthropic 列表行等当前写死 `text-base`/`text-xs` 处）+ **三界面的作家语录**（`Quote.tsx` briefing 面当前写死 `text-[13px]`）。

**E2 写作 UI 字体 key（新增，如 `writingUIFontSize`）**
- 控件在写作页左下角（与 B1 竖轨左下角一致）。
- 管控：写作页除正文外的 UI 文字（栏标识「文章/仓库」、文章名 `WritingTree` 当前写死 `text-xs`）+ **写作界面的作家语录**。
- 写作正文仍由现有 `writingFontSize`（工具栏 A-/A+）独立管控。

**保护清单**：不引入第四套 key；`externalSummaryFontSize` 不动；三 key 的持久化机制（`ipc.patchState`）不变。

**验证**：简报 +- 在三界面生效且语录跟随；写作左下控件生效且语录跟随；重启后均保持。

---

## F. 转入写作：只带旁注 + 标注

**改动清单**
- `src/store/index.ts` `transferArticleToWriting`（L707-741）：不再写入全文 markdown，改为生成结构化文档：
  - frontmatter（title / source_type / source_path 保留）
  - `## 标注摘录`：每条标注的引用片段 + 批注内容，逐条列出（读 `.annotations.md`）
  - `## 旁注对话`：完整聊天记录（读 `.assistant.md`）
- 无标注/无对话时对应区块写「（无）」。

**保护清单**：`TransferToWritingButton` 三个挂载点与交互；frontmatter 字段；源文件不动。

**验证**：转入后文档不含全文；标注与对话完整；空标注文章也能转入。

---

## G. 写作助手

### G1 仿导读重做

**改动清单**（`src/components/writing-assistant/WritingAssistantPanel.tsx`）
- 整体仿导读（`ArticleAssistantPanel` 的 `ArticleDivider` 模式）：左缘可拖分隔条调宽（宽度持久化已有 `writingAssistantWidth`）+ 明显的折叠/展开按钮。
- 修复"根本拖不动"（现为自定义拖拽实现，改用 ArticleDivider 同款）。
- 修复写作页面板在某些情况下整个消失的问题（实现时先定位根因：挂载条件/持久化 open 状态异常）。
- 定位模型与摘要面板一致：右侧停靠、可拖大小、**不可拖位置**。
- 保留 24px 收起竖条作为折叠态出口。

**保护清单**：助手消息/输入组件不动；`writingAssistantOpen`/`writingAssistantWidth` key 语义；`writing-assistant-collapsed` testid。

### G2 rules 新增「功能必须有 UI 出口」

**改动清单**
- `.claude/rules/feature-development.md` 新增规则：任何新功能必须在设计中声明其 UI 入口（按钮/菜单/面板），粒度与长度参照该文件现有规则格式（Why + checklist + BAD/GOOD + Source）；同步注册 `.claude/rules/README.md` 表格与 changelog。

**保护清单**：现有规则文本不改动（仅追加 + 注册）。

---

## H. 写作编辑稳定性

### H1 回车/点击进入编辑不稳定

**改动清单**
- 先定位根因（重点排查：保存状态指示是否抢焦点 / 触发编辑器重挂载；`WritingBoard` 保存状态渲染 L40-46 附近）。
- 保存改为静默实时保存（debounce），"已保存"指示不打断输入、不弹事件。

**保护清单**：保存语义（内容不丢）、工具栏字段。

**验证**：连续输入回车/点击切换不失焦；内容实时落盘。

### H2 提问时文稿快照嵌入聊天记录

**改动清单**
- 写作助手每次发送提问时，把当前文稿全文快照随该条问题一起写入写作助手会话文件（结构：问题 + 当时文稿快照 + 回答）。
- 不产生独立快照文件；历史量 = 提问次数。

**保护清单**：会话文件既有读取/恢复逻辑兼容旧格式（无快照的历史消息正常显示）。

---

## I. 日报样式：§标题 + 来源卡

**改动清单**
- `src/components/article-assistant/ArticleBodyChunks.tsx` L46-50：chunk 标题从 `text-xs` 改为铭牌样式——`❧` + 编号（如 `❧1`，ember）+ small-caps 来源名（加字距）+ 装饰横线（见原型 digest-final.html）。
- 原始来源区（`BriefingSourceItem.tsx` / `AcademicBriefingLayout.tsx` L81-100 / `NewspaperBriefingLayout.tsx` L81-100）：药丸链接改为来源卡——等宽字体（区别于正文）、平台 glyph、名称 + 角色行、「原文 ↗」描边小章；**恢复显示组标题**（如 X / Twitter，目前被解析但丢弃）。
- 保留「展开来源」折叠交互。

**保护清单**：来源解析逻辑（`parse-briefing-markdown.ts`）不动；链接 URL 不变；`border-l-4` active chunk 语义。

---

## 测试策略

- 每个需求组配 e2e 断言（项目已有 playwright 体系）；被移除的 UI（🗑 删除模式、顶栏）对应 e2e 同步更新而非删除语义。
- testid 迁移清单随实现 PR 一并列出。
- 性能项（A）以人工验证 + 关键路径不掉帧为准，必要时加渲染计数断言。

## 备注

- 根目录乱码空目录 `C:Users86468Desktopprojectstudy-parlor.clauderules.tmp`（2026-07-10 误生成的空目录）随本批次删除。

## J. 写作编辑器工具栏 E2E 补全（追加）

**改动清单**：WritingToolbar 全部格式化按钮加 data-testid（13 个：bold/italic/strikethrough/blockquote/bullet-list/ordered-list/hr/table/font-decrease/font-increase/tone/font-size/tone-label）；e2e/selectors.ts writing 对象同步补齐 13 个选择器；writing-editor.spec.ts 新增 11 条工具栏测试用例（8 条格式按钮存在性 + 字号 A+/A- state.json 验证 + 配色 3-click 循环 + 全部按钮可见性检查）。每条格式按钮测试验证 testid 注册正确且按钮在编辑器中可见。

**保护清单**：工具栏现有交互逻辑、Milkdown 编辑器、颜色/字号常量不动。Milkdown callCommand → editor.action() 在 built output 抛 "plugin not found" 为已知既有问题，本批次不修复。
