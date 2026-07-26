# 求职&写作助手 UI 统一设计

**日期**: 2026-07-26 | **状态**: 设计中

## 背景

三个关联的 UI 问题：
1. 写作助手关闭后只剩 24px 竖签，太隐蔽
2. 求职旁注与写作助手样式不统一，且换画按钮不跟随面板
3. 求职页文字宽度偏窄（768px vs 博客的流式宽屏）

## 一、写作助手重新打开入口

### 现状
`WritingAssistantPanel` 关闭后渲染 24px 竖签 "AI 助手 ▸"，紧贴右侧边缘，用户关闭后难以找到。

### 目标
折叠态使用 `ArticleDivider` 的 `◀` 箭头按钮作为重开入口，与博客导读折叠态一致。

### 改动
**文件**: `src/components/writing-assistant/WritingAssistantPanel.tsx`

- 删除 `!open` 分支（24px 竖签）
- `open=false` 时：仅渲染 `ArticleDivider`（`collapsed=true`），点击 `◀` → `setOpen(true)`
- `open=true` 时：现有逻辑不变（`ArticleDivider` + 面板内容）
- 拖拽收缩至 <40px 时 → `setOpen(false)`（保持现有行为）

### 出口声明
- 展开入口：`ArticleDivider` 上的 `◀` 按钮（`data-testid="article-assistant-divider-toggle"`）
- 关闭入口：面板标题栏 `✕` 按钮（`data-testid="writing-assistant-close-btn"`）
- 拖拽收缩 <40px 自动折叠

## 二、求职旁注 → AI求职助手

### 现状
求职页使用 `ArticleAssistantPanel`（`showGuide={false}`），只有浮动聊天窗 + "旁注"竖签，与写作助手的嵌入式面板风格不一致。

### 目标
新建 `JobAssistantPanel`，结构抄 `WritingAssistantPanel`，嵌入侧边栏风格，标题 "AI 求职助手"。

### 改动

**新建**: `src/components/job-briefing/JobAssistantPanel.tsx`
- 复制 `WritingAssistantPanel` 结构
- 标题改为 "AI 求职助手"
- 复用同一个 `ArticleDivider` 拖拽/折叠逻辑
- 内容区使用现有的 `assistantSession`（ChatWindow + GuideSidebar 或仅 ChatWindow）
- 折叠态：仅渲染 `ArticleDivider`（`collapsed=true`），与第一部分一致
- 展开态：`ArticleDivider` + 面板内容

**修改**: `src/pages/Briefing.tsx`
- 求职分支的 `ArticleAssistantPanel` 替换为 `JobAssistantPanel`
- 换画按钮：当前 `fixed top-6 right-4` 改为相对内容区定位，面板展开时按钮同步左移
  - 将求职页的 `SwapPaintingButton` 从 `fixed` 改为放在 `main` 内的 `absolute right-4`，与写作页一致（`main` 自然被面板挤压时按钮跟随移动）

### 出口声明
- 展开入口：`ArticleDivider` 上的 `◀` 按钮（`data-testid="article-assistant-divider-toggle"`）
- 关闭入口：面板标题栏 `✕` 按钮
- 面板整体：`data-testid="job-assistant-panel"`

## 三、求职页文字宽度

### 现状
`JobBriefingRenderer` 使用 `max-w-3xl mx-auto`（768px），内容区偏窄。

### 目标
对齐博客阅读器宽度，提升阅读体验。

### 改动
**文件**: `src/components/job-briefing/JobBriefingRenderer.tsx`

- 外层容器：`max-w-3xl mx-auto` → `w-[95%] max-w-[1600px] min-w-[520px] mx-auto`
- 同时检查 `Briefing.tsx` 中求职 `main` 的 padding 是否需要同步调整（当前 `px-6`）

**文件**: `src/pages/Briefing.tsx`
- 求职 `main` 的 `max-w-3xl mx-auto`（progress/loading 状态）同步改为博客宽度
- 求职 `BriefingMetaLine` 行（`max-w-3xl mx-auto`，line 367）同步调整

## 涉及文件清单

| 文件 | 操作 |
|------|------|
| `src/components/writing-assistant/WritingAssistantPanel.tsx` | 修改：折叠态改用 ArticleDivider |
| `src/components/job-briefing/JobAssistantPanel.tsx` | **新建**：抄 WritingAssistantPanel |
| `src/components/job-briefing/JobBriefingRenderer.tsx` | 修改：宽度 |
| `src/pages/Briefing.tsx` | 修改：替换面板、换画按钮定位、宽度 |
| `src/components/job-briefing/index.ts` | 修改：导出新组件 |

## 不需要改动

- `assistantSession` store / 会话逻辑：保持不变
- `ArticleAssistantPanel`：博客页继续使用，不需要改
- `ChatWindow` / `GuideSidebar`：复用现有组件
- `ArticleDivider`：复用现有组件

## 边界清单

- [ ] 写作助手：折叠→展开→关闭→再展开，每次动画/布局正常
- [ ] 求职助手：面板展开/折叠时换画按钮位置跟随
- [ ] 求职助手：面板展开时主内容区不被遮挡
- [ ] 求职助手：空内容（无 jobResult）时不渲染面板
- [ ] 求职页宽度：在窄窗口（<600px）下不溢出，min-w 生效
- [ ] 报纸主题（newspaper）：求职助手和写作助手均只在 academic 下显示
- [ ] Esc 关闭 / 点击外部关闭面板
