# 星辰宇宙交互设计 · 实施计划（上）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 Phase 1（核心体验：C1/B4/B5/B2/B3）和 Phase 2（页面过渡：A2/A3/A4）的星辰宇宙交互动效

**Architecture:** 纯 CSS 动画为主（transform + opacity），辅以 React state 控制一次性粒子。统一抽取 `StarParticle` 和 `StarOrbit` 可复用组件。所有动画遵循 `prefers-reduced-motion` 降级。

**Tech Stack:** React 18 + Tailwind CSS + CSS keyframes

---

## 前置任务：创建可复用组件

### Task 0: StarParticle（星点粒子组件）

**Files:**
- Create: `src/components/StarParticle.tsx`
- Modify: `src/styles/globals.css`（新增 keyframes）

一次性星点粒子，触发后自动移除 DOM。

```tsx
// src/components/StarParticle.tsx
import { useEffect, useState } from 'react';

interface StarParticleProps {
  count: number;
  origin: 'center' | 'bottom' | 'edge';
  direction: 'up' | 'outward' | 'scatter';
  color: 'ember' | 'parchment' | 'mixed';
  duration: number;
}

export function StarParticle({ count, origin, direction, color, duration }: StarParticleProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), duration);
    return () => clearTimeout(timer);
  }, [duration]);

  if (!visible) return null;

  const stars = Array.from({ length: count }, (_, i) => {
    const isEmber = color === 'ember' || (color === 'mixed' && i % 2 === 0);
    const bgColor = isEmber ? 'bg-ember/60' : 'bg-parchment/50';
    const angle = direction === 'up'
      ? -30 + Math.random() * 60
      : direction === 'outward'
        ? (i / count) * 360
        : Math.random() * 360;
    const distance = direction === 'scatter' ? 20 + Math.random() * 30 : 24 + Math.random() * 16;

    return (
      <div
        key={i}
        className={`absolute w-1 h-1 rounded-full ${bgColor} star-particle`}
        style={{
          animation: `starFly ${duration}ms ease-out forwards`,
          ['--fly-angle' as string]: `${angle}deg`,
          ['--fly-distance' as string]: `${distance}px`,
          top: origin === 'bottom' ? '100%' : origin === 'edge' ? `${Math.random() * 100}%` : '50%',
          left: origin === 'center' ? '50%' : `${Math.random() * 100}%`,
        }}
      />
    );
  });

  return <>{stars}</>;
}
```

CSS keyframes 添加到 `src/styles/globals.css`：

```css
@keyframes starFly {
  0% {
    transform: translate(-50%, -50%) scale(1);
    opacity: 1;
  }
  100% {
    transform: translate(
      calc(-50% + cos(var(--fly-angle)) * var(--fly-distance)),
      calc(-50% + sin(var(--fly-angle)) * var(--fly-distance))
    ) scale(0);
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .star-particle {
    animation: none !important;
    opacity: 0;
  }
}
```

- [ ] **Step 1:** 创建 `StarParticle.tsx` 组件文件
- [ ] **Step 2:** 在 `globals.css` 中追加 `starFly` keyframes 和 reduced-motion 降级
- [ ] **Step 3:** 验证组件无类型错误（`npx tsc --noEmit` 快速检查）

### Task 0b: StarOrbit（星点旋转组件）

**Files:**
- Create: `src/components/StarOrbit.tsx`

持续旋转的星点组，用于 C1/C2/C3 加载状态。

```tsx
// src/components/StarOrbit.tsx
interface StarOrbitProps {
  starCount?: number;
  radius?: number;
  period?: number;
  showLines?: boolean;
}

export function StarOrbit({
  starCount = 3,
  radius = 12,
  period = 2000,
  showLines = false,
}: StarOrbitProps) {
  const stars = Array.from({ length: starCount }, (_, i) => {
    const angle = (i / starCount) * 360;
    const isEmber = i % 2 === 0;
    return (
      <div
        key={i}
        className={`absolute w-1.5 h-1.5 rounded-full ${isEmber ? 'bg-ember/70' : 'bg-parchment/50'}`}
        style={{
          animation: `orbit ${period}ms linear infinite`,
          ['--orbit-angle' as string]: `${angle}deg`,
          ['--orbit-radius' as string]: `${radius}px`,
        }}
      />
    );
  });

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: radius * 2, height: radius * 2 }}>
      {showLines && (
        <svg className="absolute inset-0" width={radius * 2} height={radius * 2}>
          {/* 星座连线 - 简化为虚线圆环 */}
          <circle
            cx={radius}
            cy={radius}
            r={radius * 0.7}
            stroke="rgba(217,119,87,0.1)"
            strokeWidth="0.5"
            fill="none"
            strokeDasharray="4,4"
          />
        </svg>
      )}
      {stars}
    </div>
  );
}
```

CSS keyframes 追加到 `globals.css`：

```css
@keyframes orbit {
  from {
    transform: rotate(var(--orbit-angle)) translateX(var(--orbit-radius)) rotate(calc(-1 * var(--orbit-angle)));
  }
  to {
    transform: rotate(calc(var(--orbit-angle) + 360deg)) translateX(var(--orbit-radius)) rotate(calc(-1 * var(--orbit-angle) - 360deg));
  }
}
```

- [ ] **Step 1:** 创建 `StarOrbit.tsx` 组件文件
- [ ] **Step 2:** 在 `globals.css` 中追加 `orbit` keyframes
- [ ] **Step 3:** 验证组件无类型错误

---

## Phase 1：核心体验（极高频 + 高频）

### Task 1: C1 · 思考指示器「星点旋绕」

**Files:**
- Modify: `src/pages/Study.tsx`（替换现有思考指示器）

当前 Study.tsx 中思考指示器是简单的脉冲点 + 文字。替换为 StarOrbit 组件。

查找 Study.tsx 中现有思考指示器代码（通常在消息列表底部、输入框上方），替换为：

```tsx
import { StarOrbit } from '@/components/StarOrbit';

// 在思考指示器位置：
<div className="flex items-center gap-3 py-4 px-6">
  <StarOrbit starCount={3} radius={10} period={2000} />
  <span className="text-sm text-parchment/40 italic tracking-wide">正在思考...</span>
</div>
```

- [ ] **Step 1:** 在 `Study.tsx` 中导入 `StarOrbit`
- [ ] **Step 2:** 找到现有思考指示器（搜索 "正在思考" 或 thinking indicator）
- [ ] **Step 3:** 替换为 StarOrbit + 文案的组合
- [ ] **Step 4:** 启动 dev 模式，发送消息验证星点旋转效果

### Task 2: B4 · ChatBubble 消息入场「星尘凝聚」

**Files:**
- Modify: `src/components/ChatBubble.tsx`
- Modify: `src/styles/globals.css`

消息气泡出现时添加一次性星点闪烁 + opacity/translateY 过渡。

在 `ChatBubble.tsx` 的顶层 div 上增加入场动画：

```tsx
import { useState, useEffect } from 'react';
import { StarParticle } from './StarParticle';

// 在 ChatBubble 组件内：
const [showSparkle, setShowSparkle] = useState(true);

useEffect(() => {
  const timer = setTimeout(() => setShowSparkle(false), 300);
  return () => clearTimeout(timer);
}, []);

// 渲染时：
<div className={`relative chat-bubble-enter ${isAi ? 'ai-bubble' : 'user-bubble'}`}>
  {showSparkle && (
    <StarParticle
      count={2}
      origin="edge"
      direction="scatter"
      color={isAi ? 'ember' : 'parchment'}
      duration={200}
    />
  )}
  {/* 原有内容 */}
</div>
```

CSS 追加：

```css
.chat-bubble-enter {
  animation: bubbleEnter 250ms ease-out;
}

@keyframes bubbleEnter {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .chat-bubble-enter {
    animation: none;
    opacity: 1;
    transform: none;
  }
}
```

- [ ] **Step 1:** 在 `ChatBubble.tsx` 中添加 `showSparkle` state 和一次性星点
- [ ] **Step 2:** 添加入场 CSS animation
- [ ] **Step 3:** 验证消息发送后气泡有淡入 + 星点闪烁效果

### Task 3: B5 · ChatInput 发送反馈「星点飞升」

**Files:**
- Modify: `src/components/ChatInput.tsx`

发送瞬间从输入框中心向上飞散 3-4 颗星点。

```tsx
import { useState, useCallback } from 'react';
import { StarParticle } from './StarParticle';

// 在 ChatInput 组件内：
const [sendSparkle, setSendSparkle] = useState(false);

const handleSubmit = useCallback((e: React.FormEvent) => {
  e.preventDefault();
  if (!value.trim()) return;

  setSendSparkle(true);
  setTimeout(() => setSendSparkle(false), 250);

  onSubmit(value);
  setValue('');
}, [value, onSubmit]);

// 在 form 元素上：
<form onSubmit={handleSubmit} className="relative">
  {sendSparkle && (
    <StarParticle
      count={4}
      origin="center"
      direction="up"
      color="mixed"
      duration={200}
    />
  )}
  {/* 原有 input */}
</form>
```

- [ ] **Step 1:** 在 `ChatInput.tsx` 中添加 `sendSparkle` state
- [ ] **Step 2:** 在 `handleSubmit` 中触发星点
- [ ] **Step 3:** 验证发送消息时输入框有星点飞升效果

### Task 4: B2 · Button 按压反馈「星点迸射」

**Files:**
- Modify: `src/components/Button.tsx`

mousedown 时按钮边缘迸发 3 颗星点，仅 primary 变体触发。

```tsx
import { useState } from 'react';
import { StarParticle } from './StarParticle';

// 在 Button 组件 props 中已有 variant，修改渲染逻辑：
const [pressSparkle, setPressSparkle] = useState(false);

// 渲染：
<button
  className={/* 原有 className */}
  onMouseDown={() => {
    if (variant === 'primary') {
      setPressSparkle(true);
      setTimeout(() => setPressSparkle(false), 250);
    }
    props.onMouseDown?.(e);
  }}
  {...props}
>
  {pressSparkle && (
    <StarParticle
      count={3}
      origin="edge"
      direction="outward"
      color="ember"
      duration={200}
    />
  )}
  {children}
</button>
```

- [ ] **Step 1:** 在 `Button.tsx` 中添加 `pressSparkle` state（仅 primary）
- [ ] **Step 2:** 在 `onMouseDown` 中触发星点迸射
- [ ] **Step 3:** 验证 primary 按钮按压时有星点效果，ghost 按钮无效果

### Task 5: B3 · Input 聚焦效果「星点汇聚」

**Files:**
- Modify: `src/components/Input.tsx`

首次聚焦时 2-3 颗星点从四周飘向光标位置。保留现有 scale 和 border 变化。

```tsx
import { useState, useRef } from 'react';
import { StarParticle } from './StarParticle';

// 在 Input 组件内：
const [focusSparkle, setFocusSparkle] = useState(false);
const hasFocused = useRef(false);

const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
  if (!hasFocused.current) {
    hasFocused.current = true;
    setFocusSparkle(true);
    setTimeout(() => setFocusSparkle(false), 350);
  }
  props.onFocus?.(e);
};

// 渲染：
<div className="relative">
  {focusSparkle && (
    <StarParticle
      count={3}
      origin="edge"
      direction="scatter"
      color="mixed"
      duration={300}
    />
  )}
  <input
    className={/* 保留现有 className 含 focus:scale-y-[1.05] focus:border-ember */}
    onFocus={handleFocus}
    {...props}
  />
</div>
```

- [ ] **Step 1:** 在 `Input.tsx` 中导入 `StarParticle` 和 `useRef`
- [ ] **Step 2:** 添加 `hasFocused` ref 和 `focusSparkle` state
- [ ] **Step 3:** 在 `onFocus` 中仅首次触发星点汇聚
- [ ] **Step 4:** 验证 input 首次聚焦时有星点飘向光标

---

## Phase 2：页面过渡

### Task 6: A2 · Home→Study「静水深流」

**Files:**
- Modify: `src/pages/Home.tsx`
- Modify: `src/pages/Study.tsx`
- Modify: `src/styles/globals.css`

从点击位置泛起涟漪，Home opacity 渐降至 0.3，Study 从下方滑入。

在 `Home.tsx` 中：

```tsx
const [ripple, setRipple] = useState<{ x: number; y: number } | null>(null);
const [isTransitioning, setIsTransitioning] = useState(false);

const handleStartStudy = (e: React.MouseEvent, topic: string) => {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  setRipple({
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  });
  setIsTransitioning(true);

  setTimeout(() => {
    startSession(topic);
  }, 300);
};

// 在 Home 根元素上：
<div className={`relative transition-opacity duration-300 ${isTransitioning ? 'opacity-30' : 'opacity-100'}`}>
  {ripple && (
    <div
      className="absolute pointer-events-none ripple-effect"
      style={{
        left: ripple.x,
        top: ripple.y,
        width: 4,
        height: 4,
        borderRadius: '50%',
        background: 'rgba(217,119,87,0.4)',
      }}
    />
  )}
  {/* 原有内容 */}
</div>
```

CSS：

```css
.ripple-effect {
  animation: ripple 300ms ease-out forwards;
}

@keyframes ripple {
  0% {
    transform: translate(-50%, -50%) scale(1);
    opacity: 0.6;
    box-shadow: 0 0 0 0 rgba(217,119,87,0.3);
  }
  100% {
    transform: translate(-50%, -50%) scale(50);
    opacity: 0;
    box-shadow: 0 0 0 2px rgba(217,119,87,0);
  }
}
```

在 `Study.tsx` 中添加入场动画：

```tsx
<div className="study-enter">
  {/* 原有内容 */}
</div>
```

```css
.study-enter {
  animation: studyEnter 600ms ease-out;
}

@keyframes studyEnter {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

- [ ] **Step 1:** 在 `Home.tsx` 中实现涟漪触发逻辑
- [ ] **Step 2:** 添加 ripple CSS animation
- [ ] **Step 3:** 在 `Study.tsx` 添加入场动画 class
- [ ] **Step 4:** 验证从 Home 点击「开始学习」后涟漪扩散 + Study 滑入

### Task 7: A3 · Study→Home「星点归巢」

**Files:**
- Modify: `src/pages/Study.tsx`
- Modify: `src/styles/globals.css`

Study 页面卸载前，星点向上飘散，Home 从下方淡入。

```tsx
const [isExiting, setIsExiting] = useState(false);

const handleExit = () => {
  setIsExiting(true);
  setTimeout(() => {
    endSession();
  }, 700);
};

// 根元素上：
<div className={`relative ${isExiting ? 'study-exit' : ''}`}>
  {isExiting && (
    <div className="absolute inset-0 pointer-events-none z-50">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="absolute w-1.5 h-1.5 rounded-full bg-ember/60 star-fly-away"
          style={{
            left: `${20 + i * 15}%`,
            bottom: '20%',
            animationDelay: `${i * 50}ms`,
          }}
        />
      ))}
    </div>
  )}
  {/* 原有内容 */}
</div>
```

CSS：

```css
.star-fly-away {
  animation: starFlyAway 700ms ease-out forwards;
}

@keyframes starFlyAway {
  0% {
    transform: translateY(0) scale(1);
    opacity: 0.8;
  }
  100% {
    transform: translateY(-300px) scale(0);
    opacity: 0;
  }
}

.study-exit {
  animation: studyExit 700ms ease-out forwards;
}

@keyframes studyExit {
  from { opacity: 1; }
  to { opacity: 0; }
}
```

- [ ] **Step 1:** 在 `Study.tsx` 中添加 `isExiting` state
- [ ] **Step 2:** ESC 或完成学习时触发退出动画
- [ ] **Step 3:** 添加 `starFlyAway` 和 `studyExit` CSS keyframes
- [ ] **Step 4:** 验证退出 Study 时星点向上飘散

### Task 8: A4 · 模态框打开/关闭「星点聚合」

**Files:**
- Modify: `src/components/Modal.tsx`（或现有模态框组件）

模态框 scale + opacity + 边缘星点闪烁。

```tsx
import { useState, useEffect } from 'react';
import { StarParticle } from './StarParticle';

// 在 Modal 组件内：
const [showSparkle, setShowSparkle] = useState(false);

useEffect(() => {
  if (isOpen) {
    setShowSparkle(true);
    setTimeout(() => setShowSparkle(false), 300);
  }
}, [isOpen]);

// 渲染遮罩和内容：
{isOpen && (
  <div className="modal-overlay">
    <div className={`modal-content ${isOpen ? 'modal-open' : 'modal-close'}`}>
      {showSparkle && (
        <StarParticle
          count={2}
          origin="edge"
          direction="scatter"
          color="ember"
          duration={200}
        />
      )}
      {children}
    </div>
  </div>
)}
```

CSS：

```css
.modal-overlay {
  animation: modalOverlayIn 200ms ease-out forwards;
}

@keyframes modalOverlayIn {
  from { opacity: 0; }
  to { opacity: 0.75; }
}

.modal-open {
  animation: modalOpen 300ms ease-out forwards;
}

@keyframes modalOpen {
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.modal-close {
  animation: modalClose 200ms ease-in forwards;
}

@keyframes modalClose {
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(0.95);
  }
}
```

- [ ] **Step 1:** 在现有模态框组件中添加入场/退场 animation
- [ ] **Step 2:** 在打开时触发一次性星点
- [ ] **Step 3:** 验证模态框开关有 scale + opacity + 星点效果

---

## 验证清单

- [ ] `npm run dev` 启动无报错
- [ ] C1 思考指示器：发送消息后可见 3 星点旋转
- [ ] B4 消息入场：新消息有淡入 + 星点闪烁
- [ ] B5 发送反馈：按 Enter 后输入框有星点飞升
- [ ] B2 按钮按压：primary 按钮 mousedown 有星点迸射
- [ ] B3 Input 聚焦：首次聚焦有星点汇聚（保留 scale/border）
- [ ] A2 Home→Study：涟漪扩散 + Study 滑入
- [ ] A3 Study→Home：星点向上飘散
- [ ] A4 模态框：scale + opacity + 星点闪烁
- [ ] 所有动画在 `prefers-reduced-motion` 下正常降级
