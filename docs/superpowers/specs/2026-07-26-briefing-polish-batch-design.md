# 夜航简报批量修复 Spec

> 基于 2026-07-26 用户反馈的两轮 UI/功能缺陷修复设计。

## 背景

2026-07-25 的审美提升计划（`2026-07-25-briefing-aesthetic-elevation-design.md`）引入多项视觉功能后，用户在真实使用中发现一系列问题。本 spec 覆盖两轮共 15 个修复点。

---

## 第一轮：十点修复

### #0 页面灰蒙蒙 — 最终方案：完全移除遮罩层

**问题：** F10 聚焦呼吸已下线但页面仍灰暗。BriefingVeil + bg-ink/45 毛玻璃叠加。

**最终修复（第二轮）：**
- 完全删除 `BriefingVeil` 组件挂载
- 内容壳去 `bg-ink/30 backdrop-blur-md border` → 纯透明
- 左边列（sidebar + list column）去 `bg-ink/45 backdrop-blur-md` → 仅保留 `border`
- 恢复 `painting-vignette` 中心径向为原始值 `rgba(0,0,0,0.4)`（自 ba810c1 引入后稳定至 UI 升级前）

**验收：** 页面恢复 UI 升级前通透状态；背景画作适度变暗保证文字可读。

---

## #1 烛光随行 — 默认隐藏光标

**问题：** 烛光模式鼠标跟随破坏沉浸感。

**修复：** `CandlelightLayer.tsx` 空闲 8 秒后给 `documentElement` 加 `cursor-hidden` class（`cursor: none`）。交互元素（button/a/input/textarea/[contenteditable]）覆盖 `cursor: auto`。鼠标移动或关闭烛光时恢复。

**验收：** 烛光开启后 8 秒不动光标消失；移动鼠标/悬停按钮时光标恢复；关闭烛光时光标恢复。

---

## #2 烛光 z-index — 不被内容面板遮盖

**问题：** 烛光 `z-[3]` 低于所有内容区 `z-[5]`，光被 `bg-ink/30 backdrop-blur-md` 面板完全遮挡。

**修复：** `z-[3]→z-[6]`（高于内容 z-[5]，低于 ChatWindow z-50）。

**验收：** 烛光在内容区（含写作助手）上可见；不遮挡浮动聊天窗。

---

## #3 求职简报旁注助手恢复

**问题：** `Briefing.tsx:454` 传了 `showGuide={false}`，导致导读侧边栏不渲染，只剩一个几乎看不见的 24px 竖签。

**修复：** 去掉 `showGuide={false}` prop，恢复默认 `true`。

**验收：** 求职简报右侧出现完整的导读侧边栏 + 文章分割线 + 聊天窗口入口。

---

## #4 按钮竖排 + 圆形图标风格

**问题：** 6-7 个按钮挤在 192px 侧边栏用 `flex-wrap` 乱换行。烛光/画框按钮在报纸主题下仍占位（仅禁用不隐藏）。字体大小按钮与烛光/画框风格不一致。

**修复：**
- 竖轨控制区改为 `flex-col` 竖排
- 所有按钮统一圆形 SVG 图标风格（`w-8 h-8 rounded-full border`），与烛光/画框切换按钮看齐
- 返回首页改为 home SVG 图标
- 字号 ± 横排成组
- 报纸主题：**隐藏**（非禁用）烛光/画框按钮，只保留返回、字号±、主题切换 4 个
- 档案按钮改为圆形 `档案` 文字按钮

**验收：** 按钮不重叠；所有按钮视觉一致；报纸主题底部只显示 4 个按钮。

---

## #5 来源命名 + 列宽

**问题：** 写作/AI日报/Anthropic博客/求职简报名称参差不齐（2/5/9/4 字符），日期列右侧大片空白。

**修复：**
- 统一 2 字命名：写作、前沿、博客、求职
- 来源侧边栏：`w-48→w-40`
- 日期列：`w-64→w-44`，日期按钮 `px-3→px-2`

**命名 rationale：** "前沿"捕捉 AI 日报的前沿资讯属性；"博客"简洁指代 Anthropic Engineering Blog；"求职"直接表达功能。四字对齐侧边栏宽度需求降低。

**验收：** 四来源名称宽度一致；日期列不再有大片空白；侧边栏更紧凑。

---

## #6 写作折叠恢复

**问题：** 折叠文章列表后只剩 "文章" + 计数 + "仓库" + 计数，零导航信息。"一折就没了"。展开按钮 `▶` 60% 透明度无背景，极小极难找。

**修复：**
- 折叠按钮：加 `w-7 h-7 rounded-full` 圆形底框 + hover 背景
- 折叠态显示最近 3 篇文章名（竖排 vertical-rl，可点击跳转）
- "文章" 标签增加可点击性提示

**验收：** 折叠后可见最近文件名且可直接跳转；`▶` 按钮有足够视觉存在感。

---

## #7 E2E 补充

**需求：**
1. 求职档案面板打开 → 已有 `job-briefing-profile-panel.spec.ts`（17 个测试）
2. 四来源切换（写作→前沿→博客→求职→写作 全循环）→ **不存在，需新增**

**新增 spec：** `e2e/specs/briefing-source-switching.spec.ts`
- 全循环切换 4 个来源，验证无崩溃（回归 #1 hooks 修复）
- 验证每个来源按钮切换后获激活态样式
- 验证无 ErrorBoundary 出现

**验收：** `node scripts/e2e-changed.js --run` 通过。

---

## #8 重复日期修复

**问题：** `formatGeneratedAt` 对非今日日期返回 `"2026 年 07 月 11 日 · 08:00"`，但 `BriefingMetaLine` 已显示 `displayDate`（也是日期），产生 `"2026 年 7 月 11 日 · 2026 年 07 月 11 日 · 08:00"` 双日期。

**修复：** `formatGeneratedAt` 始终只返回时间 `"08:00"`。

**验收：** 日报和求职简报日期行只显示一次日期。

---

## #9 入场动画闪烁修复

**问题：** 已有 result 时切换到日报/求职简报，`BriefingProgress`（星图生成动画）闪一帧后消失。

**修复：** 在渲染逻辑中，当 `result` 已存在时抑制 `BriefingProgress` 的 `generating/resolved/departing` 阶段渲染。内容直接走 `data-arrival` 分支。

**验收：** 切换到已有结果的来源时不闪现生成动画；真正生成时动画正常播放。

---

## 变更影响范围

| 文件 | 变更 |
|---|---|
| `src/components/briefing/BriefingVeil.tsx` | 渐变值 |
| `src/styles/globals.css` | vignette 中心径向 + cursor-hidden |
| `src/pages/Briefing.tsx` | 内容壳样式 + showGuide + formatGeneratedAt + width + BriefingProgress 守卫 |
| `src/components/briefing/CandlelightLayer.tsx` | 光标隐藏 + z-index |
| `src/components/BriefingSourceSidebar.tsx` | 按钮竖排 + 命名 + 宽度 |
| `src/components/BriefingListColumn.tsx` | 宽度类型 + 折叠按钮 |
| `src/components/BriefingDateColumn.tsx` | 按钮 padding |
| `src/components/writing/WritingListColumn.tsx` | 折叠态迷你导航 |
| `e2e/specs/briefing-source-switching.spec.ts` | 新建 |
| `e2e/source-map.json` | 新增 spec 条目 |
| `tests/briefing-sidebar.test.tsx` | 标签 + 按钮更新 |

---

## 第二轮：八点反馈修复

### #10 来源侧边栏不自动展开

**问题：** 切换来源时侧边栏自动展开。

**修复：** `BriefingSourceSidebar.tsx` onClick 中移除 `if (collapsed) onToggle()`。

---

### #11 按钮重排序

**问题：** 竖轨按钮顺序不合理。

**修复：** 烛光/画框置顶 → spacer → 返回封面/主题切换置底。字号控件移至右上角。求职档案按钮删除（用户明确指令）。

---

### #12 换画+字号按钮统一位置

**问题：** 四来源的换画按钮分散在各子组件（AcademicBriefingLayout、AnthropicArticleReader 等），字号按钮在竖轨中。

**修复：**
- 博客源（Anthropic）的换画按钮维持在 `AnthropicArticleReader` 内部 `absolute top-4 right-4`（用户确认此位置为正确基准）
- 字号 +/- 紧挨换画按钮左侧，三按钮捆绑并排（博客内部 + 空态均渲染）
- 其余三来源（digest/writing/job-briefing）统一到 `Briefing.tsx` 右上角 `fixed top-6 right-4 z-20`
- `Briefing.tsx` 对 `source === 'anthropic'` 隐藏页面级控件（避免与博客内部按钮重复）
- 所有 `SwapPaintingButton` 从 AcademicBriefingLayout/NewspaperBriefingLayout/PaintingPlate 移除

**修正（第三轮）：** 用户指出博客里的换画按钮位置才是对的——之前把博客的按钮也统一到 fixed 右上角是南辕北辙。恢复博客内部按钮 + 字号捆绑，页面级控件只对非博客源生效。

---

### #13 按钮文案改为"今日" + 求职蓝色

**问题：** 生成按钮标签参差不齐，求职按钮颜色不匹配。

**修复：**
- digest/job-briefing 的 `todayLabel` 和 `buttonLabel` 统一为 `"今日"`
- `BriefingEmptyState` 按钮：求职源使用 `bg-[#7fa8d9]`（星蓝），其他源保持 `bg-ember`

---

### #14 入场动画修复

**问题：** 文章从上而下铺展动画不生效——`fresh` flag 用 `useState` + `useEffect` 设置，导致一帧滞后，内容先渲染无动画再跳回 `opacity:0`。

**根因：** `use-generation-transition.ts` 中 `fresh` 在 `useEffect` 中异步设置，首帧渲染时仍为 `false`。

**修复：** 改为 ref 同步派生——在 render 阶段检测 `prevLoading && !loading && hasResult && !hasError` 条件，直接设置 `freshRef`，确保 `data-arrival="fresh"` 在内容首帧渲染时即生效。

**验收：** 新生成内容从标题→元数据→语录→正文依次阶梯落定（0/220/400/550ms stagger）。

---

### #15 左右列折叠动画丝滑化

**问题：** 折叠/展开有卡顿感。

**修复：**
- `transition-all` → `transition-[width] duration-200 ease-out`（仅动画宽度，避免全属性重算）
- 折叠态加 `overflow-hidden` 防止内容溢出闪烁

---

### #16 博客滚动性能

**问题：** 博客文章列表滚轮卡顿。

**修复：**
- `BriefingListColumn` 滚动容器加 `will-change: transform` + `translateZ(0)` GPU 加速
- `AnthropicBlogPanel` 列表容器 GPU 层级提升
- 缩略图加 `decoding="async"`

---

### #17 E2E 完善

- 新建 `briefing-source-switching.spec.ts`：四来源全循环切换（2 测试）
- 更新 `job-briefing-error.spec.ts`：档案入口测试适配按钮移除
- `anthropic-blog-ui.spec.ts`：全部 7 测试通过（重建后）
- `job-briefing-generation.spec.ts` + `job-briefing-error.spec.ts`：13/15 通过（2 个 @real 需 Tavily 密钥）

---

## 第三轮：按钮布局修正

### #18 博客换画按钮恢复原位

**问题：** #12 将所有换画按钮统一到 `fixed top-6 right-4`，但博客源的换画按钮原本在 `AnthropicArticleReader` 内部 `absolute top-4 right-4`（不随文章滚动），这个位置才是正确的基准。

**修复：**
- `AnthropicArticleReader` 恢复内部 `SwapPaintingButton`，字号 −/+ 紧挨左侧捆绑
- `AnthropicBlogPanel` 空态同理
- `Briefing.tsx` 对 `source === 'anthropic'` 隐藏页面级控件

---

### #19 PaintingLabel 文字移到图标下方

**问题：** `SwapPaintingButton` 中 `PaintingLabel`（画作标题文字）在图标左侧渲染，hover 时显示文字撑开间距，导致字号按钮和换画图标不紧凑。

**修复：**
- `SwapPaintingButton` 容器改为 `flex-col items-end`（竖排，右对齐）
- `PaintingLabel` 移到 `<button>` 下方，文字右侧与图标右侧对齐，不突出到右侧摘要页

---

### #20 按钮组紧凑化 + 报纸版式保留字号

**问题：**
- 按钮间距 `gap-2` 偏大，三个按钮不够紧凑
- 报纸版式完全无字号控件（被 `isAcademic &&` 条件排除）

**修复：**
- 所有按钮组容器改为 `items-start gap-1`（字号按钮顶部与换画图标顶部对齐，间距紧凑）
- 报纸版式：隐藏 `SwapPaintingButton`（无背景画作），保留字号 −/+ 按钮
- 三处容器同步：`Briefing.tsx` 页面级、`AnthropicArticleReader`、`AnthropicBlogPanel` 空态

---

## 变更影响范围（总）

| 文件 | 变更 |
|---|---|
| `src/pages/Briefing.tsx` | BriefingVeil删除 + 内容壳透明 + 统一按钮（非博客源）+ formatGeneratedAt + BriefingProgress守卫 + 字号hook + todayLabel + source!=='anthropic'守卫 |
| `src/components/BriefingSourceSidebar.tsx` | 竖排按钮 + 命名+宽度 + 去自动展开 + 重排序 + transition优化 |
| `src/components/BriefingListColumn.tsx` | 宽度类型 + 折叠按钮 + transition优化 + GPU加速 |
| `src/components/BriefingDateColumn.tsx` | 按钮 padding |
| `src/components/briefing/BriefingVeil.tsx` | 已废弃（不再挂载） |
| `src/components/briefing/BriefingEmptyState.tsx` | 求职蓝色按钮 |
| `src/components/briefing/CandlelightLayer.tsx` | 光标隐藏 + z-index |
| `src/components/briefing/BriefingThemeToggle.tsx` | 圆形图标风格 |
| `src/components/briefing/AcademicBriefingLayout.tsx` | 移除内部 SwapPaintingButton |
| `src/components/briefing/NewspaperBriefingLayout.tsx` | 移除内部 SwapPaintingButton |
| `src/components/briefing/PaintingPlate.tsx` | 移除 swapButton prop |
| `src/components/anthropic/AnthropicArticleReader.tsx` | 恢复内部 SwapPaintingButton + 字号按钮捆绑（博客基准位置） |
| `src/components/anthropic/AnthropicBlogPanel.tsx` | 恢复空态 SwapPaintingButton + 字号捆绑 + 滚动性能优化 |
| `src/components/anthropic/AnthropicArticleRow.tsx` | 性能优化 |
| `src/components/writing/WritingListColumn.tsx` | 折叠态迷你导航 |
| `src/lib/use-generation-transition.ts` | fresh flag useState→ref同步派生修复 |
| `src/styles/globals.css` | vignette恢复 + cursor-hidden |
| `e2e/specs/briefing-source-switching.spec.ts` | 新建 |
| `e2e/specs/job-briefing-error.spec.ts` | 档案入口测试适配 |
| `e2e/source-map.json` | 新增 spec 条目 |
| `tests/briefing-page.test.tsx` | 按钮统一 + 博客内部按钮断言 + 回归测试 |
| `tests/briefing-sidebar.test.tsx` | 标签 + 按钮更新 |
| `tests/briefing-layout.test.tsx` | backdrop-blur-md 断言更新 |

---

## 2026-07-26 补充：§#0 "完全移除遮罩层" 的根因修正

### 问题

§#0 的修复方案"完全删除 BriefingVeil 组件挂载"基于一个错误前提：认为 `painting-vignette` 暗角在审美升级中被"削弱"了，需要"恢复"其原始值。

### 事实

1. **暗角从未被修改**：`painting-vignette` CSS 值从 `ba810c1`（2026-05-11）引入至今完全一致，从未改变。本 spec 所述"恢复 painting-vignette 中心径向为原始值 `rgba(0,0,0,0.4)`"——该值一直是 `rgba(0,0,0,0.4)`。
2. **暗角中心是透明的**：`radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.4) 100%)`——中心 35% 区域完全无压暗，这正是文字所在的区域。
3. **画作深色化是双层架构**：暗角（第1层，压暗边缘）+ 全页叠加层（第2层，压暗全页）。两者互补，缺一不可。BriefingVeil 的前身是 `d1b998a`（2026-07-22）引入的 `bg-[#0c0806]/[0.72]` 全页叠加层。

### 修正

§#0 的正确修复不是"删除 BriefingVeil"，而是**恢复全页深色叠加层**——使用 BriefingVeil 引入前的原始方案 `bg-[#0c0806]/[0.72]`，该值比 BriefingVeil（底部 94% 不透明度）轻量得多，不会造成"灰蒙蒙"，同时保证中心区域文字可读。

### 教训

- "灰蒙蒙"的根因是审美升级中**新增**的 `bg-ink/45 backdrop-blur-md` + BriefingVeil 本身的高不透明度（94%），而非暗角被"削弱"。
- 删除功能前需追溯其引入时间线和与其他层的依赖关系，不能假设"旧的东西就是后来加的"。
