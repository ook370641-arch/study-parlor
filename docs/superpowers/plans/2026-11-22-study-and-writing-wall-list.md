---
status: historical
---

# 学习页与文章／仓库列表化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付主题／session 粒度正确的学习列表、分组内推荐、学习字号与浮层修复，以及无封面生成入口的文章／仓库列表视图。

**Architecture:** 学习域使用独立 `StudyTopicRow` 和固定五列 session 操作，不与写作文件行合并。文章／仓库在 `WritingWall` 内切换卡片和列表，只新增视图状态；现有 IPC、文件格式、生成任务和封面存储不变。

**Tech Stack:** React 18、TypeScript、Zustand、Tailwind CSS、Vitest、Testing Library、electron-vite。

**Spec:** `docs/superpowers/specs/2026-11-22-study-and-writing-wall-list-design.md`

执行结果：本轮按 Inline Execution 完成，学习与写作实现、受影响单元测试、生产构建和文档校验均在本计划收尾阶段验证。

## Global Constraints

- 主题行只含打开、续谈、重命名、归档；不显示对话、复习按钮或待复习／已复习状态。
- session 操作固定为报告｜图表｜寓言｜复习／复检记录｜注销，五列始终对齐。
- 文章／仓库列表不显示封面生成；卡片封面行为不变。
- 保留卫星拖拽、后台归档、快照保存、现有学习文件与 IPC。
- 不运行会启动 Electron 的 E2E；门禁为受影响 Vitest、`npx electron-vite build`、`npm run docs:check`。

---

### Task 1: 分组推荐与准备流程目标组

**Files:**
- Modify: `src/lib/study-wall.ts`
- Modify: `src/store/index.ts`
- Modify: `src/components/PreStudyModal.tsx`
- Test: `tests/study-wall.test.ts`
- Test: `tests/briefing-source-study.test.tsx`

**Interfaces:**
- Produces: `buildStudyWallGroups(...)` 返回每组推荐与主题；`openPreStudy` 接收可选 `groupId`。

- [ ] **Step 1: 写失败测试**

```ts
expect(buildStudyWallGroups(groups, library, null, '', wildcard, inspirations)[0].recommendations)
  .toEqual([{ kind: 'wildcard', groupId: 'default' }])
expect(useStore.getState().preStudyArgs).toMatchObject({ groupId: 'g2' })
```

- [ ] **Step 2: 运行并确认失败**

Run: `npx vitest run tests/study-wall.test.ts tests/briefing-source-study.test.tsx`

- [ ] **Step 3: 最小实现**

按当前组放置分组推荐；意外之径在全部视图进入默认组、单组视图进入当前组。`PreStudyModal` 的 `selectedGroupId` 初始值优先读取 `args.groupId`，其余准备流程不变。

- [ ] **Step 4: 重跑同一测试并确认通过**

Run: `npx vitest run tests/study-wall.test.ts tests/briefing-source-study.test.tsx`

### Task 2: 学习主题行与固定五列 session 操作

**Files:**
- Create: `src/components/study/StudyTopicRow.tsx`
- Delete: `src/components/study/StudyTopicCard.tsx`
- Modify: `src/lib/study-navigation.ts`
- Modify: `src/components/study/StudyTopicBoard.tsx`
- Test: `tests/study-topic-row.test.tsx`
- Test: `tests/study-navigation.test.ts`

**Interfaces:**
- Consumes: 现有 `useStudyTopicActions`、`generateStudyDiagram`、`generateStudyFable`、`deleteArchivedSession`。
- Produces: `openStudyTopicFromTree(dirName, sessionNumber?, tab?)`。

- [ ] **Step 1: 写失败测试**

```tsx
expect(screen.queryByText('待复习')).not.toBeInTheDocument()
expect(screen.queryByText('对话')).not.toBeInTheDocument()
expect(screen.getByTestId('topic-continue-button')).toBeInTheDocument()
expect(screen.queryByTestId('topic-review-button')).not.toBeInTheDocument()
expect(screen.getByTestId('session-review-button-2')).toHaveTextContent('复习')
expect(screen.getByTestId('session-review-button-1')).toHaveTextContent('复检记录')
```

- [ ] **Step 2: 运行并确认失败**

Run: `npx vitest run tests/study-topic-row.test.tsx tests/study-navigation.test.ts`

- [ ] **Step 3: 最小实现**

主题行复用现有续谈、重命名、归档和卫星拖拽。session 行使用 `grid-template-columns: 72px 96px 96px 96px 28px`，所有状态渲染同样五列；已有产物打开对应 tab，缺失产物沿用现有生成任务。未复习显示「复习」并经 `ReviewFlash`，已复习显示「复检记录」。主题工作区页头复习改为当前选中 session 的 `ReviewFlash`。

- [ ] **Step 4: 重跑同一测试并确认通过**

Run: `npx vitest run tests/study-topic-row.test.tsx tests/study-navigation.test.ts`

### Task 3: 学习墙装配、字号、来源对齐与 Portal

**Files:**
- Modify: `src/components/study/StudyWall.tsx`
- Modify: `src/components/StudyControlsGroup.tsx`
- Modify: `src/components/BriefingSourceSidebar.tsx`
- Modify: `src/components/BriefingListColumn.tsx`
- Modify: `src/components/study/StudySourcePanel.tsx`
- Modify: `src/components/GuidePopover.tsx`
- Modify: `src/components/study/StudyTopicBoard.tsx`
- Test: `tests/study-wall-view.test.tsx`
- Test: `tests/study-controls-group.test.tsx`
- Test: `tests/briefing-sidebar.test.tsx`

**Interfaces:**
- Consumes: Task 1 分组数据与 Task 2 主题行；现有 `studyFontSize`。

- [ ] **Step 1: 写失败测试**

```tsx
expect(screen.queryByText('新主题推荐')).not.toBeInTheDocument()
expect(screen.getByTestId('study-group-list-default')).toBeInTheDocument()
expect(screen.queryByTestId('study-controls-theme-toggle')).not.toBeInTheDocument()
fireEvent.click(screen.getByTestId('study-controls-font-size-increase'))
expect(useStore.getState().studyFontSize).toBe('xl')
```

- [ ] **Step 2: 运行并确认失败**

Run: `npx vitest run tests/study-wall-view.test.tsx tests/study-controls-group.test.tsx tests/briefing-sidebar.test.tsx`

- [ ] **Step 3: 最小实现**

将推荐渲染进各分组开头，移除学习 `AlbumGrid`。学习墙使用学习字号控制；学习第二列和主题正文消费派生 CSS 变量。来源导航固定 20px 图标槽并预留选中边框。`GuidePopover` 使用 `createPortal`，保留下方定位、视口收敛和 Esc／外点／resize 关闭。

- [ ] **Step 4: 重跑同一测试并确认通过**

Run: `npx vitest run tests/study-wall-view.test.tsx tests/study-controls-group.test.tsx tests/briefing-sidebar.test.tsx`

### Task 4: 文章／仓库列表视图与独立持久化

**Files:**
- Modify: `src/types/index.ts`
- Modify: `electron/ipc/state.ts`
- Modify: `src/store/index.ts`
- Modify: `src/components/writing/WritingWall.tsx`
- Test: `tests/writing-wall-view.test.tsx`
- Test: `tests/writing-album-wall.test.ts`

**Interfaces:**
- Produces: `writingWallViewMode: Record<WritingRoot, 'card' | 'list'>` 和 `setWritingWallViewMode(root, mode)`。

- [ ] **Step 1: 写失败测试**

```tsx
expect(screen.getByTestId('writing-wall-card-writing/example.md')).toBeInTheDocument()
fireEvent.click(screen.getByTestId('writing-wall-list-view-writing'))
expect(screen.getByTestId('writing-wall-row-writing/example.md')).toBeInTheDocument()
expect(screen.queryByTestId('writing-wall-cover-writing/example.md')).not.toBeInTheDocument()
fireEvent.click(screen.getByTestId('writing-wall-card-view-writing'))
expect(screen.getByTestId('writing-wall-cover-writing/example.md')).toBeInTheDocument()
```

- [ ] **Step 2: 运行并确认失败**

Run: `npx vitest run tests/writing-wall-view.test.tsx tests/writing-album-wall.test.ts`

- [ ] **Step 3: 最小实现**

默认卡片，非法持久化值回退卡片。列表显示现有封面缩略图、标题、路径、字数／类型、修改时间和删除；不渲染 `CoverGenerator`。切换只写对应 root，卡片分支保持原样。

- [ ] **Step 4: 重跑同一测试并确认通过**

Run: `npx vitest run tests/writing-wall-view.test.tsx tests/writing-album-wall.test.ts`

### Task 5: 回归、构建与文档收尾

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/README.md`
- Modify: `docs/superpowers/specs/2026-11-17-learning-source-restructure-design.md`
- Modify: `docs/superpowers/specs/2026-11-14-writing-album-wall-design.md`
- Modify: `e2e/source-map.json` only if a new spec is added

- [ ] **Step 1: 运行全部受影响单元测试**

Run: `npx vitest run tests/study-wall.test.ts tests/study-wall-view.test.tsx tests/study-topic-row.test.tsx tests/study-navigation.test.ts tests/study-controls-group.test.tsx tests/study-source-panel.test.tsx tests/study-topic-board.test.tsx tests/study-gravity-drag.test.tsx tests/briefing-sidebar.test.tsx tests/briefing-source-study.test.tsx tests/writing-wall-view.test.tsx tests/writing-album-wall.test.ts`

- [ ] **Step 2: 构建与文档检查**

Run: `npx electron-vite build`

Run: `npm run docs:check`

- [ ] **Step 3: 检查变更范围**

Run: `git diff --check`

Run: `git status --short`

Confirm: 无视觉稿临时文件、无 `state.json`、无学习库文件、无未要求的依赖变更。

- [ ] **Step 4: 提交实现**

Run: `git commit -m "feat: add study and writing list walls"`
