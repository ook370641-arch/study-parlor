# 分组栏帮助按钮设计文档

## 背景与目标

新用户拿到应用后，不清楚「分组」的用途、如何操作、以及左侧推荐卡片与分组的关联。需要在分组栏新增一个常驻帮助入口，点击后弹出简明指南。

## 设计决策

### 按钮

- **位置**：分组标签栏最右侧，「+」新建分组按钮的右边
- **样式**：`i` 小写字母信息图标，圆角全圆 (`rounded-full`)，边框和文字透明度与「+」号保持一致
  - 默认：`border-parchment/15 text-parchment/30`
  - Hover：`border-parchment/30 text-parchment/50`
- **定位**：常驻，不随新用户状态变化（不自弹）

### 弹层面板

- **交互**：点击 `i` 按钮弹出，点击面板外部区域或按 `Escape` 关闭
- **定位**：面板锚定在按钮左下方，不与按钮重叠，避免遮挡分组栏操作
- **尺寸**：宽度约 `320px`，内容自适应高度
- **样式**：深色背景 (`bg-ink` / `#1e1612`)，细边框 (`border-parchment/20`)，圆角 (`rounded-xl` / `12px`)

### 面板内容

标题：`分组使用指南`

三条说明，带编号圆圈（ember 色系）：

1. **新主题默认保存** — "新创建的默认保存到「默认」分组中"
2. **分组与推荐的关系** — "新建分组可包含多个主题，左侧推荐会根据你的分组智能推荐学习主题"
3. **拖拽移入分组** — "长按主题卡片并拖动，可将其移入其他分组" + 下方放置拖拽引力场示意图

### 拖拽示意图

- 使用用户提供的引力场截图（拖拽时卡片周围出现分组节点的 UI）
- 放置位置：第 3 条文字下方，宽度填满面板内容区，高度自适应
- 图片路径：`src/assets/group-guide-drag-demo.png`
- 示意图上方可加一行小字说明："拖拽到目标分组附近即可"

## 架构

### 新增组件

```
src/components/GuidePopover.tsx   — 帮助弹层面板（纯展示 + 关闭逻辑）
```

### 修改文件

```
src/components/GroupRibbon.tsx    — 新增 i 按钮，管理 open/close 状态
```

### 组件接口

```tsx
// GuidePopover.tsx
interface GuidePopoverProps {
  open: boolean
  anchorRef: React.RefObject<HTMLElement>  // 用于定位面板
  onClose: () => void
}
```

### 定位策略

使用 `useEffect` 监听 `open` 变化，计算 `anchorRef.current.getBoundingClientRect()`，将面板绝对定位在按钮左下角。面板使用 `position: fixed` 或 `position: absolute`（相对于视口或最近定位祖先）。

点击外部检测：在 `open` 时挂载全局 `mousedown` 监听，若事件目标不在面板内且不在按钮上，触发 `onClose`。

## 与现有代码的关系

- `GroupRibbon.tsx` 已有 `creating` 状态管理新建分组的输入框，新增 `guideOpen` 状态与之并列
- 项目已有 `ConfirmDialog`、`PreStudyModal` 等独立弹层组件，本设计遵循同样模式
- 面板不依赖 store，状态 purely local to `GroupRibbon`

## 边界情况

- 弹层打开时点击「+」号或其他分组标签 → 弹层应关闭，分组正常切换/新建
- 窗口 resize 时 → 面板位置应重新计算（若已打开）或简单关闭
- 内容区域滚动时 → 面板跟随按钮或关闭（推荐关闭，避免定位漂移）

## 文件清单

| 文件 | 动作 | 说明 |
|------|------|------|
| `src/components/GuidePopover.tsx` | 新增 | 弹层面板组件 |
| `src/components/GroupRibbon.tsx` | 修改 | 新增按钮和状态 |
| `src/assets/group-guide-drag-demo.png` | 新增 | 拖拽示意图（用户提供） |

## 验收标准

- [ ] 分组栏「+」号右侧出现 `i` 按钮，hover 有反馈
- [ ] 点击 `i` 按钮弹出指南面板，面板定位在按钮附近不遮挡分组栏
- [ ] 面板内显示三条带编号说明，第 3 条下方有拖拽示意图
- [ ] 点击面板外部或按 ESC 面板关闭
- [ ] 面板打开时不阻断其他分组栏操作（点击分组标签/新建分组会自动关闭面板并执行操作）
