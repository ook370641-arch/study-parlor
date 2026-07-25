---
description: "Use when building React components, pages, Tailwind styles, drawers, animations, or markdown rendering."
paths:
  - "src/components/**"
  - "src/pages/**"
  - "tailwind.config.ts"
---

# UI / 样式规则

## 1. 不要为了单一视觉主题引入不可控的复杂度

**Why:** 复杂的视觉方案会引入事件、坐标、z-index、resize 等边界 bug，收缩成本高。

- 先实现最小可用路径，再视真实反馈增加复杂度。
- 单一功能只保留一种可见协议/约定。
- 复杂视觉方案必须附带可测试的边界行为清单。
- Source: ui-styling.md §1

## 2. 页面所有状态必须共享同一套顶部 Chrome

**Why:** Header 按钮在不同状态下来回增减会导致闪现、位置变化和用户迷失。

- 顶部导航、字号控制、主题切换、返回按钮在 loading/error/success 三种状态下都可见且位置固定。
- 不要把装饰性按钮放到 Header 里，避免不同主题/状态下 Header 高度变化。
- 报错时仍保留可操作入口（重试、往期、切换主题）。
- Source: ui-styling.md §2

## 3. 状态指示器只应暴露异常

**Why:** 把正常细节堆给用户会造成信息噪音和界面拥挤。

- 正常状态尽量隐式，不展示 ✓ 大军；失败状态显式且可交互。
- 文案和图标要经过一轮“信息噪音”审查。
- 对 controls 使用不言自明的符号或加 `title` 提示。
- Source: ui-styling.md §3

## 4. 复杂交互必须同步处理布局、层级与关闭路径

**Why:** 抽屉、弹窗、拖拽会遮挡内容或相互覆盖，缺少快速恢复路径会让用户卡住。

- 抽屉展开时给底层内容容器增加等宽 padding 或调整布局，使文字/气泡保持在可见区域。
- 使用透明点击捕获层或 `pointerdown` 监听实现点击外部关闭；提供关闭按钮和 Esc 快捷键。
- 明确抽屉层级：高于普通内容，低于归档弹窗等真正模态层。
- 拖拽/动画必须处理 resize、z-index、事件捕获的边界。
- Source: ui-styling.md §4

## 5. 生成的 Markdown 中的链接必须解析为可点击外链

**Why:** LLM 常输出裸 URL，默认 markdown 组件不会自动把它们变成外链。

- 对 LLM 输出的引用区做专门的链接解析，不能只靠默认 markdown 组件。
- 同时支持 `[text](url)` 和裸 `https://`。
- 所有外链必须带 `rel="noopener noreferrer"` 和 `target="_blank"`。
- Source: ui-styling.md §5

## 6. 个性化设置全局统一持久化

**Why:** 每页单独维护字号/主题会让用户设置无法共享。

- 在阅读器、摘要面板等后续功能中复用已有的字号枚举与常量。
- 不要把同一概念复制成多个 state key。
- 持久化字段命名一致，避免 `fontSize` / `briefingFontSize` / `readerFontSize` 同时存在。
- Source: ui-styling.md §6

## 7. 动画/布局竞争必须提供可测试的边界行为清单

**Why:** 只验证理想尺寸和正常路径会把动画/布局 bug 留到上线后。

- 复杂动画/交互在实现前列出边界行为清单：窗口 resize、快速切换、取消/中断、空数据、错误状态。
- 为关键交互元素添加 `data-testid`。
- 用 E2E 或组件测试覆盖边界行为，而不是仅靠手动验证。
- Source: ui-styling.md §7

## 8. 全局 Chrome 必须与内容状态解耦

**Why:** 把 Drawer、背景层、换画按钮等全局元素放进某个内容分支的条件渲染，会导致空态 / 加载中 / 错误 / 其他子源下这些元素不存在。

- Header、Drawer、背景插画层、换画按钮等全局 Chrome 必须始终挂载，不受 `result`、`loading`、`error` 或当前子源影响。
- 它们的显隐只应通过自身状态（如 `open`、`visible`）控制，不能通过父级内容分支是否存在来控制。
- 新增状态分支时，必须验证全局 Chrome 是否仍然挂载。
- Source: ui-styling.md §8

## 9. 新增页面模式/子源时必须同步检查页面级元素

**Why:** 新增 mode/tab/source 时最容易只改主内容区，漏掉背景、按钮、drawer 等页面级元素。

- 新增 source、tab、mode 后，按 checklist 检查：背景插画、换画按钮、Header 按钮、Drawer、字号控制、主题切换是否都覆盖新模式。
- 不要对页面级元素使用 `mode === 'old'` 这类排他条件，除非新模式明确不需要该元素。
- 优先让页面级元素对所有模式生效，再通过局部样式微调。
- Source: ui-styling.md §9

## 10. 组件文件只导出组件（React Fast Refresh 约束）

**Why:** 组件文件导出非组件（helper、常量）会让 Fast Refresh 无法局部热替换，hmr invalidate 沿 import 链推到 App 整树重挂载——组件状态全丢，并触发启动看门狗误报。

- 页面/组件文件只 export 组件；helper、常量、类型移到 `src/lib/` 下的工具文件。
- 仅本文件使用的 helper 不要 export，模块私有函数不影响 Fast Refresh。
- vite 日志出现 `hmr invalidate ... Could not Fast Refresh` 时，按消息中的导出名定位并移出。
- Source: docs/superpowers/plans/2026-07-10-fix-dev-hang-and-orphan-processes.md Task 12

## Example: global chrome decoupling

- ❌ `BriefingHistoryDrawer` 放在 `parsed && result` 分支内，空态/Anthropic 源下点击「往期」无响应。
- ✅ `BriefingHistoryDrawer` 作为页面固定元素渲染，`currentDate` 无结果时回退到 `today`。

## 11. 学者夜话设计语言

**Why:** 诗意资产的扩散需要统一语汇，否则各页各自发挥会破坏宇宙一致性。

- 夜色底（深褐 `#2a1f1a` / 画作）+ 米色衬线正文 + 琥珀 `#d97757` 只做点睛（术语、引力、激活态）。
- 语录（`quotes.ts`）、引力/轨道（GravityField 语言）、画作（painting-manifest）是仅有的三个诗意资产；新增装饰语言前先在本规则登记。
- 动效必须克制且可退化：位移动画必须有 `prefers-reduced-motion` 静态回退。
- 例外主色（如求职星蓝 `#7fa8d9`）只允许出现在「源标识性」元素上，且需在设计文档中显式声明。
- 重量/归位语法（`motion-presets` 双弹簧：SPRING_SETTLE / SPRING_SLIDE）登记为引力/轨道语言的触觉层；换画、归位、日期选中、面板开合一律引用同一常量，不得自造曲线。过冲硬上限 scale ≤4% / 位移 ≤8px。
- 光的语言两个层级：烛光（点照明，CandlelightLayer，screen 混合 alpha ≤0.20）与聚焦呼吸（区照明，data-focus-zone 三区，熄灭仅降透明度 ≥0.38）。求职星蓝烛光为例外主色的合法用法（源标识性元素）。
- 检定动效协议：凡「世界在做决定」的时刻（归档/随机控件），先有可见的不确定相（光子互逐/CRT 颗粒），再以运动语言收束成败（急停坠落 vs 漂移褪冷）；不设人为最短时长，绑定真实异步时长。
- 内化脊柱是引力/轨道语汇的衍生 motif；「读完」「内化」等文档记忆只从真实用户行为（滚动、标注）推导，不伪造进度。
- Source: docs/superpowers/specs/2026-07-23-briefing-ui-design.md
