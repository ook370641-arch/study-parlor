# 博客对照写作挑选器设计（2026-09-16）

## 背景

右栏统一（2026-08-23 spec 模块 2）让博客/拾贝/求职三栏目获得「导读 | 对照」两 tab，但对照槽只能从**本栏目文章列表**挑选对照文——写作树与博客对照槽之间没有连接。用户在心智上认为「对照状态 → 点写作 → 挑一篇放进对照」是自然路径，实际点来源栏「写作」走 `setBriefingSource('writing')` 整页跳转，博客阅读器被卸载。

## 交互模型

- **进入**：某栏目（博客/拾贝/求职）右栏处于对照 tab、右栏展开、主区有在读文章时，点来源栏「写作」→ **不切 source**，左栏文章列表临时换成写作树挑选器（`CompanionWritingPicker`），主区阅读器保持不动。挑选期间来源栏 active 样式移到「写作」上。
- **挑选**：点树中文件 → `selectArticleCompanion` 放入该栏目对照槽；picker 保持打开，可连续换文。writing/ 与 repository/ 两个根平铺展示，都可挑。
- **退出**：再点「写作」、或点当前栏目来源 → 回到该栏目文章列表；点其他来源 → 正常整页切换（picker 随 source 切换清空）。
- **非对照语境**：点「写作」维持现状整页跳转到写作界面（回归护栏有 E2E 覆盖）。

## 资格条件（`src/lib/companion-picker.ts` `companionPickerTarget`）

全部满足才可进入：`briefingSource` ∈ {anthropic, scout, job-briefing}；该栏目 `articlePanelMode === 'companion'`；`!articleAssistantGuideCollapsed`；主区有在读文章（anthropic → `anthropicReaderFilePath`；scout → `scoutTab==='articles' && scoutReaderFilePath`；job → `jobBriefing.result.filePath`）。

## 状态与清理

- `writingCompanionPicker: 'anthropic' | 'scout' | 'job' | null`（store **瞬态**，不持久化；对照映射本身已由 `articleCompanionMap` 持久化）。
- 三个清理点防止失效残留：`setBriefingSource`（任何切换）、`setArticlePanelMode`（切回 guide）、`setArticleAssistantGuideCollapsed(true)`。

## 只读语义

求职对照槽维持既有只读语义（2026-08-23 spec：求职对照只读），写作文件放入求职对照同样 `readonly: true`；博客/拾贝对照槽的 md 可编辑（autosave）、html 只读，沿用 `ArticleCompanionBoard` 现有分派。

## 实现要点

- `WritingTree` 增加可选 `onPickFile` prop（挑选模式）：文件点击走回调、隐藏行内操作按钮（重命名/新建/删除）；写作页不传，行为零变化。
- `BriefingSourceSidebar` 拦截导航点击：见交互模型。
- 三个面板各接一行分派：`AnthropicBlogPanel` / `ScoutPanel` / `Briefing.tsx`（求职日期列），picker 打开时 `BriefingListColumn` 内容换成 `CompanionWritingPicker`，title 变「选对照文」。

## UI 出口（feature-development §12）

- 入口：来源栏「写作」（`data-testid="briefing-source-writing"`，既有）在对照语境下获得新语义；picker 本体 `data-testid="companion-writing-picker"`。
- E2E 断言：对照 tab 下点「写作」→ 主区正文不变 + picker 出现；点文件 → 对照槽显示该文件；非对照模式点「写作」→ 仍整页跳转。

## 明确不做

- 不持久化 picker 开关。
- 对照槽不加独立 AI 助手会话、不接 toolbar（沿既有 deferred 决策）。
- 拖拽放置不做（隐藏交互不能是唯一路径）。
