# 星辰宇宙交互设计 · 实施计划（下）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 Phase 3（数据展示：D1/D3/D2/B6/C2）和 Phase 4（边缘场景：E1/C3/D4/F1/F2）的星辰宇宙交互动效

**Architecture:** 复用 Part 1 已创建的 `StarParticle` 和 `StarOrbit` 组件。Phase 3 聚焦列表/卡片/Tabs/Toast 的微交互，Phase 4 处理空状态、加载态、报告展示等特殊场景。

**Tech Stack:** React 18 + Tailwind CSS + CSS keyframes（与 Part 1 一致）

**前置依赖：** 必须先完成 Part 1 的 Task 0（StarParticle + StarOrbit），否则本文件所有任务都会失败。

---

## Phase 3：数据展示（中频 · 每天数次）

### Task 9: D1 · StudyLibrary 折叠面板展开「星帘垂落」

**Files:**
- Modify: `src/components/StudyLibrary.tsx`
- Modify: `src/styles/globals.css`

展开时 max-height 过渡 + 顶部星点闪烁，收起时仅 max-height 回缩。

```tsx
import { useState } from 'react';
import { StarParticle } from './StarParticle';

// 在折叠面板触发展开的位置：
const [expandSparkle, setExpandSparkle] = useState(false);

const handleToggle = (groupId: string) => {
  const isExpanding = !expandedGroups.has(groupId);
  if (isExpanding) {
    setExpandSparkle(true);
    setTimeout(() => setExpandSparkle(false), 350);
  }
  // 原有 toggle 逻辑
};

// 面板头部区域：
<div className="relative">
  {expandSparkle && (
    <StarParticle
      count={2}
      origin="center"
      direction="up"
      color="parchment"
      duration={300}
    />
  )}
  <button onClick={() => handleToggle(groupId)}>
    {/* 原有按钮内容 */}
  </button>
</div>

// 面板内容区（已有展开/收起逻辑），确保 className 包含：
<div className={`overflow-hidden transition-all duration-300 ease-out ${isExpanded ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'}`}>
  {/* 原有内容 */}
</div>
```

- [ ] **Step 1:** 在 `StudyLibrary.tsx` 中找到折叠面板 toggle 逻辑
- [ ] **Step 2:** 在展开时（非收起）触发 `expandSparkle`
- [ ] **Step 3:** 确保内容区有 `max-height` + `opacity` transition（300ms ease-out）
- [ ] **Step 4:** 验证点击展开面板时顶部有星点闪烁，收起时无星点

### Task 10: D3 · GroupRibbon Tab 切换「星光滑轨」

**Files:**
- Modify: `src/components/GroupRibbon.tsx`

活跃标签 pill 背景有 2 颗小星点跟随滑动，内容区域 cross-fade。

```tsx
// 在 GroupRibbon 渲染逻辑中：
<div className="relative flex gap-1">
  {groups.map((group, i) => (
    <button
      key={group.id}
      ref={(el) => { tabRefs.current[i] = el; }}
      onClick={() => setActiveGroup(group.id)}
      className={`relative px-3 py-1.5 rounded-full text-sm transition-colors ${
        activeGroup === group.id
          ? 'bg-parchment/10 text-parchment'
          : 'text-parchment/40 hover:text-parchment/60'
      }`}
    >
      {group.name}
    </button>
  ))}

  {/* 星点指示器 - 跟随活跃标签 */}
  {activeIndex >= 0 && tabRefs.current[activeIndex] && (
    <div
      className="absolute bottom-0 h-0.5 transition-all duration-250 ease-out pointer-events-none"
      style={{
        left: tabRefs.current[activeIndex].offsetLeft + tabRefs.current[activeIndex].offsetWidth * 0.3,
        width: tabRefs.current[activeIndex].offsetWidth * 0.4,
      }}
    >
      <div className="absolute left-0 top-0 w-1 h-1 rounded-full bg-ember/70 animate-pulse" />
      <div className="absolute right-0 top-0 w-1 h-1 rounded-full bg-parchment/50 animate-pulse" style={{ animationDelay: '150ms' }} />
    </div>
  )}
</div>

// 内容区域 cross-fade：
<div className={`tab-content ${contentKey}`}>
  {/* 内容 */}
</div>
```

CSS：

```css
.tab-content {
  animation: tabFadeIn 200ms ease-out;
}

@keyframes tabFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

- [ ] **Step 1:** 用 `useRef` 数组保存每个 tab 的 DOM 引用
- [ ] **Step 2:** 添加星点指示器 div，用 `offsetLeft/offsetWidth` 计算位置
- [ ] **Step 3:** 为内容区域添加 `tabFadeIn` animation（200ms）
- [ ] **Step 4:** 验证 Tab 切换时星点跟随滑动，内容 cross-fade

### Task 11: D2 · GroupRecCard Hover「星尘浮游」

**Files:**
- Modify: `src/components/GroupRecCard.tsx`

Hover 时卡片边缘浮现 3 颗微弱星点（纯 CSS，无需 JS）。

```tsx
// 在 GroupRecCard 根 div 上保留现有 hover 样式，新增伪元素：
<div className="group relative ...">
  {/* 星点 - hover 时显示 */}
  <div className="absolute -top-1 -right-1 w-1 h-1 rounded-full bg-ember/0 group-hover:bg-ember/60 transition-opacity duration-300 opacity-0 group-hover:opacity-100" />
  <div className="absolute -bottom-1 -left-1 w-1 h-1 rounded-full bg-parchment/0 group-hover:bg-parchment/50 transition-opacity duration-300 opacity-0 group-hover:opacity-100" style={{ transitionDelay: '50ms' }} />
  <div className="absolute top-1/2 -right-1 w-1 h-1 rounded-full bg-ember/0 group-hover:bg-ember/40 transition-opacity duration-300 opacity-0 group-hover:opacity-100" style={{ transitionDelay: '100ms' }} />

  {/* 原有卡片内容 */}
</div>
```

- [ ] **Step 1:** 在 `GroupRecCard.tsx` 根元素上添加 `group` className
- [ ] **Step 2:** 添加 3 个绝对定位星点 div，用 `group-hover` 控制显示
- [ ] **Step 3:** 验证 hover 卡片时 3 颗星点依次浮现（opacity 0→0.6，300ms）

### Task 12: B6 · Toast 通知退场动画

**Files:**
- Modify: `src/components/Toast.tsx`
- Modify: `src/styles/globals.css`

新增 fadeOutUp 退场动画 + 顶部星点闪烁（仅错误态）。

```tsx
import { useState, useEffect } from 'react';
import { StarParticle } from './StarParticle';

// 在 Toast 组件中：
const [isExiting, setIsExiting] = useState(false);
const [showSparkle, setShowSparkle] = useState(false);

useEffect(() => {
  // 入场时触发星点（仅错误态）
  if (toast.type === 'error') {
    setShowSparkle(true);
    setTimeout(() => setShowSparkle(false), 350);
  }

  // 退场定时器
  const exitTimer = setTimeout(() => setIsExiting(true), 1800); // 提前 200ms 开始退场
  const removeTimer = setTimeout(() => onRemove(), 2000);

  return () => {
    clearTimeout(exitTimer);
    clearTimeout(removeTimer);
  };
}, [toast, onRemove]);

// 渲染：
<div className={`relative toast-item ${isExiting ? 'toast-exit' : 'toast-enter'}`}>
  {showSparkle && (
    <div className="absolute -top-2 left-1/2 -translate-x-1/2">
      <StarParticle count={2} origin="center" direction="up" color="ember" duration={300} />
    </div>
  )}
  {/* 原有内容 */}
</div>
```

CSS：

```css
.toast-exit {
  animation: toastExit 200ms ease-in forwards;
}

@keyframes toastExit {
  from {
    opacity: 1;
    transform: translateY(0);
  }
  to {
    opacity: 0;
    transform: translateY(-8px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .toast-exit {
    animation: none;
    opacity: 0;
  }
}
```

- [ ] **Step 1:** 在 `Toast.tsx` 中添加 `isExiting` state
- [ ] **Step 2:** 提前 200ms 触发退场动画，总停留时间保持 2s
- [ ] **Step 3:** 错误态 Toast 入场时顶部显示 2 颗星点
- [ ] **Step 4:** 验证 Toast 有 fadeInDown 入场 + fadeOutUp 退场

### Task 13: C2 · 灵感加载「星云旋转」

**Files:**
- Modify: `src/components/（灵感加载组件）`

复用 `StarOrbit`，4 颗星点 + SVG 虚线连线，文案「正在浮现…」。

```tsx
import { StarOrbit } from './StarOrbit';

// 替换现有 spinner：
<div className="flex flex-col items-center gap-3 py-8">
  <StarOrbit starCount={4} radius={14} period={3000} showLines={true} />
  <span className="text-sm text-parchment/40 italic tracking-wide">正在浮现…</span>
</div>
```

- [ ] **Step 1:** 找到灵感加载组件（搜索 "正在生成" 或灵感相关代码）
- [ ] **Step 2:** 替换 spinner 为 `StarOrbit`（4 星点 + 连线）
- [ ] **Step 3:** 验证灵感加载时有星座旋转效果

---

## Phase 4：边缘场景（中低频）

### Task 14: E1 · 空状态「星图未启」

**Files:**
- Modify: `src/components/StudyLibrary.tsx`（空状态部分）

中央展示微型星图 + 文案 + 按钮 hover 交互。

```tsx
// 在 StudyLibrary 空状态条件渲染中：
<div className="flex flex-col items-center justify-center py-16 text-center">
  {/* 微型星图 */}
  <div className="relative w-24 h-24 mb-6 group">
    {/* 星点 */}
    <div className="absolute top-4 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-ember/20 group-hover:bg-ember/40 transition-opacity duration-500" />
    <div className="absolute bottom-6 left-4 w-1 h-1 rounded-full bg-parchment/15 group-hover:bg-parchment/30 transition-opacity duration-500" />
    <div className="absolute bottom-5 right-5 w-1 h-1 rounded-full bg-ember/15 group-hover:bg-ember/30 transition-opacity duration-500" />
    <div className="absolute top-1/2 left-6 w-1 h-1 rounded-full bg-parchment/10 group-hover:bg-parchment/25 transition-opacity duration-500" />
    <div className="absolute top-1/3 right-4 w-1 h-1 rounded-full bg-ember/10 group-hover:bg-ember/25 transition-opacity duration-500" />

    {/* 微弱连线 */}
    <svg className="absolute inset-0" width="96" height="96">
      <path d="M 48 20 Q 60 48 80 60" stroke="rgba(232,213,183,0.06)" strokeWidth="0.5" fill="none" />
      <path d="M 48 20 Q 30 48 16 72" stroke="rgba(232,213,183,0.04)" strokeWidth="0.5" fill="none" />
    </svg>
  </div>

  <p className="text-lg text-parchment/50 italic mb-2">你的星空还在等待</p>
  <p className="text-sm text-parchment/30 mb-6">开始第一次学习，点亮第一颗星</p>

  <button
    onClick={handleFirstStudy}
    className="px-6 py-2 rounded-lg bg-ember/10 border border-ember/20 text-ember hover:bg-ember/20 transition-colors"
  >
    开始第一次学习
  </button>
</div>
```

- [ ] **Step 1:** 在 `StudyLibrary.tsx` 中找到空状态渲染逻辑
- [ ] **Step 2:** 替换为星图 SVG + 文案
- [ ] **Step 3:** 添加 hover 时星点变亮效果
- [ ] **Step 4:** 验证空状态显示星图，hover 星点亮度变化

### Task 15: C3 · Session 文件加载「星尘解码」

**Files:**
- Modify: `src/components/SessionViewer.tsx`（加载状态部分）

复用 `StarOrbit` 组件，文案「正在读取记忆…」。

```tsx
import { StarOrbit } from './StarOrbit';

// 在 SessionViewer 加载状态：
{isLoading && (
  <div className="flex flex-col items-center justify-center h-48 gap-4">
    <StarOrbit starCount={4} radius={14} period={3000} showLines={true} />
    <span className="text-sm text-parchment/40 italic tracking-wide">正在读取记忆…</span>
  </div>
)}
```

- [ ] **Step 1:** 在 `SessionViewer.tsx` 中找到加载状态
- [ ] **Step 2:** 替换为 `StarOrbit` + 「正在读取记忆…」文案
- [ ] **Step 3:** 验证打开历史笔记时有星座旋转加载效果

### Task 16: D4 · SessionViewer 打开/关闭「星尘展开」

**Files:**
- Modify: `src/components/SessionViewer.tsx`

复用 A4 模态框的 scale + opacity + 星点动画。

```tsx
import { useState, useEffect } from 'react';
import { StarParticle } from './StarParticle';

// 在 SessionViewer 中：
const [showSparkle, setShowSparkle] = useState(false);

useEffect(() => {
  if (isOpen) {
    setShowSparkle(true);
    setTimeout(() => setShowSparkle(false), 300);
  }
}, [isOpen]);

// 根元素上：
<div className={`session-viewer ${isOpen ? 'viewer-open' : 'viewer-close'}`}>
  {showSparkle && (
    <StarParticle count={2} origin="edge" direction="scatter" color="ember" duration={200} />
  )}
  {/* 原有内容 */}
</div>
```

CSS（复用 modal 样式，或新增 viewer 前缀）：

```css
.viewer-open {
  animation: modalOpen 400ms ease-out forwards;
}

.viewer-close {
  animation: modalClose 300ms ease-in forwards;
}
```

- [ ] **Step 1:** 在 `SessionViewer.tsx` 中添加入场/退场 state
- [ ] **Step 2:** 复用 Part 1 的 `modalOpen`/`modalClose` keyframes
- [ ] **Step 3:** 验证 SessionViewer 打开/关闭有 scale + 星点效果

### Task 17: F1 · 学习报告展示「卷轴展开」

**Files:**
- Modify: `src/components/ArchiveLoadingOverlay.tsx`（报告展示部分）

报告以卷轴形式展开：高度从 40px → 自动，内容 stagger 淡入。

```tsx
const [reportStage, setReportStage] = useState<'hidden' | 'title' | 'full'>('hidden');

useEffect(() => {
  if (archiveComplete) {
    setReportStage('title');
    setTimeout(() => setReportStage('full'), 100);
  }
}, [archiveComplete]);

// 报告容器：
<div className={`report-scroll ${reportStage}`}>
  <div className="report-title">{sessionTitle}</div>
  <div className="report-content">
    {/* 报告正文、关键概念等 */}
    <div className="report-section">{summary}</div>
    <div className="report-section">{keyConcepts}</div>
  </div>
  <button onClick={closeReport}>本次学习结束</button>
</div>
```

CSS：

```css
.report-scroll {
  transition: max-height 800ms ease-out;
  overflow: hidden;
}

.report-scroll.hidden {
  max-height: 0;
  opacity: 0;
}

.report-scroll.title {
  max-height: 40px;
  opacity: 1;
}

.report-scroll.full {
  max-height: 600px;
  opacity: 1;
}

.report-section {
  opacity: 0;
  animation: sectionFadeIn 400ms ease-out forwards;
}

.report-scroll.full .report-section:nth-child(1) { animation-delay: 200ms; }
.report-scroll.full .report-section:nth-child(2) { animation-delay: 350ms; }

@keyframes sectionFadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
```

- [ ] **Step 1:** 在报告展示逻辑中添加 `reportStage` state（3 阶段）
- [ ] **Step 2:** 添加 `max-height` transition（800ms）和 stagger fadeIn
- [ ] **Step 3:** 验证归档完成后报告从窄条展开为完整内容

### Task 18: F2 · 复习模式确认「星火重燃」

**Files:**
- Modify: `src/components/StudyLibrary.tsx`（复习按钮逻辑）
- Create: `src/components/ReviewFlash.tsx`

200ms 闪屏：全屏遮罩 + 中央星点从暗淡到 glow 亮起 + 文案。

```tsx
// src/components/ReviewFlash.tsx
import { useEffect, useState } from 'react';

interface ReviewFlashProps {
  title: string;
  date: string;
  onComplete: () => void;
}

export function ReviewFlash({ title, date, onComplete }: ReviewFlashProps) {
  const [phase, setPhase] = useState<'in' | 'hold' | 'out'>('in');

  useEffect(() => {
    const holdTimer = setTimeout(() => setPhase('out'), 400);
    const completeTimer = setTimeout(() => onComplete(), 600);
    return () => {
      clearTimeout(holdTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  return (
    <div className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-ink/60 review-flash-${phase}`}>
      <div className="relative w-10 h-10 mb-4">
        <div className="absolute inset-0 rounded-full bg-ember/0 review-glow" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-ember review-star" />
      </div>
      <p className="text-parchment text-lg italic tracking-wide mb-1">重温这颗星</p>
      <p className="text-parchment/40 text-sm">{title} · {date}</p>
    </div>
  );
}
```

CSS：

```css
.review-flash-in {
  animation: flashIn 200ms ease-out forwards;
}

.review-flash-out {
  animation: flashOut 200ms ease-in forwards;
}

@keyframes flashIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes flashOut {
  from { opacity: 1; }
  to { opacity: 0; }
}

.review-glow {
  animation: glowPulse 600ms ease-out forwards;
}

@keyframes glowPulse {
  0% { background: rgba(217,119,87,0); transform: scale(0.5); }
  50% { background: rgba(217,119,87,0.2); transform: scale(1.5); }
  100% { background: rgba(217,119,87,0); transform: scale(2); }
}

.review-star {
  animation: starIgnite 600ms ease-out forwards;
}

@keyframes starIgnite {
  0% { opacity: 0.3; box-shadow: 0 0 0 rgba(217,119,87,0); }
  50% { opacity: 1; box-shadow: 0 0 12px rgba(217,119,87,0.5); }
  100% { opacity: 0.8; box-shadow: 0 0 8px rgba(217,119,87,0.3); }
}
```

在 `StudyLibrary.tsx` 中：

```tsx
const [reviewFlash, setReviewFlash] = useState<null | { title: string; date: string }>(null);

const handleReview = (session: Session) => {
  setReviewFlash({ title: session.title, date: session.date });
};

const enterReview = () => {
  setReviewFlash(null);
  openPreStudy(/* review mode */);
};

// 渲染：
{reviewFlash && (
  <ReviewFlash
    title={reviewFlash.title}
    date={reviewFlash.date}
    onComplete={enterReview}
  />
)}
```

- [ ] **Step 1:** 创建 `ReviewFlash.tsx` 组件
- [ ] **Step 2:** 在 `StudyLibrary.tsx` 复习按钮逻辑中插入闪屏
- [ ] **Step 3:** 验证点击「复习」后显示 600ms 闪屏，星点 glow 亮起后进入学习

---

## 验证清单

### Phase 3
- [ ] D1 StudyLibrary：展开面板有 max-height 过渡 + 顶部星点
- [ ] D3 GroupRibbon：Tab 切换时星点跟随滑动
- [ ] D2 GroupRecCard：Hover 时 3 颗星点浮现
- [ ] B6 Toast：有 fadeOutUp 退场 + 错误态顶部星点
- [ ] C2 灵感加载：4 星点星座旋转 + 「正在浮现…」

### Phase 4
- [ ] E1 空状态：星图 SVG + hover 变亮
- [ ] C3 文件加载：星座旋转 + 「正在读取记忆…」
- [ ] D4 SessionViewer：scale + opacity + 星点展开
- [ ] F1 学习报告：卷轴式展开 + stagger 淡入
- [ ] F2 复习确认：闪屏 + 星点 glow + 「重温这颗星」

### 全局
- [ ] `npm run dev` 启动无报错
- [ ] 所有动画在 `prefers-reduced-motion` 下降级为 instant
- [ ] `npm run test` 现有测试全部通过（本计划不改动业务逻辑，不应破坏测试）
