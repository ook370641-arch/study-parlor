# 夜航简报 & Anthropic 博客阅读器 UI 修复设计

> 日期：2026-07-10  
> 范围：`src/pages/Briefing.tsx`、`src/components/BriefingSourceSidebar.tsx`、`src/components/briefing/*`、`src/components/anthropic/*`、`src/components/md/MarkdownRenderer.tsx`  
> 状态：待实现

## 1. 问题概述

当前「夜航简报」页面与 Anthropic 博客阅读器存在 6 个 UI/UX 问题：

1. **学术主题下左侧来源栏不可见**：`BriefingSourceSidebar` 使用 `bg-ink/80`，与深色学术背景 `#2a1f1a` 融合，导致侧边栏看起来像没渲染。
2. **报纸主题下左侧来源栏配色错乱**：报纸主题主区域为白底黑字，但侧边栏仍沿用深褐/羊皮纸配色，风格割裂。
3. **缺少「查收日报」入口**：进入页面即自动触发四行 loading UI，用户希望先看到入口按钮，点击后再开始生成。
4. **博客文章正文缺少配图**：文章列表左侧的抽象图标保留，但正文中的 `<img>` / markdown 图片没有正常渲染。
5. **折叠侧边栏图标语义不清**：折叠后显示「日」「A」两个单字，既像占位符又像 bug。
6. **博客阅读器风格未与 AI 日报对齐**：博客面板和阅读器目前只有深色一套皮肤，没有跟随 `briefingTheme` 的学术/报纸双主题。

## 2. 设计目标

- 修复两个主题下侧边栏的可见性与风格一致性。
- 用明确的 SVG 图标替代折叠后的文字标签。
- 增加显式的「查收日报」入口，避免自动触发 loading。
- 让 Anthropic 博客阅读器共享 `briefingTheme`，实现学术/报纸两套视觉。
- 修复正文图片渲染链路，保留列表左侧的抽象图标不变。

## 3. 非目标

- 不重构整体主题系统；本次采用外科手术式修复。
- 不替换文章列表左侧的抽象图标列。
- 不引入第三种主题。
- 不修改 AI 日报的内容生成逻辑、LLM prompt 或数据来源。

## 4. 关键决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 侧边栏主题策略 | 完全跟随 `briefingTheme` | 学术/报纸两个主题各自完整，没有半个界面掉队 |
| 折叠图标 | 极简 SVG 图标 | 日报用报纸/文档图标，博客用 Anthropic 风格几何图标，跨语言、无歧义 |
| 「查收日报」入口 | 方案 A：极简居中按钮 | 改动最小，保留现有背景，只在正中央放一句提示 + 按钮 |
| 博客主题 | 与 AI 日报共用 `briefingTheme` | 避免新增独立主题状态 |
| 博客配图 | 只渲染正文内图 | 保留列表左侧现有图标列，不改变用户已认可的列表样式 |
| 总体实现方案 | 方案 A：外科手术式修复 | 改动面最小、风险最低、可独立回滚 |

## 5. 详细改动

### 5.1 侧边栏主题化

**文件**：`src/components/BriefingSourceSidebar.tsx`

- 新增 `theme: 'academic' | 'newspaper'` prop，由调用方传入 `briefingTheme`。
- 根据 `theme` 切换以下样式：
  - **学术**：背景 `#3d2f27`，边框 `rgba(232,213,183,0.18)`，文字/图标 `#e8d5b7`，激活态边框 `#d97757`，激活背景 `rgba(232,213,183,0.1)`。
  - **报纸**：背景 `#e8e4de`，边框 `#c9c3b8`，文字/图标 `#2a1f1a`，激活态边框 `#1a1a1a`，激活背景 `rgba(0,0,0,0.06)`。
- 折叠宽度保持 `w-14`，展开宽度保持 `w-48`。
- hover 态使用对应主题色，不硬编码 `bg-ink/80`。
- **z-index 修复**：`BriefingSourceSidebar` 的 `<aside>` 必须带 `z-[5]`，确保位于 `SurfaceBackground`（fixed + z-0）之上，不被油画背景覆盖。

### 5.2 折叠侧边栏图标

**文件**：`src/components/BriefingSourceSidebar.tsx`

- 替换现有「日」「A」文字为两个内联 SVG：
  - **AI 日报**：报纸/文档图标（矩形 + 横线）。
  - **Anthropic 博客**：抽象几何图标（类似 Anthropic logo 的多边形/箭头组合）。
- SVG 使用 `currentColor`，跟随主题文字色。
- 展开状态下仍保留文字标签「AI 日报」「Anthropic 博客」。

### 5.3 「查收日报」入口

**文件**：`src/pages/Briefing.tsx`

- 当 `source === 'digest'` 且没有 `result`、没有 `loading`、没有 `error` 时，不再自动调用 `generateBriefing(today)`。
- 改为渲染居中的空状态：
  - 提示文案：「今日夜航简报尚未生成」
  - 按钮文案：「查收日报」
  - 按钮点击后调用 `generateBriefing(today)`，进入现有四行 loading UI。
- 已有缓存（`result` 存在）时直接显示内容，不展示入口。
- 报错后仍保留 Header 操作入口（重新生成、往期、主题切换），符合「页面所有状态共享同一套顶部 Chrome」规则。

### 5.4 博客阅读器主题化

**文件**：
- `src/components/anthropic/AnthropicBlogPanel.tsx`
- `src/components/anthropic/AnthropicArticleReader.tsx`

- 两个组件读取 `briefingTheme`，根据主题切换整体配色：
  - **学术**：深色羊皮纸背景（`#2a1f1a` / `#3d2f27`），文字 `#e8d5b7`，强调色 `#d97757`，按钮/边框使用羊皮纸半透明色。
  - **报纸**：白色背景 `#ffffff`，文字 `#1a1a1a`，强调色 `#1a1a1a` 或 `#d97757`，边框/分割线使用 `#c9c3b8`。
- 阅读器内标题、正文、引用块、代码块、链接颜色全部跟随主题。
- 列表项的抽象图标列保留现有实现，不受主题切换影响。

### 5.5 博客正文图片渲染

**文件**：`src/components/md/MarkdownRenderer.tsx`

- 确保 `MarkdownRenderer` 正确渲染 `<img>` 标签。
- 对本地图片路径（已 rewrite 为 `file://`）和外链图片都支持。
- 图片加载失败时显示占位区域，不破坏布局。
- 图片默认最大宽度 `100%`，学术主题下可加细边框或阴影以突出图片。
- 如果当前正则 frontmatter strip 会误把正文中的图片标记截断，需要调整 strip 逻辑，使其只移除 frontmatter 而不影响 body。

### 5.6 「往期」抽屉全局挂载

**文件**：`src/pages/Briefing.tsx`

- `BriefingHistoryDrawer` 必须作为页面固定元素渲染，不能放在 `parsed && result` 内容分支内部。
- 当 `source === 'anthropic'`、`emptyState`、`isDigestLoading`、`isDigestError` 时，点击 Header 的「往期」按钮后 drawer 仍需正常弹出。
- `currentDate` 在 `result` 不存在时回退到 `today`，保证历史列表高亮当前日期无误。

### 5.7 Anthropic 博客背景插画对齐

**文件**：`src/pages/Briefing.tsx`、`src/components/anthropic/AnthropicBlogPanel.tsx`、`src/components/anthropic/AnthropicArticleReader.tsx`

- 学术版式下，无论 `source === 'digest'` 还是 `source === 'anthropic'`，都渲染 `SurfaceBackground surface="briefing"`，复用 AI 日报同款背景插画。
- Anthropic 模式下学术主题仍显示「换画」按钮，调用 `swapPainting('briefing')`。
- `AnthropicBlogPanel` 学术主题保持 `panelBg: 'bg-ink/60'`、`sidebarBg: 'bg-ink/80'` 等半透明色，以透出背景。
- `AnthropicArticleReader` 学术主题背景从纯色 `bg-ink` 改为半透明 `bg-ink/90`，让阅读器也能透出背景插画；报纸主题保持白底黑字。

## 6. 组件变更清单

| 组件 | 变更 |
|------|------|
| `Briefing.tsx` | 移除 mount 时自动生成逻辑；新增「查收日报」空状态；把 `briefingTheme` 传给 `BriefingSourceSidebar` 和博客组件；将 `BriefingHistoryDrawer` 移到条件分支外；学术版式始终渲染 `SurfaceBackground`；Anthropic 模式显示换画按钮 |
| `BriefingSourceSidebar.tsx` | 新增 `theme` prop；按主题切换配色；用 SVG 替换折叠文字；给 `<aside>` 加 `z-[5]` |
| `BriefingHeader.tsx` | 无需改动，已主题感知 |
| `AcademicBriefingLayout.tsx` | 无需改动 |
| `NewspaperBriefingLayout.tsx` | 无需改动 |
| `AnthropicBlogPanel.tsx` | 读取 `briefingTheme` 切换深浅配色；学术主题半透明以透出 briefing 背景 |
| `AnthropicArticleReader.tsx` | 读取 `briefingTheme` 切换深浅配色；学术主题背景改为 `bg-ink/90`；确保正文图片渲染 |
| `MarkdownRenderer.tsx` | 修复/验证正文 `<img>` 渲染，支持本地与外链图片 |

## 7. 状态与数据流

- `briefingTheme` 继续由 Zustand store 提供，持久化到 `state.json`。
- 博客阅读器不新增独立主题状态，直接使用 `briefingTheme`。
- 入口按钮触发后调用 store action `generateBriefing(today)`，复用现有 loading/error/success 生命周期。

## 8. 边界与错误处理

- 主题值异常（非 `academic`/`newspaper`）时，默认回退到 `academic`。
- 图片加载失败时显示占位，不抛错。
- 博客组件在主题切换时保持当前滚动位置，避免重渲染后跳回顶部。
- 侧边栏在折叠和展开两种宽度下都要保证图标居中、文字截断优雅。

## 9. 测试计划

| 测试项 | 类型 |
|--------|------|
| 学术/报纸主题下侧边栏可见、配色正确 | 组件测试 / 手动 |
| 折叠后显示 SVG 图标而非「日」「A」 | 组件测试 |
| 未生成状态时显示「查收日报」按钮，点击后进入 loading | E2E / 组件测试 |
| 报纸主题下博客阅读器为白底黑字 | 手动 |
| 学术主题下博客阅读器为深色羊皮纸 | 手动 |
| 博客正文包含本地图片和外链图片时正常渲染 | 组件测试 |
| 图片加载失败时布局不崩 | 组件测试 |

## 10. 规则沉淀

本次修复暴露两个跨页面状态/视觉同步盲点，应补充进项目规则：

### 10.1 全局 Chrome 必须与内容状态解耦

- **位置**：`.claude/rules/ui-styling.md` 第 8 条。
- **内容**：Header、Drawer、背景层、换画按钮等全局 Chrome 不得放在某个内容分支的条件渲染内；它们必须在所有状态（空态、加载中、错误、不同子源）下都挂载并可用。
- **示例**：`BriefingHistoryDrawer` 原本放在 `parsed && result` 分支内，导致空态/Anthropic 源下点击「往期」无响应。

### 10.2 新增页面模式/子源时必须同步检查页面级元素

- **位置**：`.claude/rules/ui-styling.md` 第 9 条。
- **内容**：新增 source、tab、mode 时，必须按 checklist 检查：背景插画、换画按钮、Header 按钮、Drawer、字号控制、主题切换是否都覆盖新模式；不能只改主内容区。
- **示例**：Anthropic 博客作为 `briefingSource` 的新取值加入后，`SurfaceBackground` 和 `SwapPaintingButton` 仍被 `source === 'digest'` 过滤，导致背景缺失。

## 11. 验收标准

- [ ] 学术主题下左侧来源栏清晰可见，不再与背景融合。
- [ ] 报纸主题下左侧来源栏为浅灰底黑字，与白色主区统一。
- [ ] 折叠侧边栏显示两个语义明确的 SVG 图标。
- [ ] 未生成简报时，页面中央显示「今日夜航简报尚未生成」+「查收日报」按钮，点击后才开始生成。
- [ ] Anthropic 博客阅读器在学术/报纸主题下配色与 AI 日报一致。
- [ ] Anthropic 博客在学术主题下复用 briefing 背景插画，并显示换画按钮。
- [ ] 文章阅读器学术主题半透明，能透出背景插画。
- [ ] 空态 / 加载中 / 报错 / Anthropic 源下，点击「往期」均能打开历史抽屉。
- [ ] 博客文章正文中的图片正常显示，列表左侧抽象图标列保持不变。

## 12. 参考

- 原型文件：
  - `c:\Users\86468\Desktop\project\study-parlor\.superpowers\brainstorm\11787-1783688049\content\prototype-newspaper.html`
  - `c:\Users\86468\Desktop\project\study-parlor\.superpowers\brainstorm\11787-1783688049\content\prototype-academic.html`
- 项目规则：`.claude/rules/ui-styling.md` §2 / §3 / §6
