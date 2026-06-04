# 卷宗页视觉重设计

## 背景

学习主页（Home）有精美的艺术配图背景（`SurfaceBackground` + `SwapPaintingButton`），支持淡入淡出切换。但"卷宗"页（Profile）一直使用纯深棕色（`ink`）背景，视觉体验落差明显，与产品整体氛围不协调。

## 目标

让卷宗页与主页在视觉气质上保持一致：
1. 共用主页的艺术配图背景（含刷新按钮）
2. 用新的覆盖式面板布局替代当前的居中窄面板
3. 读取态和编辑态都保持背景可见，营造沉浸感

## 设计方案

### 方案 C：顶部覆盖式面板（已选定）

### 背景层

- `Profile.tsx` 挂载 `<SurfaceBackground surface="home" />`，与主页共用 `currentPaintings.home`
- 右上角放置 `SwapPaintingButton`，调用 `swapPainting('home')`
- 渐晕遮罩（`painting-vignette`）确保面板外边缘文字/按钮可读
- 无需新增 store 状态，复用现有 `home` surface

### 读取态（read view）

- 顶部覆盖式面板：
  - CSS: `bg-ink/72 backdrop-blur-md border border-slate/30 rounded-xl`
  - 位置：`absolute top-10 left-6 right-6`
  - 不撑满高度，下方大面积露出背景
- Header 区：「你」左对齐 + 「退出」右对齐，底部 `border-b border-slate/25`
- 内容区 `grid grid-cols-2 gap-x-7 gap-y-3.5`：
  | 位置 | 字段 | 样式 |
  |------|------|------|
  | 左上 | 代号 | `text-xl font-semibold text-ember` 突出显示 |
  | 右上 | 领域 | 普通正文 |
  | 全宽 | 侧写 | `col-span-2`，最长文本 |
  | 左下 | 审讯强度 | 普通正文 |
  | 右下 | 腔调 | 普通正文 |
- 标签：小写、muted 色、无衬线字体、字母间距加宽
- 「改写」按钮：面板下方居中，`absolute bottom-5`，ember 主色

### 编辑态（edit view）

- 同样的毛玻璃面板，但撑满上下：`absolute top-10 left-6 right-6 bottom-5`
- 内容区 `flex flex-col gap-3`，`overflow-y-auto`
- 表单字段：
  - 代号：`Input` 组件
  - 你是谁：`textarea`（多行，最小高度）
  - 领域：`Input` 组件
  - 审讯强度：三个 toggle button（追至墙角 / 互相试探 / 先暖暖场）
  - 腔调：三个 toggle button（静水深流 / 不紧不慢 / 即将沸腾）
- toggle 按钮 active 态：`bg-ember text-ink border-ember`
- 底部 actions：「落印」+「作废」并排

### 交互

| 动作 | 行为 |
|------|------|
| 点击「退出」 | `goto('home')` |
| 点击「改写」 | `setEditing(true)` |
| 点击刷新按钮 | `swapPainting('home')`，跨页面同步 |
| 点击「落印」 | 保存 profile + lastUsed，toast「已保存」，回读取态 |
| 点击「作废」 | `setEditing(false)`，放弃修改 |

## 不变项

- profile / lastUsed 的数据结构不变
- `patchProfile` / `patchLastUsed` 的调用不变
- 难度和温度值域不变
- 与主页共用同一套配图池，随机切换逻辑不变

## 影响范围

仅修改 `src/pages/Profile.tsx` 一个文件，无其他文件变更。
