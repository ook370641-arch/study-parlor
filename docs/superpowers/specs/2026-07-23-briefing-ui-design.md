# 夜航简报「学者夜话」UI 设计

日期：2026-07-23
状态：已批准（brainstorming 六屏可视化评审通过）
范围：夜航简报页全部来源（digest / 求职 / Anthropic / 写作），Academic 主题为主，Newspaper 主题仅享受共享组件的适配部分

## 1. 背景与目标

夜航简报当前 UI 功能完整但气质单薄：平遮罩压住了画作、loading 是普通进度列表、空态只有一行文字。学习页（home/study）已有成熟的诗意资产——GravityField 引力归位、Quote 语录、SurfaceBackground 画作、StarOrbit 微动画——简报页一个都没用上。

目标：把学习页的三大资产注入夜航简报，让它在视觉上成为「学者夜话」宇宙的一部分。纯渲染层改造，零主进程改动、零新增 IPC、零新增持久化字段。

## 2. 已批准的决策表

| 设计项 | 决策 | 评审屏 |
|---|---|---|
| 总体方向 | A · 夜航星图（克制的夜空仪式感） | design-directions / directions-hifi |
| 语录带版式 | 琥珀双线居中窄带（刊训式） | quote-band-options 方案 1 |
| 语录带覆盖源 | digest + 求职 + Anthropic + 写作，**纯 UI 层显示，不写入 md** | typography-and-placements |
| 画作遮罩 | 三段平衡渐变 `.30 → .62 → .86 → .94`，单组件 + CSS 变量 | veil-gradient-options 方案 1 |
| 星图布局 | 四方散布 + 引力线，卫星沿虚线滑入引力井 | constellation-layout-options A |
| 空态 | 语录 + StarOrbit 微轨道 + 主按钮 | empty-state-options A |
| 求职星图 | 同构布局，星蓝（`#7fa8d9`）主色区分 | job-constellation-options B |
| 章节标题装饰 | ◆ 琥珀菱标（::before 伪元素） | typography-and-placements 方案 1 |

明确不做（YAGNI）：思绪边栏（B 方向，二期再议）、Newspaper 主题语录带、Anthropic/写作源星图动画、❧ 花饰、空态休眠星图（B 方案）。

## 3. 组件架构

| # | 改动 | 文件 | 性质 |
|---|------|------|------|
| 1 | 新增 `BriefingConstellation` | `src/components/briefing/BriefingConstellation.tsx` | 生成中星图，digest/求职共用 |
| 2 | 改造 `BriefingProgress` | 既有 | 渲染层替换为星图；保留全部现有 testid 与 stage 回退防御 |
| 3 | `Quote` 组件加 `'briefing'` surface | `src/components/Quote.tsx` | 琥珀双线窄带变体 |
| 4 | 新增 `BriefingVeil`（分层渐变遮罩） | `src/components/briefing/BriefingVeil.tsx` | 替换 `Briefing.tsx` 内联平遮罩 |
| 5 | 空态组件 `BriefingEmptyState` | `src/components/briefing/BriefingEmptyState.tsx` | digest/求职共用，仅按钮文案不同 |
| 6 | 排版样式 | `briefing-body-academic` 样式表 + `briefing-font-size.ts` | ◆ 菱标、术语高亮、行距 |
| 7 | 规则增补 | `.claude/rules/ui-styling.md` §11 | 「学者夜话设计语言」 |

### 语录带落位（四处）

1. **digest 阅读态**：`AcademicBriefingLayout` header 区，`displayDate` 之下、正文之上
2. **求职阅读态**：`JobBriefingRenderer` 容器顶部（位于 profile-hint 之下；hint 仅在档案为空时出现，不值得为它把语录带拉进页面层）
3. **Anthropic 阅读页**：文章 meta 之下、正文之上（挂在阅读器容器内，列表态不显示）
4. **写作页**：Milkdown 工具栏之下、编辑区之上；随编辑区滚动，不占固定高度；助手面板展开时随编辑区同宽收缩

全部为渲染层装饰，不进入任何 md 文件内容。Newspaper 主题不加语录带。

## 4. 夜航星图（BriefingConstellation）

### 数据流

完全由现有 `briefingStage` / `jobBriefingStage` 驱动，无新增状态：

- **digest（4 站）**：采集信号 → 提取信息 → 组装简报 → 归档
- **求职（5 站）**：扫描新动态 → 深挖焦点岗位 → 聚合面经问题 → 综合生成 → 归档
- `onBriefingProgress` 的 `detail` 作为井下方副标题行

### 视觉结构

- 中央引力井：圆环 + 源名（夜航/求职）+ `n/N 已归位` 计数；两圈虚线轨道环
- 卫星（stage 胶囊）初始散布四周，虚线引力线连向中心，透明度随距离衰减
- stage 推进：对应卫星沿引力线滑入引力井（CSS transition + transform），井口微光脉冲一次；已归位卫星呈琥珀色 ✓ 留在井内，进行中卫星发光（◉）
- 井下方：当前 stage 主文案 + detail 副文案；底部常驻一条语录（↻ 可换）
- 卫星坐标：4 站与 5 站各一组百分比坐标预设（不读 `window.innerWidth`，SVG viewBox + 百分比自适应）

### 配色

- **digest / Academic**：parchment 星点 + ember 琥珀引力
- **求职 / Academic**：同构布局，主色换星蓝 `#7fa8d9`（引力线/井/卫星/侧栏激活态/「今天」日期着色）；页面级 CTA 按钮维持 ember 不变
  - 已知张力：求职页 ember 按钮与星蓝星图同页并存。这是用户评审后明确选择的方案；星蓝只出现在「源标识性」元素上，不向正文/正文装饰扩散
- **Newspaper 主题**：同一组件换纸白底 + 墨色（`#1a1a1a`）卫星与引力线，结构不变，仅 CSS 变量

### testid 契约

- 保留 `briefing-progress`、`briefing-progress-step-{stageKey}`（落在对应卫星上），旧 E2E 断言不 break
- 新增 `briefing-constellation`（容器）、`briefing-constellation-well`（引力井）

## 5. 画作遮罩（BriefingVeil）

替换 `Briefing.tsx:118-123` 的内联平遮罩（`bg-[#0c0806]/[0.72]`）：

```css
background: linear-gradient(180deg,
  rgba(12,8,6,0.30) 0%,    /* 报头：画作透出 */
  rgba(12,8,6,0.62) 26%,
  rgba(12,8,6,0.86) 55%,
  rgba(12,8,6,0.94) 100%); /* 正文：维持现有阅读对比度 */
```

- 单组件 + CSS 自定义属性（`--veil-stops`），不做多套实现
- 仅 Academic 主题；仍是全局 Chrome，始终挂载、不受内容分支影响（ui-styling §8）
- `SwapPaintingButton` 行为不变

## 6. 空态（BriefingEmptyState）

digest「今日夜航简报尚未生成」与求职「今日求职简报尚未生成」合并为同一组件：

- 小型 StarOrbit（2 星微轨道）
- 居中语录（Quote briefing 变体，↻ 可换）
- 现有提示文字 + 主按钮（查收日报 / 生成求职简报），按钮行为与文案不变
- Newspaper 主题同结构换配色

## 7. 排版精修

- 章节标题：`::before` 加 ◆ 琥珀菱标（9px，`vertical-align: 2px`），不改 markdown 渲染器
- 术语高亮（`rehypeTermHighlight` 输出）统一为琥珀色 + 点状下划线
- `briefing-body-academic` 行距 1.9；标题/段落间距微调，只动样式表与 `briefing-font-size.ts` 常量
- digest 与求职简报共用；Newspaper 主题不动

## 8. 规则增补（ui-styling §11）

本轮暴露的规则缺口：现有 10 条全是工程边界约束，无气质层规则。随实现补一条：

> **§11 学者夜话设计语言**
> **Why:** 诗意资产的扩散需要统一语汇，否则各页各自发挥会破坏宇宙一致性。
> - 夜色底（深褐 `#2a1f1a` / 画作）+ 米色衬线正文 + 琥珀 `#d97757` 只做点睛（术语、引力、激活态）。
> - 语录（quotes.ts）、引力/轨道（GravityField 语言）、画作（painting-manifest）是仅有的三个诗意资产；新增装饰语言前先在规则里登记。
> - 动效必须克制且可退化：位移动画必须有 `prefers-reduced-motion` 静态回退。
> - 例外的主色（如求职星蓝）只允许出现在「源标识性」元素上，需在设计文档中显式声明。

## 9. 边界行为清单（ui-styling §7，实现前冻结）

| # | 边界 | 行为 |
|---|------|------|
| 1 | stage key 跨源串味 / 未知 | 回退第一颗卫星激活（沿用 BriefingProgress 现有防御） |
| 2 | 生成失败 / 中断 | 星图定格，错误面板替换时组件卸载，无残留定时器/动画 |
| 3 | 窗口 resize / 窄窗口（≥520px） | SVG viewBox + 百分比定位纯 CSS 自适应；卫星标签不重叠井体 |
| 4 | 快速切换日期/来源 | 组件 key = `source + date`，强制重挂载，卫星状态归零 |
| 5 | `prefers-reduced-motion` | 退化为静态星图（已归位/进行中/未归位三态，无位移） |
| 6 | 写作页助手面板展开 | 语录带随编辑区同宽收缩，不换行溢出 |
| 7 | Anthropic 列表态 / 无文章 | 语录带只在阅读器容器内渲染，列表态不显示 |
| 8 | Newspaper 主题 | 星图/空态换纸白配色；语录带与渐变遮罩不渲染 |
| 9 | 语料为空（quotes.ts 异常） | Quote 组件现有 `if (!quote) return null` 防御，各落位不报错不留空框 |

## 10. 测试策略

- **单元/组件**：stage→卫星状态映射（含串味 key 回退、4 站/5 站坐标预设存在）；Quote briefing 变体渲染；空态组件双源文案
- **E2E**（沿用现有 briefing specs 扩展）：
  - 生成流程出现 `[data-testid="briefing-constellation"]`，stage 推进时对应 `briefing-progress-step-{key}` 卫星状态迁移
  - Academic / Newspaper 双主题星图均可见且配色正确
  - 求职源生成时 5 颗卫星 + 星蓝主色（断言井体 border-color）
  - digest/求职/Anthropic/写作四处语录带各一条断言（`quote-text` 存在且不在 md 文件内容中）
  - `reducedMotion: 'reduce'` 跑一次星图，断言无位移动画类名
- 验收核对：空数据、失败中断、跨主题、跨源切换、跨重启（无新持久化字段，回归现有 state 测试即可）

## 11. 交付顺序建议

1. BriefingVeil + 排版精修（纯样式，最快可见）
2. Quote briefing 变体 + 四处落位
3. BriefingEmptyState 双源
4. BriefingConstellation + BriefingProgress 改造（本轮核心）
5. ui-styling §11 规则增补 + E2E 补齐
