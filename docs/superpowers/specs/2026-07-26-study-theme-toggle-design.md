# 学习页版式切换设计

> 状态：待实现 | 日期：2026-07-26

## 概述

为"点亮灯火"（C 页面：Home / Study / Profile / Settings / Extension）新增版式切换功能，与夜航简报已有的学术/报纸双版式共享同一开关。

**核心约束：版式切换只改变 UI 显示效果（颜色、背景），不改变布局结构，不改变交互逻辑。报纸模式下换画按钮隐藏。**

---

## 范围

| 页面 | 文件 | 改动类型 |
|---|---|---|
| Home | `src/pages/Home.tsx` | 容器/卡片/按钮配色 + 引入控件组 |
| Study | `src/pages/Study.tsx` | Header/气泡/输入区配色 + 引入控件组 |
| Profile | `src/pages/Profile.tsx` | 面板/表单配色 + 引入控件组 |
| Settings | `src/pages/Settings.tsx` | 面板/表单配色 + 引入控件组 |
| Extension | `src/pages/Extension.tsx` | 面板/侧栏配色 + 引入控件组 |

**不含：** Cover（封面页）、Briefing（已有独立版式切换，无需改动）

---

## 架构

### 状态

复用现有 `briefingTheme: 'academic' | 'newspaper'`（`src/store/index.ts:119`，持久化 `state.json`）。C 页面读取同一字段，与简报页共享同一开关。

- 无需新增 store 字段
- 无需新增 action

### 新组件：`StudyControlsGroup`

```tsx
// src/components/StudyControlsGroup.tsx
// 渲染：换画按钮（仅学术模式） + 版式切换按钮
// Props: surface, className?, data-testid?
// 两个按钮均为 rounded-full 圆形图标，描边色随主题自适应
```

- 换画按钮：复用 `SwapPaintingButton`，仅 `theme === 'academic'` 时渲染
- 版式切换：新按钮，点击切换 `briefingTheme`，图标与 `BriefingThemeToggle` 一致（📖/📰）
- 布局：`flex items-center gap-1`，与简报右上角控件风格一致

### 版式切换按钮

与 `BriefingThemeToggle` 相同逻辑，提取为独立可复用按钮：

- `academic` → 显示报纸图标（📰），点击切换到 `newspaper`
- `newspaper` → 显示开卷图标（📖），点击切换到 `academic`
- 样式：`w-7 h-7 rounded-full border`，描边色随主题自适应

---

## 页面适配

每个页面的适配模式统一为：

```
const isAcademic = theme !== 'newspaper'
```

然后将硬编码深色类名替换为条件表达式。

### Home 页

| 区域 | 学术（当前） | 报纸 |
|---|---|---|
| 页面容器 | `p-8` 深褐底 | `bg-white` |
| SurfaceBackground | 渲染 | 隐藏 |
| 右上按钮组 | 新增：换画 + 版式切换，parchment 描边 | 仅版式切换，深灰描边 |
| 问候语 | `text-parchment/60` | `text-[#555]` |
| 未保存卡片 | `bg-ink/70 border-slate/40` | `bg-white border-[#1a1a1a]/15` |
| 新学习按钮 | ember 琥珀色 | 黑底白字 |
| 推荐卡片 | 毛玻璃 ink | 白底灰框 |
| 学习库区域 | `text-parchment/40` | `text-[#555]` |
| Quote | 自动读 `briefingTheme`（已支持） | — |

子组件适配：
- `StudyLibrary`：卡片行背景/边框切换
- `GroupRecCard` / `WildCardRecCard`：卡片底色切换
- `StrategyToggle`：按钮描边色切换
- `BackToCover`：文字色切换

### Study 页

| 区域 | 学术（当前） | 报纸 |
|---|---|---|
| 页面容器 | 深褐底 | `bg-[#fafaf8]` |
| SurfaceBackground | 渲染 | 隐藏 |
| Header | `bg-ink/70 backdrop-blur border-slate/40` | `bg-white border-[#1a1a1a]/10` |
| 退席按钮 | `text-parchment/70` | `text-[#555]` |
| 话题标题 | 继承 parchment | `text-[#1a1a1a]` |
| 模式信息 | `text-parchment/60` | `text-[#555]` |
| Header 按钮组 | 新增：换画 + 版式切换 | 仅版式切换 |
| 用户气泡 | 半透明 ember | 黑底白字 |
| AI 气泡 | 毛玻璃 ink | 白底灰框 |
| 输入区 | `bg-ink/70 border-slate/40` | `bg-white border-[#1a1a1a]/10` |
| 错误横幅 | `bg-wine/30 border-wine` | `bg-red-50 border-red-200` |
| 归档横幅 | `bg-ember/10 border-ember/40` | `bg-amber-50 border-amber-200` |
| 思考中动画 | StarOrbit `tone="night"` | StarOrbit `tone="paper"`（已支持） |
| 流式光标 | `bg-ember/70` | `bg-[#1a1a1a]` |
| Quote | 自动读 `briefingTheme` | — |

子组件适配：
- `ChatBubble`：新增 `theme` prop，切换气泡配色
- `ChatInput`：新增 `theme` prop，切换输入框/发送按钮配色
- `ExternalMaterialsCard`：卡片配色切换

### Profile 页

| 区域 | 学术（当前） | 报纸 |
|---|---|---|
| SurfaceBackground | 渲染 | 隐藏 |
| 右上按钮组 | 新增：换画 + 版式切换 | 仅版式切换 |
| 毛玻璃面板 | `bg-ink/72 border-slate/30` | `bg-white border-[#1a1a1a]/12` |
| 标题分隔线 | `border-slate/25` | `border-[#1a1a1a]/10` |
| 标签文字 | `text-parchment/50` | `text-[#777]` |
| 值文字 | `text-parchment` / `text-ember` | `text-[#1a1a1a]` / `text-[#8a3a3a]` |
| 退出按钮 | `text-parchment/70` | `text-[#555]` |
| 编辑态输入框 | `bg-ink/50 border-slate/40` | `bg-white border-[#1a1a1a]/15` |
| 难度/温度按钮 | ember/ink 配色 | 黑白配色 |

### Settings 页

| 区域 | 学术（当前） | 报纸 |
|---|---|---|
| SurfaceBackground | 渲染 | 隐藏 |
| 右上按钮组 | 新增：换画 + 版式切换 | 仅版式切换 |
| 毛玻璃面板 | `bg-ink/72 border-slate/30` | `bg-white border-[#1a1a1a]/12` |
| 标题分隔线 | `border-slate/25` | `border-[#1a1a1a]/10` |
| 配置区卡片 | `bg-parchment/5 border-slate/20` | `bg-[#f5f5f0] border-[#1a1a1a]/10` |
| 标题 | `text-ember` | `text-[#8a3a3a]` |
| 标签 | `text-parchment/60` | `text-[#777]` |
| 输入框 | `bg-ink/50 border-slate/40` | `bg-white border-[#1a1a1a]/15` |
| 错误提示 | `bg-wine/10 border-wine/40` | `bg-red-50 border-red-200` |
| 成功提示 | `text-ember` | `text-green-700` |
| 返回按钮 | `text-parchment/70` | `text-[#555]` |

### Extension 页

| 区域 | 学术（当前） | 报纸 |
|---|---|---|
| SurfaceBackground | 渲染 | 隐藏 |
| 右上按钮组 | 新增：换画 + 版式切换 | 仅版式切换 |
| 毛玻璃面板 | `bg-ink/72 border-slate/30` | `bg-white border-[#1a1a1a]/12` |
| 标题分隔线 | `border-slate/25` | `border-[#1a1a1a]/10` |
| 侧栏按钮 | `bg-ember/10 border-ember/30` / `bg-slate/10` | 黑白配色 |
| 详情卡片 | `bg-parchment/5 border-slate/20` | `bg-[#f5f5f0] border-[#1a1a1a]/10` |
| 代码块 | `bg-ink` | `bg-[#f0f0ea]` |
| 返回按钮 | `text-parchment/70` | `text-[#555]` |

---

## 全局 CSS

在 `globals.css` 中新增报纸版式覆盖（或使用 CSS 变量方案）：

- `.swap-btn` 新增 `.swap-btn-newspaper` 变体：深灰描边/黑色文字
- `.painting-vignette` 在报纸模式下不渲染（通过 SurfaceBackground 条件渲染控制）

优先使用 Tailwind 条件类名（`isAcademic ? '...' : '...'`）而非新增 CSS 类，保持改动局部化。

---

## 不做的事

- ❌ 不改变任何页面的 DOM 结构
- ❌ 不改变任何事件处理逻辑
- ❌ 不新增 store 字段
- ❌ 不改变 Cover 页（封面）
- ❌ 不改变 Briefing 页（已有独立版式切换）
- ❌ 不改变 StarOrbit / Quote / CandlelightLayer（已支持 theme）

---

## UI 出口

- **版式切换按钮**：每个 C 页面顶部区域，`rounded-full` 圆形图标按钮，`title` 提示"切换报纸版式"/"切换学术版式"
- **换画按钮**：仅学术模式显示，行为不变
- 两个按钮均有 `data-testid`

---

## 测试

| 测试类型 | 内容 |
|---|---|
| Store | `briefingTheme` 持久化往返（已有） |
| 组件 | `StudyControlsGroup` 渲染两种模式、点击切换 |
| 页面 | Home/Study 报纸版式 snapshot 或关键元素断言 |
| E2E | Study 页面版式切换 + 气泡颜色变化 |

---

## 配色速查

| 语义 | 学术（深色） | 报纸（浅色） |
|---|---|---|
| 页面底 | `#2a1f1a` / `#1c130d` | `#fafaf8` / `#ffffff` |
| 主文字 | `parchment` / `#e8d5b7` | `#1a1a1a` |
| 次文字 | `text-parchment/50-70` | `#555` / `#777` |
| 边框 | `border-slate/20-40` | `border-[#1a1a1a]/10-15` |
| 卡片底 | `bg-ink/50-70` | `bg-white` |
| 强调色 | `text-ember` / `#d97757` | `#8a3a3a`（暗红） |
| 用户气泡 | 半透明 ember | 黑底白字 |
| AI 气泡 | 半透明 ink | 白底灰框 |
| 错误 | wine 系 | red 系 |
| 成功/归档 | ember 系 | amber 系 |
